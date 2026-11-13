const fetch = require('node-fetch');

const FNLB_TOKEN = process.env.FNLB_TOKEN;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const MESSAGE_ID = process.env.DISCORD_MESSAGE_ID;

if (!FNLB_TOKEN || !WEBHOOK_URL) {
  console.error('Missing FNLB_TOKEN or DISCORD_WEBHOOK_URL');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${FNLB_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'FNLB-Status-Checker/1.3'
};

async function getBots() {
  const res = await fetch('https://api.fnlb.net/v1/bots', { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list bots (${res.status}): ${text}`);
  }
  return res.json();
}

async function getUser() {
  const res = await fetch('https://api.fnlb.net/v1/user', { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get user (${res.status}): ${text}`);
  }
  return res.json();
}

async function isBotOnline(botId, accountId) {
  const url = `https://gateway.fnlb.net/v1/bots/${botId}?FNLB_BUCKET_ID=${accountId}`;
  try {
    const res = await fetch(url, { headers });
    return res.ok; // 200 = online, anything else = offline
  } catch {
    return false;
  }
}

function buildMessage(online, offline) {
  let content = `**Online - ${online.length}**\n`;
  content += online.length ? online.map(n => `• ${n}`).join('\n') : `• None`;

  content += `\n\n**Offline - ${offline.length}**\n`;
  content += offline.length ? offline.map(n => `• ${n}`).join('\n') : `• None`;

  content += `\n\n_Last updated: <t:${Math.floor(Date.now() / 1000)}:R>_`;
  return content;
}

async function main() {
  console.log('Fetching bots and user...');
  const [bots, user] = await Promise.all([getBots(), getUser()]);
  const accountId = user.id;

  console.log(`Found ${bots.length} bots for account ${accountId}`);

  const online = [];
  const offline = [];

  for (const bot of bots) {
    const name = bot.nickname || bot.id;
    const isOnline = await isBotOnline(bot.id, accountId);

    if (isOnline) {
      online.push(name);
      console.log(`✓ ${name} → ONLINE`);
    } else {
      offline.push(name);
      console.log(`✗ ${name} → OFFLINE`);
    }
  }

  online.sort();
  offline.sort();

  const content = buildMessage(online, offline);
  console.log('\n' + content);

  if (MESSAGE_ID) {
    const res = await fetch(`${WEBHOOK_URL}/messages/${MESSAGE_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    console.log('Discord edit status:', res.status);
    if (!res.ok) console.log(await res.text());
  } else {
    console.log('No DISCORD_MESSAGE_ID set – message not edited');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
