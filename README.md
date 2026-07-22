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
2. **enregistre tout seul** les commandes `/boutique` `/panier` `/admin`
3. démarre le watcher crypto si la seed HD est configurée

Plus besoin de `deploy-commands`.

### Pterodactyl

Startup : `npm install && npm start`

## Crypto HD Wallet — comment TU reçois l'argent

Tu ne mets **pas** ton adresse perso pour encaisser chaque vente (sinon impossible de savoir qui a payé quoi).

À la place :

1. Tu génères une **seed BIP39** (12 mots) → `CRYPTO_MNEMONIC` dans `.env`
2. Pour chaque commande, le bot dérive une **adresse neuve** depuis cette seed
3. Cette adresse n'est **jamais réutilisée** (même si la commande est annulée)
4. Le client paie → le bot détecte la TX on-chain → confirme → **livre en MP**
5. L'argent est déjà **à toi** : toutes ces adresses appartiennent à ta seed

Pour voir / regrouper les fonds :
- BTC/LTC → importe la seed dans **Electrum**
- ETH/USDT → importe la seed dans **MetaMask**
- Ensuite tu envoies tout vers ton cold wallet (`CRYPTO_SWEEP_ADDRESS` est juste une info/rappel)

**Ne partage jamais la mnemonic. Backup offline.**

## Flow acheteur

1. Boutique → panier → PayPal ou Crypto  
2. Salon commande + instructions (aussi en MP si possible)  
3. Crypto : adresse HD unique + montant exact  
4. Détection auto (mempool → confirmations)  
5. Livraison **MP** (auto et manuel)  

## Commandes

| Commande | Rôle |
|----------|------|
| `/boutique` | Panel boutique |
| `/panier` | Panier |
| `/admin` | Dashboard |

## Variables importantes

Voir `.env.example` — surtout :
- `DISCORD_TOKEN` / `DISCORD_CLIENT_ID` / `DISCORD_GUILD_ID`
- `CRYPTO_MNEMONIC`
- `CRYPTO_ENABLED_COINS=btc,eth,ltc,usdt`
