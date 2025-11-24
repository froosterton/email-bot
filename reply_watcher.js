// reply_watcher.js
require("dotenv").config();

const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const fetch = require("node-fetch");

const YAHOO_EMAIL = process.env.YAHOO_EMAIL;
const YAHOO_APP_PASSWORD = process.env.YAHOO_APP_PASSWORD;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const CHECK_INTERVAL_MS = 60_000; // 60 seconds

if (!YAHOO_EMAIL || !YAHOO_APP_PASSWORD || !DISCORD_WEBHOOK_URL) {
  console.error("Missing YAHOO_EMAIL, YAHOO_APP_PASSWORD or DISCORD_WEBHOOK_URL in env.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToDiscord({ fromName, fromAddress, subject, preview, date }) {
  const content =
    `📧 **New reply received**\n` +
    `From: **${fromName || "(no name)"}** <${fromAddress}>\n` +
    `Subject: ${subject || "(no subject)"}\n` +
    `Date: ${date.toISOString()}\n\n` +
    `Preview:\n${preview}`;

  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });

    if (!res.ok) {
      console.error("Discord webhook error:", res.status, await res.text());
    } else {
      console.log("Sent notification to Discord.");
    }
  } catch (err) {
    console.error("Failed to call Discord webhook:", err.message);
  }
}

async function checkInbox(client) {
  const lock = await client.getMailboxLock("INBOX");
  try {
    for await (const msg of client.fetch(
      { seen: false },
      { envelope: true, source: true, uid: true }
    )) {
      const env = msg.envelope;
      const from = env.from && env.from[0];
      const fromName = from ? (from.name || "").trim() : "";
      const fromAddress = from ? from.address : "";

      // Ignore messages from yourself
      if (
        fromAddress &&
        fromAddress.toLowerCase() === YAHOO_EMAIL.toLowerCase()
      ) {
        continue;
      }

      const subject = env.subject || "";
      const date = env.date || new Date();

      const parsed = await simpleParser(msg.source);
      const text = (parsed.text || "").replace(/\s+/g, " ").trim();
      const preview =
        text.length > 400 ? text.slice(0, 400) + "..." : text || "(no text)";

      console.log(
        `New reply from ${fromAddress || "unknown"} with subject "${subject}"`
      );

      await sendToDiscord({ fromName, fromAddress, subject, preview, date });

      // Mark as seen
      await client.messageFlagsAdd(msg.uid, ["\\Seen"]);
    }
  } finally {
    lock.release();
  }
}

async function main() {
  const client = new ImapFlow({
    host: "imap.mail.yahoo.com",
    port: 993,
    secure: true,
    auth: {
      user: YAHOO_EMAIL,
      pass: YAHOO_APP_PASSWORD
    }
  });

  await client.connect();
  console.log("Connected to Yahoo IMAP. Watching for replies...");

  try {
    while (true) {
      await checkInbox(client);
      await sleep(CHECK_INTERVAL_MS);
    }
  } catch (err) {
    console.error("Watcher error:", err);
  } finally {
    await client.logout();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
