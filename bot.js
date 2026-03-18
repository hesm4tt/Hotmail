const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const socksAdapter = require('axios-socks5-adapter');
const express = require('express');

// --- 1. IMPORT PROXY LIST ---
const PRIVATE_PROXIES = require('./proxies.json');
let proxyIndex = 0;

// --- CONFIGURATION ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const EMBEDDED_KEY = process.env.CLIENT_KEY; 
const AUTHORIZED_USER = "1421189973918351540"; 

// --- 2. HEALTH CHECK SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Bot is active and rotating proxies.'));
app.listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- 3. COMMAND DEFINITIONS ---
const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Admin: Fetch email using Private Proxy Rotation')
        .addStringOption(opt => opt.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true)),
    new SlashCommandBuilder()
        .setName('usercheck')
        .setDescription('Public: Fetch email with custom key/proxy')
        .addStringOption(opt => opt.setName('key').setDescription('Your Client Key').setRequired(true))
        .addStringOption(opt => opt.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true))
        .addStringOption(opt => opt.setName('proxy').setDescription('SOCKS5 (host:port:user:pass)').setRequired(false))
].map(c => c.toJSON());

// --- 4. CORE FETCH LOGIC ---
async function handleEmailFetch(interaction, targetKey, accountData, proxyString) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();

    const axiosConfig = {
        params: { 
            clientKey: targetKey.trim(), 
            account: accountData.trim(), 
            folder: 'inbox' 
        },
        timeout: 20000 // Increased to 20s for proxy overhead
    };

    if (proxyString) {
        const [host, port, username, password] = proxyString.trim().split(':');
        axiosConfig.httpsAgent = socksAdapter({
            host: host,
            port: parseInt(port),
            auth: username && password ? { username, password } : undefined
        });
        console.log(`📡 Request using proxy: ${host}:${port}`);
    }

    try {
        const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', axiosConfig);
        const result = response.data;

        if (result.success) {
            const embed = new EmbedBuilder()
                .setTitle('📧 Email Found')
                .setColor(0x5865F2)
                .setDescription(`\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``)
                .setFooter({ text: `Proxy used: ${proxyString ? 'Yes' : 'No'}` });
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply(`❌ **API Error:** ${result.msg || 'Check account format.'}`);
        }
    } catch (error) {
        console.error("Fetch Error:", error.message);
        await interaction.editReply(`🔥 **Connection Failed:** ${error.message}`);
    }
}

// --- 5. INTERACTION HANDLER ---
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    const account = i.options.getString('account');

    if (i.commandName === 'check') {
        if (i.user.id !== AUTHORIZED_USER) return i.reply({ content: "Unauthorized.", ephemeral: true });
        
        // Select and rotate proxy
        let selectedProxy = null;
        if (PRIVATE_PROXIES.length > 0) {
            selectedProxy = PRIVATE_PROXIES[proxyIndex];
            proxyIndex = (proxyIndex + 1) % PRIVATE_PROXIES.length;
        }
        
        return handleEmailFetch(i, EMBEDDED_KEY, account, selectedProxy);
    }

    if (i.commandName === 'usercheck') {
        const key = i.options.getString('key');
        const proxy = i.options.getString('proxy');
        return handleEmailFetch(i, key, account, proxy);
    }
});

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
client.once('ready', async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`✅ ${client.user.tag} Online | ${PRIVATE_PROXIES.length} Proxies Loaded.`);
    } catch (err) { console.error(err); }
});

client.login(DISCORD_TOKEN);
