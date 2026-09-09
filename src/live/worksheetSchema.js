/**
 * The worksheet's labels, quoted from the candidate workbook.
 *
 * `workbook/NorthStar Exercise - Candidate Workbook.xlsx` is the source of
 * truth for the exercise, so the live format asks the same questions in the
 * same words. Everything here is hand-copied text from the `Submission`,
 * `Ranking_Constitution`, `Evidence_Ledger` and `Cold_Start_Answer` sheets —
 * copy, not logic. Nothing in this file derives from the option data.
 */

/** `Ranking_Constitution` — column 1 is the clause, column 3 the guidance. */
export const CONSTITUTION_CLAUSES = [
  {
    id: 'c1',
    clause: '1. Eligibility invariant',
    guidance:
      'What can never be traded away, and what you do when a value is missing rather than bad.',
  },
  {
    id: 'c2',
    clause: '2. Quality-equivalence gate',
    guidance:
      'Measurable thresholds: dollars, minutes, reliability points, flexibility, accommodation certainty.',
  },
  {
    id: 'c3',
    clause: '3. Trust budget',
    guidance:
      'The maximum number of positions commercial value may move an option, and when that budget is zero.',
  },
  {
    id: 'c4',
    clause: '4. Disclosure rule',
    guidance:
      'What the traveler sees versus what the corporate customer sees. Distinguish client-negotiated from NorthStar commission.',
  },
  {
    id: 'c5',
    clause: '5. Audit contract',
    guidance: 'What you log so this exact result can be reconstructed in six months.',
  },
  {
    id: 'c6',
    clause: '6. Counterfactual',
    guidance:
      'The smallest specific change — a number or a state transition — that flips your rank 1 and rank 2.',
  },
  {
    id: 'c7',
    clause: '7. Decision owner',
    guidance:
      'The accountable role for the tradeoff nobody has resolved, and the evidence you would take them.',
  },
]

/** `Ranking_Constitution` column 3 header. */
export const CONSTITUTION_GUIDANCE_NOTE =
  'minimum operational content — one or two sentences each is enough'

/** `Submission` rows 2–4, minus the columns the live format does not score. */
export const SUBMISSION_COLUMNS = [
  'rank',
  'flight_option_id',
  'hotel_option_id',
  'comparable_total_usd',
  'traveler_value_reason',
  'company_value_reason',
  'commercial_influence_disclosure',
  'regret_trigger',
]

/** The free-text `Submission` columns, in sheet order. */
export const SUBMISSION_REASON_FIELDS = [
  { key: 'traveler_value_reason', label: 'traveler_value_reason', placeholder: 'Why this is right for the traveler' },
  { key: 'company_value_reason', label: 'company_value_reason', placeholder: 'Why this is right for the company' },
  {
    key: 'commercial_influence_disclosure',
    label: 'commercial_influence_disclosure',
    placeholder: 'What commercial interest touched this, and who is told',
  },
  { key: 'regret_trigger', label: 'regret_trigger', placeholder: 'What would make you regret this rank' },
]

/** `Submission` row 5, the displayed-set prompt. */
export const DISPLAYED_SET_PROMPT =
  'List the 3–5 option IDs you would actually show, and why the set is diverse rather than repetitive:'

/** `Evidence_Ledger` header row, minus `claim_id` which the rows carry. */
export const EVIDENCE_COLUMNS = [
  { key: 'claim_or_decision', label: 'claim_or_decision', kind: 'text' },
  { key: 'supporting_option_ids', label: 'supporting_option_ids', kind: 'text' },
  { key: 'supporting_history_ids', label: 'supporting_history_ids', kind: 'text' },
  {
    key: 'observation_or_inference',
    label: 'observation_or_inference',
    kind: 'select',
    choices: ['Observation', 'Inference'],
  },
  { key: 'confidence', label: 'confidence', kind: 'select', choices: ['Low', 'Medium', 'High'] },
  { key: 'what_would_falsify_it', label: 'what_would_falsify_it', kind: 'text' },
]

/** `Evidence_Ledger` claim ids. The live format asks for three, not five. */
export const EVIDENCE_ROW_IDS = ['E-01', 'E-02', 'E-03']

/**
 * `Cold_Start_Answer` column 1, first five rows. The sheet's three AI-ledger
 * rows are left out: the live format watches the tooling directly.
 */
export const COLD_START_ITEMS = [
  { id: 'cs1', item: 'Default flight for Marcus' },
  { id: 'cs2', item: 'Default hotel for Marcus' },
  { id: 'cs3', item: "What differs from Priya's answer, and why" },
  { id: 'cs4', item: 'What is doing the work instead of history' },
  { id: 'cs5', item: 'The one question you would ask before booking' },
]
