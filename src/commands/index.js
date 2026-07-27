const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildAdminHome } = require('../ui/admin');
const orders = require('../services/orders');
const { renewChannel } = require('../services/channels');
const { isAdmin } = require('../utils/helpers');
const { notice } = require('../handlers/interactions');
const { emoji } = require('../emoji');
const config = require('../config');
const giveawayCommands = require('./giveaway');

function sanitizeChannelName(raw) {
  const name = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return name;
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('admin')
      .setDescription('Nitro shop admin dashboard')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply(
          notice(`${emoji('cross')} Access denied.`, config.dangerColor),
        );
      }
      await interaction.reply({
        ...buildAdminHome(),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('rename')
      .setDescription('Rename the order ticket channel (admin, in the channel)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption((o) =>
        o
          .setName('name')
          .setDescription('New channel name')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(100),
      ),
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply(
          notice(`${emoji('cross')} Access denied — admin only.`, config.dangerColor),
        );
      }

      const order = orders.getOrderByChannel(interaction.channelId);
      if (!order) {
        return interaction.reply(
          notice(
            `${emoji('cross')} This command only works in an order ticket channel.`,
            config.dangerColor,
          ),
        );
      }

      if (order.closed_at) {
        return interaction.reply(
          notice(`${emoji('cross')} This order is already closed.`, config.dangerColor),
        );
      }

      const name = sanitizeChannelName(interaction.options.getString('name', true));
      if (!name || name.length < 1) {
        return interaction.reply(
          notice(
            `${emoji('cross')} Invalid name. Use letters, numbers, or hyphens.`,
            config.dangerColor,
          ),
        );
      }

      try {
        const oldName = interaction.channel.name;
        await interaction.channel.setName(name, `Rename by ${interaction.user.tag}`);
        return interaction.reply(
          notice(
            `${emoji('edit')} Channel renamed: \`${oldName}\` → \`${name}\``,
            config.successColor,
          ),
        );
      } catch (e) {
        return interaction.reply(
          notice(
            `${emoji('cross')} Could not rename: ${e.message}`,
            config.dangerColor,
          ),
        );
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('renew')
      .setDescription('Recreate this channel in the same place (admin)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply(
          notice(`${emoji('cross')} Access denied — admin only.`, config.dangerColor),
        );
      }

      if (!interaction.guild || !interaction.channel) {
        return interaction.reply(
          notice(`${emoji('cross')} Guild channels only.`, config.dangerColor),
        );
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const { newChannel, deleteOld } = await renewChannel(interaction.channel, {
          renewedByTag: interaction.user.tag,
        });
        await interaction.editReply(
          notice(
            `${emoji('refresh')} Channel renewed: ${newChannel}`,
            config.successColor,
          ),
        );
        await deleteOld();
        return null;
      } catch (e) {
        return interaction.editReply(
          notice(
            `${emoji('cross')} Could not renew: ${e.message}`,
            config.dangerColor,
          ),
        );
      }
    },
  },
  ...giveawayCommands,
];
