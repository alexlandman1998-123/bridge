import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import { loadCanonicalDealSetup, saveCanonicalDealTerms } from '../../services/dealSetupService'
import TransactionBuyerPartiesPanel from './TransactionBuyerPartiesPanel'
import DealSetupReadinessPanel from './DealSetupReadinessPanel'

export default function DealSetupPanel({ transactionId, organisationId = '', canEdit = false, onSaved }) {
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!transactionId) return
    let active = true
    loadCanonicalDealSetup({ transactionId }).then((result) => { if (active) setDraft(result.setup) }).catch((loadError) => active && setError(loadError.message || 'Deal Setup could not be loaded.'))
    return () => { active = false }
  }, [transactionId])
  if (!draft) return <section className="rounded-[18px] border border-borderDefault bg-surface p-5 text-sm text-textMuted">Loading Deal Setup…</section>
  const update = (section, key, value) => setDraft((current) => ({ ...current, [section]: { ...current[section], [key]: value } }))
  async function save() {
    setBusy(true); setError('')
    try { const result = await saveCanonicalDealTerms({ transactionId, terms: draft.terms, finance: draft.finance }); setDraft(result.setup); await onSaved?.(result) }
    catch (saveError) { setError(saveError.message || 'Deal Setup could not be saved.') } finally { setBusy(false) }
  }
  return <section className="space-y-5"><DealSetupReadinessPanel transactionId={transactionId} /><section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-section-title font-semibold text-textStrong">Deal Setup</h3><p className="mt-1 text-secondary text-textMuted">Capture deal terms once. Documents and partner workspaces will consume this canonical setup.</p></div><Button type="button" disabled={!canEdit || busy} onClick={save}>{busy ? 'Saving…' : 'Save Deal Setup'}</Button></div>{error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}<div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium text-textMuted">Purchaser type<select disabled={!canEdit} value={draft.terms.purchaserType} onChange={(e) => update('terms', 'purchaserType', e.target.value)} className="mt-1 w-full rounded border p-2"><option value="individual">Individual</option><option value="married_coc">Married</option><option value="company">Company / CC</option><option value="trust">Trust</option></select></label><label className="text-sm font-medium text-textMuted">Purchase price<input disabled={!canEdit} type="number" value={draft.terms.purchasePrice ?? ''} onChange={(e) => update('terms', 'purchasePrice', e.target.value)} className="mt-1 w-full rounded border p-2" /></label><label className="text-sm font-medium text-textMuted">Deposit<input disabled={!canEdit} type="number" value={draft.terms.depositAmount ?? ''} onChange={(e) => update('terms', 'depositAmount', e.target.value)} className="mt-1 w-full rounded border p-2" /></label><label className="text-sm font-medium text-textMuted">Finance type<select disabled={!canEdit} value={draft.finance.type} onChange={(e) => update('finance', 'type', e.target.value)} className="mt-1 w-full rounded border p-2"><option value="cash">Cash</option><option value="bond">Bond</option><option value="hybrid">Hybrid</option></select></label><label className="text-sm font-medium text-textMuted">Finance managed by<select disabled={!canEdit} value={draft.finance.managedBy} onChange={(e) => update('finance', 'managedBy', e.target.value)} className="mt-1 w-full rounded border p-2"><option value="client">Buyer</option><option value="bond_originator">Bond originator</option></select></label><label className="text-sm font-medium text-textMuted">Cash amount<input disabled={!canEdit} type="number" value={draft.finance.cashAmount ?? ''} onChange={(e) => update('finance', 'cashAmount', e.target.value)} className="mt-1 w-full rounded border p-2" /></label><label className="text-sm font-medium text-textMuted">Bond amount<input disabled={!canEdit} type="number" value={draft.finance.bondAmount ?? ''} onChange={(e) => update('finance', 'bondAmount', e.target.value)} className="mt-1 w-full rounded border p-2" /></label><label className="text-sm font-medium text-textMuted">Bank<input disabled={!canEdit} value={draft.finance.bank} onChange={(e) => update('finance', 'bank', e.target.value)} className="mt-1 w-full rounded border p-2" /></label></div></section><TransactionBuyerPartiesPanel transactionId={transactionId} organisationId={organisationId} canEdit={canEdit} /></section>
}
