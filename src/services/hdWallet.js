const bip39 = require('bip39');
const HDKey = require('hdkey');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const wif = require('wif');
const config = require('../config');

bitcoin.initEccLib(ecc);

/**
 * Litecoin uniquement — chemin BIP44 Exodus : m/44'/2'/0'/0 → adresses L…
 * Mets ta seed Exodus dans CRYPTO_MNEMONIC → les paiements apparaissent dans Exodus.
 */
const COIN_META = {
  ltc: {
    id: 'ltc',
    label: 'Litecoin (LTC)',
    emojiKey: 'ltc',
    decimals: 8,
    coingecko: 'litecoin',
    pathPrefix: "m/44'/2'/0'/0",
    script: 'p2pkh',
    network: {
      messagePrefix: '\x19Litecoin Signed Message:\n',
      bech32: 'ltc',
      bip32: { public: 0x019da462, private: 0x019d9cfe },
      pubKeyHash: 0x30,
      scriptHash: 0x32,
      wif: 0xb0,
    },
  },
};

let rootKey = null;

function isHdConfigured() {
  return Boolean(config.crypto.mnemonic && bip39.validateMnemonic(config.crypto.mnemonic));
}

function getRoot() {
  if (rootKey) return rootKey;
  if (!isHdConfigured()) {
    throw new Error(
      'CRYPTO_MNEMONIC manquant ou invalide. Mets ta seed Exodus (12 mots) dans .env',
    );
  }
  const seed = bip39.mnemonicToSeedSync(config.crypto.mnemonic);
  rootKey = HDKey.fromMasterSeed(seed);
  return rootKey;
}

function resetRootCache() {
  rootKey = null;
}

function deriveNode(coinId, index) {
  const meta = COIN_META[coinId];
  if (!meta) throw new Error(`Coin inconnu: ${coinId} (seul LTC est supporté)`);
  const path = `${meta.pathPrefix}/${index}`;
  const node = getRoot().derive(path);
  if (!node.privateKey) throw new Error(`Impossible de dériver ${path}`);
  return { node, path, meta };
}

function deriveAddress(coinId, index) {
  const id = coinId === 'ltc' ? 'ltc' : coinId;
  const { node, path, meta } = deriveNode(id, index);

  const payment =
    meta.script === 'p2wpkh'
      ? bitcoin.payments.p2wpkh({ pubkey: node.publicKey, network: meta.network })
      : bitcoin.payments.p2pkh({ pubkey: node.publicKey, network: meta.network });

  return {
    address: payment.address,
    path,
    index,
    coinId: 'ltc',
  };
}

function exportPrivateKey(coinId, index) {
  const { node, path, meta } = deriveNode(coinId === 'ltc' ? 'ltc' : coinId, index);
  const derived = deriveAddress('ltc', index);
  const encoded = wif.encode({
    version: meta.network.wif,
    privateKey: Buffer.from(node.privateKey),
    compressed: true,
  });
  return {
    ...derived,
    wif: encoded,
    privateKeyHex: node.privateKey.toString('hex'),
  };
}

function enabledCoins() {
  if (!isHdConfigured()) return [];
  // Force LTC uniquement, même si .env liste d'autres coins
  if (!config.crypto.enabledCoins.includes('ltc')) return [];
  return [{ ...COIN_META.ltc }];
}

function generateMnemonic() {
  return bip39.generateMnemonic(128);
}

function verifyPaymentAddress(row) {
  if (!row) return { ok: false, error: 'Adresse introuvable' };
  try {
    const derived = deriveAddress('ltc', row.address_index);
    const match = derived.address.toLowerCase() === String(row.address).toLowerCase();
    return {
      ok: match,
      expected: derived.address,
      stored: row.address,
      path: derived.path,
      error: match
        ? null
        : 'La seed actuelle ne correspond PAS à cette adresse (mauvaise CRYPTO_MNEMONIC ?)',
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  COIN_META,
  isHdConfigured,
  deriveAddress,
  exportPrivateKey,
  verifyPaymentAddress,
  enabledCoins,
  generateMnemonic,
  resetRootCache,
};
