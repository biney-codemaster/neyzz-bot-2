const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildCartPanel } = require('../ui/cart');
const { buildAdminHome } = require('../ui/admin');
const cart = require('../services/cart');
const { isAdmin } = require('../utils/helpers');
const { notice } = require('../handlers/interactions');
const { emoji } = require('../emoji');
const config = require('../config');

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
];
