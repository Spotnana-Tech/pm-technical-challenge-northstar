# NorthStar

You are the product manager for the flight and hotel results page at NorthStar Travel, a fictional corporate travel platform. This repo is that results page, wired up and running against a real trip request for one traveler, with a second, newly hired traveler for the cold-start question. Everything in it — people, company, carriers, properties, dates, prices — is synthetic. Your job is to rank the options, decide what the page shows and tells people, and write down the rules you used.

## Time box

This exercise runs in two formats — a take-home or a single 60-minute live session — and your recruiter will tell you which one you are in. The time box and deliverables immediately below are the take-home format; see [Two formats](#two-formats).

Three hours, hard stop. We would rather see a sharp partial answer than a padded complete one. Don't try to cover everything; decide what matters most and go deep on that.

AI tools are allowed and expected. You will be assessed on judgment, verification and ownership — not on which tools you used or how the prose reads.

## Deliverables (take-home)

1. **The workbook.** `workbook/NorthStar Exercise - Candidate Workbook.xlsx` has four sheets for you to fill in: `Submission`, `Ranking_Constitution`, `Evidence_Ledger`, `Cold_Start_Answer`. This is the scored submission.
2. **Your edits to `src/ranking/constitution.js`.** Strongly encouraged. The live review runs this app with your file in place, so what you wrote is what gets demonstrated.
3. **An optional `NOTES.md`** at the repo root (already listed in `.gitignore`, so it will not show up in `git status`) describing any changes you would make to the results page UI itself and why.

No memo, no deck, no separate write-up. The workbook sheets and your code are the submission.

## Two formats

Same trip, same page, same questions, assessed the same way. Your recruiter will tell you which format you are in.

**Take-home.** As described above: three hours in your own time, the workbook, your edits to `src/ranking/constitution.js` if you make any, an optional `NOTES.md`, and a live review afterwards.

**Live (60 minutes).** Nothing to prepare beyond installing the app and reading this README — about fifteen minutes. We work in the app together on a shared screen for one hour. The **Worksheet** page replaces the workbook: you fill it in as we go and export it at the end, so there is nothing to write up and nothing to send afterwards.

Open the app with `?mode=live` — `http://localhost:5173/?mode=live` — and a session strip appears under the scenario bar showing the agenda and the clock:

| Segment | Minutes |
|---|---|
| Framing | 5 |
| Audit today's page | 15 |
| Write the rules | 15 |
| Make one rule bind | 10 |
| New fact, rerank, cold start | 10 |
| Wrap | 5 |

You may edit `src/ranking/constitution.js` during the session, and one of the segments is for exactly that. You can type it yourself or dictate it and we will type — nothing is scored on typing speed, and we care about where a rule belongs and what you expect it to change far more than about whether it runs first time.

## Setup

Requires Node 18 or later.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`). No network access is needed after `npm install`.

| Script | What it does |
|---|---|
| `npm run dev` | Start the app locally, with hot reload |
| `npm run build` | Production build (not needed to complete the exercise) |
| `npm run lint` | ESLint over the whole repo |
| `npm run build-data` | Regenerate `src/data/*.json` from the workbook — see below, you should not need this |
| `npm run print-ranking` | Print the current ranking as a table in the terminal (`-- --traveler <id> --scenario <id> --reasons`) |

## Repo map

```
Northstar/
├── workbook/                     the exercise workbook (.xlsx) — source of truth for the trip
├── scripts/build-data.mjs        turns the workbook into src/data/*.json
├── scripts/print-ranking.mjs     prints the current ranking in the terminal
├── src/
│   ├── data/                     generated JSON: trip, travelers, air/hotel options, policy rules,
│   │                             commercial terms, traveler history, data dictionary
│   ├── ranking/
│   │   ├── constitution.js       ★ yours to edit — the ranking logic
│   │   ├── engine.js             pipeline that calls constitution.js and builds the audit trail
│   │   └── helpers.js            shared utilities used by both
│   ├── scenarios/                scenario JSON files the app can load (see below)
│   ├── state/                    app-wide context: current traveler, scenario, view state
│   ├── components/                UI pieces: nav, cards, audit panel, etc.
│   └── pages/                    Results, Traveler, Policy, Worksheet
└── README.md
```

`src/data/*.json` is generated from the workbook by `npm run build-data` and is already committed — you never need to run that script yourself. The JSON keeps the workbook's column names exactly as written (snake_case, no translation), plus a small number of fields the build script derives for convenience: `product` (`'air'` or `'hotel'`), `accessibility_flags` (the accessibility column split into a list), and `source_row` (where the row came from in the workbook). Traveler records also carry `name`, `traveler_id`, `loyalty_programs` (parsed from the loyalty column into structured entries), `history_prefix`, `is_cold_start`, and `fields` (the workbook's own field/value/how-to-read rows, for display). Traveler records also flatten each profile row into a snake_case key (`role`, `tenure`, `loyalty`, `accommodation_on_file`, `stated_preferences`, `personalization_consent`, `approver`, and for the second traveler `your_task`). History rows carry `traveler_id` so they can be filtered per traveler.

## What you can change

`src/ranking/constitution.js` is yours to rewrite, in whole or in part. `engine.js` and `helpers.js` are read-only by convention — read them to understand what they do, but the exercise is about the judgment calls in `constitution.js`, not about changing the plumbing around it.

`constitution.js` exports seven things. The engine calls them in order and records what each one returns, so anything you write here shows up in the audit trail:

```js
export const META = { name: string, version: string }

export function isEligible(option, ctx)
// → { eligible: boolean, state: 'BOOKABLE'|'APPROVAL_REQUIRED'|'INELIGIBLE', reasons: string[] }

export function baseScore(option, ctx)
// → number — traveler-facing quality only, no commission or rebate

export function commercialAdjustment(option, ctx)
// → { delta: number, disclosure: string|null }

export function diversify(ranked, ctx)
// → string[] — option ids, in display order

export function disclose(row, ctx)
// → { traveler_text: string|null, client_text: string|null, tags: string[] }

export function buildBundles(flights, hotels, ctx)
// → { rank, flight_option_id, hotel_option_id, comparable_total_usd, note }[] — at most three
```

`ctx` is frozen and shaped as `{ trip, traveler, history, policyRules, commercialTerms, scenario: { id, label, knobs } }`. `history` is already narrowed to the traveler currently being ranked.

The shipped `constitution.js` is the ranker NorthStar runs in production today. It is not a model answer.

The engine wraps every one of these calls, so if your code throws or returns something malformed, the page shows an error banner and falls back to a neutral default for that call instead of going blank. You can experiment freely without worrying about crashing the app.

## What the app shows you

**Results** is the main page: the top three flight-plus-hotel bundles, then the ranked flight and hotel lists, with a marked "displayed" set and a collapsible "Filtered out" group underneath for anything ineligible. It reads live from whatever `constitution.js` currently produces.

**Traveler** shows the traveler's profile and their full booking history, exactly as it sits in the workbook.

**Policy** lists the policy rules, the commercial terms, and the data dictionary for the underlying fields, so you can check what a column actually means before you rely on it.

**Worksheet** is where the written answer goes in the live format: the workbook's four submission sheets as a page, autosaved in your browser, with an **Export markdown** button that copies and downloads the whole thing. In the take-home format it is a scratchpad — the workbook is still the submission.

The **internal view** toggle, off by default, shows what the traveler themselves would never see: commission, rebate, and the other internal figures behind each option. Toggling it off removes that information from the page entirely, not just visually. The audit panel is the exception: it always shows the commercial delta for every option, because that is what it is for.

The **audit panel** lists, for every option, its base score, commercial delta, final score, rank before and after that delta, and any disclosure text — with a button to copy the whole table as JSON. It's the same data the engine hands to `disclose`, made visible for debugging.

There's also a traveler toggle in the scenario bar, letting you switch between the two travelers the exercise covers without reloading the page.

## Scenarios

The app loads every `.json` file in `src/scenarios/` and lists them in a dropdown. `src/scenarios/example-transfer-45.json` is a worked example — open it to see the shape:

```json
{
  "id": "...",
  "label": "...",
  "trip": { ... },
  "travelers": { "<traveler_id>": { ... } },
  "options": { "<option_id>": { ... } },
  "knobs": { "commission_weight_multiplier": 1.0 },
  "notes": ["..."]
}
```

A scenario patches the trip request, one or more travelers, and/or individual options, without touching the underlying data files — switching scenarios in the dropdown is always reversible. Copy the example file, change the values, drop it in `src/scenarios/`, and it appears in the dropdown automatically. If you would rather not commit a scenario, `private/scenarios/` is gitignored and loaded the same way — anything from there is marked `local` in the dropdown.

You can also load a scenario directly via the URL: `?scenario=<id>&traveler=<id>`.

In the live review, or during a live session, we may load a scenario you have not seen.

## Submitting (take-home)

Zip up the filled workbook, your `src/ranking/constitution.js` if you changed it, and `NOTES.md` if you wrote one, and send that zip to your recruiter. In the live format there is nothing to submit: the exported worksheet is the record. Please do not open a pull request and do not push a public fork of this repo — it's public, and a fork would make your answer visible to other candidates.

## Synthetic data

Every person, company, carrier, property, date, price and reference in this repo is invented for the exercise. Please don't research them.
