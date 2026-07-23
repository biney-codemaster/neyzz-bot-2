# neyzz-bot-2 — Boutique Discord (style SellAuth)

Bot Discord.js **Components V2** : panier, PayPal, crypto HD wallet (adresse unique / paiement), livraison **toujours en MP**.

## Lancer

```bash
cp .env.example .env
# remplis DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, CRYPTO_MNEMONIC…

npm install
npm start
```

Au démarrage, `index.js` :
1. connecte le bot
2. **enregistre tout seul** les commandes `/panier` `/admin` `/rename` `/giveaway` `/reroll`
3. démarre le watcher crypto si la seed HD est configurée + scheduler giveaways

Plus besoin de `deploy-commands`.

La boutique se poste via `/admin` → **Poster la boutique** (panel permanent).

### Pterodactyl

Startup : `npm install && npm start`

## Crypto (Exodus)

1. Mets ta **seed Exodus** dans `CRYPTO_MNEMONIC`
2. Chaque commande génère une adresse neuve (BIP44, comme Exodus)
3. Le client paie → détection auto → livraison en MP
4. Les fonds apparaissent dans **ton Exodus** (même seed)

**Ne partage jamais la mnemonic.**

## Flow acheteur

1. Boutique → panier → PayPal ou Crypto  
2. Salon commande + instructions de paiement  
3. Crypto : adresse HD unique + montant exact  
4. Détection auto → livraison **MP**  
5. Fermer → transcript HTML (MP + logs)  

## Commandes

| Commande | Rôle |
|----------|------|
| `/panier` | Panier |
| `/admin` | Dashboard (+ Poster la boutique) |
| `/rename` | Renommer un ticket de commande |
| `/giveaway create\|list\|cancel\|extend` | Giveaways (admin) |
| `/reroll` | Relancer un tirage terminé (admin) |

### Giveaways

- Boutons **Participer** / **Quitter**
- Conditions optionnelles : rôle, âge du compte, ancienneté serveur
- Tirage auto à la fin (ignore les membres partis)
- Annonce des gagnants dans un **nouveau message**
- Lot = texte libre (pas lié à la boutique)

## Variables importantes

Voir `.env.example` — surtout :
- `DISCORD_TOKEN` / `DISCORD_CLIENT_ID` / `DISCORD_GUILD_ID`
- `CRYPTO_MNEMONIC`
- `CRYPTO_ENABLED_COINS=btc,eth,ltc,usdt`
