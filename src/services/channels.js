const { MessageFlags } = require('discord.js');
const config = require('../config');
const orders = require('../services/orders');
const { buildOrderChannelPanel, buildPaymentInfoForOrder } = require('../ui/order');
const { emoji } = require('../emoji');
const { text, container, V2 } = require('../ui/v2');

async function createOrderChannel(guild, user, order) {
  const { ChannelType, PermissionFlagsBits } = require('discord.js');

  const overwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
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

  for (const roleId of [...new Set([...config.staffRoleIds, ...config.adminRoleIds])]) {
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

  const channel = await guild.channels.create({
    name: `cmd-${order.public_id.replace('CMD-', '').toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: config.ordersCategoryId || undefined,
    topic: `Commande ${order.public_id} — ${user.id}`,
    permissionOverwrites: overwrites,
    reason: `Commande ${order.public_id}`,
  });

  orders.setOrderChannel(order.id, channel.id);
  orders.markAwaitingPayment(order.id);

  const fresh = orders.getOrder(order.id);
  const paymentInfo = buildPaymentInfoForOrder(fresh);
  const panel = buildOrderChannelPanel(fresh, paymentInfo);

  await channel.send({
    components: [
      container().addTextDisplayComponents(
        text(`${emoji('box')} <@${user.id}> — ta commande est prête. Le staff a accès à ce salon.`),
      ),
      ...panel.components,
    ],
    flags: V2,
  });

  return channel;
}

async function refreshOrderPanel(channel, orderId) {
  const order = orders.getOrder(orderId);
  if (!order) return;
  const paymentInfo = ['pending', 'awaiting_payment'].includes(order.status)
    ? buildPaymentInfoForOrder(order)
    : null;
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
  refreshOrderPanel,
  logShop,
};
