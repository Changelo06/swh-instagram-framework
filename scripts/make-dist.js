// Build a ship-ready chiqo.ai folder.
//
// Output: dist/chiqo-ai-{version}/
//
//   - chiqo-ai.cmd / chiqo-ai.command  (double-click launchers)
//   - scripts/                         (launcher logic)
//   - server/                          (with prod node_modules pre-installed)
//   - client/dist/                     (UI pre-built)
//   - package.json + README.md + SWH_Instagram_Agent_Prompt.md
//
// What the recipient still needs:
//   - Node.js 18+ on PATH
//   - server/.env with their own API keys (a .env.example is shipped)
//
// What they DON'T need:
//   - to run npm install or npm run build (already done)
//   - any dev dependencies, vite, tailwind, etc.
//
// Usage:
//   npm run dist
//   node scripts/make-dist.js

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { printBanner, ok, fail, dim, accent } from "./lib/banner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function ind(line) {
  process.stdout.write(`  ${line}\n`);
}

function die(title, ...details) {
  process.stdout.write("\n");
  ind(fail(title));
  for (const d of details) if (d) ind(`  ${dim(d)}`);
  process.stdout.write("\n");
  process.exit(1);
}

// Recursive copy that skips node_modules / dist by name unless we explicitly
// want them. We pass an `include` predicate so the caller decides per source
// what to do.
function copyDir(src, dst, include = () => true) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (!include(from, entry)) continue;
    if (entry.isDirectory()) copyDir(from, to, include);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function runStep(label, cmd, args, opts) {
  ind(dim(`→ ${label}`));
  const r = spawnSync(cmd, args, {
    ...opts,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    die(`${label} failed.`, `command: ${cmd} ${args.join(" ")}`);
  }
}

function main() {
  printBanner();
  ind(accent("packaging chiqo.ai for distribution"));
  process.stdout.write("\n");

  const rootPkg = readJson(path.join(ROOT, "package.json"));
  const version = rootPkg.version || "0.0.0";
  const outName = `chiqo-ai-${version}`;
  const outDir = path.join(ROOT, "dist", outName);

  ind(`${dim("Version")}     ${version}`);
  ind(`${dim("Output")}      ${path.relative(ROOT, outDir)}`);
  process.stdout.write("\n");

  // 1. Fresh output dir.
  rmrf(outDir);
  fs.mkdirSync(outDir, { recursive: true });
  ind(ok("dist target prepared"));

  // 2. Build the client (always rebuild — guarantees a fresh dist/).
  runStep(
    "build client (vite)",
    NPM_CMD,
    ["--prefix", "client", "run", "build"],
    { cwd: ROOT }
  );
  ind(ok("client build complete"));

  // 3. Install server prod deps into a clean cwd. We copy the server source
  //    first, then run `npm install --omit=dev` inside the copy so the
  //    bundled node_modules contains *only* runtime deps. This keeps the
  //    distributable lean and doesn't mutate your dev tree.
  copyDir(path.join(ROOT, "server"), path.join(outDir, "server"), (from) => {
    const base = path.basename(from);
    if (base === "node_modules") return false;
    if (base === ".env") return false;
    if (base === "users.json") return false;
    if (base === ".session-secret") return false;
    return true;
  });
  ind(ok("server source copied"));

  runStep(
    "install server prod deps",
    NPM_CMD,
    ["install", "--omit=dev", "--no-audit", "--no-fund"],
    { cwd: path.join(outDir, "server") }
  );
  ind(ok("server deps installed (prod only)"));

  // 4. Copy the built client UI. Skip client source + client node_modules —
  //    only `client/dist/` is needed at runtime.
  fs.mkdirSync(path.join(outDir, "client"), { recursive: true });
  copyDir(
    path.join(ROOT, "client", "dist"),
    path.join(outDir, "client", "dist")
  );
  ind(ok("client/dist/ packed"));

  // 5. Copy launchers + scripts/ + root files.
  for (const f of [
    "chiqo-ai.cmd",
    "chiqo-ai.command",
    "package.json",
    "README.md",
    "SWH_Instagram_Agent_Prompt.md",
  ]) {
    const from = path.join(ROOT, f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(outDir, f));
  }
  copyDir(path.join(ROOT, "scripts"), path.join(outDir, "scripts"));
  ind(ok("launcher + scripts copied"));

  // 6. Drop in a tiny SHIP-NOTES.md so the recipient knows what to do.
  const notes = `# chiqo.ai — ${version}

This folder is a ship-ready copy of chiqo.ai by Macroview Studio.

## Setup (one time)

1. Make sure **Node.js 18+** is installed: https://nodejs.org
2. Open \`server/.env.example\`, copy it to \`server/.env\`, paste your real keys.
   - \`ANTHROPIC_API_KEY\` is required.
   - \`GROQ_API_KEY\` and \`APIFY_TOKEN\` are optional.
3. Add yourself as a user:
   \`\`\`
   node scripts/add-user.js you@example.com yourpassword "Your name"
   \`\`\`

## Run

Double-click the launcher for your OS:

- Windows → \`chiqo-ai.cmd\`
- macOS → \`chiqo-ai.command\` (right-click → Open the first time)
- Linux → \`./chiqo-ai.command\` from a terminal

The terminal opens, the emerald banner prints, and your browser opens at
\`http://localhost:3001\`. Sign in with the credentials you set above.

## What's included

- Pre-built UI (\`client/dist/\`) — no \`npm run build\` needed
- Pre-installed server runtime deps (\`server/node_modules/\`) — no \`npm install\` needed
- Launcher logic (\`scripts/\`)

To stop: \`Ctrl+C\` in the terminal window.
`;
  fs.writeFileSync(path.join(outDir, "SHIP-NOTES.md"), notes);
  ind(ok("SHIP-NOTES.md written"));

  // 7. Final summary.
  process.stdout.write("\n");
  ind(`${dim("Built")}       ${path.relative(ROOT, outDir)}`);
  ind(
    `${dim("Next")}        zip the folder and send it. Recipient needs Node 18+ and their own .env.`
  );
  process.stdout.write("\n");
  ind(accent("done."));
  process.stdout.write("\n");
}

main();
