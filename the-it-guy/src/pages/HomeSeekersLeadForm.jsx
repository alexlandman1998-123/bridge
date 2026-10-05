import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useHomeSeekersLeadSubmission } from './homeSeekersWebsiteData'
import './HomeSeekersLeadForm.css'

export default function HomeSeekersLeadForm({ listingId = null, leadIntent = 'other', subject = 'Your enquiry', buttonLabel = 'Send enquiry' }) {
  const submitLead = useHomeSeekersLeadSubmission()
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setSending(true)
    setMessage('')
    try {
      await submitLead({
        type: listingId ? 'property_enquiry' : 'general_enquiry', listingId,
        leadIntent,
        name: form.get('name'), email: form.get('email'), phone: form.get('phone'),
        message: `${subject}: ${String(form.get('message') || '').trim()}`,
        privacyAccepted: form.get('privacy') === 'on', companyWebsite: form.get('website'),
      })
      setMessage('Thank you. Your enquiry has reached the Home Seekers team.')
      formElement.reset()
    } catch (error) {
      setMessage(error.message || 'Your enquiry could not be sent. Please try again.')
    } finally { setSending(false) }
  }

  return <form className="hs-crm-lead-form" onSubmit={submit}>
    <label>Your name<input name="name" required autoComplete="name" /></label>
    <label>Email address<input name="email" type="email" required autoComplete="email" /></label>
    <label>Mobile number<input name="phone" type="tel" autoComplete="tel" /></label>
    <label>How can we help?<textarea name="message" rows="3" required /></label>
    <label className="hs-crm-lead-form__privacy"><input type="checkbox" name="privacy" required /> I agree to be contacted about my enquiry.</label>
    <input className="hs-crm-lead-form__honeypot" name="website" tabIndex="-1" autoComplete="off" aria-hidden="true" />
    <p role="status">{message}</p>
    <button type="submit" disabled={sending}>{sending ? 'Sending…' : <>{buttonLabel} <ArrowRight size={17} /></>}</button>
  </form>
}
