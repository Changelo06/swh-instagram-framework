// Build a chiqo.ai.exe pre-provisioned for one specific client.
//
// Usage:
//   node scripts/pack-for-client.js --name "Sarah Doe" --email sarah@example.com --password chiqo2026
//
// What it does:
//   1. Hashes the password (scrypt) and writes server/users.json.default
//      with one pre-seeded user — that file gets bundled into the .exe
//      and copied to the client's userData on their first launch.
//   2. Runs `npm run electron:build:win` to produce a Windows unpacked
//      build at dist-electron/win-unpacked/.
//   3. Generates a tailored SHIP-NOTES.md inside the unpacked folder
//      with the client's name, the SmartScreen heads-up, links to get
//      the 3 API keys, and their login credentials.
//   4. Removes server/users.json.default so the dev tree stays clean
//      and you don't accidentally ship one client's creds to another.
//
// Output: dist-electron/win-unpacked/  ← zip this folder and send it.
//
// API keys: NOT included. The client provides their own (Anthropic
// required, Groq + Apify optional). The app prompts them to fill in
// %APPDATA%\chiqo-ai\.env on first launch.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../server/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";

// --- CLI parsing -----------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const name = args.name && String(args.name).trim();
const email = args.email && String(args.email).trim();
const password = args.password && String(args.password);

if (!name || !email || !password) {
  console.error(`
Usage:
  node scripts/pack-for-client.js \\
    --name "Their Name" \\
    --email them@example.com \\
    --password their-temporary-password

All three are required. The password will be hashed (scrypt); the plaintext
shows up exactly once — in the SHIP-NOTES.md inside the resulting build —
and never gets stored.
`);
  process.exit(1);
}

if (!/.+@.+\..+/.test(email)) {
  console.error(`error: "${email}" doesn't look like an email.`);
  process.exit(1);
}

// --- Generate users.json.default ------------------------------------------

const defaultPath = path.join(ROOT, "server", "users.json.default");

const now = new Date().toISOString();
const userId = `u_${Math.random().toString(36).slice(2, 10)}`;
const user = {
  id: userId,
  email,
  passwordHash: hashPassword(password),
  label: name,
  apiKey: null,
  createdAt: now,
  updatedAt: now,
};
fs.writeFileSync(
  defaultPath,
  JSON.stringify({ users: [user] }, null, 2) + "\n",
  { mode: 0o600 }
);
console.log(`✓ wrote server/users.json.default for ${name} <${email}>`);

// --- Build -----------------------------------------------------------------

function step(label, fn) {
  console.log(`\n→ ${label}`);
  fn();
}

let cleanup = () => {
  // Always wipe the temporary defaults file, success or failure, so the
  // dev tree never carries a client's hashed password around.
  try {
    fs.unlinkSync(defaultPath);
    console.log("✓ removed server/users.json.default");
  } catch {}
};

try {
  const unpackedDir = path.join(ROOT, "dist-electron", "win-unpacked");
  const expectedExe = path.join(unpackedDir, "chiqo.ai.exe");
  const exeMtimeBefore = fs.existsSync(expectedExe)
    ? fs.statSync(expectedExe).mtimeMs
    : 0;

  step("electron:build:win:dir (this takes ~1 min)", () => {
    // Use `--dir` (unpacked) instead of `--win` (which also tries to make
    // an NSIS installer). The installer step fails on Windows boxes that
    // don't have Developer Mode on (symlink-permission issue inside
    // electron-builder's code-sign cache extraction).
    //
    // electron-builder also returns a non-zero exit code if the post-pack
    // winCodeSign cache extraction sees symlink-permission errors — even
    // when the unpacked artifact itself built fine. So we ignore the exit
    // code and instead verify the .exe got rebuilt by mtime.
    spawnSync(NPM_CMD, ["run", "electron:build:win:dir"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });
    if (!fs.existsSync(expectedExe)) {
      throw new Error(
        `electron-builder did not produce ${path.relative(ROOT, expectedExe)}`
      );
    }
    const exeMtimeAfter = fs.statSync(expectedExe).mtimeMs;
    if (exeMtimeAfter <= exeMtimeBefore) {
      throw new Error(
        `${path.relative(ROOT, expectedExe)} was not refreshed — the build silently no-op'd`
      );
    }
  });

  const firstName = name.split(/\s+/)[0];
  const notes = `# chiqo.ai — your copy

Hi ${firstName},

This folder is your personal copy of chiqo.ai. Everything you need is
inside it. **Don't share this folder** with anyone else — it has your
login baked in.

---

## How to run it

1. **Double-click \`chiqo.ai.exe\`** (it's in this folder).

2. The first time you do this, Windows will pop a blue
   **"Windows protected your PC"** screen. That's because chiqo.ai is
   unsigned (the way most small-shop apps start out). Click:

   - **More info**
   - then the **Run anyway** button that appears.

   You'll only see this the first time per machine.

3. The app opens a **"Set up your API keys"** dialog. Click
   **Open in editor** — Notepad opens a small \`.env\` file.

4. Paste your API keys into it (see below for how to get them), save
   the file (Ctrl+S), and close Notepad.

5. Double-click \`chiqo.ai.exe\` again. The chiqo window opens.

6. **Sign in:**

   - **Email:** \`${email}\`
   - **Password:** \`${password}\`

   *Please rotate this password later — let me know what you change
   it to and I'll update my notes.*

That's it. You're in.

---

## How to get the 3 API keys

Only the first one is required. The other two unlock extra features.

### 1. Anthropic (required — powers Claude analysis)

1. Go to **https://console.anthropic.com/settings/keys**
2. Sign up (or sign in) and add a payment method — Claude isn't free,
   but the app caches prompts and a normal run costs a few cents.
3. Click **Create Key**, copy the key (it starts with \`sk-ant-\`).
4. Paste it into the \`.env\` file after \`ANTHROPIC_API_KEY=\`.

### 2. Groq (optional — transcribes reel audio for analysis)

If you skip this, scraping and analysis still work, but reels won't
have audio transcripts feeding the framework.

1. Go to **https://console.groq.com/keys** — free tier is generous.
2. Create a key (starts with \`gsk_\`).
3. Paste it after \`GROQ_API_KEY=\`.

### 3. Apify (optional — scrapes Instagram from inside the app)

If you skip this, you can still upload Instagram exports as CSVs
(from Sort Feed or similar), but you can't kick off a scrape from
the chiqo dashboard.

1. Go to **https://console.apify.com/account#/integrations**
2. Sign up (free tier exists).
3. Copy your API token (starts with \`apify_api_\`).
4. Paste it after \`APIFY_TOKEN=\`.

---

## Where stuff lives

- Your API keys: \`%APPDATA%\\chiqo-ai\\.env\`
- Your login data: \`%APPDATA%\\chiqo-ai\\users.json\` (already seeded)
- Usage logs (per-analysis cost in USD): \`%APPDATA%\\chiqo-ai\\logs\\usage.jsonl\`

To check API status inside the app: bottom of the sidebar → Settings.

---

## To stop the app

Just close the chiqo window. Everything shuts down cleanly.

---

## To put a shortcut on your Desktop

Right-click \`chiqo.ai.exe\` → **Send to** → **Desktop (create shortcut)**.
Rename it to "chiqo.ai" and you're done.

---

Questions / problems: ping ${name === firstName ? "me" : firstName + " can ping the sender"} directly.

Built on ${new Date().toISOString().slice(0, 10)}.
`;

  fs.writeFileSync(path.join(unpackedDir, "SHIP-NOTES.md"), notes);
  console.log(`✓ wrote SHIP-NOTES.md inside ${path.relative(ROOT, unpackedDir)}`);

  // --- Done ----------------------------------------------------------------

  cleanup();
  cleanup = () => {}; // no-op the finally-block cleanup

  console.log(`
─────────────────────────────────────────────────────────────
Built a client copy for ${name} <${email}>.

  folder:  ${path.relative(ROOT, unpackedDir)}/
  size:    ~357 MB

Next steps:
  1. Zip the folder above (right-click → Send to → Compressed (zipped)).
  2. Send the zip to ${email}.
  3. SHIP-NOTES.md inside the folder walks them through setup.

Their login (also in SHIP-NOTES.md):
  email:    ${email}
  password: ${password}

Their plaintext password is in SHIP-NOTES.md only — nowhere else on
your machine. Once they rotate it, even you can't recover it.
─────────────────────────────────────────────────────────────
`);
} catch (e) {
  cleanup();
  console.error(`\n✗ pack-for-client failed: ${e.message || e}`);
  process.exit(1);
}
