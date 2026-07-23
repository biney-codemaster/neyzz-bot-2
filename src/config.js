require('dotenv').config();

function splitIds(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const config = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  guildId: process.env.DISCORD_GUILD_ID || '',

  adminRoleIds: splitIds(process.env.ADMIN_ROLE_IDS),

  shopCategoryId: process.env.SHOP_CATEGORY_ID || null,
  ordersCategoryId: process.env.ORDERS_CATEGORY_ID || null,
  logsChannelId: process.env.LOGS_CHANNEL_ID || null,
  reviewsChannelId: process.env.REVIEWS_CHANNEL_ID || null,

  shopName: process.env.SHOP_NAME || 'Boutique',
  currency: process.env.CURRENCY || 'EUR',
  currencySymbol: process.env.CURRENCY_SYMBOL || '€',

  paypal: {
    email: process.env.PAYPAL_EMAIL || '',
    meUsername: process.env.PAYPAL_ME_USERNAME || '',
  },

  crypto: {
    /** Seed BIP39 — TOUTES les adresses générées t'appartiennent */
    mnemonic: process.env.CRYPTO_MNEMONIC || '',
    /** Seul LTC est supporté */
    enabledCoins: ['ltc'],
    networkNote:
      process.env.CRYPTO_NETWORK_NOTE ||
      'Envoie uniquement du Litecoin (LTC) sur cette adresse.',
    /** Confirmations requises avant livraison auto */
    confirmations: {
      ltc: Number(process.env.CRYPTO_CONF_LTC || 1),
    },
    /** Tolérance sous-paiement (ex: 0.02 = 2%) */
    amountTolerance: Number(process.env.CRYPTO_AMOUNT_TOLERANCE || 0.02),
    /** Intervalle de scan blockchain (ms) */
    watchIntervalMs: Number(process.env.CRYPTO_WATCH_INTERVAL_MS || 15000),
  },

  httpPort: Number(process.env.HTTP_PORT || 3000),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  databasePath: process.env.DATABASE_PATH || './data/shop.db',

  accentColor: 0x2b7cff,
  successColor: 0x2ecc71,
  warnColor: 0xf1c40f,
  dangerColor: 0xe74c3c,
};

module.exports = config;
