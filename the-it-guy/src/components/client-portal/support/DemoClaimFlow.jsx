import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, MapPin, Plus, X } from 'lucide-react'
import { DemoSupportDialog, DemoSupportReceipt } from './DemoSupportComponents'
import { DEMO_SUPPORT_CONTACT, DEMO_SUPPORT_POLICIES, formatIncidentDate, localDateToday } from './demoHomeSupportData'

const incidentTypes = ['Water damage', 'Storm damage', 'Fire damage', 'Theft', 'Other']

export default function DemoClaimFlow({ theme, propertyAddress, existingRecord = null, onCreate, onClose }) {
  const id = useId()
  const heading = useRef(null)
  const fileInput = useRef(null)
  const attachmentSequence = useRef(0)
  const [stage, setStage] = useState(existingRecord ? 3 : 0)
  const [policyId, setPolicyId] = useState('home')
  const [incidentType, setIncidentType] = useState('Water damage')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState([])
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(existingRecord)
  const policy = DEMO_SUPPORT_POLICIES.find(item => item.id === policyId)

  useEffect(() => { if (stage > 0) heading.current?.focus() }, [stage])

  function continueDetails(event) {
    event.preventDefault()
    if (!date || !description.trim()) { setError('Add the incident date and a short description.'); return }
    if (date > localDateToday()) { setError('The incident date cannot be in the future.'); return }
    setError('')
    setStage(1)
  }

  function addPhotos(event) {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (!files.length) return
    const accepted = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (files.some(file => !accepted.includes(file.type) || file.size > 10 * 1024 * 1024)) {
      setError('Choose JPG, PNG, WebP or GIF photos, up to 10 MB each.'); return
    }
    const additions = files.filter(file => !attachments.some(item => item.name === file.name && item.size === file.size))
    if (attachments.length + additions.length > 5) { setError('You can attach up to five photos.'); return }
    // Keep metadata only; file contents are never read, uploaded or stored.
    setAttachments(current => [...current, ...additions.map(file => ({ id: ++attachmentSequence.current, name: file.name, size: file.size }))])
    setError('')
  }

  function addSamplePhotos() {
    if (attachments.some(item => item.sample)) return
    if (attachments.length > 3) { setError('You can attach up to five photos.'); return }
    setAttachments(current => [...current, ...['sample-incident.jpg', 'sample-damage.jpg'].map(name => ({ id: ++attachmentSequence.current, name, size: 0, sample: true }))])
    setError('')
  }

  function submitDemo() {
    const record = onCreate('claim', { policy, incidentType, date, description: description.trim(), attachments, propertyAddress, name: DEMO_SUPPORT_CONTACT.name })
    setReceipt(record)
    setStage(3)
  }

  const summary = receipt || { policy, incidentType, date, description, attachments, propertyAddress, name: DEMO_SUPPORT_CONTACT.name }
  return <DemoSupportDialog theme={theme} title={existingRecord ? 'Your demo claim' : 'Submit a claim'} steps={['Incident', 'Photos', 'Review']} stage={stage} onClose={onClose}>
    {stage < 3 ? <div className="demo-home-support-heading"><p className="demo-home-support-eyebrow">Sample policy · {policy.reference}</p><h4 ref={heading} tabIndex={-1}>{stage === 0 ? 'Let’s take it one step at a time.' : stage === 1 ? 'A little more context helps.' : 'Everything look right?'}</h4><p>{stage === 0 ? 'Your home and sample policyholder details are already here.' : stage === 1 ? 'Add photos to illustrate what happened, or continue without them.' : 'Review the details before creating your demo claim.'}</p></div> : null}
    {stage === 0 ? <form onSubmit={continueDetails} noValidate>
      <div className="demo-home-support-policy"><img src={policy.logo} alt={`${policy.insurer} logo`} /><div><strong>{policy.cover}</strong><span>Sample policyholder: {DEMO_SUPPORT_CONTACT.name}</span></div></div>
      <p className="demo-home-support-property"><MapPin size={16} aria-hidden="true" />{propertyAddress || 'Your sample home'}</p>
      <div className="demo-home-support-fields">
        <label>Sample policy<select value={policyId} onChange={event => setPolicyId(event.target.value)}>{DEMO_SUPPORT_POLICIES.map(item => <option key={item.id} value={item.id}>{item.insurer} · {item.cover}</option>)}</select></label>
        <div className="demo-home-support-field-row"><label>What happened?<select value={incidentType} onChange={event => setIncidentType(event.target.value)}>{incidentTypes.map(item => <option key={item}>{item}</option>)}</select></label><label>Incident date<input type="date" value={date} max={localDateToday()} required onChange={event => { setDate(event.target.value); setError('') }} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} /></label></div>
        <label>Tell us what happened<textarea value={description} required maxLength={2000} rows={3} placeholder="A short description of the incident and damage…" onChange={event => { setDescription(event.target.value); setError('') }} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} /></label>
      </div>
      {error ? <p id={`${id}-error`} role="alert" className="demo-home-support-error">{error}</p> : null}
      <div className="demo-home-support-footer"><button type="submit" className="demo-home-support-button">Next: photos<ArrowRight size={17} aria-hidden="true" /></button></div>
    </form> : null}
    {stage === 1 ? <>
      <div className="demo-home-support-photo-picker"><ImagePlus size={38} strokeWidth={1.2} aria-hidden="true" /><strong>Show us what happened.</strong><p>Up to 5 photos · 10 MB each. This demo keeps filenames only.</p><input ref={fileInput} id={`${id}-photos`} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" aria-label="Attach incident photos" onChange={addPhotos} /><label className="demo-home-support-button demo-home-support-button-light" htmlFor={`${id}-photos`}><Plus size={16} aria-hidden="true" />Choose photos</label><button type="button" className="demo-home-support-text-button" disabled={attachments.some(item => item.sample)} onClick={addSamplePhotos}>Use sample photos</button></div>
      <ul className="demo-home-support-attachments" aria-label="Incident photos">{attachments.map(item => <li key={item.id}><span><ImagePlus size={18} aria-hidden="true" />{item.name}{item.sample ? <small>Sample</small> : null}</span><button type="button" aria-label={`Remove ${item.name}`} onClick={() => { setAttachments(current => current.filter(entry => entry.id !== item.id)); setError('') }}><X size={16} aria-hidden="true" /></button></li>)}</ul>
      {error ? <p role="alert" className="demo-home-support-error">{error}</p> : null}
      <div className="demo-home-support-footer"><button type="button" className="demo-home-support-back" onClick={() => { setStage(0); setError('') }}><ArrowLeft size={16} aria-hidden="true" />Back</button><button type="button" className="demo-home-support-button" onClick={() => { setStage(2); setError('') }}>Review claim<ArrowRight size={17} aria-hidden="true" /></button></div>
    </> : null}
    {stage === 2 ? <><ClaimSummary record={summary} /><div className="demo-home-support-footer"><button type="button" className="demo-home-support-back" onClick={() => setStage(1)}><ArrowLeft size={16} aria-hidden="true" />Back</button><button type="button" className="demo-home-support-button" onClick={submitDemo}>Submit demo claim<ArrowRight size={17} aria-hidden="true" /></button></div></> : null}
    {stage === 3 && receipt ? <><div ref={heading} tabIndex={-1}><DemoSupportReceipt reference={receipt.reference} title="Your demo claim is ready." description="Saved for this demo session. Nothing has been sent to an insurer." stages={['Demo claim created', 'Insurer review', 'Claim outcome']}><ClaimSummary record={receipt} /></DemoSupportReceipt></div><div className="demo-home-support-footer"><button type="button" className="demo-home-support-button" onClick={onClose}>Done</button></div></> : null}
  </DemoSupportDialog>
}

function ClaimSummary({ record }) {
  return <dl className="demo-home-support-summary"><div><dt>Sample policy</dt><dd>{record.policy.insurer} · {record.policy.cover}<small>{record.policy.reference}</small></dd></div><div><dt>Home</dt><dd>{record.propertyAddress || 'Your sample home'}</dd></div><div><dt>Incident</dt><dd>{record.incidentType} · {formatIncidentDate(record.date)}</dd></div><div><dt>What happened</dt><dd className="demo-home-support-description">{record.description}</dd></div><div><dt>Photos</dt><dd>{record.attachments.length ? record.attachments.map(item => item.name).join(', ') : 'No photos attached'}</dd></div></dl>
}
