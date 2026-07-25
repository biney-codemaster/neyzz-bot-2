const config = require('../config');
const paymentAddresses = require('./paymentAddresses');
const orders = require('./orders');
const { deliverToUser } = require('./delivery');
const { logShop } = require('./channels');
const { emoji } = require('../emoji');
const { container, text, V2 } = require('../ui/v2');
const { buildOrderChannelPanel } = require('../ui/order');

function enoughAmount(expected, received, tolerance = config.crypto.amountTolerance) {
  const exp = Number(expected);
  const rec = Number(received);
  if (!Number.isFinite(exp) || !Number.isFinite(rec)) return false;
  return rec + 1e-12 >= exp * (1 - tolerance);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'neyzz-shop-bot' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/**
 * API litecoinspace.org (LTC)
 */
async function checkMempoolStyle(baseUrl, address, { afterTs = null } = {}) {
  const data = await fetchJson(`${baseUrl}/address/${address}`);
  const funded =
    (data.chain_stats?.funded_txo_sum || 0) + (data.mempool_stats?.funded_txo_sum || 0);
  const received = funded / 1e8;
  const txCount =
    (data.chain_stats?.tx_count || 0) + (data.mempool_stats?.tx_count || 0);

  let txid = null;
  let confirmations = 0;
  let pending = false;
  let txTime = null;

  if (txCount > 0) {
    const txs = await fetchJson(`${baseUrl}/address/${address}/txs`);
    // Ne garde que les TX postérieures à l'assignation de l'adresse (anti faux positif)
    const minTs = afterTs ? Math.floor(afterTs / 1000) - 60 : null;
    const fresh = (txs || []).filter((t) => {
      if (minTs == null) return true;
      const tTime = t.status?.block_time || t.status?.block_time === 0
        ? t.status.block_time
        : null;
      // mempool (non confirmée) = considérée fraîche
      if (!t.status?.confirmed) return true;
      if (tTime == null) return true;
      return tTime >= minTs;
    });

    const first = fresh[0];
    if (!first) {
      // Historique ancien seulement → pas un paiement pour CETTE commande
      return { received: 0, txid: null, confirmations: 0, pending: false, staleHistory: true };
    }

    txid = first.txid;
    txTime = first.status?.block_time || null;
    if (first.status?.confirmed && first.status.block_height) {
      try {
        const tip = await fetchJson(`${baseUrl}/blocks/tip/height`);
        confirmations = Math.max(1, Number(tip) - Number(first.status.block_height) + 1);
      } catch {
        confirmations = 1;
      }
    } else {
      confirmations = 0;
      pending = true;
    }
  }

  return { received, txid, confirmations, pending, txTime };
}

async function checkLtc(address, opts) {
  return checkMempoolStyle('https://litecoinspace.org/api', address, opts);
}

function assignedAtMs(row) {
  if (!row.assigned_at) return null;
  const s = String(row.assigned_at);
  const d = new Date(s.includes('T') || s.endsWith('Z') ? s : `${s.replace(' ', 'T')}Z`);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

async function checkAddress(row) {
  if (row.coin !== 'ltc') {
    return { received: 0, txid: null, confirmations: 0, pending: false };
  }
  return checkLtc(row.address, { afterTs: assignedAtMs(row) });
}

function explorerTxUrl(coin, txid) {
  if (!txid) return null;
  return `https://litecoinspace.org/tx/${txid}`;
}

async function sendOrderContainers(client, order, components) {
  if (!order.channel_id) return;
  try {
    const ch = await client.channels.fetch(order.channel_id);
    if (!ch?.isTextBased()) return;
    await ch.send({ components, flags: V2 });
  } catch (e) {
    console.warn(`[crypto-watch] send channel fail ${order.public_id}:`, e.message);
  }
}

function buildDetectedContainer(order, row, result, neededConf) {
  const url = explorerTxUrl(row.coin, result.txid);
  return container(config.warnColor)
    .addTextDisplayComponents(
      text(`# ${emoji('pending')} Payment detected`),
      text(
        [
          `Order **${order.public_id}**`,
          `${emoji('crypto')} **${row.coin.toUpperCase()}**`,
          `Amount received: \`${result.received}\` / expected \`${row.expected_amount}\``,
          `TXID : \`${result.txid || '—'}\``,
          url ? `${emoji('link')} ${url}` : null,
          `Confirmations : **${result.confirmations}/${neededConf}**`,
          result.pending
            ? `${emoji('clock')} In mempool — waiting for network confirmation…`
            : `${emoji('clock')} Confirming…`,
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    );
}

function buildConfirmedContainer(order, row, result) {
  const url = explorerTxUrl(row.coin, result.txid);
  return container(config.successColor)
    .addTextDisplayComponents(
      text(`# ${emoji('check')} Payment confirmed`),
      text(
        [
          `Order **${order.public_id}**`,
          `${emoji('crypto')} **${row.coin.toUpperCase()}** — \`${result.received}\` received`,
          `TXID : \`${result.txid || '—'}\``,
          url ? `${emoji('link')} ${url}` : null,
          `Confirmations : **${result.confirmations}**`,
          '',
          `${emoji('delivery')} Delivering product by **DM**…`,
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    );
}

async function processPaymentRow(client, row) {
  const order = orders.getOrder(row.order_id);
  if (!order || ['cancelled', 'delivered', 'closed'].includes(order.status)) return;
  if (order.closed_at) return;
  if (row.status === 'confirmed' || row.status === 'expired') return;

  let result;
  try {
    result = await checkAddress(row);
  } catch (e) {
    console.warn(`[crypto-watch] ${row.coin} ${row.address}: ${e.message}`);
    return;
  }

  if (!result.received || result.received <= 0) return;

  const neededConf = config.crypto.confirmations[row.coin] ?? 1;
  const okAmount = enoughAmount(row.expected_amount, result.received);
  const wasAssigned = row.status === 'assigned';
  const alreadySeen = row.status === 'seen' || row.status === 'pending';

  if (!okAmount) {
    if (wasAssigned) {
      paymentAddresses.markSeen(row.id, {
        receivedAmount: result.received,
        txid: result.txid,
        confirmations: result.confirmations,
      });
      await sendOrderContainers(client, order, [
        container(config.dangerColor).addTextDisplayComponents(
          text(`# ${emoji('warn')} Insufficient payment`),
          text(
            [
              `Order **${order.public_id}**`,
              `Received: \`${result.received}\` ${row.coin.toUpperCase()}`,
              `Expected: \`${row.expected_amount}\` ${row.coin.toUpperCase()}`,
              `TXID : \`${result.txid || '—'}\``,
            ].join('\n'),
          ),
        ),
      ]);
      await logShop(
        client,
        `${emoji('warn')} Insufficient payment **${order.public_id}**: ${result.received}/${row.expected_amount} ${row.coin.toUpperCase()}`,
      );
    }
    return;
  }

  const isConfirmed = result.confirmations >= neededConf;

  // 1) Première détection → container "Paiement détecté"
  if (wasAssigned) {
    paymentAddresses.markSeen(row.id, {
      receivedAmount: result.received,
      txid: result.txid,
      confirmations: result.confirmations,
    });
    await sendOrderContainers(client, order, [
      buildDetectedContainer(order, row, result, neededConf),
    ]);
    await logShop(
      client,
      `${emoji('pending')} Payment detected **${order.public_id}** ${row.coin.toUpperCase()} tx=\`${result.txid || '?'}\` (${result.confirmations}/${neededConf})`,
    );
  } else if (alreadySeen && !isConfirmed) {
    // Update silent des confirmations
    paymentAddresses.markSeen(row.id, {
      receivedAmount: result.received,
      txid: result.txid,
      confirmations: result.confirmations,
    });
    return;
  }

  if (!isConfirmed) return;

  // 2) Confirmé → container + mark paid + livraison MP
  // Re-fetch row status (peut être passé à seen juste au-dessus)
  const freshRow = paymentAddresses.getAddressByOrder(order.id) || row;
  if (freshRow.status === 'confirmed') return;

  paymentAddresses.markConfirmed(freshRow.id, {
    receivedAmount: result.received,
    txid: result.txid,
    confirmations: result.confirmations,
  });

  let freshOrder = orders.getOrder(order.id);
  if (['pending', 'awaiting_payment'].includes(freshOrder.status)) {
    orders.markPaid(freshOrder.id, result.txid || `crypto:${row.coin}`);
    freshOrder = orders.getOrder(order.id);
  }

  await sendOrderContainers(client, freshOrder, [
    buildConfirmedContainer(freshOrder, row, result),
  ]);

  await logShop(
    client,
    `${emoji('check')} Payment confirmed **${freshOrder.public_id}** ${row.coin.toUpperCase()} \`${result.txid || ''}\``,
  );

  if (['paid', 'partial'].includes(freshOrder.status)) {
    try {
      await deliverToUser(client, freshOrder.id);
      const after = orders.getOrder(freshOrder.id);
      await sendOrderContainers(client, after, [
        container(config.successColor).addTextDisplayComponents(
          text(
            `# ${emoji('delivery')} Product delivered\nDelivery sent by **DM** to <@${after.user_id}>.\nYou can **Close** the channel for the transcript.`,
          ),
        ),
        ...buildOrderChannelPanel(after, null).components,
      ]);
      await logShop(
        client,
        `${emoji('success')} **${after.public_id}** delivered by DM (${row.coin.toUpperCase()} ${result.received})`,
      );
    } catch (e) {
      await sendOrderContainers(client, freshOrder, [
        container(config.dangerColor).addTextDisplayComponents(
          text(
            `# ${emoji('warn')} Delivery failed\n\`${e.message}\`\nAn admin can use **Deliver (DM)**.`,
          ),
        ),
        ...buildOrderChannelPanel(orders.getOrder(freshOrder.id), null).components,
      ]);
      await logShop(
        client,
        `${emoji('warn')} **${freshOrder.public_id}** paid but DM delivery failed: ${e.message}`,
      );
    }
  }
}

let timer = null;
let running = false;

function startCryptoWatcher(client) {
  if (timer) return;
  paymentAddresses.ensureSchema();

  const interval = Math.max(10000, config.crypto.watchIntervalMs || 15000);

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const rows = paymentAddresses.listWatchable();
      if (rows.length) {
        console.log(`[crypto-watch] scan ${rows.length} adresse(s)…`);
      }
      for (const row of rows) {
        await processPaymentRow(client, row);
      }
    } catch (e) {
      console.error('[crypto-watch] loop error', e);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, interval);
  setTimeout(tick, 3000);
  console.log(`${emoji('crypto')} Crypto watcher started (every ${interval}ms)`);
}

function stopCryptoWatcher() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  startCryptoWatcher,
  stopCryptoWatcher,
  processPaymentRow,
  checkAddress,
};
