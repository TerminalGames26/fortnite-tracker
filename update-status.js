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
  'User-Agent': 'FNLB-Status-Checker/1.1'
};

async function getBots() {
  const res = await fetch('https://api.fnlb.net/v1/bots', { headers });
  const text = await res.text();
  console.log('=== GET /bots status:', res.status);
  console.log('=== GET /bots body (first 1500 chars):');
  console.log(text.slice(0, 1500));
  if (!res.ok) throw new Error(`Failed to list bots: ${res.status}`);
  return JSON.parse(text);
}

async function getUser() {
  const res = await fetch('https://api.fnlb.net/v1/user', { headers });
  const text = await res.text();
  console.log('=== GET /user status:', res.status);
  console.log('=== GET /user body:', text.slice(0, 500));
  if (!res.ok) throw new Error(`Failed to get user: ${res.status}`);
  return JSON.parse(text);
}

async function checkGateway(botId, accountId) {
  // Try a few common patterns
  const urls = [
    `https://gateway.fnlb.net/v1/bots/${botId}?FNLB_BUCKET_ID=${accountId}`,
    `https://gateway.fnlb.net/v1/bots/${botId}`,
    `https://gateway.fnlb.net/v1/bots?FNLB_BUCKET_ID=${accountId}`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      console.log(`\n--- Gateway check: ${url}`);
      console.log(`Status: ${res.status}`);
      console.log(`Body (first 400 chars): ${text.slice(0, 400)}`);
      if (res.ok) return true;
    } catch (e) {
      console.log(`Error calling ${url}:`, e.message);
    }
  }
  return false;
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
  const accountId = user.id || user._id || user.accountId;
  console.log('\nAccount ID used for gateway:', accountId);
  console.log('Number of bots returned:', bots.length);

  // Log the structure of the first bot so we can see available fields
  if (bots.length > 0) {
    console.log('\n=== First bot object keys ===');
    console.log(Object.keys(bots[0]));
    console.log(JSON.stringify(bots[0], null, 2).slice(0, 800));
  }

  const online = [];
  const offline = [];

  for (const bot of bots) {
    const name = bot.nickname || bot.displayName || bot.name || bot.id;
    console.log(`\nChecking bot: ${name} (${bot.id})`);

    const isOnline = await checkGateway(bot.id, accountId);

    if (isOnline) {
      online.push(name);
      console.log(`→ ONLINE`);
    } else {
      offline.push(name);
      console.log(`→ OFFLINE`);
    }
  }

  online.sort();
  offline.sort();

  const content = buildMessage(online, offline);
  console.log('\n=== Final message content ===');
  console.log(content);

  if (MESSAGE_ID) {
    const editUrl = `${WEBHOOK_URL}/messages/${MESSAGE_ID}`;
    const res = await fetch(editUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    console.log('Discord edit status:', res.status);
    if (!res.ok) console.log(await res.text());
  } else {
    const res = await fetch(WEBHOOK_URL + '?wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    console.log('Created message ID:', data.id);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
