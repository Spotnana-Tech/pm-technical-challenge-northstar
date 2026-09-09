import { useEffect, useState } from 'react'

import { AGENDA, TOTAL_MINUTES } from '../live/agenda.js'

const STORAGE_KEY = 'ns-live-session'
const WARNING_SECONDS = 60

/** `{ startedAt, segmentIndex, segmentStartedAt }`, or `null` before Start. */
function readSession() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const startedAt = Number(parsed?.startedAt)
    const segmentStartedAt = Number(parsed?.segmentStartedAt)
    const segmentIndex = Number(parsed?.segmentIndex)
    if (!Number.isFinite(startedAt) || !Number.isFinite(segmentStartedAt)) return null
    if (!Number.isFinite(segmentIndex) || segmentIndex < 0 || segmentIndex >= AGENDA.length) {
      return null
    }
    return { startedAt, segmentIndex, segmentStartedAt }
  } catch {
    return null
  }
}

/** `95` → `'01:35'`. Negative input clamps to zero. */
function clock(seconds) {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = String(Math.floor(total / 60)).padStart(2, '0')
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The live-format running order, with the clock for the current segment.
 *
 * Rendered under the scenario bar only in live mode. It is a stopwatch and a
 * place marker, nothing more: no timer expires anything, and no state here
 * reaches the ranking. The session survives a reload via `sessionStorage`, so
 * refreshing the shared browser does not restart the sitting.
 */
export default function SessionStrip() {
  const [session, setSession] = useState(readSession)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (session) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else window.sessionStorage.removeItem(STORAGE_KEY)
  }, [session])

  useEffect(() => {
    if (!session) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [session])

  const started = session != null
  const index = session?.segmentIndex ?? 0
  const current = AGENDA[index]
  const budgetSeconds = current.minutes * 60
  const segmentSeconds = started ? Math.floor((now - session.segmentStartedAt) / 1000) : 0
  const totalSeconds = started ? Math.floor((now - session.startedAt) / 1000) : 0
  const remaining = budgetSeconds - segmentSeconds

  const clockTone =
    !started || remaining > WARNING_SECONDS
      ? ''
      : remaining >= 0
        ? ' session-strip__clock--warning'
        : ' session-strip__clock--over'

  const start = () => {
    const at = Date.now()
    setNow(at)
    setSession({ startedAt: at, segmentIndex: 0, segmentStartedAt: at })
  }

  const step = (delta) => {
    setSession((previous) => {
      if (!previous) return previous
      const next = previous.segmentIndex + delta
      if (next < 0 || next >= AGENDA.length) return previous
      return { ...previous, segmentIndex: next, segmentStartedAt: Date.now() }
    })
    setNow(Date.now())
  }

  const reset = () => {
    if (!window.confirm('Reset the session clock and go back to the first segment?')) return
    setSession(null)
    setNow(Date.now())
  }

  return (
    <div className="session-strip">
      <div className="session-strip__inner">
        <ol className="session-strip__segments">
          {AGENDA.map((segment, position) => {
            const state = !started
              ? 'upcoming'
              : position < index
                ? 'done'
                : position === index
                  ? 'current'
                  : 'upcoming'
            return (
              <li
                key={segment.id}
                className={`session-strip__segment session-strip__segment--${state}`}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                {state === 'done' ? <span aria-hidden="true">✓ </span> : null}
                {segment.label} · {segment.minutes}m
              </li>
            )
          })}
        </ol>

        <div className="session-strip__timers">
          <span className={`session-strip__clock${clockTone}`}>{clock(segmentSeconds)}</span>
          <span className="ns-small ns-tertiary session-strip__total">
            Total {clock(totalSeconds)} / {clock(TOTAL_MINUTES * 60)}
          </span>
        </div>

        <div className="session-strip__actions">
          {started ? (
            <>
              <button
                type="button"
                className="ns-btn ns-btn--ghost"
                onClick={() => step(-1)}
                disabled={index === 0}
              >
                Back
              </button>
              <button
                type="button"
                className="ns-btn ns-btn--primary"
                onClick={() => step(1)}
                disabled={index >= AGENDA.length - 1}
              >
                Next
              </button>
              <button type="button" className="ns-btn ns-btn--ghost" onClick={reset}>
                Reset
              </button>
            </>
          ) : (
            <button type="button" className="ns-btn ns-btn--primary" onClick={start}>
              Start
            </button>
          )}
        </div>
      </div>

      <p className="ns-small ns-muted session-strip__note">
        {started ? current.hint : AGENDA[0].hint}
      </p>
    </div>
  )
}
