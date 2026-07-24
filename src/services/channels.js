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
              ? `${emoji('box')} <@${userId}> — commande créée.`
              : `${emoji('refresh')} <@${userId}> — ticket renouvelé.`,
            isCrypto
              ? `${emoji('crypto')} Paie à l'adresse ci-dessous — détection **auto**, livraison en **MP**.`
              : `${emoji('delivery')} Après confirmation du paiement, la livraison partira en **MP**.`,
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
    topic: `Commande ${order.public_id} — ${user.id}`,
    permissionOverwrites: buildOrderOverwrites(guild, user.id),
    reason: `Commande ${order.public_id}`,
  });

  orders.setOrderChannel(order.id, channel.id);
  orders.markAwaitingPayment(order.id);
  await postOrderPanel(channel, user.id, order, { created: true });
  return channel;
}

/**
 * Supprime le salon ticket et le recrée au même endroit (catégorie + position),
 * sans changer le statut de la commande ni réallouer l'adresse crypto.
 */
async function renewOrderChannel(oldChannel, order) {
  const guild = oldChannel.guild;
  const name = oldChannel.name;
  const parentId = oldChannel.parentId;
  const position = oldChannel.position;
  const topic =
    oldChannel.topic || `Commande ${order.public_id} — ${order.user_id}`;

  const newChannel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId || undefined,
    topic,
    permissionOverwrites: buildOrderOverwrites(guild, order.user_id),
    reason: `Renew ${order.public_id}`,
  });

  try {
    if (typeof position === 'number') {
      await newChannel.setPosition(position, { reason: `Renew ${order.public_id}` });
    }
  } catch {
    /* position best-effort */
  }

  orders.setOrderChannel(order.id, newChannel.id);
  await postOrderPanel(newChannel, order.user_id, order, { created: false });

  return { newChannel, deleteOld: async () => {
    try {
      await oldChannel.delete(`Renew ${order.public_id}`);
    } catch (e) {
      console.warn('[renew] delete old channel:', e.message);
    }
  } };
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
  renewOrderChannel,
  refreshOrderPanel,
  logShop,
};
