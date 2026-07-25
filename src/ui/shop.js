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

function buildShopPanel() {
  const list = products.listProducts({ activeOnly: true });
  const stats = reviews.averageRating();

  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('shop')} ${config.shopName}`),
      text(
        [
          'Welcome to the shop.',
          'Pick a product from the menu, add it to your cart, then checkout.',
          stats.count
            ? `${emoji('star')} Average rating: **${stats.average}/5** (${stats.count} reviews)`
            : `${emoji('review')} Be the first to leave a review after your purchase.`,
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        list.length
          ? list
              .slice(0, 15)
              .map((p) => {
                const stock =
                  p.stock_mode === 'unlimited'
                    ? '∞'
                    : String(p.available);
                const delivery =
                  p.delivery_type === 'auto'
                    ? `${emoji('auto')} Auto`
                    : `${emoji('manual')} Manual`;
                return `**${p.name}** — ${money(p.price)}\n${emoji('stock')} Stock: ${stock} · ${delivery}\n${p.description || '_No description_'}`;
              })
              .join('\n\n')
          : `${emoji('warn')} No products available right now.`,
      ),
    );

  const components = [c];

  if (list.length) {
    components.push(
      select(
        'shop:select_product',
        `${emoji('product')} Choose a product`,
        list.slice(0, 25).map((p) => ({
          label: p.name,
          value: String(p.id),
          description: `${money(p.price)} · stock ${p.stock_mode === 'unlimited' ? '∞' : p.available}`,
          emojiKey: 'product',
        })),
      ),
    );
  }

  components.push(
    row(btn('shop:open_cart', 'My cart', ButtonStyle.Primary, 'cart')),
  );

  return { components, flags: V2 };
}

function buildProductDetail(product) {
  const stock =
    product.stock_mode === 'unlimited' ? 'Unlimited' : String(product.available);
  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('product')} ${product.name}`),
      text(product.description || '_No description_'),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `${emoji('money')} Price: **${money(product.price)}**`,
          `${emoji('stock')} Stock: **${stock}**`,
          `${emoji('delivery')} Delivery: **${product.delivery_type === 'auto' ? 'Automatic' : 'Manual'}**`,
        ].join('\n'),
      ),
    );

  return {
    components: [
      c,
      row(
        btn(`shop:add:${product.id}:1`, 'Add ×1', ButtonStyle.Success, 'add'),
        btn(`shop:add:${product.id}:2`, 'Add ×2', ButtonStyle.Secondary, 'add'),
        btn(`shop:add:${product.id}:5`, 'Add ×5', ButtonStyle.Secondary, 'add'),
        btn('shop:open_cart', 'View cart', ButtonStyle.Primary, 'cart'),
      ),
      row(btn('shop:back', 'Back to shop', ButtonStyle.Secondary, 'back')),
    ],
    flags: V2,
  };
}

module.exports = {
  buildShopPanel,
  buildProductDetail,
};
