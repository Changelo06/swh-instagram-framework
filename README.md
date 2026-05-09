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
