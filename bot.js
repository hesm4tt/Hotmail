const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- CONFIGURATION ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; 
const CLIENT_KEY = process.env.CLIENT_KEY; 

// --- 1. DUMMY WEB SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Bot is online!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Health-check server on port ${PORT}`));

// --- 2. DISCORD BOT SETUP (Minimal Intents) ---
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds] // No special setup needed in Portal for this
});

const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Fetch the latest email from Hotmail007')
        .addStringOption(option => 
            option.setName('account')
            .setDescription('Format: Email:Pass:Token:ID')
            .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// --- 3. BOT EVENTS ---
client.once('ready', async () => {
    console.log(`✅ Success! Logged in as ${client.user.tag}`);
    
    try {
        console.log('Registering /check command...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Commands registered successfully.');
    } catch (error) {
        console.error("Command Registration Error:", error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'check') {
        const accountString = interaction.options.getString('account');
        await interaction.deferReply();

        try {
            const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', {
                params: {
                    clientKey: CLIENT_KEY,
                    account: accountString,
                    folder: 'inbox'
                }
            });

            if (response.data.success) {
                const embed = new EmbedBuilder()
                    .setTitle('📧 Latest Email')
                    .setColor(0x5865F2)
                    .setDescription(`\`\`\`json\n${JSON.stringify(response.data.data, null, 2)}\n\`\`\``);
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply(`❌ API Error: ${response.data.code}`);
            }
        } catch (error) {
            await interaction.editReply('🔥 Connection to Hotmail007 failed.');
        }
    }
});

// --- 4. LOGIN ---
console.log("Connecting to Discord...");
client.login(DISCORD_TOKEN).catch(err => {
    console.error("Login failed. Check your token in Render Environment variables.");
});
