import { Children, Fragment, isValidElement, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from 'lucide-react'
import { recruitmentIntakeRequest } from '../../services/recruitmentIntakeService'
import { applicationErrors, applicationSections, applicationSummary, applicationVersion, cpdStatuses, emptyRecruitmentApplication, ffcStatuses, learningStatuses, normalizeRecruitmentApplication, practitionerStatuses, qualificationRoutes } from './recruitmentApplicationModel'
import './RecruitmentApplicationPage.css'
function Answer({ field, label, value, onChange, error, options, type = 'text', hint, optional = false, multiline = false, maxLength = 254 }) {
  const props = { id: `join-${field}`, value, onChange: (event) => onChange(field, event.target.value), 'aria-invalid': Boolean(error), 'aria-describedby': hint || error ? `join-${field}-help` : undefined }
  return <div className={`join-field ${multiline || ['name', 'area'].includes(field) ? 'join-field-wide' : ''}`}><label htmlFor={props.id}>{label}{optional && <span>Optional</span>}</label>{options ? <select {...props}><option value="">Select an answer</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select> : multiline ? <textarea {...props} rows={4} maxLength={maxLength} /> : <input {...props} type={type} maxLength={maxLength} step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? '0' : undefined} />}{(hint || error) && <p id={`join-${field}-help`} className={error ? 'join-field-error' : 'join-hint'}>{error || hint}</p>}</div>
}
function readableForeground(hex) {
  const rgb = [1,3,5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? '#10241c' : '#fff'
}
function flattenQuestions(children) {
  return Children.toArray(children).filter(isValidElement).flatMap((child) => child.type === Fragment ? flattenQuestions(child.props.children) : [child])
}
function questionPages(questions, capacity, narrow) {
  const pages = []; let page = [], used = 0
  for (const question of questions) {
    const wide = narrow || question.type !== Answer || question.props.multiline || ['name', 'area'].includes(question.props.field)
    const cost = question.props.multiline ? 4 : wide ? 2 : 1
    if (used + cost > capacity && page.length) { pages.push(page); page = []; used = 0 }
    page.push(question); used += cost
  }
  if (page.length) pages.push(page)
  return pages
}

export function RecruitmentApplicationForm({ branding, token, preview = false, onSubmit = (payload) => recruitmentIntakeRequest(token, payload) }) {
  const [answers, setAnswers] = useState(emptyRecruitmentApplication)
  const [part, setPart] = useState(0)
  const [viewport, setViewport] = useState(() => ({ narrow: window.innerWidth <= 760, short: window.innerHeight < 680 }))
  useEffect(() => { const resize = () => { setViewport({ narrow: window.innerWidth <= 760, short: window.innerHeight < 680 }); setPart(0) }; window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize) }, [])
  const [step, setStep] = useState(0), [errors, setErrors] = useState({}), [error, setError] = useState(''), [busy, setBusy] = useState(false), [submitted, setSubmitted] = useState(false)
  const submissionKey = useRef(crypto.randomUUID()), pending = useRef(false), mounted = useRef(true), heading = useRef(null)
  const [companyWebsite, setCompanyWebsite] = useState('')
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { heading.current?.focus() }, [step, part, submitted])
  const change = (key, value) => { setAnswers((previous) => ({ ...previous, [key]: value })); setErrors((previous) => ({ ...previous, [key]: undefined })); setError('') }
  const field = (key, label, extra = {}) => <Answer key={key} field={key} label={label} value={answers[key]} onChange={change} error={errors[key]} {...extra} />
  const capacity = viewport.narrow ? 6 : viewport.short ? 6 : 8
  const questions = [
<>{field('name','Full name', { maxLength: 120 })}{field('email','Email address', { type: 'email' })}{field('phone','Mobile number', { type: 'tel', maxLength: 50 })}{field('area','Areas you work in / want to cover', { hint: 'Add suburbs, towns or regions, separated by commas.' })}{field('preferredStartDate','Preferred joining date', { type: 'date', optional: true })}</>,
<>{field('currentAgency','Current agency', { optional: true, maxLength: 160 })}{field('yearsExperience','Years in real estate', { type: 'number', hint: 'Enter 0 if you are new to the industry.' })}{field('dealsPerMonth','Average deals per month', { type: 'number', hint: 'Your average completed deals over the last 12 months. Enter 0 if you are new.' })}{field('currentSplit','Current commission split — % you keep', { type: 'number', optional: true })}{field('activeMandates','Do you have active mandates?', { options: [['yes','Yes'],['no','No']] })}{answers.activeMandates === 'yes' && <>{field('mandateCount','Number of active mandates', { type: 'number' })}{field('handoverNotes','Notice and mandate handover obligations', { multiline: true, maxLength: 1000, hint: 'Share the arrangements to consider, without client names, addresses or mandate documents.' })}</>}{field('motivation','What are you looking for in your next agency?', { multiline: true, maxLength: 1500 })}</>,
<>{field('practitionerStatus','Your practitioner status', { options: practitionerStatuses })}{answers.practitionerStatus && answers.practitionerStatus !== 'new_entrant' && <>{field('ppraNumber','PPRA registration / reference number', { optional: true, maxLength: 80 })}{field('ffcStatus','FFC status', { options: ffcStatuses })}{['current','expired'].includes(answers.ffcStatus) && <>{field('ffcNumber','FFC number', { maxLength: 80 })}{field('ffcExpiry','FFC expiry date', { type: 'date' })}</>}</>}{answers.practitionerStatus === 'new_entrant' && <p className="join-info">You can apply as a new entrant. The team will discuss your registration and training route with you.</p>}{field('qualificationRoute','Real estate qualification route', { options: qualificationRoutes })}{field('qualificationStatus','Qualification progress', { options: learningStatuses })}{field('pdeStatus','Professional Designation Examination (PDE)', { options: learningStatuses })}{field('practicalStatus','Practical / workplace training', { options: learningStatuses })}{field('cpdStatus','Continuing Professional Development (CPD)', { options: cpdStatuses })}{field('qualificationNotes','Anything else about your education or registration?', { optional: true, multiline: true, maxLength: 1000 })}<p className="join-info">These answers help the team review your profile. Supporting certificates and any exemptions will be checked during onboarding.</p></>
  ]
  const pages = step < 3 ? questionPages(flattenQuestions(questions[step]), capacity, viewport.narrow) : []
  const summary = applicationSummary({ version: applicationVersion, answers: normalizeRecruitmentApplication(answers) }, true).flatMap(([label, value]) => {
    const text = String(value || '')
    return Array.from({ length: Math.max(1, Math.ceil(text.length / 120)) }, (_, index) => [index ? `${label} · continued ${index + 1}` : label, text.slice(index * 120, (index + 1) * 120)])
  })
  const reviewSize = viewport.narrow ? 2 : 4
  const reviewPages = Math.ceil(summary.length / reviewSize)
  const pageCount = step < 3 ? pages.length : reviewPages + 1
  const currentPart = Math.min(part, pageCount - 1)
  const lastPart = currentPart === pageCount - 1
  const visibleFields = pages[currentPart]
  const reviewRows = summary.slice(currentPart * reviewSize, (currentPart + 1) * reviewSize)
  const goToStep = (value) => { setStep(value); setPart(0); setErrors({}); setError('') }
  const primary = /^#[a-f0-9]{6}$/i.test(branding.primaryColour) ? branding.primaryColour : '#153c35'
  const logo = readableForeground(primary) === '#fff' ? branding.logoDarkUrl || branding.logoLightUrl : branding.logoLightUrl || branding.logoDarkUrl
  async function advance(event) {
    event.preventDefault()
    if (pending.current) return
    const allErrors = applicationErrors(answers, step === 3 ? undefined : step)
    const visibleKeys = new Set((visibleFields || []).map((question) => question.props.field).filter(Boolean))
    const validation = !lastPart ? step === 3 ? {} : Object.fromEntries(Object.entries(allErrors).filter(([key]) => visibleKeys.has(key))) : allErrors
    setErrors(validation)
    if (Object.keys(validation).length) {
      const invalidField = Object.keys(validation)[0]
      const firstSection = applicationSections.findIndex((_, index) => Object.hasOwn(applicationErrors(answers, index), invalidField))
      const invalidStep = step === 3 && firstSection >= 0 ? firstSection : step
      if (invalidStep < 3) {
        const invalidPages = questionPages(flattenQuestions(questions[invalidStep]), capacity, viewport.narrow)
        setStep(invalidStep); setPart(Math.max(0, invalidPages.findIndex((page) => page.some((question) => question.props.field === invalidField))))
      }
      setError('Please check the highlighted answers.'); return
    }
    if (!lastPart) { setError(''); setPart(currentPart + 1); return }
    if (step < 3) { goToStep(step + 1); return }
    if (preview) return
    pending.current = true; setBusy(true); setError('')
    try {
      const result = await onSubmit({ action: 'submit', answers: normalizeRecruitmentApplication(answers), submissionKey: submissionKey.current, companyWebsite })
      if (result?.accepted !== true) throw new Error('Your application could not be recorded. Please try again.')
      if (mounted.current) setSubmitted(true)
    } catch (failure) { if (mounted.current) setError(failure.message || 'Your answers are still here. Please try again.') }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return <div className="recruitment-application" style={{ '--join-brand': primary, '--join-brand-text': readableForeground(primary), '--join-accent': /^#[a-f0-9]{6}$/i.test(branding.accentColour) ? branding.accentColour : '#d4e9dc' }}>
    <main className="join-layout"><aside className="join-intro"><div className="join-brand">{logo ? <img src={logo} referrerPolicy="no-referrer" alt={branding.organisationName} /> : <span className="join-logo-fallback" aria-label={branding.organisationName}>{branding.organisationName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('')}</span>}</div><div className="join-intro-top"><span className="join-intro-mark"><ArrowRight size={20} /></span><p className="join-eyebrow">YOUR NEXT CHAPTER</p></div><h1>Your next move.<br /><span>Your future.</span></h1><p>Bring your ambition. Tell us about the agent you are — and where you want to go.</p><div className="join-intro-guide"><div><span>01</span><p><strong>Introduce yourself</strong>Share your details and the areas you cover.</p></div><div><span>02</span><p><strong>Tell your story</strong>Your experience, goals and practitioner profile.</p></div><div><span>03</span><p><strong>Start a conversation</strong>The recruitment team reviews your application.</p></div></div><div className="join-intro-bottom"><div className="join-assurance"><CheckCircle2 size={17} /><span>4 short steps · No account needed</span></div><p className="join-footnote">{preview ? 'This preview does not send your answers.' : 'Your application goes directly to the recruitment team.'}</p></div></aside>
      <section className="join-card">{preview && <p role="status" className="join-preview-note">Preview · Applications cannot be submitted from this preview.</p>}{submitted ? <div className="join-success"><CheckCircle2 size={48} /><p className="join-eyebrow">APPLICATION RECEIVED</p><h2 ref={heading} tabIndex={-1}>Thank you for introducing yourself.</h2><p>The team at {branding.organisationName} will review your application and contact you about the next steps.</p><p className="join-hint">Your application has been submitted. Joining and agent activation follow the organisation’s review and onboarding process.</p></div> : <>
        <ol className="join-steps" aria-label="Application progress">{applicationSections.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={index === step ? 'current' : index < step ? 'complete' : ''}><span>{index < step ? <Check size={15} /> : index + 1}</span><small>{label}</small></li>)}</ol>
        <div className="join-step-title"><p className="join-eyebrow">STEP {step + 1} OF 4{pageCount > 1 && ` · PART ${currentPart + 1} OF ${pageCount}`}</p><h2 ref={heading} tabIndex={-1}>{['Let’s start with you.', 'Your experience. Your ambition.', 'Your practitioner profile.', 'Ready to introduce yourself?'][step]}</h2><p>{['Share your contact details and the areas you’d like to cover.', 'Help us understand your business and what you’re looking for.', 'New to the industry or experienced — tell us where you are today.', 'Review your answers before sending them to the team.'][step]}</p></div>
        {error && <p role="alert" className="join-alert">{error}</p>}
        <form onSubmit={advance} noValidate><fieldset disabled={busy} className="join-fields">
          {step === 0 && visibleFields}

          {step === 1 && visibleFields}

          {step === 2 && visibleFields}

          {step === 3 && (lastPart ? <><p className="join-info">Your answers are ready. Confirm the declarations below to send your application to {branding.organisationName}.</p><label className="join-consent"><input type="checkbox" checked={answers.privacyAccepted} onChange={(event) => change('privacyAccepted', event.target.checked)} /><span>I agree that {branding.organisationName} may use these answers to assess my application and contact me about recruitment.</span></label>{errors.privacyAccepted && <p className="join-field-error">{errors.privacyAccepted}</p>}<label className="join-consent"><input type="checkbox" checked={answers.declarationAccepted} onChange={(event) => change('declarationAccepted', event.target.checked)} /><span>My answers are accurate to the best of my knowledge. I understand that this application is subject to review.</span></label>{errors.declarationAccepted && <p className="join-field-error">{errors.declarationAccepted}</p>}</> : <div className="join-review"><dl>{reviewRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><button type="button" className="join-edit" onClick={() => goToStep(0)}>Edit contact details</button><button type="button" className="join-edit" onClick={() => goToStep(1)}>Edit experience and practitioner details</button></div>)}
          <label className="join-honeypot" aria-hidden="true">Company website<input tabIndex={-1} autoComplete="off" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} /></label>
        </fieldset><footer className="join-actions">{step > 0 || currentPart > 0 ? <button type="button" disabled={busy} className="join-back" onClick={() => { if (currentPart > 0) setPart(currentPart - 1); else goToStep(step - 1); setError('') }}><ArrowLeft size={16} /> Back</button> : <span className="join-hint">No account required</span>}<button className="join-next" disabled={busy || (preview && step === 3 && lastPart)} type="submit">{busy ? 'Submitting…' : step === 3 && lastPart ? preview ? 'Preview only' : 'Submit application' : 'Continue'}{!busy && <ArrowRight size={16} />}</button></footer></form>
      </>}</section>
    </main>
  </div>
}
function ApplicationLoader({ token }) {
  const [context, setContext] = useState(null), [error, setError] = useState(''), [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    const meta = document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer'; document.head.append(meta)
    recruitmentIntakeRequest(token, { action: 'context' }).then((result) => { if (active) setContext(result) }).catch((failure) => { if (active) setError(failure.message) })
    return () => { active = false; meta.remove() }
  }, [token, reload])
  if (error) return <main className="recruitment-application join-loading"><h1>Unable to open this application</h1><p role="alert">{error}</p><button onClick={() => { setContext(null); setError(''); setReload((value) => value + 1) }}>Try again</button></main>
  if (!context) return <main className="recruitment-application join-loading" role="status">Preparing your application…</main>
  if (context.submitted) return <main className="recruitment-application join-loading"><h1>Application already received</h1><p>The team at {context.branding.organisationName} has your application. Contact the organisation if you need to correct an answer.</p></main>
  return <RecruitmentApplicationForm key={token} token={token} branding={context.branding} preview={context.preview === true} />
}

export default function RecruitmentApplicationPage() {
  const { token } = useParams()
  return <ApplicationLoader key={token} token={token} />
}
