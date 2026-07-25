# neyzz-bot-2 — Discord shop bot (SellAuth-style)

Discord.js **Components V2** bot: cart, PayPal, Litecoin HD wallet (unique address per payment), delivery **always by DM**.

Public UI is **English**. Admin dashboard (`/admin`) stays **French**.

## Run

```bash
cp .env.example .env
# fill DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, CRYPTO_MNEMONIC…

npm install
npm start
```

On boot, `index.js`:
1. connects the bot
2. **registers** slash commands `/cart` `/admin` `/rename` `/renew` `/giveaway` `/reroll`
3. starts the crypto watcher (if HD seed is set) + giveaway scheduler

No separate `deploy-commands` needed.

Post the shop via `/admin` → **Poster la boutique** (permanent panel).

### Pterodactyl

Startup: `npm install && npm start`

## Crypto (Exodus — Litecoin only)

1. Put your **Exodus seed** in `CRYPTO_MNEMONIC`
2. Each order gets a new LTC address (BIP44 `m/44'/2'/0'/0`)
3. Customer pays LTC → auto detect → DM delivery
4. Funds show up in **your Exodus** (same seed)

**Never share the mnemonic.**

## Buyer flow

1. Shop → cart → PayPal or Litecoin (LTC)  
2. Order channel + payment instructions  
3. LTC: unique HD address + exact amount  
4. Auto detect → **DM** delivery  
5. Close → HTML transcript (DM + logs)  

## Commands

| Command | Role |
|---------|------|
| `/cart` | Cart |
| `/admin` | Dashboard (French UI, + post shop) |
| `/rename` | Rename an order ticket (admin) |
| `/renew` | Recreate current channel in place (admin) |
| `/giveaway create\|list\|cancel\|extend` | Giveaways (admin) |
| `/reroll` | Reroll an ended giveaway (admin) |

### Giveaways

- **Enter** / **Leave** buttons
- Optional requirements: role, account age, server age
- Auto draw at the end (skips members who left)
- Winners announced in a **new message**
- Prize = free text (not linked to the shop)

## Important env vars

See `.env.example` — especially:
- `DISCORD_TOKEN` / `DISCORD_CLIENT_ID` / `DISCORD_GUILD_ID`
- `CRYPTO_MNEMONIC` (Litecoin only)
