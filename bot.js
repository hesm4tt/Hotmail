const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const express = require('express');
const crypto = require('crypto');

// --- 1. CONFIG & SETUP ---
const PRIVATE_PROXIES = require('./proxies.json');
const tempHtmlStore = new Map();
const AUTHORIZED_USER = "1421189973918351540";
const BOT_DOMAIN = "https://p01--hotmail--dl7r4gtkhsjg.code.run";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const EMBEDDED_KEY = process.env.CLIENT_KEY; 

// --- 2. NORTHFLANK WEB SERVER ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot Active'));
app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/view/:id', (req, res) => {
    const html = tempHtmlStore.get(req.params.id);
    if (html) {
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } else {
        res.status(404).send('<h1>Link Expired</h1><p>Previews are purged after 60 seconds.</p>');
    }
});

app.listen(port, '0.0.0.0', () => console.log(`✅ Web Server Online`));

// --- 3. DISCORD CLIENT & COMMANDS ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    // Admin Command
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Admin: Fetch email with Proxy Rotation')
        .addStringOption(opt => opt.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true))
        .addBooleanOption(opt => opt.setName('use_proxy').setDescription('Enable random proxy').setRequired(true))
        .addStringOption(opt => opt.setName('display').setDescription('Output format').setRequired(true)
            .addChoices(
                { name: 'Extract 6-Digit Code', value: 'extract' },
                { name: 'View as HTML Webpage', value: 'html' },
                { name: 'Raw JSON Data', value: 'json' }
            )),
    // Public Command
    new SlashCommandBuilder()
        .setName('usercheck')
        .setDescription('Public: Fetch email with custom key/proxy')
        .addStringOption(opt => opt.setName('key').setDescription('Your Client Key').setRequired(true))
        .addStringOption(opt => opt.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true))
        .addStringOption(opt => opt.setName('display').setDescription('Output format').setRequired(true)
            .addChoices(
                { name: 'Extract 6-Digit Code', value: 'extract' },
                { name: 'View as HTML Webpage', value: 'html' },
                { name: 'Raw JSON Data', value: 'json' }
            ))
        .addStringOption(opt => opt.setName('proxy').setDescription('SOCKS5 (host:port:user:pass)').setRequired(false))
].map(c => c.toJSON());

// --- 4. CORE FETCH LOGIC ---
async function handleEmailFetch(interaction, targetKey, accountData, displayType, useRotation = false, manualProxy = null) {
    if (!interaction.deferred) await interaction.deferReply();

    let attempts = 0;
    const maxProxyAttempts = (useRotation || manualProxy) ? 3 : 0;
    let success = false;

    while (attempts <= maxProxyAttempts && !success) {
        attempts++;
        const isFallback = (attempts > maxProxyAttempts);
        
        const axiosConfig = { 
            params: { clientKey: targetKey.trim(), account: accountData.trim(), folder: 'inbox' },
            timeout: 15000 
        };

        let currentProxy = manualProxy;
        if (useRotation && !isFallback) {
            currentProxy = PRIVATE_PROXIES[Math.floor(Math.random() * PRIVATE_PROXIES.length)];
        }

        if (currentProxy && !isFallback) {
            const [host, port, user, pass] = currentProxy.trim().split(':');
            axiosConfig.httpAgent = new SocksProxyAgent(`socks5://${user}:${pass}@${host}:${port}`);
            axiosConfig.httpsAgent = axiosConfig.httpAgent;
        }

        try {
            const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', axiosConfig);
            if (response.data.success) {
                success = true;
                const email = response.data.data;
                const body = email.body || "";
                const embed = new EmbedBuilder().setColor(0x57F287).setTimestamp();

                if (displayType === 'extract') {
                    const codeMatch = body.match(/\b\d{6}\b/);
                    embed.setTitle('🔢 Verification Code').setDescription(`Code: **${codeMatch ? codeMatch[0] : "Not found"}**`);
                } 
                else if (displayType === 'html') {
                    const viewId = crypto.randomBytes(8).toString('hex');
                    tempHtmlStore.set(viewId, body);
                    setTimeout(() => tempHtmlStore.delete(viewId), 60000);
                    embed.setTitle('🌐 HTML View Ready').setDescription(`Link expires in 60s:\n[**View Email Content**](${BOT_DOMAIN}/view/${viewId})`);
                } 
                else {
                    embed.setTitle('📧 Raw JSON Result').setDescription(`\`\`\`json\n${JSON.stringify(email, null, 2).substring(0, 1900)}\n\`\`\``);
                }
                return interaction.editReply({ embeds: [embed] });
            }
        } catch (e) {
            if (isFallback) return interaction.editReply(`❌ Error: ${e.message}`);
        }
    }
}

// --- 5. INTERACTION HANDLER ---
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;

    const account = i.options.getString('account');
    const display = i.options.getString('display');

    if (i.commandName === 'check') {
        if (i.user.id !== AUTHORIZED_USER) return i.reply({ content: "Unauthorized", ephemeral: true });
        const useProxy = i.options.getBoolean('use_proxy');
        return handleEmailFetch(i, EMBEDDED_KEY, account, display, useProxy);
    }

    if (i.commandName === 'usercheck') {
        const key = i.options.getString('key');
        const proxy = i.options.getString('proxy');
        return handleEmailFetch(i, key, account, display, false, proxy);
    }
});

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
client.once('ready', async () => {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log(`✅ ${client.user.tag} Online | Check & UserCheck Restored`);
});
client.login(DISCORD_TOKEN);
