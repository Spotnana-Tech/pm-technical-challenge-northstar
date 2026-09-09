import { score1, usd } from '../ranking/helpers.js'
import StatusBadge, { statusTone } from './StatusBadge.jsx'

const FLAG_LABELS = {
  STEP_FREE: 'Step-free',
  VEHICLE_TRANSFER: 'Vehicle transfer',
}

/** `'WALK_420M'` → `'420 m walk'`; anything else → sentence case. */
function flagLabel(flag) {
  if (FLAG_LABELS[flag]) return FLAG_LABELS[flag]
  const walk = /^WALK_(\d+)M$/i.exec(String(flag))
  if (walk) return `${walk[1]} m walk`
  const words = String(flag).toLowerCase().replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** An ISO date-time string → `'Refundable until 12 Apr 18:00'` form. */
function refundableText(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(String(value ?? ''))
  if (!match) return 'Non-refundable'
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`))
  return `Refundable until ${day} ${match[4]}`
}

function signed(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const number = Number(value)
  return number > 0 ? `+${number}` : String(number)
}

/**
 * @param {{row: object, internalView?: boolean, displayRank?: number|null,
 *   onSelect?: (row: object) => void}} props `row` is an engine audit row;
 *   `row.option` is the raw Hotel_Options record.
 */
export default function HotelCard({ row, internalView = false, displayRank = null, onSelect }) {
  const option = row.option ?? {}
  const flags = option.accessibility_flags ?? []
  const recommended = (row.tags ?? []).includes('Recommended')
  const ineligible = row.eligibility?.eligible === false
  const fees = Number(option.mandatory_fees_usd ?? 0)

  return (
    <article className={`option-card ns-card${ineligible ? ' option-card--muted' : ''}`}>
      <div className="option-card__main">
        <div className="option-card__meta">
          {displayRank ? (
            <span className="ns-badge ns-badge--neutral">Displayed set · #{displayRank}</span>
          ) : null}
          <span className="ns-small ns-tertiary">{option.option_id}</span>
        </div>

        <h3 className="property">{option.property}</h3>
        <p className="ns-body ns-muted option-card__supplier">
          {[option.room, option.content_source].filter(Boolean).join(' · ')}
        </p>

        <div className="chips">
          {option.distance_miles != null ? (
            <span className="ns-chip">{option.distance_miles} mi from campus</span>
          ) : null}
          <span className="ns-chip">
            {option.review_score_5 == null ? 'No reviews yet' : `${option.review_score_5}/5`}
          </span>
          {flags.map((flag) => (
            <span key={flag} className="ns-chip">
              {flagLabel(flag)}
            </span>
          ))}
        </div>
      </div>

      <div className="option-card__side">
        <p className="price">{usd(option.nightly_usd)}/night</p>
        <p className="ns-small ns-muted">
          {usd(option.total_stay_usd)} total · {option.nights} nights
        </p>
        {fees > 0 ? (
          <p className="ns-small ns-muted">+ {usd(fees)} mandatory fees at property</p>
        ) : null}
        <p className="ns-small ns-muted">{refundableText(option.refundable_until)}</p>
        <div className="badges">
          {statusTone(option.policy_status, option.availability).map((badge) => (
            <StatusBadge key={badge.label} tone={badge.tone}>
              {badge.label}
            </StatusBadge>
          ))}
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
