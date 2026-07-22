# neyzz-bot-2 — Boutique Discord (style SellAuth)

Bot Discord.js avec **Components V2** (containers), panier multi-articles, PayPal & crypto, livraison auto/manuelle, coupons, avis, dashboard admin — le tout dans Discord.

## Prérequis

- Node.js **18+**
- Bot Discord (token) avec intents : `Server Members` (optionnel mais utile)
- Permissions bot : Manage Channels, Send Messages, Embed Links, Use Application Commands, View Channels
- Hébergement type **Pterodactyl** (ou n’importe quel process Node)

## Installation

```bash
cp .env.example .env
# édite .env

npm install
npm run deploy   # enregistre /boutique /panier /admin
npm start
```

### Pterodactyl

- Startup : `npm install && npm run deploy && npm start`
- Variable `HTTP_PORT` = port alloué par le panel (healthcheck + futur webhook PayPal)

## Configuration rapide

1. Remplis `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`
2. Mets tes rôles admin/staff dans `ADMIN_ROLE_IDS` / `STAFF_ROLE_IDS`
3. (Reco) crée une catégorie commandes → `ORDERS_CATEGORY_ID`
4. Configure PayPal / crypto dans `.env` **ou** via `/admin` → Paiements
5. `/admin` → **Créer un produit** → **Ajouter des clés** → **Poster la boutique**

## Commandes

| Commande | Description |
|----------|-------------|
| `/boutique` | Panel boutique (éphémère) |
| `/panier` | Ton panier |
| `/admin` | Dashboard admin |

Le bouton **Poster la boutique** publie un panel permanent dans le salon courant.

## Flow acheteur

1. Choisit un produit (menu) → ajoute au panier  
2. Code promo optionnel  
3. Choisit PayPal ou Crypto  
4. Un **salon privé** de commande est créé (facture + instructions de paiement)  
5. Client clique **J’ai payé** → staff **Confirmer paiement** → livraison auto (clés) et/ou manuelle  
6. Avis 1–5 après livraison  

## Produits

Configurable :

- Nom, description, prix (€)
- Livraison : `auto` | `manual`
- Stock : `keys` (fichier de clés) | `quantity:N` | `unlimited`

## Emojis — `src/emoji.js`

Tous les emojis du bot passent par ce fichier (Unicode par défaut).

Pour un emoji perso serveur plus tard :

```js
const CUSTOM = {
  cart: '<:panier:1234567890123456789>',
  shop: { id: '1234567890123456789', name: 'boutique' },
};
```

Ou via `/admin` → Emojis (sauvegardé en SQLite, rechargé au démarrage).

## Structure

```
src/
  index.js            # bot + HTTP
  emoji.js            # emojis centralisés
  config.js
  commands/           # slash commands
  handlers/           # boutons / menus / modals
  services/           # produits, panier, commandes, paiements…
  ui/                 # builders Components V2
  db/                 # SQLite
data/shop.db          # créé au runtime
```

## Notes paiements

- **PayPal** : lien `paypal.me` et/ou email + confirmation staff (webhook stub sur `POST /webhooks/paypal`)
- **Crypto** : adresses configurables (BTC/ETH/LTC/USDT) + confirmation staff
- Pas de TVA — montants en €

## Sécurité

- Ne commit **jamais** ton `.env`
- Les clés livrées partent dans le salon commande (visible client + staff)
