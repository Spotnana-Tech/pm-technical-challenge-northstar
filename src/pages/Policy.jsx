import commercialTerms from '../data/commercial_terms.json'
import dataDictionary from '../data/data_dictionary.json'
import policyRules from '../data/policy_rules.json'

const DERIVED_KEYS = ['source_row']

const RULE_TYPE_TONES = { HARD: 'error', SOFT: 'warning', GOVERNANCE: 'info' }

/** `'rule_id'` → `'Rule ID'` */
function humanizeKey(key) {
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

function columnsOf(rows) {
  const seen = []
  for (const row of rows) {
    for (const key of Object.keys(row ?? {})) {
      if (!seen.includes(key) && !DERIVED_KEYS.includes(key)) seen.push(key)
    }
  }
  return seen
}

function DataTable({ title, caption, rows, tonedColumn }) {
  const columns = columnsOf(rows)
  return (
    <section className="section">
      <h2 className="ns-h2">{title}</h2>
      {caption ? <p className="ns-body ns-muted">{caption}</p> : null}
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
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => {
                  const value = row[column]
                  if (value == null || value === '') {
                    return (
                      <td key={column} className="ns-tertiary">
                        —
                      </td>
                    )
                  }
                  if (column === tonedColumn) {
                    return (
                      <td key={column}>
                        <span
                          className={`ns-badge ns-badge--${RULE_TYPE_TONES[value] ?? 'neutral'}`}
                        >
                          {value}
                        </span>
                      </td>
                    )
                  }
                  return <td key={column}>{String(value)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function Policy() {
  return (
    <div className="policy">
      <header className="page-head">
        <h1 className="ns-h1">Policy &amp; data</h1>
        <p className="ns-body ns-muted">
          The rules, commercial relationships and field definitions behind the ranking, exactly as
          they arrive in the extract.
        </p>
      </header>

      <DataTable
        title="Policy rules"
        caption="Reason codes are not in the extract; where an option fails, the rule has to be identified from this table."
        rows={policyRules}
        tonedColumn="type"
      />
      <DataTable title="Commercial terms" rows={commercialTerms} />
      <DataTable title="Data dictionary" rows={dataDictionary} />
    </div>
  )
}
