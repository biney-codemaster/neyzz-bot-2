const {
  V2,
  text,
  separator,
  btn,
  select,
  row,
  container,
  ButtonStyle,
  money,
  emoji,
} = require('./v2');
const payments = require('../services/payments');
const { MessageFlags } = require('discord.js');

function buildCartPanel(cart) {
  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('cart')} Your cart`),
      text(
        cart.items.length
          ? cart.items
              .map(
                (i) =>
                  `**${i.name}** × ${i.quantity} — ${money(i.lineTotal)}\n_Delivery: ${i.delivery_type}_`,
              )
              .join('\n\n')
          : `${emoji('info')} Your cart is empty. Add products from the shop.`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `Subtotal: **${money(cart.subtotal)}**`,
          cart.discount > 0
            ? `Discount${cart.couponCode ? ` (${cart.couponCode})` : ''}: −**${money(cart.discount)}**`
            : cart.couponError
              ? `${emoji('warn')} Coupon: ${cart.couponError}`
              : `${emoji('coupon')} No promo code`,
          `Total: **${money(cart.total)}**`,
        ].join('\n'),
      ),
    );

  const components = [c];

  if (cart.items.length) {
    components.push(
      select(
        'cart:manage_item',
        `${emoji('edit')} Manage an item`,
        cart.items.map((i) => ({
          label: i.name,
          value: String(i.product_id),
          description: `qty ${i.quantity} · ${money(i.lineTotal)}`,
          emojiKey: 'product',
        })),
      ),
    );
  }

  const methods = payments.enabledPaymentMethods();
  const actionButtons = [
    btn('cart:coupon', 'Promo code', ButtonStyle.Secondary, 'coupon'),
    btn('shop:back', 'Shop', ButtonStyle.Secondary, 'shop'),
  ];

  if (cart.items.length) {
    actionButtons.unshift(
      btn('cart:clear', 'Clear', ButtonStyle.Danger, 'trash'),
    );
  }

  components.push(row(...actionButtons));

  if (cart.items.length && methods.length) {
    components.push(
      select(
        'cart:pay_method',
        `${emoji('money')} Checkout — choose payment`,
        methods.map((m) => ({
          label: m.label,
          value: m.id,
          description: `Pay with ${m.label}`,
          emojiKey: m.emojiKey,
        })),
      ),
    );
  } else if (cart.items.length && !methods.length) {
    components.push(
      container(0xf1c40f).addTextDisplayComponents(
        text(`${emoji('warn')} No payment method configured. Contact an admin.`),
      ),
    );
  }

  return { components, flags: V2 };
}

function buildItemManagePanel(productId, name) {
  return {
    components: [
      container().addTextDisplayComponents(
        text(`# ${emoji('edit')} ${name}`),
        text('Change the quantity or remove this item.'),
      ),
      row(
        btn(`cart:qty:${productId}:dec`, '−1', ButtonStyle.Secondary, 'remove'),
        btn(`cart:qty:${productId}:inc`, '+1', ButtonStyle.Secondary, 'add'),
        btn(`cart:remove:${productId}`, 'Remove', ButtonStyle.Danger, 'trash'),
        btn('shop:open_cart', 'Back to cart', ButtonStyle.Primary, 'back'),
      ),
    ],
    flags: V2,
  };
}

function buildCryptoSelect(token = 'pending') {
  const cryptos = payments.getEnabledCryptos();
  if (!cryptos.length) {
    return {
      components: [
        container(0xf1c40f).addTextDisplayComponents(
          text(`${emoji('warn')} No crypto configured. Contact an admin.`),
        ),
        row(btn('shop:open_cart', 'Back to cart', ButtonStyle.Secondary, 'back')),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    };
  }

  return {
    components: [
      container().addTextDisplayComponents(
        text(`# ${emoji('crypto')} Choose crypto`),
        text('Select the coin / network to complete your order.'),
      ),
      select(
        `checkout:crypto:${token}`,
        'Choose a crypto',
        cryptos.map((c) => ({
          label: c.label,
          value: c.id,
          description: c.hd
            ? 'Unique HD address generated per order'
            : `${String(c.address || '').slice(0, 18)}…`,
          emojiKey: c.emojiKey,
        })),
      ),
      row(btn('shop:open_cart', 'Back to cart', ButtonStyle.Secondary, 'back')),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

module.exports = {
  buildCartPanel,
  buildItemManagePanel,
  buildCryptoSelect,
};
