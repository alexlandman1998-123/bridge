import { useEffect, useRef, useState } from 'react'
import RecruitmentProfileReview from './RecruitmentProfileReview'
import { recruitmentSignupRequest } from '../../services/recruitmentSignupService'
import { callingCodes, initialRecruitmentProfile, normalizeRecruitmentProfile, profileFields, profilePages, recruitmentProfileErrors } from './recruitmentProfileModel'
import './RecruitmentProfileQuestionnaire.css'

function ProfileField({ name, value, onChange, error, validLicense }) {
  const field = profileFields[name], id = `recruitment-profile-${name}`
  const required = field.required || (validLicense && ['ffcNumber','ffcType'].includes(name))
  const props = {id,name,value,onChange:event=>onChange(name,event.target.value),required,maxLength:field.max,'aria-invalid':!!error,'aria-describedby':`${id}-help`}
  if (field.type === 'yesno') return <fieldset className="recruitment-profile__radio recruitment-profile__wide" aria-describedby={`${id}-help`}>
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
export default function RecruitmentProfileQuestionnaire({ applicant, endpoint, token, preview = false, onSaved, onBusy, onClose, closeRequestRef, onReviewChange }) {
  const [answers,setAnswers] = useState(()=>initialRecruitmentProfile(applicant))
  const [page,setPage] = useState(applicant.profile?.page || 0)
  const [revision,setRevision] = useState(applicant.profileRevision || 0)
  const [reviewEdit,setReviewEdit] = useState(false)
  const [completed,setCompleted] = useState(applicant.profile?.complete === true)
  const [errors,setErrors] = useState({}), [message,setMessage] = useState(''), [notice,setNotice] = useState(''), [conflict,setConflict] = useState(false), [busy,setBusy] = useState(false), [failedClose,setFailedClose] = useState(false)
  const working = useRef(false), heading = useRef(null)
  const saved = useRef(JSON.stringify({answers:initialRecruitmentProfile(applicant),page:applicant.profile?.page || 0}))
  const dirty = saved.current !== JSON.stringify({answers,page})
  useEffect(()=>{ heading.current?.focus();onReviewChange?.(completed) },[page,completed,onReviewChange])
  // The modal's close button also saves changed answers; a failed save stays visible.
  useEffect(()=>{
    if (!closeRequestRef) return undefined
    closeRequestRef.current = () => dirty ? save('save',true) : onClose()
    return ()=>{closeRequestRef.current=null}
  })
  function change(name,value) {
    setAnswers(current=>({...current,[name]:value,...(name==='licenseStatus' && value!=='valid'?{ffcNumber:'',ffcType:''}:{})}))
    setErrors(current=>({...current,[name]:undefined})); setCompleted(false); setNotice(''); setMessage('')
  }
  function showErrors(invalid) {
    setErrors(invalid)
    const first = Object.keys(invalid).find(key=>profileFields[key])
    if (first) setPage(profileFields[first].page)
    setMessage('Check the highlighted answers.')
  }
  async function save(intent, close = false) {
    if (working.current || conflict) return
    const invalid = { ...recruitmentProfileErrors(answers), ...recruitmentProfileErrors(answers,{page:intent==='continue'?page:undefined,required:intent!=='save'}) }
    if (Object.keys(invalid).length) { showErrors(invalid); setFailedClose(close); return }
    working.current=true;setBusy(true);onBusy(true);setMessage('');setNotice('');setFailedClose(false)
    try {
      const nextPage = intent==='continue'?Math.min(page+1,3):page
      const result = preview ? {saved:true,applicant:{...applicant,profile:{answers:normalizeRecruitmentProfile(answers),page:nextPage,complete:intent==='complete'},profileRevision:revision+1}}
        : await recruitmentSignupRequest('save_profile',{answers:normalizeRecruitmentProfile(answers),page,revision,intent},{endpoint,token})
      const updated = initialRecruitmentProfile(result.applicant)
      setAnswers(updated); setRevision(result.applicant.profileRevision); setPage(result.applicant.profile.page);setCompleted(result.applicant.profile.complete);setReviewEdit(false)
      saved.current=JSON.stringify({answers:updated,page:result.applicant.profile.page})
      onSaved(result.applicant)
      setNotice(preview?'Preview progress updated. Nothing has been sent.':'Your progress is saved. You can return to this enquiry later.')
      if (close) onClose()
    } catch (error) {
      if (error.errors) showErrors(error.errors)
      else setMessage(error.message)
      setConflict(error.conflict===true);setFailedClose(close)
    } finally {working.current=false;setBusy(false);onBusy(false)}
  }
  async function reloadSaved() {
    if (working.current) return
    working.current=true;setBusy(true);onBusy(true)
    try {
      const result=await recruitmentSignupRequest('resume',{}, {endpoint,token})
      if (!result.applicant) throw new Error('Sign in again to reopen your saved questionnaire.')
      const updated=initialRecruitmentProfile(result.applicant), nextPage=result.applicant.profile?.page || 0
      setAnswers(updated);setRevision(result.applicant.profileRevision || 0);setPage(nextPage);setCompleted(result.applicant.profile?.complete===true);setReviewEdit(false)
      saved.current=JSON.stringify({answers:updated,page:nextPage});setConflict(false);setErrors({});setMessage('');setNotice('Saved progress reloaded.');onSaved(result.applicant)
    } catch(error){setMessage(error.message)}
    finally{working.current=false;setBusy(false);onBusy(false)}
  }
  const groups = page===0?[['Personal information',Object.keys(profileFields).filter(key=>profileFields[key].page===0)]]
    : page===1?[['Contact information',Object.keys(profileFields).filter(key=>profileFields[key].page===1)]]
    : page===2?[['Professional information',['yearsExperience','licenseStatus',...(answers.licenseStatus==='valid'?['ffcNumber','ffcType']:[]),'propertiesListed','propertiesSold']],['Legal status',['southAfricanCitizen','sequestrationStatus']]]
    : [['Employment information',['currentEmployer','referralSource']],['Address information',['streetAddress','city','province','postalCode']],['Start date',['expectedStartDate']]]
  return <section className="recruitment-profile" aria-label="Applicant questionnaire">
    {completed && notice && <p className="recruitment-profile__save-status" role="status">{notice}</p>}
    {completed ? <RecruitmentProfileReview key={revision} applicant={{...applicant,profile:{...applicant.profile,answers},profileRevision:revision}} endpoint={endpoint} token={token} preview={preview} onSubmitted={onSaved} onBusy={onBusy} onClose={onClose} onReload={reloadSaved} onEdit={nextPage=>{setReviewEdit(true);setCompleted(false);setPage(nextPage);setErrors({});setMessage('');setNotice('')}} />
      : <form onSubmit={event=>{event.preventDefault();save(reviewEdit || page===3?'complete':'continue')}} noValidate aria-label="Applicant questionnaire form" aria-busy={busy}>
        <p className="recruitment-profile__part">Part {page<2?1:2} of 2 · Step {page+1} of 4</p>
        <h4 ref={heading} tabIndex={-1}>{profilePages[page]}</h4>
        <fieldset disabled={busy || conflict}>
          {groups.map(([label,keys])=><section key={label} className="recruitment-profile__group" aria-label={label}>{label!==profilePages[page] && <h5>{label}</h5>}<div className="recruitment-signup__fields">{keys.map(key=><ProfileField key={key} name={key} value={answers[key]} onChange={change} error={errors[key]} validLicense={answers.licenseStatus==='valid'} />)}</div></section>)}
          {page===2 && <p className="recruitment-signup__note">FFC details are self-declared and will be checked by the recruitment team.</p>}
          <p className="recruitment-profile__save-status" role={notice?'status':undefined}>{notice || 'You can save incomplete answers and return later.'}</p>
          <div className="recruitment-profile__actions">
            {page>0 && <button type="button" className="recruitment-signup__secondary recruitment-profile__back" onClick={()=>{setPage(page-1);setErrors({});setMessage('')}}>Back</button>}
            <div className="recruitment-profile__forward-actions">
              <button className="recruitment-signup__secondary" type="button" onClick={()=>save('save',true)}>Save & close</button>
              <button className="recruitment-signup__submit" type="submit">{busy?'Saving…':reviewEdit || page===3?'Save & review':'Save & continue'}</button>
            </div>
          </div>
        </fieldset>
      </form>}
    {message && <p className="recruitment-signup__error" role="alert">{message}</p>}
    {conflict && <><p>Reloading replaces your unsaved answers with the latest saved draft.</p><button type="button" disabled={busy} className="recruitment-signup__secondary" onClick={reloadSaved}>Reload saved draft</button></>}
    {failedClose && <button className="recruitment-signup__secondary" disabled={busy} type="button" onClick={onClose}>Close without saving changes</button>}
  </section>
}
