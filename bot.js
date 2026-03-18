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

// Serve the HTML preview
app.get('/view/:id', (req, res) => {
    const html = tempHtmlStore.get(req.params.id);
    if (html) {
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } else {
        res.status(404).send('<h1>Link Expired</h1><p>Email previews are purged after 60 seconds.</p>');
    }
});

app.listen(port, '0.0.0.0', () => console.log(`✅ Web Server Online`));

// --- 3. DISCORD CLIENT ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Fetch email with extraction/view options')
        .addStringOption(opt => opt.setName('account').setDescription('Email:Pass:Token:ID').setRequired(true))
        .addBooleanOption(opt => opt.setName('use_proxy').setDescription('Enable random proxy').setRequired(true))
        .addStringOption(opt => opt.setName('display').setDescription('Output format').setRequired(true)
            .addChoices(
                { name: 'Extract 6-Digit Code', value: 'extract' },
                { name: 'View as HTML Webpage', value: 'html' },
                { name: 'Raw JSON Data', value: 'json' }
            )),
].map(c => c.toJSON());

// --- 4. CORE FETCH LOGIC ---
async function handleEmailFetch(interaction, accountData, displayType, useProxy) {
    if (!interaction.deferred) await interaction.deferReply();

    let attempts = 0;
    const maxProxyAttempts = useProxy ? 3 : 0;
    let success = false;

    while (attempts <= maxProxyAttempts && !success) {
        attempts++;
        const isFallback = (attempts > maxProxyAttempts);
        
        const axiosConfig = { 
            params: { clientKey: EMBEDDED_KEY.trim(), account: accountData.trim(), folder: 'inbox' },
            timeout: 15000 
        };

        if (useProxy && !isFallback) {
            const proxy = PRIVATE_PROXIES[Math.floor(Math.random() * PRIVATE_PROXIES.length)];
            const [host, port, user, pass] = proxy.split(':');
            const agent = new SocksProxyAgent(`socks5://${user}:${pass}@${host}:${port}`);
            axiosConfig.httpAgent = agent; axiosConfig.httpsAgent = agent;
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
                    const code = codeMatch ? codeMatch[0] : "No 6-digit code found.";
                    embed.setTitle('🔢 Verification Code')
                         .setDescription(`Code: **${code}**`);
                } 
                else if (displayType === 'html') {
                    const viewId = crypto.randomBytes(8).toString('hex');
                    tempHtmlStore.set(viewId, body);
                    
                    // Auto-delete from memory after 60s
                    setTimeout(() => {
                        tempHtmlStore.delete(viewId);
                        console.log(`🗑️ Purged HTML view: ${viewId}`);
                    }, 60000);

                    embed.setTitle('🌐 HTML View Ready')
                         .setDescription(`This link expires in 60 seconds:\n\n[**View Email Content**](${BOT_DOMAIN}/view/${viewId})`);
                } 
                else {
                    embed.setTitle('📧 Raw JSON Result')
                         .setDescription(`\`\`\`json\n${JSON.stringify(email, null, 2).substring(0, 1900)}\n\`\`\``);
                }

                return interaction.editReply({ embeds: [embed] });
            }
        } catch (e) {
            if (isFallback || attempts > maxProxyAttempts) {
                return interaction.editReply(`❌ Error: ${e.message}`);
            }
        }
    }
}

client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    if (i.user.id !== AUTHORIZED_USER) return i.reply({ content: "Unauthorized", ephemeral: true });

    if (i.commandName === 'check') {
        const account = i.options.getString('account');
        const useProxy = i.options.getBoolean('use_proxy');
        const display = i.options.getString('display');
        return handleEmailFetch(i, account, display, useProxy);
    }
});

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
client.once('ready', async () => {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log(`✅ ${client.user.tag} Online | HTML Auto-Purge Enabled`);
});
client.login(DISCORD_TOKEN);
