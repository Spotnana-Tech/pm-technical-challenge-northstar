/**
 * Utilities only. Anything that encodes a judgment about the data belongs in
 * constitution.js.
 *
 * Nothing here decides whether an option is good, eligible, comparable or
 * safe. These functions parse, format and sort. If you find yourself wanting
 * to add a threshold, an assumption or a default that means something, put it
 * in the constitution instead so it shows up in the audit trail.
 */

const MINUTES_PER_DAY = 24 * 60

/**
 * Parse an `"HH:MM"` clock string into minutes after midnight.
 * @param {string|null|undefined} value e.g. `'08:15'`
 * @returns {number|null} `495`, or `null` if the value is blank/unparseable
 */
export function timeToMinutes(value) {
  if (value == null) return null
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(value))
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Render minutes after midnight as an `"HH:MM"` clock string. Values past
 * midnight wrap onto the next day rather than printing `25:30`.
 * @param {number|null|undefined} minutes e.g. `495`
 * @returns {string|null} `'08:15'`, or `null` for a non-numeric input
 */
export function minutesToTime(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return null
  const wrapped = ((Math.round(Number(minutes)) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hh = String(Math.floor(wrapped / 60)).padStart(2, '0')
  const mm = String(wrapped % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Add (or subtract) minutes from an `"HH:MM"` clock string.
 * @param {string|null|undefined} time e.g. `'17:00'`
 * @param {number} minutes e.g. `35`
 * @returns {string|null} `'17:35'`, or `null` if `time` is unparseable
 */
export function addMinutes(time, minutes) {
  const base = timeToMinutes(time)
  if (base == null || !Number.isFinite(Number(minutes))) return null
  return minutesToTime(base + Number(minutes))
}

/**
 * The price NorthStar puts on the card for an option: air fare, or hotel stay
 * total. This is the displayed figure only — it is not a comparable total and
 * it does not include anything charged elsewhere.
 * @param {object|null|undefined} option raw air or hotel row
 * @returns {number|null}
 */
export function displayedTotal(option) {
  if (!option) return null
  const value = option.product === 'hotel' ? option.total_stay_usd : option.fare_usd
  return Number.isFinite(Number(value)) ? Number(value) : null
}

/** @returns {string[]} the option's accessibility flags, from the parsed field or the raw string */
function accessibilityFlags(option) {
  if (!option) return []
  if (Array.isArray(option.accessibility_flags)) return option.accessibility_flags
  if (typeof option.accessibility === 'string') {
    return option.accessibility.split(';').map((f) => f.trim()).filter(Boolean)
  }
  return []
}

/**
 * Does an option carry a given accessibility flag?
 * @param {object|null|undefined} option raw air or hotel row
 * @param {string} flag e.g. `'AISLE_CONFIRMED'`
 * @returns {boolean}
 */
export function hasFlag(option, flag) {
  if (!flag) return false
  const wanted = String(flag).trim().toUpperCase()
  return accessibilityFlags(option).some((f) => String(f).trim().toUpperCase() === wanted)
}

/**
 * Continuous walking distance implied by an option's accessibility flags.
 * `WALK_420M` → `420`; neither flag present → `null`. VEHICLE_TRANSFER carries
 * no walking distance; returns null — deciding what that means is a
 * constitution call.
 * @param {object|null|undefined} option raw air or hotel row
 * @returns {number|null} metres, or `null` when the option says nothing about walking
 */
export function walkMetres(option) {
  const flags = accessibilityFlags(option)
  for (const flag of flags) {
    const match = /^WALK_(\d+)M$/i.exec(String(flag).trim())
    if (match) return Number(match[1])
  }
  return null
}

/**
 * Format a dollar amount for display: `usd(612)` → `'$612'`, `usd(1040)` → `'$1,040'`.
 * @param {number|null|undefined} n
 * @returns {string} `'—'` when the value is missing
 */
export function usd(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const value = Number(n)
  const rounded = Math.round(Math.abs(value))
  const grouped = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${value < 0 ? '-' : ''}$${grouped}`
}

/**
 * Format a percentage for display: `pct(87)` → `'87%'`, `pct(0.9)` → `'0.9%'`.
 * @param {number|null|undefined} n a percentage, already on a 0–100 scale
 * @returns {string} `'—'` when the value is missing
 */
export function pct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `${Math.round(Number(n) * 10) / 10}%`
}

/** Formats a score to one decimal, rounding half up. */
export function score1(n) {
  return n == null || !Number.isFinite(n) ? '—' : (Math.round(n * 10) / 10).toFixed(1)
}

/**
 * The history rows belonging to one traveler.
 *
 * `Traveler_History` is a single flat sheet, so the caller supplies the
 * traveler records and this reads `history_prefix` off the matching one
 * (`history_id` values are prefixed per traveler). Rows that carry an explicit
 * `traveler_id` are matched on that instead. With neither available the whole
 * sheet comes back unfiltered — filtering is the caller's decision, not this
 * function's.
 *
 * @param {string} travelerId the traveler being ranked
 * @param {object[]} history all `traveler_history` rows
 * @param {Record<string, object>} [travelers] travelers keyed by id
 * @returns {object[]}
 */
export function historyFor(travelerId, history, travelers) {
  const rows = Array.isArray(history) ? history : []
  if (!travelerId) return rows
  if (rows.some((row) => row && row.traveler_id != null)) {
    return rows.filter((row) => row && row.traveler_id === travelerId)
  }
  const prefix = travelers && travelers[travelerId] && travelers[travelerId].history_prefix
  if (!prefix) return rows
  return rows.filter((row) => row && String(row.history_id ?? '').startsWith(prefix))
}

/**
 * 1-based ranks for a set of rows, highest `key` first, ties broken by
 * `option_id` ascending so the result never depends on input order.
 * @param {object[]} rows rows carrying `id` (or `option_id`) and the numeric key
 * @param {string} key e.g. `'finalScore'`
 * @returns {Map<string, number>} id → rank
 */
export function rankOf(rows, key) {
  const idOf = (row) => String(row?.id ?? row?.option_id ?? '')
  const scoreOf = (row) => (Number.isFinite(Number(row?.[key])) ? Number(row[key]) : -Infinity)
  const sorted = [...(rows ?? [])].sort((a, b) => {
    const diff = scoreOf(b) - scoreOf(a)
    if (diff !== 0) return diff
    return idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0
  })
  const ranks = new Map()
  sorted.forEach((row, index) => ranks.set(idOf(row), index + 1))
  return ranks
}
