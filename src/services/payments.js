const config = require('../config');
const { getSetting } = require('../db/database');

function enabledPaymentMethods() {
  const methods = [];
  const paypalEmail = getSetting('paypal_email', config.paypal.email);
  const paypalMe = getSetting('paypal_me', config.paypal.meUsername);
  if (paypalEmail || paypalMe) {
    methods.push({ id: 'paypal', label: 'PayPal', emojiKey: 'paypal' });
  }

  const cryptos = getEnabledCryptos();
  if (cryptos.length) {
    methods.push({ id: 'crypto', label: 'Crypto', emojiKey: 'crypto' });
  }
  return methods;
}

function getEnabledCryptos() {
  const map = [
    { id: 'btc', label: 'Bitcoin (BTC)', emojiKey: 'btc', setting: 'crypto_btc', env: config.crypto.btc },
    { id: 'eth', label: 'Ethereum (ETH)', emojiKey: 'eth', setting: 'crypto_eth', env: config.crypto.eth },
    { id: 'ltc', label: 'Litecoin (LTC)', emojiKey: 'ltc', setting: 'crypto_ltc', env: config.crypto.ltc },
    { id: 'usdt', label: 'USDT', emojiKey: 'usdt', setting: 'crypto_usdt', env: config.crypto.usdt },
  ];
  return map
    .map((c) => ({ ...c, address: getSetting(c.setting, c.env) || '' }))
    .filter((c) => c.address);
}

function buildPaypalPayment(order) {
  const email = getSetting('paypal_email', config.paypal.email);
  const me = getSetting('paypal_me', config.paypal.meUsername);
  const amount = Number(order.total).toFixed(2);
  const link = me
    ? `https://paypal.me/${me}/${amount}${config.currency}`
    : null;

  return {
    method: 'paypal',
    title: 'Paiement PayPal',
    amount,
    email,
    link,
    instructions: [
      link
        ? `1. Ouvre ce lien : ${link}`
        : `1. Envoie **${amount} ${config.currencySymbol}** à \`${email}\` via PayPal`,
      '2. Choisis **Amis et famille** si demandé (ou suis les consignes du staff)',
      `3. Mets la référence **${order.public_id}** dans le message`,
      '4. Clique sur **J\'ai payé** dans ce salon',
      '5. Un staff confirmera ensuite le paiement',
    ].join('\n'),
  };
}

function buildCryptoPayment(order, cryptoId) {
  const cryptos = getEnabledCryptos();
  const coin = cryptos.find((c) => c.id === cryptoId) || (cryptoId ? null : cryptos[0]);
  if (!coin) {
    return {
      method: 'crypto',
      title: 'Paiement Crypto',
      amount: Number(order.total).toFixed(2),
      instructions: `${require('../emoji').emoji('warn')} Choisis d'abord une crypto via le menu (ou redemande au bot).`,
    };
  }

  const note = getSetting('crypto_network_note', config.crypto.networkNote);
  return {
    method: 'crypto',
    crypto: coin,
    title: `Paiement ${coin.label}`,
    amount: Number(order.total).toFixed(2),
    address: coin.address,
    instructions: [
      `1. Envoie l'équivalent de **${Number(order.total).toFixed(2)} ${config.currencySymbol}** en **${coin.label}**`,
      `2. Adresse : \`${coin.address}\``,
      note ? `3. ${note}` : null,
      `4. Mets **${order.public_id}** en mémo si possible`,
      '5. Clique sur **J\'ai payé** et attends la confirmation staff',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

module.exports = {
  enabledPaymentMethods,
  getEnabledCryptos,
  buildPaypalPayment,
  buildCryptoPayment,
};
