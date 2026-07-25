/**
 * Centralisation des emojis du bot.
 *
 * - UNICODE : pour le texte (TextDisplay)
 * - COMPONENT : emojis Discord-safe pour boutons / select (pas de ₿ Ξ Ł ₮ etc.)
 * - CUSTOM : remplacements perso serveur
 */

const UNICODE = {
  shop: '🏪',
  cart: '🛒',
  product: '📦',
  stock: '📊',
  money: '💶',
  paypal: '💙',
  crypto: '🪙',
  ltc: 'Ł',
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
  gift: '🎁',
  party: '🎉',
  trophy: '🏆',
  leave: '🚪',
};

/** Emojis valides pour setEmoji() Discord (boutons / menus) */
const COMPONENT = {
  shop: '🏪',
  cart: '🛒',
  product: '📦',
  stock: '📊',
  money: '💶',
  paypal: '💙',
  crypto: '🪙',
  ltc: '⚪',
  check: '✅',
  cross: '❌',
  warn: '⚠️',
  info: 'ℹ️',
  lock: '🔒',
  key: '🔑',
  box: '📬',
  invoice: '🧾',
  coupon: '🎫',
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
  manual: '✋',
  auto: '⚡',
  channel: '📁',
  link: '🔗',
  copy: '📋',
  gift: '🎁',
  party: '🎉',
  trophy: '🏆',
  leave: '🚪',
};

/** @type {Record<string, string | { id: string, name: string, animated?: boolean }>} */
const CUSTOM = {};

function emoji(key) {
  const custom = CUSTOM[key];
  if (typeof custom === 'string' && custom.length) return custom;
  if (custom && typeof custom === 'object' && custom.id) {
    return `<${custom.animated ? 'a' : ''}:${custom.name}:${custom.id}>`;
  }
  return UNICODE[key] || '';
}

/**
 * Format pour setEmoji() — jamais de symboles invalides (₿, Ξ…).
 */
function emojiComponent(key) {
  const custom = CUSTOM[key];
  if (custom && typeof custom === 'object' && custom.id) {
    return {
      id: custom.id,
      name: custom.name || 'emoji',
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
  // Custom unicode valide uniquement s'il est aussi dans COMPONENT ou est un emoji "standard"
  if (typeof custom === 'string' && custom.length && COMPONENT[key]) {
    // Si custom est un short unicode douteux, préférer COMPONENT
    if (/^[₿ΞŁ₮]$/.test(custom)) {
      return { name: COMPONENT[key] };
    }
    return { name: custom };
  }
  const safe = COMPONENT[key];
  if (!safe) return undefined;
  return { name: safe };
}

function setCustomEmoji(key, value) {
  CUSTOM[key] = value;
}

function loadCustomEmojis(map = {}) {
  for (const [key, value] of Object.entries(map)) {
    if (value) CUSTOM[key] = value;
  }
}

function listEmojiKeys() {
  return Object.keys(UNICODE);
}

module.exports = {
  UNICODE,
  COMPONENT,
  CUSTOM,
  emoji,
  emojiComponent,
  setCustomEmoji,
  loadCustomEmojis,
  listEmojiKeys,
};
