const { getDb } = require('../db/database');

function createGiveaway({
  guildId,
  channelId,
  hostId,
  prize,
  winnersCount,
  endsAt,
  requiredRoleId = null,
  minAccountDays = 0,
  minServerDays = 0,
}) {
  const result = getDb()
    .prepare(
      `INSERT INTO giveaways (
        guild_id, channel_id, host_id, prize, winners_count, ends_at,
        required_role_id, min_account_days, min_server_days, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`,
    )
    .run(
      guildId,
      channelId,
      hostId,
      prize,
      winnersCount,
      endsAt,
      requiredRoleId,
      minAccountDays,
      minServerDays,
    );
  return getGiveaway(result.lastInsertRowid);
}

function getGiveaway(id) {
  const row = getDb().prepare('SELECT * FROM giveaways WHERE id = ?').get(id);
  return row ? enrich(row) : null;
}

function enrich(row) {
  return {
    ...row,
    winners: row.winners_json ? JSON.parse(row.winners_json) : [],
    entriesCount: countEntries(row.id),
  };
}

function setMessageId(id, messageId) {
  getDb().prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(messageId, id);
}

function listRunning(guildId = null) {
  if (guildId) {
    return getDb()
      .prepare(
        `SELECT * FROM giveaways WHERE status = 'running' AND guild_id = ? ORDER BY ends_at ASC`,
      )
      .all(guildId)
      .map(enrich);
  }
  return getDb()
    .prepare(`SELECT * FROM giveaways WHERE status = 'running' ORDER BY ends_at ASC`)
    .all()
    .map(enrich);
}

function listDue() {
  return getDb()
    .prepare(
      `SELECT * FROM giveaways
       WHERE status = 'running' AND datetime(ends_at) <= datetime('now')`,
    )
    .all()
    .map(enrich);
}

function countEntries(giveawayId) {
  return getDb()
    .prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?')
    .get(giveawayId).c;
}

function listEntries(giveawayId) {
  return getDb()
    .prepare('SELECT user_id, joined_at FROM giveaway_entries WHERE giveaway_id = ?')
    .all(giveawayId);
}

function hasEntry(giveawayId, userId) {
  return Boolean(
    getDb()
      .prepare('SELECT 1 FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?')
      .get(giveawayId, userId),
  );
}

function join(giveawayId, userId) {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)`,
    )
    .run(giveawayId, userId);
  return hasEntry(giveawayId, userId);
}

function leave(giveawayId, userId) {
  getDb()
    .prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?')
    .run(giveawayId, userId);
}

function cancelGiveaway(id) {
  getDb()
    .prepare(
      `UPDATE giveaways SET status = 'cancelled', ended_at = datetime('now') WHERE id = ? AND status = 'running'`,
    )
    .run(id);
  return getGiveaway(id);
}

function extendGiveaway(id, newEndsAt) {
  getDb()
    .prepare(
      `UPDATE giveaways SET ends_at = ? WHERE id = ? AND status = 'running'`,
    )
    .run(newEndsAt, id);
  return getGiveaway(id);
}

function markEnded(id, winners) {
  getDb()
    .prepare(
      `UPDATE giveaways
       SET status = 'ended', ended_at = datetime('now'), winners_json = ?
       WHERE id = ?`,
    )
    .run(JSON.stringify(winners), id);
  return getGiveaway(id);
}

function setWinners(id, winners) {
  getDb()
    .prepare(`UPDATE giveaways SET winners_json = ? WHERE id = ?`)
    .run(JSON.stringify(winners), id);
  return getGiveaway(id);
}

/**
 * Tirage aléatoire. excludeIds = déjà gagnants / invalides.
 */
function pickWinners(giveawayId, count, excludeIds = []) {
  const entries = listEntries(giveawayId)
    .map((e) => e.user_id)
    .filter((id) => !excludeIds.includes(id));

  if (!entries.length) return [];

  // Fisher-Yates shuffle
  for (let i = entries.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return entries.slice(0, Math.min(count, entries.length));
}

function parseDuration(input) {
  const raw = String(input || '').trim().toLowerCase();
  const match = raw.match(/^(\d+)\s*(s|m|h|d|sec|min|mins|heure|heures|jour|jours|secondes?)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  const unit = (match[2] || 'm').slice(0, 1);
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  if (!mult) return null;
  const ms = n * mult;
  if (ms < 10_000) return null; // min 10s
  if (ms > 60 * 86_400_000) return null; // max 60j
  return ms;
}

function endsAtFromDuration(durationInput) {
  const ms = parseDuration(durationInput);
  if (!ms) return null;
  return new Date(Date.now() + ms).toISOString();
}

module.exports = {
  createGiveaway,
  getGiveaway,
  setMessageId,
  listRunning,
  listDue,
  countEntries,
  listEntries,
  hasEntry,
  join,
  leave,
  cancelGiveaway,
  extendGiveaway,
  markEnded,
  setWinners,
  pickWinners,
  parseDuration,
  endsAtFromDuration,
};
