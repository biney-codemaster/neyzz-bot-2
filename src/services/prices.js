const { COIN_META } = require('./hdWallet');

const cache = new Map();
const TTL_MS = 60_000;

async function getEurPrice(coinId) {
  const meta = COIN_META[coinId];
  if (!meta) throw new Error(`Coin inconnu: ${coinId}`);

  const cached = cache.get(coinId);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.price;

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${meta.coingecko}&vs_currencies=eur`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Prix ${coinId} indisponible (${res.status})`);
  const data = await res.json();
  const price = data?.[meta.coingecko]?.eur;
  if (!price) throw new Error(`Prix EUR introuvable pour ${coinId}`);
  cache.set(coinId, { price, at: Date.now() });
  return price;
}

/**
 * Convertit un montant EUR vers le coin, avec précision adaptée.
 */
async function eurToCryptoAmount(coinId, eurAmount) {
  const meta = COIN_META[coinId];
  const price = await getEurPrice(coinId);
  const raw = Number(eurAmount) / price;

  // Arrondi "safe" pour paiement: un peu de précision mais lisible
  const decimals = Math.min(8, meta.decimals);
  const factor = 10 ** decimals;
  const amount = Math.ceil(raw * factor) / factor;
  return {
    amount,
    amountStr: amount.toFixed(decimals),
    priceEur: price,
    decimals,
  };
}

module.exports = {
  getEurPrice,
  eurToCryptoAmount,
};
