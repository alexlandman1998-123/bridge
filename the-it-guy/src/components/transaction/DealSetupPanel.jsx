import useImportedDealReviewStatuses from '../../hooks/useImportedDealReviewStatuses.js'
import { importedDealReviewStatus } from '../../core/transactions/importedDealReviewStatus.js'
import ImportedDealReviewBadge from './ImportedDealReviewBadge.jsx'
import { lazy, Suspense, useEffect, useState } from 'react'
import { loadTransactionSellerEditContext } from '../../services/transactionSellerSaveService.js'
import Button from '../ui/Button'
import { loadCanonicalDealSetup, saveCanonicalDealTerms } from '../../services/dealSetupService'
import TransactionBuyerOnboardingPanel from './TransactionBuyerOnboardingPanel.jsx'
import DealSetupPartyOverview from './DealSetupPartyOverview.jsx'

import { resolveDealSetupFinanceType, validateDealSetupFunding } from '../../core/transactions/dealSetupContract.js'
import { identifyDealImport } from '../../core/transactions/dealSetupCompatibilityAudit.js'

const TransactionSellerOnboardingPanel = lazy(() => import('./TransactionSellerOnboardingPanel.jsx'))
const TransactionDetailReviewPanel = lazy(() => import('./TransactionDetailReviewPanel.jsx'))

export default function DealSetupPanel({ transactionId, organisationId = '', canEdit = false, onSaved, onSendBuyerLink, onSendSellerLink, buyerDetails = null, sellerDetails = null, onEditSellerProfile }) {
  const [reviewTransaction, setReviewTransaction] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const [activeParty, setActiveParty] = useState(() => sellerDetails ? 'overview' : 'buyer')
  const sellerEnabled = Boolean(sellerDetails)
  const [sellerContext, setSellerContext] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  const reviewStatuses = useImportedDealReviewStatuses(reviewTransaction ? [reviewTransaction] : [], refreshToken)
  const reviewStatus = reviewTransaction ? importedDealReviewStatus(reviewTransaction, reviewStatuses.summaries[transactionId], { unavailable: Boolean(reviewStatuses.error) }) : null

  async function reloadSetup() {
    const result = await loadCanonicalDealSetup({ transactionId })
    setReviewTransaction(result.transaction || null)
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
      .then((result) => { if (active) { setDraft(result.setup); setReviewTransaction(result.transaction || null) } })
      .catch((loadError) => active && setError(loadError.message || 'Deal Setup could not be loaded.'))
    return () => { active = false }
  }, [transactionId])

  useEffect(() => {
    if (!sellerEnabled) return undefined
    let active = true
    setSellerContext(null)
    loadTransactionSellerEditContext({transactionId}).then(context => { if (active) setSellerContext(context) })
      .catch(() => { if (active) setSellerContext(null) })
    return () => { active = false }
  }, [transactionId, sellerEnabled])

  function update(section, key, value) {
    setDraft((current) => ({ ...current, [section]: { ...current[section], [key]: value } }))
    setIsDirty(true)
  }

  async function save() {
    setSaveAttempted(true)
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

  if (!draft) return <section className="rounded-[18px] border border-borderDefault bg-surface p-5 text-sm text-textMuted">
    {error ? <div className="space-y-3"><p role="alert" className="text-danger">{error}</p><Button type="button" variant="secondary" onClick={() => {
      setError('')
      loadCanonicalDealSetup({ transactionId }).then((result) => { setDraft(result.setup); setReviewTransaction(result.transaction || null) }).catch((loadError) => setError(loadError.message || 'Deal Setup could not be loaded.'))
    }}>Retry loading</Button></div> : 'Loading Deal Setup…'}
  </section>

  if (reviewOpen) return <Suspense fallback={<p className="p-5 text-sm text-textMuted">Loading review…</p>}><TransactionDetailReviewPanel key={transactionId} transactionId={transactionId} canEdit={canEdit} onClose={() => setReviewOpen(false)} onManageBuyerLinks={() => { setReviewOpen(false); setActiveParty('buyer') }} onSaved={async (result) => { await reloadSetup(); await onSaved?.(result) }} /></Suspense>

  const financeType = resolveDealSetupFinanceType(draft.finance.type)
  const unresolvedFinanceType = Boolean(String(draft.finance.type || '').trim() && !financeType)
  const fundingValidation = validateDealSetupFunding(draft)
  const usesCash = financeType === 'cash' || financeType === 'hybrid'
  const usesBond = financeType === 'bond' || financeType === 'hybrid'

  return <section className="space-y-5">
    {canEdit && reviewTransaction && (reviewStatus || identifyDealImport(reviewTransaction).status !== 'not_identified') ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-warning/20 bg-warningSoft p-5"><div><h3 className="font-semibold text-textStrong">Review imported details</h3><div className="mt-2"><ImportedDealReviewBadge status={reviewStatus} /></div><p className="mt-1 text-sm text-textMuted">Check buyers, sellers, the property, captured attorney details and funding against the original document.</p>{reviewStatuses.error ? <p role="status" className="mt-1 text-xs text-warning">{reviewStatuses.error}</p> : null}{isDirty ? <p className="mt-1 text-xs text-warning">Save Deal Setup changes before reviewing details.</p> : null}</div><Button type="button" variant="secondary" disabled={busy || isDirty} onClick={() => setReviewOpen(true)}>Review details</Button></div> : null}
    {sellerDetails ? <div role="tablist" aria-label="Deal setup party" className="flex gap-2 rounded-[14px] border border-borderDefault bg-surface p-2">
      {['overview', 'buyer', 'seller'].map((party) => <button key={party} type="button" role="tab" aria-selected={activeParty === party} aria-controls={`deal-setup-${party}`} onClick={() => setActiveParty(party)} className={`flex-1 rounded-control px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 ${activeParty === party ? 'bg-primary text-white' : 'text-textMuted hover:bg-surfaceAlt'}`}>{({ overview: 'Overview', buyer: 'Buyer', seller: 'Seller' })[party]}</button>)}
    </div> : null}
    {sellerDetails ? <section id="deal-setup-overview" role="tabpanel" aria-label="Buyer and seller overview" hidden={activeParty !== 'overview'}>
      <DealSetupPartyOverview buyers={draft.buyers || []} buyerDetails={buyerDetails} purchaserType={draft.terms.purchaserType} sellerDetails={sellerContext?.details || sellerDetails} sellerType={sellerDetails.type || reviewTransaction?.seller_type} onSelectParty={setActiveParty} />
    </section> : null}
    {sellerDetails ? <section id="deal-setup-seller" role="tabpanel" aria-label="Seller details" hidden={activeParty !== 'seller'} className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
      <Suspense fallback={<p className="p-5 text-sm text-textMuted">Loading seller options…</p>}><TransactionSellerOnboardingPanel key={transactionId} transactionId={transactionId} canEdit={canEdit} onEditBond={onEditSellerProfile} onSendLink={onSendSellerLink} onSaved={async receipt => {
        setSellerContext(receipt)
        await reloadSetup(); await onSaved?.(receipt)
      }} /></Suspense>
    </section> : null}
    <div id="deal-setup-buyer" role={sellerDetails ? 'tabpanel' : undefined} aria-label={sellerDetails ? 'Buyer details' : undefined} hidden={Boolean(sellerDetails && activeParty !== 'buyer')} className="space-y-5">
    {error ? <p role="alert" className="rounded-control bg-dangerSoft px-4 py-3 text-sm text-danger">{error}</p> : null}
    <TransactionBuyerOnboardingPanel key={transactionId} transactionId={transactionId} organisationId={organisationId} buyers={draft.buyers || []} purchaserType={draft.terms.purchaserType} canEdit={canEdit} onSendLink={onSendBuyerLink} onUpdated={async () => { await reloadSetup(); await onSaved?.() }} />

    <div className="grid items-start gap-4 xl:grid-cols-2">
    <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="mt-1 text-section-title font-semibold text-textStrong">Deal basics</h3><p className="mt-1 text-secondary text-textMuted">Record the commercial terms used across the transaction.</p></div></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-textMuted">Purchaser type<select disabled={!canEdit || busy} value={draft.terms.purchaserType} onChange={(event) => update('terms', 'purchaserType', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Select purchaser type…</option><option value="individual">Individual</option><option value="married_coc">Married</option><option value="company">Company / CC</option><option value="trust">Trust</option></select></label>
        <label className="text-sm font-medium text-textMuted">Purchase price<input disabled={!canEdit || busy} type="number" min="0" step="0.01" value={draft.terms.purchasePrice ?? ''} onChange={(event) => update('terms', 'purchasePrice', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label>
        <label className="text-sm font-medium text-textMuted">Deposit<input disabled={!canEdit || busy} type="number" min="0" step="0.01" value={draft.terms.depositAmount ?? ''} onChange={(event) => update('terms', 'depositAmount', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label>
      </div>
    </section>



    <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="mt-1 text-section-title font-semibold text-textStrong">Funding</h3><p className="mt-1 text-secondary text-textMuted">Only the fields relevant to this finance route are shown.</p></div>{isDirty ? <Button type="button" disabled={!canEdit || busy} onClick={save}>{busy ? 'Saving…' : 'Save Deal Setup'}</Button> : null}</div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-textMuted">Finance type<select disabled={!canEdit || busy} value={unresolvedFinanceType ? draft.finance.type : financeType} onChange={(event) => update('finance', 'type', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Select finance type…</option>{unresolvedFinanceType ? <option value={draft.finance.type} disabled>Unresolved: {draft.finance.type}</option> : null}<option value="cash">Cash</option><option value="bond">Bond</option><option value="hybrid">Cash and bond</option></select></label>
        {usesBond ? <label className="text-sm font-medium text-textMuted">Finance managed by<select disabled={!canEdit || busy} value={draft.finance.managedBy} onChange={(event) => update('finance', 'managedBy', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Select route owner…</option><option value="client">Buyer</option><option value="bond_originator">Bond originator</option></select></label> : null}
        {usesCash ? <label className="text-sm font-medium text-textMuted">Cash amount<input disabled={!canEdit || busy} type="number" min="0" step="0.01" value={draft.finance.cashAmount ?? ''} onChange={(event) => update('finance', 'cashAmount', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label> : null}
        {usesBond ? <label className="text-sm font-medium text-textMuted">Bond amount<input disabled={!canEdit || busy} type="number" min="0" step="0.01" value={draft.finance.bondAmount ?? ''} onChange={(event) => update('finance', 'bondAmount', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label> : null}
        {usesBond ? <label className="text-sm font-medium text-textMuted">Bank<input disabled={!canEdit || busy} value={draft.finance.bank} onChange={(event) => update('finance', 'bank', event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" placeholder="Optional until a bank is selected" /></label> : null}
      </div>
      {saveAttempted && unresolvedFinanceType ? <p role="status" className="mt-4 rounded-control bg-warningSoft p-3 text-sm text-warning">Imported finance type “{draft.finance.type}” is unresolved. Check the original document and choose Cash, Bond, or Cash and bond. No finance route has been assumed.</p> : null}
      <p className="mt-4 text-sm text-textMuted">For Cash and Cash and bond, cash includes the deposit. For Bond, deposit plus bond equals the price. Enter 0 when no deposit is required.</p>
      {saveAttempted && !fundingValidation.valid ? <div role="status" className="mt-3 rounded-control bg-warningSoft p-3 text-sm text-warning"><p className="font-semibold">Funding needs checking</p><ul className="mt-2 list-disc space-y-1 pl-5">{fundingValidation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><p className="mt-2">You can save a draft; these details do not count as complete yet.</p></div> : null}
      {!financeType ? <p className="mt-4 text-sm text-textMuted">Choose Cash, Bond, or Cash and bond to continue.</p> : null}
    </section>

    </div>
    <div className="flex justify-end"><Button type="button" disabled={!canEdit || busy || !isDirty} onClick={save}>{busy ? 'Saving…' : 'Save Deal Setup'}</Button></div>
    </div>
  </section>
}
