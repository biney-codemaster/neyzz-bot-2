const config = require('../config');
const {
  V2,
  text,
  separator,
  btn,
  row,
  container,
  ButtonStyle,
  money,
  emoji,
} = require('./v2');
const orders = require('../services/orders');
const payments = require('../services/payments');

function statusLabel(status) {
  const map = {
    pending: `${emoji('pending')} Pending`,
    awaiting_payment: `${emoji('clock')} Awaiting payment`,
    paid: `${emoji('check')} Paid`,
    delivered: `${emoji('delivery')} Delivered`,
    cancelled: `${emoji('cross')} Cancelled`,
    partial: `${emoji('warn')} Partial`,
  };
  return map[status] || status;
}

function buildOrderChannelPanel(order, paymentInfo = null) {
  const isCrypto = order.payment_method === 'crypto';
  const item = order.items?.[0];
  const qty = order.items?.reduce((s, i) => s + i.quantity, 0) || 0;

  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('invoice')} ${order.public_id}`),
      text(
        [
          `<@${order.user_id}>`,
          item ? `**${item.product_name}** × ${qty}` : null,
          `${emoji('money')} **${money(order.total)}**`,
          statusLabel(order.status),
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    );

  const components = [c];

  if (paymentInfo && ['pending', 'awaiting_payment'].includes(order.status)) {
    const paymentLines = [
      text(`## ${emoji(paymentInfo.method === 'paypal' ? 'paypal' : 'ltc')} ${paymentInfo.title}`),
      text(paymentInfo.instructions),
    ];
    if (paymentInfo.address) {
      paymentLines.push(text(`\`${paymentInfo.address}\``));
    } else if (paymentInfo.link) {
      paymentLines.push(text(paymentInfo.link));
    } else if (paymentInfo.email) {
      paymentLines.push(text(`\`${paymentInfo.email}\``));
    }
    components.push(
      container(config.warnColor).addTextDisplayComponents(...paymentLines),
    );
  }

  const customerBtns = [];
  if (['pending', 'awaiting_payment'].includes(order.status)) {
    if (!isCrypto) {
      customerBtns.push(
        btn(`order:paid:${order.id}`, 'I paid', ButtonStyle.Success, 'check'),
      );
    }
    customerBtns.push(
      btn(`order:cancel:${order.id}`, 'Cancel', ButtonStyle.Danger, 'cross'),
    );
  }
  if (order.status === 'delivered') {
    customerBtns.push(
      btn(`order:review:${order.id}`, 'Leave a review', ButtonStyle.Primary, 'star'),
    );
  }
  if (customerBtns.length) components.push(row(...customerBtns.slice(0, 5)));

  if (isCrypto && ['pending', 'awaiting_payment'].includes(order.status)) {
    components.push(
      container(config.accentColor).addTextDisplayComponents(
        text(
          `${emoji('crypto')} Auto-watched — delivery by **DM** when confirmed.`,
        ),
      ),
    );
  }

  const adminBtns = [];
  if (['pending', 'awaiting_payment'].includes(order.status)) {
    if (!isCrypto) {
      adminBtns.push(
        btn(`staff:confirm_pay:${order.id}`, 'Confirm payment', ButtonStyle.Success, 'money'),
      );
    }
    adminBtns.push(
      btn(`staff:cancel:${order.id}`, 'Cancel', ButtonStyle.Danger, 'trash'),
    );
  } else if (['paid', 'partial'].includes(order.status)) {
    adminBtns.push(
      btn(`staff:deliver:${order.id}`, 'Deliver (DM)', ButtonStyle.Primary, 'delivery'),
      btn(`staff:cancel:${order.id}`, 'Cancel', ButtonStyle.Danger, 'trash'),
    );
  }

  if (adminBtns.length) {
    components.push(
      container(config.accentColor).addTextDisplayComponents(
        text(`${emoji('admin')} **Admin**`),
      ),
      row(...adminBtns.slice(0, 5)),
    );
  }

  if (['delivered', 'cancelled'].includes(order.status) && !order.closed_at) {
    components.push(
      row(btn(`order:close:${order.id}`, 'Close + transcript', ButtonStyle.Danger, 'lock')),
    );
  }

  return { components, flags: V2 };
}

/** V2 follow-up AFTER plain gift-link messages */
function buildDeliveryFollowUp(order) {
  const c = container(config.successColor).addTextDisplayComponents(
    text(`# ${emoji('success')} Delivered`),
    text(`Order **${order.public_id}** — gift link(s) sent above.`),
  );

  const components = [c];
  if (order.status === 'delivered' && !order.closed_at) {
    components.push(
      row(
        btn(`order:review:${order.id}`, 'Leave a review', ButtonStyle.Primary, 'star'),
        btn(`order:close:${order.id}`, 'Close + transcript', ButtonStyle.Danger, 'lock'),
      ),
    );
  }
  return { components, flags: V2 };
}

/** @deprecated use buildDeliveryFollowUp + plain link messages */
function buildDeliveryMessage(order, _deliveries) {
  return buildDeliveryFollowUp(order);
}

function buildPaymentInfoForOrder(order) {
  if (order.payment_method === 'paypal') {
    return payments.buildPaypalPayment(order);
  }
  if (order.payment_method === 'crypto') {
    return payments.buildCryptoPayment(order, order.crypto_currency);
  }
  return null;
}

module.exports = {
  buildOrderChannelPanel,
  buildDeliveryMessage,
  buildDeliveryFollowUp,
  buildPaymentInfoForOrder,
  statusLabel,
  money,
};
