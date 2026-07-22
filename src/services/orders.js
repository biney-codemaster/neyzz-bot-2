const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const cartService = require('./cart');
const products = require('./products');
const coupons = require('./coupons');
const config = require('../config');

function publicId() {
  return `CMD-${uuidv4().slice(0, 8).toUpperCase()}`;
}

function getOrder(id) {
  const order = getDb().prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return null;
  const items = getDb()
    .prepare('SELECT * FROM order_items WHERE order_id = ?')
    .all(id);
  return { ...order, items };
}

function getOrderByPublicId(publicOrderId) {
  const order = getDb()
    .prepare('SELECT * FROM orders WHERE public_id = ?')
    .get(publicOrderId);
  if (!order) return null;
  return getOrder(order.id);
}

function getOrderByChannel(channelId) {
  const order = getDb()
    .prepare('SELECT * FROM orders WHERE channel_id = ?')
    .get(channelId);
  if (!order) return null;
  return getOrder(order.id);
}

function listOrders({ status, limit = 20 } = {}) {
  if (status) {
    return getDb()
      .prepare(
        'SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT ?',
      )
      .all(status, limit);
  }
  return getDb()
    .prepare('SELECT * FROM orders ORDER BY id DESC LIMIT ?')
    .all(limit);
}

function createOrderFromCart(user, paymentMethod, cryptoCurrency = null) {
  const cart = cartService.getCart(user.id);
  if (!cart.items.length) throw new Error('Ton panier est vide');
  if (cart.couponError) throw new Error(cart.couponError);

  for (const item of cart.items) {
    if (!item.product?.active) {
      throw new Error(`Produit indisponible: ${item.name}`);
    }
    if (!item.product.inStock) {
      throw new Error(`Rupture de stock: ${item.name}`);
    }
    if (
      item.product.stock_mode !== 'unlimited' &&
      item.quantity > item.product.available
    ) {
      throw new Error(`Stock insuffisant pour ${item.name}`);
    }
  }

  const create = getDb().transaction(() => {
    const result = getDb()
      .prepare(
        `INSERT INTO orders (
          public_id, user_id, username, status, payment_method, crypto_currency,
          subtotal, discount, total, coupon_code
        ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        publicId(),
        user.id,
        user.username || user.tag || user.id,
        paymentMethod,
        cryptoCurrency,
        cart.subtotal,
        cart.discount,
        cart.total,
        cart.couponCode || null,
      );

    const orderId = result.lastInsertRowid;
    const insertItem = getDb().prepare(
      `INSERT INTO order_items (
        order_id, product_id, product_name, unit_price, quantity, delivery_type
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    );

    for (const item of cart.items) {
      insertItem.run(
        orderId,
        item.product_id,
        item.name,
        item.price,
        item.quantity,
        item.delivery_type,
      );

      if (item.product.stock_mode === 'keys') {
        products.reserveKeys(item.product_id, item.quantity, orderId);
      } else if (item.product.stock_mode === 'quantity') {
        products.decrementQuantity(item.product_id, item.quantity);
      }
    }

    if (cart.couponCode) coupons.incrementCouponUse(cart.couponCode);
    cartService.clearCart(user.id);
    return orderId;
  });

  return getOrder(create());
}

function setOrderChannel(orderId, channelId) {
  getDb()
    .prepare('UPDATE orders SET channel_id = ? WHERE id = ?')
    .run(channelId, orderId);
}

function setPaymentRef(orderId, ref) {
  getDb()
    .prepare('UPDATE orders SET payment_ref = ? WHERE id = ?')
    .run(ref, orderId);
}

function markPaid(orderId, paymentRef = null) {
  getDb()
    .prepare(
      `UPDATE orders
       SET status = 'paid', paid_at = datetime('now'), payment_ref = COALESCE(?, payment_ref)
       WHERE id = ? AND status IN ('pending', 'awaiting_payment')`,
    )
    .run(paymentRef, orderId);
  return getOrder(orderId);
}

function markDelivered(orderId) {
  getDb()
    .prepare(
      `UPDATE orders SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?`,
    )
    .run(orderId);
  return getOrder(orderId);
}

function markAwaitingPayment(orderId) {
  getDb()
    .prepare(`UPDATE orders SET status = 'awaiting_payment' WHERE id = ?`)
    .run(orderId);
  return getOrder(orderId);
}

function cancelOrder(orderId, reason = '') {
  const order = getOrder(orderId);
  if (!order) throw new Error('Commande introuvable');
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new Error('Cette commande ne peut plus être annulée');
  }

  const tx = getDb().transaction(() => {
    products.releaseReservedKeys(orderId);
    try {
      require('./paymentAddresses').markAddressConsumedOnCancel(orderId);
    } catch {
      /* schema pas encore prêt */
    }

    // Restore quantity stock for non-delivered quantity-mode items
    for (const item of order.items) {
      if (!item.product_id) continue;
      const product = products.getProduct(item.product_id);
      if (product?.stock_mode === 'quantity' && order.status !== 'delivered') {
        getDb()
          .prepare(
            `UPDATE products SET quantity = quantity + ? WHERE id = ? AND stock_mode = 'quantity'`,
          )
          .run(item.quantity, item.product_id);
      }
    }

    getDb()
      .prepare(
        `UPDATE orders
         SET status = 'cancelled', notes = TRIM(COALESCE(notes,'') || ?)
         WHERE id = ?`,
      )
      .run(reason ? `\nAnnulation: ${reason}` : '', orderId);
  });
  tx();
  return getOrder(orderId);
}

function markClosed(orderId) {
  getDb()
    .prepare(
      `UPDATE orders SET closed_at = datetime('now') WHERE id = ?`,
    )
    .run(orderId);
  return getOrder(orderId);
}

function deliverOrder(orderId) {
  const order = getOrder(orderId);
  if (!order) throw new Error('Commande introuvable');
  if (!['paid', 'partial'].includes(order.status)) {
    throw new Error('La commande doit être payée avant livraison');
  }

  const reserved = products.consumeReservedKeys(orderId);
  const byProduct = new Map();
  for (const key of reserved) {
    if (!byProduct.has(key.product_id)) byProduct.set(key.product_id, []);
    byProduct.get(key.product_id).push(key.payload);
  }

  const deliveries = [];
  const updateItem = getDb().prepare(
    'UPDATE order_items SET delivered_payload = ? WHERE id = ?',
  );

  let allDone = true;

  const tx = getDb().transaction(() => {
    for (const item of order.items) {
      if (item.delivered_payload) {
        deliveries.push({ item, payload: item.delivered_payload });
        continue;
      }

      if (item.delivery_type === 'auto' && item.product_id) {
        let payloads = byProduct.get(item.product_id) || [];

        // Si pas de clés réservées (ex: stock quantity) mais des clés en stock → les prendre
        if (payloads.length < item.quantity) {
          const needed = item.quantity - payloads.length;
          const taken = products.takeFreeKeys(item.product_id, needed, orderId);
          payloads = payloads.concat(taken.map((k) => k.payload));
        }

        let content = null;
        if (payloads.length >= item.quantity) {
          content = payloads.slice(0, item.quantity).join('\n');
        } else if (payloads.length > 0) {
          content = payloads.join('\n');
        } else {
          const product = products.getProduct(item.product_id);
          const template = (product?.delivery_content || '').trim();
          if (template) {
            // Répète le contenu si quantité > 1
            content = Array.from({ length: item.quantity }, () => template).join('\n');
          }
        }

        if (!content) {
          throw new Error(
            `Aucun contenu à livrer pour « ${item.product_name} ». Ajoute des clés ou un contenu de livraison sur le produit.`,
          );
        }

        updateItem.run(content, item.id);
        deliveries.push({ item, payload: content });
      } else {
        allDone = false;
        deliveries.push({ item, payload: null, manual: true });
      }
    }

    if (allDone) {
      markDelivered(orderId);
    } else {
      getDb()
        .prepare(`UPDATE orders SET status = 'partial' WHERE id = ?`)
        .run(orderId);
    }
  });
  tx();

  return { order: getOrder(orderId), deliveries, allDone };
}

function setItemDelivery(orderItemId, payload) {
  getDb()
    .prepare('UPDATE order_items SET delivered_payload = ? WHERE id = ?')
    .run(payload, orderItemId);
}

function formatInvoice(order) {
  const lines = order.items
    .map(
      (i) =>
        `• **${i.product_name}** × ${i.quantity} — ${(i.unit_price * i.quantity).toFixed(2)} ${config.currencySymbol}`,
    )
    .join('\n');

  return [
    `**Facture ${order.public_id}**`,
    '',
    lines,
    '',
    `Sous-total : **${order.subtotal.toFixed(2)} ${config.currencySymbol}**`,
    order.discount > 0
      ? `Remise${order.coupon_code ? ` (${order.coupon_code})` : ''} : −**${order.discount.toFixed(2)} ${config.currencySymbol}**`
      : null,
    `Total : **${order.total.toFixed(2)} ${config.currencySymbol}**`,
    `Statut : \`${order.status}\``,
    order.payment_method ? `Paiement : **${order.payment_method}**` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  getOrder,
  getOrderByPublicId,
  getOrderByChannel,
  listOrders,
  createOrderFromCart,
  setOrderChannel,
  setPaymentRef,
  markPaid,
  markDelivered,
  markAwaitingPayment,
  markClosed,
  cancelOrder,
  deliverOrder,
  setItemDelivery,
  formatInvoice,
};
