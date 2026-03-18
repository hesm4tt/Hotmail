const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, Collection } = require('discord.js');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
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

const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Admin: Fetch email using Proxy Rotation & Checklist')
        .addStringOption(opt => opt.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true)),
    new SlashCommandBuilder()
        .setName('usercheck')
        .setDescription('Public: Fetch email with custom key/proxy')
        .addStringOption(opt => opt.setName('key').setDescription('Your Client Key').setRequired(true))
        .addStringOption(opt => opt.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true))
        .addStringOption(opt => opt.setName('proxy').setDescription('SOCKS5 (host:port:user:pass)').setRequired(false))
].map(c => c.toJSON());

// --- 3. CORE LOGIC (Checklist + Retry + Proxy) ---
async function handleEmailFetch(interaction, targetKey, accountData, isRotation = false, manualProxy = null) {
    // Initial Progress Embed
    const statusEmbed = new EmbedBuilder()
        .setTitle('🔍 Processing Request')
        .setColor(0xFEE75C) // Yellow for "In Progress"
        .setDescription(
            `🟡 **Validating Inputs**\n` +
            `⚪ **Connecting to Proxy**\n` +
            `⚪ **Fetching Email Data**`
        );

    // Initial response
    if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ embeds: [statusEmbed] });
    }

    // --- STEP 1: VALIDATION ---
    const cleanKey = targetKey.trim();
    const cleanAccount = accountData.trim();
    
    statusEmbed.setDescription(
        `✅ **Inputs Validated**\n` +
        `🟡 **Connecting to Proxy**\n` +
        `⚪ **Fetching Email Data**`
    );
    await interaction.editReply({ embeds: [statusEmbed] });

    let attempts = 0;
    const maxAttempts = isRotation ? 3 : 1;
    let success = false;

    while (attempts < maxAttempts && !success) {
        attempts++;
        
        // --- STEP 2: PROXY SETUP ---
        let currentProxy = manualProxy;
        if (isRotation && PRIVATE_PROXIES.length > 0) {
            currentProxy = PRIVATE_PROXIES[proxyIndex];
            proxyIndex = (proxyIndex + 1) % PRIVATE_PROXIES.length;
        }

        const axiosConfig = {
            params: { clientKey: cleanKey, account: cleanAccount, folder: 'inbox' },
            timeout: 20000 
        };

        if (currentProxy) {
            try {
                const [host, port, user, pass] = currentProxy.trim().split(':');
                const agent = new SocksProxyAgent(`socks5://${user}:${pass}@${host}:${port}`);
                axiosConfig.httpAgent = agent;
                axiosConfig.httpsAgent = agent;
            } catch (e) {
                statusEmbed.setColor(0xED4245).setDescription(`❌ **Invalid Proxy Format in Database**`);
                return interaction.editReply({ embeds: [statusEmbed] });
            }
        }

        statusEmbed.setDescription(
            `✅ **Inputs Validated**\n` +
            `✅ **Proxy Assigned (Attempt ${attempts}/${maxAttempts})**\n` +
            `🟡 **Fetching Email Data**`
        );
        await interaction.editReply({ embeds: [statusEmbed] });

        try {
            // --- STEP 3: API FETCH ---
            const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', axiosConfig);
            const result = response.data;

            if (result.success) {
                const finalEmbed = new EmbedBuilder()
                    .setTitle('📧 Email Found Successfully')
                    .setColor(0x57F287) // Green for Success
                    .setDescription(`\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``)
                    .addFields(
                        { name: 'Status', value: '✅ Complete', inline: true },
                        { name: 'Attempts', value: `${attempts}`, inline: true }
                    )
                    .setFooter({ text: `Account: ${cleanAccount.split(':')[0]}` })
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [finalEmbed] });
                success = true;
            } else {
                statusEmbed.setColor(0xED4245).setTitle('❌ API Refused Request')
                    .setDescription(`✅ **Inputs Validated**\n✅ **Proxy Assigned**\n❌ **API Error:** ${result.msg}`);
                return interaction.editReply({ embeds: [statusEmbed] });
            }
        } catch (error) {
            console.log(`Attempt ${attempts} error: ${error.message}`);
            
            if (attempts >= maxAttempts) {
                statusEmbed.setColor(0x000000).setTitle('🔥 All Attempts Failed')
                    .setDescription(
                        `✅ **Inputs Validated**\n` +
                        `✅ **Proxy Assigned**\n` +
                        `❌ **Network Error:** ${error.message}`
                    )
                    .setFooter({ text: "IPRoyal session might be dead or API is offline." });
                await interaction.editReply({ embeds: [statusEmbed] });
            }
            // Loop continues for retry if attempts < maxAttempts
        }
    }
}

// --- 4. INTERACTION HANDLER ---
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    const account = i.options.getString('account');

    if (i.commandName === 'check') {
        if (i.user.id !== AUTHORIZED_USER) return i.reply({ content: "❌ Unauthorized.", ephemeral: true });
        return handleEmailFetch(i, EMBEDDED_KEY, account, true); 
    }

    if (i.commandName === 'usercheck') {
        const key = i.options.getString('key');
        const proxy = i.options.getString('proxy');
        return handleEmailFetch(i, key, account, false, proxy);
    }
});

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
client.once('ready', async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`✅ Bot Online | ${PRIVATE_PROXIES.length} Proxies Loaded.`);
    } catch (err) { console.error(err); }
});

client.login(DISCORD_TOKEN);
