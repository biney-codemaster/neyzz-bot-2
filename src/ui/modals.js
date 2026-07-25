const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

function modal(customId, title) {
  return new ModalBuilder().setCustomId(customId).setTitle(title);
}

function input(customId, label, { style = TextInputStyle.Short, required = true, placeholder, value, maxLength } = {}) {
  const field = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);
  if (placeholder) field.setPlaceholder(placeholder);
  if (value != null) field.setValue(String(value).slice(0, maxLength || 4000));
  if (maxLength) field.setMaxLength(maxLength);
  return new ActionRowBuilder().addComponents(field);
}

function productCreateModal() {
  return modal('modal:product_create', 'Créer un produit')
    .addComponents(
      input('name', 'Nom du produit', { placeholder: 'Nitro 1 mois' }),
      input('price', 'Prix (€)', { placeholder: '9.99' }),
      input('delivery', 'Livraison: auto ou manual', { placeholder: 'auto', value: 'auto' }),
      input('stock', 'Stock: keys, unlimited ou quantity:50', {
        placeholder: 'keys',
        value: 'keys',
      }),
      input('delivery_content', 'Contenu livré (auto / quantity)', {
        style: TextInputStyle.Paragraph,
        required: false,
        placeholder: 'La clé ou le texte envoyé en MP au client',
      }),
    );
}

function deliveryContentModal(productId, current = '') {
  return modal(`modal:product_content:${productId}`, 'Contenu de livraison')
    .addComponents(
      input('delivery_content', 'Texte / clé envoyé en MP (auto)', {
        style: TextInputStyle.Paragraph,
        required: true,
        value: current || undefined,
        placeholder: 'XXXX-XXXX-XXXX',
      }),
    );
}

function keysModal(productId) {
  return modal(`modal:keys:${productId}`, 'Ajouter des clés')
    .addComponents(
      input('keys', 'Une clé par ligne', {
        style: TextInputStyle.Paragraph,
        placeholder: 'KEY-1\nKEY-2\nKEY-3',
      }),
    );
}

function couponCreateModal() {
  return modal('modal:coupon_create', 'Créer un coupon')
    .addComponents(
      input('code', 'Code', { placeholder: 'WELCOME10' }),
      input('type', 'Type: percent ou fixed', { placeholder: 'percent', value: 'percent' }),
      input('value', 'Valeur (10 = 10% ou 10€)', { placeholder: '10' }),
      input('max_uses', 'Max utilisations (vide = ∞)', { required: false, placeholder: '100' }),
      input('min_amount', 'Montant min (€)', { required: false, placeholder: '0', value: '0' }),
    );
}

function couponCartModal() {
  return modal('modal:cart_coupon', 'Promo code')
    .addComponents(
      input('code', 'Promo code', { placeholder: 'WELCOME10', required: false }),
    );
}

function paypalModal(email = '', me = '') {
  return modal('modal:pay_paypal', 'Config PayPal')
    .addComponents(
      input('email', 'Email PayPal', { required: false, value: email || undefined, placeholder: 'shop@email.com' }),
      input('me', 'Username PayPal.me (sans url)', {
        required: false,
        value: me || undefined,
        placeholder: 'monshop',
      }),
    );
}

function emojiModal() {
  return modal('modal:emoji_set', 'Emoji custom')
    .addComponents(
      input('key', 'Clé emoji (ex: cart, shop, product)', { placeholder: 'cart' }),
      input('value', 'Emoji (unicode ou <:name:id>)', {
        placeholder: '<:panier:1234567890123456789>',
      }),
    );
}

function reviewModal(orderId) {
  return modal(`modal:review:${orderId}`, 'Leave a review')
    .addComponents(
      input('rating', 'Rating /5 (1 to 5)', { placeholder: '5', value: '5' }),
      input('comment', 'Comment', {
        style: TextInputStyle.Paragraph,
        required: false,
        placeholder: 'Fast service, great!',
      }),
    );
}

function manualDeliveryModal(orderId) {
  return modal(`modal:manual_deliver:${orderId}`, 'Manual delivery')
    .addComponents(
      input('payload', 'Content to send to the customer', {
        style: TextInputStyle.Paragraph,
        placeholder: 'Account: user\nPassword: pass',
      }),
    );
}

function recoverCryptoModal() {
  return modal('modal:crypto_recover', 'Récupérer fonds crypto')
    .addComponents(
      input('public_id', 'ID commande (ex: CMD-XXXXXXXX)', {
        placeholder: 'CMD-ABCD1234',
      }),
    );
}

module.exports = {
  productCreateModal,
  deliveryContentModal,
  keysModal,
  couponCreateModal,
  couponCartModal,
  paypalModal,
  emojiModal,
  reviewModal,
  manualDeliveryModal,
  recoverCryptoModal,
};
