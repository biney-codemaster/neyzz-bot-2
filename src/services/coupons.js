const { getDb } = require('../db/database');

function listCoupons() {
  return getDb().prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
}

function getCoupon(code) {
  return getDb()
    .prepare('SELECT * FROM coupons WHERE lower(code) = lower(?)')
    .get(code);
}

function createCoupon({
  code,
  type,
  value,
  maxUses = null,
  minAmount = 0,
  expiresAt = null,
}) {
  getDb()
    .prepare(
      `INSERT INTO coupons (code, type, value, max_uses, min_amount, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(code.toUpperCase(), type, value, maxUses, minAmount, expiresAt);
  return getCoupon(code);
}

function updateCoupon(code, fields) {
  const allowed = ['type', 'value', 'max_uses', 'min_amount', 'active', 'expires_at'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return getCoupon(code);
  values.push(code);
  getDb()
    .prepare(`UPDATE coupons SET ${sets.join(', ')} WHERE code = ?`)
    .run(...values);
  return getCoupon(code);
}

function deleteCoupon(code) {
  return getDb().prepare('DELETE FROM coupons WHERE code = ?').run(code);
}

function applyCoupon(code, subtotal) {
  const coupon = getCoupon(code);
  if (!coupon || !coupon.active) {
    return { ok: false, error: 'Code promo invalide' };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { ok: false, error: 'Code promo expiré' };
  }
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
    return { ok: false, error: 'Code promo épuisé' };
  }
  if (subtotal < Number(coupon.min_amount || 0)) {
    return {
      ok: false,
      error: `Montant minimum: ${Number(coupon.min_amount).toFixed(2)} €`,
    };
  }

  let discount = 0;
  if (coupon.type === 'percent') {
    discount = (subtotal * Number(coupon.value)) / 100;
  } else {
    discount = Number(coupon.value);
  }
  discount = Math.min(subtotal, Number(discount.toFixed(2)));

  return { ok: true, coupon, discount };
}

function incrementCouponUse(code) {
  if (!code) return;
  getDb()
    .prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?')
    .run(code);
}

module.exports = {
  listCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  applyCoupon,
  incrementCouponUse,
};
