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
  const invoice = orders.formatInvoice(order);
  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('invoice')} Order ${order.public_id}`),
      text(
        [
          `${emoji('user')} Customer: <@${order.user_id}>`,
          `Status: ${statusLabel(order.status)}`,
          order.payment_method
            ? `Method: **${order.payment_method}${order.crypto_currency ? ` (${order.crypto_currency.toUpperCase()})` : ''}**`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(invoice));

  const components = [c];

  if (paymentInfo && ['pending', 'awaiting_payment'].includes(order.status)) {
    const paymentLines = [
      text(`# ${emoji(paymentInfo.method === 'paypal' ? 'paypal' : 'crypto')} ${paymentInfo.title}`),
      text(paymentInfo.instructions),
    ];
    if (paymentInfo.address) {
      paymentLines.push(text(`${emoji('copy')} Address: \`${paymentInfo.address}\``));
    } else if (paymentInfo.link) {
      paymentLines.push(text(`${emoji('link')} ${paymentInfo.link}`));
    } else if (paymentInfo.email) {
      paymentLines.push(text(`${emoji('paypal')} ${paymentInfo.email}`));
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
          `${emoji('crypto')} Payment is watched automatically — no button needed.\nDelivery by **DM** once the network confirms.`,
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
        text(`${emoji('admin')} **Admin zone**`),
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

function buildDeliveryMessage(order, deliveries) {
  const autoLines = deliveries
    .filter((d) => d.payload)
    .map(
      (d) =>
        `### ${emoji('key')} ${d.item.product_name} × ${d.item.quantity}\n\`\`\`\n${d.payload}\n\`\`\``,
    );

  const manualLines = deliveries
    .filter((d) => d.manual)
    .map(
      (d) =>
        `${emoji('manual')} **${d.item.product_name}** × ${d.item.quantity} — awaiting manual delivery`,
    );

  const c = container(config.successColor)
    .addTextDisplayComponents(
      text(`# ${emoji('success')} Delivery — ${order.public_id}`),
      text(
        autoLines.length || manualLines.length
          ? [...autoLines, ...manualLines].join('\n\n')
          : 'Nothing to deliver.',
      ),
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
  buildPaymentInfoForOrder,
  statusLabel,
  money,
};
