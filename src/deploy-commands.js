require('dotenv').config();
const { REST, Routes } = require('discord.js');
const config = require('./config');
const commands = require('./commands');

async function main() {
  if (!config.token || !config.clientId) {
    console.error('DISCORD_TOKEN et DISCORD_CLIENT_ID requis.');
    process.exit(1);
  }

  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body,
    });
    console.log(`Commandes déployées sur le guild ${config.guildId} (${body.length}).`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`Commandes déployées globalement (${body.length}).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
