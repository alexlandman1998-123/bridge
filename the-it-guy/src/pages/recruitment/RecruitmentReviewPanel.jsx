import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Download, FileText, Save, X } from 'lucide-react'
import { applicationSummary } from './recruitmentApplicationModel'
import { homeSeekersRecruitmentOrganisationId, recruitmentDocumentPresentation, recruitmentDocumentsComplete } from './recruitmentDocumentsModel'
import { recruitmentReviewChecks, recruitmentReviewErrors, recruitmentReviewSummary, reviewStatuses, documentReviewStatuses } from './recruitmentReviewModel'

const date = (value) => value ? new Date(value).toLocaleString('en-ZA', {timeZone:'Africa/Johannesburg'}) : '—'
const steps = ['Documents', 'Application checks', 'Outcome']
const recorded = (item) => item?.status !== 'pending' && typeof item?.notes === 'string' && item.notes.length <= 2000 && (item.status !== 'needs_information' || item.notes.trim().length >= 5)
const declarationLabels = {
  registration:['Practitioner status','PPRA reference','FFC status','FFC number / expiry','License status','FFC number','FFC practitioner type','South African citizen','Currently under sequestration or administration'],
  qualifications:['Qualification route','Qualification status','PDE','Education notes'],
  training:['Practical training','CPD'],
  handover:['Current agency','Current brokerage / employer','Active mandates','Mandate handover','Preferred start date','Expected start date','Home Seekers package preference'],
}
const firstStep = (draft) => {
  if (Object.values(draft.checks).every(recorded) && draft.documents.every(recorded)) return 2
  return draft.documents.every(recorded) ? 1 : 0
}

function ReviewStatus({ status, document = false }) {
  const label = ['verified', 'reviewed'].includes(status) ? 'Approved' : status === 'needs_information' ? 'Rejected' : (document ? documentReviewStatuses : reviewStatuses).find(([value]) => value === status)?.[1] || 'Pending'
  return <span className={`recruitment-review__status recruitment-review__status--${status}`}>
    {['verified', 'reviewed'].includes(status) && <Check size={12} aria-hidden="true" />}{label}
  </span>
}

function ReviewFields({ label, value, onChange, document = false, attempted = false }) {
  const helpId = useId()
  const resultHelpId = useId()
  const approvedStatus = document ? 'reviewed' : 'verified'
  const rejected = value.status === 'needs_information'
  const missingStatus = attempted && value.status === 'pending'
  const missingNotes = (attempted || value.status !== 'pending') && !recorded(value) && value.status !== 'pending'
  const resultHelp = missingStatus ? 'Choose Approve or Reject.' : value.status === 'not_applicable' ? 'Saved result: Not applicable.' : ''
  const notesHelp = missingNotes ? rejected ? 'Add a rejection reason of at least 5 characters.' : 'Keep notes to 2,000 characters.' : rejected ? 'A rejection reason is required.' : ''
  return <div className="recruitment-review__fields">
    <div className="recruitment-review__result"><span>Result</span><div role="group" aria-label={`${label} result`} aria-invalid={missingStatus || undefined} aria-describedby={resultHelp ? resultHelpId : undefined} className="recruitment-review__result-buttons">
      <button type="button" className="recruitment-review__approve-result" aria-label={`Approve ${label}`} aria-pressed={value.status === approvedStatus} onClick={() => onChange({status:approvedStatus})}><Check size={15} aria-hidden="true" />Approve</button>
      <button type="button" className="recruitment-review__reject-result" aria-label={`Reject ${label}`} aria-pressed={rejected} onClick={() => onChange({status:'needs_information'})}><X size={15} aria-hidden="true" />Reject</button>
    </div>{resultHelp && <small id={resultHelpId} className={missingStatus ? 'recruitment-review__field-error' : ''}>{resultHelp}</small>}</div>
    <label><span>{rejected ? 'Reason for rejection' : 'What did you check? (optional)'}</span><textarea aria-label={`${label} findings`} aria-describedby={notesHelp ? helpId : undefined} aria-invalid={missingNotes || undefined} aria-required={rejected || undefined} rows={2} maxLength={2000} value={value.notes} onChange={(event) => onChange({notes:event.target.value})} placeholder={rejected ? 'Explain why this item was rejected and what needs to be corrected.' : 'Add a note if needed.'} />{notesHelp && <small id={helpId} className={missingNotes ? 'recruitment-review__field-error' : ''}>{notesHelp}</small>}</label>
  </div>
}

export default function RecruitmentReviewPanel({ lead, draft, onChange, onStart, onSave, onDownload, onReject, busy, dirty, detailsDirty, panelRef, children }) {
  const [step, setStep] = useState(() => firstStep(draft))
  const [attempted, setAttempted] = useState(-1)
  const [alert, setAlert] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const headingRef = useRef(null)
  const alertRef = useRef(null)
  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current !== step) {
      headingRef.current?.focus()
      headingRef.current?.scrollIntoView?.({block:'start'})
    }
    previousStep.current = step
  }, [step])
  useEffect(() => { if (alert) alertRef.current?.focus() }, [alert])
  if (!lead.application_submitted_at || !['application_submitted','documents_uploaded','under_review','application_approved','contract_sent','contract_signed','onboarding_complete','agent_activated','closed_lost'].includes(lead.status)) return null
  const summary = recruitmentReviewSummary(lead)
  const active = lead.status === 'under_review'
  const pending = busy || saving
  const locked = !active || pending || detailsDirty
  const documents = lead.documents_json || []
  const checks = recruitmentReviewChecks(lead)
  const checkedDocuments = draft.documents.filter(recorded).length
  const checkedChecks = checks.filter(({key}) => recorded(draft.checks[key])).length
  const complete = [draft.documents.every(recorded), checks.every(({key}) => recorded(draft.checks[key]))]
  const savedReady = lead.review_status === 'ready_for_approval' && summary.status === 'ready_for_approval' && !dirty
  const homeSeekers = lead.organisation_id === homeSeekersRecruitmentOrganisationId
  const category = (document) => recruitmentDocumentPresentation(document.type || 'Additional documents', homeSeekers).title
  const documentLabel = (document) => `${category(document)} (${document.name})`
  const declarations = applicationSummary(lead.application_json, true)
  const updateCheck = (key, patch) => onChange({...draft, checks:{...draft.checks,[key]:{...draft.checks[key],...patch}}})
  const updateDocument = (path, patch) => onChange({...draft, documents:draft.documents.map((item) => item.path === path ? {...item,...patch} : item)})
  const unfinished = [...checks.filter(({key}) => !recorded(draft.checks[key])).map(({label}) => label), ...documents.filter((document) => !recorded(draft.documents.find((item) => item.path === document.path))).map(documentLabel)]
  const followUps = [...checks.filter(({key}) => draft.checks[key].status === 'needs_information').map(({key,label}) => [label,draft.checks[key].notes]), ...documents.filter((document) => draft.documents.find((item) => item.path === document.path)?.status === 'needs_information').map((document) => [documentLabel(document),draft.documents.find((item) => item.path === document.path).notes])]

  function goTo(next) {setAlert(''); setAttempted(-1); setStep(next)}
  function next() {
    if (active && !complete[step]) {
      setAttempted(step)
      setAlert(step === 0 ? 'Choose Approve or Reject for each file before continuing. Rejected files need a reason.' : 'Choose Approve or Reject for each application check before continuing. Rejected checks need a reason.')
      return
    }
    goTo(Math.min(2, step + 1))
  }
  async function save(event) {
    event.preventDefault()
    if (locked || savingRef.current || !dirty) return
    const errors = recruitmentReviewErrors(draft, lead)
    if (errors.length) {setAlert(errors.join(' ')); return}
    savingRef.current = true
    setSaving(true); setAlert('')
    try {await onSave(draft)}
    catch (error) {setAlert(error.message || 'The review could not be saved. Your findings are still here.')}
    finally {savingRef.current = false; setSaving(false)}
  }

  return <section ref={panelRef} className="recruitment-review recruitment-review--guided" aria-label="Application review">
    <header className="recruitment-ci-review recruitment-review__header">
      <div className="recruitment-review__title-row">
        <div className="recruitment-review__title"><ClipboardCheck size={24} aria-hidden="true" /><div><h3>Application review</h3><p>Work through three steps. Save your review before recording a decision.</p></div></div>
        <span className="recruitment-review__header-status">{lead.approved_at ? 'Review preserved' : dirty ? 'Unsaved changes' : summary.label}</span>
      </div>
      {lead.review_started_at && <div className="recruitment-review__progress">
        <span><strong>{checkedDocuments} / {documents.length}</strong> files checked</span>
        <span><strong>{checkedChecks} / {checks.length}</strong> checks recorded</span>
        <span className="recruitment-review__audit">Last saved {date(lead.review_updated_at)}</span>
      </div>}
      {['application_submitted','documents_uploaded'].includes(lead.status) && <div className="recruitment-review__start">
        <button type="button" className="recruitment-ci-review-button recruitment-ci-focus" disabled={pending || detailsDirty || !recruitmentDocumentsComplete(lead)} onClick={onStart}>Start review</button>
        <p>Begin with the applicant’s document pack.</p>
      </div>}
    </header>
    {lead.review_started_at && <div className="recruitment-review__body">
      {lead.approved_at && <p className="recruitment-review__notice">This review is preserved with the approval decision.</p>}
      {lead.status === 'closed_lost' && !lead.approved_at && <p className="recruitment-review__notice">This lead is closed. Reopen it to continue the saved review.</p>}
      <nav className="recruitment-review__steps" aria-label="Review steps">{steps.map((title, index) => <button key={title} type="button" aria-current={step === index ? 'step' : undefined} disabled={pending} onClick={() => goTo(index)}><span aria-hidden="true">{index < 2 && complete[index] ? <Check size={15} aria-hidden="true" /> : index + 1}</span>{title}</button>)}</nav>
      <div ref={headingRef} tabIndex={-1} className="recruitment-review__step-heading"><p>Step {step + 1} of 3</p><h4>{['Check the documents','Confirm the application details','Record the outcome'][step]}</h4>{step !== 1 && <span>{step === 0 ? 'Download each file and choose Approve or Reject. Add notes if needed.' : 'Check the summary and save the review.'}</span>}</div>
      {alert && <p ref={alertRef} tabIndex={-1} role="alert" className="recruitment-review__alert">{alert}</p>}
      <form onSubmit={save}>
        <section hidden={step !== 0} aria-label="Document review">
          {!documents.length && <p className="recruitment-review__empty">No files are attached to this application. Continue to the application checks and record any missing evidence there.</p>}
          <div className="recruitment-review__list">{documents.map((document) => {
            const review = draft.documents.find((item) => item.path === document.path) || {status:'pending',notes:''}
            return <article key={document.path} className="recruitment-review__document recruitment-review__document--guided" aria-label={documentLabel(document)}>
              <div className="recruitment-review__document-heading"><span className="recruitment-review__file-icon"><FileText size={19} aria-hidden="true" /></span><div><h5>{category(document)}</h5><p>{document.name}</p><button type="button" className="recruitment-documents__download" aria-label={`Download ${documentLabel(document)}`} disabled={pending} onClick={() => onDownload(document)}><Download size={15} aria-hidden="true" /><span>Download file</span></button></div></div>
              <fieldset disabled={locked}><ReviewFields document label={documentLabel(document)} value={review} attempted={attempted === 0} onChange={(patch) => updateDocument(document.path, patch)} /></fieldset>
            </article>
          })}</div>
        </section>
        <section hidden={step !== 1} aria-label="Review checklist">
          <div className="recruitment-review__list">{checks.map((requirement, index) => {
            const check = draft.checks[requirement.key]
            const answers = declarations.filter(([label]) => declarationLabels[requirement.key].includes(label))
            return <article key={requirement.key} className="recruitment-review__application-check" aria-label={requirement.label}>
              <header><span className="recruitment-review__number">{recorded(check) ? <Check size={15} aria-hidden="true" /> : index + 1}</span><div><h5>{requirement.label}</h5></div><ReviewStatus status={check.status} /></header>
              <div className="recruitment-review__declarations"><p>Applicant details</p>{answers.length ? <dl>{answers.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not supplied'}</dd></div>)}</dl> : <span>Not captured in the application.</span>}</div>
              <fieldset disabled={locked}><ReviewFields label={requirement.label} value={check} attempted={attempted === 1} onChange={(patch) => updateCheck(requirement.key, patch)} /></fieldset>
            </article>
          })}</div>
        </section>
        <section hidden={step !== 2} aria-label="Review outcome">
          <div className="recruitment-review__outcome"><div><h5>{unfinished.length ? 'There is still work to finish' : followUps.length ? 'Some items were rejected' : 'The checks are complete'}</h5><p>{unfinished.length ? 'Finish these items in Documents or Application checks. You can save a partial review and return later.' : followUps.length ? 'Save the findings and resolve the rejected items below before approving the application.' : dirty ? 'Save the review to make the application ready for a decision.' : savedReady ? 'The saved review is ready. Record your approval below or reject the application.' : 'The recorded findings are preserved.'}</p></div>
            {unfinished.length > 0 && <ul>{unfinished.map((label) => <li key={label}>{label}</li>)}</ul>}
            {!unfinished.length && followUps.length > 0 && <dl>{followUps.map(([label,notes]) => <div key={label}><dt>{label}</dt><dd>{notes}</dd></div>)}</dl>}
          </div>
          <div className="recruitment-review__outcome-summary"><section><h5>Application checks</h5>{checks.map(({key,label}) => <div key={key}><span>{label}</span><ReviewStatus status={draft.checks[key].status} /></div>)}</section><section><h5>Document pack</h5>{documents.map((document) => <div key={document.path}><span>{category(document)}</span><ReviewStatus document status={draft.documents.find((item) => item.path === document.path)?.status || 'pending'} /></div>)}{!documents.length && <p>No files attached</p>}</section></div>
        </section>
        {(step < 2 || (active && dirty)) && <footer className="recruitment-review__save-bar">
          <div><p>{step < 2 ? step === 0 ? `${checkedDocuments} of ${documents.length} files checked` : `${checkedChecks} of ${checks.length} checks recorded` : 'Unsaved review findings'}</p><span>{step < 2 ? dirty ? 'Continue keeps your edits. Save progress if you need to pause.' : 'Complete this step, then continue.' : 'Save the findings before recording a decision.'}</span></div>
          <div className="recruitment-review__navigation">
            {step === 1 && <button type="button" className="recruitment-review__back" disabled={pending} onClick={() => goTo(step - 1)}><ArrowLeft size={15} aria-hidden="true" />Back</button>}
            {active && step < 2 && dirty && <button type="submit" className="recruitment-review__back" disabled={locked}><Save size={15} aria-hidden="true" />Save progress</button>}
            {step < 2 ? <button type="button" className="recruitment-ci-primary-button recruitment-ci-focus" disabled={pending || (active && detailsDirty)} onClick={next}>Continue to {step === 0 ? 'application checks' : 'outcome'}<ArrowRight size={16} aria-hidden="true" /></button> : active && (!savedReady || dirty) && <button type="submit" className="recruitment-ci-primary-button recruitment-ci-focus" disabled={locked || !dirty}><Save size={16} aria-hidden="true" />{saving ? 'Saving…' : 'Save review'}</button>}
          </div>
        </footer>}
      </form>
      {step === 2 && (savedReady || lead.approved_at) && children}
      {step === 2 && active && !savedReady && onReject && <button type="button" className="recruitment-review__reject" disabled={pending || dirty || detailsDirty} onClick={onReject}>Reject Application</button>}
    </div>}
  </section>
}
