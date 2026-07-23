const products = require('../services/products');
const coupons = require('../services/coupons');
const orders = require('../services/orders');
const reviews = require('../services/reviews');
const payments = require('../services/payments');
const config = require('../config');
const { listEmojiKeys, emoji: em } = require('../emoji');
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

function buildAdminHome() {
  const all = products.listProducts({ activeOnly: false });
  const pending = orders.listOrders({ status: 'awaiting_payment', limit: 50 }).length
    + orders.listOrders({ status: 'pending', limit: 50 }).length;
  const stats = reviews.averageRating();
  const methods = payments.enabledPaymentMethods();

  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('admin')} Dashboard — ${config.shopName}`),
      text('Gère produits, stock, paiements, coupons et commandes depuis Discord.'),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `${emoji('product')} Produits : **${all.length}** (${all.filter((p) => p.active).length} actifs)`,
          `${emoji('pending')} Commandes ouvertes : **${pending}**`,
          `${emoji('star')} Avis : **${stats.average}/5** (${stats.count})`,
          `${emoji('money')} Paiements : ${methods.map((m) => m.label).join(', ') || 'aucun'}`,
        ].join('\n'),
      ),
    );

  return {
    components: [
      c,
      row(
        btn('admin:products', 'Produits', ButtonStyle.Primary, 'product'),
        btn('admin:stock', 'Stock / clés', ButtonStyle.Secondary, 'stock'),
        btn('admin:coupons', 'Coupons', ButtonStyle.Secondary, 'coupon'),
        btn('admin:orders', 'Commandes', ButtonStyle.Secondary, 'invoice'),
      ),
      row(
        btn('admin:payments', 'Paiements', ButtonStyle.Secondary, 'money'),
        btn('admin:emojis', 'Emojis', ButtonStyle.Secondary, 'settings'),
        btn('admin:post_shop', 'Poster la boutique', ButtonStyle.Success, 'shop'),
        btn('admin:refresh', 'Actualiser panel', ButtonStyle.Secondary, 'refresh'),
      ),
    ],
    flags: V2,
  };
}

function buildProductsAdmin() {
  const list = products.listProducts({ activeOnly: false });
  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('product')} Produits`),
      text(
        list.length
          ? list
              .map((p) => {
                const stock =
                  p.stock_mode === 'unlimited' ? '∞' : String(p.available);
                return `${p.active ? emoji('check') : emoji('cross')} **#${p.id} ${p.name}** — ${money(p.price)}\nStock: ${stock} (${p.stock_mode}) · ${p.delivery_type}`;
              })
              .join('\n\n')
          : 'Aucun produit.',
      ),
    );

  const components = [
    c,
    row(
      btn('admin:product_create', 'Créer un produit', ButtonStyle.Success, 'add'),
      btn('admin:home', 'Retour', ButtonStyle.Secondary, 'back'),
    ),
  ];

  if (list.length) {
    components.splice(
      1,
      0,
      select(
        'admin:product_manage',
        'Gérer un produit',
        list.slice(0, 25).map((p) => ({
          label: `#${p.id} ${p.name}`,
          value: String(p.id),
          description: `${money(p.price)} · ${p.active ? 'actif' : 'off'}`,
          emojiKey: 'product',
        })),
      ),
    );
  }

  return { components, flags: V2 };
}

function buildProductManage(product) {
  const contentPreview = product.delivery_content
    ? product.delivery_content.slice(0, 80) + (product.delivery_content.length > 80 ? '…' : '')
    : '_Aucun — pour auto+quantity, définis un contenu ou ajoute des clés_';

  return {
    components: [
      container()
        .addTextDisplayComponents(
          text(`# ${emoji('edit')} #${product.id} ${product.name}`),
          text(
            [
              product.description || '_Pas de description_',
              `${emoji('money')} ${money(product.price)}`,
              `Livraison: **${product.delivery_type}** · Stock: **${product.stock_mode}** (${product.stock_mode === 'unlimited' ? '∞' : product.available})`,
              `Actif: **${product.active ? 'oui' : 'non'}**`,
              `${emoji('key')} Contenu livraison auto: ${contentPreview}`,
            ].join('\n'),
          ),
        ),
      row(
        btn(`admin:product_toggle:${product.id}`, product.active ? 'Désactiver' : 'Activer', ButtonStyle.Primary, 'settings'),
        btn(`admin:product_keys:${product.id}`, 'Ajouter des clés', ButtonStyle.Secondary, 'key'),
        btn(`admin:product_content:${product.id}`, 'Contenu livraison', ButtonStyle.Secondary, 'box'),
      ),
      row(
        btn(`admin:product_delete:${product.id}`, 'Supprimer', ButtonStyle.Danger, 'trash'),
        btn('admin:products', 'Retour produits', ButtonStyle.Secondary, 'back'),
      ),
    ],
    flags: V2,
  };
}

function buildStockAdmin() {
  const list = products.listProducts({ activeOnly: false });
  const components = [
    container().addTextDisplayComponents(
      text(`# ${emoji('stock')} Stock / contenu`),
      text(
        list.length
          ? list
              .map((p) => {
                const stock =
                  p.stock_mode === 'unlimited' ? '∞' : String(p.available);
                const hasContent = p.delivery_content ? 'contenu OK' : 'pas de contenu';
                return `**#${p.id} ${p.name}** — ${p.stock_mode} (${stock}) · ${hasContent}`;
              })
              .join('\n')
          : 'Aucun produit.',
      ),
    ),
  ];

  if (list.length) {
    components.push(
      select(
        'admin:stock_product',
        'Ajouter des clés à…',
        list.slice(0, 25).map((p) => ({
          label: `#${p.id} ${p.name}`,
          value: String(p.id),
          description: `${p.stock_mode} · ${p.available === Infinity ? '∞' : p.available}`,
          emojiKey: 'key',
        })),
      ),
    );
  }

  components.push(row(btn('admin:home', 'Retour', ButtonStyle.Secondary, 'back')));
  return { components, flags: V2 };
}

function buildCouponsAdmin() {
  const list = coupons.listCoupons();
  return {
    components: [
      container().addTextDisplayComponents(
        text(`# ${emoji('coupon')} Coupons`),
        text(
          list.length
            ? list
                .map((c) => {
                  const val =
                    c.type === 'percent' ? `${c.value}%` : money(c.value);
                  return `${c.active ? emoji('check') : emoji('cross')} \`${c.code}\` — ${val} · ${c.used_count}${c.max_uses != null ? `/${c.max_uses}` : ''} uses`;
                })
                .join('\n')
            : 'Aucun coupon.',
        ),
      ),
      row(
        btn('admin:coupon_create', 'Créer un coupon', ButtonStyle.Success, 'add'),
        btn('admin:home', 'Retour', ButtonStyle.Secondary, 'back'),
      ),
    ],
    flags: V2,
  };
}

function buildOrdersAdmin() {
  const list = orders.listOrders({ limit: 15 });
  return {
    components: [
      container().addTextDisplayComponents(
        text(`# ${emoji('invoice')} Dernières commandes`),
        text(
          list.length
            ? list
                .map(
                  (o) =>
                    `**${o.public_id}** — <@${o.user_id}> — ${money(o.total)} — \`${o.status}\``,
                )
                .join('\n')
            : 'Aucune commande.',
        ),
      ),
      row(btn('admin:home', 'Retour', ButtonStyle.Secondary, 'back')),
    ],
    flags: V2,
  };
}

function buildPaymentsAdmin() {
  const { getSetting } = require('../db/database');
  const { isHdConfigured } = require('../services/hdWallet');
  const paymentAddresses = require('../services/paymentAddresses');
  const cryptos = payments.getEnabledCryptos();
  const hdOk = isHdConfigured();
  let hdStats = {};
  try {
    hdStats = paymentAddresses.stats();
  } catch {
    hdStats = {};
  }

  const cryptoLines = hdOk
    ? [
        `${emoji('check')} **HD Wallet Exodus actif** (CRYPTO_MNEMONIC)`,
        `Coins: ${cryptos.map((c) => c.id.toUpperCase()).join(', ') || '—'}`,
        ...Object.entries(hdStats).map(
          ([coin, s]) => `• ${coin.toUpperCase()} — prochain index **#${s.nextIndex}** (${s.addressesUsed} adresses utilisées)`,
        ),
        '',
        '_Chemin BIP44 Exodus LTC : `m/44\'/2\'/0\'/0` → adresses `L…`_',
        '_Chaque paiement = 1 adresse LTC neuve → visible dans ton Exodus (même seed)._',
      ]
    : [
        `${emoji('warn')} HD Wallet **non configuré**`,
        'Ajoute `CRYPTO_MNEMONIC` dans ton `.env` puis relance le bot.',
        'Crypto supportée : **Litecoin (LTC)** uniquement.',
      ];

  return {
    components: [
      container().addTextDisplayComponents(
        text(`# ${emoji('money')} Moyens de paiement`),
        text(
          [
            `${emoji('paypal')} PayPal email: \`${getSetting('paypal_email', config.paypal.email) || '—'}\``,
            `${emoji('paypal')} PayPal.me: \`${getSetting('paypal_me', config.paypal.meUsername) || '—'}\``,
            '',
            `${emoji('crypto')} Crypto:`,
            ...cryptoLines,
          ].join('\n'),
        ),
      ),
      row(
        btn('admin:pay_paypal', 'Config PayPal', ButtonStyle.Primary, 'paypal'),
        btn('admin:home', 'Retour', ButtonStyle.Secondary, 'back'),
      ),
    ],
    flags: V2,
  };
}

function buildEmojisAdmin() {
  const keys = listEmojiKeys();
  const preview = keys
    .slice(0, 30)
    .map((k) => `${em(k)} \`${k}\``)
    .join(' · ');

  return {
    components: [
      container().addTextDisplayComponents(
        text(`# ${emoji('settings')} Emojis`),
        text(
          [
            'Tous les emojis passent par `src/emoji.js`.',
            'Par défaut: Unicode. Tu peux les remplacer par des emojis perso du serveur.',
            '',
            preview,
            '',
            'Pour un custom: édite `CUSTOM` dans `emoji.js` ou utilise le modal.',
          ].join('\n'),
        ),
      ),
      row(
        btn('admin:emoji_set', 'Définir un emoji custom', ButtonStyle.Primary, 'edit'),
        btn('admin:home', 'Retour', ButtonStyle.Secondary, 'back'),
      ),
    ],
    flags: V2,
  };
}

module.exports = {
  buildAdminHome,
  buildProductsAdmin,
  buildProductManage,
  buildStockAdmin,
  buildCouponsAdmin,
  buildOrdersAdmin,
  buildPaymentsAdmin,
  buildEmojisAdmin,
};
