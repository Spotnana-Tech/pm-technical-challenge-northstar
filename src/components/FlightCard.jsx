import { pct, score1, usd } from '../ranking/helpers.js'
import { useNorthStar } from '../state/NorthStarContext.jsx'
import StatusBadge, { statusTone } from './StatusBadge.jsx'

// matches constitution.js emissions threshold
const LOW_EMISSIONS_KG = 100

const AISLE_LABELS = {
  AISLE_CONFIRMED: 'Aisle confirmed',
  AISLE_AT_CHECKIN: 'Aisle at check-in',
  AISLE_NOT_CONFIRMED: 'Aisle not confirmed',
  STEP_FREE: 'Step-free',
}

/** `'WINDOW_ONLY'` → `'Window only'` */
function humanize(flag) {
  const words = String(flag).toLowerCase().replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** `145` → `'2h 25m'` */
function duration(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return null
  const total = Math.round(Number(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`
}

function stopsText(option) {
  const stops = Number(option.stops ?? 0)
  if (!stops) return 'Nonstop'
  const label = `${stops} stop${stops > 1 ? 's' : ''}`
  const via = option.connect_via ? ` via ${option.connect_via}` : ''
  const connection = duration(option.connect_min)
  return `${label}${via}${connection ? ` · ${connection}` : ''}`
}

function reliabilityText(option) {
  if (option.on_time_pct_90d == null) return 'Reliability data unavailable'
  return `${pct(option.on_time_pct_90d)} on-time · ${pct(option.cancel_pct_90d)} cancelled`
}

function signed(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const number = Number(value)
  return number > 0 ? `+${number}` : String(number)
}

/**
 * @param {{row: object, internalView?: boolean, displayRank?: number|null,
 *   onSelect?: (row: object) => void}} props `row` is an engine audit row;
 *   `row.option` is the raw Air_Options record.
 */
export default function FlightCard({ row, internalView = false, displayRank = null, onSelect }) {
  const { trip } = useNorthStar()
  const option = row.option ?? {}
  const flags = option.accessibility_flags ?? []
  const recommended = (row.tags ?? []).includes('Recommended')
  const lowEmissions = option.co2_kg != null && Number(option.co2_kg) < LOW_EMISSIONS_KG
  const ineligible = row.eligibility?.eligible === false

  return (
    <article className={`option-card ns-card${ineligible ? ' option-card--muted' : ''}`}>
      <div className="option-card__main">
        <div className="option-card__meta">
          {displayRank ? (
            <span className="ns-badge ns-badge--neutral">Displayed set · #{displayRank}</span>
          ) : null}
          <span className="ns-small ns-tertiary">{option.option_id}</span>
        </div>

        <h3 className="route route__title">
          <span className="route__code">{trip.origin}</span>
          <span className="route__line">
            <span className="ns-small route__stops">{stopsText(option)}</span>
          </span>
          <span className="route__code">{trip.destination}</span>
        </h3>

        <p className="option-card__times">
          {option.depart_PT} PT <span aria-hidden="true">→</span> {option.arrive_CT} CT
        </p>
        <p className="ns-body ns-muted option-card__supplier">
          {[option.supplier, option.flight, option.cabin].filter(Boolean).join(' · ')}
        </p>

        <div className="chips">
          {option.content_source ? <span className="ns-chip">{option.content_source}</span> : null}
          {flags.map((flag) => (
            <span key={flag} className="ns-chip">
              {AISLE_LABELS[flag] ?? humanize(flag)}
            </span>
          ))}
          <span className="ns-chip">{reliabilityText(option)}</span>
          <span className="ns-chip">
            {option.co2_kg == null ? 'Emissions data unavailable' : `${option.co2_kg} kg CO₂e`}
          </span>
        </div>
      </div>

      <div className="option-card__side">
        <p className="price">{usd(option.fare_usd)}</p>
        <p className="ns-small ns-muted">
          {[
            option.fare_brand,
            option.refundable === 'YES' ? 'Refundable' : 'Non-refundable',
            Number(option.change_fee_usd) > 0
              ? `${usd(option.change_fee_usd)} change fee`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="badges">
          {statusTone(option.policy_status, option.availability).map((badge) => (
            <StatusBadge key={badge.label} tone={badge.tone}>
              {badge.label}
            </StatusBadge>
          ))}
          {lowEmissions ? <StatusBadge tone="success">Low emissions</StatusBadge> : null}
          {recommended ? <span className="tag-recommended">Recommended</span> : null}
        </div>
        <button type="button" className="ns-btn ns-btn--primary" onClick={() => onSelect?.(row)}>
          Select
        </button>
      </div>

      {ineligible && (row.eligibility?.reasons ?? []).length > 0 ? (
        <p className="option-card__reasons ns-small">
          Filtered out: {row.eligibility.reasons.join(', ')}
        </p>
      ) : null}

      {internalView ? (
        <div className="internal-block ns-small">
          <span>
            commission {usd(option.commission_usd)} · rebate {usd(option.rebate_usd)} · dup group{' '}
            {option.duplicate_group ?? '—'} · base {score1(row.baseScore)} → final{' '}
            {score1(row.finalScore)} · moved {signed(row.displacement)} · disclosure:{' '}
            {row.disclosure ?? 'none'}
          </span>
          {row.clientText ? <span className="internal-block__text">{row.clientText}</span> : null}
        </div>
      ) : null}
    </article>
  )
}
