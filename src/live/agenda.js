/**
 * The running order of the 60-minute live format. One sitting, one screen: the
 * candidate works in this app instead of filling the workbook offline.
 *
 * `minutes` is the budget for the segment, not a countdown the app enforces —
 * the session strip just shows the clock so both sides can see the time going.
 */
export const AGENDA = [
  { id: 'framing',  label: 'Framing',                 minutes: 5,  hint: 'What the page is, who the traveler is, what the trip needs.' },
  { id: 'audit',    label: "Audit today's page",      minutes: 15, hint: 'Walk the results, traveler and policy pages. Say what you would change and why.' },
  { id: 'rules',    label: 'Write the rules',         minutes: 15, hint: 'Fill the worksheet: bundles, displayed set, constitution with numbers.' },
  { id: 'bind',     label: 'Make one rule bind',      minutes: 10, hint: 'Change constitution.js (or dictate the exact rule) and watch the page rerank.' },
  { id: 'reveal',   label: 'New fact, rerank, cold start', minutes: 10, hint: 'A scenario loads. Rerank, then answer for the second traveler.' },
  { id: 'wrap',     label: 'Wrap',                    minutes: 5,  hint: 'What would flip your rank 1 and 2. Your questions.' },
]

/** Total budget in minutes, derived so it can never drift from the segments. */
export const TOTAL_MINUTES = AGENDA.reduce((total, segment) => total + segment.minutes, 0)
