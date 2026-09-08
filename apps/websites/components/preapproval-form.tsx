'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { creditFields, debtFields, documentsFor, employmentDetails, employmentFields, expenseFields, incomeFields, initialApplication, personalFields, stageErrors, steps, totals, type Field, type PreapprovalApplication } from '@/lib/preapproval'
import styles from './preapproval-wizard.module.css'

const money = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
const descriptions = ['Start with the home and loan you have in mind. Estimates are fine at this stage.', 'Enter each applicant’s legal identity and contact details.', 'Tell your originator how you earn your income.', 'Build a clear picture of your monthly income and commitments.', 'Give your originator context for the credit assessment.', 'Let your originator know which supporting documents are ready.', 'Check your details before sending the application for assessment.']
function Fields({ fields, values, onChange, prefix }: { fields: Field[]; values: Record<string, string>; onChange: (key: string, value: string) => void; prefix: string }) {
  return <div className={styles.fields}>{fields.map(field => <label key={field.key} htmlFor={`${prefix}-${field.key}`}>{field.label}{field.optional && <span className={styles.optional}> (optional)</span>}{field.options ? <select id={`${prefix}-${field.key}`} name={`${prefix}-${field.key}`} value={values[field.key] || ''} onChange={e => onChange(field.key, e.target.value)} required={!field.optional}><option value="" disabled>Select an option</option>{field.options.map(value => <option key={value}>{value}</option>)}</select> : <input id={`${prefix}-${field.key}`} name={`${prefix}-${field.key}`} type={field.type || 'text'} value={values[field.key] || ''} onChange={e => onChange(field.key, e.target.value)} required={!field.optional} maxLength={240} min={field.type === 'number' ? 0 : undefined} max={field.type === 'number' ? field.max || 1_000_000_000 : undefined} step={field.type === 'number' ? 'any' : undefined} autoComplete="off" />}{field.hint && <small>{field.hint}</small>}</label>)}</div>
}

export function PreapprovalForm({ privacyPolicyUrl, agencyName, submissionEnabled }: { privacyPolicyUrl?: string; agencyName: string; submissionEnabled: boolean }) {
  const [application, setApplication] = useState<PreapprovalApplication>(initialApplication)
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'sending' | 'success'>('idle')
  const [reference, setReference] = useState('')
  const [attempted, setAttempted] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const key = useRef<string | null>(null)
  const financials = totals(application.applicants)
  useEffect(() => { if (attempted) heading.current?.focus() }, [step, attempted])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    if (step > 0 && status !== 'success') window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [step, status])
  function updateConsent(field: string, value: string | boolean) { key.current = null; setApplication(current => ({ ...current, consent: { ...current.consent, [field]: value } })) }
  function updateApplicant(index: number, field: string, value: string) {
    key.current = null
    setApplication(current => ({ ...current, applicants: current.applicants.map((a, i) => i === index ? { ...a, [field]: value } : a), consent: {} }))
  }
  function updatePlan(field: string, value: string) {
    key.current = null
    setApplication(current => ({ ...current, plan: { ...current.plan, [field]: value }, consent: {}, applicants: field === 'applicationType' ? value === 'Joint' ? [current.applicants[0], current.applicants[1] || {}] : current.applicants.slice(0, 1) : current.applicants }))
  }
  function navigate(next: number) { setErrors([]); setAttempted(true); setStep(next) }
  async function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === 'sending') return
    const issues = stageErrors(application, step)
    if (issues.length) { setErrors(issues); return }
    if (step < steps.length - 1) { navigate(step + 1); return }
    for (let index = 0; index < steps.length; index++) {
      const issues = stageErrors(application, index)
      if (issues.length) { navigate(index); setErrors(issues); return }
    }
    setStatus('sending'); setErrors([]); key.current ||= crypto.randomUUID()
    try {
      const response = await fetch('/api/preapproval', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ application, idempotencyKey: key.current, companyWebsite: new FormData(event.currentTarget).get('companyWebsite') }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.accepted !== true) throw new Error(result.error || 'We could not submit your application. Your details are still here; please try again.')
      setReference(result.reference || ''); setStatus('success'); setApplication(initialApplication()); key.current = null
    } catch (error) { setStatus('idle'); setErrors([error instanceof TypeError ? 'Please check your connection and try again. Your details are still here.' : error instanceof Error ? error.message : 'We could not submit the application. Please try again.']) }
  }
  if (status === 'success') return <section className={styles.success} role="status"><p className={styles.eyebrow}>APPLICATION RECEIVED</p><h2>One step closer to your next home.</h2><p>Your application has been received for your agency’s allocated bond originator to assess.</p>{reference && <p>Reference: <strong>{reference}</strong></p>}<p>Your originator will confirm the supporting documents and any further consent needed for credit checks. This is not an approval or loan offer.</p><a href="/properties?type=sale">Explore homes ↗</a></section>
  return <div className={styles.wizard}>
    <aside className={styles.sidebar}><p className={styles.eyebrow}>YOUR PREAPPROVAL APPLICATION</p><h2>A clearer path<br />to your next home.</h2><p>For {agencyName}’s allocated bond originator.</p><ol>{steps.map((title, i) => <li key={title} aria-current={step === i ? 'step' : undefined}><button type="button" disabled={i > step || status === 'sending'} onClick={() => navigate(i)}><span>{i < step ? '✓' : String(i + 1).padStart(2, '0')}</span>{title}</button></li>)}</ol><p className={styles.privateNote}>Your progress is kept only while this page is open. Refreshing or closing it clears your details.</p></aside>
    <form className={styles.form} onSubmit={advance} noValidate>
      <div hidden aria-hidden="true"><input name="companyWebsite" tabIndex={-1} autoComplete="off" /></div>
      <>{!submissionEnabled && <p className={styles.previewNotice}>Preview application — submission is not enabled yet. Please use sample details while exploring the steps.</p>}</><div className={styles.progress}><span>Step {step + 1} of {steps.length}</span><span>{Math.round(step / (steps.length - 1) * 100)}% of steps reached</span></div><progress max={steps.length} value={step + 1} aria-label="Application progress" />
      <h2 ref={heading} tabIndex={-1}>{steps[step]}</h2><p className={styles.description}>{descriptions[step]}</p>
      {step === 0 && <><Fields prefix="plan" values={application.plan} onChange={updatePlan} fields={[
        { key: 'applicationType', label: 'Applying on your own or jointly?', options: ['Individual', 'Joint'] },
        { key: 'stage', label: 'Where are you in your search?', options: ['Exploring my budget', 'Actively searching', 'Property identified', 'Offer submitted'] },
        { key: 'purpose', label: 'What will the property be used for?', options: ['Primary residence', 'Investment property', 'Second home'] },
        { key: 'firstHome', label: 'Is this your first home purchase?', options: ['Yes', 'No'] },
        { key: 'price', label: 'Target purchase price (R)', type: 'number' }, { key: 'deposit', label: 'Available deposit (R)', type: 'number', hint: 'Enter 0 if you plan to apply without a deposit.' },
        { key: 'depositSource', label: 'Where will the deposit come from?', options: ['Savings', 'Sale of an asset / property', 'Gift', 'Other', 'No deposit'] },
        { key: 'term', label: 'Preferred loan term (years)', type: 'number', max: 30, hint: 'From 5 to 30 years; subject to the lender’s criteria.' },
        { key: 'area', label: 'Preferred suburb / area' }, { key: 'propertyAddress', label: 'Property address or listing reference', optional: true },
      ]} /><div className={styles.callout}><span>Indicative bond requested</span><strong>{money(Math.max(0, Number(application.plan.price) - Number(application.plan.deposit)))}</strong><p>You can apply before finding a specific property.</p></div>{application.plan.applicationType === 'Joint' && <p className={styles.note}>Both applicants need to enter their own details and declarations. Switching back to individual removes the second applicant’s details.</p>}</>}
      {[1, 2, 3, 4].includes(step) && application.applicants.map((applicant, index) => <fieldset key={index} className={styles.applicant}><legend>{index === 0 ? 'Primary applicant' : 'Co-applicant'}{applicant.firstName ? ` · ${applicant.firstName}` : ''}</legend>
        {step === 1 && <Fields prefix={`a${index}`} values={applicant} onChange={(k, v) => updateApplicant(index, k, v)} fields={personalFields} />}
        {step === 2 && <Fields prefix={`a${index}`} values={applicant} onChange={(k, v) => updateApplicant(index, k, v)} fields={[...employmentFields, ...employmentDetails(applicant)]} />}
        {step === 3 && <><p className={styles.note}>Use monthly amounts and enter 0 where a category does not apply. Include only this applicant’s share of joint household costs. Avoid counting payroll deductions again.</p><h3>Income</h3><Fields prefix={`a${index}`} values={applicant} onChange={(k, v) => updateApplicant(index, k, v)} fields={incomeFields} /><h3>Living expenses</h3><Fields prefix={`a${index}`} values={applicant} onChange={(k, v) => updateApplicant(index, k, v)} fields={expenseFields} /><h3>Debt repayments</h3><Fields prefix={`a${index}`} values={applicant} onChange={(k, v) => updateApplicant(index, k, v)} fields={debtFields} /></>}
        {step === 4 && <Fields prefix={`a${index}`} values={applicant} onChange={(k, v) => updateApplicant(index, k, v)} fields={creditFields} />}
      </fieldset>)}
      {step === 3 && <div className={styles.callout}><span>Combined monthly position</span><dl><div><dt>Take-home + other income</dt><dd>{money(financials.income)}</dd></div><div><dt>Living expenses</dt><dd>{money(financials.expenses)}</dd></div><div><dt>Debt repayments</dt><dd>{money(financials.debt)}</dd></div><div><dt>Remaining before a new bond</dt><dd>{money(financials.remaining)}</dd></div></dl><p>This is a summary of your figures, not a lender affordability decision. It does not account for costs changing after your move.</p></div>}
      {step === 5 && <><div className={styles.callout}><h3>Prepare now. Share securely with your originator.</h3><p>Confirm what you have available. Your allocated originator will arrange secure document collection and confirm the exact documents required. Files are not uploaded on this page.</p></div>{application.applicants.map((applicant, i) => <fieldset key={i} className={styles.applicant}><legend>{applicant.firstName} {applicant.surname}</legend>{documentsFor(applicant).map(document => <label key={document.key} className={styles.document}>{document.label}<select value={application.documents[`${i}-${document.key}`] || ''} onChange={e => { key.current = null; setApplication(current => ({ ...current, documents: { ...current.documents, [`${i}-${document.key}`]: e.target.value }, consent: {} })) }}><option value="" disabled>Select availability</option><option>Ready</option><option>Will provide later</option></select></label>)}</fieldset>)}<p className={styles.note}>Document needs vary by employment and application type. <a href="https://www.ooba.co.za/faq/documents-needed-for-home-loan/" target="_blank" rel="noreferrer">Read the document guide ↗</a></p></>}
      {step === 6 && <><div className={styles.reviewSection}><h3>Buying plans <button type="button" onClick={() => navigate(0)}>Edit</button></h3><dl>{Object.entries(application.plan).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{({ applicationType: 'Application', stage: 'Buying stage', purpose: 'Purpose', price: 'Target price', deposit: 'Deposit', depositSource: 'Deposit source', term: 'Term (years)', area: 'Area', propertyAddress: 'Property', firstHome: 'First home' } as Record<string, string>)[label]}</dt><dd>{['price', 'deposit'].includes(label) ? money(Number(value)) : value}</dd></div>)}</dl></div>{application.applicants.map((applicant, i) => <div key={i} className={styles.reviewSection}><h3>{applicant.firstName} {applicant.surname}</h3>{[{ title: 'Personal details', stage: 1, fields: personalFields }, { title: 'Employment', stage: 2, fields: [...employmentFields, ...employmentDetails(applicant)] }, { title: 'Income and expenses', stage: 3, fields: [...incomeFields, ...expenseFields, ...debtFields] }, { title: 'Credit and assets', stage: 4, fields: creditFields }].map(group => <details key={group.title}><summary>{group.title}</summary><button type="button" onClick={() => navigate(group.stage)}>Edit {group.title.toLowerCase()}</button><dl>{group.fields.filter(f => applicant[f.key]).map(field => <div key={field.key}><dt>{field.label}</dt><dd>{field.key === 'identityNumber' ? `••••••${applicant[field.key].slice(-4)}` : applicant[field.key]}</dd></div>)}</dl></details>)}<details><summary>Document availability</summary><button type="button" onClick={() => navigate(5)}>Edit documents</button><dl>{documentsFor(applicant).map(document => <div key={document.key}><dt>{document.label}</dt><dd>{application.documents[`${i}-${document.key}`]}</dd></div>)}</dl></details></div>)}
      <div className={styles.callout}><h3>Sent to your allocated bond originator</h3><p>Your agency’s allocation determines who receives this application. Submission does not authorise an automatic credit check or guarantee approval. Your originator will explain any additional consent required.</p></div>
      {application.applicants.map((applicant, i) => <fieldset key={i} className={styles.applicant}><legend>Declarations · {applicant.firstName} {applicant.surname}</legend><label className={styles.consent}><input type="checkbox" checked={application.consent[`accuracy-${i}`] === true} onChange={e => updateConsent(`accuracy-${i}`, e.target.checked)} /><span>I am this applicant and confirm that the information I supplied is complete and accurate to the best of my knowledge.</span></label><label className={styles.consent}><input type="checkbox" checked={application.consent[`processing-${i}`] === true} onChange={e => updateConsent(`processing-${i}`, e.target.checked)} /><span>I agree that {agencyName} and its allocated bond originator may process and share this application with each other for my preapproval assessment and contact me about it.{privacyPolicyUrl && <> <a href={privacyPolicyUrl}>Privacy Policy</a>.</>}</span></label><Fields prefix={`sign${i}`} values={{ signature: String(application.consent[`signature-${i}`] || '') }} fields={[{ key: 'signature', label: 'Type your full name to confirm', hint: 'Each applicant must complete their own declaration.' }]} onChange={(_, value) => updateConsent(`signature-${i}`, value)} /></fieldset>)}
      <label className={styles.consent}><input type="checkbox" checked={application.consent.marketing === true} onChange={e => updateConsent('marketing', e.target.checked)} /><span>Send the primary applicant property news and updates (optional).</span></label></>}
      {errors.length > 0 && <div className={styles.errors} role="alert"><strong>Please check the following:</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
      <div className={styles.actions}>{step > 0 && <button type="button" disabled={status === 'sending'} onClick={() => navigate(step - 1)}>← Back</button>}<button type="submit" disabled={status === 'sending'} className={styles.primary}>{status === 'sending' ? 'Submitting…' : step === steps.length - 1 ? 'Submit for assessment →' : 'Continue →'}</button></div>
    </form>
  </div>
}
