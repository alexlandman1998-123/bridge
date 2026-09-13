import { Link } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { assessBondApplicationSubmissionReadiness, fetchBondApplicationHandoff, fetchBondApplicationPackDocumentUrl, reviewBondApplicationHandoffDocument, updateBondApplicationCorrection } from '../../lib/api'

const buttonClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50'
const label = (value) => String(value || '').replaceAll('_', ' ')
const date = (value) => value ? new Date(value).toLocaleString('en-ZA') : '—'

function DocumentReview({ request, transactionId, onChanged }) {
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const closed = ['accepted', 'withdrawn', 'cancelled'].includes(request.status)
  async function run(action) {
    setBusy(true); setError('')
    try {
      if (action === 'open') {
        setFileUrl(await fetchBondApplicationPackDocumentUrl({ transactionId, documentId: request.documentId }))
      } else {
        await reviewBondApplicationHandoffDocument({ requestId: request.id, documentId: request.documentId, action, feedback })
        setFeedback(''); setFileUrl(''); await onChanged()
      }
    } catch (e) { setError(e.message || 'Could not complete document review.') } finally { setBusy(false) }
  }
  return <article className="space-y-2 rounded-xl border border-slate-200 p-3">
    <p className="font-semibold">{request.title || 'Supporting document'} · {label(request.status)}</p>
    <p>{request.instruction}</p>
    {request.dueAt ? <p>Due {date(request.dueAt)}</p> : null}
    {request.feedback ? <p className="text-amber-900">Feedback: {request.feedback}</p> : null}
    {request.documentId ? <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={busy} onClick={() => void run('open')}>Prepare document link</button>{fileUrl ? <a className={buttonClass} href={fileUrl} target="_blank" rel="noreferrer">View uploaded document</a> : null}</div> : null}
    {!closed ? <><label className="grid gap-1">Feedback visible to the buyer<textarea className="rounded-lg border border-slate-300 p-2" value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={4000} /></label>
      <div className="flex flex-wrap gap-2">
        {request.status === 'awaiting_review' ? <><button className={buttonClass} disabled={busy || !request.documentId} onClick={() => void run('accept')}>Accept document</button><button className={buttonClass} disabled={busy || !feedback.trim()} onClick={() => void run('reject')}>Request replacement</button><button className={buttonClass} disabled={busy || !feedback.trim()} onClick={() => void run('more_information')}>Request more information</button></> : null}
        <button className={buttonClass} disabled={busy || !feedback.trim()} onClick={() => void run('withdraw')}>Withdraw request</button>
      </div></> : null}
    {error ? <p role="alert" className="text-red-800">{error}</p> : null}
    {request.history?.length ? <details><summary className="cursor-pointer">Review history</summary><ul className="mt-2 space-y-2">{request.history.map((event, index) => <li key={`${event.at}-${index}`}>{date(event.at)} · {label(event.status)}{event.feedback ? ` · ${event.feedback}` : ''}<span className="block text-xs">Document {event.documentId || 'none'} · Reviewer {event.actorId || 'system'}</span></li>)}</ul></details> : null}
  </article>
}

export default function BondApplicationHandoff({ item, onChanged }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try { setData(await fetchBondApplicationHandoff({ exportPackageId: item.exportPackageId })); setError('') }
    catch (e) { setError(e.message || 'Could not load the handoff history.') }
  }, [item.exportPackageId])
  useEffect(() => { void load() }, [load, item])
  async function changed() { await assessBondApplicationSubmissionReadiness({ exportPackageId: item.exportPackageId }); await load(); await onChanged() }
  async function correction(action, requestId = null) {
    setBusy(true); setError('')
    try { await updateBondApplicationCorrection({ exportPackageId: item.exportPackageId, action, instruction, requestId }); setInstruction(''); await changed() }
    catch (e) { setError(e.message || 'Could not update the correction request.') }
    finally { setBusy(false) }
  }
  const openCorrections = (data?.corrections || []).filter((r) => !['resolved', 'withdrawn', 'cancelled', 'superseded'].includes(r.status))
  return <section className="mt-4 space-y-3 border-t border-slate-200 pt-4 text-sm text-slate-700">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">Document review and application corrections</h3><Link className={buttonClass} to={`/transactions/${encodeURIComponent(item.transactionId)}`}>Open application and downloads</Link></div>
    {error ? <p role="alert" className="text-red-800">{error} <button className={buttonClass} onClick={() => void load()}>Retry</button></p> : null}
    {!data && !error ? <p>Loading review requests…</p> : null}
    {data?.requests?.map((request) => <DocumentReview key={`${request.id}-${request.documentId}`} request={request} transactionId={item.transactionId} onChanged={changed} />)}
    {data && !data.requests?.length ? <p>No document requests yet.</p> : null}
    {data?.corrections?.map((request) => <article key={request.id} className="space-y-2 rounded-xl bg-amber-50 p-3"><p className="font-semibold">Application correction · {label(request.status)}</p><p>{request.instruction}</p><p className="text-xs">Requested {date(request.createdAt)}{request.resolvedAt ? ` · Reviewed ${date(request.resolvedAt)}` : ''}</p>{openCorrections.includes(request) ? <><p>A new signed application version must be completed before you can accept these corrections.</p><button className={buttonClass} disabled={busy} onClick={() => void correction('resolve', request.id)}>Accept corrected signed application</button></> : null}</article>)}
    {data && !openCorrections.length ? <form onSubmit={(e) => { e.preventDefault(); void correction('request') }} className="space-y-2"><label className="grid gap-1 font-semibold">Request an application correction<textarea required maxLength={4000} value={instruction} onChange={(e) => setInstruction(e.target.value)} className="rounded-lg border border-slate-300 p-2 font-normal" placeholder="Describe the answers that need correcting. This instruction is visible to the buyer." /></label><p className="text-xs">This reopens the application and requires a new signed version. Use document requests above for supporting files.</p><button className={buttonClass} disabled={busy || !instruction.trim()}>Request correction</button></form> : null}
  </section>
}
