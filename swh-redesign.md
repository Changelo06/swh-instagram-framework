# SWH Instagram Framework — Apify-Style Redesign

You are redesigning the SWH Instagram Framework UI to match the visual language of the Apify console while preserving 100% of existing functionality. This is a **pure look-and-feel refactor**: no routing changes, no state management changes, no server API changes, no new features.

---

## North star

The user has been running this tool day-to-day and finds the current "tactical/brutalist" aesthetic painful: dense `[ NUMERIC ]` / `[ RANKED ]` / `[ SCATTER ]` type-pills on every widget, all-caps JetBrains Mono labels with heavy `0.08–0.18em` letter-spacing, decorative `SECTION D-01 / DASHBOARD` codes, near-black surfaces (`#0A0A0A`), neon edges, cramped 1px-divider grids.

The target is the Apify console: clean lifted-dark palette, sentence-case sans-serif labels, generous padding, subtle status pills, blue accent for primary actions, tabular data laid out like a formal report.

**The existing functional layout stays.** Sidebar on the left, KPI-tile dashboard on the right, same widgets in the same positions. Only typography, spacing, and surface color change.

---

## Design principles

1. **Surfaces lifted off pure black.** `#14151a` page → `#1c1d22` panels → `#25272d` elevated. Soft cool borders `#2c2e35`. No 1px neon dividers.
2. **Sans-serif default.** Inter (via `@fontsource/inter`) for all UI labels, headings, numbers. JetBrains Mono is **reserved exclusively** for: row IDs, JSON output, code/markdown blocks, and tabular numerics inside data tables (`font-variant-numeric: tabular-nums`).
3. **Sentence-case everywhere.** "Avg views per post", not "AVG VIEWS / POST". Drop letter-spacing tracking on body text.
4. **Quiet decoration.** No `[ TYPE ]` pills. No `SECTION D-XX` codes. No heavy WidgetFrame chrome. Panels distinguished by surface color, not borders.
5. **One accent color.** Brand blue `#4f8dfe` for primary actions, focus rings, and single-row highlights. Status pills use `#22c55e` / `#f59e0b` / `#ef4444` — calmer than the current `#4AF626` neon.
6. **Generous padding.** Cards 20–24px interior padding (current is ~12–16px). Section gaps 24–32px.

---

## Confirmed decisions (do not deviate)

- Dashboard structure stays. Three sparkline KPIs on top, Top 10 reels below, Scatter + Timeline side-by-side, Command bar, Creator tabs above.
- Drop brutalist decorations entirely. No `SECTION D-XX` codes, no `[ NUMERIC ]` / `[ RANKED ]` / `[ SCATTER ]` / `[ COMMAND ]` / `[ DATE ]` type pills, no heavy WidgetFrame headers. Use plain sentence-case section titles ("Dashboard", "Top 10 reels", "Engagement vs views").
- Top 10 ranking: drop the gold/silver/bronze podium palette and the rainbow gradient on rows 4–10. Rank #1 gets a single 3px `#4f8dfe` left-border. Rows #2–#10 are visually uniform.

---

## Forbidden patterns (grep for these before every commit)

```
text-transform: uppercase
textTransform: 'uppercase'
letter-spacing: 0.0[68]em
letterSpacing: '0.0[68]em'
[ NUMERIC ]
[ RANKED ]
[ SCATTER ]
[ COMMAND ]
[ DATE ]
[ TYPE ]
[ MUST HAVES
[ MONTHLY ]
SECTION D-
SECTION A
UNIT D-
font-family: '"JetBrains Mono"   (outside the allow-list)
```

**JetBrains Mono allow-list:** row IDs, JSON viewer, code blocks, markdown rendered output, numeric cells inside `.tac-table`. Nowhere else.

---

## Phased rollout

Each phase is its own commit. After every phase: run `cd client && npm run build`, then `npm run dev`, walk every page, confirm nothing is broken before moving on.

### Phase 1 — Design tokens + typography (foundation)

**File: `client/src/index.css`**

Update `.tac-root` CSS custom properties:

| Token | New value | Old value |
|---|---|---|
| `--tac-bg` | `#14151a` | `#0A0A0A` |
| `--tac-surface` | `#1c1d22` | `#1A1A1A` |
| `--tac-surface2` | `#25272d` (elevated/hover) | `#0D0D0D` (inset) |
| `--tac-border` | `#2c2e35` | `#2A2A2A` |
| `--tac-fg` | `#ebecef` | (same) |
| `--tac-mute` | `#a1a3aa` | `#6B6B6B` |
| `--tac-dim` | `#6c6e75` | `#3A3A3A` |
| `--tac-accent` | `#4f8dfe` | (same) |
| `--tac-ok` | `#22c55e` | (new) |
| `--tac-warn` | `#f59e0b` | (new) |
| `--tac-err` | `#ef4444` | (new) |

**Font loading:** Install `@fontsource/inter` (weights 400, 500, 600, 700). Import in `client/src/main.jsx`. Do **not** use Google Fonts CDN — keep it offline-safe.

**Rewrite utility classes:**

- `.tac-label` → 11px Inter, weight 500, `text-transform: none`, no letter-spacing, color `--tac-mute`.
- `.tac-display` → Inter SemiBold/Bold (drop Archivo Black), normal-case, tighter line-height.
- `.tac-meta` → 12px Inter, `--tac-mute`.
- `.tac-btn` → Inter 13px, weight 500, `border-radius: 6px`, sentence-case. Hover lifts surface; focus ring blue.
- `.tac-btn-accent` → `#4f8dfe` background, rounded.
- `.tac-input` → Inter 13px, `border-radius: 6px`, focus border `#4f8dfe`.
- `.tac-panel` → softer surface, `border-radius: 10px`.
- `.tac-grid-divider` → demote to 1px `--tac-border` only where structurally needed.
- `.tac-error-banner` → keep red accent bar concept, sentence-case.

**Add new utilities:**

- `.tac-table` — 13px row text, header row in `--tac-mute` Inter 11px medium, hover state, subtle row dividers, `font-variant-numeric: tabular-nums` on numeric cells.
- `.tac-pill` — `border-radius: 9999px`, `padding: 2px 8px`, 11px. Three flavors: `.tac-pill--ok` (green), `.tac-pill--warn` (amber), `.tac-pill--err` (red).

**Remove the global `border-radius: 0 !important` reset.**

**Update Recharts overrides** to the new palette: axis ticks `--tac-mute`, grid lines `--tac-border` at low opacity, tooltip background `--tac-surface2`.

**Verification:** Build cleanly, walk Dashboard / Dataset / Analyze / Scripts / Apify. Layouts unchanged structurally but already feel lighter and more readable.

---

### Phase 2 — Shell polish (Sidebar + Topbar)

**`client/src/tactical/shell/Sidebar.jsx`**
- Sentence-case nav labels: Dashboard, Dataset, Analyze, Scripts, Apify.
- Drop letter-spacing.
- Switch label font from JetBrains Mono to Inter (inherits from body).

**`client/src/tactical/shell/Topbar.jsx`**
- Drop the `SECTION_LABEL` map's uppercase styling. Just the page name: "Dashboard".
- API status dot becomes a small text chip in sentence-case: "Online" / "Groq missing" / "Offline".
- Drop heavy uppercase on operator-id badge.

---

### Phase 3 — Dashboard rewrite (the main pain point)

This is the biggest phase. Do widget-by-widget, commit between major widgets if you want safer revert points.

**`client/src/tactical/widgets/WidgetFrame.jsx`**
- Remove the `[ TYPE ]` pill.
- Remove minimize/expand toggle (or move to hover-only).
- Replace 1px sharp border with `--tac-surface` panel + 10px radius.
- Header becomes plain sentence-case title in Inter 14px medium.

**`client/src/tactical/views/DashboardView.jsx`**
- Drop `[ MUST HAVES // NON-NEGOTIABLE ]` and `[ MONTHLY ]` tags.
- Replace `SECTION D-01 / DASHBOARD` eyebrow with nothing (the Topbar carries the page title now).
- Dataset filename moves into a small subdued line under the handle.

**`client/src/tactical/widgets/SparklineCard.jsx`**
- Drop `[ NUMERIC ]` pill.
- Big number: Inter SemiBold 28–32px (drop Archivo Black uppercase).
- Label sentence-case ("Avg views per post").
- 20–24px padding.
- Sparkline stays single-color blue.

**`client/src/tactical/widgets/Top10ReelsGrid.jsx`**
- Drop `[ RANKED ]` pill.
- Sort tabs (Views / Likes / Comments / Engagement) become an underline-on-active row in sentence-case.
- Remove gold/silver/bronze tinted borders + rainbow palette.
- Rank #1 only: 3px left border `#4f8dfe`. Rows 2–10 uniform.
- Replace 4-cell `VWS / LKS / CMT / DUR` mono grid with a proper right-aligned numeric column layout (table-style with `tabular-nums`). This scans better than the inline chip approach when comparing across 10 rows.

**`client/src/tactical/widgets/ScatterPlot.jsx`**
- Drop `[ SCATTER ]` pill, "X / VIEWS" / "Y / ENGAGEMENT" mono headers.
- Recharts axes: `--tac-mute` Inter 11px, grid lines very light `--tac-border`.
- Keep duration-bucket coloring (information-bearing) but switch to a single sequential ramp (teal → blue → violet, 5 steps). Don't use a categorical/rainbow palette — duration is ordinal.
- Restyle tooltip to `--tac-surface2`.

**`client/src/tactical/widgets/LiveTimeline.jsx`**
- Drop `[ DATE ]` pill.
- Day labels: Mon/Tue/Wed/Thu/Fri/Sat/Sun (not MO/TU/WE).
- Bars use single `#4f8dfe` blue (drop rainbow neon).
- "STREAM ACTIVE" status row becomes a quiet sentence-case caption.

**`client/src/tactical/widgets/CommandInput.jsx`**
- Drop `[ COMMAND ]` pill.
- Keep `>` prompt and query engine logic intact.
- Restyle input shell, RUN button, result table using `.tac-input` / `.tac-btn-accent` / `.tac-table`.
- Header sentence-case: "Query the dataset".

**`client/src/tactical/widgets/CreatorTabs.jsx`**
- Drop `FILTER // CREATORS` mono uppercase header.
- Each creator's left-border keeps a subtle accent — single accent color, not rainbow.
- Sentence-case secondary text.

**`client/src/tactical/widgets/SkeletonGrid.jsx`**
- Inherits new tokens. Soften shimmer color stops.

**`client/src/tactical/widgets/ValidationGate.jsx`**
- Drop ASCII corner brackets (`tac-frame`).
- Modal becomes a regular centered card.
- Sentence-case layer labels: "Reel URL — required", not "URL // REEL DESTINATION".

**`client/src/tactical/widgets/ApifyRunPanel.jsx`**
- Change 3px `borderLeft` accent stripe → small `.tac-pill` at the top-left of the card.
- Sentence-case status: "Running · starting", not "RUNNING · STARTING".

**`client/src/tactical/widgets/StatusMatrix.jsx`** and **`IntelligentList.jsx`** (if rendered on dashboard) — same treatment.

**Verification:** Open the Dashboard with a real dataset. Compare side-by-side to the Apify reference. Should feel of the same family — clean, formal, scannable at a glance.

---

### Phase 4 — Remaining views + final sweep

**`client/src/tactical/views/DatasetView.jsx`**
- Swap to `.tac-table`.
- Drop section codes.
- Restyle search input.

**`client/src/tactical/views/AnalyzeView.jsx`**
- Sentence-case phase labels.
- Restyle transcribe progress bar.
- Streamed report area: Inter for body, Mono only for code blocks.

**`client/src/tactical/views/ScriptsView.jsx`**
- Per-variation card chrome simplified.
- Same token + sentence-case treatment.

**`client/src/tactical/views/ApifyView.jsx`**
- Drop `SECTION D-05 / APIFY`.
- Sentence-case labels.
- Form already structurally close — mostly token alignment.

**`client/src/tactical/shell/SettingsDrawer.jsx`**
- Drop `UNIT D-01 / SETTINGS`, `SECTION A / TELEMETRY`, `SECTION D / DISPLAY`.
- Sentence-case section titles: "Display", "Groq Whisper", "Telemetry".
- Service rows use `.tac-pill` for status.

**Final sweep:** grep for every pattern in the **Forbidden patterns** section above. Fix any hits.

---

## Critical files map

| Phase | File | Change |
|---|---|---|
| 1 | `client/src/index.css` | New tokens, font, utility classes, `.tac-table`, `.tac-pill`. Drop `border-radius: 0 !important`. |
| 1 | `client/src/main.jsx` | Import `@fontsource/inter` weights. |
| 2 | `client/src/tactical/shell/Sidebar.jsx` | Sentence-case labels, drop tracking. |
| 2 | `client/src/tactical/shell/Topbar.jsx` | Sentence-case section name, calmer status chip. |
| 3 | `client/src/tactical/widgets/WidgetFrame.jsx` | Drop `[ TYPE ]` pill, simplify chrome. |
| 3 | `client/src/tactical/views/DashboardView.jsx` | Drop section codes and bracket tags. |
| 3 | `client/src/tactical/widgets/SparklineCard.jsx` | Inter numbers, sentence-case label, generous padding. |
| 3 | `client/src/tactical/widgets/Top10ReelsGrid.jsx` | Drop podium palette + rainbow; #1-only blue accent; tabular layout. |
| 3 | `client/src/tactical/widgets/ScatterPlot.jsx` | Recharts restyle, sequential duration ramp. |
| 3 | `client/src/tactical/widgets/LiveTimeline.jsx` | Sentence-case days, single-color bars. |
| 3 | `client/src/tactical/widgets/CommandInput.jsx` | Drop pill, restyle input + result table. |
| 3 | `client/src/tactical/widgets/CreatorTabs.jsx` | Drop FILTER // CREATORS, single accent. |
| 3 | `client/src/tactical/widgets/ValidationGate.jsx` | Drop ASCII brackets, sentence-case. |
| 3 | `client/src/tactical/widgets/ApifyRunPanel.jsx` | Status pill instead of left stripe. |
| 3 | `client/src/tactical/widgets/SkeletonGrid.jsx` | Soften shimmer. |
| 4 | `client/src/tactical/views/DatasetView.jsx` | `.tac-table` swap. |
| 4 | `client/src/tactical/views/AnalyzeView.jsx` | Sentence-case phase labels, calmer typography. |
| 4 | `client/src/tactical/views/ScriptsView.jsx` | Variation card chrome simplified. |
| 4 | `client/src/tactical/views/ApifyView.jsx` | Drop `SECTION D-05`, sentence-case. |
| 4 | `client/src/tactical/shell/SettingsDrawer.jsx` | Drop unit/section codes, sentence-case. |

---

## Out of scope

- No routing, state management, or server API changes.
- No new functionality.
- No mobile responsive overhaul (desktop-first like Apify).
- Light/gray theme switcher: leave the toggle wired but the new palette is dark-first.
- Bundle size / code splitting (the build warning is real but separate).

---

## End-to-end verification (after Phase 4)

1. `cd client && npm run build` — clean build, no new warnings.
2. `npm run start` (root) — boots production server.
3. Walk every page: Dashboard, Dataset, Analyze, Scripts, Apify, Settings drawer. Compare to Apify reference.
4. Smoke a real flow: Apify scrape (5 posts, one creator) → Groq transcribe → Fast analysis → single-reel variation → export PDF. All functionality intact.
5. Run the forbidden-patterns grep one final time. Zero hits.

---

## Working rules for Claude Code

- **Plan mode for Phase 3.** It touches 11 files. Show the full diff plan before writing.
- **One widget at a time.** Don't batch-rewrite Phase 3 widgets in a single pass — easier to review and revert.
- **Build between widgets** if anything looks risky. Catch broken imports early.
- **Don't invent new tokens.** If a color isn't in the table above, ask before adding.
- **Don't touch out-of-scope files.** Server, routing, and state files stay untouched even if you notice issues there.
- **Preserve all `data-*` attributes, `id`s, `aria-*` labels, and event handlers.** This is purely visual.