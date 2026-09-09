import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import { loadCanonicalDealSetup, saveCanonicalDealTerms } from '../../services/dealSetupService'
import TransactionBuyerPartiesPanel from './TransactionBuyerPartiesPanel'
import DealSetupReadinessPanel from './DealSetupReadinessPanel'

export default function DealSetupPanel({ transactionId, organisationId = '', canEdit = false, embedded = false, onSaved }) {
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  async function reloadSetup() {
    const result = await loadCanonicalDealSetup({ transactionId })
    setDraft(result.setup)
    setIsDirty(false)
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

  function update(section, key, value) {
    setDraft((current) => ({ ...current, [section]: { ...current[section], [key]: value } }))
    setIsDirty(true)
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

  if (!draft) return <section className="rounded-[18px] border border-borderDefault bg-surface p-5 text-sm text-textMuted">Loading Deal Setup…</section>

  const financeType = String(draft.finance.type || '').toLowerCase()
  const usesCash = financeType === 'cash' || financeType === 'hybrid'
  const usesBond = financeType === 'bond' || financeType === 'hybrid'

  return <section className="space-y-5">
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
  </section>
}
