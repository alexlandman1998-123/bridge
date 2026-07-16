import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleHelp,
  FileCheck2,
  FileX2,
  Home,
  Landmark,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Phone,
  RefreshCw,
  Scale,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ATTORNEY_LEAD_SERVICE_TYPES } from '../core/leads/attorneyLeadContract'
import {
  ATTORNEY_PUBLIC_INTAKE_PRIVACY_VERSION,
  getOrCreateAttorneyIntakeIdempotencyKey,
  readAttorneyIntakeAttribution,
  resolveAttorneyPublicIntake,
  rotateAttorneyIntakeIdempotencyKey,
  submitAttorneyPublicIntake,
} from '../services/attorneyPublicIntakeService'

const SERVICE_OPTIONS = Object.freeze({
  [ATTORNEY_LEAD_SERVICE_TYPES.transferQuote]: {
    label: 'Request a Transfer Quote',
    description: 'Get guidance on estimated transfer costs and next steps.',
    icon: FileCheck2,
  },
  [ATTORNEY_LEAD_SERVICE_TYPES.propertyTransfer]: {
    label: 'Property Transfer Assistance',
    description: 'Speak to a conveyancing team about a property transfer.',
    icon: Home,
  },
  [ATTORNEY_LEAD_SERVICE_TYPES.bondRegistration]: {
    label: 'Bond Registration',
    description: 'Get help with the legal process for registering a bond.',
    icon: Landmark,
  },
  [ATTORNEY_LEAD_SERVICE_TYPES.bondCancellation]: {
    label: 'Bond Cancellation',
    description: 'Ask about cancelling an existing property bond.',
    icon: FileX2,
  },
  [ATTORNEY_LEAD_SERVICE_TYPES.propertyLegalAdvice]: {
    label: 'Property Legal Advice',
    description: 'Discuss a property-related legal question with the firm.',
    icon: Scale,
  },
  [ATTORNEY_LEAD_SERVICE_TYPES.generalEnquiry]: {
    label: 'General Enquiry',
    description: 'Send the team a message about another property law matter.',
    icon: MessageSquareText,
  },
})

const INITIAL_FORM = Object.freeze({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  propertyAddress: '',
  propertyValue: '',
  partyRole: 'unknown',
  message: '',
  privacyConsent: false,
  companyWebsite: '',
})

function FieldLabel({ children, required = false }) {
  return (
    <span className="text-[13px] font-semibold text-slate-700">
      {children}{required ? <span className="ml-1 text-rose-600" aria-hidden="true">*</span> : null}
    </span>
  )
}

function BrandMark({ intake }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const initials = intake.firmName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  if (intake.logoUrl && !logoFailed) {
    return (
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-white/70 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.12)] sm:h-24 sm:w-24">
        <img
          src={intake.logoUrl}
          alt={`${intake.firmName} logo`}
          className="h-full w-full object-contain p-2.5"
          onError={() => setLogoFailed(true)}
        />
      </div>
    )
  }

  return (
    <div
      className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/20 text-xl font-bold text-white shadow-[0_16px_36px_rgba(15,23,42,0.12)] sm:h-24 sm:w-24 sm:text-2xl"
      style={{ backgroundColor: intake.primaryColour }}
      aria-label={`${intake.firmName} initials`}
    >
      {initials || <Building2 size={30} aria-hidden="true" />}
    </div>
  )
}

function LoadingState() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f3f5f1] px-5 text-[#183238]">
      <div className="text-center" role="status">
        <LoaderCircle className="mx-auto animate-spin text-[#2d6266]" size={30} aria-hidden="true" />
        <p className="mt-4 text-sm font-medium text-slate-600">Preparing the firm’s enquiry page…</p>
      </div>
    </main>
  )
}

function UnavailableState({ error, onRetry }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f3f5f1] px-5 py-10 text-[#183238]">
      <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-[0_24px_70px_rgba(15,23,42,0.09)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <CircleHelp size={27} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">This enquiry page is unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{error || 'The link may be incorrect or temporarily disabled.'}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f45] px-5 text-sm font-semibold text-white transition hover:bg-[#102f34] focus:outline-none focus:ring-4 focus:ring-[#173f45]/20"
        >
          <RefreshCw size={17} aria-hidden="true" /> Try again
        </button>
        <p className="mt-7 text-xs font-medium text-slate-400">Securely powered by ARCH9</p>
      </section>
    </main>
  )
}

export default function AttorneyPublicIntakePage() {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [intake, setIntake] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedService, setSelectedService] = useState('')
  const [form, setForm] = useState(INITIAL_FORM)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedDuplicate, setSubmittedDuplicate] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const attribution = useMemo(
    () => readAttorneyIntakeAttribution(searchParams),
    [searchParams],
  )
  const service = selectedService ? SERVICE_OPTIONS[selectedService] : null
  const showQuoteFields = selectedService === ATTORNEY_LEAD_SERVICE_TYPES.transferQuote

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true)
        setLoadError('')
      }
    })
    resolveAttorneyPublicIntake(slug)
      .then((resolved) => {
        if (!cancelled) setIntake(resolved)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error?.message || 'The link may be incorrect or temporarily disabled.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug, reloadKey])

  useEffect(() => {
    if (!intake?.firmName) return undefined
    const previousTitle = document.title
    document.title = `${intake.firmName} | Property legal enquiry`
    return () => {
      document.title = previousTitle
    }
  }, [intake?.firmName])

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
    if (formError) setFormError('')
  }

  function retryLoad() {
    setLoading(true)
    setLoadError('')
    setReloadKey((value) => value + 1)
  }

  function chooseService(serviceType) {
    setSelectedService(serviceType)
    setForm(INITIAL_FORM)
    setFormError('')
    setSubmitted(false)
    setSubmittedDuplicate(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function returnToServices() {
    setSelectedService('')
    setForm(INITIAL_FORM)
    setFormError('')
    setSubmitted(false)
    setSubmittedDuplicate(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startAnotherEnquiry() {
    rotateAttorneyIntakeIdempotencyKey(slug, selectedService)
    setForm(INITIAL_FORM)
    setFormError('')
    setSubmitted(false)
    setSubmittedDuplicate(false)
    setSelectedService('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitEnquiry(event) {
    event.preventDefault()
    if (submitting || !selectedService) return

    const firstName = form.firstName.trim()
    const email = form.email.trim()
    const phone = form.phone.trim()
    if (!firstName) {
      setFormError('Please enter your first name.')
      return
    }
    if (!email && !phone) {
      setFormError('Please provide an email address or mobile number so the firm can contact you.')
      return
    }
    if (!form.privacyConsent) {
      setFormError('Please accept the privacy consent to send your enquiry.')
      return
    }

    setSubmitting(true)
    setFormError('')
    try {
      const idempotencyKey = getOrCreateAttorneyIntakeIdempotencyKey(slug, selectedService)
      const result = await submitAttorneyPublicIntake({
        slug,
        idempotencyKey,
        payload: {
          first_name: firstName,
          last_name: form.lastName.trim() || null,
          email: email || null,
          phone: phone || null,
          service_type: selectedService,
          property_address: form.propertyAddress.trim() || null,
          property_value: showQuoteFields && form.propertyValue ? form.propertyValue : null,
          party_role: showQuoteFields ? form.partyRole : 'unknown',
          message: form.message.trim() || null,
          privacy_consent: true,
          privacy_policy_version: ATTORNEY_PUBLIC_INTAKE_PRIVACY_VERSION,
          company_website: form.companyWebsite,
          ...attribution,
        },
      })
      if (!result.accepted) throw new Error('We could not confirm your enquiry. Please try again.')
      setSubmittedDuplicate(result.duplicate)
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setFormError(error?.message || 'We could not send your enquiry right now. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingState />
  if (!intake || loadError) {
    return <UnavailableState error={loadError} onRetry={retryLoad} />
  }

  const availableServices = intake.serviceTypes.filter((type) => SERVICE_OPTIONS[type])
  const pageStyle = {
    '--journey-brand': intake.primaryColour,
    '--journey-accent': intake.secondaryColour,
  }

  return (
    <main
      className="min-h-[100dvh] bg-[#f3f5f1] text-[#173238] antialiased"
      style={pageStyle}
    >
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[310px] bg-[radial-gradient(circle_at_15%_15%,color-mix(in_srgb,var(--journey-accent)_25%,transparent),transparent_42%),linear-gradient(145deg,color-mix(in_srgb,var(--journey-brand)_12%,white),#f3f5f1_72%)]" />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[760px] flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-8">
        <header className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500 shadow-sm backdrop-blur">
            <ShieldCheck size={14} aria-hidden="true" /> Secure enquiry
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Powered by ARCH9</span>
        </header>

        <section className="mt-7 flex flex-col items-center text-center sm:mt-10">
          <BrandMark intake={intake} />
          <p className="mt-5 text-sm font-semibold tracking-[-0.01em] text-slate-600">{intake.firmName}</p>
          <h1 className="mt-2 max-w-[620px] text-[32px] font-semibold leading-[1.06] tracking-[-0.045em] text-[#173238] sm:text-[44px]">
            {submitted ? 'Thank you — your enquiry is on its way.' : selectedService ? service?.label : intake.heading}
          </h1>
          <p className="mt-3 max-w-[560px] text-[15px] leading-6 text-slate-600 sm:text-base">
            {submitted
              ? `${intake.firmName} has received your details and a member of the team will contact you.`
              : selectedService
                ? 'Share a few details below and the firm will get back to you.'
                : intake.introduction}
          </p>
        </section>

        {submitted ? (
          <section className="mx-auto mt-8 w-full max-w-[560px] rounded-[28px] border border-white/80 bg-white p-6 text-center shadow-[0_24px_70px_rgba(30,55,58,0.10)] sm:p-8" aria-live="polite">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={32} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-[#173238]">Enquiry received</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {submittedDuplicate
                ? 'This enquiry was already received, so no duplicate Lead was created.'
                : 'There is no need to submit again. Keep this page open if you would like to send a separate enquiry.'}
            </p>
            <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm text-slate-600">
              <span className="font-semibold text-slate-800">Service:</span> {service?.label}
            </div>
            <button
              type="button"
              onClick={startAnotherEnquiry}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[#173238] transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
            >
              Send another enquiry <ArrowRight size={17} aria-hidden="true" />
            </button>
          </section>
        ) : selectedService ? (
          <section className="mx-auto mt-7 w-full max-w-[620px] rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_24px_70px_rgba(30,55,58,0.10)] sm:p-8">
            <button
              type="button"
              onClick={returnToServices}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-slate-600 transition hover:text-[#173238] focus:outline-none focus:ring-4 focus:ring-slate-100"
            >
              <ArrowLeft size={17} aria-hidden="true" /> Back to services
            </button>

            <form className="mt-5 space-y-5" onSubmit={submitEnquiry} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <FieldLabel required>First name</FieldLabel>
                  <input
                    type="text"
                    name="first_name"
                    autoComplete="given-name"
                    required
                    maxLength={120}
                    value={form.firstName}
                    onChange={(event) => updateForm('firstName', event.target.value)}
                    className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100"
                    placeholder="Your first name"
                  />
                </label>
                <label className="grid gap-2">
                  <FieldLabel>Surname</FieldLabel>
                  <input
                    type="text"
                    name="last_name"
                    autoComplete="family-name"
                    maxLength={120}
                    value={form.lastName}
                    onChange={(event) => updateForm('lastName', event.target.value)}
                    className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100"
                    placeholder="Your surname"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <FieldLabel>Email address</FieldLabel>
                  <input
                    type="email"
                    name="email"
                    inputMode="email"
                    autoComplete="email"
                    maxLength={254}
                    value={form.email}
                    onChange={(event) => updateForm('email', event.target.value)}
                    className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100"
                    placeholder="name@example.com"
                  />
                </label>
                <label className="grid gap-2">
                  <FieldLabel>Mobile number</FieldLabel>
                  <input
                    type="tel"
                    name="phone"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={40}
                    value={form.phone}
                    onChange={(event) => updateForm('phone', event.target.value)}
                    className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100"
                    placeholder="e.g. 082 123 4567"
                  />
                </label>
              </div>
              <p className="-mt-3 text-xs leading-5 text-slate-500">Please provide at least one contact method.</p>

              <label className="grid gap-2">
                <FieldLabel>Property address <span className="font-normal text-slate-400">(optional)</span></FieldLabel>
                <input
                  type="text"
                  name="property_address"
                  autoComplete="street-address"
                  maxLength={1000}
                  value={form.propertyAddress}
                  onChange={(event) => updateForm('propertyAddress', event.target.value)}
                  className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100"
                  placeholder="Property address or area"
                />
              </label>

              {showQuoteFields ? (
                <div className="grid gap-4 rounded-[22px] border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <FieldLabel>Property value <span className="font-normal text-slate-400">(optional)</span></FieldLabel>
                    <div className="flex min-h-12 overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:border-[var(--journey-brand)] focus-within:ring-4 focus-within:ring-slate-100">
                      <span className="flex items-center border-r border-slate-100 px-3 text-sm font-semibold text-slate-500">R</span>
                      <input
                        type="number"
                        name="property_value"
                        inputMode="decimal"
                        min="0"
                        step="1000"
                        value={form.propertyValue}
                        onChange={(event) => updateForm('propertyValue', event.target.value)}
                        className="min-w-0 flex-1 border-0 px-3 text-base text-slate-900 outline-none"
                        placeholder="1 500 000"
                      />
                    </div>
                  </label>
                  <label className="grid gap-2">
                    <FieldLabel>Your role <span className="font-normal text-slate-400">(optional)</span></FieldLabel>
                    <select
                      name="party_role"
                      value={form.partyRole}
                      onChange={(event) => updateForm('partyRole', event.target.value)}
                      className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100"
                    >
                      <option value="unknown">Please select</option>
                      <option value="buyer">Buyer</option>
                      <option value="seller">Seller</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>
              ) : null}

              <label className="grid gap-2">
                <FieldLabel>How can the firm help? <span className="font-normal text-slate-400">(optional)</span></FieldLabel>
                <textarea
                  name="message"
                  rows={4}
                  maxLength={5000}
                  value={form.message}
                  onChange={(event) => updateForm('message', event.target.value)}
                  className="resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100"
                  placeholder="Share any useful details…"
                />
              </label>

              <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                <label>
                  Company website
                  <input
                    type="text"
                    name="company_website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.companyWebsite}
                    onChange={(event) => updateForm('companyWebsite', event.target.value)}
                  />
                </label>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
                <input
                  type="checkbox"
                  name="privacy_consent"
                  checked={form.privacyConsent}
                  onChange={(event) => updateForm('privacyConsent', event.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[var(--journey-brand)]"
                />
                <span className="text-[13px] leading-5 text-slate-600">
                  I consent to {intake.firmName} collecting and using these details to respond to my enquiry, in accordance with applicable privacy law.
                </span>
              </label>

              {formError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800" role="alert">
                  {formError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--journey-brand)] px-6 text-base font-semibold text-white shadow-[0_14px_30px_color-mix(in_srgb,var(--journey-brand)_24%,transparent)] transition hover:brightness-95 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-wait disabled:opacity-70"
              >
                {submitting ? (
                  <><LoaderCircle className="animate-spin" size={19} aria-hidden="true" /> Sending securely…</>
                ) : (
                  <>Send enquiry <ArrowRight size={19} aria-hidden="true" /></>
                )}
              </button>
            </form>
          </section>
        ) : (
          <section className="mx-auto mt-8 grid w-full max-w-[680px] gap-3 sm:grid-cols-2" aria-label="Legal services">
            {availableServices.map((serviceType) => {
              const option = SERVICE_OPTIONS[serviceType]
              const Icon = option.icon
              return (
                <button
                  key={serviceType}
                  type="button"
                  onClick={() => chooseService(serviceType)}
                  className="group flex min-h-[132px] items-start gap-4 rounded-[24px] border border-white/90 bg-white p-5 text-left shadow-[0_14px_40px_rgba(30,55,58,0.07)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-[0_18px_45px_rgba(30,55,58,0.11)] focus:outline-none focus:ring-4 focus:ring-slate-200"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--journey-brand)_10%,white)] text-[var(--journey-brand)]">
                    <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-[15px] font-semibold leading-5 text-[#173238]">
                      {option.label}
                      <ArrowRight className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[var(--journey-brand)]" size={17} aria-hidden="true" />
                    </span>
                    <span className="mt-2 block text-[13px] leading-5 text-slate-500">{option.description}</span>
                  </span>
                </button>
              )
            })}
          </section>
        )}

        <footer className="mt-auto pt-10 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500">
            {intake.contactEmail ? (
              <a className="inline-flex items-center gap-1.5 text-slate-500 hover:text-[var(--journey-brand)]" href={`mailto:${intake.contactEmail}`}>
                <Mail size={14} aria-hidden="true" /> {intake.contactEmail}
              </a>
            ) : null}
            {intake.contactPhone ? (
              <a className="inline-flex items-center gap-1.5 text-slate-500 hover:text-[var(--journey-brand)]" href={`tel:${intake.contactPhone.replace(/[^+0-9]/g, '')}`}>
                <Phone size={14} aria-hidden="true" /> {intake.contactPhone}
              </a>
            ) : null}
          </div>
          <p className="mt-4 inline-flex items-center justify-center gap-1.5 text-[11px] leading-5 text-slate-400">
            <BadgeCheck size={13} aria-hidden="true" /> Your information is sent securely to {intake.firmName}.
          </p>
        </footer>
      </div>
    </main>
  )
}
