import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import ListingSellerInformationEditor from '../../src/components/listings/ListingSellerInformationEditor.jsx'
import DealSetupPanel from '../../src/components/transaction/DealSetupPanel.jsx'
import SellerOnboarding from '../../src/pages/SellerOnboarding.jsx'
import { createListingSellerProfileBuilderDraft, selectListingSellerProfileBranch, buildListingSellerProfileFormPatch, addListingSellerProfileDraftPerson, updateListingSellerProfileDraftPerson, removeListingSellerProfileDraftPerson } from '../../src/lib/listingSellerProfileBuilderModel.js'
import { saveListingSellerCanonicalUpdate } from '../../src/services/listings/listingSellerCanonicalUpdateService.js'
import { saveTransactionSellerDetails } from '../../src/services/transactionSellerSaveService.js'
import { buildListingSellerInformationModel } from '../../src/services/listings/listingSellerInformationModel.js'

// Navigation and the lead host are synthetic. The listing editor, seller intake,
// transaction editor/profile, save models and transaction client are production code.
const transactionId = '00000000-0000-4000-8000-000000000801'
export function Profile({ listing }) {
  const model = buildListingSellerInformationModel(listing)
  return <section aria-label="Saved profile comparison">{model.groups.map(group => <div key={group.key}><h3>{group.title}</h3><dl>{group.rows.map(row => <div key={row.key}><dt>{row.label}</dt><dd>{row.displayValue}</dd></div>)}</dl></div>)}</section>
}
export function App() {
  const view = new URLSearchParams(window.location.search).get('view') || 'lead'
  const [listing, setListing] = useState(null), [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  async function reload() {
    const result = await (await fetch('/api/snapshot')).json()
    setListing(result.listing); setDraft(createListingSellerProfileBuilderDraft(result.listing)); setError(''); setMessage('')
  }
  useEffect(() => { void reload() }, [])
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const result = await saveListingSellerCanonicalUpdate({ listing, formPatch: buildListingSellerProfileFormPatch(draft), syncRequirements: false, syncLinkedCrmContact: false, source: view === 'lead' ? 'seller_lead_profile_editor' : 'listing_seller_profile_capture' })
      setListing(result.listing); setDraft(createListingSellerProfileBuilderDraft(result.listing)); setMessage('Seller details saved.')
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  if (!listing || !draft) return <p role="status">Loading isolated seller…</p>
  return <MemoryRouter><h1>Isolated seller alignment acceptance</h1><p>Synthetic data. Component fixture with local PostgreSQL only.</p><nav>{['lead', 'listing', 'transaction', 'portal'].map(key => <a style={{ marginRight: 20 }} key={key} href={`?view=${key}`}>{key}</a>)}</nav>
    <h2>{view}</h2>
    {view === 'portal' ? <SellerOnboarding tokenOverride="token-a" onDraftSaved={result => setListing(result)} /> : view === 'transaction' ? <DealSetupPanel transactionId={transactionId} canEdit sellerDetails={{ name: 'Owner A', email: 'old@example.com', phone: 'old-phone' }} onSaveSellerDetails={(details, options) => saveTransactionSellerDetails({ transactionId, details, ...options })} /> : <>
      <ListingSellerInformationEditor draft={draft} saving={busy} showConsent={false} onChange={(key, value) => setDraft(previous => key === 'branch' ? selectListingSellerProfileBranch(previous, value) : ({ ...previous, [key]: value }))} onAddPerson={(key, title) => setDraft(previous => addListingSellerProfileDraftPerson(previous, key, title))} onUpdatePerson={(key, index, field, value) => setDraft(previous => updateListingSellerProfileDraftPerson(previous, key, index, field, value))} onRemovePerson={(key, index) => setDraft(previous => removeListingSellerProfileDraftPerson(previous, key, index))} onSubmit={save} />
      <button form="listing-seller-information-editor-form" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save seller profile'}</button>
      {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
      {error ? <button onClick={reload}>Use latest saved details (discard my entries)</button> : null}
      <Profile listing={listing} />
    </>}
  </MemoryRouter>
}
createRoot(document.getElementById('root')).render(<App />)
