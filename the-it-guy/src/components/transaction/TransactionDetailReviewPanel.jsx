import { resolveDealSetupFinanceType } from '../../core/transactions/dealSetupContract.js'
import { useEffect, useRef, useState } from 'react'
import Button from '../ui/Button'
import { DEAL_REVIEW_SECTIONS, reviewFieldChanges, reviewSectionChanged, reviewSectionDetails } from '../../core/transactions/transactionDetailReview.js'
import { createReviewSourceUrl, loadTransactionDetailReview, saveTransactionDetailReview } from '../../services/transactionDetailReviewService.js'

const dateLabel = (value) => value ? new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : ''

export default function TransactionDetailReviewPanel({ transactionId, canEdit = false, onClose, onSaved, onManageBuyerLinks }) {
  const [review, setReview] = useState(null)
  const [activeSection, setActiveSection] = useState('buyer')
  const [drafts, setDrafts] = useState({})
  const [attestations, setAttestations] = useState({})
  const [sourceId, setSourceId] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceError, setSourceError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const requestGeneration = useRef(0)

  useEffect(() => {
    const generation = ++requestGeneration.current
    loadTransactionDetailReview({ transactionId }).then((result) => {
      if (generation !== requestGeneration.current) return
      setReview(result); setDrafts({}); setAttestations({}); setError(''); setLoading(false)
      setSourceId(result.documents?.find((document) => document.available)?.id || '')
    }).catch((cause) => {
      if (generation !== requestGeneration.current) return
      setError(cause.message || 'Review details could not be loaded.'); setLoading(false)
    })
    return () => { requestGeneration.current += 1 }
  }, [transactionId])

  const sourceDocument = review?.documents?.find((document) => document.id === sourceId)
  useEffect(() => {
    let active = true
    setSourceUrl(''); setSourceError('')
    if (sourceDocument?.available) {
      createReviewSourceUrl({ document: sourceDocument }).then((url) => active && setSourceUrl(url))
        .catch((cause) => active && setSourceError(cause.message || 'The source PDF could not be opened.'))
    }
    return () => { active = false }
  }, [sourceDocument])

  async function reload() {
    if (busy) return
    setLoading(true); setError('')
    try {
      const result = await loadTransactionDetailReview({ transactionId })
      setReview(result); setAttestations({}); setSourceId((current) => result.documents?.some((document) => document.id === current && document.available) ? current : result.documents?.find((document) => document.available)?.id || '')
      setNotice('Saved details reloaded. Your unsaved edits are kept so you can compare them.')
    } catch (cause) { setError(cause.message || 'Review details could not be loaded.') }
    finally { setLoading(false) }
  }

  function edit(key, value) {
    setDrafts((current) => ({ ...current, [activeSection]: { ...reviewSectionDetails(activeSection, section.currentSnapshot), ...current[activeSection], [key]: value } }))
    setAttestations((current) => ({ ...current, [activeSection]: false }))
    setNotice(''); setError('')
  }

  async function save(confirm) {
    if (busy || !canEdit) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await saveTransactionDetailReview({ transactionId, section: activeSection, details: draft, review, confirm,
        sourceDocumentId: sourceId || null, attested: attestations[activeSection] === true })
      setReview(result.review)
      setDrafts((current) => { const next = { ...current }; delete next[activeSection]; return next })
      setAttestations((current) => ({ ...current, [activeSection]: false }))
      setNotice(result.refreshWarning || (confirm ? `${definition.label} confirmed.` : `${definition.label} draft saved. It still needs confirmation.`))
      window.dispatchEvent(new CustomEvent('deal-setup:updated', { detail: { transactionId } }))
      window.dispatchEvent(new Event('itg:transaction-updated'))
      try { await onSaved?.(result) }
      catch { setNotice('The details were saved, but the transaction view could not refresh. Refresh Deal Setup before progressing.') }
    } catch (cause) { setError(cause.message || 'Details could not be saved. Your edits have been kept.') }
    finally { setBusy(false) }
  }

  const definition = DEAL_REVIEW_SECTIONS.find((item) => item.key === activeSection)
  const section = review?.sections?.find((item) => item.key === activeSection)
  const draft = drafts[activeSection] || reviewSectionDetails(activeSection, section?.currentSnapshot)
  const changed = section ? reviewSectionChanged(activeSection, draft, section.currentSnapshot) : false
  const hasUnsavedChanges = review?.sections?.some((item) => drafts[item.key] && reviewSectionChanged(item.key, drafts[item.key], item.currentSnapshot))
  const confirmedCount = review?.sections?.filter((item) => item.status === 'confirmed' && (!drafts[item.key] || !reviewSectionChanged(item.key, drafts[item.key], item.currentSnapshot))).length || 0
  const savedChanges = section ? reviewFieldChanges(activeSection, section.currentSnapshot, draft) : []
  const visibleFields = definition.fields.filter(([key]) => {
    if (activeSection !== 'funding') return true
    if (key === 'cashAmount') return ['cash', 'hybrid'].includes(resolveDealSetupFinanceType(draft.financeType))
    if (['bondAmount', 'managedBy', 'bank'].includes(key)) return ['bond', 'hybrid'].includes(resolveDealSetupFinanceType(draft.financeType))
    return true
  })

  if (!review || review.transactionId !== transactionId) return <section className="rounded-[18px] border border-borderDefault bg-surface p-5">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-textStrong">Review imported details</h2><Button type="button" variant="secondary" onClick={onClose}>Back to Deal Setup</Button></div>
    {error ? <><p role="alert" className="mt-4 text-sm text-danger">{error}</p><Button type="button" variant="secondary" onClick={reload} disabled={loading}>Retry loading review</Button></> : <p className="mt-4 text-sm text-textMuted">Loading review details…</p>}
  </section>

  return <section className="space-y-4" aria-label="Imported transaction detail review">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-section-title font-semibold text-textStrong">Review imported deal</h2><p className="mt-1 text-sm text-textMuted">Confirm the saved details against the original document.</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-warningSoft px-3 py-1 text-xs font-semibold text-warning">{confirmedCount} of {DEAL_REVIEW_SECTIONS.length} sections confirmed</span><Button type="button" variant="secondary" disabled={busy || hasUnsavedChanges} onClick={onClose}>Back to Deal Setup</Button></div>
    </div>
    <div className={`rounded-control border p-4 text-sm ${confirmedCount === DEAL_REVIEW_SECTIONS.length ? 'border-success/20 bg-successSoft text-success' : 'border-warning/20 bg-warningSoft text-warning'}`}>
      <p className="font-semibold">{confirmedCount === DEAL_REVIEW_SECTIONS.length ? 'Imported details reviewed' : 'Imported details need checking'}</p><p className="mt-1">Corrections apply to this transaction. Shared buyer profiles and attorney appointments are managed separately.</p>
      {review.importComment ? <p className="mt-2 text-xs">{review.importComment}</p> : null}
    </div>
    <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-control bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
      <span>Historical deal date: <strong>{review.saleDate || 'Not captured'}</strong></span><span>Current stage: <strong>{review.stage || 'Not captured'}</strong></span><span>Dates and progress are preserved.</span>
    </div>
    {error ? <p role="alert" className="rounded-control bg-dangerSoft px-4 py-3 text-sm text-danger">{error}</p> : null}
    {notice ? <p role="status" className="rounded-control bg-surfaceAlt px-4 py-3 text-sm text-textStrong">{notice}</p> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)]">
      <div className="min-w-0 rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
        <div role="tablist" aria-label="Review sections" className="mb-5 grid grid-cols-2 gap-2 border-b border-borderSoft pb-4 lg:grid-cols-3">
          {DEAL_REVIEW_SECTIONS.map((item) => {
            const saved = review.sections.find((value) => value.key === item.key)
            const confirmed = saved?.status === 'confirmed' && (!drafts[item.key] || !reviewSectionChanged(item.key, drafts[item.key], saved.currentSnapshot))
            return <button key={item.key} id={`review-tab-${item.key}`} type="button" role="tab" aria-selected={activeSection === item.key} aria-controls="detail-review-section" disabled={busy} onClick={() => { setActiveSection(item.key); setError(''); setNotice('') }} className={`rounded-control px-3 py-2 text-left text-sm font-semibold ${activeSection === item.key ? 'bg-successSoft text-success' : 'bg-surfaceAlt text-textMuted'}`}><span aria-hidden="true">{confirmed ? '✓ ' : '○ '}</span>{item.label}<span className="mt-1 block text-xs font-normal">{confirmed ? 'Confirmed' : 'Needs review'}</span></button>
          })}
        </div>
        <div id="detail-review-section" role="tabpanel" aria-labelledby={`review-tab-${activeSection}`}>
          <h3 className="text-lg font-semibold text-textStrong">{definition.label}</h3>
          {activeSection === 'buyer' && section.currentSnapshot.primaryCount !== 1 ? <div className="mt-3 rounded-control bg-warningSoft p-3 text-sm text-warning"><p>Link the correct buyer and choose one primary contact before confirming.</p><Button type="button" variant="secondary" disabled={busy || hasUnsavedChanges} onClick={onManageBuyerLinks}>Manage buyer links</Button></div> : null}
          {activeSection === 'buyer' && section.currentSnapshot.linkedProfileName && section.currentSnapshot.linkedProfileName.trim().toLowerCase() !== draft.name.trim().toLowerCase() ? <p className="mt-3 rounded-control bg-warningSoft p-3 text-sm text-warning">The linked shared profile is named {section.currentSnapshot.linkedProfileName}. Check that it belongs to the same buyer. Saving here changes this transaction’s details; it keeps the shared profile unchanged.</p> : null}
          {activeSection === 'attorney' ? <p className="mt-2 text-sm text-textMuted">These are captured contact details. Editing them does not nominate a firm or grant portal access. Assigned firm: {section.currentSnapshot.assignedFirmName || 'Not assigned'}.</p> : null}
          {activeSection === 'property' && (section.currentSnapshot.unitId || section.currentSnapshot.developmentId) ? <p className="mt-2 text-sm text-textMuted">This deal is linked to a property record. Address corrections apply to this transaction; check the linked property separately if it is incorrect.</p> : null}
          {activeSection === 'funding' && draft.financeType && !resolveDealSetupFinanceType(draft.financeType) ? <p role="status" className="mt-3 rounded-control bg-warningSoft p-3 text-sm text-warning">Imported finance type “{draft.financeType}” is unresolved. Check the original document and select the correct finance type.</p> : null}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {visibleFields.map(([key, label, type = 'text']) => <label key={key} className="text-sm font-medium text-textMuted">{label}
              {type === 'buyer_type' ? <select disabled={!canEdit || busy} value={draft[key]} onChange={(event) => edit(key, event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Select buyer type…</option><option value="individual">Individual</option><option value="married_coc">Married purchaser</option><option value="company">Company / CC</option><option value="trust">Trust</option></select>
                : type === 'finance_type' ? <select disabled={!canEdit || busy} value={resolveDealSetupFinanceType(draft[key]) || draft[key]} onChange={(event) => edit(key, event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Select finance type…</option><option value="cash">Cash</option><option value="bond">Bond</option><option value="hybrid">Cash and bond</option>{draft[key] && !resolveDealSetupFinanceType(draft[key]) ? <option value={draft[key]} disabled>Unresolved: {draft[key]}</option> : null}</select>
                : type === 'finance_manager' ? <select disabled={!canEdit || busy} value={draft[key]} onChange={(event) => edit(key, event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Select route owner…</option><option value="client">Buyer</option><option value="bond_originator">Bond originator</option></select>
                : type === 'textarea' ? <textarea rows={3} maxLength={1000} disabled={!canEdit || busy} value={draft[key]} onChange={(event) => edit(key, event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" placeholder="Not captured" />
                  : <input type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} maxLength={1000} disabled={!canEdit || busy} value={draft[key]} onChange={(event) => edit(key, event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" placeholder="Not captured" />}
            </label>)}
          </div>
          {savedChanges.length ? <div className="mt-4 rounded-control bg-surfaceAlt p-3 text-sm"><p className="font-semibold">Your corrections</p><ul className="mt-2 space-y-1">{savedChanges.map((change) => <li key={change.field}>{change.label}: <span className="text-textMuted">{change.previous || 'Not captured'}</span> → {change.saved || 'Not captured'}</li>)}</ul></div> : null}
          {section.confirmedAt ? <p className="mt-4 text-xs text-textMuted">Last confirmation: {dateLabel(section.confirmedAt)}. {section.status !== 'confirmed' || changed ? 'Details or the source have changed and need checking again.' : ''}</p> : null}
          <p className="mt-4 text-xs text-textMuted">{activeSection === 'funding' ? 'Check the price, deposit and funding split against the original document. Bank details can be completed later. Cash includes the deposit for cash and mixed finance. For bond-only finance, deposit plus bond must equal the price. Enter 0 when no deposit is required.' : 'Missing contact and identity fields can be completed later. Confirmation checks the saved identity and buyer links against an available source PDF.'}</p>
          <label className="mt-5 flex items-start gap-2 text-sm text-textStrong"><input type="checkbox" disabled={!canEdit || busy || !sourceUrl || !!sourceError} checked={attestations[activeSection] === true} onChange={(event) => setAttestations((current) => ({ ...current, [activeSection]: event.target.checked }))} />I checked these details against the original document.</label>
          <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={!canEdit || busy || loading || !changed} onClick={() => save(false)}>Save draft</Button><Button type="button" disabled={!canEdit || busy || loading || !attestations[activeSection] || !sourceUrl || !!sourceError} onClick={() => save(true)}>{busy ? 'Saving…' : `Save and confirm ${activeSection}`}</Button></div>
          <button type="button" disabled={busy || loading} onClick={reload} className="mt-3 text-sm font-medium text-primary underline">Reload saved details</button>
        </div>
      </div>
      <aside className="min-w-0 rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface" aria-label="Original document comparison">
        <h3 className="text-lg font-semibold text-textStrong">Original document</h3>
        <label className="mt-3 block text-sm text-textMuted">Source PDF<select value={sourceId} disabled={busy} onChange={(event) => { setSourceId(event.target.value); setAttestations({}) }} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Choose a linked PDF…</option>{review.documents.map((document) => <option key={document.id} value={document.id} disabled={!document.available}>{document.name || 'Original PDF'}{document.available ? '' : ' — recovery needed'}</option>)}</select></label>
        {sourceError ? <p role="alert" className="mt-4 text-sm text-danger">{sourceError}</p> : null}
        {sourceUrl ? <><a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-primary underline">Open original PDF</a><iframe title="Original transaction PDF" src={`${sourceUrl}#view=FitH`} className="mt-3 h-[38rem] w-full rounded-control border border-borderSoft bg-surfaceAlt" /></>
          : <div className="mt-4 rounded-control bg-surfaceAlt p-5 text-sm text-textMuted"><p className="font-semibold text-textStrong">{sourceDocument?.available && !sourceError ? 'Opening source PDF…' : 'Original PDF not available'}</p><p className="mt-2">{sourceDocument?.available ? 'If the preview fails, reopen the review or use the PDF link.' : 'Upload or recover the original signed OTP through Documents, then reload this review. You can save corrections as a draft, but confirmation needs the original PDF.'}</p></div>}
        <p className="mt-3 text-xs text-textMuted">Compare the document with the details on the left. The preview does not automatically verify names or addresses.</p>
      </aside>
    </div>
    {hasUnsavedChanges ? <p role="status" className="text-sm text-warning">Save your corrections before returning to Deal Setup. Switching review sections keeps your edits. <button type="button" disabled={busy} onClick={() => { setDrafts({}); setAttestations({}); setError(''); setNotice('Unsaved corrections discarded.') }} className="ml-2 underline">Discard unsaved changes</button></p> : null}
    <details className="rounded-[18px] border border-borderDefault bg-surface p-5"><summary className="cursor-pointer text-sm font-semibold text-textStrong">Review history ({review.history.length})</summary>
      {!review.history.length ? <p className="mt-3 text-sm text-textMuted">No review decisions have been recorded.</p> : <ol className="mt-4 space-y-4">{review.history.map((event) => <li key={event.id} className="border-t border-borderSoft pt-3 text-sm"><p className="font-semibold">{DEAL_REVIEW_SECTIONS.find((item) => item.key === event.section)?.label} · {event.action === 'confirmed' ? 'Confirmed' : 'Draft saved'}</p><p className="mt-1 text-xs text-textMuted">{event.actorName} · {dateLabel(event.recordedAt)}</p><ul className="mt-2 space-y-1">{reviewFieldChanges(event.section, event.previousSnapshot, event.savedSnapshot).map((change) => <li key={change.field}>{change.label}: {change.previous || 'Not captured'} → {change.saved || 'Not captured'}</li>)}</ul></li>)}</ol>}
    </details>
  </section>
}
