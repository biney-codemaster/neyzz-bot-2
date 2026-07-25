const config = require('../config');
const {
  V2,
  text,
  separator,
  btn,
  row,
  container,
  ButtonStyle,
  emoji,
} = require('./v2');

function toUnix(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : Math.floor(Date.now() / 1000);
}

function formatConditions(g) {
  const lines = [];
  if (g.required_role_id) {
    lines.push(`${emoji('staff')} Required role: <@&${g.required_role_id}>`);
  }
  if (g.min_account_days > 0) {
    lines.push(
      `${emoji('user')} Discord account at least **${g.min_account_days}** day(s) old`,
    );
  }
  if (g.min_server_days > 0) {
    lines.push(
      `${emoji('clock')} Member of this server for at least **${g.min_server_days}** day(s)`,
    );
  }
  if (!lines.length) return `${emoji('success')} No requirements`;
  return lines.join('\n');
}

function buildGiveawayPanel(g, { ended = false, cancelled = false } = {}) {
  const endsUnix = toUnix(g.ends_at);
  const statusLabel = cancelled
    ? `${emoji('cross')} Cancelled`
    : ended
      ? `${emoji('party')} Ended`
      : `${emoji('pending')} Running`;

  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('gift')} Giveaway`),
      text(`**${g.prize}**`),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `${emoji('trophy')} Winners: **${g.winners_count}**`,
          `${emoji('clock')} Ends: <t:${endsUnix}:F> (<t:${endsUnix}:R>)`,
          `${emoji('user')} Entries: **${g.entriesCount ?? 0}**`,
          `${emoji('staff')} Hosted by: <@${g.host_id}>`,
          `${statusLabel}`,
          `ID: \`${g.id}\``,
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(`### Requirements\n${formatConditions(g)}`),
    );

  const components = [c];

  if (!ended && !cancelled) {
    components.push(
      row(
        btn(`giveaway:join:${g.id}`, 'Enter', ButtonStyle.Success, 'party'),
        btn(`giveaway:leave:${g.id}`, 'Leave', ButtonStyle.Secondary, 'leave'),
      ),
    );
  }

  return { components, flags: V2 };
}

function buildWinnersMessage(g, winners) {
  const mentions = winners.length
    ? winners.map((id) => `<@${id}>`).join(', ')
    : '_No winners (not enough eligible entries)._';

  const c = container(config.successColor || config.accentColor)
    .addTextDisplayComponents(
      text(`# ${emoji('party')} Giveaway ended`),
      text(`**${g.prize}**`),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `${emoji('trophy')} Winner(s): ${mentions}`,
          `${emoji('user')} Entries: **${g.entriesCount ?? 0}**`,
          `Giveaway #\`${g.id}\``,
        ].join('\n'),
      ),
    );

  return { components: [c], flags: V2 };
}

function buildRerollMessage(g, winners) {
  const mentions = winners.length
    ? winners.map((id) => `<@${id}>`).join(', ')
    : '_No new eligible winners._';

  const c = container(config.accentColor)
    .addTextDisplayComponents(
      text(`# ${emoji('refresh')} Reroll`),
      text(`**${g.prize}**`),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `${emoji('trophy')} New winner(s): ${mentions}`,
          `Giveaway #\`${g.id}\``,
        ].join('\n'),
      ),
    );

  return { components: [c], flags: V2 };
}

module.exports = {
  buildGiveawayPanel,
  buildWinnersMessage,
  buildRerollMessage,
  formatConditions,
};
