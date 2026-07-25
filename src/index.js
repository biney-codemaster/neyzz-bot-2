require('dotenv').config();

const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  MessageFlags,
  REST,
  Routes,
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
const { container, text } = require('./ui/v2');
const { emoji } = require('./emoji');
const { isHdConfigured } = require('./services/hdWallet');
const paymentAddresses = require('./services/paymentAddresses');
const shopPanels = require('./services/shopPanels');
const { startCryptoWatcher } = require('./services/cryptoWatcher');
const { startGiveawayScheduler } = require('./services/giveawayRunner');

if (!config.token) {
  console.error('DISCORD_TOKEN manquant dans .env');
  process.exit(1);
}

getDb();
paymentAddresses.ensureSchema();
shopPanels.ensureSchema();
reloadEmojisFromDb();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();
for (const cmd of commands) {
  client.commands.set(cmd.data.name, cmd);
}

/** Enregistre les slash commands au démarrage — plus besoin de deploy-commands.js */
async function registerSlashCommands() {
  if (!config.clientId) {
    console.warn(
      `${emoji('warn')} DISCORD_CLIENT_ID missing — slash commands will not be registered.`,
    );
    return;
  }

  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(
      `${emoji('check')} Slash commands registered on guild ${config.guildId} (${body.length})`,
    );
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`${emoji('check')} Slash commands registered globally (${body.length})`);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`${emoji('check')} Logged in as ${c.user.tag}`);
  console.log(`${emoji('shop')} Shop: ${config.shopName}`);

  try {
    await registerSlashCommands();
  } catch (e) {
    console.error(`${emoji('cross')} Failed to register slash commands:`, e.message);
  }

  if (isHdConfigured()) {
    console.log(`${emoji('crypto')} HD wallet ready (BIP44 / Exodus)`);
    try {
      await paymentAddresses.syncCountersPastUsedAddresses({ maxScan: 40 });
    } catch (e) {
      console.warn(`${emoji('warn')} HD address sync:`, e.message);
    }
    startCryptoWatcher(client);
  } else {
    console.warn(
      `${emoji('warn')} CRYPTO_MNEMONIC missing/invalid — HD crypto payments disabled`,
    );
  }

  startGiveawayScheduler(client);
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
          text(
            `${emoji('cross')} Something went wrong.\n\`\`\`${String(error.message || error).slice(0, 500)}\`\`\``,
          ),
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
  res.json({
    ok: true,
    bot: client.user?.tag || null,
    shop: config.shopName,
    hdWallet: isHdConfigured(),
  });
});

app.listen(config.httpPort, () => {
  console.log(`${emoji('link')} HTTP listening on :${config.httpPort}`);
});

client.login(config.token);
