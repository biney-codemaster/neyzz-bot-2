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
    methods.push({ id: 'crypto', label: 'Litecoin (LTC)', emojiKey: 'ltc' });
  }
  return methods;
}

function getEnabledCryptos() {
  if (!isHdConfigured()) return [];
  return enabledCoins().map((c) => ({
    id: c.id,
    label: c.label,
    emojiKey: c.emojiKey,
    hd: true,
    address: null,
  }));
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
    title: 'PayPal payment',
    amount,
    email,
    link,
    instructions: [
      link
        ? `1. Open this link: ${link}`
        : `1. Send **${amount} ${config.currencySymbol}** to \`${email}\` via PayPal`,
      '2. Choose **Friends and family** if asked (or follow the shop instructions)',
      `3. Put the reference **${order.public_id}** in the payment note`,
      '4. Click **I paid** in this channel',
      '5. An admin will then confirm the payment (manual PayPal)',
    ].join('\n'),
  };
}

/**
 * Prepare crypto payment: allocate a unique HD address + exact amount.
 */
async function prepareCryptoPayment(order, cryptoId) {
  const coin = 'ltc';
  if (cryptoId && cryptoId !== 'ltc') throw new Error('Only Litecoin (LTC) is supported');
  if (!COIN_META[coin]) throw new Error('Invalid crypto');

  if (!isHdConfigured()) {
    throw new Error('HD wallet not configured — add CRYPTO_MNEMONIC to .env');
  }

  const quote = await prices.eurToCryptoAmount(coin, order.total);
  const row = await paymentAddresses.allocateAddressForOrder({
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
    title: `${meta.label} payment`,
    amount: amountStr,
    amountEur: order.total,
    address: row.address,
    path: row.derivation_path,
    quote,
    instructions: [
      `${emoji('crypto')} Send **exactly** \`${amountStr} ${row.coin.toUpperCase()}\``,
      `(≈ **${Number(order.total).toFixed(2)} ${config.currencySymbol}**)`,
      '',
      `${emoji('lock')} Unique address (single use):`,
      `\`${row.address}\``,
      '',
      note ? `${emoji('warn')} ${note}` : null,
      `${emoji('clock')} Once the network confirms (≥ ${conf} conf), delivery is **automatic by DM**.`,
      `${emoji('info')} Do not send anything else to this address.`,
      `${emoji('lock')} HD path: \`${row.derivation_path}\``,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function buildCryptoPayment(order, cryptoId) {
  const row = paymentAddresses.getAddressByOrder(order.id);
  if (row) return buildCryptoPaymentFromRow(order, row);

  const meta = COIN_META[cryptoId || order.crypto_currency];
  return {
    method: 'crypto',
    title: meta ? `${meta.label} payment` : 'Crypto payment',
    amount: Number(order.total).toFixed(2),
    instructions: `${emoji('pending')} Generating HD address…`,
  };
}

module.exports = {
  enabledPaymentMethods,
  getEnabledCryptos,
  buildPaypalPayment,
  buildCryptoPayment,
  prepareCryptoPayment,
};
