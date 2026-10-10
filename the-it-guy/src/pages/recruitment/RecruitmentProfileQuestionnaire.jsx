import { useEffect, useRef, useState } from 'react'
import RecruitmentProfileReview from './RecruitmentProfileReview'
import RecruitmentApplicantAccess from './RecruitmentApplicantAccess'
import { recruitmentSignupRequest } from '../../services/recruitmentSignupService'
import { callingCodes, homeSeekersPackageNote, homeSeekersPackageOptions, initialRecruitmentProfile, normalizeRecruitmentProfile, profileFields, profilePages, recruitmentProfileErrors, recruitmentProfileSteps } from './recruitmentProfileModel'
import './RecruitmentProfileQuestionnaire.css'

function ProfileField({ name, value, onChange, error, validLicense }) {
  const field = profileFields[name], id = `recruitment-profile-${name}`
  const required = field.required || (validLicense && ['ffcNumber','ffcType'].includes(name))
  const props = {id,name,value,onChange:event=>onChange(name,event.target.value),required,maxLength:field.max,'aria-invalid':!!error,'aria-describedby':`${id}-help`}
  if (field.type === 'yesno') return <fieldset id={id} tabIndex={-1} className="recruitment-profile__radio recruitment-profile__wide" aria-describedby={`${id}-help`}>
    <legend>{field.label} <span aria-hidden="true">*</span></legend>
    <div className="recruitment-profile__radio-options">
      {['yes','no'].map(option=><label key={option}><input type="radio" name={name} value={option} checked={value===option} onChange={()=>onChange(name,option)} required aria-invalid={!!error} />{option==='yes'?'Yes':'No'}</label>)}
    </div>
    <small id={`${id}-help`} className="recruitment-signup__error">{error || ''}</small>
  </fieldset>
  const hint = name==='email' ? 'Verified email. Your account and saved enquiry use this address.' : name==='dateOfBirth' ? 'You must be at least 18 years old to apply.' : name==='ffcNumber' ? 'Fidelity Fund Certificate issued by the PPRA.' : field.type==='code' ? 'Choose a country code or enter another international code.' : field.type==='phone' ? 'Enter the number without the country code.' : field.type==='count' ? 'Whole numbers from 0 to 999, including zero.' : field.type==='postal' ? '4 or 5 digits only.' : field.type==='future' ? 'Choose a future date.' : !required ? 'Optional' : ''
  return <div className={['streetAddress','currentEmployer','referralSource'].includes(name)?'recruitment-profile__wide':undefined}>
    <label htmlFor={id}>{field.label}{required && <span aria-hidden="true"> *</span>}</label>
    {field.options ? <select {...props}><option value="">Select an option</option>{field.options.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      : <input {...props} type={['birth','future'].includes(field.type)?'date':field.type==='count'?'number':field.type==='email'?'email':['phone','code'].includes(field.type)?'tel':'text'} inputMode={['count','postal','phone'].includes(field.type)?'numeric':undefined} min={field.type==='count'?0:undefined} max={field.type==='count'?999:undefined} step={field.type==='count'?1:undefined} readOnly={name==='email'} list={field.type==='code'?`${id}-codes`:undefined} autoComplete={name==='firstName'?'given-name':name==='lastName'?'family-name':name==='email'?'email':name==='streetAddress'?'street-address':name==='postalCode'?'postal-code':name==='dateOfBirth'?'bday':'off'} />}
    {field.type==='code' && <datalist id={`${id}-codes`}>{callingCodes.map(([code,country])=><option key={code} value={code}>{country}</option>)}</datalist>}
    <small id={`${id}-help`} className={error?'recruitment-signup__error':undefined}>{error || hint}</small>
  </div>
}
function PackagePreference({value, onChange, error}) {
  const descriptions = ['Pay your fixed fee from registered deals.','Pay your fixed fee by monthly debit order.','Pay your fixed fee upfront for the year.','Discuss the options with Home Seekers before choosing.']
  return <fieldset id="recruitment-profile-packagePreference" tabIndex={-1} className="recruitment-profile__packages" aria-describedby="recruitment-package-note recruitment-package-error">
    <legend>Which Home Seekers option interests you?</legend>
    <p id="recruitment-package-note">{homeSeekersPackageNote}</p>
    <div>{homeSeekersPackageOptions.map(([key,label],index)=><label key={key}><input type="radio" name="packagePreference" value={key} checked={value===key} onChange={()=>onChange('packagePreference',key)} required aria-invalid={!!error} /><span><strong>{index<3?`Option ${index+1} · `:''}{label}</strong><small>{descriptions[index]}</small></span></label>)}</div>
    <small id="recruitment-package-error" className="recruitment-signup__error">{error || ''}</small>
  </fieldset>
}
export default function RecruitmentProfileQuestionnaire({ applicant, endpoint, token, preview = false, enhanced = false, homeSeekers = enhanced, submissionKey, onSaved, onBusy, onClose, closeRequestRef, onReviewChange }) {
  const needsPreference = homeSeekers && applicant.profile?.complete === true && !homeSeekersPackageOptions.some(([key])=>key===applicant.profile.answers?.packagePreference)
  const [answers,setAnswers] = useState(()=>initialRecruitmentProfile(applicant))
  const [page,setPage] = useState(needsPreference?3:applicant.profile?.page || 0)
  const [revision,setRevision] = useState(applicant.profileRevision || 0)
  const [reviewEdit,setReviewEdit] = useState(false)
  const [completed,setCompleted] = useState(applicant.profile?.complete === true && !needsPreference)
  const [furthestPage,setFurthestPage] = useState(needsPreference?3:applicant.profile?.page || 0)
  const [autoSaving,setAutoSaving] = useState(false), [saveProblem,setSaveProblem] = useState(false), [sessionExpired,setSessionExpired] = useState(false)
  const [savedAt,setSavedAt] = useState(applicant.profileSavedAt || '')
  const [errors,setErrors] = useState({}), [message,setMessage] = useState(''), [notice,setNotice] = useState(''), [conflict,setConflict] = useState(false), [busy,setBusy] = useState(false), [failedClose,setFailedClose] = useState(false)
  const working = useRef(false), heading = useRef(null), focusInvalid = useRef(false)
  const pending = useRef(null), exitAction = useRef(onClose), saveLatest = useRef(null), receiptKey = useRef(applicant.contactSubmissionKey || submissionKey)
  const latest = useRef(null)
  latest.current = { answers, page }
  const saved = useRef(JSON.stringify({answers:initialRecruitmentProfile(applicant),page:applicant.profile?.page || 0}))
  const dirty = saved.current !== JSON.stringify({answers:normalizeRecruitmentProfile(answers),page})
  useEffect(()=>{ heading.current?.focus();onReviewChange?.(completed) },[page,completed,onReviewChange])
  // The modal's close button also saves changed answers; a failed save stays visible.
  useEffect(()=>{
    if (!closeRequestRef) return undefined
    closeRequestRef.current = (afterSave = onClose) => {
      exitAction.current = afterSave
      if (!dirty && !pending.current) return afterSave()
      if (enhanced && (sessionExpired || conflict || saveProblem)) { setFailedClose(true); return }
      return save('save',true,false,afterSave)
    }
    return ()=>{closeRequestRef.current=null}
  })
  useEffect(() => {
    if (!enhanced || preview || (!dirty && !saveProblem)) return undefined
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [enhanced,preview,dirty,saveProblem])
  useEffect(() => {
    if (!enhanced || preview || !dirty || completed || busy || autoSaving || conflict || sessionExpired || saveProblem || Object.keys(recruitmentProfileErrors(answers,{homeSeekers})).length) return undefined
    const timer = setTimeout(() => saveLatest.current('save',false,true), 1500)
    return () => clearTimeout(timer)
  }, [enhanced,homeSeekers,preview,dirty,completed,busy,autoSaving,conflict,sessionExpired,saveProblem,answers,page,revision])
  useEffect(() => {
    if (!focusInvalid.current) return
    focusInvalid.current = false
    const first = Object.keys(errors).find(key => errors[key] && profileFields[key]?.page === page)
    if (first) document.getElementById(`recruitment-profile-${first}`)?.focus()
  }, [errors,page])
  function change(name,value) {
    setAnswers(current=>({...current,[name]:value,...(name==='licenseStatus' && value!=='valid'?{ffcNumber:'',ffcType:''}:{})}))
    setErrors(current=>({...current,[name]:undefined})); setCompleted(false); setNotice('')
    if (!enhanced || !pending.current) { setSaveProblem(false); setMessage('') }
  }
  function showErrors(invalid) {
    focusInvalid.current = true
    setErrors(invalid)
    const first = Object.keys(invalid).find(key=>profileFields[key])
    if (first) setPage(profileFields[first].page)
    setMessage('Check the highlighted answers.')
  }
  async function save(intent, close = false, automatic = false, afterSave = onClose, retry = false) {
    if (working.current || conflict || sessionExpired || (enhanced && pending.current && !retry)) return
    const attempt = retry ? pending.current : { answers:normalizeRecruitmentProfile(answers), page, revision, intent, close, automatic, afterSave, localSignature:JSON.stringify({answers,page}) }
    if (!attempt) return
    const invalid = { ...recruitmentProfileErrors(attempt.answers,{homeSeekers}), ...recruitmentProfileErrors(attempt.answers,{page:attempt.intent==='continue'?attempt.page:undefined,required:attempt.intent!=='save',homeSeekers}) }
    if (Object.keys(invalid).length) { showErrors(invalid); setFailedClose(close); return }
    if (enhanced) pending.current = attempt
    exitAction.current = attempt.afterSave
    working.current=true;setBusy(!attempt.automatic);setAutoSaving(attempt.automatic);onBusy(true);setMessage('');setNotice('');setFailedClose(false)
    let finish
    try {
      const nextPage = attempt.intent==='continue'?Math.min(attempt.page+1,3):attempt.page
      const result = preview ? {saved:true,applicant:{...applicant,profile:{answers:attempt.answers,page:nextPage,complete:attempt.intent==='complete'},profileRevision:attempt.revision+1}}
        : await recruitmentSignupRequest('save_profile',attempt,{endpoint,token})
      const updated = initialRecruitmentProfile(result.applicant)
      const unchanged = !enhanced || JSON.stringify(latest.current) === attempt.localSignature
      setRevision(result.applicant.profileRevision);setSavedAt(result.applicant.profileSavedAt || new Date().toISOString())
      if (unchanged) {
        if (!attempt.automatic) setAnswers(updated)
        setPage(result.applicant.profile.page);setFurthestPage(current=>Math.max(current,result.applicant.profile.page));setCompleted(result.applicant.profile.complete)
        if (!attempt.automatic) setReviewEdit(false)
      }
      saved.current=JSON.stringify({answers:updated,page:result.applicant.profile.page})
      pending.current=null;setSaveProblem(false)
      onSaved(result.applicant)
      setNotice(preview?'Preview progress updated. Nothing has been sent.':'Your progress is saved. You can return to this enquiry later.')
      if (attempt.close && unchanged) finish = attempt.afterSave
    } catch (error) {
      if (error.errors) showErrors(error.errors)
      else setMessage(error.message)
      if ([400,401,403,409,410,422].includes(error.status)) pending.current=null
      if (enhanced && error.status===401) setSessionExpired(true)
      setSaveProblem(enhanced && error.status!==401 && !error.conflict);setConflict(error.conflict===true);setFailedClose(attempt.close)
    } finally {working.current=false;setBusy(false);setAutoSaving(false);onBusy(false)}
    if (finish) await finish()
  }
  saveLatest.current = save
  function retrySave() {
    const attempt = pending.current
    if (attempt) save(attempt.intent,attempt.close,attempt.automatic,attempt.afterSave,true)
    else save('save')
  }
  function reopen(verified) {
    if (!receiptKey.current || verified.contactSubmissionKey !== receiptKey.current) {
      setMessage('This enquiry could not be reopened. Your unsaved answers are still here. Contact Home Seekers for help.');return
    }
    if (verified.applicationSubmitted) { onSaved(verified);return }
    const remote = initialRecruitmentProfile(verified)
    const remotePage = verified.profile?.page || 0
    setSessionExpired(false);setSaveProblem(false);setFailedClose(false);onSaved(verified)
    if ((verified.profileRevision || 0)!==revision || JSON.stringify({answers:remote,page:remotePage})!==saved.current) {
      setConflict(true);setMessage('Your saved draft changed while you were away. Reload it before continuing. Your unsaved answers are still visible.');return
    }
    setMessage('');setNotice('Email verified. You can continue with the answers already in this form.')
  }
  async function reloadSaved() {
    if (working.current) return
    working.current=true;setBusy(true);onBusy(true)
    try {
      const result=await recruitmentSignupRequest('resume',{}, {endpoint,token})
      if (!result.applicant) { if (enhanced) setSessionExpired(true); throw new Error('Verify your email again to reopen your saved questionnaire.') }
      if (enhanced && result.applicant.contactSubmissionKey !== receiptKey.current) throw new Error('This enquiry could not be reopened. Contact Home Seekers for help.')
      if (result.applicant.applicationSubmitted) { onSaved(result.applicant);return }
      const updated=initialRecruitmentProfile(result.applicant), remotePage=result.applicant.profile?.page || 0
      const missingPreference=homeSeekers && result.applicant.profile?.complete===true && !homeSeekersPackageOptions.some(([key])=>key===updated.packagePreference)
      const nextPage=missingPreference?3:remotePage
      setAnswers(updated);setRevision(result.applicant.profileRevision || 0);setPage(nextPage);setFurthestPage(nextPage);setCompleted(result.applicant.profile?.complete===true && !missingPreference);setReviewEdit(false);setSavedAt(result.applicant.profileSavedAt || '')
      saved.current=JSON.stringify({answers:updated,page:remotePage});pending.current=null;setConflict(false);setSaveProblem(false);setSessionExpired(false);setFailedClose(false);setErrors({});setMessage('');setNotice('Saved progress reloaded.');onSaved(result.applicant)
    } catch(error){setMessage(error.message)}
    finally{working.current=false;setBusy(false);onBusy(false)}
  }
  const groups = page===0?[['Personal information',Object.keys(profileFields).filter(key=>profileFields[key].page===0)]]
    : page===1?[['Contact information',Object.keys(profileFields).filter(key=>profileFields[key].page===1)]]
    : page===2?[['Professional information',['yearsExperience','licenseStatus',...(answers.licenseStatus==='valid'?['ffcNumber','ffcType']:[]),'propertiesListed','propertiesSold']],['Legal status',['southAfricanCitizen','sequestrationStatus']]]
    : [['Employment information',['currentEmployer','referralSource']],['Address information',['streetAddress','city','province','postalCode']],['Start date',['expectedStartDate']]]
  const steps = enhanced ? recruitmentProfileSteps(answers,{homeSeekers}) : []
  const firstIncomplete = steps.findIndex(step=>!step.complete)
  const reachablePage = Math.max(furthestPage,firstIncomplete<0?3:firstIncomplete)
  const actionsBlocked = busy || autoSaving || conflict || sessionExpired || saveProblem
  const draftStatus = preview ? 'Preview only. Your answers are not being saved.' : sessionExpired ? 'Verify your email again to save these answers.' : conflict ? 'The saved draft changed elsewhere. Your answers are still visible.' : autoSaving ? 'Saving draft…' : saveProblem ? 'Draft not saved. Your latest answers are still in this tab.' : dirty ? 'Unsaved changes. Valid answers save automatically after you pause.' : savedAt ? `Draft saved at ${new Date(savedAt).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'})}. You can return later.` : 'Your contact enquiry is saved. Questionnaire answers save automatically as you go.'
  function visit(nextPage) { setPage(nextPage);setFurthestPage(current=>Math.max(current,nextPage));setErrors({});setMessage('') }
  return <section className="recruitment-profile" aria-label="Applicant questionnaire">
    {enhanced && !completed && <nav aria-label="Questionnaire steps" className="recruitment-profile__navigation"><ol>{steps.map(step=><li key={step.page}><button type="button" disabled={actionsBlocked || step.page>reachablePage} aria-current={step.page===page?'step':undefined} onClick={()=>visit(step.page)}><span aria-hidden="true">{step.complete?'✓':step.page+1}</span>{step.label}<small>{step.complete?'Complete':step.page===page?'Current step':'Incomplete'}</small></button></li>)}</ol></nav>}
    {sessionExpired && <div className="recruitment-profile__recovery"><p role="alert">Your email session expired. Your unsaved answers are still in this form. Request an email code to continue.</p><RecruitmentApplicantAccess mode="email" email={applicant.contact.email} submissionKey={receiptKey.current} endpoint={endpoint} token={token} codeOnly emailLocked onVerified={reopen} onBusy={onBusy} onMode={()=>{}} preview={preview} /></div>}
    {completed && notice && <p className="recruitment-profile__save-status" role="status">{notice}</p>}
    {completed ? !sessionExpired && <RecruitmentProfileReview key={revision} applicant={{...applicant,profile:{...applicant.profile,answers},profileRevision:revision}} endpoint={endpoint} token={token} preview={preview} homeSeekers={homeSeekers} onSubmitted={onSaved} onBusy={onBusy} onClose={onClose} onReload={reloadSaved} onSessionExpired={enhanced?()=>setSessionExpired(true):undefined} onEdit={nextPage=>{setReviewEdit(true);setCompleted(false);visit(nextPage);setNotice('')}} />
      : <form onSubmit={event=>{event.preventDefault();save(reviewEdit || page===3?'complete':'continue')}} noValidate aria-label="Applicant questionnaire form" aria-busy={busy}>
        <p className="recruitment-profile__part">Part {page<2?1:2} of 2 · Step {page+1} of 4</p>
        <h4 ref={heading} tabIndex={-1}>{profilePages[page]}</h4>
        <fieldset disabled={busy || conflict || sessionExpired}>
          {groups.map(([label,keys])=><section key={label} className="recruitment-profile__group" aria-label={label}>{label!==profilePages[page] && <h5>{label}</h5>}<div className="recruitment-signup__fields">{keys.map(key=><ProfileField key={key} name={key} value={answers[key]} onChange={change} error={errors[key]} validLicense={answers.licenseStatus==='valid'} />)}</div></section>)}
          {homeSeekers && page===3 && <PackagePreference value={answers.packagePreference} onChange={change} error={errors.packagePreference} />}
          {page===2 && <p className="recruitment-signup__note">FFC details are self-declared and will be checked by the recruitment team.</p>}
          <p className="recruitment-profile__save-status" role={enhanced || notice?'status':undefined}>{enhanced?draftStatus:notice || 'You can save incomplete answers and return later.'}</p>
          <div className="recruitment-profile__actions">
            {page>0 && <button type="button" disabled={enhanced && actionsBlocked} className="recruitment-signup__secondary recruitment-profile__back" onClick={()=>visit(page-1)}>Back</button>}
            <div className="recruitment-profile__forward-actions">
              <button className="recruitment-signup__secondary" type="button" disabled={enhanced && actionsBlocked} onClick={()=>save('save',true)}>Save & close</button>
              <button className="recruitment-signup__submit" type="submit" disabled={enhanced && actionsBlocked}>{busy?'Saving…':reviewEdit || page===3?'Save & review':'Save & continue'}</button>
            </div>
          </div>
        </fieldset>
      </form>}
    {message && <p className="recruitment-signup__error" role="alert">{message}</p>}
    {enhanced && saveProblem && !conflict && <button className="recruitment-signup__secondary" type="button" disabled={busy || autoSaving} onClick={retrySave}>Retry saving draft</button>}
    {conflict && <><p>Reloading replaces your unsaved answers with the latest saved draft.</p><button type="button" disabled={busy} className="recruitment-signup__secondary" onClick={reloadSaved}>Reload saved draft</button></>}
    {failedClose && <button className="recruitment-signup__secondary" disabled={busy || autoSaving} type="button" onClick={()=>exitAction.current()}>Close without saving changes</button>}
  </section>
}
