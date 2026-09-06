'use client'

import { FormEvent, useRef, useState } from 'react'

type Props = { propertyId?: string; pageId?: string; purpose?: 'general_enquiry' | 'valuation_request' | 'campaign_enquiry' }

export function LeadForm({ propertyId, pageId, purpose }: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const idempotencyKey = useRef<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    if (!String(form.get('email') || '').trim() && !String(form.get('phone') || '').trim()) {
      setState('error')
      setErrorMessage('Please add an email address or mobile number.')
      return
    }
    setState('sending')
    setErrorMessage('')
    idempotencyKey.current ||= crypto.randomUUID()
    try {
      const result = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: propertyId ? 'property_enquiry' : purpose || 'general_enquiry',
          propertyId,
          pageId,
          name: form.get('name'),
          email: form.get('email'),
          phone: form.get('phone'),
          message: form.get('message'),
          companyWebsite: form.get('companyWebsite'),
          privacyAccepted: form.get('privacyAccepted') === 'on',
          marketingConsent: form.get('marketingConsent') === 'on',
          pageUrl: window.location.href,
          referrer: document.referrer || undefined,
          idempotencyKey: idempotencyKey.current,
        }),
      })
      if (result.ok) {
        setState('success')
        formElement.reset()
        idempotencyKey.current = null
        return
      }
      const payload = await result.json().catch(() => ({})) as { error?: string }
      setErrorMessage(result.status === 429 ? 'Please wait a few minutes before sending another enquiry.' : payload.error || 'We could not send your enquiry. Please call the agency directly.')
      setState('error')
    } catch {
      setErrorMessage('We could not send your enquiry. Please check your connection and try again.')
      setState('error')
    }
  }

  return (
    <form className="lead-form" onSubmit={submit}>
      <label hidden aria-hidden="true">Company website<input name="companyWebsite" autoComplete="off" tabIndex={-1} /></label>
      <label>Name<input name="name" autoComplete="name" required /></label>
      <label>Email (email or mobile required)<input name="email" type="email" autoComplete="email" /></label>
      <label>Mobile (email or mobile required)<input name="phone" type="tel" autoComplete="tel" /></label>
      <label>Message<textarea name="message" rows={3} placeholder={purpose === 'valuation_request' ? 'Tell us about your property' : 'How can we help?'} /></label>
      <label className="consent"><input name="privacyAccepted" type="checkbox" required /> I agree that this agency may contact me about my enquiry.</label>
      <label className="consent"><input name="marketingConsent" type="checkbox" /> I would also like to receive relevant property updates.</label>
      <button disabled={state === 'sending'} type="submit">{state === 'sending' ? 'Sending…' : 'Send enquiry'}</button>
      <p aria-live="polite" className={state === 'error' ? 'form-error' : 'form-message'}>{state === 'success' ? 'Thank you. Your enquiry has been sent.' : state === 'error' ? errorMessage : ''}</p>
    </form>
  )
}
