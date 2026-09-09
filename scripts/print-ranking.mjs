#!/usr/bin/env node
/**
 * Print the ranking the app would render, without starting the app.
 *
 * Handy while editing src/ranking/constitution.js: every stage's output lands in
 * one table, so you can see what your eligibility rules filtered, what your base
 * score ranked, and what the commercial adjustment moved.
 *
 *   npm run print-ranking
 *   npm run print-ranking -- --traveler T-2071
 *   npm run print-ranking -- --scenario example-transfer-45
 *   npm run print-ranking -- --reasons            # full reason text, not truncated
 *
 * `--traveler` defaults to the traveler in src/data/travelers.json who has travel
 * history. `--scenario` takes the file name (without `.json`) of any scenario in
 * src/scenarios/. There are no assertions here — it just prints.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { runRanking, buildContext } from '../src/ranking/engine.js'
import { historyFor, usd } from '../src/ranking/helpers.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'src', 'data')

// ------------------------------------------------------------------ arguments

function parseArgs(argv) {
  const args = { traveler: null, scenario: null, reasons: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--traveler' || arg === '-t') args.traveler = argv[i + 1] ?? null
    else if (arg.startsWith('--traveler=')) args.traveler = arg.slice('--traveler='.length)
    else if (arg === '--scenario' || arg === '-s') args.scenario = argv[i + 1] ?? null
    else if (arg.startsWith('--scenario=')) args.scenario = arg.slice('--scenario='.length)
    else if (arg === '--reasons') args.reasons = true
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

// ----------------------------------------------------------------------- data

const REQUIRED = [
  'trip.json',
  'travelers.json',
  'traveler_history.json',
  'policy_rules.json',
  'commercial_terms.json',
  'air_options.json',
  'hotel_options.json',
]

const missing = REQUIRED.filter((name) => !existsSync(join(dataDir, name)))
if (missing.length > 0) {
  console.error(`src/data is missing ${missing.join(', ')}.`)
  console.error('Regenerate it from the workbook with:  npm run build-data')
  process.exit(1)
}

const read = (name) => JSON.parse(readFileSync(join(dataDir, name), 'utf8'))

const trip = read('trip.json')
const travelers = read('travelers.json')
const allHistory = read('traveler_history.json')
const policyRules = read('policy_rules.json')
const commercialTerms = read('commercial_terms.json')
const air = read('air_options.json')
const hotel = read('hotel_options.json')

const travelerIds = Object.keys(travelers)
if (travelerIds.length === 0) {
  console.error('travelers.json has no travelers in it.')
  process.exit(1)
}

// Default to whoever has history to rank against, so the output is interesting
// without anyone having to remember an id.
const defaultTravelerId =
  travelerIds.find((id) => travelers[id] && travelers[id].is_cold_start === false) ?? travelerIds[0]

const travelerId = args.traveler ?? defaultTravelerId
const travelerRecord = travelers[travelerId]
if (!travelerRecord) {
  console.error(`Unknown traveler "${travelerId}". travelers.json has: ${travelerIds.join(', ')}`)
  process.exit(1)
}

// ------------------------------------------------------------------ scenarios

const SCENARIO_DIRS = [join(root, 'src', 'scenarios'), join(root, 'private', 'scenarios')]

function loadScenario(id) {
  if (!id || id === 'none') return null
  for (const dir of SCENARIO_DIRS) {
    const path = join(dir, `${id}.json`)
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  }
  console.error(
    `No scenario file named ${id}.json in ${SCENARIO_DIRS.join(' or ')}.`,
  )
  process.exit(1)
}

const splitList = (value) =>
  typeof value === 'string' ? value.split(';').map((part) => part.trim()).filter(Boolean) : []

function parseLoyalty(value) {
  const entries = splitList(value)
  if (entries.length === 1 && /^none\b/i.test(entries[0])) return []
  return entries.map((entry) => {
    const words = entry.split(/\s+/)
    return words.length > 1
      ? { supplier: words.slice(0, -1).join(' '), tier: words[words.length - 1] }
      : { supplier: entry, tier: null }
  })
}

/** Keep a patched string and its parsed twin in step, the way the app's loader does. */
function normalizeOverride(record, patch) {
  if (typeof patch.accessibility === 'string') record.accessibility_flags = splitList(patch.accessibility)
  if (typeof patch.loyalty === 'string') record.loyalty_programs = parseLoyalty(patch.loyalty)
  return record
}

/**
 * The same shallow merge src/scenarios/index.js performs, minus the Vite-only
 * glob loader: trip merges shallowly (commitment one level deeper), travelers
 * and options merge onto their record.
 */
function applyScenario(scenario, data) {
  const next = JSON.parse(JSON.stringify(data))
  if (!scenario) return next

  next.trip = { ...next.trip, ...(scenario.trip ?? {}) }
  if (scenario.trip?.commitment || data.trip.commitment) {
    next.trip.commitment = { ...(data.trip.commitment ?? {}), ...(scenario.trip?.commitment ?? {}) }
  }

  for (const [id, patch] of Object.entries(scenario.travelers ?? {})) {
    if (!next.travelers[id]) {
      console.error(`  ! scenario patches traveler ${id}, which is not in the data`)
      continue
    }
    next.travelers[id] = normalizeOverride({ ...next.travelers[id], ...patch }, patch)
  }

  for (const [id, patch] of Object.entries(scenario.options ?? {})) {
    let found = false
    for (const product of ['air', 'hotel']) {
      const index = next[product].findIndex((option) => String(option.option_id) === String(id))
      if (index < 0) continue
      next[product][index] = normalizeOverride({ ...next[product][index], ...patch }, patch)
      found = true
    }
    if (!found) console.error(`  ! scenario patches option ${id}, which is not in the data`)
  }

  return next
}

const scenario = loadScenario(args.scenario)
const data = applyScenario(scenario, { trip, travelers, air, hotel })
const patchedTraveler = data.travelers[travelerId]

const ctx = buildContext({
  trip: data.trip,
  traveler: patchedTraveler,
  history: historyFor(travelerId, allHistory, data.travelers),
  policyRules,
  commercialTerms,
  scenario: scenario
    ? { id: scenario.id ?? args.scenario, label: scenario.label ?? args.scenario, knobs: scenario.knobs ?? {} }
    : undefined,
})

const result = runRanking(ctx, { air: data.air, hotel: data.hotel })

// -------------------------------------------------------------------- output

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10)
const cell = (value, width, align = 'left') => {
  const text = value == null ? '—' : String(value)
  return align === 'right' ? text.padStart(width) : text.padEnd(width)
}
const score = (n, width) => cell(n == null ? null : round1(n).toFixed(1), width, 'right')
const signed = (n) => (n == null ? '—' : n > 0 ? `+${n}` : String(n))

function printTable(label, rows, reasonWidth) {
  console.log(`\n${label}`)
  console.log(
    [
      cell('id', 7),
      cell('state', 18),
      cell('base', 7, 'right'),
      cell('Δ', 7, 'right'),
      cell('final', 8, 'right'),
      cell('rank', 9),
      cell('moved', 6, 'right'),
      cell('shown', 6),
      'reasons',
    ].join('  '),
  )
  for (const row of rows) {
    const reasons = row.eligibility.reasons.join(' | ')
    console.log(
      [
        cell(row.id, 7),
        cell(row.eligibility.state, 18),
        score(row.baseScore, 7),
        score(row.commercialDelta, 7),
        score(row.finalScore, 8),
        cell(row.rankBefore == null ? null : `${row.rankBefore}→${row.rankAfter}`, 9),
        cell(signed(row.displacement), 6, 'right'),
        cell(row.displayed ? `#${row.displayRank}` : '', 6),
        args.reasons || reasons.length <= reasonWidth ? reasons : `${reasons.slice(0, reasonWidth - 1)}…`,
      ].join('  '),
    )
  }
}

console.log(`constitution  ${result.meta.constitution.name} ${result.meta.constitution.version}`)
console.log(`traveler      ${travelerId} — ${patchedTraveler.name ?? 'unnamed'}`)
const scenarioId = result.meta.scenario.id
const scenarioLabel = result.meta.scenario.label ?? ''
console.log(`scenario      ${scenarioLabel.startsWith(scenarioId) ? scenarioLabel : `${scenarioId} — ${scenarioLabel}`}`)
console.log(
  `trip          ${data.trip.origin}→${data.trip.destination} ${data.trip.outbound_date}, ` +
    `${data.trip.commitment?.label ?? 'commitment'} ${data.trip.commitment?.time_ct ?? '—'} ${data.trip.arrive_timezone ?? ''}, ` +
    `transfer ${data.trip.ground_transfer_minutes} min` +
    (data.trip.ground_transfer_delay_probability
      ? ` (+${data.trip.ground_transfer_delay_minutes} min at ${Math.round(data.trip.ground_transfer_delay_probability * 100)}%)`
      : ''),
)

if (scenario && Array.isArray(scenario.notes) && scenario.notes.length > 0) {
  console.log('\nscenario notes')
  for (const note of scenario.notes) console.log(`  · ${note}`)
}

printTable(`FLIGHTS (${result.meta.counts.air.eligible} of ${result.meta.counts.air.total} eligible)`, result.flights, 90)
printTable(`HOTELS (${result.meta.counts.hotel.eligible} of ${result.meta.counts.hotel.total} eligible)`, result.hotels, 90)

console.log('\nDISPLAYED')
console.log(`  flights  ${result.displayedFlights.map((row) => row.id).join(' ') || '—'}`)
console.log(`  hotels   ${result.displayedHotels.map((row) => row.id).join(' ') || '—'}`)

console.log('\nBUNDLES')
if (result.bundles.length === 0) console.log('  —')
for (const bundle of result.bundles) {
  console.log(
    `  ${bundle.rank}. ${bundle.flight_option_id} + ${bundle.hotel_option_id}  ${usd(bundle.comparable_total_usd)}`,
  )
  if (bundle.note) console.log(`     ${bundle.note}`)
}

if (result.errors.length > 0) {
  console.log('\nENGINE ERRORS')
  for (const error of result.errors) {
    console.log(`  [${error.stage}] ${error.option_id ?? '-'}: ${error.message}`)
  }
}
