// main.js
require("dotenv").config();

const fs = require("fs");
const { spawn } = require("child_process");
const path = require("path");
const fetch = require("node-fetch");

// ---------- CONFIG VIA ENV ----------

const CONTACT_FILE = process.env.CONTACT_FILE || "contacts.txt";

const MAX_PER_HOUR = Number(process.env.MAX_PER_HOUR || 10);
const MIN_DELAY_SECONDS = Number(process.env.MIN_DELAY_SECONDS || 330); // 5.5 min
const MAX_DELAY_SECONDS = Number(process.env.MAX_DELAY_SECONDS || 420); // 7 min

// which python executable to use
const PYTHON_BIN = process.env.PYTHON_BIN || "python";

const HOUR_MS = 60 * 60 * 1000;

// ------------------------------------

const sendTimestamps = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  const minMs = MIN_DELAY_SECONDS * 1000;
  const maxMs = MAX_DELAY_SECONDS * 1000;
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  const sec = Math.round(ms / 1000);
  console.log(`Waiting ${sec}s before next email...`);
  return sleep(ms);
}

async function enforceRateLimit() {
  const now = Date.now();

  // Remove timestamps older than 1 hour
  for (let i = sendTimestamps.length - 1; i >= 0; i--) {
    if (now - sendTimestamps[i] > HOUR_MS) {
      sendTimestamps.splice(i, 1);
    }
  }

  if (sendTimestamps.length >= MAX_PER_HOUR) {
    const oldest = sendTimestamps[0];
    const waitMs = HOUR_MS - (now - oldest) + 5_000;
    const mins = (waitMs / 1000 / 60).toFixed(1);
    console.log(
      `Hourly cap reached (${sendTimestamps.length}/${MAX_PER_HOUR}). Pausing ~${mins} minutes...`
    );
    await sleep(waitMs);
  }
}

/**
 * Pop first valid contact from CONTACT_FILE
 * Format: username:userId:email
 */
function getNextContact() {
  if (!fs.existsSync(CONTACT_FILE)) {
    console.error(`Contacts file not found: ${CONTACT_FILE}`);
    return null;
  }

  const lines = fs
    .readFileSync(CONTACT_FILE, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return null;
  }

  const first = lines[0].trim();
  const parts = first.split(":");
  if (parts.length < 3) {
    console.error("Invalid contact line (expected username:userId:email):", first);
    fs.writeFileSync(CONTACT_FILE, lines.slice(1).join("\n"), "utf8");
    return getNextContact();
  }

  const [username, userIdStr, email] = parts;
  const userId = parseInt(userIdStr, 10);
  if (isNaN(userId)) {
    console.error("Invalid userId in contact line:", first);
    fs.writeFileSync(CONTACT_FILE, lines.slice(1).join("\n"), "utf8");
    return getNextContact();
  }

  // rewrite contacts without the first line
  fs.writeFileSync(CONTACT_FILE, lines.slice(1).join("\n"), "utf8");

  return { username, userId, email };
}

/**
 * Fetch top limited name via Roblox API.
 * Returns null if inventory private / terminated / no limiteds / error.
 */
async function getTopLimitedName(userId) {
  const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;

  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    console.error(`Network error talking to Roblox for ${userId}:`, err.message);
    return null;
  }

  if (!res.ok) {
    console.log(`Roblox API error ${res.status} for user ${userId}`);
    return null;
  }

  const json = await res.json();
  const data = Array.isArray(json.data) ? json.data : [];

  if (data.length === 0) {
    return null;
  }

  data.sort(
    (a, b) => (b.recentAveragePrice || 0) - (a.recentAveragePrice || 0)
  );
  const top = data[0];
  return top && top.name ? top.name : null;
}

/**
 * Call Python script to send email via Yahoo SMTP.
 */
function sendEmailWithPython(toEmail, username, topItem) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(__dirname, "send_email.py"),
      toEmail,
      username,
      topItem
    ];

    const py = spawn(PYTHON_BIN, args, { stdio: "inherit" });

    py.on("error", (err) => reject(err));
    py.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Python exited with code ${code}`));
    });
  });
}

// -------------- MAIN LOOP --------------

(async () => {
  console.log("=== Email bot started (10/hr cap, Roblox-gated) ===");

  while (true) {
    const contact = getNextContact();
    if (!contact) {
      console.log("No contacts left. All done.");
      break;
    }

    const { username, userId, email } = contact;
    console.log(`\nProcessing ${username} (${userId}) <${email}>`);

    let topItem = null;
    try {
      topItem = await getTopLimitedName(userId);
    } catch (e) {
      console.log("Unexpected Roblox logic error:", e.message);
    }

    if (!topItem) {
      console.log(
        "No visible collectibles (terminated, private inventory, or no limiteds). Skipping this contact."
      );
      continue;
    }

    console.log(`Top item detected: ${topItem}`);

    await enforceRateLimit();

    try {
      await sendEmailWithPython(email, username, topItem);
      sendTimestamps.push(Date.now());
      console.log("Done for this contact.");
    } catch (err) {
      console.error("Failed to send email for this contact:", err.message);
    }

    await randomDelay();
  }
})();
