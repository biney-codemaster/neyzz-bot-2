const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildCartPanel } = require('../ui/cart');
const { buildAdminHome } = require('../ui/admin');
const cart = require('../services/cart');
const orders = require('../services/orders');
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
      .setName('panier')
      .setDescription('Affiche ton panier'),
    async execute(interaction) {
      const c = cart.getCart(interaction.user.id);
      await interaction.reply({
        ...buildCartPanel(c),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('admin')
      .setDescription('Dashboard admin de la boutique')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply(
          notice(`${emoji('cross')} Accès refusé.`, config.dangerColor),
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
      .setDescription('Renomme le ticket de commande (admin, dans le salon)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption((o) =>
        o
          .setName('nom')
          .setDescription('Nouveau nom du salon')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(100),
      ),
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply(
          notice(`${emoji('cross')} Accès refusé — admin uniquement.`, config.dangerColor),
        );
      }

      const order = orders.getOrderByChannel(interaction.channelId);
      if (!order) {
        return interaction.reply(
          notice(
            `${emoji('cross')} Cette commande ne fonctionne que dans un ticket de commande.`,
            config.dangerColor,
          ),
        );
      }

      if (order.closed_at) {
        return interaction.reply(
          notice(`${emoji('cross')} Cette commande est déjà fermée.`, config.dangerColor),
        );
      }

      const name = sanitizeChannelName(interaction.options.getString('nom', true));
      if (!name || name.length < 1) {
        return interaction.reply(
          notice(
            `${emoji('cross')} Nom invalide. Utilise des lettres, chiffres ou tirets.`,
            config.dangerColor,
          ),
        );
      }

      try {
        const oldName = interaction.channel.name;
        await interaction.channel.setName(name, `Rename par ${interaction.user.tag}`);
        return interaction.reply(
          notice(
            `${emoji('edit')} Salon renommé : \`${oldName}\` → \`${name}\``,
            config.successColor,
          ),
        );
      } catch (e) {
        return interaction.reply(
          notice(
            `${emoji('cross')} Impossible de renommer : ${e.message}`,
            config.dangerColor,
          ),
        );
      }
    },
  },
  ...giveawayCommands,
];
