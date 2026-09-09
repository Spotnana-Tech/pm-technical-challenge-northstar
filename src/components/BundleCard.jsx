import { usd } from '../ranking/helpers.js'
import StatusBadge, { statusTone } from './StatusBadge.jsx'

function sum(...values) {
  const numbers = values.map((value) => Number(value ?? 0)).filter(Number.isFinite)
  return numbers.reduce((total, value) => total + value, 0)
}

/**
 * @param {{bundle: object, flightRow?: object|null, hotelRow?: object|null,
 *   internalView?: boolean}} props `bundle` is `{rank, flight_option_id,
 *   hotel_option_id, comparable_total_usd, note}` from the constitution.
 */
export default function BundleCard({ bundle, flightRow, hotelRow, internalView = false }) {
  const flight = flightRow?.option ?? null
  const hotel = hotelRow?.option ?? null

  return (
    <article className="bundle-card ns-card">
      <div className="bundle-card__head">
        <span className="ns-badge ns-badge--neutral">Bundle {bundle.rank}</span>
        <span className="price price--sm">{usd(bundle.comparable_total_usd)}</span>
      </div>

      <div className="bundle-card__leg">
        <p className="ns-small ns-tertiary">Flight {bundle.flight_option_id}</p>
        {flight ? (
          <>
            <p className="ns-body">
              {flight.supplier} · {flight.depart_PT} PT <span aria-hidden="true">→</span>{' '}
              {flight.arrive_CT} CT
            </p>
            <p className="ns-small ns-muted">{usd(flight.fare_usd)}</p>
            <div className="badges">
              {statusTone(flight.policy_status, flight.availability).map((badge) => (
                <StatusBadge key={badge.label} tone={badge.tone}>
                  {badge.label}
                </StatusBadge>
              ))}
            </div>
          </>
        ) : (
          <p className="ns-small ns-tertiary">Option not in the ranked set</p>
        )}
      </div>

      <div className="bundle-card__leg">
        <p className="ns-small ns-tertiary">Hotel {bundle.hotel_option_id}</p>
        {hotel ? (
          <>
            <p className="ns-body">
              {hotel.property} · {hotel.room}
            </p>
            <p className="ns-small ns-muted">
              {usd(hotel.total_stay_usd)} total · {hotel.nights} nights
            </p>
            <div className="badges">
              {statusTone(hotel.policy_status, hotel.availability).map((badge) => (
                <StatusBadge key={badge.label} tone={badge.tone}>
                  {badge.label}
                </StatusBadge>
              ))}
            </div>
          </>
        ) : (
          <p className="ns-small ns-tertiary">Option not in the ranked set</p>
        )}
      </div>

      {bundle.note ? <p className="ns-small ns-muted bundle-card__note">{bundle.note}</p> : null}

      {internalView ? (
        <div className="internal-block ns-small">
          <span>
            commission {usd(sum(flight?.commission_usd, hotel?.commission_usd))} · rebate{' '}
            {usd(sum(flight?.rebate_usd, hotel?.rebate_usd))} · disclosure:{' '}
            {flightRow?.disclosure ?? hotelRow?.disclosure ?? 'none'}
          </span>
        </div>
      ) : null}
    </article>
  )
}
