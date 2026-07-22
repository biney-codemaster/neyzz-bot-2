const config = require('../config');
const { getSetting } = require('../db/database');
const { isHdConfigured, enabledCoins, COIN_META } = require('./hdWallet');
const paymentAddresses = require('./paymentAddresses');
const prices = require('./prices');
const { emoji } = require('../emoji');

function enabledPaymentMethods() {
  const methods = [];
  const paypalEmail = getSetting('paypal_email', config.paypal.email);
  const paypalMe = getSetting('paypal_me', config.paypal.meUsername);
  if (paypalEmail || paypalMe) {
    methods.push({ id: 'paypal', label: 'PayPal', emojiKey: 'paypal' });
  }

  if (getEnabledCryptos().length) {
    methods.push({ id: 'crypto', label: 'Crypto', emojiKey: 'crypto' });
  }
  return methods;
}

function getEnabledCryptos() {
  // Mode HD wallet (recommandé)
  if (isHdConfigured()) {
    return enabledCoins().map((c) => ({
      id: c.id,
      label: c.label,
      emojiKey: c.emojiKey,
      hd: true,
      address: null,
    }));
  }

  // Fallback legacy: adresses statiques (déconseillé — pas de détection fiable multi-paiements)
  const map = [
    { id: 'btc', label: 'Bitcoin (BTC)', emojiKey: 'btc', setting: 'crypto_btc', env: '' },
    { id: 'eth', label: 'Ethereum (ETH)', emojiKey: 'eth', setting: 'crypto_eth', env: '' },
    { id: 'ltc', label: 'Litecoin (LTC)', emojiKey: 'ltc', setting: 'crypto_ltc', env: '' },
    { id: 'usdt', label: 'USDT', emojiKey: 'usdt', setting: 'crypto_usdt', env: '' },
  ];
  return map
    .map((c) => ({ ...c, address: getSetting(c.setting, '') || '', hd: false }))
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
      '5. Un staff confirmera ensuite (PayPal n\'est pas auto on-chain)',
    ].join('\n'),
  };
}

/**
 * Prépare le paiement crypto: alloue une adresse HD unique + montant exact.
 */
async function prepareCryptoPayment(order, cryptoId) {
  const coin = cryptoId || order.crypto_currency;
  if (!coin || !COIN_META[coin]) throw new Error('Crypto invalide');

  if (!isHdConfigured()) {
    throw new Error('HD wallet non configuré — ajoute CRYPTO_MNEMONIC dans .env');
  }

  const quote = await prices.eurToCryptoAmount(coin, order.total);
  const row = paymentAddresses.allocateAddressForOrder({
    orderId: order.id,
    coin,
    expectedAmount: quote.amountStr,
    expectedAmountEur: order.total,
  });

  return buildCryptoPaymentFromRow(order, row, quote);
}

function buildCryptoPaymentFromRow(order, row, quote = null) {
  const meta = COIN_META[row.coin];
  const conf = config.crypto.confirmations[row.coin] ?? 1;
  const amountStr = row.expected_amount;
  const note = getSetting('crypto_network_note', config.crypto.networkNote);

  return {
    method: 'crypto',
    crypto: { id: row.coin, label: meta.label, emojiKey: meta.emojiKey },
    title: `Paiement ${meta.label}`,
    amount: amountStr,
    amountEur: order.total,
    address: row.address,
    path: row.derivation_path,
    quote,
    instructions: [
      `${emoji('crypto')} Envoie **exactement** \`${amountStr} ${row.coin.toUpperCase()}\``,
      `(≈ **${Number(order.total).toFixed(2)} ${config.currencySymbol}**)`,
      '',
      `${emoji('lock')} Adresse unique (1 seule utilisation) :`,
      `\`${row.address}\``,
      '',
      note ? `${emoji('warn')} ${note}` : null,
      `${emoji('clock')} Dès que le réseau confirme (≥ ${conf} conf), livraison **auto en MP**.`,
      `${emoji('info')} N'envoie rien d'autre sur cette adresse.`,
      `${emoji('lock')} Chemin HD : \`${row.derivation_path}\``,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function buildCryptoPayment(order, cryptoId) {
  const row = paymentAddresses.getAddressByOrder(order.id);
  if (row) return buildCryptoPaymentFromRow(order, row);

  // Pas encore allouée (ex: panel avant prepare) — message placeholder
  const meta = COIN_META[cryptoId || order.crypto_currency];
  return {
    method: 'crypto',
    title: meta ? `Paiement ${meta.label}` : 'Paiement Crypto',
    amount: Number(order.total).toFixed(2),
    instructions: `${emoji('pending')} Génération de l'adresse HD en cours…`,
  };
}

module.exports = {
  enabledPaymentMethods,
  getEnabledCryptos,
  buildPaypalPayment,
  buildCryptoPayment,
  prepareCryptoPayment,
};
