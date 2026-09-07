'use client'

import { FormEvent, useRef, useState } from 'react'

type LeadPurpose = 'general_enquiry' | 'valuation_request' | 'campaign_enquiry' | 'newsletter_signup'
type Props = { propertyId?: string; pageId?: string; purpose?: LeadPurpose; variant?: 'default' | 'homepage' | 'valuation'; privacyPolicyUrl?: string }

export function LeadForm({ propertyId, pageId, purpose, variant = 'default', privacyPolicyUrl }: Props) {
  const isNewsletter = purpose === 'newsletter_signup'
  const homepageForm = variant === 'homepage' && !isNewsletter
  const valuationForm = variant === 'valuation' && !isNewsletter
  const [intent, setIntent] = useState<'Buy' | 'Sell' | 'Rent' | 'Other'>('Buy')
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const idempotencyKey = useRef<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    if ((isNewsletter && !String(form.get('email') || '').trim()) || (!isNewsletter && !String(form.get('email') || '').trim() && !String(form.get('phone') || '').trim())) {
      setState('error')
      setErrorMessage(isNewsletter ? 'Please add an email address.' : 'Please add an email address or mobile number.')
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
          // Newsletter requests use the audited CRM ingestion flow, rather than a separate contact store.
          type: propertyId ? 'property_enquiry' : isNewsletter ? 'general_enquiry' : purpose || 'general_enquiry',
          propertyId,
          pageId,
          name: form.get('name'),
          email: form.get('email'),
          phone: form.get('phone'),
          message: isNewsletter ? 'Newsletter signup — property updates requested.' : `${valuationForm ? `Property address: ${String(form.get('propertyAddress') || '')}\nProperty type: ${String(form.get('propertyType') || '')}\nBedrooms: ${String(form.get('bedrooms') || '')}\n\n` : ''}${homepageForm ? `Homepage contact intent: ${intent}\n\n` : ''}${String(form.get('message') || '')}`,
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
    <form className={`lead-form${homepageForm ? ' homepage-lead-form' : ''}${valuationForm ? ' valuation-lead-form' : ''}`} onSubmit={submit}>
      <label className="honeypot" aria-hidden="true">Company website<input name="companyWebsite" autoComplete="off" tabIndex={-1} /></label>
      {homepageForm ? <><h3>How can we help?</h3><div className="intent-chips" aria-label="Enquiry intent">{(['Buy', 'Sell', 'Rent', 'Other'] as const).map((option) => <button aria-pressed={intent === option} className={intent === option ? 'is-selected' : ''} key={option} onClick={() => setIntent(option)} type="button">{option}</button>)}</div></> : null}
      {valuationForm ? <><h3>What’s your home worth?</h3><p className="valuation-form-intro">Request a valuation from your local team.</p><label className="lead-field valuation-address">Property address<input name="propertyAddress" placeholder="e.g. 12 Boundary Road, Cape Town" required /></label><label className="lead-field valuation-property-type">Property type<select name="propertyType" defaultValue=""><option value="" disabled>Select type</option><option>House</option><option>Apartment</option><option>Townhouse</option><option>Land</option></select></label><label className="lead-field valuation-bedrooms">Bedrooms<select name="bedrooms" defaultValue=""><option value="" disabled>Select</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5+</option></select></label></> : null}
      <label className="lead-field lead-name">{homepageForm ? 'Full name' : 'Name'}<input name="name" autoComplete="name" placeholder={homepageForm ? 'Your name' : undefined} required /></label>
      <label className="lead-field lead-email">Email<input name="email" type="email" autoComplete="email" placeholder={homepageForm ? 'you@example.com' : undefined} required={isNewsletter} /></label>
      {!isNewsletter && <><label className="lead-field lead-phone">Mobile number<input name="phone" type="tel" autoComplete="tel" placeholder={homepageForm ? '+27' : undefined} /></label>{homepageForm ? <p className="contact-method-note">Please provide an email address or mobile number.</p> : null}</>}
      {!isNewsletter && <label className="lead-field lead-message">Message<textarea name="message" rows={3} placeholder={homepageForm ? 'Tell us what you have in mind…' : purpose === 'valuation_request' ? 'Tell us about your property' : 'How can we help?'} /></label>}
      <label className="consent"><input name="privacyAccepted" type="checkbox" required /> I agree to be contacted about my enquiry.</label>
      <label className="consent"><input name="marketingConsent" type="checkbox" required={isNewsletter} /> {homepageForm ? 'Send me property news and updates (optional).' : 'I would also like to receive relevant property updates.'}</label>
      <button disabled={state === 'sending'} type="submit">{state === 'sending' ? 'Sending…' : isNewsletter ? 'Subscribe' : homepageForm ? <>Send enquiry <span aria-hidden="true">→</span></> : valuationForm ? <>Request my valuation <span aria-hidden="true">→</span></> : 'Send enquiry'}</button>
      {homepageForm ? <p className="privacy-note">Your details are handled in line with our {privacyPolicyUrl ? <a href={privacyPolicyUrl}>Privacy Policy</a> : 'Privacy Policy'}.</p> : null}
      <p aria-live="polite" className={state === 'error' ? 'form-error' : 'form-message'}>{state === 'success' ? isNewsletter ? 'Thank you. You are subscribed to property updates.' : 'Thank you. Your enquiry has been sent.' : state === 'error' ? errorMessage : ''}</p>
    </form>
  )
}
