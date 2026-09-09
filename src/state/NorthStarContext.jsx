import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import airOptions from '../data/air_options.json'
import commercialTerms from '../data/commercial_terms.json'
import hotelOptions from '../data/hotel_options.json'
import policyRules from '../data/policy_rules.json'
import travelerHistory from '../data/traveler_history.json'
import travelersById from '../data/travelers.json'
import tripRequest from '../data/trip.json'

import { buildContext, runRanking } from '../ranking/engine.js'
import { NONE, applyScenario, getScenario, listScenarios } from '../scenarios/index.js'

const NorthStarContext = createContext(null)

const TRAVELERS = Object.values(travelersById)
const SCENARIOS = listScenarios()

/** `?mode=live` runs the 60-minute sitting; anything else is the take-home. */
const LIVE_MODE = 'live'
const TAKEHOME_MODE = 'takehome'

/** The traveler with a history to learn from is the default view. */
const DEFAULT_TRAVELER_ID =
  (TRAVELERS.find((traveler) => !traveler.is_cold_start) ?? TRAVELERS[0] ?? {}).traveler_id ?? ''

function knownTravelerId(id) {
  return id != null && Object.prototype.hasOwnProperty.call(travelersById, id) ? id : null
}

const EMPTY_RESULT = {
  flights: [],
  hotels: [],
  displayedFlights: [],
  displayedHotels: [],
  bundles: [],
  audit: [],
  errors: [],
  meta: null,
}

/** Rank one traveler under one scenario. Never throws: a failure becomes an error row. */
function computeResult(scenario, travelerId) {
  const applied = applyScenario(scenario, {
    trip: tripRequest,
    travelers: travelersById,
    air: airOptions,
    hotel: hotelOptions,
  })
  const traveler = applied.travelers[travelerId] ?? null
  const history = travelerHistory.filter((row) => row?.traveler_id === travelerId)

  let ranking = EMPTY_RESULT
  const errors = [...applied.errors]
  try {
    const ctx = buildContext({
      trip: applied.trip,
      traveler,
      history,
      policyRules,
      commercialTerms,
      scenario,
    })
    ranking = runRanking(ctx, { air: applied.air, hotel: applied.hotel })
  } catch (error) {
    errors.push({
      stage: 'engine',
      option_id: null,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  return {
    trip: applied.trip,
    traveler,
    history,
    result: {
      ...EMPTY_RESULT,
      ...ranking,
      errors: [...errors, ...(ranking.errors ?? [])],
    },
  }
}

export function NorthStarProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [internalView, setInternalView] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)

  // The URL is the source of truth for both selectors, so a shared link and
  // the browser's back button both land on the same view. Unknown ids fall
  // back to the defaults rather than rendering nothing, but the fallback is
  // reported as an error so the red banner shows it.
  const rawTravelerParam = searchParams.get('traveler')
  const travelerId = knownTravelerId(rawTravelerParam) ?? DEFAULT_TRAVELER_ID
  const unknownTravelerError =
    rawTravelerParam != null && rawTravelerParam !== '' && knownTravelerId(rawTravelerParam) == null
      ? {
          stage: 'traveler',
          option_id: null,
          message: `Unknown traveler "${rawTravelerParam}" in URL — using baseline`,
        }
      : null

  const rawScenarioParam = searchParams.get('scenario')
  const resolvedScenario = getScenario(rawScenarioParam)
  const scenarioId = (resolvedScenario ?? NONE).id
  const unknownScenarioError =
    rawScenarioParam != null && rawScenarioParam !== '' && resolvedScenario == null
      ? {
          stage: 'scenario',
          option_id: null,
          message: `Unknown scenario "${rawScenarioParam}" in URL — using baseline`,
        }
      : null

  const writeParams = useCallback(
    (patch) => {
      const next = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key)
        else next.set(key, value)
      }
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const setTravelerId = useCallback((id) => writeParams({ traveler: id }), [writeParams])
  const setScenarioId = useCallback(
    (id) => writeParams({ scenario: id === NONE.id ? null : id }),
    [writeParams],
  )

  // Mode lives in the URL for the same reason the selectors do: the link the
  // host pastes into the shared browser is the whole setup step. An
  // unrecognised value is the take-home rather than an error, because the
  // take-home is what the repo is by default.
  const mode = searchParams.get('mode') === LIVE_MODE ? LIVE_MODE : TAKEHOME_MODE
  const isLive = mode === LIVE_MODE
  const setMode = useCallback(
    (next) => writeParams({ mode: next === LIVE_MODE ? LIVE_MODE : null }),
    [writeParams],
  )

  const scenario = getScenario(scenarioId) ?? NONE
  const { trip, traveler, history, result: rankingResult } = useMemo(
    () => computeResult(scenario, travelerId),
    [scenario, travelerId],
  )

  const urlErrors = [unknownScenarioError, unknownTravelerError].filter(Boolean)
  const result = useMemo(
    () =>
      urlErrors.length > 0
        ? { ...rankingResult, errors: [...urlErrors, ...rankingResult.errors] }
        : rankingResult,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rankingResult, JSON.stringify(urlErrors)],
  )

  const value = useMemo(
    () => ({
      travelerId,
      setTravelerId,
      travelers: TRAVELERS,
      scenarioId,
      setScenarioId,
      scenarios: SCENARIOS,
      scenario,
      mode,
      setMode,
      isLive,
      internalView,
      setInternalView,
      auditOpen,
      setAuditOpen,
      trip,
      traveler,
      history,
      result,
    }),
    [
      travelerId,
      setTravelerId,
      scenarioId,
      setScenarioId,
      scenario,
      mode,
      setMode,
      isLive,
      internalView,
      auditOpen,
      trip,
      traveler,
      history,
      result,
    ],
  )

  return <NorthStarContext.Provider value={value}>{children}</NorthStarContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNorthStar() {
  const value = useContext(NorthStarContext)
  if (!value) throw new Error('useNorthStar must be used inside <NorthStarProvider>')
  return value
}
