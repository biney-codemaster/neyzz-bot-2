/**
 * Centralisation des emojis du bot.
 *
 * - UNICODE : emojis par défaut (toujours disponibles)
 * - CUSTOM  : remplacements par des emojis perso du serveur
 *             ex. cart: '<:panier:1234567890123456789>'
 *             ou  cart: { id: '123...', name: 'panier', animated: false }
 *
 * Tu peux aussi les écraser via /admin → Emojis, ou en DB (table settings).
 */

const UNICODE = {
  shop: '🏪',
  cart: '🛒',
  product: '📦',
  stock: '📊',
  money: '💶',
  paypal: '💙',
  crypto: '🪙',
  btc: '₿',
  eth: 'Ξ',
  ltc: 'Ł',
  usdt: '₮',
  check: '✅',
  cross: '❌',
  warn: '⚠️',
  info: 'ℹ️',
  lock: '🔒',
  key: '🔑',
  box: '📬',
  invoice: '🧾',
  coupon: '🏷️',
  star: '⭐',
  review: '💬',
  admin: '🛠️',
  settings: '⚙️',
  add: '➕',
  remove: '➖',
  trash: '🗑️',
  edit: '✏️',
  back: '◀️',
  next: '▶️',
  refresh: '🔄',
  user: '👤',
  staff: '🛡️',
  clock: '⏱️',
  success: '✨',
  pending: '⏳',
  delivery: '🚚',
  manual: '🖐️',
  auto: '⚡',
  channel: '📁',
  link: '🔗',
  copy: '📋',
};

/** @type {Record<string, string | { id: string, name: string, animated?: boolean }>} */
const CUSTOM = {
  // Exemple pour plus tard :
  // cart: '<:panier:1234567890123456789>',
  // shop: { id: '1234567890123456789', name: 'boutique', animated: false },
};

/**
 * Retourne l'emoji (string) pour l'affichage texte / labels.
 * @param {keyof typeof UNICODE | string} key
 * @returns {string}
 */
function emoji(key) {
  const custom = CUSTOM[key];
  if (typeof custom === 'string' && custom.length) return custom;
  if (custom && typeof custom === 'object' && custom.id) {
    return `<${custom.animated ? 'a' : ''}:${custom.name}:${custom.id}>`;
  }
  return UNICODE[key] || '';
}

/**
 * Format attendu par setEmoji() de discord.js (boutons / options).
 * @param {keyof typeof UNICODE | string} key
 * @returns {{ name: string, id?: string, animated?: boolean } | undefined}
 */
function emojiComponent(key) {
  const custom = CUSTOM[key];
  if (custom && typeof custom === 'object' && custom.id) {
    return {
      id: custom.id,
      name: custom.name,
      animated: Boolean(custom.animated),
    };
  }
  if (typeof custom === 'string' && custom.startsWith('<')) {
    const match = custom.match(/^<(a?):(\w+):(\d+)>$/);
    if (match) {
      return {
        animated: match[1] === 'a',
        name: match[2],
        id: match[3],
      };
    }
  }
  const uni = (typeof custom === 'string' && custom.length ? custom : UNICODE[key]) || null;
  if (!uni) return undefined;
  // Unicode emoji → { name: '🛒' }
  return { name: uni };
}

/**
 * Remplace / ajoute un emoji custom en mémoire (et optionnellement en DB).
 * @param {string} key
 * @param {string | { id: string, name: string, animated?: boolean }} value
 */
function setCustomEmoji(key, value) {
  CUSTOM[key] = value;
}

/**
 * Charge les overrides depuis un objet plat { key: valueString }.
 * @param {Record<string, string>} map
 */
function loadCustomEmojis(map = {}) {
  for (const [key, value] of Object.entries(map)) {
    if (value) CUSTOM[key] = value;
  }
}

/**
 * Liste toutes les clés disponibles (pour le panel admin).
 */
function listEmojiKeys() {
  return Object.keys(UNICODE);
}

module.exports = {
  UNICODE,
  CUSTOM,
  emoji,
  emojiComponent,
  setCustomEmoji,
  loadCustomEmojis,
  listEmojiKeys,
};
