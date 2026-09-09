/**
 * Ranking pipeline and audit trail.
 *
 * The engine owns sequencing, validation and bookkeeping; every judgment lives
 * in constitution.js. Each constitution call is wrapped so that a bad return
 * value or a thrown error becomes an entry in `errors` and a neutral fallback,
 * never a blank page.
 */

import {
  META,
  isEligible,
  baseScore,
  commercialAdjustment,
  diversify,
  disclose,
  buildBundles,
} from './constitution.js'
import { rankOf } from './helpers.js'
import { NONE_SCENARIO } from './defaults.js'

const STATES = ['BOOKABLE', 'APPROVAL_REQUIRED', 'INELIGIBLE']
const MAX_DISPLAY_SLOTS = 8

/**
 * Assemble the shallowly frozen context the constitution receives.
 * @param {object} parts
 * @returns {object} shallowly frozen `{ trip, traveler, history, policyRules, commercialTerms, scenario }`
 */
export function buildContext({ trip, traveler, history, policyRules, commercialTerms, scenario } = {}) {
  const source = scenario ?? NONE_SCENARIO
  return Object.freeze({
    trip: trip ?? {},
    traveler: traveler ?? null,
    history: Array.isArray(history) ? history : [],
    policyRules: Array.isArray(policyRules) ? policyRules : [],
    commercialTerms: Array.isArray(commercialTerms) ? commercialTerms : [],
    scenario: {
      id: source.id ?? NONE_SCENARIO.id,
      label: source.label ?? NONE_SCENARIO.label,
      knobs: source.knobs ?? {},
    },
  })
}

/** Sort key for the "Filtered out" list, which has no scores to sort on. */
function byId(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function idOf(option, index) {
  return String(option?.option_id ?? `row-${index}`)
}

function rankProduct(product, options, ctx, safe, note) {
  const rows = (Array.isArray(options) ? options : []).map((option, index) => {
    const id = idOf(option, index)
    const raw = safe('isEligible', id, () => isEligible(option, ctx), {
      eligible: true,
      state: 'BOOKABLE',
      reasons: [],
    })

    const eligible = Boolean(raw && raw.eligible)
    let state = raw && raw.state
    if (!STATES.includes(state)) {
      if (state != null) note('isEligible', id, `unknown state "${state}", inferred from eligible`)
      state = eligible ? 'BOOKABLE' : 'INELIGIBLE'
    }
    const reasons = Array.isArray(raw && raw.reasons) ? raw.reasons.map(String) : []

    return {
      id,
      product,
      option,
      eligibility: { eligible, state, reasons },
      baseScore: null,
      commercialDelta: null,
      finalScore: null,
      rankBefore: null,
      rankAfter: null,
      displacement: null,
      disclosure: null,
      travelerText: null,
      clientText: null,
      tags: [],
      displayed: false,
      displayRank: null,
    }
  })

  const pool = rows.filter((row) => row.eligibility.eligible)

  // Stage 2 — traveler-facing score, then the pre-commercial ranking we keep for the audit.
  for (const row of pool) {
    const value = safe('baseScore', row.id, () => baseScore(row.option, ctx), 0)
    if (!Number.isFinite(Number(value))) {
      note('baseScore', row.id, `expected a number, got ${JSON.stringify(value) ?? typeof value}`)
      row.baseScore = 0
    } else {
      row.baseScore = Number(value)
    }
  }
  const before = rankOf(pool, 'baseScore')

  // Stage 3 — commercial adjustment, then the ranking the traveler actually sees.
  for (const row of pool) {
    const result = safe('commercialAdjustment', row.id, () => commercialAdjustment(row.option, ctx), {
      delta: 0,
      disclosure: null,
    })
    const delta = result && result.delta
    if (!Number.isFinite(Number(delta))) {
      note('commercialAdjustment', row.id, `expected a numeric delta, got ${JSON.stringify(delta) ?? typeof delta}`)
      row.commercialDelta = 0
    } else {
      row.commercialDelta = Number(delta)
    }
    const disclosure = result && result.disclosure
    if (disclosure != null && typeof disclosure !== 'string') {
      note('commercialAdjustment', row.id, 'disclosure must be a string or null')
      row.disclosure = null
    } else {
      row.disclosure = disclosure ?? null
    }
    row.finalScore = row.baseScore + row.commercialDelta
  }
  const after = rankOf(pool, 'finalScore')

  for (const row of pool) {
    row.rankBefore = before.get(row.id) ?? null
    row.rankAfter = after.get(row.id) ?? null
    row.displacement = row.rankBefore - row.rankAfter
  }

  const ranked = [...pool].sort((a, b) => a.rankAfter - b.rankAfter)

  // Stage 4 — display set. The constitution returns ids; the engine decides
  // whether it may honour them.
  const eligibleById = new Map(pool.map((row) => [row.id, row]))
  const requested = safe('diversify', null, () => diversify(ranked, ctx), [])
  const chosen = []
  if (!Array.isArray(requested)) {
    note('diversify', null, `expected an array of option ids, got ${typeof requested}`)
  } else {
    for (const raw of requested) {
      const id = String(raw)
      if (!eligibleById.has(id)) {
        note('diversify', id, 'option id is not in the eligible pool')
        continue
      }
      if (chosen.includes(id)) {
        note('diversify', id, 'option id returned more than once')
        continue
      }
      if (chosen.length >= MAX_DISPLAY_SLOTS) {
        note('diversify', null, `more than ${MAX_DISPLAY_SLOTS} display slots requested; extra ids dropped`)
        break
      }
      chosen.push(id)
    }
  }
  chosen.forEach((id, index) => {
    const row = eligibleById.get(id)
    row.displayed = true
    row.displayRank = index + 1
  })

  const displayed = chosen.map((id) => eligibleById.get(id))

  // Stage 5 — disclosure, computed after displacement and the display set so
  // it can refer to either (`row.displayed` / `row.displayRank` are populated
  // by now).
  for (const row of ranked) {
    const result = safe('disclose', row.id, () => disclose(row, ctx), {
      traveler_text: null,
      client_text: null,
      tags: [],
    })
    row.travelerText = result && typeof result.traveler_text === 'string' ? result.traveler_text : null
    row.clientText = result && typeof result.client_text === 'string' ? result.client_text : null
    if (result && result.tags != null && !Array.isArray(result.tags)) {
      note('disclose', row.id, 'tags must be an array')
      row.tags = []
    } else {
      row.tags = Array.isArray(result && result.tags) ? result.tags.map(String) : []
    }
  }
  const ineligible = rows.filter((row) => !row.eligibility.eligible).sort(byId)

  return { all: [...ranked, ...ineligible], ranked, displayed }
}

/**
 * Run the whole pipeline for one traveler and one option set.
 *
 * @param {object} ctx context from `buildContext` (shallowly frozen on the way in)
 * @param {{ air?: object[], hotel?: object[] }} options raw option rows
 * @returns {{ flights: object[], hotels: object[], displayedFlights: object[], displayedHotels: object[], bundles: object[], audit: object[], errors: object[], meta: object }}
 */
export function runRanking(ctx, { air, hotel } = {}) {
  const context = Object.isFrozen(ctx) ? ctx : Object.freeze(ctx ?? {})
  const errors = []

  const note = (stage, optionId, message) => {
    errors.push({ stage, option_id: optionId ?? null, message })
  }

  const safe = (stage, optionId, fn, fallback) => {
    try {
      const value = fn()
      if (value == null) {
        note(stage, optionId, 'returned nothing')
        return fallback
      }
      return value
    } catch (error) {
      note(stage, optionId, error && error.message ? error.message : String(error))
      return fallback
    }
  }

  const airResult = rankProduct('air', air, context, safe, note)
  const hotelResult = rankProduct('hotel', hotel, context, safe, note)

  // At least three of each are needed to fill the bundle strip; if the display
  // set is shorter, fall back to the full ranked pool.
  const bundleFlights = airResult.displayed.length >= 3 ? airResult.displayed : airResult.ranked
  const bundleHotels = hotelResult.displayed.length >= 3 ? hotelResult.displayed : hotelResult.ranked

  const rawBundles = safe('buildBundles', null, () => buildBundles(bundleFlights, bundleHotels, context), [])
  const bundles = (Array.isArray(rawBundles) ? rawBundles : []).slice(0, 3).map((bundle, index) => ({
    rank: Number.isFinite(Number(bundle?.rank)) ? Number(bundle.rank) : index + 1,
    flight_option_id: bundle?.flight_option_id ?? null,
    hotel_option_id: bundle?.hotel_option_id ?? null,
    comparable_total_usd: Number.isFinite(Number(bundle?.comparable_total_usd))
      ? Number(bundle.comparable_total_usd)
      : null,
    note: typeof bundle?.note === 'string' ? bundle.note : null,
  }))
  if (!Array.isArray(rawBundles)) {
    note('buildBundles', null, `expected an array of bundles, got ${typeof rawBundles}`)
  }

  return {
    flights: airResult.all,
    hotels: hotelResult.all,
    displayedFlights: airResult.displayed,
    displayedHotels: hotelResult.displayed,
    bundles,
    audit: airResult.all.concat(hotelResult.all),
    errors,
    meta: {
      constitution: { name: META?.name ?? 'unknown', version: META?.version ?? 'unknown' },
      scenario: { id: context.scenario?.id ?? null, label: context.scenario?.label ?? null },
      traveler: {
        id: context.traveler?.traveler_id ?? null,
        name: context.traveler?.name ?? null,
      },
      counts: {
        air: {
          total: airResult.all.length,
          eligible: airResult.ranked.length,
          displayed: airResult.displayed.length,
        },
        hotel: {
          total: hotelResult.all.length,
          eligible: hotelResult.ranked.length,
          displayed: hotelResult.displayed.length,
        },
      },
    },
  }
}
