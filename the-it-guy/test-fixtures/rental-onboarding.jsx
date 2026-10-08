// Local development fixture only; these are the actual product components.
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import RentalLandlordOnboardingPage from '../src/pages/rentals/RentalLandlordOnboardingPage.jsx'
import RentalApplicantJourneyPage from '../src/pages/rentals/RentalApplicantJourneyPage.jsx'
import RentalLandlordOnboardingPanel from '../src/modules/rentals/shared/applications/RentalLandlordOnboardingPanel.jsx'
import { supabase } from '../src/lib/supabaseClient.js'
import { WorkspaceContext } from '../src/context/WorkspaceContextBase.js'
import RentalListingDocumentsPanel from '../src/pages/rentals/RentalListingDocumentsPanel.jsx'
import '../src/index.css'
const lead = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
if (location.pathname.startsWith('/__fixture/agent')) {
  // The fixture session cannot authenticate against a hosted project.
  supabase.auth.getSession = async () => ({
    data: { session: { access_token: 'fixture-agent' } },
    error: null,
  })
  const query = async (body) => {
    const response = await fetch('/__fixture/query', { method: 'POST', headers: { Authorization: 'Bearer fixture-agent', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return response.json()
  }
  supabase.rpc = (rpc, args) => query({ rpc, args })
  supabase.from = (table) => {
    const operations = []
    const chain = {}
    for (const method of ['select', 'eq', 'order', 'insert', 'update']) chain[method] = (...args) => { operations.push([method, ...args]); return chain }
    chain.single = () => { operations.push(['single']); return query({ table, operations }) }
    chain.then = (resolve, reject) => query({ table, operations }).then(resolve, reject)
    return chain
  }
}
async function loadMatrix() {
  const response = await fetch('/__fixture/matrix', { headers: { Authorization: 'Bearer fixture-agent' } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}
export function ListingMatrixFixture() {
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState('')
  const refresh = async () => {
    const result = await loadMatrix()
    setSnapshot(result)
    return result
  }
  useEffect(() => {
    let cancelled = false
    loadMatrix().then((result) => { if (!cancelled) setSnapshot(result) }).catch((cause) => { if (!cancelled) setError(cause.message) })
    return () => { cancelled = true }
  }, [])
  return <WorkspaceContext.Provider value={{ profile: { id: '11111111-1111-4111-8111-111111111111' } }}>
    <main className="mx-auto max-w-6xl p-4"><h1 className="mb-4 text-xl font-semibold">First home — rental document matrix</h1>{error ? <p role="alert">{error}</p> : null}<RentalListingDocumentsPanel snapshot={snapshot} onRefresh={refresh} /></main>
  </WorkspaceContext.Provider>
}
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/__fixture/agent/matrix" element={<ListingMatrixFixture />} />
      <Route
        path="/rental-landlord-onboarding/:token"
        element={<RentalLandlordOnboardingPage />}
      />
      <Route
        path="/rental-application/:token"
        element={<RentalApplicantJourneyPage />}
      />
      <Route
        path="/__fixture/agent"
        element={
          <main className="mx-auto max-w-5xl p-6">
            <h1>Agent landlord onboarding</h1>
            <RentalLandlordOnboardingPanel leadId={lead} revision="fixture" />
          </main>
        }
      />
    </Routes>
  </BrowserRouter>,
)
