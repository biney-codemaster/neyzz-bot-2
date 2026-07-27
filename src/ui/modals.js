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
  return modal('modal:product_create', 'Créer Nitro / produit')
    .addComponents(
      input('name', 'Nom', { placeholder: 'Nitro 1 Month', value: 'Nitro 1 Month' }),
      input('price', 'Prix (€)', { placeholder: '9.99' }),
      input('description', 'Description (optionnel)', {
        required: false,
        placeholder: 'Discord Nitro gift — 1 month',
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
        placeholder: 'https://discord.gift/...',
      }),
    );
}

function keysModal(productId) {
  return modal(`modal:keys:${productId}`, 'Ajouter des liens Nitro')
    .addComponents(
      input('keys', 'Un lien Nitro par ligne', {
        style: TextInputStyle.Paragraph,
        placeholder: 'https://discord.gift/xxxx\nhttps://discord.gift/yyyy',
      }),
    );
}

function productPriceModal(productId, currentPrice = '') {
  return modal(`modal:product_price:${productId}`, 'Changer le prix')
    .addComponents(
      input('price', 'Nouveau prix (€)', {
        placeholder: '9.99',
        value: currentPrice !== '' ? String(currentPrice) : undefined,
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

function buyCouponModal(productId, quantity, currentCode = '') {
  return modal(`modal:buy_coupon:${productId}:${quantity}`, 'Promo code')
    .addComponents(
      input('code', 'Promo code', {
        placeholder: 'WELCOME10',
        required: false,
        value: currentCode || undefined,
      }),
    );
}

function buyQuantityModal(productId, maxQty = 10) {
  return modal(`modal:buy_qty:${productId}`, 'Quantity')
    .addComponents(
      input('quantity', 'How many Nitro links?', {
        placeholder: `1–${Math.min(maxQty, 25)}`,
        value: '1',
      }),
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
  productPriceModal,
  couponCreateModal,
  buyCouponModal,
  buyQuantityModal,
  paypalModal,
  emojiModal,
  reviewModal,
  manualDeliveryModal,
  recoverCryptoModal,
};
