const { ethers } = require('ethers');
const config = require('../config');
const paymentAddresses = require('./paymentAddresses');
const orders = require('./orders');
const { deliverToUser } = require('./delivery');
const { logShop } = require('./channels');
const { emoji } = require('../emoji');

const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

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

/** BTC via mempool.space */
async function checkBtc(address) {
  const data = await fetchJson(`https://mempool.space/api/address/${address}`);
  const funded = (data.chain_stats?.funded_txo_sum || 0) + (data.mempool_stats?.funded_txo_sum || 0);
  const btc = funded / 1e8;
  const txCount =
    (data.chain_stats?.tx_count || 0) + (data.mempool_stats?.tx_count || 0);

  let txid = null;
  let confirmations = 0;
  if (txCount > 0) {
    const txs = await fetchJson(`https://mempool.space/api/address/${address}/txs`);
    const first = txs?.[0];
    if (first) {
      txid = first.txid;
      if (first.status?.confirmed) {
        // approx: use tip height diff if available
        confirmations = first.status.block_height
          ? Math.max(1, (data.chain_stats?.funded_txo_count ? 1 : 1))
          : 1;
        try {
          const tip = await fetchJson('https://mempool.space/api/blocks/tip/height');
          if (first.status.block_height) {
            confirmations = Math.max(1, Number(tip) - Number(first.status.block_height) + 1);
          }
        } catch {
          confirmations = 1;
        }
      } else {
        confirmations = 0;
      }
    }
  }

  return { received: btc, txid, confirmations, pending: Boolean(txid) && confirmations === 0 };
}

/** LTC via blockchair */
async function checkLtc(address) {
  const data = await fetchJson(`https://api.blockchair.com/litecoin/dashboards/address/${address}`);
  const addr = data?.data?.[address]?.address;
  if (!addr) return { received: 0, txid: null, confirmations: 0, pending: false };
  const received = (addr.received || 0) / 1e8;
  const utxos = data?.data?.[address]?.utxo || [];
  const txid = utxos[0]?.transaction_hash || null;
  let confirmations = 0;
  if (txid) {
    try {
      const tx = await fetchJson(`https://api.blockchair.com/litecoin/dashboards/transaction/${txid}`);
      confirmations = tx?.data?.[txid]?.transaction?.block_id ? 1 : 0;
      // blockchair doesn't give depth easily without tip; treat included = 1+
      if (tx?.data?.[txid]?.transaction?.block_id > 0) confirmations = Math.max(1, confirmations);
    } catch {
      confirmations = received > 0 ? 1 : 0;
    }
  }
  return { received, txid, confirmations, pending: received > 0 && confirmations === 0 };
}

async function getEthProvider() {
  return new ethers.JsonRpcProvider(config.crypto.ethRpcUrl);
}

async function checkEth(address) {
  const provider = await getEthProvider();
  const balanceWei = await provider.getBalance(address);
  const received = Number(ethers.formatEther(balanceWei));
  // Find recent incoming tx via eth_getLogs is heavy; use balance + optional blockscout
  let txid = null;
  let confirmations = 0;
  if (received > 0) {
    try {
      const data = await fetchJson(
        `https://eth.blockscout.com/api/v2/addresses/${address}/transactions?filter=to`,
      );
      const first = data?.items?.[0];
      if (first) {
        txid = first.hash;
        confirmations = first.result === 'success' ? Math.max(1, first.confirmations || 1) : 0;
      } else {
        confirmations = 1;
      }
    } catch {
      confirmations = 1;
    }
  }
  return { received, txid, confirmations, pending: received > 0 && confirmations === 0 };
}

async function checkUsdt(address) {
  const provider = await getEthProvider();
  const contract = new ethers.Contract(config.crypto.usdtContract, ERC20_ABI, provider);
  const raw = await contract.balanceOf(address);
  const decimals = await contract.decimals().catch(() => 6);
  const received = Number(ethers.formatUnits(raw, decimals));
  let txid = null;
  let confirmations = 0;
  if (received > 0) {
    try {
      const data = await fetchJson(
        `https://eth.blockscout.com/api/v2/addresses/${address}/token-transfers?type=ERC-20&filter=to`,
      );
      const first = (data?.items || []).find(
        (i) =>
          String(i.token?.address_hash || i.token?.address || '').toLowerCase() ===
            config.crypto.usdtContract.toLowerCase() || true,
      );
      if (first) {
        txid = first.transaction_hash || first.tx_hash || null;
        confirmations = 1;
      } else {
        confirmations = 1;
      }
    } catch {
      confirmations = 1;
    }
  }
  return { received, txid, confirmations, pending: false };
}

async function checkAddress(row) {
  switch (row.coin) {
    case 'btc':
      return checkBtc(row.address);
    case 'ltc':
      return checkLtc(row.address);
    case 'eth':
      return checkEth(row.address);
    case 'usdt':
      return checkUsdt(row.address);
    default:
      return { received: 0, txid: null, confirmations: 0, pending: false };
  }
}

async function processPaymentRow(client, row) {
  const order = orders.getOrder(row.order_id);
  if (!order || ['cancelled', 'delivered'].includes(order.status)) return;

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

  if (!okAmount) {
    // Paiement partiel / insuffisant → on note "seen" pour le staff
    paymentAddresses.markSeen(row.id, {
      receivedAmount: result.received,
      txid: result.txid,
      confirmations: result.confirmations,
    });
    await logShop(
      client,
      `${emoji('warn')} Paiement insuffisant **${order.public_id}**: reçu ${result.received} / attendu ${row.expected_amount} ${row.coin.toUpperCase()}`,
    );
    return;
  }

  if (result.confirmations < neededConf) {
    paymentAddresses.markSeen(row.id, {
      receivedAmount: result.received,
      txid: result.txid,
      confirmations: result.confirmations,
    });
    if (order.status === 'awaiting_payment') {
      // statut soft: toujours awaiting, mais log une fois
      await logShop(
        client,
        `${emoji('pending')} TX détectée pour **${order.public_id}** (${result.confirmations}/${neededConf} conf) \`${result.txid || 'mempool'}\``,
      );
    }
    return;
  }

  // Confirmé
  paymentAddresses.markConfirmed(row.id, {
    receivedAmount: result.received,
    txid: result.txid,
    confirmations: result.confirmations,
  });

  if (['pending', 'awaiting_payment', 'partial'].includes(order.status) || order.status === 'paid') {
    if (!['paid', 'delivered', 'partial'].includes(order.status)) {
      orders.markPaid(order.id, result.txid || `crypto:${row.coin}`);
    }
  }

  const fresh = orders.getOrder(order.id);
  if (['paid', 'partial'].includes(fresh.status)) {
    try {
      const delivery = await deliverToUser(client, fresh.id);
      await logShop(
        client,
        `${emoji('success')} **${fresh.public_id}** crypto confirmé → livré en DM (${row.coin.toUpperCase()} ${result.received})`,
      );
      // Notifie aussi le salon commande si existant
      if (fresh.channel_id) {
        try {
          const ch = await client.channels.fetch(fresh.channel_id);
          const { buildOrderChannelPanel } = require('../ui/order');
          const { container, text, V2 } = require('../ui/v2');
          await ch.send({
            components: [
              container(config.successColor).addTextDisplayComponents(
                text(
                  `${emoji('check')} Paiement crypto confirmé on-chain.\nLivraison envoyée en **MP** au client.\nTu peux **Fermer** le salon pour recevoir le transcript.`,
                ),
              ),
              ...buildOrderChannelPanel(orders.getOrder(fresh.id), null).components,
            ],
            flags: V2,
          });
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      await logShop(
        client,
        `${emoji('warn')} **${fresh.public_id}** payé mais livraison DM échouée: ${e.message}`,
      );
    }
  }
}

let timer = null;
let running = false;

function startCryptoWatcher(client) {
  if (timer) return;
  paymentAddresses.ensureSchema();
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const rows = paymentAddresses.listWatchable();
      for (const row of rows) {
        await processPaymentRow(client, row);
      }
    } catch (e) {
      console.error('[crypto-watch] loop error', e);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, config.crypto.watchIntervalMs);
  // premier scan rapide
  setTimeout(tick, 5000);
  console.log(
    `${emoji('crypto')} Watcher crypto démarré (toutes les ${config.crypto.watchIntervalMs}ms)`,
  );
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
