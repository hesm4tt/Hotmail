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
    const data = tempHtmlStore.get(req.params.id);
    if (data) {
        res.setHeader('Content-Type', 'text/html');
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f7; color: #333; }
                    .email-wrapper { max-width: 800px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                    .email-header { padding: 25px; border-bottom: 1px solid #eee; background-color: #ffffff; }
                    .subject { font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 15px; line-height: 1.2; }
                    .meta-row { font-size: 14px; margin-bottom: 5px; color: #666; }
                    .meta-label { font-weight: 600; color: #444; width: 60px; display: inline-block; }
                    .email-content { padding: 25px; line-height: 1.6; overflow-x: auto; }
                    .email-content img { max-width: 100% !important; height: auto !important; }
                </style>
                <title>Email Preview</title>
            </head>
            <body>
                <div class="email-wrapper">
                    <div class="email-header">
                        <div class="subject">${data.subject || 'No Subject'}</div>
                        <div class="meta-row"><span class="meta-label">From:</span> ${data.from || 'Unknown'}</div>
                        <div class="meta-row"><span class="meta-label">Date:</span> ${data.date || 'N/A'}</div>
                    </div>
                    <div class="email-content">${data.htmlBody}</div>
                </div>
            </body>
            </html>
        `);
    } else {
        res.status(404).send('<h1>Link Expired</h1><p>Previews are purged after 60 seconds.</p>');
    }
});

app.listen(port, '0.0.0.0', () => console.log(`✅ Web Server Online`));

// --- 3. DISCORD CLIENT ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
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

// --- 4. CORE FETCH LOGIC (With Progress Embed) ---
async function handleEmailFetch(interaction, targetKey, accountData, displayType, useRotation = false, manualProxy = null) {
    const statusEmbed = new EmbedBuilder()
        .setTitle('🔍 Processing Request')
        .setColor(0xFEE75C)
        .setDescription(`🟡 **Validating Inputs**\n⚪ **Proxy Connection**\n⚪ **Fetching Email Data**`);

    if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ embeds: [statusEmbed] });
    }

    const cleanKey = targetKey.trim();
    const cleanAccount = accountData.trim();
    
    statusEmbed.setDescription(`✅ **Inputs Validated**\n🟡 **Connecting to Proxy**\n⚪ **Fetching Email Data**`);
    await interaction.editReply({ embeds: [statusEmbed] });

    let attempts = 0;
    const maxProxyAttempts = (useRotation || manualProxy) ? 3 : 0;
    let success = false;

    while (attempts <= maxProxyAttempts && !success) {
        attempts++;
        const isFallback = (attempts > maxProxyAttempts);
        
        statusEmbed.setDescription(`✅ **Inputs Validated**\n✅ **Proxy Assigned (Attempt ${attempts})**\n🟡 **Fetching Email Data**`);
        await interaction.editReply({ embeds: [statusEmbed] });

        const axiosConfig = { 
            params: { clientKey: cleanKey, account: cleanAccount, folder: 'inbox' },
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
                const bodyText = email.body || "";
                const htmlContent = email.Html || email.body;

                const finalEmbed = new EmbedBuilder().setColor(0x57F287).setTimestamp();

                if (displayType === 'extract') {
                    const codeMatch = bodyText.match(/\b\d{6}\b/);
                    finalEmbed.setTitle('🔢 Verification Code').setDescription(`Code: **${codeMatch ? codeMatch[0] : "Not found"}**`);
                } 
                else if (displayType === 'html') {
                    const viewId = crypto.randomBytes(8).toString('hex');
                    tempHtmlStore.set(viewId, {
                        subject: email.subject,
                        from: email.from,
                        date: email.date || new Date().toLocaleString(),
                        htmlBody: htmlContent
                    });
                    setTimeout(() => tempHtmlStore.delete(viewId), 60000);
                    finalEmbed.setTitle('🌐 HTML View Ready').setDescription(`Link expires in 60s:\n[**View Formatted Email**](${BOT_DOMAIN}/view/${viewId})`);
                } 
                else {
                    finalEmbed.setTitle('📧 Raw JSON Result').setDescription(`\`\`\`json\n${JSON.stringify(email, null, 2).substring(0, 1900)}\n\`\`\``);
                }
                return interaction.editReply({ embeds: [finalEmbed] });
            }
        } catch (e) {
            if (isFallback || attempts > maxProxyAttempts) {
                statusEmbed.setColor(0xED4245).setTitle('❌ Request Failed').setDescription(`✅ **Inputs Validated**\n✅ **Proxy Attempts Finished**\n❌ **Error:** ${e.message}`);
                return interaction.editReply({ embeds: [statusEmbed] });
            }
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
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`✅ ${client.user.tag} Online | Checklist & HTML Active`);
    } catch (err) { console.error(err); }
});

client.login(DISCORD_TOKEN);
