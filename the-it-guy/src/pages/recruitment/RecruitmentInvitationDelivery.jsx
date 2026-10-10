import { useEffect, useRef, useState } from 'react'
import { getRecruitmentInvitationStatus, sendRecruitmentInvitation } from '../../services/recruitmentService'
const button='rounded-xl border border-[#dbe4ee] bg-white px-4 py-3 text-sm font-semibold text-[#405b75] disabled:opacity-50'
const results={provider_accepted:'Accepted by email provider',failed:'Email send failed',unknown:'Sending result uncertain',sending:'Sending result pending'}
export default function RecruitmentInvitationDelivery({organisationId,leadId,kind,referenceId,applicationLink='',disabled=false,actionLabel=''}) {
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
  return <div className="mt-4 space-y-3 rounded-xl border border-[#e1eaf4] bg-[#fbfdff] p-4" aria-label={`${title} status`}>
    <p className="text-sm font-semibold text-[#405b75]">{title} · {status ? ({prepared:'Link prepared',submitted:'Application submitted',accepted:'Access accepted',expired:'Invitation expired',revoked:'Invitation revoked',unavailable:'Application stage complete'}[status.referenceStatus] || status.referenceStatus) : 'Checking status…'}</p>
    {status?.expiresAt && <p className="text-xs text-[#60758b]">Expires {new Date(status.expiresAt).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})}</p>}
    {status && <p className="text-sm text-[#60758b]">{attempt ? results[attempt.status] : kind==='approval' && status?.queueStatus==='needs_attention' ? 'Approval notice needs staff attention.' : kind==='approval' && status?.queueStatus ? 'Approval notice queued for sending.' : 'No sending result recorded.'}{attempt && ` · ${new Date(attempt.updated_at).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})}`}</p>}
    {status?.recipient && <p className="break-all text-xs text-[#60758b]">Email to {status.recipient}</p>}
    {available && kind==='application' && !applicationLink && <label className="block text-sm text-[#405b75]">Private application link<input type="url" value={savedLink} disabled={sending || disabled} onChange={event=>setSavedLink(event.target.value)} className="mt-2 w-full rounded-lg border border-[#dbe4ee] p-3" /><span className="mt-2 block text-xs text-[#60758b]">Paste the original link to send it again. If unavailable, revoke it and create a new private link; the application stays on this record.</span></label>}
    {needsReview && <label className="flex items-start gap-2 text-sm text-[#405b75]"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)} />I checked the previous sending result. Another email may duplicate it.</label>}
    {available && <button type="button" className={button} disabled={disabled || sending || (kind==='approval' && attempt?.status==='provider_accepted') || (kind==='application' && !link) || (needsReview && !reviewed)} onClick={send}>{sending ? 'Sending…' : kind==='approval' && attempt?.status==='provider_accepted' ? 'Approval email accepted' : attempt?.status==='provider_accepted' || attempt?.retryWindowEnded ? 'Send another email' : attempt ? (actionLabel || 'Retry invitation email') : (actionLabel || 'Send invitation email')}</button>}
    {status?.referenceStatus==='expired' && <p className="text-xs text-[#60758b]">{kind==='workspace' ? 'Confirm activation again below to prepare fresh access using the saved joining setup.' : 'Create a new private link for this same record.'}</p>}
    {status?.referenceStatus==='revoked' && kind==='workspace' && <p className="text-xs text-[#60758b]">Review why access was revoked before confirming activation again.</p>}
    <button type="button" className={`${button} ml-2`} disabled={sending} onClick={()=>setReload(value=>value+1)}>Refresh invitation status</button>
    {notice && <p role="status" className="text-sm text-[#405b75]">{notice}</p>}{error && <p role="alert" className="text-sm text-[#9f3028]">{error}</p>}
    <p className="text-xs text-[#7890a8]">{kind==='application' ? 'This email requests an application. It grants no agency access.' : kind==='workspace' ? 'This email offers the reviewed workspace access. Recruitment completes after membership verification.' : kind==='approval' ? 'Approval email sending is queued automatically after the decision.' : 'This reminder opens the applicant’s restricted document screen after email verification.'} Email provider acceptance does not confirm inbox delivery. Older sends may have no recorded result.</p>
  </div>
}
