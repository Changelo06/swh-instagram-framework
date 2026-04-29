# SWH Instagram Framework Builder

Web app that turns a Sort Feed CSV export into a complete, evidence-based **SWH Content Framework Report** using Claude.

- **Frontend** — React + Vite + Tailwind (dark navy + gold)
- **Backend** — Node.js + Express, CSV parsing, Anthropic SDK with prompt caching, SSE streaming
- **AI** — `claude-sonnet-4-6`
- **Agent prompt** — [`SWH_Instagram_Agent_Prompt.md`](./SWH_Instagram_Agent_Prompt.md)

---

## One-click launcher (recommended)

Requires **Node.js 20+** ([download](https://nodejs.org/)).

1. Clone or download this repo.
2. Open `server/.env.example`, copy it to `server/.env`, paste your real API keys
   (the launcher will do this for you on first run and prompt you to fill them in).
3. **Double-click the launcher for your OS:**
   - **Windows** — `SWH-Framework.cmd`
   - **macOS** — `SWH-Framework.command` (right-click → Open the first time, to bypass Gatekeeper)
   - **Linux** — run `./SWH-Framework.command` from a terminal

The launcher will:
- install dependencies on first run (`npm install` in `server/` and `client/`)
- build the React UI to `client/dist/`
- start the Express server in production mode (it serves the UI **and** the API on the same port)
- open your default browser to `http://localhost:3001/`

Press `Ctrl+C` (or close the terminal window) to stop the app.

You can also run the same flow from a terminal:

```bash
npm start          # full setup + build + launch
npm run start:fast # skip setup/build (assumes already done)
```

---

## Manual / dev mode

For active development you usually want hot-reload. Run the client and server in
separate terminals:

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure the API key

```bash
cp server/.env.example server/.env
# edit server/.env and set ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run both processes

In two terminals:

```bash
# terminal 1
cd server && npm run dev

# terminal 2
cd client && npm run dev
```

Open http://localhost:5173.

The Vite dev server proxies `/api/*` to the Express server on port 3001.

---

## How it works

1. User drops a Sort Feed `.csv` onto the upload zone.
2. `POST /api/parse` (multer + `csv-parse`) extracts the SWH-relevant columns and returns a dataset summary (post count, fields detected, transcript coverage, view-data coverage).
3. User clicks **Run Framework Analysis**.
4. `POST /api/analyze` sends the parsed rows to Claude as a JSON-wrapped user message. The system prompt is loaded from `SWH_Instagram_Agent_Prompt.md` and marked `cache_control: ephemeral` — repeat runs in the same 5-minute window pay roughly 1/10th the input cost on the prompt.
5. The endpoint streams Claude's output back as Server-Sent Events. The React app appends each `delta` event into the report panel and renders it live with `react-markdown` + `remark-gfm`.
6. **Download .md** saves the rendered report as `<csv-name>-framework.md`.

---

## Project layout

```
swh-instagram-framework/
├── SWH_Instagram_Agent_Prompt.md     # the agent's master system prompt
├── server/
│   ├── index.js                      # Express + Anthropic SDK + SSE
│   ├── package.json
│   └── .env.example
└── client/
    ├── index.html
    ├── tailwind.config.js
    ├── vite.config.js
    └── src/
        ├── App.jsx                   # upload → analyze → report
        ├── main.jsx
        └── index.css                 # navy/gold theme + report markdown styles
```

---

## Notes

- **Model override** — set `CLAUDE_MODEL=claude-opus-4-7` in `server/.env` to swap models without code changes.
- **Max output** — `max_tokens` is 16k. The full 10-section framework typically lands well under that.
- **CSV size** — the upload limit is 20 MB. Larger Sort Feed exports should still be fine since only the SWH-relevant columns are forwarded.
- **Voice rule** — the system prompt forbids inserting SWH brand language into outputs. Frameworks are always rendered in the analyzed creator's voice.
