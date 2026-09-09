/**
 * NorthStar ranking constitution.
 *
 * This is the ranker NorthStar ships today. It has been in production for two
 * quarters and has never been audited. It is not a model answer — every stage
 * below is yours to change.
 *
 * The engine calls these six functions in order and records what each one
 * returned, so whatever you write here shows up in the audit trail.
 *
 *   isEligible           → which options may be ranked at all
 *   baseScore            → how good an option is for the traveler
 *   commercialAdjustment → what NorthStar's own interest is allowed to move
 *   diversify            → which of the ranked options get a result slot
 *   disclose             → what the traveler and the client are told
 *   buildBundles         → the three flight + hotel pairs at the top of the page
 *
 * `ctx` is shallowly frozen: `{ trip, traveler, history, policyRules, commercialTerms,
 * scenario: { id, label, knobs } }`. `history` is already narrowed to the
 * traveler being ranked.
 */

import { displayedTotal } from './helpers.js'

export const META = { name: 'Baseline v0 (shipped)', version: '0.4.2' }

const COMMERCIAL_WEIGHT = 1.5
const DISPLAY_SLOTS = 5

const ASSUMED_ON_TIME = 85
const ASSUMED_CANCEL = 1.0
const ASSUMED_REVIEW = 4.5
const ASSUMED_CANCEL_PCT = 0.3

/**
 * Stage 1 — eligibility.
 *
 * Reads the rule engine's `policy_status` and maps it onto the three states the
 * results page knows how to draw. `INELIGIBLE` options are still returned to
 * the engine so the page can list them under "Filtered out".
 *
 * TODO content-source handling predates NDC
 *
 * @param {object} option raw air or hotel row
 * @param {object} ctx shallowly frozen ranking context
 * @returns {{ eligible: boolean, state: 'BOOKABLE'|'APPROVAL_REQUIRED'|'INELIGIBLE', reasons: string[] }}
 */
export function isEligible(option, ctx) {
  const status = option.policy_status

  if (status === 'FAILS_CHECK') {
    return { eligible: false, state: 'INELIGIBLE', reasons: ['FAILS_CHECK'] }
  }

  if (status === 'APPROVAL_REQUIRED') {
    return { eligible: true, state: 'APPROVAL_REQUIRED', reasons: [] }
  }

  return { eligible: true, state: 'BOOKABLE', reasons: [] }
}

/** @returns {boolean} true when the traveler holds a programme with this option's supplier */
function hasLoyaltyWith(traveler, option) {
  const programs = traveler && Array.isArray(traveler.loyalty_programs) ? traveler.loyalty_programs : []
  return programs.some((program) => program && program.supplier === option.supplier)
}

/**
 * Stage 2 — base score.
 *
 * Traveler-facing quality only: no commission or rebate is allowed in here.
 * Starts from a nominal 1000 and spends it down against price, then adds the
 * attributes we have numbers for.
 *
 * TODO emissions copy hardcoded
 *
 * @param {object} option raw air or hotel row
 * @param {object} ctx shallowly frozen ranking context
 * @returns {number} higher is better; the engine keeps this value in the audit row
 */
export function baseScore(option, ctx) {
  if (option.product === 'hotel') {
    const review = option.review_score_5 ?? ASSUMED_REVIEW
    const cancelPct = option.cancel_pct ?? ASSUMED_CANCEL_PCT

    return 1000 - option.total_stay_usd + review * 10 - cancelPct * 20
  }

  // TODO revisit missing supplier metrics
  const onTime = option.on_time_pct_90d ?? ASSUMED_ON_TIME
  const cancel = option.cancel_pct_90d ?? ASSUMED_CANCEL

  let score = 1000 - option.fare_usd
  if (option.stops === 0) score += 15
  if (hasLoyaltyWith(ctx.traveler, option)) score += 10
  score += onTime * 0.25
  score -= cancel * 2
  if (option.co2_kg != null && option.co2_kg < 100) score += 25

  return score
}

/**
 * Stage 3 — commercial adjustment.
 *
 * The one place NorthStar's own economics may touch the order. Commission and
 * the client's rebate are summed and weighted; the result is added to the base
 * score to produce the final score.
 *
 * @param {object} option raw air or hotel row
 * @param {object} ctx shallowly frozen ranking context
 * @returns {{ delta: number, disclosure: string|null }} `delta` in base-score points
 */
export function commercialAdjustment(option, ctx) {
  const commission = option.commission_usd ?? 0
  const rebate = option.rebate_usd ?? 0
  const multiplier = ctx.scenario?.knobs?.commission_weight_multiplier ?? 1

  const delta = (commission + rebate) * COMMERCIAL_WEIGHT * multiplier

  // TODO no disclosure surface yet — Legal asked
  return { delta, disclosure: null }
}

/**
 * Stage 4 — diversification / display set.
 *
 * Chooses which of the ranked options actually get a result slot on the page.
 * Returns option ids in display order; the engine validates them against the
 * eligible pool.
 *
 * @param {object[]} ranked eligible audit rows, already sorted by final rank
 * @param {object} ctx shallowly frozen ranking context
 * @returns {string[]} option ids in display order
 */
export function diversify(ranked, ctx) {
  // TODO dedupe descoped
  return ranked.slice(0, DISPLAY_SLOTS).map((row) => row.id)
}

/**
 * Stage 5 — disclosure.
 *
 * What the traveler sees and what goes on the client's report. `tags` are the
 * small labels drawn on the card.
 *
 * @param {object} row audit row, with `displacement` already computed
 * @param {object} ctx shallowly frozen ranking context
 * @returns {{ traveler_text: string|null, client_text: string|null, tags: string[] }}
 */
export function disclose(row, ctx) {
  return {
    traveler_text: null,
    client_text: null,
    tags: row.displacement > 0 ? ['Recommended'] : [],
  }
}

/**
 * Bundles — the three flight + hotel pairs shown above the lists.
 *
 * Pairs the lists positionally: best flight with best hotel, second with
 * second, third with third.
 *
 * @param {object[]} flights displayed flight audit rows, in display order
 * @param {object[]} hotels displayed hotel audit rows, in display order
 * @param {object} ctx shallowly frozen ranking context
 * @returns {{ rank: number, flight_option_id: string, hotel_option_id: string, comparable_total_usd: number, note: string|null }[]} at most three
 */
export function buildBundles(flights, hotels, ctx) {
  const transfer = ctx.trip?.ground_transfer_usd ?? 0
  const count = Math.min(3, flights.length, hotels.length)
  const bundles = []

  for (let i = 0; i < count; i += 1) {
    const flight = flights[i]
    const hotel = hotels[i]

    bundles.push({
      rank: i + 1,
      flight_option_id: flight.id,
      hotel_option_id: hotel.id,
      comparable_total_usd: displayedTotal(flight.option) + displayedTotal(hotel.option) + transfer,
      note: null,
    })
  }

  return bundles
}
