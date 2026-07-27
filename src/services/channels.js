const { MessageFlags, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const orders = require('../services/orders');
const payments = require('../services/payments');
const { buildOrderChannelPanel } = require('../ui/order');
const { emoji } = require('../emoji');
const { text, container, V2 } = require('../ui/v2');

function buildOrderOverwrites(guild, userId) {
  const overwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  for (const roleId of [...new Set(config.adminRoleIds)]) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  return overwrites;
}

async function resolvePaymentInfo(order) {
  let paymentInfo = null;
  let fresh = orders.getOrder(order.id);

  if (fresh.payment_method === 'crypto' && fresh.crypto_currency) {
    const existing = require('./paymentAddresses').getAddressByOrder(fresh.id);
    if (existing) {
      paymentInfo = payments.buildCryptoPayment(fresh, fresh.crypto_currency);
    } else if (['pending', 'awaiting_payment'].includes(fresh.status)) {
      paymentInfo = await payments.prepareCryptoPayment(fresh, fresh.crypto_currency);
      fresh = orders.getOrder(fresh.id);
    }
  } else if (fresh.payment_method === 'paypal') {
    paymentInfo = payments.buildPaypalPayment(fresh);
  }

  return { fresh, paymentInfo };
}

async function postOrderPanel(channel, userId, order, { created = false } = {}) {
  const { fresh, paymentInfo } = await resolvePaymentInfo(order);
  const panel = buildOrderChannelPanel(fresh, paymentInfo);
  const isCrypto = fresh.payment_method === 'crypto';

  await channel.send({
    components: [
      container().addTextDisplayComponents(
        text(
          [
            created
              ? `${emoji('box')} <@${userId}> — order created.`
              : `${emoji('refresh')} <@${userId}> — ticket renewed.`,
            isCrypto
              ? `${emoji('crypto')} Pay below — auto detect, **DM** delivery.`
              : `${emoji('delivery')} After payment confirmation → **DM** delivery.`,
          ].join('\n'),
        ),
      ),
      ...panel.components,
    ],
    flags: V2,
  });

  return fresh;
}

async function createOrderChannel(guild, user, order) {
  const channel = await guild.channels.create({
    name: `cmd-${order.public_id.replace('CMD-', '').toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: config.ordersCategoryId || undefined,
    topic: `Order ${order.public_id} — ${user.id}`,
    permissionOverwrites: buildOrderOverwrites(guild, user.id),
    reason: `Order ${order.public_id}`,
  });

  orders.setOrderChannel(order.id, channel.id);
  orders.markAwaitingPayment(order.id);
  await postOrderPanel(channel, user.id, order, { created: true });
  return channel;
}

/**
 * Recrée n'importe quel salon texte au même endroit
 * (nom, catégorie, position, topic, permissions).
 * Si c'est un ticket commande, met à jour le channel_id + reposte le panel.
 */
async function renewChannel(oldChannel, { renewedByTag = 'admin' } = {}) {
  if (!oldChannel?.guild) throw new Error('Invalid channel');
  if (!oldChannel.isTextBased?.() || oldChannel.isDMBased?.()) {
    throw new Error('Only usable in a server text channel.');
  }
  if (oldChannel.isThread?.()) {
    throw new Error('Cannot renew a thread.');
  }

  const guild = oldChannel.guild;
  const reason = `Renew par ${renewedByTag}`;
  const name = oldChannel.name;
  const parentId = oldChannel.parentId;
  const position = oldChannel.position;
  const topic = oldChannel.topic || undefined;
  const nsfw = Boolean(oldChannel.nsfw);
  const rateLimitPerUser = oldChannel.rateLimitPerUser || 0;
  const type = oldChannel.type;

  const permissionOverwrites = oldChannel.permissionOverwrites.cache.map((ow) => ({
    id: ow.id,
    allow: ow.allow.bitfield,
    deny: ow.deny.bitfield,
    type: ow.type,
  }));

  const createPayload = {
    name,
    type,
    parent: parentId || undefined,
    topic,
    nsfw,
    rateLimitPerUser,
    permissionOverwrites,
    reason,
  };

  const newChannel = await guild.channels.create(createPayload);

  try {
    if (typeof position === 'number') {
      await newChannel.setPosition(position, { reason });
    }
  } catch {
    /* position best-effort */
  }

  // Si salon lié à une commande boutique → garder le lien + panel
  const order = orders.getOrderByChannel(oldChannel.id);
  if (order && !order.closed_at) {
    orders.setOrderChannel(order.id, newChannel.id);
    try {
      await postOrderPanel(newChannel, order.user_id, order, { created: false });
    } catch (e) {
      console.warn('[renew] order panel:', e.message);
    }
  }

  return {
    newChannel,
    order,
    deleteOld: async () => {
      try {
        await oldChannel.delete(reason);
      } catch (e) {
        console.warn('[renew] delete old channel:', e.message);
      }
    },
  };
}

async function refreshOrderPanel(channel, orderId) {
  const order = orders.getOrder(orderId);
  if (!order) return;
  let paymentInfo = null;
  if (['pending', 'awaiting_payment'].includes(order.status)) {
    if (order.payment_method === 'crypto') {
      const row = require('./paymentAddresses').getAddressByOrder(order.id);
      paymentInfo = row
        ? payments.buildCryptoPayment(order, order.crypto_currency)
        : null;
    } else if (order.payment_method === 'paypal') {
      paymentInfo = payments.buildPaypalPayment(order);
    }
  }
  await channel.send(buildOrderChannelPanel(order, paymentInfo));
}

async function logShop(client, message) {
  if (!config.logsChannelId) return;
  try {
    const ch = await client.channels.fetch(config.logsChannelId);
    if (ch?.isTextBased()) {
      await ch.send({
        components: [container().addTextDisplayComponents(text(message))],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  } catch {
    /* ignore */
  }
}

module.exports = {
  createOrderChannel,
  renewChannel,
  refreshOrderPanel,
  logShop,
};
