# chiqo.ai

**Local creator intelligence workspace, by Macroview Studio.**

Drop in a Sort Feed CSV (or scrape one with Apify), and get an evidence-based
content framework, hook patterns, and ready-to-shoot scripts — all generated
by Claude, all running on your own machine.

- **Frontend** — React + Vite + Tailwind
- **Backend** — Node.js + Express (CSV parsing, Anthropic SDK with prompt caching, SSE streaming)
- **AI** — `claude-sonnet-4-6` (override via `CLAUDE_MODEL` in `server/.env`)

---

## Quick start (recommended)

Requires **Node.js 18 or newer** ([download](https://nodejs.org)).

1. Clone or download this folder.
2. Copy `server/.env.example` → `server/.env` and paste your real keys.
   The launcher will offer to do this for you on first run if you skip ahead.
3. **Double-click the launcher for your OS:**
   - **Windows** — `chiqo-ai.cmd`
   - **macOS** — `chiqo-ai.command` *(right-click → Open the first time, to get past Gatekeeper)*
   - **Linux** — run `./chiqo-ai.command` from a terminal

The launcher will:

- check Node.js is installed and ≥ 18
- install dependencies on first run (`npm install` in `server/` and `client/`)
- build the React UI to `client/dist/`
- validate `server/.env`
- start the Express server in production mode
- wait until the health check passes
- open your default browser to `http://localhost:3001`

Press `Ctrl+C` to stop the app cleanly.

Install + build + server logs are written to `.chiqo/` in the project root —
look there if anything fails on first run.

You can also run the same flow from a terminal:

```bash
npm start                       # everything above
node scripts/launch.js          # same
node scripts/launch.js --dry-run  # banner + checks only, no server spawn
```

---

## Ship a copy to someone else

There are two paths depending on how polished you want the recipient
experience to be.

### Tier 1 — Folder + launcher (Node required on their machine)

```bash
npm run dist
```

That produces `dist/chiqo-ai-<version>/` with:

- launcher files (`chiqo-ai.cmd`, `chiqo-ai.command`, `scripts/`)
- the **pre-built UI** (`client/dist/`) — no `npm run build` for them
- **pre-installed runtime deps** (`server/node_modules/`, prod-only) — no
  `npm install` for them
- a `SHIP-NOTES.md` with their setup steps

Zip the folder and send it. The recipient still needs **Node.js 18+** on
their machine and their own `server/.env` (a `.env.example` is included).
On their end, double-click the launcher → emerald banner → browser opens
in ~2 seconds.

### Tier 2 — Native Electron app (no Node prereq)

```bash
npm run electron:build:win    # Windows: NSIS installer (.exe)
npm run electron:build:mac    # macOS: drag-to-Applications DMG
npm run electron:build        # both, if you're on the right machine
```

Output lands in `dist-electron/`:

- `dist-electron/win-unpacked/chiqo.ai.exe` — launchable today, copy the
  whole folder anywhere
- `dist-electron/chiqo.ai Setup <version>.exe` — proper NSIS installer
  with desktop shortcut + Start Menu entry
- `dist-electron/chiqo.ai-<version>.dmg` — macOS installer

The Electron app **bundles Node** so the recipient needs nothing
pre-installed. On first launch the app creates `%APPDATA%\chiqo-ai\.env`
(or `~/Library/Application Support/chiqo-ai/.env` on macOS) from the
template and prompts the user to fill in their API keys.

**Already have a working `server/.env` on your dev machine?** The
packaged app reads from `userData`, not from `server/.env`. To skip the
fill-in-the-keys-again step, sync your existing config across in one
command:

```bash
npm run sync-userdata
```

That copies `server/.env`, `server/users.json`, and `server/.session-secret`
(if they exist) into the Electron app's userData folder. Re-run any time
your dev config changes.

### Tier 2.5 — Ship a copy to one specific client (bring-your-own-keys)

For when you want to hand chiqo.ai to one client at a time and let them
provide their own Anthropic / Groq / Apify keys (so they pay for their
own AI usage and you never share yours):

```bash
npm run pack-for-client -- \
  --name "Sarah Doe" \
  --email sarah@example.com \
  --password chiqo-temp-2026
```

That:

- Pre-seeds a user account with their email + password
- Bundles it into a fresh Windows build
- Writes a tailored `SHIP-NOTES.md` inside `dist-electron/win-unpacked/`
  with their name, login, the SmartScreen heads-up, and step-by-step
  instructions for getting the 3 API keys
- Scrubs the temporary credentials from your dev tree afterward

Zip `dist-electron/win-unpacked/` and send it. The client extracts,
double-clicks `chiqo.ai.exe`, fills in their own keys when prompted,
and signs in with the credentials in their SHIP-NOTES.md.

> **Security reality:** API calls are made from the client's machine, so
> any key they paste into `.env` is on their machine. That's why this
> path is "bring-your-own-keys" — their keys, their bill, their
> exposure. If you want clients to use **your** keys without seeing
> them, you need a proxy server (out of scope here).

**Windows quirk:** building the NSIS installer requires symbolic-link
permission. Either run `npm run electron:build:win` from an Admin
PowerShell, or enable Developer Mode (Windows Settings → Privacy &
security → For developers → Developer Mode = On). The
`win-unpacked/chiqo.ai.exe` is produced regardless and works on its own.

**Code signing.** Builds are unsigned. Windows users will see a
SmartScreen warning the first time they run the installer (More info →
Run anyway). macOS users will need to right-click → Open the first time
to bypass Gatekeeper. Real signing requires a paid certificate and is a
separate setup step.

---

## Manual / dev mode

For active development you usually want hot-reload on both sides. Run the
client and server separately:

```bash
# install once
cd server && npm install
cd ../client && npm install

# configure
cp server/.env.example server/.env
# edit server/.env and set ANTHROPIC_API_KEY=sk-ant-...

# in two terminals:
cd server && npm run dev    # terminal 1
cd client && npm run dev    # terminal 2
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the
Express server on port 3001.

---

## How it works

1. User drops a Sort Feed `.csv` onto the upload zone, or kicks off an Apify
   scrape from the dashboard.
2. `POST /api/parse` (multer + `csv-parse`) extracts the relevant columns
   and returns a dataset summary (post count, fields detected, transcript
   coverage, view-data coverage).
3. User clicks **Run framework analysis**.
4. `POST /api/analyze` sends the parsed rows to Claude as a JSON-wrapped
   user message. The system prompt is loaded from
   `SWH_Instagram_Agent_Prompt.md` and marked `cache_control: ephemeral` —
   repeat runs in the same 5-minute window pay roughly 1/10th the input
   cost on the prompt.
5. The endpoint streams Claude's output back as Server-Sent Events. The
   React app appends each `delta` event into the report panel and renders
   it live with `react-markdown` + `remark-gfm`.
6. **Export** saves the rendered report as `<dataset>-framework.md` (or PDF / TXT).

---

## Configuration

All credentials live in `server/.env`:

| Key                  | Required | Notes                                 |
|----------------------|----------|---------------------------------------|
| `ANTHROPIC_API_KEY`  | yes      | Claude Sonnet 4.6 (analysis + scripts)|
| `CLAUDE_MODEL`       | no       | Model override                        |
| `GROQ_API_KEY`       | no       | Whisper transcription of reel audio   |
| `APIFY_TOKEN`        | no       | Required only if you scrape from chiqo|
| `PORT`               | no       | Server port (default `3001`)          |

Settings → API status surfaces which services are configured.

---

## Project layout

```
chiqo.ai/
├── chiqo-ai.cmd                       # Windows launcher (double-click)
├── chiqo-ai.command                   # macOS / Linux launcher (double-click)
├── scripts/
│   ├── launch.js                      # the orchestrator both wrappers call
│   └── lib/banner.js                  # emerald gradient ASCII banner
├── SWH_Instagram_Agent_Prompt.md      # Claude system prompt
├── server/
│   ├── index.js                       # Express + Anthropic SDK + SSE
│   ├── package.json
│   └── .env.example
└── client/
    ├── index.html
    ├── tailwind.config.js
    ├── vite.config.js
    └── src/
        └── ...                        # React app
```

---

## Notes

- **Model override** — set `CLAUDE_MODEL=claude-opus-4-7` in `server/.env`
  to swap models without code changes.
- **Max output** — `max_tokens` is 16k. The full 10-section framework
  typically lands well under that.
- **CSV size** — the upload limit is 20 MB. Larger Sort Feed exports should
  still be fine since only the relevant columns are forwarded.
