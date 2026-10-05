import { useEffect, useRef, useState } from 'react'
import { getBondSubmissionPackService } from '../../services/bondSubmissionPackService.js'

export default function BondSubmissionPackPanel({ transactionId }) {
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  useEffect(() => { generation.current += 1; setPlan(null); setError(''); setNotice(''); setBusy(''); return () => { generation.current += 1 } }, [transactionId])
  if (!transactionId) return null
  const run = async output => {
    const id = generation.current
    setBusy(output || 'load'); setError(''); setNotice('')
    try {
      const service = await getBondSubmissionPackService()
      if (output) {
        const filename = await service.download(transactionId, output)
        if (generation.current === id) setNotice(`Downloaded ${filename}`)
      }
      const latest = await service.load(transactionId)
      if (generation.current === id) setPlan(latest)
    } catch (failure) { if (generation.current === id) { setError(failure.message || 'The submission pack could not be prepared.'); setPlan(null) } }
    finally { if (generation.current === id) setBusy('') }
  }
  const button = 'min-h-11 rounded-xl border border-[#dbe5f0] px-4 py-2 text-sm font-semibold text-[#24518a] disabled:opacity-50'
  return <section className="mt-4 space-y-3 rounded-xl border border-[#dbe5f0] bg-[#f7fbff] p-4" aria-label="Bank submission pack">
    <div><h3 className="font-semibold text-[#17324d]">Bank submission pack</h3><p className="mt-1 text-sm text-[#526d88]">The accepted signed application and approved documents, with a checklist of anything still needed.</p></div>
    <button type="button" disabled={Boolean(busy)} className={button} onClick={() => void run()}>{busy === 'load' ? 'Checking…' : plan ? 'Refresh checklist' : 'Check pack and downloads'}</button>
    {plan ? <>
      <p className="text-sm font-semibold text-[#17324d]">Version {plan.submission.submission_version || 1} · {plan.assessment?.label || (plan.ready ? 'Ready for bank submission' : 'Incomplete — resolve outstanding items before bank submission')}</p>
      <ul className="space-y-2 text-sm text-[#526d88]">{plan.rows.map((row, index) => <li key={`${row.key}-${index}`}><span className="font-semibold">{row.title}</span>{row.participantRole ? ` (${row.participantRole.replaceAll('_', ' ')})` : ''}: {row.status}{!row.external ? ` · ${row.included.length} approved file(s)` : ''}</li>)}</ul>
      {plan.issues?.length ? <ul aria-label="Submission blockers" className="space-y-1 text-sm text-[#9b4429]">{plan.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message || String(issue)}</li>)}</ul> : null}
      <ConsultantPackReview key={plan.reviewContext?.contextHash || 'unverified'} transactionId={transactionId} plan={plan} disabled={Boolean(busy)} onReviewed={setPlan} />
      <div className="flex flex-wrap gap-2">{[['application', 'Signed application PDF'], ['supporting', 'Supporting documents ZIP'], ['checklist', 'Pack checklist PDF']].map(([output, label]) => <button type="button" key={output} className={button} disabled={Boolean(busy)} onClick={() => void run(output)}>{busy === output ? 'Preparing…' : label}</button>)}</div>
    </> : null}
    <p className="text-xs leading-5 text-[#526d88]">Bank statements are excluded from the ZIP. Secure handoff is not connected and receipt is unverified. The consultant will supply statements from the external system once connected. Downloading does not submit to a bank.</p>
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-[#15594f]">{notice}</p> : null}
  </section>
}

export function BondSubmissionPackWorkspace() {
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    setBusy(true); setError('')
    try {
      const { fetchBondSubmissionPackQueue } = await import('../../lib/api.js')
      setItems(await fetchBondSubmissionPackQueue()); setLoaded(true)
    } catch (failure) { setItems([]); setError(failure.message || 'Could not load signed applications.') }
    finally { setBusy(false) }
  }
  return <section className="rounded-2xl border border-[#dbe5f0] bg-white p-5" aria-label="Accepted application downloads">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-[#17324d]">Accepted application downloads</h2><p className="mt-1 text-sm text-[#526d88]">Load signed applications assigned to you to prepare their bank packs.</p></div><button type="button" disabled={busy} onClick={() => void refresh()} className="min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? 'Loading…' : 'Load signed applications'}</button></div>
    {loaded && !busy && !error && items.length === 0 ? <p role="status" className="mt-3 text-sm text-[#526d88]">No signed applications are currently assigned to you. Accept a signed application, then refresh this list.</p> : null}
    {items.map(item => <div key={item.transactionId} className="mt-4"><h3 className="text-sm font-semibold">{item.applicantNames || 'Bond application'} · Version {item.version}</h3><BondSubmissionPackPanel transactionId={item.transactionId} /></div>)}
    {error ? <p role="alert" className="mt-3 text-sm text-red-800">{error}</p> : null}
  </section>
}

function ConsultantPackReview({ transactionId, plan, disabled, onReviewed }) {
  const [checks, setChecks] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!plan.reviewContext?.contextHash) return null
  const current = plan.reviewContext.review?.current === true
  const blockers = (plan.assessment?.issues || []).filter(issue => issue.code !== 'consultant_review_required' && issue.code !== 'release_not_approved' && !(plan.releaseGate?.blockers || []).some(blocker => blocker.code === issue.code))
  const fields = [['applicationChecked', 'I checked the fixed application and selected banks'], ['documentsChecked', 'I checked the approved supporting documents'], ['signaturesChecked', 'I checked every applicant signature against the original PDF'], ['bankFormsChecked', 'I checked the required forms for each selected bank']]
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const service = await getBondSubmissionPackService()
      onReviewed(await service.review(transactionId, { submissionId: plan.submission.id, contextHash: plan.reviewContext.contextHash, checks }))
    } catch (failure) { setError(failure.message || 'Consultant review could not be recorded.') }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="space-y-3 rounded-xl border bg-white p-3">
    <h4 className="text-sm font-semibold">Consultant review</h4>
    {current ? <p className="text-sm text-[#15594f]">Review recorded for this version and these documents. Changes will require another review.</p> : <>
      <p className="text-xs text-[#526d88]">{plan.reviewContext.review ? 'Your earlier review is out of date. Check the current pack again.' : 'Review the downloads before confirming each check. This records your review; release approvals remain separate.'}</p>
      {fields.map(([key, label]) => <label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checks[key] === true} disabled={disabled || busy} onChange={event => setChecks(values => ({ ...values, [key]: event.target.checked }))} /><span>{label}</span></label>)}
      <button type="submit" disabled={disabled || busy || blockers.length > 0 || fields.some(([key]) => checks[key] !== true)} className="min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? 'Recording…' : 'Record consultant review'}</button>
      {blockers.length > 0 ? <p className="text-xs text-[#9b4429]">Resolve the application, document and signature items above before recording your review.</p> : null}
    </>}
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
  </form>
}
