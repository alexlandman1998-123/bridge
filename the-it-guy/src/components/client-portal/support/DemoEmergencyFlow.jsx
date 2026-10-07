import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Droplets, KeyRound, MapPin, Zap } from 'lucide-react'
import { DemoSupportDialog, DemoSupportReceipt } from './DemoSupportComponents'
import { DEMO_ASSIST_SERVICES, DEMO_SUPPORT_CONTACT } from './demoHomeSupportData'

const serviceIcons = { plumbing: Droplets, electrical: Zap, locksmith: KeyRound }

export default function DemoEmergencyFlow({ theme, propertyAddress, existingRecord = null, onCreate, onClose }) {
  const id = useId()
  const heading = useRef(null)
  const [stage, setStage] = useState(existingRecord ? 2 : 0)
  const [serviceId, setServiceId] = useState('')
  const [address, setAddress] = useState(propertyAddress)
  const [name, setName] = useState(DEMO_SUPPORT_CONTACT.name)
  const [phone, setPhone] = useState(DEMO_SUPPORT_CONTACT.phone)
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(existingRecord)
  const service = DEMO_ASSIST_SERVICES.find(item => item.id === serviceId)

  useEffect(() => { if (stage > 0) heading.current?.focus() }, [stage])

  function createRequest(event) {
    event.preventDefault()
    if (!address.trim() || !name.trim() || !phone.trim()) { setError('Confirm the address, contact name and phone number.'); return }
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 7 || digits.length > 15) { setError('Add a phone number with 7 to 15 digits.'); return }
    const record = onCreate('assist', { service, address: address.trim(), name: name.trim(), phone: phone.trim(), description: description.trim() })
    setReceipt(record)
    setError('')
    setStage(2)
  }

  return <DemoSupportDialog theme={theme} title={existingRecord ? 'Your demo assistance request' : 'Emergency assist'} steps={['Help needed', 'Your details']} stage={stage} onClose={onClose}>
    {stage < 2 ? <div className="demo-home-support-heading"><p className="demo-home-support-eyebrow">A little help, close to home</p><h4 ref={heading} tabIndex={-1}>{stage === 0 ? 'What do you need help with?' : 'Let’s confirm where to help.'}</h4><p>{stage === 0 ? 'Choose a home assistance category to try the demo.' : 'We’ve filled in your home and sample contact details. You can edit them below.'}</p></div> : null}
    {stage === 0 ? <><fieldset className="demo-home-support-assist-choices"><legend className="sr-only">Assistance needed</legend>{DEMO_ASSIST_SERVICES.map(item => {
      const Icon = serviceIcons[item.id]
      return <label key={item.id} className={`demo-home-support-assist-choice demo-home-support-assist-${item.id}`} data-selected={serviceId === item.id}><input type="radio" name={`${id}-service`} checked={serviceId === item.id} onChange={() => setServiceId(item.id)} /><span className="demo-home-support-assist-icon"><Icon size={28} strokeWidth={1.4} aria-hidden="true" /></span><span><strong>{item.label}</strong><span>{item.description}</span></span><Check className="demo-home-support-assist-check" size={18} aria-hidden="true" /></label>
    })}</fieldset><p className="demo-home-support-small-copy">Service availability and any costs would be confirmed before assistance is arranged.</p><div className="demo-home-support-footer"><button type="button" className="demo-home-support-button" disabled={!service} onClick={() => setStage(1)}>Next: your details<ArrowRight size={17} aria-hidden="true" /></button></div></> : null}
    {stage === 1 ? <form onSubmit={createRequest} noValidate>
      <div className="demo-home-support-selected-service"><MapPin size={18} aria-hidden="true" /><strong>{service.label} assistance</strong><span>Demo request</span></div>
      <div className="demo-home-support-fields"><label>Assistance address<input value={address} required maxLength={240} onChange={event => { setAddress(event.target.value); setError('') }} /></label><div className="demo-home-support-field-row"><label>Contact name<input value={name} required maxLength={100} onChange={event => { setName(event.target.value); setError('') }} /></label><label>Phone number<input type="tel" value={phone} required maxLength={30} onChange={event => { setPhone(event.target.value); setError('') }} /></label></div><label>Anything else we should know? <span className="demo-home-support-optional">Optional</span><textarea rows={3} maxLength={1000} value={description} placeholder="A short description or details about access…" onChange={event => setDescription(event.target.value)} /></label></div>
      {error ? <p role="alert" className="demo-home-support-error">{error}</p> : null}
      <div className="demo-home-support-footer"><button type="button" className="demo-home-support-back" onClick={() => { setStage(0); setError('') }}><ArrowLeft size={16} aria-hidden="true" />Back</button><button type="submit" className="demo-home-support-button">Create demo request<ArrowRight size={17} aria-hidden="true" /></button></div>
    </form> : null}
    {stage === 2 && receipt ? <><div ref={heading} tabIndex={-1}><DemoSupportReceipt reference={receipt.reference} title="Your demo request is ready." description="Recorded locally. No team has been contacted and no technician has been dispatched." stages={['Demo request created', 'Team contact', 'Assistance arranged']}><dl className="demo-home-support-summary"><div><dt>Assistance</dt><dd>{receipt.service.label}</dd></div><div><dt>Address</dt><dd>{receipt.address}</dd></div><div><dt>Contact</dt><dd>{receipt.name}<small>{receipt.phone}</small></dd></div>{receipt.description ? <div><dt>Details</dt><dd className="demo-home-support-description">{receipt.description}</dd></div> : null}</dl></DemoSupportReceipt></div><div className="demo-home-support-footer"><button type="button" className="demo-home-support-button" onClick={onClose}>Done</button></div></> : null}
  </DemoSupportDialog>
}
