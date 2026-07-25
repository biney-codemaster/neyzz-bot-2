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
    notice(`${emoji('cross')} Access denied — admin only.`, config.dangerColor),
  );
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Manage giveaways')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((sub) =>
        sub
          .setName('create')
          .setDescription('Create a giveaway')
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Channel to post the giveaway in')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true),
          )
          .addStringOption((o) =>
            o.setName('prize').setDescription('Prize text').setRequired(true).setMaxLength(200),
          )
          .addStringOption((o) =>
            o
              .setName('duration')
              .setDescription('Duration (e.g. 30m, 2h, 1d)')
              .setRequired(true),
          )
          .addIntegerOption((o) =>
            o
              .setName('winners')
              .setDescription('Number of winners')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(50),
          )
          .addRoleOption((o) =>
            o.setName('role').setDescription('Required role to enter').setRequired(false),
          )
          .addIntegerOption((o) =>
            o
              .setName('account_age')
              .setDescription('Minimum Discord account age (days)')
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(3650),
          )
          .addIntegerOption((o) =>
            o
              .setName('server_age')
              .setDescription('Minimum server membership (days)')
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(3650),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName('list').setDescription('List running giveaways'),
      )
      .addSubcommand((sub) =>
        sub
          .setName('cancel')
          .setDescription('Cancel a giveaway')
          .addIntegerOption((o) =>
            o.setName('id').setDescription('Giveaway ID').setRequired(true).setMinValue(1),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('extend')
          .setDescription('Extend a giveaway')
          .addIntegerOption((o) =>
            o.setName('id').setDescription('Giveaway ID').setRequired(true).setMinValue(1),
          )
          .addStringOption((o) =>
            o
              .setName('duration')
              .setDescription('Duration to add (e.g. 30m, 1h)')
              .setRequired(true),
          ),
      ),
    async execute(interaction) {
      if (!isAdmin(interaction.member)) return deny(interaction);

      const sub = interaction.options.getSubcommand();

      if (sub === 'create') {
        const channel = interaction.options.getChannel('channel', true);
        const prize = interaction.options.getString('prize', true).trim();
        const duration = interaction.options.getString('duration', true);
        const winnersCount = interaction.options.getInteger('winners', true);
        const role = interaction.options.getRole('role');
        const minAccountDays = interaction.options.getInteger('account_age') || 0;
        const minServerDays = interaction.options.getInteger('server_age') || 0;

        const endsAt = giveaways.endsAtFromDuration(duration);
        if (!endsAt) {
          return interaction.reply(
            notice(
              `${emoji('cross')} Invalid duration. Examples: \`30m\`, \`2h\`, \`1d\` (min 10s, max 60d).`,
              config.dangerColor,
            ),
          );
        }

        if (!channel.isTextBased?.()) {
          return interaction.reply(
            notice(`${emoji('cross')} Invalid channel.`, config.dangerColor),
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
            `${emoji('gift')} Giveaway #\`${g.id}\` created in ${channel}.`,
            config.successColor,
          ),
        );
      }

      if (sub === 'list') {
        const list = giveaways.listRunning(interaction.guildId);
        if (!list.length) {
          return interaction.reply(
            notice(`${emoji('info')} No running giveaways.`),
          );
        }

        const lines = list.map((g) => {
          const unix = Math.floor(Date.parse(g.ends_at) / 1000);
          return (
            `**#${g.id}** — ${g.prize}\n` +
            `${emoji('user')} ${g.entriesCount} · ${emoji('trophy')} ${g.winners_count} · ` +
            `ends <t:${unix}:R> · <#${g.channel_id}>`
          );
        });

        return interaction.reply({
          components: [
            container().addTextDisplayComponents(
              text(`# ${emoji('gift')} Running giveaways`),
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
            notice(`${emoji('cross')} Giveaway not found.`, config.dangerColor),
          );
        }
        if (g.status !== 'running') {
          return interaction.reply(
            notice(`${emoji('cross')} This giveaway is no longer running.`, config.dangerColor),
          );
        }
        await runner.cancelAndRefresh(interaction.client, id);
        return interaction.reply(
          notice(`${emoji('check')} Giveaway #\`${id}\` cancelled.`, config.successColor),
        );
      }

      if (sub === 'extend') {
        const id = interaction.options.getInteger('id', true);
        const duration = interaction.options.getString('duration', true);
        const g = giveaways.getGiveaway(id);
        if (!g || g.guild_id !== interaction.guildId) {
          return interaction.reply(
            notice(`${emoji('cross')} Giveaway not found.`, config.dangerColor),
          );
        }
        if (g.status !== 'running') {
          return interaction.reply(
            notice(`${emoji('cross')} This giveaway is no longer running.`, config.dangerColor),
          );
        }

        const ms = giveaways.parseDuration(duration);
        if (!ms) {
          return interaction.reply(
            notice(
              `${emoji('cross')} Invalid duration. Examples: \`30m\`, \`2h\`, \`1d\`.`,
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
            `${emoji('check')} Giveaway #\`${id}\` extended until <t:${unix}:F>.`,
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
      .setDescription('Reroll winners for an ended giveaway')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Giveaway ID').setRequired(true).setMinValue(1),
      )
      .addIntegerOption((o) =>
        o
          .setName('winners')
          .setDescription('Number of new winners (default = original)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(50),
      ),
    async execute(interaction) {
      if (!isAdmin(interaction.member)) return deny(interaction);

      const id = interaction.options.getInteger('id', true);
      const count = interaction.options.getInteger('winners');
      const g = giveaways.getGiveaway(id);
      if (!g || g.guild_id !== interaction.guildId) {
        return interaction.reply(
          notice(`${emoji('cross')} Giveaway not found.`, config.dangerColor),
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
