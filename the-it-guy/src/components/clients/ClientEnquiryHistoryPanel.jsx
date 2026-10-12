import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../ui/Button'
import { loadClientEnquiryHistory } from '../../services/clientEnquiryHistoryService'

export default function ClientEnquiryHistoryPanel({ client }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    let active = true
    loadClientEnquiryHistory(client).then(next => { if (active) { setResult(next); setError('') } })
      .catch(() => { if (active) setError('Unable to load enquiry history. Try again.') })
    return () => { active = false }
  }, [client, attempt])
  const enquiries = expanded ? result?.enquiries : result?.enquiries.slice(0, 5)
  return <section className="rounded-[18px] border border-[#e1e8e1] bg-white p-5 sm:p-6" aria-label="Client enquiry history">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold text-[#17334f]">Enquiry history</h3>{result?.available && !error ? <span className={`rounded-full px-3 py-1 text-sm font-semibold ${result.repeat ? 'bg-[#edf7f3] text-[#194a37]' : 'bg-slate-100 text-slate-600'}`}>{result.repeat ? 'Repeat enquirer · ' : ''}{result.count} {result.count === 1 ? 'enquiry' : 'enquiries'}</span> : null}</div>
    <p className="mt-2 text-sm text-[#637890]">Distinct recorded enquiries linked to this client. Duplicate deliveries are excluded.</p>
    {error ? <div role="alert" className="mt-4"><p className="text-sm text-[#b42318]">{error}</p><Button variant="secondary" className="mt-2" onClick={() => { setError(''); setResult(null); setAttempt(value => value + 1) }}>Try again</Button></div> : !result ? <p role="status" className="mt-4 text-sm text-[#637890]">Loading enquiries…</p> : !result.available ? <p className="mt-4 text-sm text-[#637890]">Enquiry history requires a permanent client profile.</p> : !result.count ? <p className="mt-4 text-sm text-[#637890]">No linked enquiries recorded yet.</p> : <>
      <ol className="mt-4 divide-y divide-[#edf1ee]">{enquiries.map(enquiry => <li key={enquiry.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div className="min-w-0"><strong className="block break-words text-sm text-[#293f34]">{enquiry.property}</strong><p className="mt-1 text-sm text-[#637890]">{enquiry.source} · {Number.isFinite(Date.parse(enquiry.recordedAt)) ? new Date(enquiry.recordedAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date not recorded'}</p>{enquiry.reference ? <p className="mt-1 break-words text-xs text-[#7a887f]">Reference: {enquiry.reference}</p> : null}</div><Link className="text-sm font-semibold text-[#194a37] underline underline-offset-4" to={`/pipeline/leads/${enquiry.leadId}`}>Open enquiry</Link></li>)}</ol>
      {result.count > 5 ? <Button variant="secondary" className="mt-3" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show recent enquiries' : `View all ${result.count} enquiries`}</Button> : null}
    </>}
    <p className="mt-4 text-xs text-[#7a887f]">Based on accessible linked records; earlier unrecorded enquiries cannot be reconstructed.</p>
  </section>
}
