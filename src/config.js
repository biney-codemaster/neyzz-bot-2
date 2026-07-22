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
  staffRoleIds: splitIds(process.env.STAFF_ROLE_IDS || process.env.ADMIN_ROLE_IDS),

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
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    mode: process.env.PAYPAL_MODE || 'sandbox',
  },

  crypto: {
    btc: process.env.CRYPTO_BTC_ADDRESS || '',
    eth: process.env.CRYPTO_ETH_ADDRESS || '',
    ltc: process.env.CRYPTO_LTC_ADDRESS || '',
    usdt: process.env.CRYPTO_USDT_ADDRESS || '',
    networkNote: process.env.CRYPTO_NETWORK_NOTE || '',
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
