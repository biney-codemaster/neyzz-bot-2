const { getDb } = require('../db/database');

function ensureSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS shop_panels (
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      guild_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (channel_id, message_id)
    );
  `);
}

function registerShopPanel({ channelId, messageId, guildId = null }) {
  ensureSchema();
  getDb()
    .prepare(
      `INSERT INTO shop_panels (channel_id, message_id, guild_id)
       VALUES (?, ?, ?)
       ON CONFLICT(channel_id, message_id) DO UPDATE SET guild_id = excluded.guild_id`,
    )
    .run(String(channelId), String(messageId), guildId ? String(guildId) : null);
}

function unregisterShopPanel(channelId, messageId) {
  ensureSchema();
  getDb()
    .prepare('DELETE FROM shop_panels WHERE channel_id = ? AND message_id = ?')
    .run(String(channelId), String(messageId));
}

function listShopPanels() {
  ensureSchema();
  return getDb().prepare('SELECT * FROM shop_panels').all();
}

/**
 * Réactualise tous les panels boutique postés (après modif produits/stock).
 */
async function refreshAllShopPanels(client) {
  ensureSchema();
  const { buildShopPanel } = require('../ui/shop');
  const panels = listShopPanels();
  if (!panels.length || !client) return { updated: 0, removed: 0 };

  const payload = buildShopPanel();
  let updated = 0;
  let removed = 0;

  for (const panel of panels) {
    try {
      const channel = await client.channels.fetch(panel.channel_id).catch(() => null);
      if (!channel?.isTextBased()) {
        unregisterShopPanel(panel.channel_id, panel.message_id);
        removed += 1;
        continue;
      }
      const msg = await channel.messages.fetch(panel.message_id).catch(() => null);
      if (!msg) {
        unregisterShopPanel(panel.channel_id, panel.message_id);
        removed += 1;
        continue;
      }
      await msg.edit(payload);
      updated += 1;
    } catch (e) {
      console.warn(
        `[shop-panels] refresh fail ${panel.channel_id}/${panel.message_id}:`,
        e.message,
      );
    }
  }

  return { updated, removed };
}

module.exports = {
  ensureSchema,
  registerShopPanel,
  unregisterShopPanel,
  listShopPanels,
  refreshAllShopPanels,
};
