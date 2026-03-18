const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- CONFIGURATION (Uses Render Environment Variables) ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // Your Bot's Application ID
const CLIENT_KEY = process.env.CLIENT_KEY; 

// --- 1. DEBUG: INITIAL CHECK ---
console.log("--- System Startup ---");
console.log("Checking Environment Variables...");
console.log("DISCORD_TOKEN defined:", !!DISCORD_TOKEN);
console.log("CLIENT_ID defined:", !!CLIENT_ID);
console.log("CLIENT_KEY defined:", !!CLIENT_KEY);

// --- 2. DUMMY WEB SERVER (Required for Render Free Tier) ---
const app = express();
app.get('/', (req, res) => res.send('Bot is online and healthy!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web health-check server listening on port ${PORT}`));

// --- 3. DISCORD BOT SETUP ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences // Required for status
    ] 
});

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

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// --- 4. BOT EVENTS ---
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    try {
        console.log('Started refreshing application (/) commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Successfully reloaded application (/) commands.');

        // Set status: Watching checking emails
        client.user.setPresence({
            activities: [{ 
                name: 'checking emails', 
                type: 3 // 3 = "Watching"
            }],
            status: 'online',
        });
        console.log("Presence/Status set to: Watching checking emails");

    } catch (error) {
        console.error("CRITICAL ERROR during startup:", error);
    }
});

// Handle Slash Command Interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'check') {
        const accountString = interaction.options.getString('account');
        console.log(`Command /check received for account: ${accountString.split(':')[0]}...`);
        
        await interaction.deferReply(); // Give API time to work

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
                    .setDescription(`\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``)
                    .setFooter({ text: 'Hotmail007 API' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else {
                console.warn("API returned success:false", result);
                await interaction.editReply(`❌ **API Error:** Code ${result.code || 'Unknown'}. Check your account data format.`);
            }
        } catch (error) {
            console.error("API Request Failed:", error.message);
            await interaction.editReply('🔥 **System Error:** Could not connect to the Hotmail007 API.');
        }
    }
});

// --- 5. ERROR HANDLING & LOGIN ---
client.on('error', (err) => console.error("Discord Client Error:", err));

console.log("Attempting to login to Discord...");
client.login(DISCORD_TOKEN).catch(err => {
    console.error("LOGIN FAILED! Check your DISCORD_TOKEN.");
    console.error(err);
});
