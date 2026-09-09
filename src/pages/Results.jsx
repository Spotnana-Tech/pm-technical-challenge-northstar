import { useEffect, useMemo, useState } from 'react'

import BundleCard from '../components/BundleCard.jsx'
import FlightCard from '../components/FlightCard.jsx'
import HotelCard from '../components/HotelCard.jsx'
import { pct, usd } from '../ranking/helpers.js'
import { useNorthStar } from '../state/NorthStarContext.jsx'

/** An ISO date string → `'Mon 13 Apr 2026'` form. */
function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  if (!match) return value ?? '—'
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`))
    .replace(',', '')
}

/** The engine may hand back ids or whole rows; either way we want ids. */
function toIds(displayed) {
  return (displayed ?? [])
    .map((entry) => (typeof entry === 'string' ? entry : entry?.id ?? entry?.option_id))
    .filter(Boolean)
}

/** Rows the ranker never scored sort last, not first. */
function rankValue(row) {
  const rank = row?.rankAfter
  return rank == null || !Number.isFinite(Number(rank)) ? Infinity : Number(rank)
}

function byRank(rows) {
  return [...rows].sort((a, b) => {
    const rankA = rankValue(a)
    const rankB = rankValue(b)
    if (rankA !== rankB) return rankA - rankB
    return String(a.id) < String(b.id) ? -1 : 1
  })
}

function TripStrip({ trip }) {
  const delayProbability = Number(trip.ground_transfer_delay_probability ?? 0)
  return (
    <section className="trip-strip ns-card">
      <div className="trip-strip__block">
        <p className="ns-small ns-tertiary">Route</p>
        <p className="trip-strip__value">
          {trip.origin} <span aria-hidden="true">→</span> {trip.destination}
        </p>
        <p className="ns-small ns-muted">{formatDate(trip.outbound_date)}</p>
      </div>
      <div className="trip-strip__block">
        <p className="ns-small ns-tertiary">Hotel</p>
        <p className="trip-strip__value">
          {trip.nights} nights
        </p>
        <p className="ns-small ns-muted">{trip.city}</p>
      </div>
      <div className="trip-strip__block">
        <p className="ns-small ns-tertiary">Commitment</p>
        <p className="trip-strip__value">
          {[trip.commitment?.label, trip.commitment?.time_ct && `${trip.commitment.time_ct} CT`]
            .filter(Boolean)
            .join(' ')}
        </p>
        <p className="ns-small ns-muted">{trip.commitment?.location}</p>
      </div>
      <div className="trip-strip__block">
        <p className="ns-small ns-tertiary">Ground transfer</p>
        <p className="trip-strip__value">{trip.ground_transfer_minutes} min transfer</p>
        <p className="ns-small ns-muted">
          {usd(trip.ground_transfer_usd)}
          {delayProbability > 0
            ? ` · ${pct(delayProbability * 100)} chance of further delay`
            : ''}
        </p>
      </div>
    </section>
  )
}

export default function Results() {
  const { trip, internalView, result } = useNorthStar()
  const [tab, setTab] = useState('air')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const groups = useMemo(() => {
    const audit = result.audit ?? []
    const forProduct = (product, provided) =>
      provided && provided.length > 0 ? provided : audit.filter((row) => row.product === product)
    const build = (rows, displayed) => {
      const ids = toIds(displayed)
      const eligible = rows.filter((row) => row.eligibility?.eligible !== false)
      const filtered = rows.filter((row) => row.eligibility?.eligible === false)
      const displayedRows = ids
        .map((id) => eligible.find((row) => row.id === id))
        .filter(Boolean)
      const rest = byRank(eligible.filter((row) => !ids.includes(row.id)))
      return { eligible, filtered, displayedRows, rest }
    }
    return {
      air: build(forProduct('air', result.flights), result.displayedFlights),
      hotel: build(forProduct('hotel', result.hotels), result.displayedHotels),
    }
  }, [result])

  const active = groups[tab]
  const Card = tab === 'air' ? FlightCard : HotelCard

  const onSelect = (row) =>
    setToast(`Selected ${row.id} — booking flow not part of this prototype`)

  const rowById = (id) =>
    (result.audit ?? []).find((row) => row.id === id) ?? null

  return (
    <div className="results">
      <TripStrip trip={trip} />

      <section className="section">
        <h2 className="ns-h2">Top 3 bundles</h2>
        <div className="bundle-grid">
          {(result.bundles ?? []).map((bundle, i) => (
            <BundleCard
              key={`bundle-${i}`}
              bundle={bundle}
              flightRow={rowById(bundle.flight_option_id)}
              hotelRow={rowById(bundle.hotel_option_id)}
              internalView={internalView}
            />
          ))}
          {(result.bundles ?? []).length === 0 ? (
            <p className="ns-body ns-muted">No bundles were produced.</p>
          ) : null}
        </div>
      </section>

      <section className="section">
        <div className="tabs">
          {[
            { id: 'air', label: 'Flights' },
            { id: 'hotel', label: 'Hotels' },
          ].map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={tab === entry.id}
              className={`tab${tab === entry.id ? ' tab--active' : ''}`}
              onClick={() => setTab(entry.id)}
            >
              {entry.label} ({groups[entry.id].eligible.length} eligible)
            </button>
          ))}
        </div>

        <div className="option-list">
          {active.displayedRows.map((row, index) => (
            <Card
              key={row.id}
              row={row}
              displayRank={row.displayRank ?? index + 1}
              internalView={internalView}
              onSelect={onSelect}
            />
          ))}

          {active.rest.length > 0 ? (
            <div className="divider">
              <span className="ns-small ns-tertiary">More options</span>
            </div>
          ) : null}

          {active.rest.map((row) => (
            <Card key={row.id} row={row} internalView={internalView} onSelect={onSelect} />
          ))}
        </div>

        {active.filtered.length > 0 ? (
          <details className="filtered">
            <summary className="filtered__summary">
              Filtered out ({active.filtered.length})
            </summary>
            <div className="option-list option-list--dim">
              {active.filtered.map((row) => (
                <Card key={row.id} row={row} internalView={internalView} onSelect={onSelect} />
              ))}
            </div>
          </details>
        ) : null}
      </section>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
