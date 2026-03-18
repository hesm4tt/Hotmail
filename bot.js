const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, Collection } = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- CONFIGURATION ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const EMBEDDED_KEY = process.env.CLIENT_KEY; // The key stored in Northflank
const AUTHORIZED_USER = "1421189973918351540"; // The only user who can use /check

// --- 1. DUMMY WEB SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(process.env.PORT || 3000);

// --- 2. BOT SETUP & COOLDOWNS ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const cooldowns = new Collection();
const COOLDOWN_SECONDS = 60;

const commands = [
    // Command for YOU (Authorized User Only)
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Admin: Fetch email using stored Client Key')
        .addStringOption(option => option.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true)),
    
    // Command for EVERYONE (Requires their own Key)
    new SlashCommandBuilder()
        .setName('usercheck')
        .setDescription('Public: Fetch email using YOUR Client Key')
        .addStringOption(option => option.setName('key').setDescription('Your Hotmail007 Client Key').setRequired(true))
        .addStringOption(option => option.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// --- 3. REGISTRATION ---
client.once('ready', async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`✅ ${client.user.tag} is online.`);
    } catch (error) { console.error(error); }
});

// --- 4. INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user, options } = interaction;

    // --- COOLDOWN LOGIC ---
    const now = Date.now();
    const timestamps = cooldowns.get(commandName) || new Collection();
    const cooldownAmount = COOLDOWN_SECONDS * 1000;

    if (timestamps.has(user.id)) {
        const expirationTime = timestamps.get(user.id) + cooldownAmount;
        if (now < expirationTime) {
            const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
            return interaction.reply({ content: `⏳ Please wait ${timeLeft}s before using \`/${commandName}\` again.`, ephemeral: true });
        }
    }
    // ----------------------

    let targetKey;
    let accountData = options.getString('account');

    if (commandName === 'check') {
        // Restricted to your ID
        if (user.id !== AUTHORIZED_USER) {
            return interaction.reply({ content: "❌ You are not authorized to use this admin command.", ephemeral: true });
        }
        targetKey = EMBEDDED_KEY;
    } 
    
    else if (commandName === 'usercheck') {
        targetKey = options.getString('key');
    }

    await interaction.deferReply();

    try {
        const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', {
            params: { clientKey: targetKey, account: accountData, folder: 'inbox' }
        });

        if (response.data.success) {
            const embed = new EmbedBuilder()
                .setTitle('📧 Latest Email Found')
                .setColor(0x5865F2)
                .setDescription(`\`\`\`json\n${JSON.stringify(response.data.data, null, 2)}\n\`\`\``)
                .setFooter({ text: `Checked by ${user.username}` });

            await interaction.editReply({ embeds: [embed] });
            
            // Set cooldown only on success
            timestamps.set(user.id, now);
            cooldowns.set(commandName, timestamps);
        } else {
            await interaction.editReply(`❌ **API Error:** ${response.data.msg || 'Invalid data'}`);
        }
    } catch (error) {
        console.error(error);
        await interaction.editReply('🔥 **Connection Failed:** The API is currently unreachable. Wait a minute and try again.');
    }
});

client.login(DISCORD_TOKEN);
