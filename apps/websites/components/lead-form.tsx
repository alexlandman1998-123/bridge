'use client'

import { FormEvent, useState } from 'react'

type Props = { propertyId?: string; pageId?: string; purpose?: 'general_enquiry' | 'valuation_request' | 'campaign_enquiry' }

export function LeadForm({ propertyId, pageId, purpose }: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('sending')
    const form = new FormData(event.currentTarget)
    const result = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: propertyId ? 'property_enquiry' : purpose || 'general_enquiry',
        propertyId,
        campaignPageId: pageId,
        name: form.get('name'),
        email: form.get('email'),
        phone: form.get('phone'),
        message: form.get('message'),
        privacyAccepted: form.get('privacyAccepted') === 'on',
        pageUrl: window.location.href,
        referrer: document.referrer || undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    })
    setState(result.ok ? 'success' : 'error')
    if (result.ok) event.currentTarget.reset()
  }

  return (
    <form className="lead-form" onSubmit={submit}>
      <label>Name<input name="name" autoComplete="name" required /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Mobile<input name="phone" type="tel" autoComplete="tel" required /></label>
      <label>Message<textarea name="message" rows={3} placeholder={purpose === 'valuation_request' ? 'Tell us about your property' : 'How can we help?'} /></label>
      <label className="consent"><input name="privacyAccepted" type="checkbox" required /> I agree that this agency may contact me about my enquiry.</label>
      <button disabled={state === 'sending'} type="submit">{state === 'sending' ? 'Sending…' : 'Send enquiry'}</button>
      <p aria-live="polite" className={state === 'error' ? 'form-error' : 'form-message'}>{state === 'success' ? 'Thank you. Your enquiry has been sent.' : state === 'error' ? 'We could not send your enquiry. Please call the agency directly.' : ''}</p>
    </form>
  )
}
