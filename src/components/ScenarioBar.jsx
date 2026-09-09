/**
 * The control strip under the nav: who we are ranking for, which scenario is
 * loaded, whether internal columns are visible, and the way into the audit.
 */
export default function ScenarioBar({
  travelerId,
  onTravelerChange,
  travelers = [],
  scenarioId,
  onScenarioChange,
  scenarios = [],
  internalView,
  onInternalViewChange,
  onOpenAudit,
  engineErrorCount = 0,
}) {
  const selected = scenarios.find((scenario) => scenario.id === scenarioId)

  return (
    <div className="scenario-bar">
      <div className="scenario-bar__inner">
        <label className="field">
          <span className="field__label ns-small ns-tertiary">Traveler</span>
          <select
            className="field__select"
            value={travelerId}
            onChange={(event) => onTravelerChange(event.target.value)}
          >
            {travelers.map((traveler) => (
              <option key={traveler.traveler_id} value={traveler.traveler_id}>
                {traveler.name ?? traveler.traveler_id}
              </option>
            ))}
          </select>
        </label>

        <label className="field field--wide">
          <span className="field__label ns-small ns-tertiary">Scenario</span>
          <span className="field__row">
            <select
              className="field__select"
              value={scenarioId}
              onChange={(event) => onScenarioChange(event.target.value)}
            >
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}
                  {scenario.internal ? ' (internal)' : ''}
                </option>
              ))}
            </select>
            {selected?.internal ? <span className="ns-badge ns-badge--info">internal</span> : null}
          </span>
        </label>

        <div className="scenario-bar__actions">
          <label className="ns-toggle">
            <input
              type="checkbox"
              checked={internalView}
              onChange={(event) => onInternalViewChange(event.target.checked)}
            />
            <span>Internal view</span>
          </label>
          <button type="button" className="ns-btn ns-btn--ghost" onClick={onOpenAudit}>
            Audit trail
            {engineErrorCount > 0 ? (
              <span className="ns-badge ns-badge--error scenario-bar__errors">
                {engineErrorCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  )
}
