/**
 * Scenario loader and patcher.
 *
 * A scenario is a small JSON file that overrides parts of the trip request,
 * the traveler records or individual options before ranking runs. Nothing is
 * mutated in place: `applyScenario` returns deep clones, so switching
 * scenarios in the dropdown is always reversible.
 *
 * Shape:
 * ```json
 * {
 *   "id": "example",
 *   "label": "Human readable",
 *   "trip": { "ground_transfer_minutes": 45, "commitment": { "time_ct": "18:00" } },
 *   "travelers": { "<traveler_id>": { "loyalty": "Kestrel Hotels Gold" } },
 *   "options": { "<option_id>": { "fare_usd": 498 } },
 *   "knobs": { "commission_weight_multiplier": 1.0 },
 *   "notes": ["free text"]
 * }
 * ```
 * `trip` is a shallow merge, except `commitment`, which merges one level
 * deeper. Option and traveler patches are shallow merges onto the record.
 */

import { NONE_SCENARIO } from '../ranking/defaults.js'

const candidateModules = import.meta.glob('./*.json', { eager: true })
// Absent from a candidate checkout; the glob resolves to `{}` and the app runs unchanged.
const privateModules = import.meta.glob('../../private/scenarios/*.json', { eager: true })

/** The unpatched data set. Always first in the dropdown. Shares its id and
 * label with the engine's fallback context — one string, one place. */
export const NONE = Object.freeze({
  id: NONE_SCENARIO.id,
  label: NONE_SCENARIO.label,
  internal: false,
  trip: {},
  travelers: {},
  options: {},
  knobs: {},
  notes: [],
})

/** `'./example-transfer-45.json'` → `'example-transfer-45'` */
function idFromPath(path) {
  const file = String(path).split('/').pop() ?? ''
  return file.replace(/\.json$/i, '')
}

function loadGlob(modules, internal) {
  return Object.keys(modules)
    .sort()
    .map((path) => {
      const raw = modules[path]
      const scenario = raw?.default ?? raw ?? {}
      const id = scenario.id ?? idFromPath(path)
      return Object.freeze({
        internal,
        ...scenario,
        id,
        label: scenario.label ?? id,
        trip: scenario.trip ?? {},
        travelers: scenario.travelers ?? {},
        options: scenario.options ?? {},
        knobs: scenario.knobs ?? {},
        notes: scenario.notes ?? [],
      })
    })
}

const SCENARIOS = [NONE, ...loadGlob(candidateModules, false), ...loadGlob(privateModules, true)]

/** @returns {object[]} every scenario the app can load, `NONE` first. */
export function listScenarios() {
  return SCENARIOS
}

/**
 * @param {string|null|undefined} id
 * @returns {object|null} the scenario, `NONE` for a blank id, `null` when the id is unknown.
 */
export function getScenario(id) {
  if (id == null || id === '' || id === NONE.id) return NONE
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

/** Split a `';'`-separated cell into trimmed entries. */
function splitList(value) {
  if (typeof value !== 'string') return []
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
}

/** `'Meridian Air Platinum; Kestrel Hotels Gold'` → `[{supplier, tier}, …]`; `'None declared'` → `[]` */
function parseLoyalty(value) {
  const entries = splitList(value)
  if (entries.length === 1 && /^none\b/i.test(entries[0])) return []
  return entries.map((entry) => {
    const words = entry.split(/\s+/)
    const tier = words.length > 1 ? words[words.length - 1] : null
    const supplier = words.length > 1 ? words.slice(0, -1).join(' ') : entry
    return { supplier, tier }
  })
}

/**
 * Re-derive the fields the data build script derives, so a patched string and
 * its parsed twin never disagree.
 * @param {object} record the merged record (mutated in place — it is already a clone)
 * @param {object} patch the keys the scenario actually set
 * @returns {object} the same record
 */
export function normalizeOverride(record, patch) {
  if (!record || !patch) return record
  if (typeof patch.accessibility === 'string') {
    record.accessibility_flags = splitList(patch.accessibility)
  }
  if (typeof patch.loyalty === 'string') {
    record.loyalty_programs = parseLoyalty(patch.loyalty)
    if (Array.isArray(record.fields)) {
      record.fields = record.fields.map((field) =>
        String(field?.field ?? '').toLowerCase() === 'loyalty'
          ? { ...field, value: patch.loyalty }
          : field,
      )
    }
  }
  return record
}

function patchTrip(trip, overrides) {
  const next = { ...trip, ...overrides }
  if (overrides.commitment || trip.commitment) {
    next.commitment = { ...(trip.commitment ?? {}), ...(overrides.commitment ?? {}) }
  }
  return next
}

/**
 * Apply a scenario to the shipped data.
 * @param {object|null} scenario from `getScenario`
 * @param {{trip: object, travelers: object, air: object[], hotel: object[]}} data
 * @returns {{trip: object, travelers: object, air: object[], hotel: object[], errors: object[]}}
 *   deep clones, patched. `errors` carries `{stage:'scenario', option_id, message}` for
 *   anything the scenario referred to that is not in the data.
 */
export function applyScenario(scenario, { trip, travelers, air, hotel }) {
  const next = {
    trip: clone(trip ?? {}),
    travelers: clone(travelers ?? {}),
    air: clone(air ?? []),
    hotel: clone(hotel ?? []),
    errors: [],
  }
  if (!scenario || scenario.id === NONE.id) return next

  next.trip = patchTrip(next.trip, scenario.trip ?? {})

  for (const [travelerId, overrides] of Object.entries(scenario.travelers ?? {})) {
    const base = next.travelers[travelerId]
    if (!base) {
      next.errors.push({
        stage: 'scenario',
        option_id: travelerId,
        message: `Scenario "${scenario.id}" patches a traveler that is not in the data`,
      })
      continue
    }
    next.travelers[travelerId] = normalizeOverride({ ...base, ...overrides }, overrides)
  }

  const optionPatches = Object.entries(scenario.options ?? {})
  if (optionPatches.length > 0) {
    const index = new Map()
    for (const product of ['air', 'hotel']) {
      next[product].forEach((option, position) => {
        if (option?.option_id != null) index.set(String(option.option_id), { product, position })
      })
    }
    for (const [optionId, overrides] of optionPatches) {
      const found = index.get(String(optionId))
      if (!found) {
        next.errors.push({
          stage: 'scenario',
          option_id: optionId,
          message: `Scenario "${scenario.id}" patches an option that is not in the data`,
        })
        continue
      }
      const base = next[found.product][found.position]
      next[found.product][found.position] = normalizeOverride({ ...base, ...overrides }, overrides)
    }
  }

  return next
}
