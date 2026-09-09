import { useEffect, useRef, useState } from 'react'
import { score1 } from '../ranking/helpers.js'

const TITLE_ID = 'audit-panel-title'

const COLUMNS = [
  'ID',
  'State',
  'Base',
  'Δ comm',
  'Final',
  'Rank before → after',
  'Moved',
  'Disclosure',
  'Reasons',
]

function signed(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const number = Number(value)
  return number > 0 ? `+${number}` : String(number)
}

/** Rows the ranker never scored sort last, not first. */
function rankValue(row) {
  const rank = row?.rankAfter
  return rank == null || !Number.isFinite(Number(rank)) ? Infinity : Number(rank)
}

function byProduct(audit, product) {
  return audit
    .filter((row) => row.product === product)
    .sort((a, b) => {
      const rankA = rankValue(a)
      const rankB = rankValue(b)
      if (rankA !== rankB) return rankA - rankB
      return String(a.id) < String(b.id) ? -1 : 1
    })
}

function AuditRows({ rows, label }) {
  if (rows.length === 0) return null
  return (
    <>
      <tr className="audit__group">
        <td colSpan={COLUMNS.length}>{label}</td>
      </tr>
      {rows.map((row) => (
        <tr key={`${row.product}-${row.id}`} className={row.displayed ? '' : 'audit__row--dim'}>
          <td>{row.id}</td>
          <td>{row.eligibility?.state ?? '—'}</td>
          <td>{score1(row.baseScore)}</td>
          <td>{score1(row.commercialDelta)}</td>
          <td>{score1(row.finalScore)}</td>
          <td>
            {row.rankBefore ?? '—'} → {row.rankAfter ?? '—'}
          </td>
          <td>{signed(row.displacement)}</td>
          <td>{row.disclosure ?? '—'}</td>
          <td>{(row.eligibility?.reasons ?? []).join(', ') || '—'}</td>
        </tr>
      ))}
    </>
  )
}

/**
 * Right-hand drawer showing every stage the ranker went through.
 * @param {{audit?: object[], errors?: object[], meta?: object|null, open?: boolean,
 *   onClose?: () => void, scenarioLabel?: string, travelerName?: string}} props
 */
export default function AuditPanel({
  audit = [],
  errors = [],
  meta = null,
  open = false,
  onClose,
  scenarioLabel,
  travelerName,
}) {
  const [copied, setCopied] = useState(false)
  const constitution = meta?.constitution ?? meta
  const closeButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (open) closeButtonRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copyJson = () => {
    // The raw option blob is already on screen; the audit is the interesting part.
    const payload = audit.map((row) => {
      const copy = { ...row }
      delete copy.option
      return copy
    })
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2))
    setCopied(true)
  }

  return (
    <>
      {open ? <div className="drawer__backdrop" onClick={() => onClose?.()} /> : null}
      <aside
        className={`drawer${open ? ' drawer--open' : ''}`}
        aria-hidden={open ? undefined : true}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
      >
        <div className="drawer__head">
          <div>
            <h2 className="ns-h2" id={TITLE_ID}>
              Audit trail
            </h2>
            <p className="ns-small ns-muted">
              {[
                constitution?.name
                  ? `${constitution.name} · v${constitution.version}`
                  : 'Constitution metadata unavailable',
                scenarioLabel,
                travelerName,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            className="ns-btn ns-btn--ghost"
            onClick={() => onClose?.()}
          >
            Close
          </button>
        </div>

        {errors.length > 0 ? (
          <div className="audit__errors">
            <p className="ns-small">
              {errors.length} ranking error{errors.length > 1 ? 's' : ''}
            </p>
            <ul className="ns-small">
              {errors.map((error, index) => (
                <li key={`${error.stage}-${error.option_id}-${index}`}>
                  {[error.stage, error.option_id, error.message].filter(Boolean).join(' · ')}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="drawer__body">
          <table className="ns-table ns-table--dense">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AuditRows rows={byProduct(audit, 'air')} label="Flights" />
              <AuditRows rows={byProduct(audit, 'hotel')} label="Hotels" />
            </tbody>
          </table>
        </div>

        <div className="drawer__foot">
          <button type="button" className="ns-btn ns-btn--ghost" onClick={copyJson}>
            {copied ? 'Copied' : 'Copy as JSON'}
          </button>
          <span className="ns-small ns-tertiary">Dimmed rows are not in the displayed set.</span>
        </div>
      </aside>
    </>
  )
}
