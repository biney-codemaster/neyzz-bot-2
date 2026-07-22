require('dotenv').config();

const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  MessageFlags,
} = require('discord.js');

const config = require('./config');
const { getDb } = require('./db/database');
const commands = require('./commands');
const {
  handleButton,
  handleSelect,
  handleModal,
  reloadEmojisFromDb,
} = require('./handlers/interactions');
const { container, text, V2 } = require('./ui/v2');
const { emoji } = require('./emoji');

if (!config.token) {
  console.error('DISCORD_TOKEN manquant dans .env');
  process.exit(1);
}

getDb();
reloadEmojisFromDb();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();
for (const cmd of commands) {
  client.commands.set(cmd.data.name, cmd);
}

client.once(Events.ClientReady, (c) => {
  console.log(`${emoji('check')} Connecté en tant que ${c.user.tag}`);
  console.log(`${emoji('shop')} Boutique: ${config.shopName}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (error) {
    console.error('Interaction error:', error);
    const payload = {
      components: [
        container(config.dangerColor).addTextDisplayComponents(
          text(`${emoji('cross')} Une erreur est survenue.\n\`\`\`${String(error.message || error).slice(0, 500)}\`\`\``),
        ),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch {
      /* ignore */
    }
  }
});

const app = express();
app.use(express.json({ type: '*/*' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, bot: client.user?.tag || null, shop: config.shopName });
});

app.post('/webhooks/paypal', (req, res) => {
  // Hook prêt pour validation PayPal (à brancher avec PAYPAL_WEBHOOK_ID)
  console.log('PayPal webhook reçu:', JSON.stringify(req.body).slice(0, 500));
  res.sendStatus(200);
});

app.listen(config.httpPort, () => {
  console.log(`${emoji('link')} HTTP listening on :${config.httpPort}`);
});

client.login(config.token);
