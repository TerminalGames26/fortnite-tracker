const fetch = require('node-fetch');

const FNLB_TOKEN = process.env.FNLB_TOKEN;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const MESSAGE_ID = process.env.DISCORD_MESSAGE_ID; // leave empty on first run

if (!FNLB_TOKEN || !WEBHOOK_URL) {
  console.error('Missing FNLB_TOKEN or DISCORD_WEBHOOK_URL');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${FNLB_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'FNLB-Status-Checker/1.0'
};

async function getBots() {
  const res = await fetch('https://api.fnlb.net/v1/bots', { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list bots: ${res.status} ${text}`);
  }
  return res.json();
}

async function getUser() {
  const res = await fetch('https://api.fnlb.net/v1/user', { headers });
  if (!res.ok) throw new Error(`Failed to get user: ${res.status}`);
  return res.json();
}

async function isBotOnline(botId, accountId) {
  // Gateway check – online bots exist here, offline ones return 404
  const url = `https://gateway.fnlb.net/v1/bots/${botId}?FNLB_BUCKET_ID=${accountId}`;
  const res = await fetch(url, { headers });
  return res.ok;
}

function buildMessage(online, offline) {
  let content = `**Online - ${online.length}**\n`;
  if (online.length) {
    content += online.map(n => `• ${n}`).join('\n');
  } else {
    content += `• None`;
  }

  content += `\n\n**Offline - ${offline.length}**\n`;
  if (offline.length) {
    content += offline.map(n => `• ${n}`).join('\n');
  } else {
    content += `• None`;
  }

  content += `\n\n_Last updated: <t:${Math.floor(Date.now() / 1000)}:R>_`;
  return content;
}

async function main() {
  console.log('Fetching bots...');
  const [bots, user] = await Promise.all([getBots(), getUser()]);
  const accountId = user.id;

  console.log(`Found ${bots.length} bots. Checking live status...`);

  const online = [];
  const offline = [];

  // Check in parallel (with a small limit to be nice)
  const results = await Promise.all(
    bots.map(async (bot) => {
      const name = bot.nickname || bot.displayName || bot.id;
      try {
        const onlineStatus = await isBotOnline(bot.id, accountId);
        return { name, online: onlineStatus };
      } catch (e) {
        console.warn(`Error checking ${name}:`, e.message);
        return { name, online: false };
      }
    })
  );

  for (const r of results) {
    if (r.online) online.push(r.name);
    else offline.push(r.name);
  }

  online.sort((a, b) => a.localeCompare(b));
  offline.sort((a, b) => a.localeCompare(b));

  const content = buildMessage(online, offline);
  console.log(content);

  if (MESSAGE_ID) {
    // Edit existing message
    const editUrl = `${WEBHOOK_URL}/messages/${MESSAGE_ID}`;
    const res = await fetch(editUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to edit message: ${res.status} ${text}`);
    }
    console.log('Message updated successfully');
  } else {
    // First run – create the message and print the ID
    const res = await fetch(WEBHOOK_URL + '?wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to send message: ${res.status} ${text}`);
    }

    const data = await res.json();
    console.log('\n========================================');
    console.log('FIRST RUN COMPLETE');
    console.log('Copy this Message ID and add it as the secret DISCORD_MESSAGE_ID:');
    console.log(data.id);
    console.log('========================================\n');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
