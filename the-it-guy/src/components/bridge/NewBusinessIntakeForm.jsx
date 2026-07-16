import { useState } from 'react'
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/input'
import {
  createIntakeSubmissionKey,
  submitNewBusinessIntake,
} from '../../services/publicNewBusinessIntakeService'

const INITIAL_FORM = Object.freeze({
  role: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  businessSize: '',
  monthlyVolume: '',
  servicesInterested: [],
  biggestFrustration: '',
  preferredContactMethod: '',
  preferredWindow: '',
  popiaConsentGiven: false,
  marketingConsent: false,
  website: '',
})

const ORGANISATION_TYPES = [
  'Estate agency',
  'Law firm / conveyancer',
  'Bond originator',
  'Property developer',
  'Other property business',
]

const SERVICE_OPTIONS = [
  'Transaction workflow',
  'Listings and CRM',
  'Bond coordination',
  'Legal and conveyancing workflow',
  'Client portals and communication',
  'Reporting and management visibility',
]

const FIELD_CLASS = 'h-12 w-full rounded-[18px] border border-marketing-borderStrong bg-white/90 px-4 text-sm font-medium text-marketing-ink outline-none transition placeholder:text-[#a0968a] focus:border-marketing-accent/45 focus:ring-4 focus:ring-marketing-accent/10'

export function NewBusinessIntakeForm() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [submissionKey, setSubmissionKey] = useState(createIntakeSubmissionKey)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setError('')
  }

  function toggleService(service) {
    setForm((current) => ({
      ...current,
      servicesInterested: current.servicesInterested.includes(service)
        ? current.servicesInterested.filter((item) => item !== service)
        : [...current.servicesInterested, service],
    }))
    setFieldErrors((current) => ({ ...current, servicesInterested: '' }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      setFieldErrors({})
      await submitNewBusinessIntake(form, { submissionKey })
      setSubmitted(true)
    } catch (submitError) {
      setError(submitError?.message || 'Your enquiry could not be submitted.')
      setFieldErrors(submitError?.fieldErrors || {})
    } finally {
      setSubmitting(false)
    }
  }

  function startAnother() {
    setForm(INITIAL_FORM)
    setSubmissionKey(createIntakeSubmissionKey())
    setSubmitted(false)
    setError('')
    setFieldErrors({})
  }

  if (submitted) {
    return (
      <div className="grid min-h-[520px] place-items-center rounded-[26px] border border-[#bfdaca] bg-[#f2faf6] p-8 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#dcefe5] text-[#176149]"><CheckCircle2 className="h-7 w-7" aria-hidden="true" /></span>
          <h3 className="mt-5 text-2xl font-semibold tracking-[-0.035em] text-marketing-ink">Your enquiry is with our team.</h3>
          <p className="mt-3 text-sm leading-7 text-marketing-muted">We’ll review your organisation and contact you using your preferred method. You do not need to submit the form again.</p>
          <Button type="button" variant="secondary" className="mt-6" onClick={startAnother}>Submit another enquiry</Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-marketing-muted md:col-span-2">Organisation type
          <select required value={form.role} onChange={(event) => updateField('role', event.target.value)} className={FIELD_CLASS}><option value="">Select your organisation</option>{ORGANISATION_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}</select>
          {fieldErrors.role ? <span className="text-xs font-semibold text-[#9a352f]">{fieldErrors.role}</span> : null}
        </label>
        <label className="grid gap-2 text-sm font-medium text-marketing-muted">First name
          <Input required value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} autoComplete="given-name" placeholder="First name" />
          {fieldErrors.firstName ? <span className="text-xs font-semibold text-[#9a352f]">{fieldErrors.firstName}</span> : null}
        </label>
        <label className="grid gap-2 text-sm font-medium text-marketing-muted">Last name
          <Input required value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} autoComplete="family-name" placeholder="Last name" />
          {fieldErrors.lastName ? <span className="text-xs font-semibold text-[#9a352f]">{fieldErrors.lastName}</span> : null}
        </label>
        <label className="grid gap-2 text-sm font-medium text-marketing-muted">Work email
          <Input required type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" placeholder="you@company.co.za" />
          {fieldErrors.email ? <span className="text-xs font-semibold text-[#9a352f]">{fieldErrors.email}</span> : null}
        </label>
        <label className="grid gap-2 text-sm font-medium text-marketing-muted">Phone number
          <Input required type="tel" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} autoComplete="tel" placeholder="+27" />
          {fieldErrors.phone ? <span className="text-xs font-semibold text-[#9a352f]">{fieldErrors.phone}</span> : null}
        </label>
        <label className="grid gap-2 text-sm font-medium text-marketing-muted md:col-span-2">Company or firm
          <Input required value={form.company} onChange={(event) => updateField('company', event.target.value)} autoComplete="organization" placeholder="Organisation name" />
          {fieldErrors.company ? <span className="text-xs font-semibold text-[#9a352f]">{fieldErrors.company}</span> : null}
        </label>
        <label className="grid gap-2 text-sm font-medium text-marketing-muted">Team size
          <select value={form.businessSize} onChange={(event) => updateField('businessSize', event.target.value)} className={FIELD_CLASS}><option value="">Select size</option><option>1–5 people</option><option>6–20 people</option><option>21–50 people</option><option>51–100 people</option><option>100+ people</option></select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-marketing-muted">Monthly transaction volume
          <select value={form.monthlyVolume} onChange={(event) => updateField('monthlyVolume', event.target.value)} className={FIELD_CLASS}><option value="">Select volume</option><option>1–10</option><option>11–30</option><option>31–75</option><option>76–150</option><option>150+</option></select>
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-marketing-muted">What would you like Arch9 to help with?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {SERVICE_OPTIONS.map((service) => (
            <label key={service} className={`flex cursor-pointer items-start gap-3 rounded-[16px] border px-4 py-3 text-sm transition ${form.servicesInterested.includes(service) ? 'border-marketing-accent/40 bg-marketing-accent/10 text-marketing-ink' : 'border-marketing-border bg-white/70 text-marketing-muted'}`}>
              <input type="checkbox" checked={form.servicesInterested.includes(service)} onChange={() => toggleService(service)} className="mt-0.5 accent-[#176149]" />{service}
            </label>
          ))}
        </div>
        {fieldErrors.servicesInterested ? <span className="mt-2 block text-xs font-semibold text-[#9a352f]">{fieldErrors.servicesInterested}</span> : null}
      </fieldset>

      <label className="grid gap-2 text-sm font-medium text-marketing-muted">What is the biggest operational problem you want to solve?
        <textarea value={form.biggestFrustration} onChange={(event) => updateField('biggestFrustration', event.target.value)} maxLength={3000} rows={4} className="w-full rounded-[20px] border border-marketing-borderStrong bg-white/90 px-4 py-3 text-sm text-marketing-ink outline-none transition placeholder:text-[#a0968a] focus:border-marketing-accent/45 focus:ring-4 focus:ring-marketing-accent/10" placeholder="Give us enough context to make the first conversation useful." />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-marketing-muted">Preferred contact method
          <select required value={form.preferredContactMethod} onChange={(event) => updateField('preferredContactMethod', event.target.value)} className={FIELD_CLASS}><option value="">Select method</option><option value="email">Email</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="no_preference">No preference</option></select>
          {fieldErrors.preferredContactMethod ? <span className="text-xs font-semibold text-[#9a352f]">{fieldErrors.preferredContactMethod}</span> : null}
        </label>
        <label className="grid gap-2 text-sm font-medium text-marketing-muted">Best time to contact you
          <select required value={form.preferredWindow} onChange={(event) => updateField('preferredWindow', event.target.value)} className={FIELD_CLASS}><option value="">Select time</option><option>Weekday mornings</option><option>Weekday afternoons</option><option>After 16:00</option><option>Flexible</option></select>
          {fieldErrors.preferredWindow ? <span className="text-xs font-semibold text-[#9a352f]">{fieldErrors.preferredWindow}</span> : null}
        </label>
      </div>

      <div className="grid gap-3 rounded-[18px] border border-marketing-border bg-white/65 p-4">
        <label className="flex items-start gap-3 text-sm leading-6 text-marketing-muted"><input required type="checkbox" checked={form.popiaConsentGiven} onChange={(event) => updateField('popiaConsentGiven', event.target.checked)} className="mt-1 accent-[#176149]" /><span>I consent to Arch9 processing these details to assess and respond to this enquiry. My information will only be used for this business conversation unless I separately opt into updates.</span></label>
        {fieldErrors.popiaConsentGiven ? <span className="text-xs font-semibold text-[#9a352f]">{fieldErrors.popiaConsentGiven}</span> : null}
        <label className="flex items-start gap-3 text-sm leading-6 text-marketing-muted"><input type="checkbox" checked={form.marketingConsent} onChange={(event) => updateField('marketingConsent', event.target.checked)} className="mt-1 accent-[#176149]" /><span>Also send me occasional Arch9 product and launch updates.</span></label>
        <label className="absolute left-[-10000px]" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => updateField('website', event.target.value)} /></label>
      </div>

      {error ? <div role="alert" className="rounded-[16px] border border-[#e8c6c2] bg-[#fff5f4] px-4 py-3 text-sm font-semibold text-[#93352f]">{error}</div> : null}

      <Button type="submit" disabled={submitting || !form.popiaConsentGiven} className="min-h-12 w-full sm:w-auto">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
        {submitting ? 'Submitting securely…' : 'Send business enquiry'}
        {!submitting ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
      </Button>
    </form>
  )
}

