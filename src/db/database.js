const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

let db;

function getDb() {
  if (db) return db;

  const dbPath = path.resolve(config.databasePath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL,
      delivery_type TEXT NOT NULL CHECK(delivery_type IN ('auto', 'manual')),
      stock_mode TEXT NOT NULL CHECK(stock_mode IN ('keys', 'unlimited', 'quantity')),
      quantity INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      reserved_order_id INTEGER,
      used_order_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS carts (
      user_id TEXT PRIMARY KEY,
      coupon_code TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      UNIQUE(user_id, product_id),
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('percent', 'fixed')),
      value REAL NOT NULL,
      max_uses INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      min_amount REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT,
      payment_ref TEXT,
      crypto_currency TEXT,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      coupon_code TEXT,
      channel_id TEXT,
      invoice_message_id TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT,
      delivered_at TEXT,
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      delivery_type TEXT NOT NULL,
      delivered_payload TEXT,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_product_keys_free
      ON product_keys(product_id) WHERE used_order_id IS NULL AND reserved_order_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  `);

  // Migrations soft (SQLite)
  const cols = database.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  if (!cols.includes('delivery_content')) {
    database.exec(
      `ALTER TABLE products ADD COLUMN delivery_content TEXT NOT NULL DEFAULT ''`,
    );
  }
}

function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, String(value));
}

function getSettingsPrefix(prefix) {
  const rows = getDb()
    .prepare('SELECT key, value FROM settings WHERE key LIKE ?')
    .all(`${prefix}%`);
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

module.exports = {
  getDb,
  getSetting,
  setSetting,
  getSettingsPrefix,
};
