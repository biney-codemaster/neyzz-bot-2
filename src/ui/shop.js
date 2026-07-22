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
          'Bienvenue dans la boutique.',
          'Choisis un produit dans le menu, ajoute-le au panier, puis passe commande.',
          stats.count
            ? `${emoji('star')} Note moyenne : **${stats.average}/5** (${stats.count} avis)`
            : `${emoji('review')} Sois le premier à laisser un avis après ton achat.`,
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
                    : `${emoji('manual')} Manuel`;
                return `**${p.name}** — ${money(p.price)}\n${emoji('stock')} Stock: ${stock} · ${delivery}\n${p.description || '_Aucune description_'}`;
              })
              .join('\n\n')
          : `${emoji('warn')} Aucun produit disponible pour le moment.`,
      ),
    );

  const components = [c];

  if (list.length) {
    components.push(
      select(
        'shop:select_product',
        `${emoji('product')} Choisir un produit`,
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
    row(
      btn('shop:open_cart', 'Mon panier', ButtonStyle.Primary, 'cart'),
      btn('shop:refresh', 'Actualiser', ButtonStyle.Secondary, 'refresh'),
    ),
  );

  return { components, flags: V2 };
}

function buildProductDetail(product) {
  const stock =
    product.stock_mode === 'unlimited' ? 'Illimité' : String(product.available);
  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('product')} ${product.name}`),
      text(product.description || '_Aucune description_'),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `${emoji('money')} Prix : **${money(product.price)}**`,
          `${emoji('stock')} Stock : **${stock}**`,
          `${emoji('delivery')} Livraison : **${product.delivery_type === 'auto' ? 'Automatique' : 'Manuelle'}**`,
        ].join('\n'),
      ),
    );

  return {
    components: [
      c,
      row(
        btn(`shop:add:${product.id}:1`, 'Ajouter ×1', ButtonStyle.Success, 'add'),
        btn(`shop:add:${product.id}:2`, 'Ajouter ×2', ButtonStyle.Secondary, 'add'),
        btn(`shop:add:${product.id}:5`, 'Ajouter ×5', ButtonStyle.Secondary, 'add'),
        btn('shop:open_cart', 'Voir panier', ButtonStyle.Primary, 'cart'),
      ),
      row(btn('shop:back', 'Retour boutique', ButtonStyle.Secondary, 'back')),
    ],
    flags: V2,
  };
}

module.exports = {
  buildShopPanel,
  buildProductDetail,
};
