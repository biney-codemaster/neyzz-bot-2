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
    pending: `${emoji('pending')} En attente`,
    awaiting_payment: `${emoji('clock')} Paiement en cours`,
    paid: `${emoji('check')} Payée`,
    delivered: `${emoji('delivery')} Livrée`,
    cancelled: `${emoji('cross')} Annulée`,
    partial: `${emoji('warn')} Partielle`,
  };
  return map[status] || status;
}

function buildOrderChannelPanel(order, paymentInfo = null) {
  const invoice = orders.formatInvoice(order);
  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('invoice')} Commande ${order.public_id}`),
      text(
        [
          `${emoji('user')} Client : <@${order.user_id}>`,
          `Statut : ${statusLabel(order.status)}`,
          order.payment_method
            ? `Moyen : **${order.payment_method}${order.crypto_currency ? ` (${order.crypto_currency.toUpperCase()})` : ''}**`
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
      paymentLines.push(text(`${emoji('copy')} Adresse : \`${paymentInfo.address}\``));
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
    customerBtns.push(
      btn(`order:paid:${order.id}`, 'J\'ai payé', ButtonStyle.Success, 'check'),
      btn(`order:cancel:${order.id}`, 'Annuler', ButtonStyle.Danger, 'cross'),
    );
  }
  if (order.status === 'delivered') {
    customerBtns.push(
      btn(`order:review:${order.id}`, 'Laisser un avis', ButtonStyle.Primary, 'star'),
    );
  }
  if (customerBtns.length) components.push(row(...customerBtns));

  if (order.payment_method === 'crypto' && ['pending', 'awaiting_payment'].includes(order.status)) {
    components.push(
      container(config.accentColor).addTextDisplayComponents(
        text(
          `${emoji('crypto')} Surveillance on-chain active — livraison en **MP** après confirmation réseau.`,
        ),
      ),
    );
  }

  // Staff : boutons selon le statut (pas de spam / pas de doublon d'action)
  const staffBtns = [];
  if (['pending', 'awaiting_payment'].includes(order.status)) {
    staffBtns.push(
      btn(`staff:confirm_pay:${order.id}`, 'Confirmer paiement', ButtonStyle.Success, 'money'),
      btn(`staff:cancel:${order.id}`, 'Annuler', ButtonStyle.Danger, 'trash'),
    );
  } else if (['paid', 'partial'].includes(order.status)) {
    staffBtns.push(
      btn(`staff:deliver:${order.id}`, 'Livrer (MP)', ButtonStyle.Primary, 'delivery'),
      btn(`staff:cancel:${order.id}`, 'Annuler', ButtonStyle.Danger, 'trash'),
    );
  }

  if (staffBtns.length) {
    components.push(
      container(config.accentColor).addTextDisplayComponents(
        text(`${emoji('staff')} **Zone staff**`),
      ),
      row(...staffBtns),
    );
  } else if (order.status === 'delivered') {
    components.push(
      container(config.successColor).addTextDisplayComponents(
        text(`${emoji('check')} Commande livrée — plus d'action staff.`),
      ),
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
        `${emoji('manual')} **${d.item.product_name}** × ${d.item.quantity} — en attente de livraison manuelle`,
    );

  const c = container(config.successColor)
    .addTextDisplayComponents(
      text(`# ${emoji('success')} Livraison — ${order.public_id}`),
      text(
        autoLines.length || manualLines.length
          ? [...autoLines, ...manualLines].join('\n\n')
          : 'Aucun contenu à livrer.',
      ),
    );

  const components = [c];
  if (order.status === 'delivered') {
    components.push(
      row(btn(`order:review:${order.id}`, 'Laisser un avis', ButtonStyle.Primary, 'star')),
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
