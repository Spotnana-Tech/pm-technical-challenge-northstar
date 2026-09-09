import { useEffect, useMemo, useState } from 'react'

import {
  COLD_START_ITEMS,
  CONSTITUTION_CLAUSES,
  CONSTITUTION_GUIDANCE_NOTE,
  DISPLAYED_SET_PROMPT,
  EVIDENCE_COLUMNS,
  EVIDENCE_ROW_IDS,
  SUBMISSION_COLUMNS,
  SUBMISSION_REASON_FIELDS,
} from '../live/worksheetSchema.js'
import { usd } from '../ranking/helpers.js'
import { useNorthStar } from '../state/NorthStarContext.jsx'

const STORAGE_KEY = 'ns-worksheet-v1'
const RANKS = [1, 2, 3]
const BLANK = '_(blank)_'

/** The engine hands back rows here, but ids are all this page needs. */
function toIds(rows) {
  return (rows ?? [])
    .map((entry) => (typeof entry === 'string' ? entry : entry?.id ?? entry?.option_id))
    .filter(Boolean)
}

function emptyState() {
  return {
    bundles: RANKS.map(() => ({
      flight_option_id: '',
      hotel_option_id: '',
      comparable_total_usd: '',
      traveler_value_reason: '',
      company_value_reason: '',
      commercial_influence_disclosure: '',
      regret_trigger: '',
    })),
    displayed: [],
    displayedWhy: '',
    constitution: {},
    evidence: EVIDENCE_ROW_IDS.map(() => ({})),
    coldStart: {},
  }
}

/** Merge whatever is in storage over a fresh shape, so a shape change is safe. */
function readSaved() {
  const base = emptyState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw)
    if (!saved || typeof saved !== 'object') return base
    return {
      bundles: base.bundles.map((row, index) => ({ ...row, ...(saved.bundles?.[index] ?? {}) })),
      displayed: Array.isArray(saved.displayed) ? saved.displayed.map(String) : [],
      displayedWhy: typeof saved.displayedWhy === 'string' ? saved.displayedWhy : '',
      constitution: saved.constitution && typeof saved.constitution === 'object' ? saved.constitution : {},
      evidence: base.evidence.map((row, index) => ({ ...row, ...(saved.evidence?.[index] ?? {}) })),
      coldStart: saved.coldStart && typeof saved.coldStart === 'object' ? saved.coldStart : {},
    }
  } catch {
    return base
  }
}

/** `'2026-09-09 14:32'` and `'20260909-1432'` from the same instant. */
function stamps(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const mo = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const mi = pad(date.getMinutes())
  return { human: `${y}-${mo}-${d} ${h}:${mi}`, file: `${y}${mo}${d}-${h}${mi}` }
}

function cell(value) {
  const text = String(value ?? '').trim()
  if (!text) return ' '
  return text.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
}

function block(value) {
  const text = String(value ?? '').trim()
  return text || BLANK
}

/** `A04 · Cascade Airlines · $468 · 06:45→12:25` */
function flightLabel(row) {
  const option = row.option ?? {}
  return [
    row.id,
    option.supplier,
    usd(option.fare_usd),
    option.depart_PT && option.arrive_CT ? `${option.depart_PT}→${option.arrive_CT}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** `H-01 · Kestrel Hotels · $936 · Quiet king` */
function hotelLabel(row) {
  const option = row.option ?? {}
  return [row.id, option.property, usd(option.total_stay_usd), option.room]
    .filter(Boolean)
    .join(' · ')
}

function OptionSelect({ value, onChange, rows, label }) {
  return (
    <select
      className="field__select worksheet__select"
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">—</option>
      {rows.map((row) => (
        <option key={row.id} value={row.id}>
          {row.label}
        </option>
      ))}
    </select>
  )
}

export default function Worksheet() {
  const { traveler, travelerId, scenario, result } = useNorthStar()
  const [sheet, setSheet] = useState(readSaved)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sheet))
  }, [sheet])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const choices = useMemo(() => {
    const eligible = (rows) => (rows ?? []).filter((row) => row.eligibility?.eligible !== false)
    return {
      flights: eligible(result.flights).map((row) => ({ id: row.id, label: flightLabel(row) })),
      hotels: eligible(result.hotels).map((row) => ({ id: row.id, label: hotelLabel(row) })),
    }
  }, [result])

  const setBundle = (index, key, value) =>
    setSheet((previous) => ({
      ...previous,
      bundles: previous.bundles.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }))

  const setEvidence = (index, key, value) =>
    setSheet((previous) => ({
      ...previous,
      evidence: previous.evidence.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }))

  const toggleDisplayed = (id) =>
    setSheet((previous) => ({
      ...previous,
      displayed: previous.displayed.includes(id)
        ? previous.displayed.filter((entry) => entry !== id)
        : [...previous.displayed, id],
    }))

  const clear = () => {
    if (!window.confirm('Clear every answer on this worksheet? This cannot be undone.')) return
    setSheet(emptyState())
    setToast('Worksheet cleared')
  }

  const buildMarkdown = () => {
    const now = stamps(new Date())
    const meta = result.meta?.constitution ?? {}
    const displayedFlights = toIds(result.displayedFlights)
    const displayedHotels = toIds(result.displayedHotels)
    const lines = []

    lines.push('# NorthStar worksheet')
    lines.push(
      [
        `Traveler: ${traveler?.name ?? travelerId}`,
        `Scenario: ${scenario?.label ?? '—'}`,
        `Exported: ${now.human}`,
        `Constitution: ${[meta.name, meta.version].filter(Boolean).join(' ') || '—'}`,
      ].join(' · '),
    )
    lines.push('')
    lines.push('## Submission')
    lines.push(`| ${SUBMISSION_COLUMNS.join(' | ')} |`)
    lines.push(`|${SUBMISSION_COLUMNS.map(() => '---').join('|')}|`)
    sheet.bundles.forEach((row, index) => {
      const values = SUBMISSION_COLUMNS.map((column) =>
        column === 'rank' ? String(RANKS[index]) : cell(row[column]),
      )
      lines.push(`| ${values.join(' | ')} |`)
    })
    lines.push('')
    lines.push(
      `**Displayed set:** ${sheet.displayed.length > 0 ? sheet.displayed.join(', ') : BLANK}`,
    )
    lines.push(`Why: ${block(sheet.displayedWhy)}`)
    lines.push('')
    lines.push('## Ranking_Constitution')
    CONSTITUTION_CLAUSES.forEach((entry) => {
      lines.push(`### ${entry.clause}`)
      lines.push(block(sheet.constitution[entry.id]))
      lines.push('')
    })
    lines.push('## Evidence_Ledger')
    const evidenceHeader = ['claim_id', ...EVIDENCE_COLUMNS.map((column) => column.key)]
    lines.push(`| ${evidenceHeader.join(' | ')} |`)
    lines.push(`|${evidenceHeader.map(() => '---').join('|')}|`)
    EVIDENCE_ROW_IDS.forEach((claimId, index) => {
      const row = sheet.evidence[index] ?? {}
      const values = EVIDENCE_COLUMNS.map((column) => cell(row[column.key]))
      lines.push(`| ${claimId} | ${values.join(' | ')} |`)
    })
    lines.push('')
    lines.push('## Cold_Start_Answer')
    COLD_START_ITEMS.forEach((entry) => {
      lines.push(`### ${entry.item}`)
      lines.push(block(sheet.coldStart[entry.id]))
      lines.push('')
    })
    lines.push('## Ranking snapshot (from the app at export time)')
    const bundleText = (result.bundles ?? [])
      .map(
        (bundle) =>
          `${bundle.rank}. ${bundle.flight_option_id ?? '—'} + ${bundle.hotel_option_id ?? '—'} ${usd(bundle.comparable_total_usd)}`,
      )
      .join(' ')
    lines.push(
      [
        `Displayed flights: ${displayedFlights.join(', ') || '—'}`,
        `Displayed hotels: ${displayedHotels.join(', ') || '—'}`,
        `Bundles: ${bundleText || '—'}`,
      ].join(' · '),
    )
    lines.push('')

    return { text: lines.join('\n'), filename: `northstar-worksheet-${travelerId}-${now.file}.md` }
  }

  const exportMarkdown = () => {
    const { text, filename } = buildMarkdown()
    navigator.clipboard?.writeText(text)
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setToast(`Copied to clipboard and saved ${filename}`)
  }

  return (
    <div className="worksheet">
      <header className="page-head">
        <h1 className="ns-h1">Worksheet</h1>
        <p className="ns-body ns-muted">
          The live-format submission. Autosaves in this browser; export when you are done.
        </p>
        <p className="ns-small ns-tertiary worksheet__context">
          Ranking for {traveler?.name ?? travelerId} · scenario {scenario?.label ?? '—'}
        </p>
        <div className="worksheet__toolbar">
          <button type="button" className="ns-btn ns-btn--primary" onClick={exportMarkdown}>
            Export markdown
          </button>
          <button type="button" className="ns-btn ns-btn--ghost" onClick={clear}>
            Clear
          </button>
        </div>
      </header>

      <section className="section worksheet__section ns-card">
        <h2 className="ns-h2">Ranked bundles</h2>
        <p className="ns-small ns-tertiary">Comparable total is yours to define.</p>
        <div className="worksheet__bundles">
          {sheet.bundles.map((row, index) => (
            <div key={RANKS[index]} className="worksheet__bundle">
              <p className="ns-small ns-tertiary worksheet__rank">Rank {RANKS[index]}</p>
              <div className="worksheet__row">
                <label className="field">
                  <span className="field__label ns-small ns-tertiary">flight_option_id</span>
                  <OptionSelect
                    value={row.flight_option_id}
                    onChange={(value) => setBundle(index, 'flight_option_id', value)}
                    rows={choices.flights}
                    label={`Rank ${RANKS[index]} flight`}
                  />
                </label>
                <label className="field">
                  <span className="field__label ns-small ns-tertiary">hotel_option_id</span>
                  <OptionSelect
                    value={row.hotel_option_id}
                    onChange={(value) => setBundle(index, 'hotel_option_id', value)}
                    rows={choices.hotels}
                    label={`Rank ${RANKS[index]} hotel`}
                  />
                </label>
                <label className="field worksheet__field--num">
                  <span className="field__label ns-small ns-tertiary">comparable_total_usd</span>
                  <input
                    type="number"
                    className="field__input"
                    value={row.comparable_total_usd}
                    onChange={(event) =>
                      setBundle(index, 'comparable_total_usd', event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="worksheet__row worksheet__row--reasons">
                {SUBMISSION_REASON_FIELDS.map((field) => (
                  <label key={field.key} className="field">
                    <span className="field__label ns-small ns-tertiary">{field.label}</span>
                    <input
                      type="text"
                      className="field__input"
                      placeholder={field.placeholder}
                      value={row[field.key]}
                      onChange={(event) => setBundle(index, field.key, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section worksheet__section ns-card">
        <h2 className="ns-h2">Displayed set</h2>
        <p className="ns-small ns-tertiary">{DISPLAYED_SET_PROMPT}</p>
        <div className="worksheet__checks">
          {[...choices.flights, ...choices.hotels].map((entry) => (
            <label key={entry.id} className="worksheet__check">
              <input
                type="checkbox"
                checked={sheet.displayed.includes(entry.id)}
                onChange={() => toggleDisplayed(entry.id)}
              />
              <span>{entry.id}</span>
            </label>
          ))}
        </div>
        <label className="field">
          <span className="field__label ns-small ns-tertiary">
            Why this set is diverse rather than repetitive
          </span>
          <textarea
            className="field__textarea"
            rows={3}
            value={sheet.displayedWhy}
            onChange={(event) =>
              setSheet((previous) => ({ ...previous, displayedWhy: event.target.value }))
            }
          />
        </label>
      </section>

      <section className="section worksheet__section ns-card">
        <h2 className="ns-h2">Ranking constitution</h2>
        <p className="ns-small ns-tertiary">{CONSTITUTION_GUIDANCE_NOTE}</p>
        <div className="worksheet__clauses">
          {CONSTITUTION_CLAUSES.map((entry) => (
            <label key={entry.id} className="field">
              <span className="field__label ns-small ns-tertiary">{entry.clause}</span>
              <textarea
                className="field__textarea"
                rows={3}
                placeholder={entry.guidance}
                value={sheet.constitution[entry.id] ?? ''}
                onChange={(event) =>
                  setSheet((previous) => ({
                    ...previous,
                    constitution: { ...previous.constitution, [entry.id]: event.target.value },
                  }))
                }
              />
            </label>
          ))}
        </div>
      </section>

      <section className="section worksheet__section ns-card">
        <h2 className="ns-h2">Evidence ledger</h2>
        <div className="worksheet__bundles">
          {EVIDENCE_ROW_IDS.map((claimId, index) => (
            <div key={claimId} className="worksheet__bundle">
              <p className="ns-small ns-tertiary worksheet__rank">{claimId}</p>
              <div className="worksheet__row worksheet__row--reasons">
                {EVIDENCE_COLUMNS.map((column) => (
                  <label key={column.key} className="field">
                    <span className="field__label ns-small ns-tertiary">{column.label}</span>
                    {column.kind === 'select' ? (
                      <select
                        className="field__select worksheet__select"
                        value={sheet.evidence[index]?.[column.key] ?? ''}
                        onChange={(event) => setEvidence(index, column.key, event.target.value)}
                      >
                        <option value="">—</option>
                        {column.choices.map((choice) => (
                          <option key={choice} value={choice}>
                            {choice}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="field__input"
                        value={sheet.evidence[index]?.[column.key] ?? ''}
                        onChange={(event) => setEvidence(index, column.key, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section worksheet__section ns-card">
        <h2 className="ns-h2">Cold start</h2>
        <div className="worksheet__clauses">
          {COLD_START_ITEMS.map((entry) => (
            <label key={entry.id} className="field">
              <span className="field__label ns-small ns-tertiary">{entry.item}</span>
              <textarea
                className="field__textarea"
                rows={3}
                value={sheet.coldStart[entry.id] ?? ''}
                onChange={(event) =>
                  setSheet((previous) => ({
                    ...previous,
                    coldStart: { ...previous.coldStart, [entry.id]: event.target.value },
                  }))
                }
              />
            </label>
          ))}
        </div>
      </section>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
