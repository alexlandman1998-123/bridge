import { ArrowUpRight, X } from 'lucide-react'
import { useState } from 'react'
import { useHomeSeekersLeadSubmission } from './homeSeekersWebsiteData'
import './HomeSeekersValuationModal.css'

export default function HomeSeekersValuationModal({ onClose }) {
  const submitLead = useHomeSeekersLeadSubmission()
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setSubmitting(true)
    setStatus('')
    try {
      await submitLead({
        type: 'valuation_request', name: form.get('name'), phone: form.get('phone'),
        email: form.get('email'), message: `Property address: ${form.get('propertyAddress')}`,
        privacyAccepted: form.get('privacy') === 'on', companyWebsite: form.get('website'),
      })
      setStatus('Thank you. A Home Seekers agent will be in touch shortly.')
      formElement.reset()
    } catch (error) {
      setStatus(error.message || 'We could not send that just now. Your details are still here; please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="hs-valuation-modal" role="presentation" onMouseDown={onClose}>
    <section className="hs-valuation-modal__panel" role="dialog" aria-modal="true" aria-labelledby="valuation-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="hs-valuation-modal__intro"><p>❯ FREE <strong>VALUATION</strong></p><h2 id="valuation-title">Start with a clearer picture.</h2><p>Tell us a little about the property. We will use it only to arrange your valuation.</p><small>HOME SEEKERS<br />MOVE FORWARD, FASTER.</small></div>
      <form onSubmit={submit}><button className="hs-valuation-modal__close" type="button" aria-label="Close valuation form" onClick={onClose}><X size={20} /></button><p>BOOK YOUR FREE VALUATION</p><label>Your name<input name="name" required placeholder="Your name" autoFocus /></label><label>Mobile number<input name="phone" type="tel" required placeholder="Your mobile number" /></label><label>Email address<input name="email" type="email" required placeholder="you@example.com" /></label><label>Property address<textarea name="propertyAddress" required rows="2" placeholder="Street address and suburb" /></label><label className="hs-valuation-modal__privacy"><input type="checkbox" name="privacy" required /> I agree to be contacted about my valuation.</label><input className="hs-valuation-modal__honeypot" name="website" tabIndex="-1" autoComplete="off" aria-hidden="true" /><p className="hs-valuation-modal__status" role="status">{status}</p><button className="hs-valuation-modal__submit" type="submit" disabled={submitting}>{submitting ? 'Sending…' : <>Request a valuation <ArrowUpRight size={18} /></>}</button></form>
    </section>
  </div>
}
