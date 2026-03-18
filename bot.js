const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const express = require('express');

// --- 1. IMPORT PROXY LIST ---
const PRIVATE_PROXIES = require('./proxies.json');

// --- CONFIGURATION ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const EMBEDDED_KEY = process.env.CLIENT_KEY; 
const AUTHORIZED_USER = "1421189973918351540"; 

const app = express();
app.get('/', (req, res) => res.send('Bot Active'));
app.listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Admin: Fetch email with Random Proxy & Fallback')
        .addStringOption(opt => opt.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true))
        .addBooleanOption(opt => opt.setName('use_proxy').setDescription('Enable/Disable random proxy rotation').setRequired(true)),
    new SlashCommandBuilder()
        .setName('usercheck')
        .setDescription('Public: Fetch email with custom key/proxy')
        .addStringOption(opt => opt.setName('key').setDescription('Your Client Key').setRequired(true))
        .addStringOption(opt => opt.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true))
        .addStringOption(opt => opt.setName('proxy').setDescription('SOCKS5 (host:port:user:pass)').setRequired(false))
].map(c => c.toJSON());

// --- 3. CORE LOGIC (Checklist + Random Retry + Fallback) ---
async function handleEmailFetch(interaction, targetKey, accountData, useProxy = false, manualProxy = null) {
    const statusEmbed = new EmbedBuilder()
        .setTitle('🔍 Processing Request')
        .setColor(0xFEE75C)
        .setDescription(`🟡 **Validating Inputs**\n⚪ **Proxy Connection**\n⚪ **Fetching Email Data**`);

    if (!interaction.deferred && !interaction.replied) await interaction.reply({ embeds: [statusEmbed] });

    const cleanKey = targetKey.trim();
    const cleanAccount = accountData.trim();
    
    let attempts = 0;
    const maxProxyAttempts = useProxy ? 3 : 0;
    let success = false;
    let usedProxies = []; // Keep track of proxies used in this specific command run

    // --- PHASE 1: RANDOM PROXY ATTEMPTS ---
    while (attempts < maxProxyAttempts && !success) {
        attempts++;
        
        let currentProxy = manualProxy;
        
        // If it's a random rotation, pick a truly random index from the list
        if (!manualProxy && PRIVATE_PROXIES.length > 0) {
            const randomIndex = Math.floor(Math.random() * PRIVATE_PROXIES.length);
            currentProxy = PRIVATE_PROXIES[randomIndex];
            usedProxies.push(currentProxy.split(':')[0]); // Store IP for logging
        }

        statusEmbed.setDescription(`✅ **Inputs Validated**\n🟡 **Connecting to Random Proxy (Attempt ${attempts}/3)**\n⚪ **Fetching Email Data**`);
        await interaction.editReply({ embeds: [statusEmbed] });

        const axiosConfig = {
            params: { clientKey: cleanKey, account: cleanAccount, folder: 'inbox' },
            timeout: 15000 
        };

        try {
            const [host, port, user, pass] = currentProxy.trim().split(':');
            const agent = new SocksProxyAgent(`socks5://${user}:${pass}@${host}:${port}`);
            axiosConfig.httpAgent = agent;
            axiosConfig.httpsAgent = agent;

            const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', axiosConfig);
            if (response.data.success) {
                success = true;
                return sendSuccess(interaction, response.data.data, `Random Proxy: ${host}`);
            }
        } catch (e) { 
            console.log(`Proxy fail: ${e.message}`); 
            // If it's the last attempt and it failed, we fall through to Phase 2
        }
    }

    // --- PHASE 2: FALLBACK (Direct Connection) ---
    if (!success) {
        statusEmbed.setDescription(`✅ **Inputs Validated**\n⚠️ **Random Proxies Failed/Skipped**\n🟡 **Attempting Direct Connection (Fallback)...**`);
        await interaction.editReply({ embeds: [statusEmbed] });

        try {
            const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', {
                params: { clientKey: cleanKey, account: cleanAccount, folder: 'inbox' },
                timeout: 12000
            });

            if (response.data.success) {
                return sendSuccess(interaction, response.data.data, "Direct Fallback (No Proxy)");
            } else {
                statusEmbed.setColor(0xED4245).setDescription(`❌ **API Error:** ${response.data.msg}`);
                return interaction.editReply({ embeds: [statusEmbed] });
            }
        } catch (error) {
            statusEmbed.setColor(0x000000).setTitle('🔥 All Methods Failed')
                .setDescription(`❌ **Random Proxies:** Failed\n❌ **Direct Fallback:** ${error.message}`);
            await interaction.editReply({ embeds: [statusEmbed] });
        }
    }
}

function sendSuccess(interaction, data, method) {
    const embed = new EmbedBuilder()
        .setTitle('📧 Email Found Successfully')
        .setColor(0x57F287)
        .setDescription(`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``)
        .setFooter({ text: `Method: ${method}` })
        .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
}

// --- 4. INTERACTION HANDLER ---
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    const account = i.options.getString('account');

    if (i.commandName === 'check') {
        if (i.user.id !== AUTHORIZED_USER) return i.reply({ content: "❌ Unauthorized.", ephemeral: true });
        const useProxy = i.options.getBoolean('use_proxy');
        return handleEmailFetch(i, EMBEDDED_KEY, account, useProxy); 
    }

    if (i.commandName === 'usercheck') {
        const key = i.options.getString('key');
        const proxy = i.options.getString('proxy');
        return handleEmailFetch(i, key, account, !!proxy, proxy);
    }
});

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
client.once('ready', async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`✅ Bot Online | Random Rotation Active (${PRIVATE_PROXIES.length} proxies)`);
    } catch (err) { console.error(err); }
});

client.login(DISCORD_TOKEN);
