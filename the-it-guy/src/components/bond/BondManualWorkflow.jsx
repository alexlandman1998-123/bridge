import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchBondTrackerContext, fetchBondApplicationPackDocumentUrl } from '../../domains/bond/portalApi.js'
import { recordBondTrackerSubmission, requestManualBondDocument, reviewManualBondDocument } from '../../domains/bond/runtimeApi.js'

const button = 'min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50'
const types = [['buyer_id_document', 'Identity document'], ['buyer_proof_of_address', 'Proof of address'], ['payslips', 'Payslips'], ['employment_contract', 'Employment contract'], ['proof_of_income', 'Proof of income'], ['proof_of_funds', 'Proof of funds'], ['tax_documents', 'Tax documents'], ['financial_statements', 'Financial statements'], ['offer_to_purchase', 'Offer to purchase'], ['assets_liabilities_statement', 'Assets and liabilities']]

export default function BondManualWorkflow({ transactionId, onChanged }) {
  const [context, setContext] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [bankName, setBankName] = useState('')
  const [date, setDate] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [type, setType] = useState(types[0][0])
  const [title, setTitle] = useState(types[0][1])
  const [instruction, setInstruction] = useState('')
  const [feedback, setFeedback] = useState({})
  const requestId = useRef(null)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const id = generation.current
    const data = await fetchBondTrackerContext({ transactionId })
    if (generation.current === id) setContext(data)
  }, [transactionId])
  useEffect(() => {
    generation.current += 1
    const id = generation.current
    setContext(null); setError(''); setNotice(''); setBusy(false); setFeedback({}); setBankName(''); setDate(''); setReference(''); setNotes(''); setInstruction(''); setType(types[0][0]); setTitle(types[0][1]); requestId.current = null
    const load = () => refresh().catch(failure => { if (generation.current === id) { setContext(null); setError(failure.message || 'Could not load this bond tracker.') } })
    void load()
    window.addEventListener('focus', load)
    return () => { generation.current += 1; window.removeEventListener('focus', load) }
  }, [refresh])
  const run = async (action, message, notifyParent = Boolean(action)) => {
    let saved = false
    const id = generation.current
    setBusy(true); setError(''); setNotice('')
    try {
      await action?.(id)
      saved = Boolean(action) && notifyParent
      if (generation.current !== id) return
      await refresh()
      if (generation.current === id && notifyParent) await onChanged?.()
      if (generation.current === id) setNotice(message || '')
    } catch (failure) { if (generation.current === id) setError(saved ? 'The change was saved, but progress could not refresh. Refresh the tracker to see the latest state.' : failure.message || 'Could not save the change. Refresh and retry.') }
    finally { if (generation.current === id) setBusy(false) }
  }
  const open = async doc => {
    const url = await fetchBondApplicationPackDocumentUrl({ transactionId, documentId: doc.id, expectedPath: doc.file_path, expectedBucket: doc.file_bucket })
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  const editable = context?.canEdit === true && !busy
  return <section className="space-y-4 rounded-xl border bg-white p-4" aria-label="Bond originator tracker">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Bond progress tracker</h3><p className="mt-1 text-sm">Record bank submissions and follow their progress through feedback, offers, grant and attorney handoff.</p></div><button type="button" className={button} disabled={busy} onClick={() => void run()}>Refresh bond tracker</button></div>
    {context ? <>
      {context.canEdit ? <form className="space-y-3 rounded-xl border p-3" onSubmit={event => { event.preventDefault(); void run(async id => { await recordBondTrackerSubmission({ transactionId, bankName, submittedAt: new Date(`${date}T00:00:00`).toISOString(), reference, notes }); if (generation.current === id) { setBankName(''); setDate(''); setReference(''); setNotes('') } }, 'Bank submission recorded in the tracker.') }}>
        <h4 className="text-sm font-semibold">Record bank submission</h4>
        <p className="text-sm">Record a submission made through your usual bank channel. No application signing or document approval is required in Arch9.</p>
        <label className="block text-sm">Bank<input required minLength={2} maxLength={100} disabled={!editable} value={bankName} onChange={event => setBankName(event.target.value)} className="mt-1 block max-w-full rounded border p-2" /></label>
        <label className="block text-sm">Submission date<input required type="date" disabled={!editable} value={date} onChange={event => setDate(event.target.value)} className="mt-1 block max-w-full rounded border p-2" /></label>
        <label className="block text-sm">Bank reference (optional)<input maxLength={200} disabled={!editable} value={reference} onChange={event => setReference(event.target.value)} className="mt-1 block max-w-full rounded border p-2" /></label>
        <label className="block text-sm">Submission notes (optional)<textarea maxLength={2000} disabled={!editable} value={notes} onChange={event => setNotes(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
        <button type="submit" disabled={!editable || bankName.trim().length < 2 || !date} className={button}>{busy ? 'Saving…' : 'Save bank submission'}</button>
      </form> : <p className="text-sm">This deal is closed or no longer uses bond finance. Its tracking history is available below.</p>}
      <div aria-label="Tracked bank submissions" className="space-y-2">{(context.submissions || []).map(item => <article key={item.id} className="rounded-xl border p-3 text-sm"><strong>{item.bank_name}</strong><p>{item.status?.replaceAll('_', ' ')} · {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString('en-ZA') : 'Date not recorded'}</p><p>Reference: {item.reference || 'Not supplied'}</p>{item.notes ? <p>{item.notes}</p> : null}</article>)}{!context.submissions?.length ? <p className="text-sm">No bank submissions recorded yet.</p> : null}</div>
      <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">Documents and requests (optional)</summary>
        <p className="mt-3 text-sm">Keep shared files and buyer requests here. Documents do not block tracking a bank submission.</p>
        {context.canEdit ? <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); if (!requestId.current) requestId.current = crypto.randomUUID(); void run(async id => { await requestManualBondDocument({ transactionId, requestId: requestId.current, type, title, instruction }); if (generation.current === id) { requestId.current = null; setInstruction('') } }, 'Document request saved to the buyer’s workspace.') }}>
          <h4 className="text-sm font-semibold">Request a buyer document</h4>
          <label className="block text-sm">Document type<select aria-label="Document type" disabled={!editable} value={type} onChange={event => { setType(event.target.value); setTitle(types.find(([key]) => key === event.target.value)[1]); requestId.current = null }} className="mt-1 block max-w-full rounded border p-2">{types.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="block text-sm">Title<input required minLength={3} maxLength={150} disabled={!editable} value={title} onChange={event => { setTitle(event.target.value); requestId.current = null }} className="mt-1 block max-w-full rounded border p-2" /></label>
          <label className="block text-sm">Instructions<textarea required minLength={3} maxLength={1000} disabled={!editable} value={instruction} onChange={event => { setInstruction(event.target.value); requestId.current = null }} className="mt-1 block w-full rounded border p-2" /></label>
          <button type="submit" disabled={!editable} className={button}>Save document request</button>
        </form> : null}
        <div className="mt-3 space-y-2" aria-label="Bond document reviews">{(context.requirements || []).filter(item => item.document && item.canonicalId).map(item => <article key={item.id} className="space-y-2 rounded-xl border p-3 text-sm"><strong>{item.title}</strong><p>{item.document.name || 'Supporting document'} · {item.document.status}</p><button type="button" className={button} disabled={busy} onClick={() => void run(() => open(item.document), '', false)}>View supporting document</button>{context.canEdit && !['approved', 'accepted', 'verified'].includes(item.document.status) ? <><label className="block">Feedback for buyer<input disabled={!editable} value={feedback[item.id] || ''} maxLength={1000} onChange={event => setFeedback(values => ({ ...values, [item.id]: event.target.value }))} className="mt-1 block max-w-full rounded border p-2" /></label><div className="flex flex-wrap gap-2">{[['approve', 'Approve document'], ['reject', 'Request replacement']].map(([action, label]) => <button key={action} type="button" className={button} disabled={!editable || (action === 'reject' && !feedback[item.id]?.trim())} onClick={() => void run(() => reviewManualBondDocument({ transactionId, requirementId: item.id, documentId: item.document.id, expectedPath: item.document.file_path, action, feedback: feedback[item.id] || '' }), 'Document review saved.')}>{label}</button>)}</div></> : null}</article>)}</div>
      </details>
    </> : null}
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-emerald-800">{notice}</p> : null}
  </section>
}
