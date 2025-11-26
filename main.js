// main.js
const fs = require("fs");
const { spawn } = require("child_process");
const path = require("path");
const fetch = require("node-fetch");
const { ProxyAgent } = require("proxy-agent");

// ---------------------------------------
// CONTACTS FILE (username:userId:email per line)
// ---------------------------------------
const CONTACT_FILE = path.join(__dirname, "contacts.txt");
const CHECKPOINT_FILE = path.join(__dirname, "checkpoint.txt");

// Create contacts.txt if it doesn't exist
if (!fs.existsSync(CONTACT_FILE)) {
  fs.writeFileSync(CONTACT_FILE, "", "utf8");
  console.log("Created empty contacts.txt file. Please upload your contacts file.");
}

// ---------------------------------------
// CHECKPOINT FUNCTIONS
// ---------------------------------------
function saveCheckpoint(contactLine) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, contactLine, "utf8");
  } catch (e) {
    console.warn("Failed to save checkpoint:", e.message);
  }
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) {
    return null;
  }
  try {
    const checkpoint = fs.readFileSync(CHECKPOINT_FILE, "utf8").trim();
    return checkpoint || null;
  } catch (e) {
    console.warn("Failed to load checkpoint:", e.message);
    return null;
  }
}

function clearCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      fs.unlinkSync(CHECKPOINT_FILE);
    } catch (e) {
      console.warn("Failed to clear checkpoint:", e.message);
    }
  }
}

// ---------------------------------------
// TIMING CONFIG – 1 email every 60 seconds
// ---------------------------------------
const DELAY_MS = 60 * 1000; // 1 minute

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------
// YAHOO ACCOUNTS – ROTATE PER EMAIL
// Load from environment variable as JSON string
// Format: [{"email":"user@yahoo.com","appPassword":"pass"},{"email":"user2@yahoo.com","appPassword":"pass2"}]
// ---------------------------------------
function getEmailAccounts() {
  const envAccounts = process.env.EMAIL_ACCOUNTS;
  if (!envAccounts) {
    throw new Error("EMAIL_ACCOUNTS environment variable is required");
  }
  try {
    return JSON.parse(envAccounts);
  } catch (e) {
    throw new Error("EMAIL_ACCOUNTS must be valid JSON array");
  }
}

const EMAIL_ACCOUNTS = getEmailAccounts();

let currentAccountIndex = 0;

function getNextAccount() {
  const acc = EMAIL_ACCOUNTS[currentAccountIndex];
  currentAccountIndex = (currentAccountIndex + 1) % EMAIL_ACCOUNTS.length;
  return acc;
}

// ---------------------------------------
// IPROYAL PROXIES – ROTATE PER ROBLOX REQUEST
// Load from environment variable as JSON array
// Format: ["http://user:pass@geo.iproyal.com:12321","http://user2:pass2@geo.iproyal.com:12321"]
// ---------------------------------------
function getProxies() {
  const envProxies = process.env.PROXIES;
  if (!envProxies) {
    console.warn("PROXIES environment variable not set, running without proxy");
    return [];
  }
  try {
    return JSON.parse(envProxies);
  } catch (e) {
    throw new Error("PROXIES must be valid JSON array");
  }
}

const PROXIES = getProxies();

let currentProxyIndex = 0;

function getNextProxy() {
  if (!PROXIES.length) return null;
  const proxy = PROXIES[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % PROXIES.length;
  return proxy;
}

// ---------------------------------------
// CONTACT PARSER (pop first line, rewrite file)
// Now with checkpoint support - skips to last processed contact on restart
// ---------------------------------------
function getAllContacts() {
  if (!fs.existsSync(CONTACT_FILE)) {
    console.error("contacts.txt missing!");
    return [];
  }

  const lines = fs
    .readFileSync(CONTACT_FILE, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  return lines;
}

function getNextContact() {
  const lines = getAllContacts();

  if (lines.length === 0) return null;

  const first = lines[0].trim();
  const parts = first.split(":");

  if (parts.length < 3) {
    console.error("Invalid contact line:", first);
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

  // Remove this line from contacts immediately (consumed)
  fs.writeFileSync(CONTACT_FILE, lines.slice(1).join("\n"), "utf8");

  return { username, userId, email, originalLine: first };
}

function skipToCheckpoint() {
  const checkpoint = loadCheckpoint();
  if (!checkpoint) {
    return; // No checkpoint, start from beginning
  }

  console.log(`Resuming from checkpoint: ${checkpoint}`);
  const lines = getAllContacts();

  if (lines.length === 0) {
    console.log("No contacts found, clearing checkpoint.");
    clearCheckpoint();
    return;
  }

  // Find the checkpoint in the file
  const checkpointIndex = lines.findIndex((line) => line.trim() === checkpoint);

  if (checkpointIndex === -1) {
    console.log("Checkpoint not found in contacts file. Starting from beginning.");
    clearCheckpoint();
    return;
  }

  // Remove all lines up to and including the checkpoint
  const remainingLines = lines.slice(checkpointIndex + 1);
  fs.writeFileSync(CONTACT_FILE, remainingLines.join("\n"), "utf8");
  console.log(`Skipped ${checkpointIndex + 1} contacts (already processed). ${remainingLines.length} contacts remaining.`);
}

// ---------------------------------------
// ROBLOX LIMITED SCRAPER + RAP CHECK (with proxies)
// Returns { topItemName, totalRap } or null
// null = no collectibles
// throws = real error (network/proxy/etc.)
// ---------------------------------------
async function getTopLimitedInfo(userId) {
  const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;

  const proxy = getNextProxy();
  const fetchOptions = {
    headers: { Accept: "application/json" },
  };

  if (proxy) {
    const agent = new ProxyAgent(proxy);
    fetchOptions.agent = agent;
    console.log(`Using proxy for user ${userId} (${currentProxyIndex + 1}/${PROXIES.length})`);
  } else {
    console.log(`No proxy in use for user ${userId}`);
  }

  const res = await fetch(url, fetchOptions);

  // 407 = Proxy Authentication Required (from IPRoyal, not Roblox)
  if (res.status === 407) {
    throw new Error(
      `Proxy authentication failed (HTTP 407). Check IPRoyal credentials.`
    );
  }

  if (!res.ok) {
    throw new Error(`Roblox API status ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const data = Array.isArray(json.data) ? json.data : [];

  if (data.length === 0) {
    // no visible collectibles, but not an error
    return null;
  }

  let totalRap = 0;
  for (const item of data) {
    totalRap += item.recentAveragePrice || 0;
  }

  data.sort(
    (a, b) => (b.recentAveragePrice || 0) - (a.recentAveragePrice || 0)
  );

  const top = data[0];
  if (!top || !top.name) return null;

  return { topItemName: top.name, totalRap };
}

// ---------------------------------------
// PYTHON EMAIL SENDER
// ---------------------------------------
function sendEmailWithPython(account, toEmail, username, topItem) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(__dirname, "send_email.py"),
      account.email,
      account.appPassword,
      toEmail,
      username,
      topItem,
    ];

    const py = spawn("python", args, { stdio: "inherit" });

    py.on("error", (err) => reject(err));
    py.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Python exited with code ${code}`));
    });
  });
}

// ---------------------------------------
// MAIN LOOP – 1 email every 60 seconds
// ---------------------------------------
(async () => {
  console.log(
    "=== Email bot started (contacts.txt, RAP >= 100k, 1/minute, rotating Yahoo + IPRoyal proxy) ==="
  );

  // Skip to checkpoint on startup
  skipToCheckpoint();

  while (true) {
    const contact = getNextContact();
    if (!contact) {
      console.log("No contacts left. Finished.");
      clearCheckpoint();
      break;
    }

    const { username, userId, email, originalLine } = contact;
    
    // Skip contacts with invalid emails
    if (!email || email.trim().toUpperCase() === "N/A" || !email.includes("@")) {
      console.log(`Skipping ${username} - invalid or missing email: ${email}`);
      saveCheckpoint(originalLine);
      continue;
    }
    
    console.log(`\nProcessing ${username} (${userId}) <${email}>`);

    let info;
    try {
      info = await getTopLimitedInfo(userId);
    } catch (e) {
      console.error(`FATAL proxy/Roblox error: ${e.message}`);
      console.error(
        "This looks like an IPRoyal configuration issue (wrong port/creds/auth mode). Stopping script."
      );
      // Save checkpoint before exiting so we can resume
      saveCheckpoint(originalLine);
      process.exit(1);
    }

    if (!info) {
      console.log("No visible collectibles (private/terminated/empty). Skipping.");
      // Save checkpoint even for skipped contacts
      saveCheckpoint(originalLine);
      continue;
    }

    const { topItemName, totalRap } = info;

    if (totalRap < 100000) {
      console.log(`Total RAP = ${totalRap} (< 100000). Skipping user.`);
      // Save checkpoint even for skipped contacts
      saveCheckpoint(originalLine);
      continue;
    }

    console.log(`Top item detected: ${topItemName} | Total RAP: ${totalRap}`);

    const account = getNextAccount();
    console.log(`Sending from ${account.email} to ${email}...`);

    try {
      await sendEmailWithPython(account, email, username, topItemName);
      console.log("Email sent successfully.");
    } catch (err) {
      console.error("Failed to send email:", err.message);
    }

    // Save checkpoint after processing (whether email sent or failed)
    saveCheckpoint(originalLine);

    console.log(`Waiting 60 seconds before next email...`);
    await sleep(DELAY_MS);
  }

  console.log("\n=== Done ===");
})();
