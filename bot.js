const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- CONFIGURATION ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const EMBEDDED_KEY = process.env.CLIENT_KEY; 
const AUTHORIZED_USER = "1421189973918351540"; 

// --- 1. DUMMY WEB SERVER (For Northflank/Render) ---
const app = express();
app.get('/', (req, res) => res.send('Bot is active'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Health-check server on port ${PORT}`));

// --- 2. BOT SETUP ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const cooldowns = new Collection();
const COOLDOWN_SECONDS = 60;

const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Admin: Fetch email using stored Client Key')
        .addStringOption(option => option.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true)),
    new SlashCommandBuilder()
        .setName('usercheck')
        .setDescription('Public: Fetch email using YOUR Client Key')
        .addStringOption(option => option.setName('key').setDescription('Your Hotmail007 Client Key').setRequired(true))
        .addStringOption(option => option.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

client.once('ready', async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`✅ ${client.user.tag} is online and commands registered.`);
    } catch (error) { console.error("Registration Error:", error); }
});

// --- 3. CORE LOGIC FUNCTION ---
async function handleEmailFetch(interaction, rawKey, rawAccount) {
    // AUTO-TRIM: Removes accidental spaces from start/end of inputs
    const targetKey = rawKey.trim();
    const accountData = rawAccount.trim();
    
    const now = Date.now();
    const commandId = interaction.commandName || 'retry';
    
    // Cooldown Check
    const timestamps = cooldowns.get(interaction.user.id) || new Collection();
    const cooldownAmount = COOLDOWN_SECONDS * 1000;
    
    if (timestamps.has(commandId)) {
        const expirationTime = timestamps.get(commandId) + cooldownAmount;
        if (now < expirationTime) {
            const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
            return interaction.reply({ content: `⏳ Cooldown active. Try again in ${timeLeft}s.`, ephemeral: true });
        }
    }

    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
    else await interaction.editReply({ content: '🔍 Processing request...', embeds: [], components: [] });

    try {
        const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', {
            params: { clientKey: targetKey, account: accountData, folder: 'inbox' },
            timeout: 10000 
        });

        const result = response.data;

        if (result.success) {
            const embed = new EmbedBuilder()
                .setTitle('📧 Latest Email Found')
                .setColor(0x5865F2)
                .setDescription(`\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``)
                .setFooter({ text: `Account: ${accountData.split(':')[0]}` })
                .setTimestamp();

            await interaction.editReply({ content: '', embeds: [embed], components: [] });
            
            // Set cooldown on success
            timestamps.set(commandId, now);
            cooldowns.set(interaction.user.id, timestamps);
        } else {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ API Refused Request')
                .setColor(0xffcc00)
                .addFields(
                    { name: 'Error Code', value: String(result.code || '1'), inline: true },
                    { name: 'API Message', value: result.msg || 'Invalid parameters or low balance.', inline: true }
                );

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    } catch (error) {
        let errorDesc = "The Hotmail007 server did not respond.";
        if (error.code === 'ECONNABORTED') errorDesc = "Request timed out (API is too slow).";
        if (error.response?.status === 429) errorDesc = "Rate limited by API. Wait 5-10 mins.";

        const connEmbed = new EmbedBuilder()
            .setTitle('🔥 Connection Failed')
            .setColor(0x000000)
            .setDescription(`**Detail:** ${errorDesc}\n**System Msg:** ${error.message}`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('retry_msg').setLabel('How to Fix').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [connEmbed], components: [row] });
    }
}

// --- 4. INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, user, options } = interaction;
        const account = options.getString('account');

        if (commandName === 'check') {
            if (user.id !== AUTHORIZED_USER) return interaction.reply({ content: "❌ Unauthorized User.", ephemeral: true });
            return handleEmailFetch(interaction, EMBEDDED_KEY, account);
        }

        if (commandName === 'usercheck') {
            const userKey = options.getString('key');
            return handleEmailFetch(interaction, userKey, account);
        }
    }

    if (interaction.isButton() && interaction.customId === 'retry_msg') {
        await interaction.reply({ 
            content: "1. Ensure your Account String has no spaces around the colons.\n2. Check if your Hotmail007 balance is > $0.\n3. If you see 'Connection Failed' multiple times, the Bot IP is likely blocked; wait 10 minutes.", 
            ephemeral: true 
        });
    }
});

client.login(DISCORD_TOKEN);
