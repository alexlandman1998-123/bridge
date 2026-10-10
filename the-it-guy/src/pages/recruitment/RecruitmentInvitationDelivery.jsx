import { useEffect, useRef, useState } from 'react'
import { Mail, RefreshCw } from 'lucide-react'
import { getRecruitmentInvitationStatus, sendRecruitmentInvitation } from '../../services/recruitmentService'
const button='rounded-xl border border-[#dbe4ee] bg-white px-4 py-3 text-sm font-semibold text-[#405b75] transition-colors hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--recruitment-accent-ink,#176842)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#edf2f5] disabled:text-[#51667f] disabled:opacity-100 disabled:hover:bg-[#edf2f5]'
const results={provider_accepted:'Accepted by email provider',failed:'Email send failed',unknown:'Sending result uncertain',sending:'Sending result pending'}
const approvalLabels={checking:'Checking…',queued:'Queued',sending:'Sending',accepted:'Accepted by provider',attention:'Needs attention',failed:'Send failed',unknown:'Unconfirmed',not_recorded:'Not recorded',unavailable:'Status unavailable'}
function approvalEmailState(status,error) {
  if (!status) return error ? 'unavailable' : 'checking'
  if (status.queueStatus === 'provider_accepted' || status.attempt?.status === 'provider_accepted') return 'accepted'
  if (status.queueStatus === 'needs_attention') return 'attention'
  if (status.queueStatus === 'sending' || status.attempt?.status === 'sending') return 'sending'
  if (status.queueStatus === 'pending') return 'queued'
  return ({failed:'failed',unknown:'unknown'})[status.attempt?.status] || 'not_recorded'
}
export default function RecruitmentInvitationDelivery({organisationId,leadId,kind,referenceId,applicationLink='',disabled=false,actionLabel='',actionClassName=button,compact=false}) {
  const [status,setStatus]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[sending,setSending]=useState(false),[reload,setReload]=useState(0),[savedLink,setSavedLink]=useState(''),[reviewed,setReviewed]=useState(false)
  const current=useRef(0),request=useRef('')
  useEffect(()=>{
    const generation=++current.current
    setStatus(null);setError('');setNotice('');setReviewed(false)
    getRecruitmentInvitationStatus(organisationId,leadId,kind,referenceId).then(value=>{if(current.current===generation)setStatus(value)}).catch(failure=>{if(current.current===generation)setError(failure.message)})
    return ()=>{current.current=generation+1}
  },[organisationId,leadId,kind,referenceId,reload])
  useEffect(()=>{request.current='';setSavedLink('');setSending(false)},[organisationId,leadId,kind,referenceId])
  const title=({application:'Application invitation',workspace:'Workspace access invitation',documents_reminder:'Document reminder',approval:'Approval notice'})[kind] || 'Recruitment email'
  const attempt=status?.attempt,available=status?.referenceStatus==='prepared',needsReview=Boolean(attempt?.reviewRequired)
  const link=applicationLink || savedLink
  async function send() {
    const generation=current.current
    setSending(true);setError('');setNotice('')
    // Retry an uncertain attempt with its original id; explicit resends get a new id.
    request.current=attempt && !attempt.retryWindowEnded && attempt.status!=='provider_accepted' ? attempt.id : request.current || crypto.randomUUID()
    try {
      const result=await sendRecruitmentInvitation(organisationId,leadId,kind,referenceId,{requestId:request.current,applicationLink:link,allowDuplicate:needsReview && reviewed})
      if(current.current!==generation)return
      setNotice(result.suppressed ? result.error : result.busy ? 'A send is already in progress. Refresh its status in a minute.' : result.ok ? 'The email provider accepted this invitation. Inbox delivery is not yet confirmed.' : result.error || 'Refresh the sending result before retrying.')
      const updated=await getRecruitmentInvitationStatus(organisationId,leadId,kind,referenceId)
      if(current.current===generation){setStatus(updated);if(updated.attempt?.status==='provider_accepted')request.current=''}
    } catch(failure) {if(current.current===generation)setError(failure.message)}
    finally {if(current.current===generation)setSending(false)}
  }
  if (kind === 'approval') {
    const state = sending ? 'sending' : approvalEmailState(status,error)
    const canRetry = available && !error && !['checking','queued','sending','accepted'].includes(state)
    return <section className="recruitment-approval-email" aria-label="Approval email status">
      <header className="recruitment-approval-email__header">
        <div className="recruitment-approval-email__identity"><span className="recruitment-approval-email__icon"><Mail size={18} aria-hidden="true" /></span><div><h4>Approval email</h4>{status?.recipient && <p>{status.recipient}</p>}</div></div>
        <span role="status" aria-live="polite" className={`recruitment-approval-email__status recruitment-approval-email__status--${state}`}>{approvalLabels[state]}</span>
        <button type="button" className="recruitment-approval-email__refresh recruitment-ci-focus" aria-label="Refresh approval email status" title="Refresh approval email status" disabled={sending || (!status && !error)} onClick={() => setReload(value=>value+1)}><RefreshCw size={16} aria-hidden="true" /></button>
      </header>
      {state === 'accepted' && <p className="recruitment-approval-email__detail">Inbox delivery is unconfirmed.</p>}
      {canRetry && <div className="recruitment-approval-email__actions">
        {needsReview && <label className="flex items-start gap-2 text-sm text-[#405b75]"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)} />I checked the previous sending result. Another email may duplicate it.</label>}
        <button type="button" className={actionClassName} disabled={disabled || sending || (needsReview && !reviewed)} onClick={send}>{state === 'not_recorded' ? 'Send approval email' : (actionLabel || 'Retry approval email')}</button>
      </div>}
      {notice && state !== 'accepted' && <p role="status" className="recruitment-approval-email__detail">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-[#9f3028]">{error}</p>}
    </section>
  }
  return <div className={compact ? 'mt-4 space-y-3' : 'mt-4 space-y-3 rounded-xl border border-[#e1eaf4] bg-[#fbfdff] p-4'} aria-label={`${title} status`}>
    {!compact && <>
    <p className="text-sm font-semibold text-[#405b75]">{title} · {status ? ({prepared:'Link prepared',submitted:'Application submitted',accepted:'Access accepted',expired:'Invitation expired',revoked:'Invitation revoked',unavailable:'Application stage complete'}[status.referenceStatus] || status.referenceStatus) : 'Checking status…'}</p>
    {status?.expiresAt && <p className="text-xs text-[#60758b]">Expires {new Date(status.expiresAt).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})}</p>}
    {status && <p className="text-sm text-[#60758b]">{attempt ? results[attempt.status] : kind==='approval' && status?.queueStatus==='needs_attention' ? 'Approval notice needs staff attention.' : kind==='approval' && status?.queueStatus ? 'Approval notice queued for sending.' : 'No sending result recorded.'}{attempt && ` · ${new Date(attempt.updated_at).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})}`}</p>}
    {status?.recipient && <p className="break-all text-xs text-[#60758b]">Email to {status.recipient}</p>}
    </>}
    {available && kind==='application' && !applicationLink && <label className="block text-sm text-[#405b75]">Private application link<input type="url" value={savedLink} disabled={sending || disabled} onChange={event=>setSavedLink(event.target.value)} className="mt-2 w-full rounded-lg border border-[#dbe4ee] p-3" /><span className="mt-2 block text-xs text-[#60758b]">Paste the original link to send it again. If unavailable, revoke it and create a new private link; the application stays on this record.</span></label>}
    {needsReview && <label className="flex items-start gap-2 text-sm text-[#405b75]"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)} />I checked the previous sending result. Another email may duplicate it.</label>}
    <div className="flex flex-wrap items-start gap-2">
      {available && <button type="button" className={actionClassName} disabled={disabled || sending || (kind==='approval' && attempt?.status==='provider_accepted') || (kind==='application' && !link) || (needsReview && !reviewed)} onClick={send}>{sending ? 'Sending…' : kind==='approval' && attempt?.status==='provider_accepted' ? 'Approval email accepted' : attempt?.status==='provider_accepted' || attempt?.retryWindowEnded ? 'Send another email' : attempt ? (actionLabel || 'Retry invitation email') : (actionLabel || 'Send invitation email')}</button>}
      <button type="button" className={button} disabled={sending} onClick={()=>setReload(value=>value+1)}>Refresh invitation status</button>
    </div>
    {status?.referenceStatus==='expired' && <p className="text-xs text-[#60758b]">{kind==='workspace' ? 'Confirm activation again below to prepare fresh access using the saved joining setup.' : 'Create a new private link for this same record.'}</p>}
    {status?.referenceStatus==='revoked' && kind==='workspace' && <p className="text-xs text-[#60758b]">Review why access was revoked before confirming activation again.</p>}
    {notice && <p role="status" className="text-sm text-[#405b75]">{notice}</p>}{error && <p role="alert" className="text-sm text-[#9f3028]">{error}</p>}
    {!compact && <p className="text-xs text-[#60758b]">{kind==='application' ? 'This email requests an application. It grants no agency access.' : kind==='workspace' ? 'This email offers the reviewed workspace access. Recruitment completes after membership verification.' : kind==='approval' ? 'Approval email sending is queued automatically after the decision.' : 'This reminder opens the applicant’s restricted document screen after email verification.'} Email provider acceptance does not confirm inbox delivery. Older sends may have no recorded result.</p>}
  </div>
}
