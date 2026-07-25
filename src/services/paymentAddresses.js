const { getDb } = require('../db/database');
const { deriveAddress, isHdConfigured, enabledCoins, COIN_META } = require('./hdWallet');

function ensureSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS hd_counters (
      coin TEXT PRIMARY KEY,
      next_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payment_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE,
      coin TEXT NOT NULL,
      address TEXT NOT NULL UNIQUE,
      derivation_path TEXT NOT NULL,
      address_index INTEGER NOT NULL,
      expected_amount TEXT NOT NULL,
      expected_amount_eur REAL NOT NULL,
      received_amount TEXT,
      txid TEXT,
      confirmations INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'assigned',
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      seen_at TEXT,
      confirmed_at TEXT,
      UNIQUE(coin, address_index),
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS burned_addresses (
      address TEXT PRIMARY KEY,
      coin TEXT NOT NULL,
      address_index INTEGER NOT NULL,
      derivation_path TEXT,
      reason TEXT NOT NULL DEFAULT 'used',
      burned_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payment_addresses_watch
      ON payment_addresses(status) WHERE status IN ('assigned', 'seen', 'pending');
  `);
}

function counterKey(coin) {
  return coin === 'ltc' ? 'ltc' : coin;
}

function getCounter(coin) {
  const key = counterKey(coin);
  getDb()
    .prepare(
      `INSERT INTO hd_counters (coin, next_index) VALUES (?, 0)
       ON CONFLICT(coin) DO NOTHING`,
    )
    .run(key);
  return getDb().prepare('SELECT next_index FROM hd_counters WHERE coin = ?').get(key).next_index;
}

function setCounter(coin, index) {
  const key = counterKey(coin);
  getDb()
    .prepare(
      `INSERT INTO hd_counters (coin, next_index) VALUES (?, ?)
       ON CONFLICT(coin) DO UPDATE SET next_index = excluded.next_index`,
    )
    .run(key, index);
}

function nextIndex(coin) {
  const key = counterKey(coin);
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO hd_counters (coin, next_index) VALUES (?, 0)
       ON CONFLICT(coin) DO NOTHING`,
    ).run(key);
    const row = db.prepare('SELECT next_index FROM hd_counters WHERE coin = ?').get(key);
    const index = row.next_index;
    db.prepare('UPDATE hd_counters SET next_index = next_index + 1 WHERE coin = ?').run(key);
    return index;
  });
  return tx();
}

function burnAddress({ address, coin, addressIndex, path, reason }) {
  getDb()
    .prepare(
      `INSERT INTO burned_addresses (address, coin, address_index, derivation_path, reason)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(address) DO NOTHING`,
    )
    .run(address, coin, addressIndex, path || null, reason || 'used');
}

function isBurned(address) {
  return Boolean(
    getDb()
      .prepare('SELECT 1 FROM burned_addresses WHERE lower(address) = lower(?)')
      .get(address),
  );
}

function isInDb(address) {
  return Boolean(
    getDb()
      .prepare('SELECT 1 FROM payment_addresses WHERE lower(address) = lower(?)')
      .get(address),
  );
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'neyzz-shop-bot' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * true si l'adresse a déjà reçu des fonds / a un historique on-chain.
 */
async function hasOnChainActivity(coin, address) {
  try {
    if (coin !== 'ltc') return false;
    const data = await fetchJson(`https://litecoinspace.org/api/address/${address}`);
    const txs =
      (data.chain_stats?.tx_count || 0) + (data.mempool_stats?.tx_count || 0);
    const funded =
      (data.chain_stats?.funded_txo_sum || 0) + (data.mempool_stats?.funded_txo_sum || 0);
    return txs > 0 || funded > 0;
  } catch (e) {
    console.warn(`[hd] on-chain check fail ${coin} ${address}:`, e.message);
    return false;
  }
}

/**
 * Au démarrage : avance le compteur tant que les adresses ont déjà un historique.
 */
async function syncCountersPastUsedAddresses({ maxScan = 30 } = {}) {
  ensureSchema();
  if (!isHdConfigured()) return;

  for (const coin of enabledCoins().map((c) => c.id)) {
    let index = getCounter(coin);
    let scanned = 0;
    while (scanned < maxScan) {
      const derived = deriveAddress(coin, index);
      if (isBurned(derived.address) || isInDb(derived.address)) {
        burnAddress({
          address: derived.address,
          coin: derived.coinId,
          addressIndex: derived.index,
          path: derived.path,
          reason: 'db-or-burned',
        });
        index += 1;
        scanned += 1;
        continue;
      }
      const used = await hasOnChainActivity(derived.coinId, derived.address);
      if (!used) break;
      console.log(
        `[hd] skip adresse déjà utilisée on-chain ${derived.coinId} #${derived.index} ${derived.address}`,
      );
      burnAddress({
        address: derived.address,
        coin: derived.coinId,
        addressIndex: derived.index,
        path: derived.path,
        reason: 'on-chain-history',
      });
      index += 1;
      scanned += 1;
    }
    setCounter(coin, index);
    console.log(`[hd] ${coin} prochain index propre: #${index}`);
  }
}

/**
 * Alloue une adresse HD fraîche (jamais DB, jamais brûlée, jamais d'historique on-chain).
 */
async function allocateAddressForOrder({ orderId, coin, expectedAmount, expectedAmountEur }) {
  ensureSchema();
  if (!isHdConfigured()) throw new Error('HD wallet not configured (CRYPTO_MNEMONIC)');
  if (coin && coin !== 'ltc') throw new Error('Only Litecoin (LTC) is supported');
  coin = 'ltc';
  if (!COIN_META[coin]) throw new Error(`Unsupported coin: ${coin}`);

  const existing = getDb()
    .prepare('SELECT * FROM payment_addresses WHERE order_id = ?')
    .get(orderId);
  if (existing) return existing;

  for (let attempt = 0; attempt < 40; attempt++) {
    const index = nextIndex(coin);
    const derived = deriveAddress(coin, index);

    if (isBurned(derived.address) || isInDb(derived.address)) {
      continue;
    }

    const dirty = await hasOnChainActivity(coin, derived.address);
    if (dirty) {
      console.log(
        `[hd] adresse sale ignorée ${coin} #${index} ${derived.address}`,
      );
      burnAddress({
        address: derived.address,
        coin,
        addressIndex: index,
        path: derived.path,
        reason: 'on-chain-history',
      });
      continue;
    }

    try {
      getDb()
        .prepare(
          `INSERT INTO payment_addresses (
            order_id, coin, address, derivation_path, address_index,
            expected_amount, expected_amount_eur, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'assigned')`,
        )
        .run(
          orderId,
          coin,
          derived.address,
          derived.path,
          derived.index,
          String(expectedAmount),
          expectedAmountEur,
        );
      // Brûle aussi dans la table burned pour ne jamais réutiliser après wipe partiel
      burnAddress({
        address: derived.address,
        coin,
        addressIndex: derived.index,
        path: derived.path,
        reason: 'assigned',
      });
      return getAddressByOrder(orderId);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        burnAddress({
          address: derived.address,
          coin,
          addressIndex: index,
          path: derived.path,
          reason: 'unique-conflict',
        });
        continue;
      }
      throw e;
    }
  }
  throw new Error('Could not allocate a clean unique address (too many dirty addresses)');
}

function getAddressByOrder(orderId) {
  ensureSchema();
  return getDb()
    .prepare('SELECT * FROM payment_addresses WHERE order_id = ?')
    .get(orderId);
}

function listWatchable() {
  ensureSchema();
  return getDb()
    .prepare(
      `SELECT pa.*
       FROM payment_addresses pa
       JOIN orders o ON o.id = pa.order_id
       WHERE pa.status IN ('assigned', 'seen', 'pending')
         AND o.status NOT IN ('delivered', 'cancelled')
         AND o.closed_at IS NULL
       ORDER BY pa.id ASC`,
    )
    .all();
}

function markSeen(id, { receivedAmount, txid, confirmations }) {
  getDb()
    .prepare(
      `UPDATE payment_addresses
       SET status = 'seen',
           received_amount = ?,
           txid = ?,
           confirmations = ?,
           seen_at = COALESCE(seen_at, datetime('now'))
       WHERE id = ?`,
    )
    .run(String(receivedAmount), txid || null, confirmations || 0, id);
}

function markConfirmed(id, { receivedAmount, txid, confirmations }) {
  getDb()
    .prepare(
      `UPDATE payment_addresses
       SET status = 'confirmed',
           received_amount = ?,
           txid = ?,
           confirmations = ?,
           confirmed_at = datetime('now')
       WHERE id = ?`,
    )
    .run(String(receivedAmount), txid || null, confirmations || 0, id);
}

function markAddressConsumedOnCancel(orderId) {
  getDb()
    .prepare(
      `UPDATE payment_addresses
       SET status = CASE WHEN status IN ('confirmed') THEN status ELSE 'expired' END
       WHERE order_id = ?`,
    )
    .run(orderId);
}

function stats() {
  ensureSchema();
  const coins = enabledCoins().map((c) => c.id);
  const out = {};
  for (const coin of coins) {
    const key = counterKey(coin);
    const counter = getDb().prepare('SELECT next_index FROM hd_counters WHERE coin = ?').get(key);
    const used = getDb()
      .prepare('SELECT COUNT(*) AS c FROM payment_addresses WHERE coin = ?')
      .get(coin);
    out[coin] = {
      nextIndex: counter?.next_index || 0,
      addressesUsed: used?.c || 0,
    };
  }
  return out;
}

module.exports = {
  ensureSchema,
  allocateAddressForOrder,
  getAddressByOrder,
  listWatchable,
  markSeen,
  markConfirmed,
  markAddressConsumedOnCancel,
  syncCountersPastUsedAddresses,
  hasOnChainActivity,
  stats,
};
