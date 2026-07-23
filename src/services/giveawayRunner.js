const giveaways = require('./giveaways');
const {
  buildGiveawayPanel,
  buildWinnersMessage,
  buildRerollMessage,
} = require('../ui/giveaway');
const { emoji } = require('../emoji');

const DAY_MS = 86_400_000;

async function fetchMemberSafe(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
}

/**
 * Vérifie les conditions du giveaway pour un membre.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function checkEligibility(g, member) {
  if (!member) {
    return { ok: false, reason: 'Tu dois être membre du serveur pour participer.' };
  }

  if (g.required_role_id && !member.roles.cache.has(g.required_role_id)) {
    return {
      ok: false,
      reason: `Il te faut le rôle <@&${g.required_role_id}> pour participer.`,
    };
  }

  if (g.min_account_days > 0) {
    const ageMs = Date.now() - member.user.createdTimestamp;
    if (ageMs < g.min_account_days * DAY_MS) {
      return {
        ok: false,
        reason: `Ton compte Discord doit avoir au moins **${g.min_account_days}** jour(s).`,
      };
    }
  }

  if (g.min_server_days > 0) {
    const joined = member.joinedTimestamp || 0;
    const ageMs = Date.now() - joined;
    if (ageMs < g.min_server_days * DAY_MS) {
      return {
        ok: false,
        reason: `Tu dois être sur le serveur depuis au moins **${g.min_server_days}** jour(s).`,
      };
    }
  }

  return { ok: true };
}

async function getChannelMessage(client, g) {
  try {
    const channel = await client.channels.fetch(g.channel_id);
    if (!channel?.isTextBased?.()) return { channel: null, message: null };
    if (!g.message_id) return { channel, message: null };
    const message = await channel.messages.fetch(g.message_id).catch(() => null);
    return { channel, message };
  } catch {
    return { channel: null, message: null };
  }
}

async function refreshGiveawayMessage(client, giveawayId) {
  const g = giveaways.getGiveaway(giveawayId);
  if (!g || !g.message_id) return;

  const { message } = await getChannelMessage(client, g);
  if (!message) return;

  const ended = g.status === 'ended';
  const cancelled = g.status === 'cancelled';
  await message.edit(buildGiveawayPanel(g, { ended, cancelled }));
}

async function filterStillInGuild(guild, userIds) {
  const present = [];
  for (const id of userIds) {
    const member = await fetchMemberSafe(guild, id);
    if (member) present.push(id);
  }
  return present;
}

/**
 * Tirage auto : ignore les participants qui ont quitté le serveur.
 */
async function endGiveaway(client, giveawayId) {
  const g = giveaways.getGiveaway(giveawayId);
  if (!g || g.status !== 'running') return null;

  const guild = await client.guilds.fetch(g.guild_id).catch(() => null);
  if (!guild) {
    giveaways.markEnded(g.id, []);
    return giveaways.getGiveaway(g.id);
  }

  const entryIds = giveaways.listEntries(g.id).map((e) => e.user_id);
  const eligible = await filterStillInGuild(guild, entryIds);
  const winners = pickFromList(eligible, g.winners_count);
  const ended = giveaways.markEnded(g.id, winners);

  const { channel, message } = await getChannelMessage(client, ended);
  if (message) {
    try {
      await message.edit(buildGiveawayPanel(ended, { ended: true }));
    } catch (e) {
      console.warn('[giveaway] edit panel:', e.message);
    }
  }

  if (channel) {
    try {
      await channel.send(buildWinnersMessage(ended, winners));
    } catch (e) {
      console.warn('[giveaway] winners message:', e.message);
    }
  }

  return ended;
}

function pickFromList(ids, count) {
  const pool = [...ids];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/**
 * Reroll : nouveaux gagnants hors anciens, toujours présents sur le serveur.
 */
async function rerollGiveaway(client, giveawayId, count = null) {
  const g = giveaways.getGiveaway(giveawayId);
  if (!g) return { ok: false, error: 'Giveaway introuvable.' };
  if (g.status !== 'ended') {
    return { ok: false, error: 'Le giveaway doit être terminé pour reroll.' };
  }

  const guild = await client.guilds.fetch(g.guild_id).catch(() => null);
  if (!guild) return { ok: false, error: 'Serveur introuvable.' };

  const exclude = new Set(g.winners || []);
  const entryIds = giveaways
    .listEntries(g.id)
    .map((e) => e.user_id)
    .filter((id) => !exclude.has(id));

  const eligible = await filterStillInGuild(guild, entryIds);
  const n = count && count > 0 ? count : g.winners_count;
  const winners = pickFromList(eligible, n);

  if (!winners.length) {
    return { ok: false, error: 'Aucun participant éligible pour un reroll.' };
  }

  const merged = [...(g.winners || []), ...winners];
  const updated = giveaways.setWinners(g.id, merged);

  const { channel } = await getChannelMessage(client, updated);
  if (channel) {
    await channel.send(buildRerollMessage(updated, winners));
  }

  return { ok: true, giveaway: updated, winners };
}

async function cancelAndRefresh(client, giveawayId) {
  const g = giveaways.cancelGiveaway(giveawayId);
  if (!g) return null;
  await refreshGiveawayMessage(client, g.id);
  return g;
}

async function extendAndRefresh(client, giveawayId, newEndsAt) {
  const g = giveaways.extendGiveaway(giveawayId, newEndsAt);
  if (!g) return null;
  await refreshGiveawayMessage(client, g.id);
  return g;
}

let timer = null;

function startGiveawayScheduler(client, { intervalMs = 15_000 } = {}) {
  if (timer) clearInterval(timer);

  const tick = async () => {
    try {
      const due = giveaways.listDue();
      for (const g of due) {
        try {
          await endGiveaway(client, g.id);
          console.log(`${emoji('gift')} Giveaway #${g.id} tiré`);
        } catch (e) {
          console.warn(`[giveaway] end #${g.id}:`, e.message);
        }
      }
    } catch (e) {
      console.warn('[giveaway] scheduler:', e.message);
    }
  };

  timer = setInterval(tick, intervalMs);
  tick();
  console.log(`${emoji('gift')} Scheduler giveaways démarré`);
  return timer;
}

module.exports = {
  checkEligibility,
  refreshGiveawayMessage,
  endGiveaway,
  rerollGiveaway,
  cancelAndRefresh,
  extendAndRefresh,
  startGiveawayScheduler,
  fetchMemberSafe,
};
