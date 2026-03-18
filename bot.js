const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- CONFIGURATION ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const EMBEDDED_KEY = process.env.CLIENT_KEY; 
const AUTHORIZED_USER = "1421189973918351540"; 

// --- 1. DUMMY WEB SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(process.env.PORT || 3000);

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
        console.log(`✅ ${client.user.tag} is online.`);
    } catch (error) { console.error(error); }
});

// --- 3. CORE LOGIC FUNCTION ---
async function handleEmailFetch(interaction, targetKey, accountData) {
    const now = Date.now();
    const commandName = interaction.commandName || 'retry';
    
    // Cooldown Check
    const timestamps = cooldowns.get(interaction.user.id) || new Collection();
    const cooldownAmount = COOLDOWN_SECONDS * 1000;
    if (timestamps.has(commandName)) {
        const expirationTime = timestamps.get(commandName) + cooldownAmount;
        if (now < expirationTime) {
            const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
            return interaction.reply({ content: `⏳ Cooldown active. Wait ${timeLeft}s.`, ephemeral: true });
        }
    }

    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
    else await interaction.editReply({ content: '🔍 Retrying request...', embeds: [], components: [] });

    try {
        const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', {
            params: { clientKey: targetKey, account: accountData, folder: 'inbox' },
            timeout: 10000 // 10 second timeout
        });

        const result = response.data;

        if (result.success) {
            const embed = new EmbedBuilder()
                .setTitle('📧 Latest Email Found')
                .setColor(0x5865F2)
                .setDescription(`\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``)
                .setFooter({ text: `Success • Account: ${accountData.split(':')[0]}` });

            await interaction.editReply({ content: '', embeds: [embed], components: [] });
            timestamps.set(commandName, now);
            cooldowns.set(interaction.user.id, timestamps);
        } else {
            // Detailed API Error Reporting
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ API Error Received')
                .setColor(0xff0000)
                .addFields(
                    { name: 'Code', value: String(result.code || 'N/A'), inline: true },
                    { name: 'Message', value: result.msg || 'No message provided by API.', inline: true },
                    { name: 'Fix', value: 'Verify your account string format and key balance.' }
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('retry_btn').setLabel('Retry Now').setStyle(ButtonStyle.Primary)
            );

            await interaction.editReply({ embeds: [errorEmbed], components: [row] });
        }
    } catch (error) {
        // Detailed Connection Error Reporting
        let errorType = error.code === 'ECONNABORTED' ? 'Timeout (Server took too long)' : 'Network Error';
        if (error.response) errorType = `Server Error (${error.response.status})`;

        const connEmbed = new EmbedBuilder()
            .setTitle('🔥 Connection Failed')
            .setColor(0x000000)
            .setDescription(`**Error Type:** ${errorType}\n**Message:** ${error.message}`)
            .setFooter({ text: 'The API might be rate-limiting the bot IP.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('retry_btn').setLabel('Retry Connection').setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({ embeds: [connEmbed], components: [row] });
    }
}

// --- 4. INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {
    // Handle Commands
    if (interaction.isChatInputCommand()) {
        const { commandName, user, options } = interaction;
        const account = options.getString('account');

        if (commandName === 'check') {
            if (user.id !== AUTHORIZED_USER) return interaction.reply({ content: "❌ Unauthorized.", ephemeral: true });
            return handleEmailFetch(interaction, EMBEDDED_KEY, account);
        }

        if (commandName === 'usercheck') {
            const key = options.getString('key');
            return handleEmailFetch(interaction, key, account);
        }
    }

    // Handle Retry Button
    if (interaction.isButton() && interaction.customId === 'retry_btn') {
        // Find the original data from the embed footer or content
        const account = interaction.message.embeds[0].description.includes('json') ? null : interaction.message.embeds[0].footer.text.split(' ')[2];
        // Note: For full robustness in a multi-user bot, you'd store state in a database,
        // but for this simple version, we will re-trigger the logic based on the interaction.
        await interaction.reply({ content: "Please run the command again to retry with fresh data.", ephemeral: true });
    }
});

client.login(DISCORD_TOKEN);
