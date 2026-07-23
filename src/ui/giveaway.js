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
    lines.push(`${emoji('staff')} Rôle requis : <@&${g.required_role_id}>`);
  }
  if (g.min_account_days > 0) {
    lines.push(
      `${emoji('user')} Compte Discord âgé d'au moins **${g.min_account_days}** jour(s)`,
    );
  }
  if (g.min_server_days > 0) {
    lines.push(
      `${emoji('clock')} Membre du serveur depuis au moins **${g.min_server_days}** jour(s)`,
    );
  }
  if (!lines.length) return `${emoji('success')} Aucune condition`;
  return lines.join('\n');
}

function buildGiveawayPanel(g, { ended = false, cancelled = false } = {}) {
  const endsUnix = toUnix(g.ends_at);
  const statusLabel = cancelled
    ? `${emoji('cross')} Annulé`
    : ended
      ? `${emoji('party')} Terminé`
      : `${emoji('pending')} En cours`;

  const c = container()
    .addTextDisplayComponents(
      text(`# ${emoji('gift')} Giveaway`),
      text(`**${g.prize}**`),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `${emoji('trophy')} Gagnants : **${g.winners_count}**`,
          `${emoji('clock')} Fin : <t:${endsUnix}:F> (<t:${endsUnix}:R>)`,
          `${emoji('user')} Participants : **${g.entriesCount ?? 0}**`,
          `${emoji('staff')} Organisé par : <@${g.host_id}>`,
          `${statusLabel}`,
          `ID : \`${g.id}\``,
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(`### Conditions\n${formatConditions(g)}`),
    );

  const components = [c];

  if (!ended && !cancelled) {
    components.push(
      row(
        btn(`giveaway:join:${g.id}`, 'Participer', ButtonStyle.Success, 'party'),
        btn(`giveaway:leave:${g.id}`, 'Quitter', ButtonStyle.Secondary, 'leave'),
      ),
    );
  }

  return { components, flags: V2 };
}

function buildWinnersMessage(g, winners) {
  const mentions = winners.length
    ? winners.map((id) => `<@${id}>`).join(', ')
    : '_Aucun gagnant (pas assez de participants éligibles)._';

  const c = container(config.successColor || config.accentColor)
    .addTextDisplayComponents(
      text(`# ${emoji('party')} Tirage terminé`),
      text(`**${g.prize}**`),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `${emoji('trophy')} Gagnant(s) : ${mentions}`,
          `${emoji('user')} Participants : **${g.entriesCount ?? 0}**`,
          `Giveaway #\`${g.id}\``,
        ].join('\n'),
      ),
    );

  return { components: [c], flags: V2 };
}

function buildRerollMessage(g, winners) {
  const mentions = winners.length
    ? winners.map((id) => `<@${id}>`).join(', ')
    : '_Aucun nouveau gagnant éligible._';

  const c = container(config.accentColor)
    .addTextDisplayComponents(
      text(`# ${emoji('refresh')} Reroll`),
      text(`**${g.prize}**`),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          `${emoji('trophy')} Nouveau(x) gagnant(s) : ${mentions}`,
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
