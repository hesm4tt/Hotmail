const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- CONFIGURATION (Safe Version) ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; 
const CLIENT_KEY = process.env.CLIENT_KEY; 
// ------------------------------------

// ---------------------

// 1. DUMMY WEB SERVER (Required for Render Free Tier)
const app = express();
app.get('/', (req, res) => res.send('Bot is online and healthy!'));
app.listen(process.env.PORT || 3000, () => console.log('Web health-check server ready.'));

// 2. DISCORD BOT LOGIC
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Command: !check [AccountString]
    if (message.content.startsWith('!check')) {
        const args = message.content.split(' ');
        const accountString = args[1];

        if (!accountString) {
            return message.reply('⚠️ **Usage:** `!check Email:Pass:Token:ID`');
        }

        try {
            // Inform the user we are working on it
            const loadingMsg = await message.reply('🔍 Fetching latest email...');

            const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', {
                params: {
                    clientKey: CLIENT_KEY, // Using the hardcoded variable
                    account: accountString, // The input from Discord
                    [span_5](start_span)folder: 'inbox'         // Options: inbox, junkemail[span_5](end_span)
                }
            });

            const result = response.data;

            if (result.success) {
                const embed = new EmbedBuilder()
                    .setTitle('📧 Latest Email Found')
                    .setColor(0x5865F2)
                    .setDescription(`\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``)
                    .setTimestamp();

                await loadingMsg.edit({ content: '✅ Done!', embeds: [embed] });
            } else {
                await loadingMsg.edit(`❌ **API Error:** ${result.code || 'Check account data format.'}`);
            }
        } catch (error) {
            console.error(error);
            message.reply('🔥 **System Error:** Failed to connect to Hotmail007 servers.');
        }
    }
});

client.login(DISCORD_TOKEN);
