import { useEffect, useRef, useState } from 'react'
import { recruitmentSignupRequest } from '../../services/recruitmentSignupService'
import { homeSeekersPackageNote, homeSeekersPackageOptions, profileFields, profilePages, recruitmentProfileSummary } from './recruitmentProfileModel'

export const submissionConsentVersion = 'recruitment-submission-v1'
export const submissionPrivacyText = 'I agree that the agency may process my application and contact me about recruitment.'
export const submissionDeclarationText = 'I confirm that the information in my application is accurate to the best of my knowledge.'

export default function RecruitmentProfileReview({ applicant, endpoint, token, preview, homeSeekers = false, onSubmitted, onBusy, onEdit, onReload, onClose, onSessionExpired }) {
  const [privacy,setPrivacy] = useState(false), [declaration,setDeclaration] = useState(false)
  const [busy,setBusy] = useState(false), [locked,setLocked] = useState(false), [message,setMessage] = useState(''), [conflict,setConflict] = useState(false), [missing,setMissing] = useState(false)
  const attempt = useRef(null), working = useRef(false), heading = useRef(null)
  useEffect(()=>{heading.current?.focus()},[])
  const summary = recruitmentProfileSummary(applicant.profile.answers)
  async function submit(event) {
    event.preventDefault()
    if (working.current || conflict) return
    if (homeSeekers && !homeSeekersPackageOptions.some(([key])=>key===applicant.profile.answers.packagePreference)) { setMessage('Choose a package preference or decide later before submitting.');return }
    if (!privacy || !declaration) { setMissing(true);setMessage('Confirm processing consent and the accuracy declaration.');return }
    if (!attempt.current) attempt.current = { revision:applicant.profileRevision, submissionKey:crypto.randomUUID(), privacyAccepted:true, declarationAccepted:true }
    working.current=true;setBusy(true);onBusy(true);setLocked(true);setMessage('');setMissing(false)
    try {
      const result = preview ? {accepted:true,applicant:{...applicant,applicationSubmitted:true,applicationSubmittedAt:new Date().toISOString(),submittedApplication:{answers:applicant.profile.answers,consentVersion:submissionConsentVersion},submissionPreview:true}}
        : await recruitmentSignupRequest('submit_profile',attempt.current,{endpoint,token})
      onSubmitted(result.applicant)
    } catch(error) {
      if (error.status === 401) onSessionExpired?.()
      setMessage(error.message)
      setConflict(error.conflict===true)
      // An uncertain response keeps the exact revision, declaration and retry key.
      if ([400,401,403,409,410,422].includes(error.status)) {attempt.current=null;setLocked(false)}
    } finally {working.current=false;setBusy(false);onBusy(false)}
  }
  return <form className="recruitment-profile__review" aria-label="Review and submit application" onSubmit={submit} noValidate aria-busy={busy}>
    <h4 ref={heading} tabIndex={-1}>Review your application</h4>
    <p>Check your personal and professional details before submitting. You can edit any section.</p>
    {profilePages.map((label,page)=><section key={label} className="recruitment-profile__review-group" aria-label={`Review ${label}`}>
      <div className="recruitment-profile__review-heading"><h5>{label}</h5><button className="recruitment-signup__secondary" type="button" disabled={busy || locked || conflict} onClick={()=>onEdit(page)} aria-label={`Edit ${label}`}>Edit</button></div>
      <dl>{summary.filter(([name])=>Object.values(profileFields).find(field=>field.label===name)?.page===page).map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    </section>)}
    <p>FFC and professional details are self-declared. The recruitment team will review your application and contact you about the next steps.</p>
    {homeSeekers && <p className="recruitment-signup__note">{homeSeekersPackageNote}</p>}
    <fieldset disabled={busy || locked || conflict}>
      <label className="recruitment-signup__consent"><input type="checkbox" checked={privacy} onChange={event=>{setPrivacy(event.target.checked);setMissing(false)}} aria-invalid={missing && !privacy} aria-describedby={missing?'recruitment-submit-error':undefined} /><span>{submissionPrivacyText}</span></label>
      <label className="recruitment-signup__consent"><input type="checkbox" checked={declaration} onChange={event=>{setDeclaration(event.target.checked);setMissing(false)}} aria-invalid={missing && !declaration} aria-describedby={missing?'recruitment-submit-error':undefined} /><span>{submissionDeclarationText}</span></label>
    </fieldset>
    <p className="recruitment-signup__note">Submitting does not commit you to joining the agency.</p>
    {message && <p id="recruitment-submit-error" role="alert" className="recruitment-signup__error">{message}</p>}
    {conflict && <><p>Reload the latest saved questionnaire, then check the answers and confirm both declarations again.</p><button type="button" disabled={busy} className="recruitment-signup__secondary" onClick={onReload}>Reload saved draft</button></>}
    <div className="recruitment-profile__actions">
      <div className="recruitment-profile__forward-actions">
        <button className="recruitment-signup__secondary" type="button" disabled={busy} onClick={onClose}>Save & close</button>
        <button className="recruitment-signup__submit" type="submit" disabled={busy || conflict}>{busy?'Submitting…':preview?'Preview submission':locked?'Retry submission':'Submit application'}</button>
      </div>
    </div>
  </form>
}
