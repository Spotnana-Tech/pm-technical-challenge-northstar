import { useNorthStar } from '../state/NorthStarContext.jsx'

const KEY_LABELS = { satisfaction_1_5: 'Satisfaction (1–5)' }
const DERIVED_KEYS = ['traveler_id', 'source_row']

const OUTCOME_TONES = {
  ON_TIME: 'success',
  NO_ISSUE: 'success',
  MISSED_CONNECTION: 'error',
  WALKED: 'error',
  STREET_NOISE: 'error',
  '20_MIN_DELAY': 'warning',
}

/** `'total_usd'` → `'Total (USD)'` */
function humanizeKey(key) {
  if (KEY_LABELS[key]) return KEY_LABELS[key]
  return String(key)
    .split('_')
    .map((word, index) => {
      const upper = word.toUpperCase()
      if (upper === 'USD') return '(USD)'
      if (upper === 'ID') return 'ID'
      if (upper === 'PCT') return '%'
      return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    })
    .join(' ')
}

/** Column order comes from the sheet; derived fields are not shown. */
function columnsOf(rows) {
  const seen = []
  for (const row of rows) {
    for (const key of Object.keys(row ?? {})) {
      if (!seen.includes(key) && !DERIVED_KEYS.includes(key)) seen.push(key)
    }
  }
  return seen
}

function HistoryCell({ column, value }) {
  if (value == null || value === '') return <td className="ns-tertiary">—</td>
  if (column === 'booked_by') {
    return (
      <td>
        <span className="ns-chip">{value}</span>
      </td>
    )
  }
  if (column === 'outcome') {
    return (
      <td>
        <span className={`ns-badge ns-badge--${OUTCOME_TONES[value] ?? 'neutral'}`}>{value}</span>
      </td>
    )
  }
  return <td>{String(value)}</td>
}

export default function Traveler() {
  const { traveler, history } = useNorthStar()

  if (!traveler) {
    return <p className="ns-body">No traveler record loaded.</p>
  }

  const columns = columnsOf(history)

  return (
    <div className="traveler">
      <header className="page-head">
        <h1 className="ns-h1">{traveler.name}</h1>
        <p className="ns-body ns-muted">
          {traveler.traveler_id} · {history.length} booking{history.length === 1 ? '' : 's'} on
          record
        </p>
      </header>

      <section className="section">
        <h2 className="ns-h2">Profile</h2>
        <div className="profile-grid">
          {(traveler.fields ?? []).map((field) => (
            <div key={field.field} className="profile-grid__item ns-card">
              <p className="ns-small ns-tertiary">{field.field}</p>
              <p className="ns-body">{field.value}</p>
              {field.how_to_read ? (
                <p className="ns-small ns-tertiary profile-grid__note">{field.how_to_read}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="ns-h2">Booking history</h2>
        {history.length <= 1 ? (
          <p className="ns-body ns-muted history-note">
            There {history.length === 1 ? 'is one booking' : 'are no bookings'} on record for this
            traveler, so there is no travel behaviour in this table to learn from.
          </p>
        ) : null}
        {history.length > 0 ? (
          <div className="table-wrap ns-card">
            <table className="ns-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>{humanizeKey(column)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.history_id}>
                    {columns.map((column) => (
                      <HistoryCell key={column} column={column} value={row[column]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
