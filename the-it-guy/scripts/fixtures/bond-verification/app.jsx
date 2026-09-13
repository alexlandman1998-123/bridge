import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import BondApplicationActionCentrePage from '../../../src/pages/bond/BondApplicationActionCentrePage.jsx'
import GuidedBondApplication from '../../../src/modules/bond/application/guided/GuidedBondApplication.jsx'
import { createEmptyBondApplicationState } from '../../../src/modules/bond/application/bondApplicationState.js'
import { toLegacyBondApplication } from '../../../src/modules/bond/application/legacy/bondApplicationLegacyAdapter.js'
import { downloadBondApplication } from '../../../src/services/bondApplicationDownloadService.js'
import '../../../src/index.css'
const params = new URLSearchParams(location.search), scenario = params.get('scenario') || 'capture'
const key = `bond-verification-${scenario}`
function initial() {
  const state = createEmptyBondApplicationState()
  state.application.transactionId = 'transaction-1'
  state.participants.primaryApplicant.personal = { first_name: 'Zoë', surname: 'Verification' }
  const legacy = toLegacyBondApplication(state)
  legacy._meta = { ...legacy._meta, guided_bond_application_v2: { current_screen_key: scenario === 'signing' ? 'prepare_signature' : 'about_you_edit', completed_screen_keys: [] } }
  return { bond_application: legacy }
}
function App() {
  const [formData, setFormData] = useState(() => JSON.parse(localStorage.getItem(key) || 'null') || initial())
  const [message, setMessage] = useState('')
  if (scenario === 'handoff') return <BondApplicationActionCentrePage />
  if (scenario === 'download') return <section className="p-6"><h1>Offline application download verification</h1><p>Synthetic fixture — no real signature or customer data.</p>{['draft','final'].map((mode) => <button className="m-3 border p-3" key={mode} onClick={async () => { try { const result = await downloadBondApplication({ transactionId: 'transaction-1', mode, brand: { name: 'Verification originator' } }); setMessage(result.filename) } catch(e) { setMessage(e.message) } }}>Download {mode}</button>)}<p role="status">{message}</p></section>
  return <GuidedBondApplication showHandoffNotices={false} token="offline-test" portal={{ transaction: { id: 'transaction-1' }, onboardingFormData: { formData } }} saveClientPortalOnboardingDraft={async ({ formData: next }) => { localStorage.setItem(key, JSON.stringify(next)); setFormData(next); return { saved: true } }} onBackToPortal={() => {}} onSaveAndExit={() => {}} />
}
createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>)
