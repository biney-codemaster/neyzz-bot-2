# neyzz-bot-2 — Discord Nitro shop

Discord.js **Components V2** bot specialized for **Discord Nitro 1 Month** gift links.

- Public UI: **English**
- Admin dashboard (`/admin`): **French**
- Payments: PayPal + Litecoin (HD / Exodus)
- Delivery: **plain DM messages** (1 gift link = 1 message) so Discord shows the gift embed

## Flow

1. Shop → **Buy Nitro** → quantity modal → confirm → PayPal / LTC  
2. Private order channel + payment instructions  
3. Auto delivery by DM (plain gift links)  
4. Close → HTML transcript  

## Run

```bash
cp .env.example .env
npm install
npm start
```

Slash commands register on boot: `/admin` `/rename` `/renew` `/giveaway` `/reroll`

Post the shop via `/admin` → **Poster la boutique**.

### Pterodactyl

`npm install && npm start`

## Admin

1. Create product **Nitro 1 Month** (auto + gift links stock)
2. **Ajouter des liens** — one `https://discord.gift/...` per line
3. Set price anytime from product manage / recreate with new price via edit flow
4. Configure PayPal + `CRYPTO_MNEMONIC` for LTC

## Commands

| Command | Role |
|---------|------|
| `/admin` | Dashboard (FR) |
| `/rename` | Rename order ticket |
| `/renew` | Recreate any text channel in place |
| `/giveaway` / `/reroll` | Giveaways |

## Env

See `.env.example` — `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `CRYPTO_MNEMONIC`.
