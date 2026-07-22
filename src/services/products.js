const { getDb } = require('../db/database');

function listProducts({ activeOnly = true } = {}) {
  const sql = activeOnly
    ? 'SELECT * FROM products WHERE active = 1 ORDER BY position ASC, id ASC'
    : 'SELECT * FROM products ORDER BY position ASC, id ASC';
  return getDb().prepare(sql).all().map(enrichProduct);
}

function getProduct(id) {
  const row = getDb().prepare('SELECT * FROM products WHERE id = ?').get(id);
  return row ? enrichProduct(row) : null;
}

function enrichProduct(row) {
  const available = getAvailableStock(row);
  return {
    ...row,
    active: Boolean(row.active),
    available,
    inStock: row.stock_mode === 'unlimited' ? true : available > 0,
  };
}

function getAvailableStock(product) {
  if (product.stock_mode === 'unlimited') return Infinity;
  if (product.stock_mode === 'quantity') return Math.max(0, product.quantity);

  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM product_keys
       WHERE product_id = ? AND used_order_id IS NULL AND reserved_order_id IS NULL`,
    )
    .get(product.id);
  return row.c;
}

function createProduct({
  name,
  description = '',
  price,
  deliveryType = 'auto',
  stockMode = 'keys',
  quantity = 0,
  deliveryContent = '',
}) {
  const result = getDb()
    .prepare(
      `INSERT INTO products (name, description, price, delivery_type, stock_mode, quantity, delivery_content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(name, description, price, deliveryType, stockMode, quantity, deliveryContent);
  return getProduct(result.lastInsertRowid);
}

function updateProduct(id, fields) {
  const allowed = [
    'name',
    'description',
    'price',
    'delivery_type',
    'stock_mode',
    'quantity',
    'active',
    'position',
    'delivery_content',
  ];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return getProduct(id);
  sets.push(`updated_at = datetime('now')`);
  values.push(id);
  getDb()
    .prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
  return getProduct(id);
}

function deleteProduct(id) {
  return getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
}

function addKeys(productId, payloads) {
  const insert = getDb().prepare(
    'INSERT INTO product_keys (product_id, payload) VALUES (?, ?)',
  );
  const tx = getDb().transaction((items) => {
    for (const payload of items) {
      const cleaned = String(payload).trim();
      if (cleaned) insert.run(productId, cleaned);
    }
  });
  tx(payloads);
  return getAvailableStock(getProduct(productId));
}

function reserveKeys(productId, quantity, orderId) {
  const keys = getDb()
    .prepare(
      `SELECT id FROM product_keys
       WHERE product_id = ? AND used_order_id IS NULL AND reserved_order_id IS NULL
       LIMIT ?`,
    )
    .all(productId, quantity);

  if (keys.length < quantity) {
    throw new Error('Stock insuffisant');
  }

  const upd = getDb().prepare(
    'UPDATE product_keys SET reserved_order_id = ? WHERE id = ?',
  );
  const tx = getDb().transaction(() => {
    for (const key of keys) upd.run(orderId, key.id);
  });
  tx();
  return keys.map((k) => k.id);
}

function consumeReservedKeys(orderId) {
  const keys = getDb()
    .prepare(
      `SELECT id, product_id, payload FROM product_keys WHERE reserved_order_id = ?`,
    )
    .all(orderId);

  getDb()
    .prepare(
      `UPDATE product_keys
       SET used_order_id = reserved_order_id, reserved_order_id = NULL
       WHERE reserved_order_id = ?`,
    )
    .run(orderId);

  return keys;
}

/**
 * Prend N clés libres pour un produit (même si stock_mode != keys),
 * les marque utilisées pour orderId. Utile si quelqu'un a ajouté des clés
 * sur un produit quantity/unlimited.
 */
function takeFreeKeys(productId, quantity, orderId) {
  const keys = getDb()
    .prepare(
      `SELECT id, product_id, payload FROM product_keys
       WHERE product_id = ? AND used_order_id IS NULL AND reserved_order_id IS NULL
       LIMIT ?`,
    )
    .all(productId, quantity);

  if (!keys.length) return [];

  const upd = getDb().prepare(
    'UPDATE product_keys SET used_order_id = ? WHERE id = ?',
  );
  for (const key of keys) upd.run(orderId, key.id);
  return keys;
}

function releaseReservedKeys(orderId) {
  getDb()
    .prepare(
      `UPDATE product_keys SET reserved_order_id = NULL WHERE reserved_order_id = ?`,
    )
    .run(orderId);
}

function decrementQuantity(productId, quantity) {
  const result = getDb()
    .prepare(
      `UPDATE products SET quantity = quantity - ?
       WHERE id = ? AND stock_mode = 'quantity' AND quantity >= ?`,
    )
    .run(quantity, productId, quantity);
  if (result.changes === 0) throw new Error('Stock insuffisant');
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  addKeys,
  getAvailableStock,
  reserveKeys,
  consumeReservedKeys,
  takeFreeKeys,
  releaseReservedKeys,
  decrementQuantity,
};
