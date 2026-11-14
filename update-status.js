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
  'User-Agent': 'FNLB-Status-Checker/1.4'
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
    return res.ok;
  } catch {
    return false;
  }
}

function buildEmbed(online, offline) {
  const now = new Date();
  const timestamp = now.toISOString();

  // Format: November 13, 2026 at 4:19 PM MST (example)
  const formattedTime = now.toLocaleString('en-US', {
    timeZone: 'America/Denver', // change if you want a different timezone
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) + ' MST';

  const onlineList = online.length
    ? online.map(n => `• ${n}`).join('\n')
    : 'None';

  const offlineList = offline.length
    ? offline.map(n => `• ${n}`).join('\n')
    : 'None';

  return {
    embeds: [
      {
        title: 'FNLB Bot Status',
        color: online.length > 0 ? 0x2ecc71 : 0x95a5a6, // green if any online, gray if all offline
        fields: [
          {
            name: `Online — ${online.length}`,
            value: onlineList,
            inline: false
          },
          {
            name: `Offline — ${offline.length}`,
            value: offlineList,
            inline: false
          }
        ],
        footer: {
          text: `Last checked: ${formattedTime}`
        },
        timestamp: timestamp
      }
    ]
  };
}

// Edits the existing message. Returns true if edited, false if the message no longer exists (404).
async function editMessage(payload) {
  const res = await fetch(`${WEBHOOK_URL}/messages/${MESSAGE_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  console.log('Discord edit status:', res.status);

  if (res.ok) return true;
  if (res.status === 404) {
    console.log('Original message not found (deleted?). Posting a new one.');
    return false;
  }
  throw new Error(`Discord edit failed (${res.status}): ${await res.text()}`);
}

// Posts a new message. ?wait=true makes Discord return the created message (with its id)
// instead of an empty 204, so we can log the id to save as DISCORD_MESSAGE_ID.
async function sendNewMessage(payload) {
  const res = await fetch(`${WEBHOOK_URL}?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`Discord post failed (${res.status}): ${await res.text()}`);
  }

  const msg = await res.json();
  console.log(`Created message ${msg.id}. Set DISCORD_MESSAGE_ID=${msg.id} to edit it on the next run.`);
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
      console.log(`ONLINE  → ${name}`);
    } else {
      offline.push(name);
      console.log(`OFFLINE → ${name}`);
    }
  }

  online.sort();
  offline.sort();

  const payload = buildEmbed(online, offline);
  console.log(JSON.stringify(payload, null, 2));

  let edited = false;
  if (MESSAGE_ID) {
    edited = await editMessage(payload);
  }
  if (!edited) {
    await sendNewMessage(payload);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
