const { MessageFlags } = require('discord.js');
const config = require('../config');
const orders = require('../services/orders');
const payments = require('../services/payments');
const { buildOrderChannelPanel } = require('../ui/order');
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

  let fresh = orders.getOrder(order.id);
  let paymentInfo = null;

  if (fresh.payment_method === 'crypto' && fresh.crypto_currency) {
    paymentInfo = await payments.prepareCryptoPayment(fresh, fresh.crypto_currency);
    fresh = orders.getOrder(order.id);
  } else if (fresh.payment_method === 'paypal') {
    paymentInfo = payments.buildPaypalPayment(fresh);
  }

  const panel = buildOrderChannelPanel(fresh, paymentInfo);

  await channel.send({
    components: [
      container().addTextDisplayComponents(
        text(
          `${emoji('box')} <@${user.id}> — commande créée.\n${emoji('delivery')} La livraison partira en **MP** après paiement confirmé.`,
        ),
      ),
      ...panel.components,
    ],
    flags: V2,
  });

  if (paymentInfo) {
    try {
      await user.send({
        components: [
          container(config.warnColor).addTextDisplayComponents(
            text(`# ${emoji(paymentInfo.method === 'paypal' ? 'paypal' : 'crypto')} ${paymentInfo.title}`),
            text(`Commande **${fresh.public_id}**`),
            text(paymentInfo.instructions),
            paymentInfo.address
              ? text(`${emoji('copy')} \`${paymentInfo.address}\``)
              : text(paymentInfo.link || paymentInfo.email || ''),
          ),
        ],
        flags: V2,
      });
    } catch {
      /* MPs fermés — le salon suffit */
    }
  }

  return channel;
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
  refreshOrderPanel,
  logShop,
};
