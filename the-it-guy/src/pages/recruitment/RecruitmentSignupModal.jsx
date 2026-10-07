import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import RecruitmentProfileQuestionnaire from './RecruitmentProfileQuestionnaire'
import RecruitmentApplicantAccess from './RecruitmentApplicantAccess'
import Modal from '../../components/ui/Modal'
import { recruitmentSignupRequest } from '../../services/recruitmentSignupService'
import { recruitmentContactConsent, recruitmentSignupErrors } from './recruitmentContactModel'
import './RecruitmentSignupModal.css'

const emptyContact = { firstName: '', lastName: '', email: '', phone: '', privacyAccepted: false }
export default function RecruitmentSignupModal({ open, onClose, organisationName, endpoint, token, onCaptured }) {
  const [contact, setContact] = useState(emptyContact)
  const [password, setPassword] = useState('')
  const [visiblePassword, setVisiblePassword] = useState(false)
  const [context, setContext] = useState(null)
  const [contextError, setContextError] = useState('')
  const [reload, setReload] = useState(0)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [complete, setComplete] = useState(false)
  const [accessMode, setAccessMode] = useState(null)
  const [applicant, setApplicant] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  const [delivery, setDelivery] = useState(null)
  const attempt = useRef(null), inFlight = useRef(false), profileClose = useRef(null)
  const options = { endpoint, token }
  useEffect(() => {
    if (!open) { setPassword(''); setVisiblePassword(false); return undefined }
    let active = true
    setContext(null); setContextError('')
    recruitmentSignupRequest('context', {}, { endpoint, token }).then((result) => {
      if (active) {
        if (result.submitted) setContextError('This recruitment link is no longer accepting applications. Contact the agency for a new link.')
        else { setContext(result); setApplicant(result.applicant || null) }
      }
    }).catch((error) => { if (active) setContextError(error.message) })
    return () => { active = false }
  }, [open, endpoint, token, reload])
  const brand = context?.branding?.organisationName || organisationName || 'the agency'
  const activeStep = applicant ? (applicant.applicationSubmitted || reviewing ? 3 : 2) : (complete || accessMode) ? 1 : 0
  function change(key, value) { setContact((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })) }
  async function submit(event) {
    event.preventDefault()
    if (inFlight.current || complete || !context) return
    const invalid = recruitmentSignupErrors(contact, password)
    setErrors(invalid)
    if (Object.keys(invalid).length) return
    if (context.preview) { setPassword(''); setVisiblePassword(false); setComplete(true); return }
    if (!attempt.current) attempt.current = { key: crypto.randomUUID(), contact: { ...contact } }
    inFlight.current = true; setBusy(true); setLocked(true); setMessage('')
    try {
      const result = await recruitmentSignupRequest('signup', { contact: attempt.current.contact, password, submissionKey: attempt.current.key, companyWebsite: new FormData(event.currentTarget).get('website') }, options)
      setComplete(true); setPassword(''); setVisiblePassword(false)
      onCaptured?.(result)
      setAccessMode('email'); setDelivery(null)
      try {
        await recruitmentSignupRequest('send_verification', { email: attempt.current.contact.email }, options)
        setDelivery({ requested: true })
      } catch (error) { setDelivery({ error: error.message }) }
    } catch (error) {
      setMessage(error.message || 'Your account could not be created. Please retry.')
      // Definite rejections before capture can be corrected. Uncertain responses
      // retain both the contact snapshot and key for safe retries.
      if ([400,403,410,429].includes(error.status) && !error.contactAccepted) { attempt.current = null; setLocked(false) }
    } finally { inFlight.current = false; setBusy(false) }
  }
  function accessBusy(value) { inFlight.current = value; setBusy(value) }
  async function signOut() {
    if (inFlight.current) return
    accessBusy(true); setMessage('')
    try {
      if (!context.preview) await recruitmentSignupRequest('sign_out', {}, options)
      setApplicant(null); setReviewing(false); setComplete(false); setLocked(false); setContact(emptyContact); setAccessMode(context.preview ? null : 'signin'); attempt.current = null
    } catch (error) { setMessage(error.message) }
    finally { accessBusy(false) }
  }
  function close() { if (!inFlight.current) { if (applicant && !applicant.applicationSubmitted && profileClose.current) { profileClose.current(); return }  setPassword(''); setVisiblePassword(false); onClose() } }
  return <Modal open={open} onClose={close} title={`Join ${brand}`} subtitle="Your next chapter starts here." className="recruitment-signup">
    <ol className="recruitment-signup__steps" aria-label="Application progress">{['Create account', 'Verify email', 'Your application', 'Review'].map((label, index) => <li key={label} aria-current={index === activeStep ? 'step' : undefined}><span>{index < activeStep ? <Check size={14} aria-hidden="true" /> : index + 1}</span>{label}</li>)}</ol>
    {!context && !contextError && <p role="status">Preparing your application…</p>}
    {contextError && <div role="alert"><p>{contextError}</p><button type="button" className="recruitment-signup__secondary" onClick={() => setReload((value) => value + 1)}>Try again</button></div>}
    {context && <>
      {applicant ? <>
        {applicant.applicationSubmitted ? <div className="recruitment-profile__complete" role="status"><h4>{applicant.submissionPreview ? 'Submission preview complete' : 'Application submitted'}</h4><p>{applicant.submissionPreview ? 'This is how the confirmation will look. Your answers have not been sent.' : `Your application has been received by ${brand}. The recruitment team will review it and contact you about the next steps.`}</p>{applicant.applicationSubmittedAt && !applicant.submissionPreview && <p>Submitted {new Date(applicant.applicationSubmittedAt).toLocaleString('en-ZA')}.</p>}<p>Submitting an application does not mean you have joined or been approved.</p><button className="recruitment-signup__submit" type="button" onClick={close}>Close</button></div> : <RecruitmentProfileQuestionnaire applicant={applicant} endpoint={endpoint} token={token} preview={context.preview} onSaved={setApplicant} onBusy={accessBusy} onClose={onClose} closeRequestRef={profileClose} onReviewChange={setReviewing} />}
        {message && <p role="alert">{message}</p>}
        <button className="recruitment-signup__account-action" type="button" disabled={busy} onClick={signOut}>{context.preview ? 'Restart preview' : 'Sign out of applicant account'}</button>
      </>
        : accessMode ? <><p className="recruitment-signup__note">{context.preview ? 'Preview only — your details have not been sent.' : complete ? 'Your contact details are saved' : 'Returning applicants can resume their saved enquiry.'}</p><RecruitmentApplicantAccess mode={accessMode} email={contact.email} submissionKey={attempt.current?.key} endpoint={endpoint} token={token} onVerified={setApplicant} onBusy={accessBusy} onMode={setAccessMode} delivery={delivery} parentBusy={busy} preview={context.preview} previewContact={context.preview ? contact : undefined} /><p className="recruitment-signup__note">Your full application has not been submitted.</p>{!complete && <button type="button" className="recruitment-signup__secondary" disabled={busy} onClick={() => setAccessMode(null)}>Start a new enquiry</button>}</>
        : complete ? <div className="recruitment-signup__receipt" role="status"><span className="recruitment-signup__receipt-icon"><Check size={24} aria-hidden="true" /></span><h4>{context.preview ? 'Preview complete' : 'Your contact details are saved'}</h4><p>{context.preview ? 'Explore the email verification step below. This preview sends no details or emails.' : `Your applicant account has been created and ${brand} has received your contact enquiry. Email verification is required before you can continue your application.`}</p><p className="recruitment-signup__note">Your full application has not been submitted.</p><button className="recruitment-signup__submit" type="button" onClick={close}>Done</button>{context.preview && <button className="recruitment-signup__secondary" type="button" onClick={() => setAccessMode('email')}>Preview email verification</button>}</div>
        : <form onSubmit={submit} noValidate aria-label="Create applicant account" aria-busy={busy}>
          <h4>Create your applicant account</h4><p className="recruitment-signup__intro">Start with your contact details. You’ll complete your personal and professional information after verifying your email.</p>
          <fieldset disabled={busy}>
            <div className="recruitment-signup__fields">{[['firstName','First name','text','given-name',60],['lastName','Surname','text','family-name',60],['email','Email address','email','email',254],['phone','Mobile number','tel','tel',50]].map(([key,label,type,autoComplete,maxLength]) => <label key={key}>{label} <span aria-hidden="true">*</span><input name={key} type={type} required autoComplete={autoComplete} maxLength={maxLength} value={contact[key]} readOnly={locked} onChange={(event) => change(key, event.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `signup-${key}-error` : undefined} />{errors[key] && <small id={`signup-${key}-error`} className="recruitment-signup__error">{errors[key]}</small>}</label>)}</div>
            <label>Password <span aria-hidden="true">*</span><div className="recruitment-signup__password"><input name="password" type={visiblePassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined })) }} aria-invalid={!!errors.password} aria-describedby="signup-password-help" /><button type="button" aria-label={visiblePassword ? 'Hide password' : 'Show password'} onClick={() => setVisiblePassword((value) => !value)}>{visiblePassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><small id="signup-password-help" className={errors.password ? 'recruitment-signup__error' : ''}>{errors.password || 'At least 8 characters. Use a password unique to your account.'}</small></label>
            <label className="recruitment-signup__consent"><input name="privacyAccepted" type="checkbox" required checked={contact.privacyAccepted} disabled={locked} onChange={(event) => change('privacyAccepted', event.target.checked)} aria-invalid={!!errors.privacyAccepted} /><span>{recruitmentContactConsent}</span></label>{errors.privacyAccepted && <p className="recruitment-signup__error">{errors.privacyAccepted}</p>}
            <input name="website" className="recruitment-signup__honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            {message && <p className="recruitment-signup__error" role="alert">{message}</p>}
            <button className="recruitment-signup__submit" type="submit">{busy ? 'Saving your details…' : context.preview ? 'Preview next step' : locked ? 'Retry account creation' : 'Create account & continue'}<ArrowRight size={18} aria-hidden="true" /></button>
            <button type="button" className="recruitment-signup__secondary" onClick={() => { setPassword(''); setAccessMode('signin'); setMessage('') }}>Already have an account? Sign in</button>
            <p className="recruitment-signup__note"><LockKeyhole size={14} aria-hidden="true" />Your password is used for account access. It is never saved in the agency’s CRM.</p>
          </fieldset>
        </form>}
    </>}
  </Modal>
}
