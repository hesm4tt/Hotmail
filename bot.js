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

    // --- PHASE 1: PROXY ATTEMPTS ---
    while (attempts < maxProxyAttempts && !success) {
        attempts++;
        let currentProxy = manualProxy || PRIVATE_PROXIES[Math.floor(Math.random() * PRIVATE_PROXIES.length)];

        // Update UI to show we are verifying this specific proxy
        statusEmbed.setDescription(
            `✅ **Inputs Validated**\n` +
            `🟡 **Verifying Proxy Connection... (Attempt ${attempts}/3)**\n` +
            `⚪ **Fetching Email Data**`
        );
        await interaction.editReply({ embeds: [statusEmbed] });

        try {
            const [host, port, user, pass] = currentProxy.trim().split(':');
            const proxyUrl = `socks5://${user}:${pass}@${host}:${port}`;
            const agent = new SocksProxyAgent(proxyUrl);

            // --- THE CONNECTION CHECK ---
            // We send a tiny request to a reliable "ping" server to see if the proxy is alive
            const axiosConfig = {
                httpsAgent: agent,
                httpAgent: agent,
                timeout: 8000, // If the proxy doesn't connect in 8 seconds, it's "dead"
            };

            // Test connection with a simple IP echo service
            await axios.get('https://api.ipify.org', axiosConfig);

            // If we reach here, the proxy connection SUCCEEDED
            statusEmbed.setDescription(
                `✅ **Inputs Validated**\n` +
                `✅ **Proxy Connected (${host})**\n` +
                `🟡 **Fetching Email Data from Hotmail007...**`
            );
            await interaction.editReply({ embeds: [statusEmbed] });

            // Now perform the ACTUAL request to Hotmail007
            const response = await axios.get('https://gapi.hotmail007.com/v1/mail/getFirstMail', {
                params: { clientKey: cleanKey, account: cleanAccount, folder: 'inbox' },
                ...axiosConfig,
                timeout: 15000 // Slightly longer for the actual data fetch
            });

            if (response.data.success) {
                success = true;
                return sendSuccess(interaction, response.data.data, `Proxy: ${host}`);
            } else {
                // The proxy worked, but the API returned an error (e.g., bad account)
                statusEmbed.setColor(0xED4245).setDescription(`✅ **Proxy Connected**\n❌ **API Error:** ${response.data.msg}`);
                return interaction.editReply({ embeds: [statusEmbed] });
            }

        } catch (e) {
            console.log(`Proxy ${attempts} failed: ${e.message}`);
            // If this was the last attempt, Phase 2 (Fallback) will trigger automatically
        }
    }

    // --- PHASE 2: FALLBACK (Direct Connection) ---
    // (Keep your existing Phase 2 code here...)
}
