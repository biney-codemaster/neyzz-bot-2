const products = require('../services/products');
const orders = require('../services/orders');
const reviews = require('../services/reviews');
const { setSetting, getSetting, getSettingsPrefix } = require('../db/database');
const { setCustomEmoji, loadCustomEmojis } = require('../emoji');
const { isAdmin, parseQuantity } = require('../utils/helpers');
const { createOrderChannel, refreshOrderPanel, logShop } = require('../services/channels');
const { deliverToUser } = require('../services/delivery');
const { closeOrderWithTranscript } = require('../services/transcript');
const shopPanels = require('../services/shopPanels');
const giveaways = require('../services/giveaways');
const giveawayRunner = require('../services/giveawayRunner');
const { buildShopPanel, buildProductDetail, buildBuyConfirm } = require('../ui/shop');

async function bumpShop(client) {
  try {
    await shopPanels.refreshAllShopPanels(client);
  } catch (e) {
    console.warn('[shop-panels]', e.message);
  }
}
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

  if (id.startsWith('giveaway:join:') || id.startsWith('giveaway:leave:')) {
    const giveawayId = Number(id.split(':')[2]);
    const g = giveaways.getGiveaway(giveawayId);
    if (!g || g.status !== 'running') {
      return interaction.reply(
        notice(`${emoji('cross')} This giveaway has ended or was not found.`, config.dangerColor),
      );
    }

    if (id.startsWith('giveaway:join:')) {
      const member = interaction.member
        || (await giveawayRunner.fetchMemberSafe(interaction.guild, interaction.user.id));
      const check = giveawayRunner.checkEligibility(g, member);
      if (!check.ok) {
        return interaction.reply(notice(`${emoji('cross')} ${check.reason}`, config.dangerColor));
      }
      if (giveaways.hasEntry(g.id, interaction.user.id)) {
        return interaction.reply(
          notice(`${emoji('info')} You already entered. Use **Leave** to withdraw.`),
        );
      }
      giveaways.join(g.id, interaction.user.id);
      await giveawayRunner.refreshGiveawayMessage(interaction.client, g.id);
      return interaction.reply(
        notice(`${emoji('party')} You're in!`, config.successColor),
      );
    }

    if (!giveaways.hasEntry(g.id, interaction.user.id)) {
      return interaction.reply(
        notice(`${emoji('info')} You're not in this giveaway.`),
      );
    }
    giveaways.leave(g.id, interaction.user.id);
    await giveawayRunner.refreshGiveawayMessage(interaction.client, g.id);
    return interaction.reply(
      notice(`${emoji('leave')} You left the giveaway.`),
    );
  }

  if (id === 'shop:refresh') {
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

  if (id.startsWith('shop:buy:')) {
    const productId = Number(id.split(':')[2]);
    const product = products.getProduct(productId);
    if (!product || !product.active) {
      return interaction.reply(notice('Product not found.', config.dangerColor));
    }
    if (!product.inStock) {
      return interaction.reply(notice('Out of stock.', config.warnColor));
    }
    const maxQty = product.stock_mode === 'unlimited' ? 25 : Math.min(25, product.available);
    return interaction.showModal(modals.buyQuantityModal(productId, maxQty));
  }

  // Orders — customer
  if (id.startsWith('order:paid:')) {
    const orderId = Number(id.split(':')[2]);
    const order = orders.getOrder(orderId);
    if (!order || order.user_id !== interaction.user.id) {
      return interaction.reply(notice('Order not found.', config.dangerColor));
    }
    if (order.payment_method === 'crypto') {
      return interaction.reply(
        notice(`${emoji('info')} Crypto payment is detected automatically — no need to report.`, config.accentColor),
      );
    }
    await logShop(
      interaction.client,
      `${emoji('pending')} <@${interaction.user.id}> reported a payment for **${order.public_id}** (${order.payment_method}).`,
    );
    await interaction.reply(
      notice(`${emoji('check')} Report sent. An admin will verify your payment.`),
    );
    await interaction.channel.send({
      components: [
        container(config.warnColor).addTextDisplayComponents(
          text(`${emoji('admin')} <@${interaction.user.id}> clicked **I paid** for \`${order.public_id}\`.`),
        ),
      ],
      flags: V2,
    });
    return;
  }

  if (id.startsWith('order:close:')) {
    const orderId = Number(id.split(':')[2]);
    const order = orders.getOrder(orderId);
    if (!order) return interaction.reply(notice('Order not found.', config.dangerColor));
    const allowed =
      order.user_id === interaction.user.id || isAdmin(interaction.member);
    if (!allowed) {
      return interaction.reply(notice("You can't close this order.", config.dangerColor));
    }
    if (!['delivered', 'cancelled'].includes(order.status)) {
      return interaction.reply(
        notice('You can only close a delivered or cancelled order.', config.warnColor),
      );
    }
    if (order.closed_at) {
      return interaction.reply(notice('Already closed.', config.warnColor));
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await closeOrderWithTranscript(interaction.client, {
        orderId,
        closedByUser: interaction.user,
        channel: interaction.channel,
      });
      await interaction.editReply({
        components: [
          container(config.successColor).addTextDisplayComponents(
            text(
              `${emoji('check')} HTML transcript sent by **DM** + logs channel.\nChannel will be deleted shortly.`,
            ),
          ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (e) {
      await interaction.editReply({
        components: [
          container(config.dangerColor).addTextDisplayComponents(
            text(`${emoji('cross')} ${e.message}`),
          ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }
    return;
  }

  if (id.startsWith('order:cancel:')) {
    const orderId = Number(id.split(':')[2]);
    const order = orders.getOrder(orderId);
    if (!order || order.user_id !== interaction.user.id) {
      return interaction.reply(notice('Order not found.', config.dangerColor));
    }
    try {
      orders.cancelOrder(orderId, 'Cancelled by customer');
      await bumpShop(interaction.client);
      await interaction.reply(notice(`${emoji('check')} Order cancelled.`));
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
      return interaction.reply(notice('Order not found.', config.dangerColor));
    }
    if (reviews.getReviewByOrder(orderId)) {
      return interaction.reply(notice('You already left a review for this order.'));
    }
    return interaction.showModal(modals.reviewModal(orderId));
  }

  // Actions commande (admin)
  if (id.startsWith('staff:')) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply(notice('Admins only.', config.dangerColor));
    }
    const [, action, orderIdRaw] = id.split(':');
    const orderId = Number(orderIdRaw);

    if (action === 'confirm_pay') {
      const current = orders.getOrder(orderId);
      if (!current) return interaction.reply(notice('Order not found.', config.dangerColor));
      if (current.payment_method === 'crypto') {
        return interaction.reply(
          notice(`${emoji('info')} Crypto = automatic on-chain confirmation. No need for this button.`, config.accentColor),
        );
      }
      if (!['pending', 'awaiting_payment'].includes(current.status)) {
        return interaction.reply(
          notice(`${emoji('warn')} Payment already processed (status: \`${current.status}\`).`, config.warnColor),
        );
      }
      const order = orders.markPaid(orderId);
      await interaction.reply(
        notice(
          `${emoji('check')} Payment confirmed for **${order.public_id}**.\nUse **Deliver (DM)** to send the product.`,
        ),
      );
      await logShop(
        interaction.client,
        `${emoji('money')} ${order.public_id} payment confirmed by <@${interaction.user.id}> (not delivered yet)`,
      );
      await refreshOrderPanel(interaction.channel, orderId);
      return;
    }

    if (action === 'deliver') {
      const order = orders.getOrder(orderId);
      if (!order) return interaction.reply(notice('Order not found.', config.dangerColor));
      if (order.status === 'delivered') {
        return interaction.reply(notice(`${emoji('warn')} Already delivered.`, config.warnColor));
      }
      if (!['paid', 'partial'].includes(order.status)) {
        return interaction.reply(
          notice(
            `${emoji('warn')} Confirm payment before delivering (status: \`${order.status}\`).`,
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
        await interaction.reply(notice(`${emoji('check')} Delivery sent by DM.`));
        await logShop(
          interaction.client,
          `${emoji('delivery')} ${order.public_id} delivered by DM by <@${interaction.user.id}>`,
        );
        await refreshOrderPanel(interaction.channel, orderId);
      } catch (e) {
        return interaction.reply(notice(`${emoji('cross')} ${e.message}`, config.dangerColor));
      }
      return;
    }

    if (action === 'cancel') {
      try {
        orders.cancelOrder(orderId, `Cancelled by admin ${interaction.user.tag}`);
        await bumpShop(interaction.client);
        await interaction.reply(notice('Order cancelled.'));
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
      return interaction.reply(notice('Admins only.', config.dangerColor));
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
  if (id === 'admin:crypto_recover') {
    return interaction.showModal(modals.recoverCryptoModal());
  }
  if (id === 'admin:emoji_set') {
    return interaction.showModal(modals.emojiModal());
  }

  if (id === 'admin:post_shop') {
    const panel = buildShopPanel();
    const channel = interaction.channel;
    const msg = await channel.send(panel);
    shopPanels.registerShopPanel({
      channelId: channel.id,
      messageId: msg.id,
      guildId: interaction.guildId,
    });
    return interaction.reply(
      notice(
        `${emoji('check')} Boutique postée dans ${channel}.\nElle se mettra à jour **toute seule** quand tu modifies les produits.`,
      ),
    );
  }

  if (id.startsWith('admin:product_toggle:')) {
    const productId = Number(id.split(':')[2]);
    const p = products.getProduct(productId);
    products.updateProduct(productId, { active: p.active ? 0 : 1 });
    await bumpShop(interaction.client);
    return adminUpdate(buildProductManage(products.getProduct(productId)));
  }
  if (id.startsWith('admin:product_keys:')) {
    const productId = Number(id.split(':')[2]);
    return interaction.showModal(modals.keysModal(productId));
  }
  if (id.startsWith('admin:product_price:')) {
    const productId = Number(id.split(':')[2]);
    const p = products.getProduct(productId);
    return interaction.showModal(modals.productPriceModal(productId, p?.price ?? ''));
  }
  if (id.startsWith('admin:product_content:')) {
    const productId = Number(id.split(':')[2]);
    const p = products.getProduct(productId);
    return interaction.showModal(modals.deliveryContentModal(productId, p?.delivery_content || ''));
  }
  if (id.startsWith('admin:product_delete:')) {
    const productId = Number(id.split(':')[2]);
    products.deleteProduct(productId);
    await bumpShop(interaction.client);
    return adminUpdate(buildProductsAdmin());
  }
}

async function handleSelect(interaction) {
  const id = interaction.customId;
  const value = interaction.values[0];

  if (id === 'shop:select_product') {
    const product = products.getProduct(Number(value));
    if (!product) return interaction.reply(notice('Product not found.', config.dangerColor));
    return safeUpdate(interaction, buildProductDetail(product));
  }

  if (id.startsWith('buy:checkout:')) {
    const [, , productIdRaw, qtyRaw] = id.split(':');
    const productId = Number(productIdRaw);
    const quantity = parseQuantity(qtyRaw, 1);
    try {
      const paymentMethod = value === 'crypto' ? 'crypto' : value;
      const cryptoCurrency = paymentMethod === 'crypto' ? 'ltc' : null;
      if (paymentMethod === 'crypto') {
        const cryptos = require('../services/payments').getEnabledCryptos();
        if (!cryptos.length) {
          return interaction.reply(
            notice(`${emoji('warn')} Litecoin not configured (CRYPTO_MNEMONIC).`, config.warnColor),
          );
        }
      }

      const order = orders.createOrderDirect(interaction.user, {
        items: [{ productId, quantity }],
        paymentMethod,
        cryptoCurrency,
      });
      const channel = await createOrderChannel(interaction.guild, interaction.user, order);
      await bumpShop(interaction.client);
      const label = paymentMethod === 'crypto' ? 'LTC' : paymentMethod;
      await logShop(
        interaction.client,
        `${emoji('invoice')} **${order.public_id}** ${label} ×${quantity} — <@${interaction.user.id}> — ${order.total.toFixed(2)}€`,
      );
      return interaction.reply(
        notice(
          `${emoji('check')} Order **${order.public_id}** created.\nChannel: ${channel}`,
        ),
      );
    } catch (e) {
      return interaction.reply(notice(`${emoji('cross')} ${e.message}`, config.dangerColor));
    }
  }

  if (!isAdmin(interaction.member) && id.startsWith('admin:')) {
    return interaction.reply(notice('Admins only.', config.dangerColor));
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

  if (id.startsWith('modal:buy_qty:')) {
    const productId = Number(id.split(':')[2]);
    const product = products.getProduct(productId);
    if (!product || !product.active) {
      return interaction.reply(notice('Product not found.', config.dangerColor));
    }
    const quantity = parseQuantity(interaction.fields.getTextInputValue('quantity'), 1);
    const maxQty = product.stock_mode === 'unlimited' ? 25 : product.available;
    if (quantity > maxQty) {
      return interaction.reply(
        notice(`${emoji('cross')} Only **${maxQty}** left in stock.`, config.dangerColor),
      );
    }
    const total = product.price * quantity;
    return interaction.reply(
      buildBuyConfirm({ product, quantity, total }),
    );
  }

  if (id === 'modal:product_create') {
    if (!isAdmin(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    const name = interaction.fields.getTextInputValue('name').trim();
    const price = Number(interaction.fields.getTextInputValue('price').replace(',', '.'));
    let description = '';
    try {
      description = interaction.fields.getTextInputValue('description').trim();
    } catch {
      description = '';
    }

    if (!name || !Number.isFinite(price) || price < 0) {
      return interaction.reply(notice('Nom / prix invalide.', config.dangerColor));
    }

    const product = products.createProduct({
      name,
      description: description || 'Discord Nitro gift — 1 month',
      price,
      deliveryType: 'auto',
      stockMode: 'keys',
      quantity: 0,
      deliveryContent: '',
    });
    await bumpShop(interaction.client);
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
    await bumpShop(interaction.client);
    return interaction.reply({
      ...buildProductManage(product),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (id.startsWith('modal:product_price:')) {
    if (!isAdmin(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    const productId = Number(id.split(':')[2]);
    const price = Number(interaction.fields.getTextInputValue('price').replace(',', '.'));
    if (!Number.isFinite(price) || price < 0) {
      return interaction.reply(notice('Prix invalide.', config.dangerColor));
    }
    const product = products.updateProduct(productId, { price });
    await bumpShop(interaction.client);
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
    await bumpShop(interaction.client);
    return interaction.reply(
      notice(`${emoji('check')} ${keys.length} lien(s) Nitro ajouté(s). Stock libre: **${available}**.`),
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

  if (id === 'modal:crypto_recover') {
    if (!isAdmin(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    const publicId = interaction.fields.getTextInputValue('public_id').trim().toUpperCase();
    const order = orders.getOrderByPublicId(publicId);
    if (!order) {
      return interaction.reply(notice(`Commande \`${publicId}\` introuvable.`, config.dangerColor));
    }
    if (order.payment_method !== 'crypto') {
      return interaction.reply(notice('Cette commande n\'est pas en crypto.', config.warnColor));
    }
    const row = require('../services/paymentAddresses').getAddressByOrder(order.id);
    if (!row) {
      return interaction.reply(notice('Aucune adresse HD liée à cette commande.', config.dangerColor));
    }
    const hd = require('../services/hdWallet');
    const check = hd.verifyPaymentAddress(row);
    if (!check.ok) {
      return interaction.reply(
        notice(
          `${emoji('cross')} ${check.error || 'Seed invalide'}\nAdresse DB: \`${row.address}\`\nDérivée: \`${check.expected || '—'}\``,
          config.dangerColor,
        ),
      );
    }
    const key = hd.exportPrivateKey(row.coin, row.address_index);
    const explorer = `https://litecoinspace.org/address/${row.address}`;

    return interaction.reply({
      components: [
        container(config.warnColor).addTextDisplayComponents(
          text(`# ${emoji('key')} Récupération LTC — ${order.public_id}`),
          text(
            [
              `${emoji('warn')} **Ne partage jamais cette clé.** Message éphémère — copie-la tout de suite.`,
              '',
              `Adresse : \`${row.address}\``,
              `Chemin : \`${row.derivation_path}\``,
              `Montant attendu : \`${row.expected_amount}\` LTC`,
              `Reçu : \`${row.received_amount || '—'}\` · statut \`${row.status}\``,
              `Explorer : ${explorer}`,
              '',
              key.wif
                ? `**WIF (import Electrum-LTC / Electrum)** :\n\`\`\`\n${key.wif}\n\`\`\``
                : `**Clé privée** :\n\`\`\`\n${key.privateKeyHex}\n\`\`\``,
              '',
              `${emoji('info')} ${key.recoverHint}`,
              '',
              '**Comment récupérer (LTC)** :',
              '1. Ouvre Electrum-LTC',
              '2. Wallet → Private keys → Import',
              '3. Colle le WIF → envoie vers ton wallet perso',
            ].join('\n'),
          ),
        ),
      ],
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
      return interaction.reply(notice('Order not found.', config.dangerColor));
    }
    const rating = Number(interaction.fields.getTextInputValue('rating'));
    const comment = interaction.fields.getTextInputValue('comment').trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return interaction.reply(notice('Invalid rating (1-5).', config.dangerColor));
    }
    reviews.createReview({ orderId, userId: interaction.user.id, rating, comment });
    if (config.reviewsChannelId) {
      try {
        const ch = await interaction.client.channels.fetch(config.reviewsChannelId);
        await ch.send({
          components: [
            container(config.successColor).addTextDisplayComponents(
              text(
                `# ${emoji('star')} New review\n**${order.public_id}** — <@${interaction.user.id}>\nRating: **${rating}/5**\n${comment || '_No comment_'}`,
              ),
            ),
          ],
          flags: V2,
        });
      } catch {
        /* ignore */
      }
    }
    return interaction.reply(notice(`${emoji('star')} Thanks for your review!`));
  }

  if (id.startsWith('modal:manual_deliver:')) {
    if (!isAdmin(interaction.member)) return interaction.reply(notice('Nope.', config.dangerColor));
    const orderId = Number(id.split(':')[2]);
    const payload = interaction.fields.getTextInputValue('payload').trim();
    let order = orders.getOrder(orderId);
    if (!order) return interaction.reply(notice('Order not found.', config.dangerColor));
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
      await interaction.reply(notice(`${emoji('check')} Manual delivery sent by DM.`));
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
