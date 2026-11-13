const fetch = require('node-fetch');

const FNLB_TOKEN = process.env.FNLB_TOKEN;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const MESSAGE_ID = process.env.DISCORD_MESSAGE_ID;

if (!FNLB_TOKEN || !WEBHOOK_URL) {
  console.error('Missing FNLB_TOKEN or DISCORD_WEBHOOK_URL');
  process.exit(1);
}

console.log('Token starts with:', FNLB_TOKEN.slice(0, 15) + '...');

const headers = {
  Authorization: `Bearer ${FNLB_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'FNLB-Status-Checker/1.2'
};

async function getBots() {
  const res = await fetch('https://api.fnlb.net/v1/bots', { headers });
  const text = await res.text();
  console.log('=== GET /bots status:', res.status);
  console.log('=== GET /bots body:');
  console.log(text);
  if (!res.ok) throw new Error(`Failed to list bots: ${res.status}`);
  return JSON.parse(text);
}

async function getUser() {
  const res = await fetch('https://api.fnlb.net/v1/user', { headers });
  const text = await res.text();
  console.log('=== GET /user status:', res.status);
  console.log('=== GET /user body:');
  console.log(text);
  if (!res.ok) throw new Error(`Failed to get user: ${res.status}`);
  return JSON.parse(text);
}

async function checkGateway(botId, accountId) {
  const url = `https://gateway.fnlb.net/v1/bots/${botId}?FNLB_BUCKET_ID=${accountId}`;
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    console.log(`Gateway ${botId}: ${res.status} → ${text.slice(0, 180)}`);
    return res.ok;
  } catch (err) {
    console.log(`Gateway ${botId}: error → ${err.message}`);
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
  console.log('Starting status check...');

  const [bots, user] = await Promise.all([getBots(), getUser()]);
  const accountId = user.id;

  console.log('Account ID:', accountId);
  console.log('Bots found:', bots.length);

  const online = [];
  const offline = [];

  for (const bot of bots) {
    const name = bot.nickname || bot.displayName || bot.id;
    console.log(`Checking: ${name} (${bot.id})`);

    const isOnline = await checkGateway(bot.id, accountId);

    if (isOnline) {
      online.push(name);
      console.log('→ ONLINE');
    } else {
      offline.push(name);
      console.log('→ OFFLINE');
    }
  }

  online.sort();
  offline.sort();

  const content = buildMessage(online, offline);
  console.log('\n=== Final message ===');
  console.log(content);

  if (MESSAGE_ID) {
    const editUrl = `${WEBHOOK_URL}/messages/${MESSAGE_ID}`;
    const res = await fetch(editUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    console.log('Discord edit status:', res.status);
    if (!res.ok) {
      console.log(await res.text());
    }
  } else {
    console.log('No DISCORD_MESSAGE_ID set – skipping edit');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
