const products = require('../services/products');
const reviews = require('../services/reviews');
const config = require('../config');
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

function buildShopPanel() {
  const list = products.listProducts({ activeOnly: true });
  const stats = reviews.averageRating();
  const nitro = list[0] || null;

  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('shop')} ${config.shopName}`),
      text(
        [
          '**Discord Nitro — 1 Month**',
          'Instant delivery by DM after payment.',
          stats.count
            ? `${emoji('star')} ${stats.average}/5 · ${stats.count} reviews`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    );

  if (nitro) {
    const stock =
      nitro.stock_mode === 'unlimited' ? '∞' : String(nitro.available);
    c.addSeparatorComponents(separator()).addTextDisplayComponents(
      text(
        [
          `**${nitro.name}** — ${money(nitro.price)}`,
          `${emoji('stock')} In stock: **${stock}**`,
          nitro.description ? nitro.description : '_Gift link delivered instantly._',
        ].join('\n'),
      ),
    );
  } else {
    c.addSeparatorComponents(separator()).addTextDisplayComponents(
      text(`${emoji('warn')} Nitro is currently unavailable.`),
    );
  }

  const components = [c];

  if (nitro && nitro.available > 0) {
    components.push(
      row(btn(`shop:buy:${nitro.id}`, 'Buy Nitro', ButtonStyle.Success, 'success')),
    );
  }

  // Extra active products (if admin added more)
  if (list.length > 1) {
    components.push(
      select(
        'shop:select_product',
        'Other options',
        list.slice(0, 25).map((p) => ({
          label: p.name,
          value: String(p.id),
          description: `${money(p.price)} · stock ${p.stock_mode === 'unlimited' ? '∞' : p.available}`,
          emojiKey: 'product',
        })),
      ),
    );
  }

  return { components, flags: V2 };
}

function buildProductDetail(product) {
  const stock =
    product.stock_mode === 'unlimited' ? 'Unlimited' : String(product.available);
  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('product')} ${product.name}`),
      text(product.description || '_Gift link delivered by DM._'),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `${emoji('money')} **${money(product.price)}** each`,
          `${emoji('stock')} Stock: **${stock}**`,
        ].join('\n'),
      ),
    );

  const canBuy = product.active && (product.stock_mode === 'unlimited' || product.available > 0);

  return {
    components: [
      c,
      row(
        ...(canBuy
          ? [btn(`shop:buy:${product.id}`, 'Buy', ButtonStyle.Success, 'success')]
          : []),
        btn('shop:back', 'Back', ButtonStyle.Secondary, 'back'),
      ),
    ],
    flags: V2,
  };
}

function buildBuyConfirm({ product, quantity, total }) {
  const methods = payments.enabledPaymentMethods();
  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('invoice')} Confirm order`),
      text(
        [
          `**${product.name}** × **${quantity}**`,
          `${emoji('money')} Total: **${money(total)}**`,
          '',
          'Choose a payment method to continue.',
        ].join('\n'),
      ),
    );

  const components = [c];

  if (methods.length) {
    components.push(
      select(
        `buy:checkout:${product.id}:${quantity}`,
        `${emoji('money')} Pay with…`,
        methods.map((m) => ({
          label: m.label,
          value: m.id,
          description: `Pay ${money(total)} via ${m.label}`,
          emojiKey: m.emojiKey,
        })),
      ),
    );
  } else {
    components.push(
      container(config.warnColor).addTextDisplayComponents(
        text(`${emoji('warn')} No payment method configured.`),
      ),
    );
  }

  components.push(
    row(btn('shop:back', 'Cancel', ButtonStyle.Secondary, 'cross')),
  );

  return {
    components,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

module.exports = {
  buildShopPanel,
  buildProductDetail,
  buildBuyConfirm,
};
