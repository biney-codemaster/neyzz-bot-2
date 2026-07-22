const cart = require('../services/cart');
const products = require('../services/products');
const orders = require('../services/orders');
const reviews = require('../services/reviews');
const { setSetting, getSetting, getSettingsPrefix } = require('../db/database');
const { setCustomEmoji, loadCustomEmojis } = require('../emoji');
const { isAdmin, isStaff, parseQuantity } = require('../utils/helpers');
const { createOrderChannel, refreshOrderPanel, logShop } = require('../services/channels');
const { deliverToUser } = require('../services/delivery');
const { buildShopPanel, buildProductDetail } = require('../ui/shop');
const { buildCartPanel, buildItemManagePanel, buildCryptoSelect } = require('../ui/cart');
const {
  buildAdminHome,
  buildProductsAdmin,
  buildProductManage,
  buildStockAdmin,
  buildCouponsAdmin,
  buildOrdersAdmin,
  buildPaymentsAdmin,
  buildEmojisAdmin,
} = require('../ui/admin');
const modals = require('../ui/modals');
const coupons = require('../services/coupons');
const config = require('../config');
const { V2, text, container, emoji } = require('../ui/v2');
const { MessageFlags } = require('discord.js');

function ephemeralV2(components) {
  return {
    components,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

function notice(msg, accent = config.accentColor) {
  return ephemeralV2([container(accent).addTextDisplayComponents(text(msg))]);
}

function isEphemeralMessage(interaction) {
  try {
    return Boolean(interaction.message?.flags?.has?.(MessageFlags.Ephemeral));
  } catch {
    return false;
  }
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }

  // Ne jamais écraser le panel boutique public avec un panier / détail perso
  const ephemeralMsg = isEphemeralMessage(interaction);
  if (interaction.isMessageComponent() && ephemeralMsg) {
    try {
      return await interaction.update(payload);
    } catch {
      /* fall through */
    }
  }

  const flags = (payload.flags || V2) | MessageFlags.Ephemeral;
  return interaction.reply({ ...payload, flags });
}

async function handleButton(interaction) {
  const id = interaction.customId;

  if (id === 'shop:refresh') {
    // Actualise le panel public (ou éphémère)
    try {
      return await interaction.update(buildShopPanel());
    } catch {
      return interaction.reply({
        ...buildShopPanel(),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  }
  if (id === 'shop:back') {
    return safeUpdate(interaction, buildShopPanel());
  }
  if (id === 'shop:open_cart') {
    const c = cart.getCart(interaction.user.id);
    return safeUpdate(interaction, buildCartPanel(c));
  }

  if (id.startsWith('shop:add:')) {
    const [, , productId, qtyRaw] = id.split(':');
    try {
      const c = cart.addToCart(interaction.user.id, Number(productId), parseQuantity(qtyRaw, 1));
      return interaction.reply(notice(`${emoji('check')} Ajouté au panier.\nTotal: **${c.total.toFixed(2)} ${config.currencySymbol}**`));
    } catch (e) {
      return interaction.reply(notice(`${emoji('cross')} ${e.message}`, config.dangerColor));
    }
  }

  if (id === 'cart:clear') {
    cart.clearCart(interaction.user.id);
    return safeUpdate(interaction, buildCartPanel(cart.getCart(interaction.user.id)));
  }
  if (id === 'cart:coupon') {
    return interaction.showModal(modals.couponCartModal());
  }
  if (id.startsWith('cart:qty:')) {
    const [, , productId, dir] = id.split(':');
    const c = cart.getCart(interaction.user.id);
    const item = c.items.find((i) => String(i.product_id) === productId);
    if (!item) return interaction.reply(notice('Article introuvable.', config.dangerColor));
    const next = dir === 'inc' ? item.quantity + 1 : item.quantity - 1;
    try {
      cart.setItemQuantity(interaction.user.id, Number(productId), next);
      return safeUpdate(interaction, buildCartPanel(cart.getCart(interaction.user.id)));
    } catch (e) {
      return interaction.reply(notice(`${emoji('cross')} ${e.message}`, config.dangerColor));
    }
  }
  if (id.startsWith('cart:remove:')) {
    const productId = Number(id.split(':')[2]);
    cart.removeFromCart(interaction.user.id, productId);
    return safeUpdate(interaction, buildCartPanel(cart.getCart(interaction.user.id)));
  }

  // Orders — customer
  if (id.startsWith('order:paid:')) {
    const orderId = Number(id.split(':')[2]);
    const order = orders.getOrder(orderId);
    if (!order || order.user_id !== interaction.user.id) {
      return interaction.reply(notice('Commande introuvable.', config.dangerColor));
    }
    await logShop(
      interaction.client,
      `${emoji('pending')} <@${interaction.user.id}> signale un paiement pour **${order.public_id}** (${order.payment_method}).`,
    );
    await interaction.reply(
      notice(`${emoji('check')} Signalement envoyé. Un staff va vérifier ton paiement.`),
    );
    await interaction.channel.send({
      components: [
        container(config.warnColor).addTextDisplayComponents(
          text(`${emoji('staff')} <@${interaction.user.id}> a cliqué sur **J'ai payé** pour \`${order.public_id}\`.`),
        ),
      ],
      flags: V2,
    });
    return;
  }

  if (id.startsWith('order:cancel:')) {
    const orderId = Number(id.split(':')[2]);
    const order = orders.getOrder(orderId);
    if (!order || order.user_id !== interaction.user.id) {
      return interaction.reply(notice('Commande introuvable.', config.dangerColor));
    }
    try {
      orders.cancelOrder(orderId, 'Annulée par le client');
      await interaction.reply(notice(`${emoji('check')} Commande annulée.`));
      await refreshOrderPanel(interaction.channel, orderId);
    } catch (e) {
      return interaction.reply(notice(`${emoji('cross')} ${e.message}`, config.dangerColor));
    }
    return;
  }

  if (id.startsWith('order:review:')) {
    const orderId = Number(id.split(':')[2]);
    const order = orders.getOrder(orderId);
    if (!order || order.user_id !== interaction.user.id) {
      return interaction.reply(notice('Commande introuvable.', config.dangerColor));
    }
    if (reviews.getReviewByOrder(orderId)) {
      return interaction.reply(notice('Tu as déjà laissé un avis pour cette commande.'));
    }
    return interaction.showModal(modals.reviewModal(orderId));
  }

  // Staff
  if (id.startsWith('staff:')) {
    if (!isStaff(interaction.member)) {
      return interaction.reply(notice('Réservé au staff.', config.dangerColor));
    }
    const [, action, orderIdRaw] = id.split(':');
    const orderId = Number(orderIdRaw);

    if (action === 'confirm_pay') {
      const current = orders.getOrder(orderId);
      if (!current) return interaction.reply(notice('Commande introuvable.', config.dangerColor));
      if (!['pending', 'awaiting_payment'].includes(current.status)) {
        return interaction.reply(
          notice(`${emoji('warn')} Paiement déjà traité (statut: \`${current.status}\`).`, config.warnColor),
        );
      }
      const order = orders.markPaid(orderId);
      await interaction.reply(
        notice(
          `${emoji('check')} Paiement confirmé pour **${order.public_id}**.\nUtilise **Livrer (MP)** pour envoyer le produit.`,
        ),
      );
      await logShop(
        interaction.client,
        `${emoji('money')} ${order.public_id} paiement confirmé par <@${interaction.user.id}> (pas encore livré)`,
      );
      await refreshOrderPanel(interaction.channel, orderId);
      return;
    }

    if (action === 'deliver') {
      const order = orders.getOrder(orderId);
      if (!order) return interaction.reply(notice('Commande introuvable.', config.dangerColor));
      if (order.status === 'delivered') {
        return interaction.reply(notice(`${emoji('warn')} Déjà livrée.`, config.warnColor));
      }
      if (!['paid', 'partial'].includes(order.status)) {
        return interaction.reply(
          notice(
            `${emoji('warn')} Confirme d'abord le paiement avant de livrer (statut: \`${order.status}\`).`,
            config.warnColor,
          ),
        );
      }
      const hasManual = order.items.some((i) => i.delivery_type === 'manual' && !i.delivered_payload);
      if (hasManual) {
        return interaction.showModal(modals.manualDeliveryModal(orderId));
      }
      try {
        await deliverToUser(interaction.client, orderId);
        await interaction.reply(notice(`${emoji('check')} Livraison envoyée en MP.`));
        await logShop(
          interaction.client,
          `${emoji('delivery')} ${order.public_id} livrée en DM par <@${interaction.user.id}>`,
        );
        await refreshOrderPanel(interaction.channel, orderId);
      } catch (e) {
        return interaction.reply(notice(`${emoji('cross')} ${e.message}`, config.dangerColor));
      }
      return;
    }

    if (action === 'cancel') {
      try {
        orders.cancelOrder(orderId, `Annulée par staff ${interaction.user.tag}`);
        await interaction.reply(notice('Commande annulée.'));
        await refreshOrderPanel(interaction.channel, orderId);
      } catch (e) {
        return interaction.reply(notice(`${emoji('cross')} ${e.message}`, config.dangerColor));
      }
      return;
    }
  }

  // Admin dashboard
  if (id.startsWith('admin:')) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply(notice('Réservé aux admins.', config.dangerColor));
    }
    return handleAdminButton(interaction);
  }
}

async function handleAdminButton(interaction) {
  const id = interaction.customId;

  async function adminUpdate(payload) {
    if (isEphemeralMessage(interaction)) {
      try {
        return await interaction.update(payload);
      } catch {
        /* fall through */
      }
    }
    return interaction.reply({
      ...payload,
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (id === 'admin:home' || id === 'admin:refresh') {
    return adminUpdate(buildAdminHome());
  }
  if (id === 'admin:products') return adminUpdate(buildProductsAdmin());
  if (id === 'admin:stock') return adminUpdate(buildStockAdmin());
  if (id === 'admin:coupons') return adminUpdate(buildCouponsAdmin());
  if (id === 'admin:orders') return adminUpdate(buildOrdersAdmin());
  if (id === 'admin:payments') return adminUpdate(buildPaymentsAdmin());
  if (id === 'admin:emojis') return adminUpdate(buildEmojisAdmin());

  if (id === 'admin:product_create') {
    return interaction.showModal(modals.productCreateModal());
  }
  if (id === 'admin:coupon_create') {
    return interaction.showModal(modals.couponCreateModal());
  }
  if (id === 'admin:pay_paypal') {
    return interaction.showModal(
      modals.paypalModal(
        getSetting('paypal_email', config.paypal.email),
        getSetting('paypal_me', config.paypal.meUsername),
      ),
    );
  }
  if (id === 'admin:pay_crypto') {
    return interaction.showModal(modals.cryptoModal());
  }
  if (id === 'admin:emoji_set') {
    return interaction.showModal(modals.emojiModal());
  }

  if (id === 'admin:post_shop') {
    const panel = buildShopPanel();
    const channel = interaction.channel;
    await channel.send(panel);
    return interaction.reply(notice(`${emoji('check')} Boutique postée dans ${channel}.`));
  }

  if (id.startsWith('admin:product_toggle:')) {
    const productId = Number(id.split(':')[2]);
    const p = products.getProduct(productId);
    products.updateProduct(productId, { active: p.active ? 0 : 1 });
    return adminUpdate(buildProductManage(products.getProduct(productId)));
  }
  if (id.startsWith('admin:product_keys:')) {
    const productId = Number(id.split(':')[2]);
    return interaction.showModal(modals.keysModal(productId));
  }
  if (id.startsWith('admin:product_content:')) {
    const productId = Number(id.split(':')[2]);
    const p = products.getProduct(productId);
    return interaction.showModal(modals.deliveryContentModal(productId, p?.delivery_content || ''));
  }
  if (id.startsWith('admin:product_delete:')) {
    const productId = Number(id.split(':')[2]);
    products.deleteProduct(productId);
    return adminUpdate(buildProductsAdmin());
  }
}

async function handleSelect(interaction) {
  const id = interaction.customId;
  const value = interaction.values[0];

  if (id === 'shop:select_product') {
    const product = products.getProduct(Number(value));
    if (!product) return interaction.reply(notice('Produit introuvable.', config.dangerColor));
    return safeUpdate(interaction, buildProductDetail(product));
  }

  if (id === 'cart:manage_item') {
    const product = products.getProduct(Number(value));
    return safeUpdate(interaction, buildItemManagePanel(value, product?.name || 'Article'));
  }

  if (id === 'cart:pay_method') {
    try {
      if (value === 'crypto') {
        return interaction.reply(buildCryptoSelect('pending'));
      }

      const order = orders.createOrderFromCart(interaction.user, value, null);
      const channel = await createOrderChannel(interaction.guild, interaction.user, order);
      await logShop(
        interaction.client,
        `${emoji('invoice')} Nouvelle commande **${order.public_id}** — <@${interaction.user.id}> — ${order.total.toFixed(2)}€ — ${value}`,
      );
      return interaction.reply(
        notice(`${emoji('check')} Commande **${order.public_id}** créée.\nSalon: ${channel}`),
      );
    } catch (e) {
      return interaction.reply(notice(`${emoji('cross')} ${e.message}`, config.dangerColor));
    }
  }

  if (id === 'checkout:crypto:pending' || id.startsWith('checkout:crypto:')) {
    try {
      const order = orders.createOrderFromCart(interaction.user, 'crypto', value);
      const channel = await createOrderChannel(interaction.guild, interaction.user, order);
      await logShop(
        interaction.client,
        `${emoji('invoice')} **${order.public_id}** crypto=${value} — <@${interaction.user.id}> — ${order.total.toFixed(2)}€`,
      );
      return interaction.reply(
        notice(
          `${emoji('check')} Commande **${order.public_id}** créée (${value.toUpperCase()}).\nSalon: ${channel}`,
        ),
      );
    } catch (e) {
      return interaction.reply(notice(`${emoji('cross')} ${e.message}`, config.dangerColor));
    }
  }

  if (!isAdmin(interaction.member) && id.startsWith('admin:')) {
    return interaction.reply(notice('Réservé aux admins.', config.dangerColor));
  }

  if (id === 'admin:product_manage') {
    const product = products.getProduct(Number(value));
    return safeUpdate(interaction, buildProductManage(product));
  }
  if (id === 'admin:stock_product') {
    return interaction.showModal(modals.keysModal(Number(value)));
  }
}

async function handleModal(interaction) {
  const id = interaction.customId;

  if (id === 'modal:cart_coupon') {
    const code = interaction.fields.getTextInputValue('code').trim();
    try {
      const c = cart.setCoupon(interaction.user.id, code || null);
      return interaction.reply({
        ...buildCartPanel(c),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    } catch (e) {
      return interaction.reply(notice(`${emoji('cross')} ${e.message}`, config.dangerColor));
    }
  }

  if (id === 'modal:product_create') {
    if (!isAdmin(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    const name = interaction.fields.getTextInputValue('name').trim();
    const price = Number(interaction.fields.getTextInputValue('price').replace(',', '.'));
    const delivery = interaction.fields.getTextInputValue('delivery').trim().toLowerCase();
    const stockRaw = interaction.fields.getTextInputValue('stock').trim().toLowerCase();
    const deliveryContent = interaction.fields.getTextInputValue('delivery_content').trim();

    if (!name || !Number.isFinite(price) || price < 0) {
      return interaction.reply(notice('Nom / prix invalide.', config.dangerColor));
    }
    if (!['auto', 'manual'].includes(delivery)) {
      return interaction.reply(notice('Livraison doit être auto ou manual.', config.dangerColor));
    }

    let stockMode = 'keys';
    let quantity = 0;
    if (stockRaw.startsWith('quantity')) {
      stockMode = 'quantity';
      const q = Number(stockRaw.split(':')[1]);
      quantity = Number.isFinite(q) ? q : 0;
    } else if (stockRaw === 'unlimited') {
      stockMode = 'unlimited';
    } else {
      stockMode = 'keys';
    }

    if (delivery === 'auto' && stockMode !== 'keys' && !deliveryContent) {
      return interaction.reply(
        notice(
          `${emoji('warn')} Pour auto + quantity/unlimited, indique un **contenu de livraison** (la clé/texte envoyé en MP).`,
          config.warnColor,
        ),
      );
    }

    const product = products.createProduct({
      name,
      description: '',
      price,
      deliveryType: delivery,
      stockMode,
      quantity,
      deliveryContent,
    });
    return interaction.reply({
      ...buildProductManage(product),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (id.startsWith('modal:product_content:')) {
    if (!isAdmin(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    const productId = Number(id.split(':')[3]);
    const deliveryContent = interaction.fields.getTextInputValue('delivery_content').trim();
    const product = products.updateProduct(productId, { delivery_content: deliveryContent });
    return interaction.reply({
      ...buildProductManage(product),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (id.startsWith('modal:keys:')) {
    if (!isAdmin(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    const productId = Number(id.split(':')[2]);
    const keys = interaction.fields
      .getTextInputValue('keys')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const available = products.addKeys(productId, keys);
    return interaction.reply(
      notice(`${emoji('check')} ${keys.length} clé(s) ajoutée(s). Stock libre: **${available}**.`),
    );
  }

  if (id === 'modal:coupon_create') {
    if (!isAdmin(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    const code = interaction.fields.getTextInputValue('code').trim();
    const type = interaction.fields.getTextInputValue('type').trim().toLowerCase();
    const value = Number(interaction.fields.getTextInputValue('value').replace(',', '.'));
    const maxUsesRaw = interaction.fields.getTextInputValue('max_uses').trim();
    const minAmount = Number(interaction.fields.getTextInputValue('min_amount').replace(',', '.') || 0);

    if (!['percent', 'fixed'].includes(type) || !Number.isFinite(value)) {
      return interaction.reply(notice('Type/valeur invalide.', config.dangerColor));
    }
    coupons.createCoupon({
      code,
      type,
      value,
      maxUses: maxUsesRaw ? Number(maxUsesRaw) : null,
      minAmount,
    });
    return interaction.reply({
      ...buildCouponsAdmin(),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (id === 'modal:pay_paypal') {
    if (!isAdmin(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    setSetting('paypal_email', interaction.fields.getTextInputValue('email').trim());
    setSetting('paypal_me', interaction.fields.getTextInputValue('me').trim());
    return interaction.reply({
      ...buildPaymentsAdmin(),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (id === 'modal:pay_crypto') {
    if (!isAdmin(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    setSetting('crypto_btc', interaction.fields.getTextInputValue('btc').trim());
    setSetting('crypto_eth', interaction.fields.getTextInputValue('eth').trim());
    setSetting('crypto_ltc', interaction.fields.getTextInputValue('ltc').trim());
    setSetting('crypto_usdt', interaction.fields.getTextInputValue('usdt').trim());
    return interaction.reply({
      ...buildPaymentsAdmin(),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (id === 'modal:emoji_set') {
    if (!isAdmin(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    const key = interaction.fields.getTextInputValue('key').trim();
    const value = interaction.fields.getTextInputValue('value').trim();
    setCustomEmoji(key, value);
    setSetting(`emoji_${key}`, value);
    return interaction.reply(
      notice(`${emoji('check')} Emoji \`${key}\` → ${value}\nRecharge les panels pour voir le changement.`),
    );
  }

  if (id.startsWith('modal:review:')) {
    const orderId = Number(id.split(':')[2]);
    const order = orders.getOrder(orderId);
    if (!order || order.user_id !== interaction.user.id) {
      return interaction.reply(notice('Commande introuvable.', config.dangerColor));
    }
    const rating = Number(interaction.fields.getTextInputValue('rating'));
    const comment = interaction.fields.getTextInputValue('comment').trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return interaction.reply(notice('Note invalide (1-5).', config.dangerColor));
    }
    reviews.createReview({ orderId, userId: interaction.user.id, rating, comment });
    if (config.reviewsChannelId) {
      try {
        const ch = await interaction.client.channels.fetch(config.reviewsChannelId);
        await ch.send({
          components: [
            container(config.successColor).addTextDisplayComponents(
              text(
                `# ${emoji('star')} Nouvel avis\n**${order.public_id}** — <@${interaction.user.id}>\nNote: **${rating}/5**\n${comment || '_Pas de commentaire_'}`,
              ),
            ),
          ],
          flags: V2,
        });
      } catch {
        /* ignore */
      }
    }
    return interaction.reply(notice(`${emoji('star')} Merci pour ton avis !`));
  }

  if (id.startsWith('modal:manual_deliver:')) {
    if (!isStaff(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    const orderId = Number(id.split(':')[2]);
    const payload = interaction.fields.getTextInputValue('payload').trim();
    let order = orders.getOrder(orderId);
    if (!order) return interaction.reply(notice('Commande introuvable.', config.dangerColor));
    if (['pending', 'awaiting_payment'].includes(order.status)) {
      orders.markPaid(orderId);
    }
    for (const item of order.items) {
      if (item.delivery_type === 'manual') {
        orders.setItemDelivery(item.id, payload);
      }
    }
    try {
      await deliverToUser(interaction.client, orderId);
      await interaction.reply(notice(`${emoji('check')} Livraison manuelle envoyée en MP.`));
      await refreshOrderPanel(interaction.channel, orderId);
    } catch (e) {
      return interaction.reply(notice(`${emoji('cross')} ${e.message}`, config.dangerColor));
    }
  }
}

function reloadEmojisFromDb() {
  const map = getSettingsPrefix('emoji_');
  const normalized = {};
  for (const [k, v] of Object.entries(map)) {
    normalized[k.replace(/^emoji_/, '')] = v;
  }
  loadCustomEmojis(normalized);
}

module.exports = {
  handleButton,
  handleSelect,
  handleModal,
  reloadEmojisFromDb,
  notice,
};
