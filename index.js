const config = require('./config/default')
const Discord = require("discord.js");

// Create a new webhook
const discordHook = new Discord.WebhookClient(config.discord.webhookId, config.discord.webhookToken);

// Send a message using the webhook
discordHook.send('Test');
