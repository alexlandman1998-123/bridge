// Local development fixture only; these are the actual product components.
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import RentalLandlordOnboardingPage from '../src/pages/rentals/RentalLandlordOnboardingPage.jsx'
import RentalApplicantJourneyPage from '../src/pages/rentals/RentalApplicantJourneyPage.jsx'
import RentalLandlordOnboardingPanel from '../src/modules/rentals/shared/applications/RentalLandlordOnboardingPanel.jsx'
import { supabase } from '../src/lib/supabaseClient.js'
import '../src/index.css'
const lead = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
if (location.pathname.startsWith('/__fixture/agent')) {
  // The fixture session cannot authenticate against a hosted project.
  supabase.auth.getSession = async () => ({
    data: { session: { access_token: 'fixture-agent' } },
    error: null,
  })
}
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
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
