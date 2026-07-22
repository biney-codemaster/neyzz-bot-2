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
      text(`# ${emoji('cart')} Ton panier`),
      text(
        cart.items.length
          ? cart.items
              .map(
                (i) =>
                  `**${i.name}** × ${i.quantity} — ${money(i.lineTotal)}\n_Livraison ${i.delivery_type}_`,
              )
              .join('\n\n')
          : `${emoji('info')} Ton panier est vide. Ajoute des produits depuis la boutique.`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `Sous-total : **${money(cart.subtotal)}**`,
          cart.discount > 0
            ? `Remise${cart.couponCode ? ` (${cart.couponCode})` : ''} : −**${money(cart.discount)}**`
            : cart.couponError
              ? `${emoji('warn')} Coupon : ${cart.couponError}`
              : `${emoji('coupon')} Aucun code promo`,
          `Total : **${money(cart.total)}**`,
        ].join('\n'),
      ),
    );

  const components = [c];

  if (cart.items.length) {
    components.push(
      select(
        'cart:manage_item',
        `${emoji('edit')} Gérer un article`,
        cart.items.map((i) => ({
          label: i.name,
          value: String(i.product_id),
          description: `qté ${i.quantity} · ${money(i.lineTotal)}`,
          emojiKey: 'product',
        })),
      ),
    );
  }

  const methods = payments.enabledPaymentMethods();
  const actionButtons = [
    btn('cart:coupon', 'Code promo', ButtonStyle.Secondary, 'coupon'),
    btn('shop:back', 'Boutique', ButtonStyle.Secondary, 'shop'),
  ];

  if (cart.items.length) {
    actionButtons.unshift(
      btn('cart:clear', 'Vider', ButtonStyle.Danger, 'trash'),
    );
  }

  components.push(row(...actionButtons));

  if (cart.items.length && methods.length) {
    components.push(
      select(
        'cart:pay_method',
        `${emoji('money')} Passer commande — choisir le paiement`,
        methods.map((m) => ({
          label: m.label,
          value: m.id,
          description: `Payer avec ${m.label}`,
          emojiKey: m.emojiKey,
        })),
      ),
    );
  } else if (cart.items.length && !methods.length) {
    components.push(
      container(0xf1c40f).addTextDisplayComponents(
        text(`${emoji('warn')} Aucun moyen de paiement configuré. Contacte un admin.`),
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
        text('Modifie la quantité ou retire cet article.'),
      ),
      row(
        btn(`cart:qty:${productId}:dec`, '−1', ButtonStyle.Secondary, 'remove'),
        btn(`cart:qty:${productId}:inc`, '+1', ButtonStyle.Secondary, 'add'),
        btn(`cart:remove:${productId}`, 'Retirer', ButtonStyle.Danger, 'trash'),
        btn('shop:open_cart', 'Retour panier', ButtonStyle.Primary, 'back'),
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
          text(`${emoji('warn')} Aucune adresse crypto configurée. Contacte un admin.`),
        ),
        row(btn('shop:open_cart', 'Retour panier', ButtonStyle.Secondary, 'back')),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    };
  }

  return {
    components: [
      container().addTextDisplayComponents(
        text(`# ${emoji('crypto')} Choisir la crypto`),
        text('Sélectionne le coin / réseau pour finaliser la commande.'),
      ),
      select(
        `checkout:crypto:${token}`,
        'Choisir une crypto',
        cryptos.map((c) => ({
          label: c.label,
          value: c.id,
          description: c.hd
            ? 'Adresse HD unique générée à la commande'
            : `${String(c.address || '').slice(0, 18)}…`,
          emojiKey: c.emojiKey,
        })),
      ),
      row(btn('shop:open_cart', 'Retour panier', ButtonStyle.Secondary, 'back')),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

module.exports = {
  buildCartPanel,
  buildItemManagePanel,
  buildCryptoSelect,
};
