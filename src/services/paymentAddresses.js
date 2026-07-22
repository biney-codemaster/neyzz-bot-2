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

    CREATE INDEX IF NOT EXISTS idx_payment_addresses_watch
      ON payment_addresses(status) WHERE status IN ('assigned', 'seen', 'pending');
  `);
}

function counterKey(coin) {
  // ETH et USDT partagent la même branche d'adresses EVM → un seul compteur
  if (coin === 'eth' || coin === 'usdt') return 'evm';
  return coin;
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

/**
 * Alloue une adresse HD fraîche pour une commande.
 * Une adresse assignée n'est JAMAIS réutilisée (même si commande annulée).
 */
function allocateAddressForOrder({ orderId, coin, expectedAmount, expectedAmountEur }) {
  ensureSchema();
  if (!isHdConfigured()) throw new Error('HD wallet non configuré (CRYPTO_MNEMONIC)');
  if (!COIN_META[coin]) throw new Error(`Coin non supporté: ${coin}`);

  const existing = getDb()
    .prepare('SELECT * FROM payment_addresses WHERE order_id = ?')
    .get(orderId);
  if (existing) return existing;

  // Essaie quelques index au cas où collision théorique
  for (let attempt = 0; attempt < 5; attempt++) {
    const index = nextIndex(coin);
    const derived = deriveAddress(coin, index);

    // Sécurité: si l'adresse existe déjà en DB, on saute (ne jamais réutiliser)
    const taken = getDb()
      .prepare('SELECT id FROM payment_addresses WHERE lower(address) = lower(?)')
      .get(derived.address);
    if (taken) continue;

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
      return getAddressByOrder(orderId);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) continue;
      throw e;
    }
  }
  throw new Error('Impossible d\'allouer une adresse unique');
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
       WHERE pa.status IN ('assigned', 'seen', 'pending', 'confirmed')
         AND o.status NOT IN ('delivered', 'cancelled')
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
  // L'adresse reste "brûlée" : on la passe en expired, jamais réassignée
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
    const counter = getDb().prepare('SELECT next_index FROM hd_counters WHERE coin = ?').get(coin);
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
  stats,
};
