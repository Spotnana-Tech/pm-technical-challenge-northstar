import { Route, Routes } from 'react-router-dom'

import AuditPanel from './components/AuditPanel.jsx'
import Nav from './components/Nav.jsx'
import ScenarioBar from './components/ScenarioBar.jsx'
import Policy from './pages/Policy.jsx'
import Results from './pages/Results.jsx'
import Traveler from './pages/Traveler.jsx'
import { NorthStarProvider, useNorthStar } from './state/NorthStarContext.jsx'

const ERRORS_SHOWN = 3

function ErrorBanner({ errors, onOpenAudit }) {
  return (
    <div className="error-banner">
      <p className="error-banner__title">Ranking errors ({errors.length})</p>
      <ul className="error-banner__list ns-small">
        {errors.slice(0, ERRORS_SHOWN).map((error, index) => (
          <li key={`${error.stage}-${error.option_id}-${index}`}>
            {[error.stage, error.option_id, error.message].filter(Boolean).join(' · ')}
          </li>
        ))}
      </ul>
      <button type="button" className="error-banner__link ns-small" onClick={onOpenAudit}>
        open audit for all
      </button>
    </div>
  )
}

function Shell() {
  const {
    travelerId,
    setTravelerId,
    travelers,
    scenarioId,
    setScenarioId,
    scenarios,
    scenario,
    internalView,
    setInternalView,
    auditOpen,
    setAuditOpen,
    traveler,
    result,
  } = useNorthStar()

  const errors = result.errors ?? []

  return (
    <div className="app">
      <Nav />
      <ScenarioBar
        travelerId={travelerId}
        onTravelerChange={setTravelerId}
        travelers={travelers}
        scenarioId={scenarioId}
        onScenarioChange={setScenarioId}
        scenarios={scenarios}
        internalView={internalView}
        onInternalViewChange={setInternalView}
        onOpenAudit={() => setAuditOpen(true)}
        engineErrorCount={errors.length}
      />
      <main className="page">
        {errors.length > 0 ? (
          <ErrorBanner errors={errors} onOpenAudit={() => setAuditOpen(true)} />
        ) : null}
        <Routes>
          <Route path="/" element={<Results />} />
          <Route path="/traveler" element={<Traveler />} />
          <Route path="/policy" element={<Policy />} />
        </Routes>
      </main>
      <AuditPanel
        audit={result.audit ?? []}
        errors={errors}
        meta={result.meta ?? null}
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        scenarioLabel={scenario?.label}
        travelerName={traveler?.name}
      />
    </div>
  )
}

export default function App() {
  return (
    <NorthStarProvider>
      <Shell />
    </NorthStarProvider>
  )
}
