const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- CONFIGURATION ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // You need your Bot's Application ID here
const CLIENT_KEY = process.env.CLIENT_KEY; 
// ---------------------

// 1. DUMMY WEB SERVER (For Render)
const app = express();
app.get('/', (req, res) => res.send('Bot is online!'));
app.listen(process.env.PORT || 3000);

// 2. DISCORD BOT SETUP
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Define the Slash Command
const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Fetch the latest email from Hotmail007')
        .addStringOption(option => 
            option.setName('account')
            .setDescription('Format: Email:Pass:Token:ID')
            .setRequired(true))
].map(command => command.toJSON());

// Register Slash Commands
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

client.once('ready', async () => {
    try {
        // Registering Slash Commands
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Successfully reloaded application (/) commands.');

        // --- SETTING THE STATUS ---
        client.user.setPresence({
            activities: [{ 
                name: 'checking emails', 
                type: 3 // Type 3 is "Watching"
            }],
            status: 'online',
        });

        console.log(`Logged in as ${client.user.tag}!`);
    } catch (error) {
        console.error(error);
    }
});

// Handle Slash Command Interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'check') {
        const accountString = interaction.options.getString('account');
        await interaction.deferReply(); // Give the API time to respond

        try {
            const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', {
                params: {
                    clientKey: CLIENT_KEY,
                    account: accountString,
                    folder: 'inbox'
                }
            });

            const result = response.data;

            if (result.success) {
                const embed = new EmbedBuilder()
                    .setTitle('📧 Latest Email Found')
                    .setColor(0x5865F2)
                    .setDescription(`\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``);

                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply(`❌ **API Error:** ${result.code || 'Check account data.'}`);
            }
        } catch (error) {
            await interaction.editReply('🔥 **System Error:** Failed to connect to API.');
        }
    }
});

client.login(DISCORD_TOKEN);
