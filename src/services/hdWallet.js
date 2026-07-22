const bip39 = require('bip39');
const { HDKey } = require('@scure/bip32');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const { ECPairFactory } = require('ecpair');
const { ethers } = require('ethers');
const config = require('../config');

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const COIN_META = {
  btc: {
    id: 'btc',
    label: 'Bitcoin (BTC)',
    emojiKey: 'btc',
    decimals: 8,
    coingecko: 'bitcoin',
    pathPrefix: "m/84'/0'/0'/0",
    network: bitcoin.networks.bitcoin,
  },
  ltc: {
    id: 'ltc',
    label: 'Litecoin (LTC)',
    emojiKey: 'ltc',
    decimals: 8,
    coingecko: 'litecoin',
    pathPrefix: "m/84'/2'/0'/0",
    network: {
      messagePrefix: '\x19Litecoin Signed Message:\n',
      bech32: 'ltc',
      bip32: { public: 0x019da462, private: 0x019d9cfe },
      pubKeyHash: 0x30,
      scriptHash: 0x32,
      wif: 0xb0,
    },
  },
  eth: {
    id: 'eth',
    label: 'Ethereum (ETH)',
    emojiKey: 'eth',
    decimals: 18,
    coingecko: 'ethereum',
    pathPrefix: "m/44'/60'/0'/0",
  },
  usdt: {
    id: 'usdt',
    label: 'USDT (ERC-20)',
    emojiKey: 'usdt',
    decimals: 6,
    coingecko: 'tether',
    pathPrefix: "m/44'/60'/0'/0",
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
      'CRYPTO_MNEMONIC manquant ou invalide. Génère une seed BIP39 et mets-la dans .env',
    );
  }
  const seed = bip39.mnemonicToSeedSync(config.crypto.mnemonic);
  rootKey = HDKey.fromMasterSeed(seed);
  return rootKey;
}

function deriveNode(coinId, index) {
  const meta = COIN_META[coinId];
  if (!meta) throw new Error(`Coin inconnu: ${coinId}`);
  const path = `${meta.pathPrefix}/${index}`;
  const node = getRoot().derive(path);
  if (!node.privateKey) throw new Error(`Impossible de dériver ${path}`);
  return { node, path, meta };
}

function deriveAddress(coinId, index) {
  const { node, path, meta } = deriveNode(coinId, index);

  if (coinId === 'btc' || coinId === 'ltc') {
    const payment = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(node.publicKey),
      network: meta.network,
    });
    return {
      address: payment.address,
      path,
      index,
      coinId,
    };
  }

  const wallet = new ethers.Wallet(Buffer.from(node.privateKey).toString('hex'));
  return {
    address: wallet.address,
    path,
    index,
    coinId,
  };
}

function enabledCoins() {
  if (!isHdConfigured()) return [];
  return config.crypto.enabledCoins
    .filter((id) => COIN_META[id])
    .map((id) => ({ ...COIN_META[id] }));
}

function generateMnemonic() {
  return bip39.generateMnemonic(128);
}

module.exports = {
  COIN_META,
  isHdConfigured,
  deriveAddress,
  enabledCoins,
  generateMnemonic,
};
