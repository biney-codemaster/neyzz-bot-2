const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const giveaways = require('../services/giveaways');
const runner = require('../services/giveawayRunner');
const { buildGiveawayPanel } = require('../ui/giveaway');
const { isAdmin } = require('../utils/helpers');
const { notice } = require('../handlers/interactions');
const { emoji } = require('../emoji');
const config = require('../config');
const { container, text } = require('../ui/v2');

function deny(interaction) {
  return interaction.reply(
    notice(`${emoji('cross')} Accès refusé — admin uniquement.`, config.dangerColor),
  );
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Gérer les giveaways')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((sub) =>
        sub
          .setName('create')
          .setDescription('Créer un giveaway')
          .addChannelOption((o) =>
            o
              .setName('salon')
              .setDescription('Salon où poster le giveaway')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true),
          )
          .addStringOption((o) =>
            o.setName('lot').setDescription('Lot à gagner (texte)').setRequired(true).setMaxLength(200),
          )
          .addStringOption((o) =>
            o
              .setName('duree')
              .setDescription('Durée (ex: 30m, 2h, 1d)')
              .setRequired(true),
          )
          .addIntegerOption((o) =>
            o
              .setName('gagnants')
              .setDescription('Nombre de gagnants')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(50),
          )
          .addRoleOption((o) =>
            o.setName('role').setDescription('Rôle requis pour participer').setRequired(false),
          )
          .addIntegerOption((o) =>
            o
              .setName('age_compte')
              .setDescription('Âge minimum du compte Discord (jours)')
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(3650),
          )
          .addIntegerOption((o) =>
            o
              .setName('anciennete')
              .setDescription('Ancienneté minimum sur le serveur (jours)')
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(3650),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName('list').setDescription('Lister les giveaways en cours'),
      )
      .addSubcommand((sub) =>
        sub
          .setName('cancel')
          .setDescription('Annuler un giveaway')
          .addIntegerOption((o) =>
            o.setName('id').setDescription('ID du giveaway').setRequired(true).setMinValue(1),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('extend')
          .setDescription('Prolonger un giveaway')
          .addIntegerOption((o) =>
            o.setName('id').setDescription('ID du giveaway').setRequired(true).setMinValue(1),
          )
          .addStringOption((o) =>
            o
              .setName('duree')
              .setDescription('Durée à ajouter (ex: 30m, 1h)')
              .setRequired(true),
          ),
      ),
    async execute(interaction) {
      if (!isAdmin(interaction.member)) return deny(interaction);

      const sub = interaction.options.getSubcommand();

      if (sub === 'create') {
        const channel = interaction.options.getChannel('salon', true);
        const prize = interaction.options.getString('lot', true).trim();
        const duration = interaction.options.getString('duree', true);
        const winnersCount = interaction.options.getInteger('gagnants', true);
        const role = interaction.options.getRole('role');
        const minAccountDays = interaction.options.getInteger('age_compte') || 0;
        const minServerDays = interaction.options.getInteger('anciennete') || 0;

        const endsAt = giveaways.endsAtFromDuration(duration);
        if (!endsAt) {
          return interaction.reply(
            notice(
              `${emoji('cross')} Durée invalide. Exemples : \`30m\`, \`2h\`, \`1d\` (min 10s, max 60j).`,
              config.dangerColor,
            ),
          );
        }

        if (!channel.isTextBased?.()) {
          return interaction.reply(
            notice(`${emoji('cross')} Salon invalide.`, config.dangerColor),
          );
        }

        const g = giveaways.createGiveaway({
          guildId: interaction.guildId,
          channelId: channel.id,
          hostId: interaction.user.id,
          prize,
          winnersCount,
          endsAt,
          requiredRoleId: role?.id || null,
          minAccountDays,
          minServerDays,
        });

        const payload = buildGiveawayPanel(g);
        const msg = await channel.send(payload);
        giveaways.setMessageId(g.id, msg.id);

        return interaction.reply(
          notice(
            `${emoji('gift')} Giveaway #\`${g.id}\` créé dans ${channel}.`,
            config.successColor,
          ),
        );
      }

      if (sub === 'list') {
        const list = giveaways.listRunning(interaction.guildId);
        if (!list.length) {
          return interaction.reply(
            notice(`${emoji('info')} Aucun giveaway en cours.`),
          );
        }

        const lines = list.map((g) => {
          const unix = Math.floor(Date.parse(g.ends_at) / 1000);
          return (
            `**#${g.id}** — ${g.prize}\n` +
            `${emoji('user')} ${g.entriesCount} · ${emoji('trophy')} ${g.winners_count} · ` +
            `fin <t:${unix}:R> · <#${g.channel_id}>`
          );
        });

        return interaction.reply({
          components: [
            container().addTextDisplayComponents(
              text(`# ${emoji('gift')} Giveaways en cours`),
              text(lines.join('\n\n')),
            ),
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }

      if (sub === 'cancel') {
        const id = interaction.options.getInteger('id', true);
        const g = giveaways.getGiveaway(id);
        if (!g || g.guild_id !== interaction.guildId) {
          return interaction.reply(
            notice(`${emoji('cross')} Giveaway introuvable.`, config.dangerColor),
          );
        }
        if (g.status !== 'running') {
          return interaction.reply(
            notice(`${emoji('cross')} Ce giveaway n'est plus en cours.`, config.dangerColor),
          );
        }
        await runner.cancelAndRefresh(interaction.client, id);
        return interaction.reply(
          notice(`${emoji('check')} Giveaway #\`${id}\` annulé.`, config.successColor),
        );
      }

      if (sub === 'extend') {
        const id = interaction.options.getInteger('id', true);
        const duration = interaction.options.getString('duree', true);
        const g = giveaways.getGiveaway(id);
        if (!g || g.guild_id !== interaction.guildId) {
          return interaction.reply(
            notice(`${emoji('cross')} Giveaway introuvable.`, config.dangerColor),
          );
        }
        if (g.status !== 'running') {
          return interaction.reply(
            notice(`${emoji('cross')} Ce giveaway n'est plus en cours.`, config.dangerColor),
          );
        }

        const ms = giveaways.parseDuration(duration);
        if (!ms) {
          return interaction.reply(
            notice(
              `${emoji('cross')} Durée invalide. Exemples : \`30m\`, \`2h\`, \`1d\`.`,
              config.dangerColor,
            ),
          );
        }

        const base = Math.max(Date.parse(g.ends_at), Date.now());
        const newEndsAt = new Date(base + ms).toISOString();
        await runner.extendAndRefresh(interaction.client, id, newEndsAt);
        const unix = Math.floor(Date.parse(newEndsAt) / 1000);
        return interaction.reply(
          notice(
            `${emoji('check')} Giveaway #\`${id}\` prolongé jusqu'à <t:${unix}:F>.`,
            config.successColor,
          ),
        );
      }

      return null;
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('reroll')
      .setDescription('Relancer le tirage d\'un giveaway terminé')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addIntegerOption((o) =>
        o.setName('id').setDescription('ID du giveaway').setRequired(true).setMinValue(1),
      )
      .addIntegerOption((o) =>
        o
          .setName('gagnants')
          .setDescription('Nombre de nouveaux gagnants (défaut = original)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(50),
      ),
    async execute(interaction) {
      if (!isAdmin(interaction.member)) return deny(interaction);

      const id = interaction.options.getInteger('id', true);
      const count = interaction.options.getInteger('gagnants');
      const g = giveaways.getGiveaway(id);
      if (!g || g.guild_id !== interaction.guildId) {
        return interaction.reply(
          notice(`${emoji('cross')} Giveaway introuvable.`, config.dangerColor),
        );
      }

      const result = await runner.rerollGiveaway(interaction.client, id, count);
      if (!result.ok) {
        return interaction.reply(
          notice(`${emoji('cross')} ${result.error}`, config.dangerColor),
        );
      }

      const mentions = result.winners.map((uid) => `<@${uid}>`).join(', ');
      return interaction.reply(
        notice(
          `${emoji('party')} Reroll #\`${id}\` — ${mentions}`,
          config.successColor,
        ),
      );
    },
  },
];
