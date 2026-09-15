import { ArrowRight, ArrowUpRight, Check, ChevronLeft, X } from 'lucide-react'
import { useState } from 'react'
import './HomeSeekersViewingModal.css'

const readiness = ['Ready to move soon', 'Comparing a few homes', 'Selling before I buy']
const finance = ['Cash buyer', 'Pre-approved finance', 'Still exploring options']

export default function HomeSeekersViewingModal({ home, onClose }) {
  const [step, setStep] = useState(1)
  const [details, setDetails] = useState({ name: '', phone: '', email: '' })
  const [slots, setSlots] = useState(['', '', ''])
  const [buyerReadiness, setBuyerReadiness] = useState('')
  const [financePosition, setFinancePosition] = useState('')
  const updateDetail = (field) => (event) => setDetails((current) => ({ ...current, [field]: event.target.value }))
  const updateSlot = (index) => (event) => setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? event.target.value : slot))
  const advance = (event) => { if (step < 3) { event.preventDefault(); setStep((current) => current + 1) } }
  const requestDetails = `Viewing request for: ${home.title}\n\nPreferred times:\n${slots.filter(Boolean).join('\n')}\n\nBuyer readiness: ${buyerReadiness}\nFinance position: ${financePosition}`

  return <div className="hs-viewing-modal" role="presentation" onMouseDown={onClose}>
    <section className="hs-viewing-modal__panel" role="dialog" aria-modal="true" aria-labelledby="viewing-title" onMouseDown={(event) => event.stopPropagation()}>
      <aside><p>❯ PRIVATE <strong>VIEWING</strong></p><span>HOME SEEKERS / SELECT HOME</span><h2 id="viewing-title">See it<br /><em>properly.</em></h2><p>{home.place}<br />{home.price}</p><div className="hs-viewing-modal__steps" aria-label={`Step ${step} of 3`}><b className={step >= 1 ? 'is-current' : ''}>01</b><b className={step >= 2 ? 'is-current' : ''}>02</b><b className={step >= 3 ? 'is-current' : ''}>03</b></div></aside>
      <form action="mailto:info@homeseeker.co.za" method="post" encType="text/plain" onSubmit={advance}>
        <button className="hs-viewing-modal__close" type="button" aria-label="Close viewing request" onClick={onClose}><X size={20} /></button>
        <div className="hs-viewing-modal__meta"><span>STEP 0{step} / 03</span><p>{step === 1 ? 'YOUR DETAILS' : step === 2 ? 'PREFERRED TIMES' : 'A LITTLE CONTEXT'}</p></div>
        {step === 1 && <div className="hs-viewing-modal__stage"><h3>First, how can we reach you?</h3><p>We will only use these details to arrange this viewing.</p><label>Your name<input value={details.name} onChange={updateDetail('name')} name="name" required placeholder="Your name" autoFocus /></label><label>Mobile number<input value={details.phone} onChange={updateDetail('phone')} name="phone" type="tel" required placeholder="Your mobile number" /></label><label>Email address<input value={details.email} onChange={updateDetail('email')} name="email" type="email" required placeholder="you@example.com" /></label></div>}
        {step === 2 && <div className="hs-viewing-modal__stage"><button type="button" className="hs-viewing-modal__back" onClick={() => setStep(1)}><ChevronLeft size={16} /> Back</button><h3>When could you see it?</h3><p>Give us up to three times that work. We will confirm the closest available slot.</p><div className="hs-viewing-modal__slots">{slots.map((slot, index) => <label key={index}>Choice {index + 1}{index === 0 && <i>Required</i>}<input value={slot} onChange={updateSlot(index)} type="datetime-local" required={index === 0} /></label>)}</div></div>}
        {step === 3 && <div className="hs-viewing-modal__stage"><button type="button" className="hs-viewing-modal__back" onClick={() => setStep(2)}><ChevronLeft size={16} /> Back</button><h3>Just enough context.</h3><p>This helps your advisor make the viewing genuinely useful.</p><fieldset><legend>Where are you in your move?</legend><div>{readiness.map((option) => <button type="button" className={buyerReadiness === option ? 'is-selected' : ''} key={option} onClick={() => setBuyerReadiness(option)}>{buyerReadiness === option && <Check size={14} />}{option}</button>)}</div></fieldset><fieldset><legend>What is your buying position?</legend><div>{finance.map((option) => <button type="button" className={financePosition === option ? 'is-selected' : ''} key={option} onClick={() => setFinancePosition(option)}>{financePosition === option && <Check size={14} />}{option}</button>)}</div></fieldset><input type="hidden" name="property" value={home.title} /><input type="hidden" name="contactName" value={details.name} /><input type="hidden" name="contactMobile" value={details.phone} /><input type="hidden" name="contactEmail" value={details.email} /><input type="hidden" name="requestDetails" value={requestDetails} /></div>}
        <button className="hs-viewing-modal__submit" type="submit" disabled={step === 3 && (!buyerReadiness || !financePosition)}>{step === 3 ? <>Request this viewing <ArrowUpRight size={18} /></> : <>Continue <ArrowRight size={18} /></>}</button>
      </form>
    </section>
  </div>
}
