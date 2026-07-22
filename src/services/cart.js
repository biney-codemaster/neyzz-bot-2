const { getDb } = require('../db/database');
const products = require('./products');
const coupons = require('./coupons');

function ensureCart(userId) {
  getDb()
    .prepare(
      `INSERT INTO carts (user_id) VALUES (?)
       ON CONFLICT(user_id) DO UPDATE SET updated_at = datetime('now')`,
    )
    .run(userId);
}

function getCart(userId) {
  ensureCart(userId);
  const cart = getDb().prepare('SELECT * FROM carts WHERE user_id = ?').get(userId);
  const items = getDb()
    .prepare(
      `SELECT
         ci.id AS cart_item_id,
         ci.user_id,
         ci.product_id,
         ci.quantity AS quantity,
         p.name,
         p.price,
         p.delivery_type,
         p.stock_mode,
         p.active
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = ?
       ORDER BY ci.id ASC`,
    )
    .all(userId)
    .map((row) => {
      const product = products.getProduct(row.product_id);
      return {
        ...row,
        id: row.cart_item_id,
        product,
        lineTotal: Number(row.price) * Number(row.quantity),
      };
    });

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  let discount = 0;
  let coupon = null;
  let couponError = null;

  if (cart.coupon_code) {
    const applied = coupons.applyCoupon(cart.coupon_code, subtotal);
    if (applied.ok) {
      coupon = applied.coupon;
      discount = applied.discount;
    } else {
      couponError = applied.error;
    }
  }

  const total = Math.max(0, Number((subtotal - discount).toFixed(2)));

  return {
    userId,
    couponCode: cart.coupon_code,
    coupon,
    couponError,
    items,
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    total,
  };
}

function addToCart(userId, productId, quantity = 1) {
  const product = products.getProduct(productId);
  if (!product || !product.active) throw new Error('Produit introuvable ou inactif');
  if (!product.inStock) throw new Error('Produit en rupture de stock');

  ensureCart(userId);
  const existing = getDb()
    .prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?')
    .get(userId, productId);

  const nextQty = (existing?.quantity || 0) + quantity;
  if (product.stock_mode !== 'unlimited' && nextQty > product.available) {
    throw new Error(`Stock insuffisant (dispo: ${product.available})`);
  }

  if (existing) {
    getDb()
      .prepare('UPDATE cart_items SET quantity = ? WHERE id = ?')
      .run(nextQty, existing.id);
  } else {
    getDb()
      .prepare(
        'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)',
      )
      .run(userId, productId, quantity);
  }

  return getCart(userId);
}

function setItemQuantity(userId, productId, quantity) {
  if (quantity <= 0) return removeFromCart(userId, productId);
  const product = products.getProduct(productId);
  if (!product) throw new Error('Produit introuvable');
  if (product.stock_mode !== 'unlimited' && quantity > product.available) {
    throw new Error(`Stock insuffisant (dispo: ${product.available})`);
  }
  ensureCart(userId);
  getDb()
    .prepare(
      `INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = excluded.quantity`,
    )
    .run(userId, productId, quantity);
  return getCart(userId);
}

function removeFromCart(userId, productId) {
  getDb()
    .prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?')
    .run(userId, productId);
  return getCart(userId);
}

function clearCart(userId) {
  getDb().prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
  getDb().prepare('UPDATE carts SET coupon_code = NULL WHERE user_id = ?').run(userId);
}

function setCoupon(userId, code) {
  ensureCart(userId);
  if (!code) {
    getDb().prepare('UPDATE carts SET coupon_code = NULL WHERE user_id = ?').run(userId);
    return getCart(userId);
  }
  const cart = getCart(userId);
  const check = coupons.applyCoupon(code, cart.subtotal);
  if (!check.ok) throw new Error(check.error);
  getDb()
    .prepare('UPDATE carts SET coupon_code = ? WHERE user_id = ?')
    .run(check.coupon.code, userId);
  return getCart(userId);
}

module.exports = {
  getCart,
  addToCart,
  setItemQuantity,
  removeFromCart,
  clearCart,
  setCoupon,
};
