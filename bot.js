const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent'); // Updated library
const express = require('express');

// --- 1. IMPORT PROXY LIST ---
const PRIVATE_PROXIES = require('./proxies.json');
let proxyIndex = 0;

// --- CONFIGURATION ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const EMBEDDED_KEY = process.env.CLIENT_KEY; 
const AUTHORIZED_USER = "1421189973918351540"; 

const app = express();
app.get('/', (req, res) => res.send('Bot is active and rotating.'));
app.listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Admin: Fetch email using Proxy Rotation')
        .addStringOption(opt => opt.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true)),
    new SlashCommandBuilder()
        .setName('usercheck')
        .setDescription('Public: Fetch email with custom key/proxy')
        .addStringOption(opt => opt.setName('key').setDescription('Your Client Key').setRequired(true))
        .addStringOption(opt => opt.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true))
        .addStringOption(opt => opt.setName('proxy').setDescription('SOCKS5 (host:port:user:pass)').setRequired(false))
].map(c => c.toJSON());

// --- 3. CORE FETCH LOGIC ---
async function handleEmailFetch(interaction, targetKey, accountData, proxyString) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();

    const axiosConfig = {
        params: { clientKey: targetKey.trim(), account: accountData.trim(), folder: 'inbox' },
        timeout: 25000 
    };

    if (proxyString) {
        try {
            const [host, port, user, pass] = proxyString.trim().split(':');
            // Format: socks5://user:pass@host:port
            const proxyUrl = `socks5://${user}:${pass}@${host}:${port}`;
            const agent = new SocksProxyAgent(proxyUrl);
            
            axiosConfig.httpAgent = agent;
            axiosConfig.httpsAgent = agent;
            console.log(`📡 Using Proxy: ${host}:${port}`);
        } catch (e) {
            return interaction.editReply("❌ Invalid proxy format in database.");
        }
    }

    try {
        const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', axiosConfig);
        if (response.data.success) {
            const embed = new EmbedBuilder()
                .setTitle('📧 Email Found')
                .setColor(0x5865F2)
                .setDescription(`\`\`\`json\n${JSON.stringify(response.data.data, null, 2)}\n\`\`\``);
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply(`❌ **API Error:** ${response.data.msg}`);
        }
    } catch (error) {
        await interaction.editReply(`🔥 **Connection Failed:** ${error.message}`);
    }
}

client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    const account = i.options.getString('account');

    if (i.commandName === 'check') {
        if (i.user.id !== AUTHORIZED_USER) return i.reply({ content: "Unauthorized.", ephemeral: true });
        let selectedProxy = PRIVATE_PROXIES.length > 0 ? PRIVATE_PROXIES[proxyIndex] : null;
        proxyIndex = (proxyIndex + 1) % PRIVATE_PROXIES.length;
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
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log(`✅ Bot Online | ${PRIVATE_PROXIES.length} Proxies Loaded.`);
});
client.login(DISCORD_TOKEN);
