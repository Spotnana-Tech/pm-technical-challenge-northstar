const POLICY_BADGES = {
  IN_POLICY: { tone: 'success', label: 'In policy' },
  APPROVAL_REQUIRED: { tone: 'warning', label: 'Approval required' },
  FAILS_CHECK: { tone: 'error', label: 'Fails check' },
}

/** `'INVITE_ONLY'` → `'Invite only'` */
function humanize(value) {
  const words = String(value).toLowerCase().replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The badges an option carries, policy first.
 *
 * Availability never replaces the policy verdict — a waitlisted option still
 * has to say what the rule engine thought of it — so this returns a list and
 * the caller renders all of it.
 *
 * @param {string|null|undefined} policy_status `IN_POLICY | APPROVAL_REQUIRED | FAILS_CHECK`
 * @param {string|null|undefined} availability `AVAILABLE | WAITLIST | INVITE_ONLY`
 * @returns {{tone: string, label: string}[]}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function statusTone(policy_status, availability) {
  const badges = []
  if (policy_status == null || policy_status === '') {
    badges.push({ tone: 'neutral', label: 'Policy status unknown' })
  } else {
    badges.push(POLICY_BADGES[policy_status] ?? { tone: 'neutral', label: humanize(policy_status) })
  }
  if (availability != null && availability !== '' && availability !== 'AVAILABLE') {
    badges.push({ tone: 'info', label: humanize(availability) })
  }
  return badges
}

/**
 * @param {{tone?: string, children: import('react').ReactNode}} props
 *   `tone` is one of success / warning / error / info / neutral.
 */
export default function StatusBadge({ tone = 'neutral', children }) {
  return <span className={`ns-badge ns-badge--${tone}`}>{children}</span>
}
