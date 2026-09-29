import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import { loadCanonicalDealSetup, saveCanonicalDealTerms } from '../../services/dealSetupService'
import TransactionBuyerPartiesPanel from './TransactionBuyerPartiesPanel'
import DealSetupReadinessPanel from './DealSetupReadinessPanel'

export default function DealSetupPanel({ transactionId, organisationId = '', canEdit = false, embedded = false, onSaved, sellerDetails = null, onSaveSellerDetails, onEditSellerProfile }) {
  const [draft, setDraft] = useState(null)
  const [activeParty, setActiveParty] = useState('buyer')
  const [sellerDraft, setSellerDraft] = useState({ name: '', email: '', phone: '' })
  const [sellerBusy, setSellerBusy] = useState(false)
  const [sellerError, setSellerError] = useState('')
  const [sellerMessage, setSellerMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  async function reloadSetup() {
    const result = await loadCanonicalDealSetup({ transactionId })
    setDraft((current) => isDirty && current
      ? { ...result.setup, terms: current.terms, finance: current.finance }
      : result.setup)
    setRefreshToken((value) => value + 1)
    return result
  }

  useEffect(() => {
    if (!transactionId) return undefined
    let active = true
    loadCanonicalDealSetup({ transactionId })
      .then((result) => { if (active) setDraft(result.setup) })
      .catch((loadError) => active && setError(loadError.message || 'Deal Setup could not be loaded.'))
    return () => { active = false }
  }, [transactionId])

  useEffect(() => {
    if (!sellerDetails) return
    setSellerDraft({ name: sellerDetails.name || '', email: sellerDetails.email || '', phone: sellerDetails.phone || '' })
  }, [sellerDetails?.name, sellerDetails?.email, sellerDetails?.phone])

  function update(section, key, value) {
    setDraft((current) => ({ ...current, [section]: { ...current[section], [key]: value } }))
    setIsDirty(true)
  }

  function updateSeller(key, value) {
    setSellerDraft((current) => ({ ...current, [key]: value }))
    setSellerError('')
    setSellerMessage('')
  }

  async function save() {
    setBusy(true); setError('')
    try {
      const result = await saveCanonicalDealTerms({ transactionId, terms: draft.terms, finance: draft.finance })
      setDraft(result.setup)
      setIsDirty(false)
      setRefreshToken((value) => value + 1)
      window.dispatchEvent(new CustomEvent('deal-setup:updated', { detail: { transactionId } }))
      await onSaved?.(result)
    } catch (saveError) { setError(saveError.message || 'Deal Setup could not be saved.') } finally { setBusy(false) }
  }

  async function saveSeller(event) {
    event.preventDefault()
    if (!onSaveSellerDetails || sellerBusy) return
    setSellerBusy(true); setSellerError(''); setSellerMessage('')
    try {
      await onSaveSellerDetails(sellerDraft)
      setSellerMessage('Seller details saved.')
    } catch (saveError) { setSellerError(saveError.message || 'Seller details could not be saved.') }
    finally { setSellerBusy(false) }
  }

  if (!draft) return <section className="rounded-[18px] border border-borderDefault bg-surface p-5 text-sm text-textMuted">
    {error ? <div className="space-y-3"><p role="alert" className="text-danger">{error}</p><Button type="button" variant="secondary" onClick={() => {
      setError('')
      loadCanonicalDealSetup({ transactionId }).then((result) => setDraft(result.setup)).catch((loadError) => setError(loadError.message || 'Deal Setup could not be loaded.'))
    }}>Retry loading</Button></div> : 'Loading Deal Setup…'}
  </section>

  const financeType = String(draft.finance.type || '').toLowerCase()
  const usesCash = financeType === 'cash' || financeType === 'hybrid'
  const usesBond = financeType === 'bond' || financeType === 'hybrid'

  return <section className="space-y-5">
    {sellerDetails ? <div role="tablist" aria-label="Deal setup party" className="flex gap-2 rounded-[14px] border border-borderDefault bg-surface p-2">
      {['buyer', 'seller'].map((party) => <button key={party} type="button" role="tab" aria-selected={activeParty === party} aria-controls={`deal-setup-${party}`} onClick={() => setActiveParty(party)} className={`flex-1 rounded-control px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 ${activeParty === party ? 'bg-primary text-white' : 'text-textMuted hover:bg-surfaceAlt'}`}>{party === 'buyer' ? 'Buyer' : 'Seller'}</button>)}
    </div> : null}
    {sellerDetails ? <section id="deal-setup-seller" role="tabpanel" aria-label="Seller details" hidden={activeParty !== 'seller'} className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
      <h3 className="text-section-title font-semibold text-textStrong">Seller details</h3>
      <p className="mt-1 text-secondary text-textMuted">Complete the seller information available for this transaction, even when onboarding began earlier.</p>
      <form onSubmit={saveSeller} className="mt-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-textMuted">Seller name<input disabled={!canEdit || sellerBusy} value={sellerDraft.name} onChange={(event) => updateSeller('name', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label>
          <label className="text-sm font-medium text-textMuted">Email<input disabled={!canEdit || sellerBusy} type="email" value={sellerDraft.email} onChange={(event) => updateSeller('email', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label>
          <label className="text-sm font-medium text-textMuted">Phone<input disabled={!canEdit || sellerBusy} type="tel" value={sellerDraft.phone} onChange={(event) => updateSeller('phone', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label>
          <div className="rounded-control bg-surfaceAlt p-3 text-sm text-textMuted"><span className="block font-medium">Seller type</span><strong className="mt-1 block text-textStrong">{sellerDetails.type || 'Not captured'}</strong><span className="mt-2 block font-medium">Existing bond</span><strong className="mt-1 block text-textStrong">{sellerDetails.hasExistingBond ? 'Yes' : 'No / not flagged'}</strong></div>
        </div>
        {sellerError ? <p role="alert" className="rounded-control bg-dangerSoft px-3 py-2 text-sm text-danger">{sellerError}</p> : null}
        {sellerMessage ? <p role="status" className="text-sm text-success">{sellerMessage}</p> : null}
        <div className="flex flex-wrap gap-2">{canEdit && onSaveSellerDetails ? <Button type="submit" disabled={sellerBusy}>{sellerBusy ? 'Saving…' : 'Save seller details'}</Button> : null}{canEdit && onEditSellerProfile ? <Button type="button" variant="secondary" onClick={onEditSellerProfile}>Edit seller type and bond</Button> : null}</div>
      </form>
    </section> : null}
    <div id="deal-setup-buyer" role={sellerDetails ? 'tabpanel' : undefined} aria-label={sellerDetails ? 'Buyer details' : undefined} hidden={Boolean(sellerDetails && activeParty !== 'buyer')} className="space-y-5">
    <DealSetupReadinessPanel transactionId={transactionId} setup={draft} hasUnsavedChanges={isDirty} refreshToken={refreshToken} />
    {error ? <p className="rounded-control bg-dangerSoft px-4 py-3 text-sm text-danger">{error}</p> : null}

    <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-textMuted">Step 1</p><h3 className="mt-1 text-section-title font-semibold text-textStrong">Deal basics</h3><p className="mt-1 text-secondary text-textMuted">Record the commercial terms used across the transaction.</p></div></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-textMuted">Purchaser type<select disabled={!canEdit || busy} value={draft.terms.purchaserType} onChange={(event) => update('terms', 'purchaserType', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Select purchaser type…</option><option value="individual">Individual</option><option value="married_coc">Married</option><option value="company">Company / CC</option><option value="trust">Trust</option></select></label>
        <label className="text-sm font-medium text-textMuted">Purchase price<input disabled={!canEdit || busy} type="number" value={draft.terms.purchasePrice ?? ''} onChange={(event) => update('terms', 'purchasePrice', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label>
        <label className="text-sm font-medium text-textMuted">Deposit<input disabled={!canEdit || busy} type="number" value={draft.terms.depositAmount ?? ''} onChange={(event) => update('terms', 'depositAmount', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label>
      </div>
    </section>

    <TransactionBuyerPartiesPanel transactionId={transactionId} organisationId={organisationId} purchaserType={draft.terms.purchaserType} canEdit={canEdit} embedded={embedded} onUpdated={reloadSetup} />

    <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-textMuted">Step 3</p><h3 className="mt-1 text-section-title font-semibold text-textStrong">Funding</h3><p className="mt-1 text-secondary text-textMuted">Only the fields relevant to this finance route are shown.</p></div>{isDirty ? <Button type="button" disabled={!canEdit || busy} onClick={save}>{busy ? 'Saving…' : 'Save Deal Setup'}</Button> : null}</div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-textMuted">Finance type<select disabled={!canEdit || busy} value={draft.finance.type} onChange={(event) => update('finance', 'type', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Select finance type…</option><option value="cash">Cash</option><option value="bond">Bond</option><option value="hybrid">Cash and bond</option></select></label>
        {usesBond ? <label className="text-sm font-medium text-textMuted">Finance managed by<select disabled={!canEdit || busy} value={draft.finance.managedBy} onChange={(event) => update('finance', 'managedBy', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Select route owner…</option><option value="client">Buyer</option><option value="bond_originator">Bond originator</option></select></label> : null}
        {usesCash ? <label className="text-sm font-medium text-textMuted">Cash amount<input disabled={!canEdit || busy} type="number" value={draft.finance.cashAmount ?? ''} onChange={(event) => update('finance', 'cashAmount', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label> : null}
        {usesBond ? <label className="text-sm font-medium text-textMuted">Bond amount<input disabled={!canEdit || busy} type="number" value={draft.finance.bondAmount ?? ''} onChange={(event) => update('finance', 'bondAmount', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label> : null}
        {usesBond ? <label className="text-sm font-medium text-textMuted">Bank<input disabled={!canEdit || busy} value={draft.finance.bank} onChange={(event) => update('finance', 'bank', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" placeholder="Optional until a bank is selected" /></label> : null}
      </div>
      {!financeType ? <p className="mt-4 text-sm text-textMuted">Choose Cash, Bond, or Cash and bond to continue.</p> : null}
    </section>

    <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-textMuted">Step 4</p><h3 className="mt-1 text-section-title font-semibold text-textStrong">Documents</h3><p className="mt-1 text-secondary text-textMuted">Requirements are calculated from this setup and are managed in the Documents tab. Reusable buyer FICA documents are not requested twice.</p></div><span className="rounded-full bg-surfaceAlt px-3 py-1 text-xs font-semibold text-textMuted">Review in Documents</span></div></section>

    <div className="flex justify-end"><Button type="button" disabled={!canEdit || busy || !isDirty} onClick={save}>{busy ? 'Saving…' : 'Save Deal Setup'}</Button></div>
    </div>
  </section>
}
