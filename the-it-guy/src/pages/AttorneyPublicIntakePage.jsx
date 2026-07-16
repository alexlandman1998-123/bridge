import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Calculator,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  FileText,
  FileX2,
  Gavel,
  Home,
  KeyRound,
  Landmark,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Phone,
  RefreshCw,
  Scale,
  ScrollText,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ATTORNEY_LEAD_SERVICE_TYPES } from '../core/leads/attorneyLeadContract'
import { calculateTransferDuty, formatZar } from '../services/conveyancingCostCalculator'
import {
  ATTORNEY_PUBLIC_INTAKE_PRIVACY_VERSION,
  getOrCreateAttorneyIntakeIdempotencyKey,
  readAttorneyIntakeAttribution,
  resolveAttorneyPublicIntake,
  rotateAttorneyIntakeIdempotencyKey,
  submitAttorneyPublicIntake,
} from '../services/attorneyPublicIntakeService'

const JOURNEYS = Object.freeze({
  transfer_calculator: {
    label: 'Transfer cost calculator',
    description: 'Calculate indicative transfer duty before requesting a full quote',
    icon: Calculator,
    serviceType: ATTORNEY_LEAD_SERVICE_TYPES.transferQuote,
    detailed: true,
    featured: true,
  },
  transfer_quote: {
    label: 'Request a transfer quote',
    description: 'Send the property details for a firm-prepared cost estimate',
    icon: FileCheck2,
    serviceType: ATTORNEY_LEAD_SERVICE_TYPES.transferQuote,
    detailed: true,
  },
  buying_home: {
    label: 'Buying a home',
    description: 'Guidance from offer through to registration',
    icon: KeyRound,
    serviceType: ATTORNEY_LEAD_SERVICE_TYPES.propertyTransfer,
    detailed: true,
  },
  selling_property: {
    label: 'Selling a property',
    description: 'Start or discuss a transfer',
    icon: Home,
    serviceType: ATTORNEY_LEAD_SERVICE_TYPES.propertyTransfer,
    detailed: true,
  },
  bond_registration: {
    label: 'Registering a bond',
    description: 'New bond or refinance help',
    icon: Landmark,
    serviceType: ATTORNEY_LEAD_SERVICE_TYPES.bondRegistration,
    detailed: true,
  },
  bond_cancellation: {
    label: 'Cancelling a bond',
    description: 'Notice, figures and next steps',
    icon: FileX2,
    serviceType: ATTORNEY_LEAD_SERVICE_TYPES.bondCancellation,
    detailed: true,
  },
  property_advice: {
    label: 'Property legal advice',
    description: 'A question about property law',
    icon: Scale,
    serviceType: ATTORNEY_LEAD_SERVICE_TYPES.propertyLegalAdvice,
    detailed: false,
  },
})

const OTHER_PRACTICES = Object.freeze({
  litigation: { label: 'Litigation', description: 'Disputes and legal proceedings', icon: Gavel },
  family_law: { label: 'Family law', description: 'Personal and family matters', icon: Users },
  contract_law: { label: 'Contract law', description: 'Agreements and commercial advice', icon: FileText },
  trusts_estates: { label: 'Trusts & estates', description: 'Planning and administration', icon: ScrollText },
  notarial: { label: 'Notarial', description: 'Authentication and notarial work', icon: FileCheck2 },
  general_enquiry: { label: 'Something else', description: 'Tell us what you need', icon: MessageSquareText },
})

const GOAL_LABELS = Object.freeze({
  calculate_transfer_duty: 'Transfer cost calculator',
  request_transfer_quote: 'Request a transfer quote',
})

const INITIAL_FORM = Object.freeze({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  propertyAddress: '',
  propertyValue: '',
  goal: '',
  matterStage: '',
  financeType: '',
  bankName: '',
  existingBond: '',
  cancellationReason: '',
  cancellationNotice: '',
  timing: '',
  preferredContact: 'phone',
  message: '',
  privacyConsent: false,
  companyWebsite: '',
})

function FieldLabel({ children, required = false }) {
  return <span className="text-[13px] font-semibold text-slate-700">{children}{required ? <span className="ml-1 text-rose-600" aria-hidden="true">*</span> : null}</span>
}

function BrandMark({ intake }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const initials = intake.firmName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
  if (intake.logoUrl && !logoFailed) {
    return <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-transparent"><img src={intake.logoUrl} alt={`${intake.firmName} logo`} className="h-full w-full object-contain p-0.5" onError={() => setLogoFailed(true)} /></div>
  }
  return <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/20 text-xl font-bold text-white shadow-[0_12px_30px_rgba(15,23,42,0.10)]" style={{ backgroundColor: intake.primaryColour }} aria-label={`${intake.firmName} initials`}>{initials || <Building2 size={30} aria-hidden="true" />}</div>
}

function LoadingState() {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-[#f3f5f1] px-5 text-[#183238]"><div className="text-center" role="status"><LoaderCircle className="mx-auto animate-spin text-[#2d6266]" size={30} aria-hidden="true" /><p className="mt-4 text-sm font-medium text-slate-600">Preparing the firm’s enquiry page…</p></div></main>
}

function UnavailableState({ error, onRetry }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f3f5f1] px-5 py-10 text-[#183238]">
      <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-[0_24px_70px_rgba(15,23,42,0.09)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><CircleHelp size={27} aria-hidden="true" /></div>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">This enquiry page is unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{error || 'The link may be incorrect or temporarily disabled.'}</p>
        <button type="button" onClick={onRetry} className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f45] px-5 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#173f45]/20"><RefreshCw size={17} aria-hidden="true" /> Try again</button>
        <p className="mt-7 text-xs font-medium text-slate-400">Securely powered by ARCH9</p>
      </section>
    </main>
  )
}

function ChoiceGroup({ label, value, options, onChange, columns = 2 }) {
  return (
    <fieldset className="grid gap-2">
      <FieldLabel>{label}</FieldLabel>
      <div className={`grid gap-2 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
        {options.map((option) => (
          <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={`min-h-12 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition focus:outline-none focus:ring-4 focus:ring-slate-100 ${value === option.value ? 'border-[var(--journey-brand)] bg-[color-mix(in_srgb,var(--journey-brand)_8%,white)] text-[var(--journey-brand)]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function SelectField({ label, name, value, onChange, options, placeholder = 'Please select' }) {
  return (
    <label className="grid gap-2">
      <FieldLabel>{label}</FieldLabel>
      <select name={name} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100">
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function buildEnquirySummary(journeyKey, practiceKey, form) {
  const journey = JOURNEYS[journeyKey]
  const lines = [`Enquiry route: ${journey?.label || OTHER_PRACTICES[practiceKey]?.label || 'General enquiry'}`]
  const values = [
    ['Help requested', GOAL_LABELS[form.goal] || form.goal],
    ['Matter stage', form.matterStage],
    ['Finance', form.financeType],
    ['Bank', form.bankName],
    ['Existing bond', form.existingBond],
    ['Cancellation reason', form.cancellationReason],
    ['Cancellation notice given', form.cancellationNotice],
    ['Preferred timing', form.timing],
    ['Preferred contact', form.preferredContact],
  ]
  values.forEach(([label, value]) => { if (value) lines.push(`${label}: ${String(value).replaceAll('_', ' ')}`) })
  if (form.message.trim()) lines.push('', 'Client message:', form.message.trim())
  return lines.join('\n')
}

function buildIntakeContext(journeyKey, practiceKey, form) {
  return Object.fromEntries(Object.entries({
    journey_key: journeyKey || null,
    practice_key: practiceKey || null,
    goal: form.goal || null,
    matter_stage: form.matterStage || null,
    finance_type: form.financeType || null,
    bank_name: form.bankName.trim() || null,
    existing_bond: form.existingBond || null,
    cancellation_reason: form.cancellationReason || null,
    cancellation_notice: form.cancellationNotice || null,
    timing: form.timing || null,
    preferred_contact: form.preferredContact || null,
  }).filter(([, value]) => value !== null))
}

export default function AttorneyPublicIntakePage() {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [intake, setIntake] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [journeyKey, setJourneyKey] = useState('')
  const [practiceKey, setPracticeKey] = useState('')
  const [step, setStep] = useState('landing')
  const [form, setForm] = useState(INITIAL_FORM)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedDuplicate, setSubmittedDuplicate] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const attribution = useMemo(() => readAttorneyIntakeAttribution(searchParams), [searchParams])
  const journey = journeyKey ? JOURNEYS[journeyKey] : null
  const practice = practiceKey ? OTHER_PRACTICES[practiceKey] : null
  const selectedLabel = journey?.label || practice?.label || 'Legal enquiry'
  const selectedService = journey?.serviceType || ATTORNEY_LEAD_SERVICE_TYPES.generalEnquiry
  const transferDuty = journeyKey === 'transfer_calculator' && Number(form.propertyValue) > 0 ? calculateTransferDuty(form.propertyValue) : null

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => { if (!cancelled) { setLoading(true); setLoadError('') } })
    resolveAttorneyPublicIntake(slug).then((resolved) => { if (!cancelled) setIntake(resolved) }).catch((error) => { if (!cancelled) setLoadError(error?.message || 'The link may be incorrect or temporarily disabled.') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug, reloadKey])

  useEffect(() => {
    if (!intake?.firmName) return undefined
    const previousTitle = document.title
    document.title = `${intake.firmName} | Legal enquiry`
    return () => { document.title = previousTitle }
  }, [intake?.firmName])

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
    if (formError) setFormError('')
  }

  function resetJourney() {
    setJourneyKey(''); setPracticeKey(''); setStep('landing'); setForm(INITIAL_FORM); setFormError(''); setSubmitted(false); setSubmittedDuplicate(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function chooseJourney(key) {
    const goal = key === 'transfer_calculator' ? 'calculate_transfer_duty' : key === 'transfer_quote' ? 'request_transfer_quote' : ''
    setJourneyKey(key); setPracticeKey(''); setForm({ ...INITIAL_FORM, goal }); setFormError(''); setStep(JOURNEYS[key].detailed ? 'matter' : 'contact')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openPropertyServices() {
    setJourneyKey(''); setPracticeKey(''); setForm(INITIAL_FORM); setFormError(''); setStep('property')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function returnToPropertyServices() {
    setJourneyKey(''); setPracticeKey(''); setForm(INITIAL_FORM); setFormError(''); setStep('property')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function choosePractice(key) {
    setPracticeKey(key); setJourneyKey(''); setForm(INITIAL_FORM); setFormError(''); setStep('contact')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function continueToContact() {
    if (journeyKey === 'transfer_calculator' && !Number(form.propertyValue)) { setFormError('Enter the property value to calculate the transfer duty estimate.'); return }
    setFormError(''); setStep('contact'); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startAnotherEnquiry() {
    rotateAttorneyIntakeIdempotencyKey(slug, selectedService)
    resetJourney()
  }

  async function submitEnquiry(event) {
    event.preventDefault()
    if (submitting || (!journeyKey && !practiceKey)) return
    const firstName = form.firstName.trim(); const email = form.email.trim(); const phone = form.phone.trim()
    if (!firstName) { setFormError('Please enter your first name.'); return }
    if (!email && !phone) { setFormError('Please provide an email address or mobile number so the firm can contact you.'); return }
    if (!form.privacyConsent) { setFormError('Please accept the privacy consent to send your enquiry.'); return }
    setSubmitting(true); setFormError('')
    try {
      const idempotencyKey = getOrCreateAttorneyIntakeIdempotencyKey(slug, `${selectedService}:${journeyKey || practiceKey}`)
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
          property_value: form.propertyValue || null,
          party_role: journeyKey === 'buying_home' ? 'buyer' : journeyKey === 'selling_property' ? 'seller' : 'other',
          message: buildEnquirySummary(journeyKey, practiceKey, form),
          intake_context: buildIntakeContext(journeyKey, practiceKey, form),
          privacy_consent: true,
          privacy_policy_version: ATTORNEY_PUBLIC_INTAKE_PRIVACY_VERSION,
          company_website: form.companyWebsite,
          ...attribution,
        },
      })
      if (!result.accepted) throw new Error('We could not confirm your enquiry. Please try again.')
      setSubmittedDuplicate(result.duplicate); setSubmitted(true); window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setFormError(error?.message || 'We could not send your enquiry right now. Please try again.')
    } finally { setSubmitting(false) }
  }

  if (loading) return <LoadingState />
  if (!intake || loadError) return <UnavailableState error={loadError} onRetry={() => { setLoading(true); setLoadError(''); setReloadKey((value) => value + 1) }} />

  const enabledServices = new Set(intake.serviceTypes)
  const availableJourneys = Object.entries(JOURNEYS).filter(([, item]) => enabledServices.has(item.serviceType))
  const hasPropertyServices = availableJourneys.length > 0
  const canShowOtherPractices = enabledServices.has(ATTORNEY_LEAD_SERVICE_TYPES.generalEnquiry)
  const pageStyle = { '--journey-brand': intake.primaryColour, '--journey-accent': intake.secondaryColour }

  return (
    <main className="min-h-[100dvh] bg-[#f4f2ed] text-[#1d292b] antialiased" style={pageStyle}>
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[360px] bg-[radial-gradient(circle_at_18%_0%,color-mix(in_srgb,var(--journey-accent)_16%,transparent),transparent_42%),linear-gradient(180deg,color-mix(in_srgb,var(--journey-brand)_5%,#faf9f6),#f4f2ed_88%)]" />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[760px] flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
        <header className="flex items-center justify-between gap-3 rounded-[22px] border border-white/80 bg-white/75 px-3 py-2.5 shadow-[0_8px_30px_rgba(28,35,35,0.05)] backdrop-blur-xl">
          <BrandMark intake={intake} />
          <div className="flex min-w-0 flex-col items-end gap-1.5 text-right">
            {intake.contactEmail ? <a className="inline-flex max-w-[220px] items-center gap-1.5 truncate text-[11px] font-medium text-slate-600 transition hover:text-[var(--journey-brand)]" href={`mailto:${intake.contactEmail}`}><Mail size={13} className="shrink-0 text-slate-400" aria-hidden="true" /><span className="truncate">{intake.contactEmail}</span></a> : null}
            {intake.contactPhone ? <a className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 transition hover:text-[var(--journey-brand)]" href={`tel:${intake.contactPhone.replace(/[^+0-9]/g, '')}`}><Phone size={13} className="shrink-0 text-slate-400" aria-hidden="true" />{intake.contactPhone}</a> : null}
          </div>
        </header>

        <section className="mt-9 flex flex-col items-center text-center sm:mt-12">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--journey-brand)_65%,#64748b)]">
            {submitted ? 'Enquiry received' : step === 'landing' ? 'Legal support, made personal' : step === 'property' ? 'Property & conveyancing' : selectedLabel}
          </p>
          <h1 className="mt-3 max-w-[620px] text-[34px] font-semibold leading-[1.04] tracking-[-0.05em] text-[#182426] sm:text-[46px]">
            {submitted ? 'Thank you — we have your details.' : step === 'landing' ? 'How can we help?' : step === 'property' ? 'Property, from first question to registration.' : selectedLabel}
          </h1>
          <p className="mt-3 max-w-[530px] text-[14px] leading-6 text-slate-500 sm:text-[15px]">
            {submitted ? `${intake.firmName} has received your enquiry and will be in touch.` : step === 'landing' ? 'Select a practice area and we’ll guide you to the right person.' : step === 'property' ? 'Calculate costs, request a quote or tell us where you are in your property journey.' : step === 'matter' ? 'A few relevant details will help the right person assist you faster.' : 'Tell us how the team can reach you.'}
          </p>
        </section>

        {submitted ? (
          <section className="mx-auto mt-7 w-full max-w-[560px] rounded-[26px] border border-white/80 bg-white p-6 text-center shadow-[0_20px_60px_rgba(30,55,58,0.09)]" aria-live="polite">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={29} aria-hidden="true" /></div>
            <h2 className="mt-4 text-xl font-semibold">Enquiry received</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{submittedDuplicate ? 'This enquiry was already received, so no duplicate Lead was created.' : 'Your information has been securely sent to the firm.'}</p>
            <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm text-slate-600"><span className="font-semibold text-slate-800">Enquiry:</span> {selectedLabel}</div>
            <button type="button" onClick={startAnotherEnquiry} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[#173238]">Send another enquiry <ArrowRight size={17} aria-hidden="true" /></button>
          </section>
        ) : step === 'landing' ? (
          <div className="mx-auto mt-6 w-full max-w-[680px]">
            <section className="grid grid-cols-2 gap-3" aria-label="Legal practice areas">
              {hasPropertyServices ? <button type="button" onClick={openPropertyServices} className="group col-span-2 flex min-h-[150px] items-end justify-between overflow-hidden rounded-[24px] border border-[color-mix(in_srgb,var(--journey-brand)_78%,black)] bg-[var(--journey-brand)] p-5 text-left text-white shadow-[0_18px_45px_color-mix(in_srgb,var(--journey-brand)_18%,transparent)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-slate-300"><span><span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/15 bg-white/10"><Home size={21} strokeWidth={1.7} aria-hidden="true" /></span><span className="mt-5 block text-[18px] font-semibold tracking-[-0.02em]">Property & conveyancing</span><span className="mt-1 block text-[12px] leading-5 text-white/65">Calculators, transfers, bonds and cancellations</span></span><ArrowRight className="mb-1 shrink-0 text-white/70 transition group-hover:translate-x-1" size={21} aria-hidden="true" /></button> : null}
              {canShowOtherPractices ? Object.entries(OTHER_PRACTICES).map(([key, item]) => { const Icon = item.icon; return <button key={key} type="button" onClick={() => choosePractice(key)} className="group flex min-h-[138px] flex-col rounded-[22px] border border-[#e5e1d9] bg-white/90 p-4 text-left shadow-[0_10px_28px_rgba(28,35,35,0.045)] transition hover:-translate-y-0.5 hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-slate-200"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f2f0eb] text-slate-600"><Icon size={18} strokeWidth={1.7} aria-hidden="true" /></span><span className="mt-auto pt-4 text-[14px] font-semibold leading-5 text-[#253235]">{item.label}</span><span className="mt-1 text-[11px] leading-4 text-slate-400">{item.description}</span></button> }) : null}
            </section>
          </div>
        ) : step === 'property' ? (
          <section className="mx-auto mt-7 w-full max-w-[680px]">
            <button type="button" onClick={resetJourney} className="mb-4 inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"><ArrowLeft size={16} aria-hidden="true" /> All practice areas</button>
            <div className="grid grid-cols-2 gap-3" aria-label="Property and conveyancing services">
              {availableJourneys.map(([key, item]) => { const Icon = item.icon; return <button key={key} type="button" onClick={() => chooseJourney(key)} className={`group flex min-h-[145px] flex-col rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-slate-200 ${item.featured ? 'col-span-2 border-[color-mix(in_srgb,var(--journey-accent)_45%,#ded8cc)] bg-[color-mix(in_srgb,var(--journey-accent)_10%,white)] shadow-[0_12px_34px_rgba(28,35,35,0.055)]' : 'border-[#e5e1d9] bg-white/90 shadow-[0_10px_28px_rgba(28,35,35,0.04)]'}`}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[var(--journey-brand)] shadow-sm"><Icon size={19} strokeWidth={1.7} aria-hidden="true" /></span><span className="mt-auto pt-4 flex items-center justify-between gap-2 text-[14px] font-semibold leading-5 text-[#253235]">{item.label}<ChevronRight size={16} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5" aria-hidden="true" /></span><span className="mt-1 text-[11px] leading-4 text-slate-400">{item.description}</span></button> })}
            </div>
          </section>
        ) : step === 'matter' ? (
          <section className="mx-auto mt-6 w-full max-w-[620px] rounded-[26px] border border-white/80 bg-white p-5 shadow-[0_20px_60px_rgba(30,55,58,0.09)] sm:p-7">
            <button type="button" onClick={returnToPropertyServices} className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft size={17} aria-hidden="true" /> Property services</button>
            <div className="mt-4 space-y-5">
              {journeyKey === 'buying_home' ? <>
                <ChoiceGroup label="How will you fund the purchase?" value={form.financeType} onChange={(value) => updateForm('financeType', value)} options={[{ value: 'bond', label: 'Bond finance' }, { value: 'cash', label: 'Cash' }, { value: 'unsure', label: 'Not sure yet' }]} />
                <SelectField label="Where are you in the process?" name="matter_stage" value={form.matterStage} onChange={(value) => updateForm('matterStage', value)} options={[{ value: 'still_looking', label: 'Still looking' }, { value: 'offer_ready', label: 'Ready to make an offer' }, { value: 'offer_signed', label: 'Offer signed' }, { value: 'transfer_started', label: 'Transfer has started' }]} />
              </> : null}
              {journeyKey === 'selling_property' ? <>
                <ChoiceGroup label="Do you have a bond on the property?" value={form.existingBond} onChange={(value) => updateForm('existingBond', value)} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }]} />
                <SelectField label="Where are you in the process?" name="matter_stage" value={form.matterStage} onChange={(value) => updateForm('matterStage', value)} options={[{ value: 'planning_to_sell', label: 'Planning to sell' }, { value: 'property_listed', label: 'Property is listed' }, { value: 'offer_received', label: 'Offer received' }, { value: 'sale_signed', label: 'Sale agreement signed' }]} />
              </> : null}
              {journeyKey === 'bond_registration' ? <>
                <SelectField label="What is the bond status?" name="matter_stage" value={form.matterStage} onChange={(value) => updateForm('matterStage', value)} options={[{ value: 'considering_finance', label: 'Considering finance' }, { value: 'application_submitted', label: 'Application submitted' }, { value: 'approved', label: 'Bond approved' }, { value: 'attorney_instructed', label: 'Attorney instructed' }, { value: 'refinance', label: 'Refinancing' }]} />
                <label className="grid gap-2"><FieldLabel>Bank <span className="font-normal text-slate-400">(optional)</span></FieldLabel><input type="text" name="bank_name" maxLength={120} value={form.bankName} onChange={(event) => updateForm('bankName', event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 px-4 text-base outline-none focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100" placeholder="e.g. FNB" /></label>
              </> : null}
              {journeyKey === 'bond_cancellation' ? <>
                <SelectField label="Why are you cancelling the bond?" name="cancellation_reason" value={form.cancellationReason} onChange={(value) => updateForm('cancellationReason', value)} options={[{ value: 'selling_property', label: 'Selling the property' }, { value: 'bond_paid_off', label: 'Bond paid off' }, { value: 'refinancing', label: 'Refinancing' }, { value: 'other', label: 'Something else' }]} />
                <ChoiceGroup label="Have you given the bank cancellation notice?" value={form.cancellationNotice} onChange={(value) => updateForm('cancellationNotice', value)} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }]} />
                <label className="grid gap-2"><FieldLabel>Bank <span className="font-normal text-slate-400">(optional)</span></FieldLabel><input type="text" name="bank_name" maxLength={120} value={form.bankName} onChange={(event) => updateForm('bankName', event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 px-4 text-base outline-none focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100" placeholder="Your current bond bank" /></label>
              </> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2"><FieldLabel>{journeyKey === 'bond_registration' ? 'Bond amount' : 'Property value'} {journeyKey === 'transfer_calculator' ? <span className="ml-1 text-rose-600" aria-hidden="true">*</span> : <span className="font-normal text-slate-400">(optional)</span>}</FieldLabel><div className="flex min-h-12 overflow-hidden rounded-2xl border border-slate-200 focus-within:border-[var(--journey-brand)] focus-within:ring-4 focus-within:ring-slate-100"><span className="flex items-center border-r border-slate-100 px-3 text-sm font-semibold text-slate-500">R</span><input type="number" name="property_value" inputMode="decimal" min="0" step="1000" required={journeyKey === 'transfer_calculator'} value={form.propertyValue} onChange={(event) => updateForm('propertyValue', event.target.value)} className="min-w-0 flex-1 border-0 px-3 text-base outline-none" placeholder="1 500 000" /></div></label>
                <SelectField label="When do you need help?" name="timing" value={form.timing} onChange={(value) => updateForm('timing', value)} options={[{ value: 'as_soon_as_possible', label: 'As soon as possible' }, { value: 'within_a_month', label: 'Within a month' }, { value: 'exploring', label: 'I am exploring' }]} />
              </div>
              <label className="grid gap-2"><FieldLabel>Property address or area <span className="font-normal text-slate-400">(optional)</span></FieldLabel><input type="text" name="property_address" autoComplete="street-address" maxLength={1000} value={form.propertyAddress} onChange={(event) => updateForm('propertyAddress', event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 px-4 text-base outline-none focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100" placeholder="Address, suburb or development" /></label>
              {transferDuty !== null ? <div className="rounded-[20px] border border-emerald-100 bg-emerald-50/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Indicative SARS transfer duty</p><p className="mt-1 text-2xl font-semibold text-emerald-900">{formatZar(transferDuty)}</p><p className="mt-1 text-xs leading-5 text-emerald-800">This is transfer duty only, not a full conveyancing quote. The firm will confirm current rates, fees and whether VAT applies.</p></div> : null}
              {formError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{formError}</div> : null}
              <button type="button" onClick={continueToContact} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--journey-brand)] px-6 text-base font-semibold text-white">Continue <ArrowRight size={19} aria-hidden="true" /></button>
            </div>
          </section>
        ) : (
          <section className="mx-auto mt-6 w-full max-w-[620px] rounded-[26px] border border-white/80 bg-white p-5 shadow-[0_20px_60px_rgba(30,55,58,0.09)] sm:p-7">
            <button type="button" onClick={() => journey?.detailed ? setStep('matter') : journey ? returnToPropertyServices() : resetJourney()} className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft size={17} aria-hidden="true" /> {journey?.detailed ? 'Back to details' : journey ? 'Property services' : 'All practice areas'}</button>
            <form className="mt-4 space-y-5" onSubmit={submitEnquiry} noValidate>
              <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2"><FieldLabel required>First name</FieldLabel><input type="text" name="first_name" autoComplete="given-name" required maxLength={120} value={form.firstName} onChange={(event) => updateForm('firstName', event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 px-4 text-base outline-none focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100" placeholder="Your first name" /></label><label className="grid gap-2"><FieldLabel>Surname</FieldLabel><input type="text" name="last_name" autoComplete="family-name" maxLength={120} value={form.lastName} onChange={(event) => updateForm('lastName', event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 px-4 text-base outline-none focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100" placeholder="Your surname" /></label></div>
              <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2"><FieldLabel>Email address</FieldLabel><input type="email" name="email" inputMode="email" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => updateForm('email', event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 px-4 text-base outline-none focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100" placeholder="name@example.com" /></label><label className="grid gap-2"><FieldLabel>Mobile number</FieldLabel><input type="tel" name="phone" inputMode="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 px-4 text-base outline-none focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100" placeholder="e.g. 082 123 4567" /></label></div>
              <p className="-mt-3 text-xs leading-5 text-slate-500">Please provide at least one contact method.</p>
              <ChoiceGroup label="How should the firm contact you?" value={form.preferredContact} onChange={(value) => updateForm('preferredContact', value)} options={[{ value: 'phone', label: 'Phone' }, { value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp' }]} />
              <label className="grid gap-2"><FieldLabel>{practiceKey ? 'Briefly tell us what you need help with' : 'Anything else the firm should know?'} <span className="font-normal text-slate-400">(optional)</span></FieldLabel><textarea name="message" rows={4} maxLength={4000} value={form.message} onChange={(event) => updateForm('message', event.target.value)} className="resize-y rounded-2xl border border-slate-200 px-4 py-3 text-base leading-6 outline-none focus:border-[var(--journey-brand)] focus:ring-4 focus:ring-slate-100" placeholder="Share any useful details…" /></label>
              <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true"><label>Company website<input type="text" name="company_website" tabIndex={-1} autoComplete="off" value={form.companyWebsite} onChange={(event) => updateForm('companyWebsite', event.target.value)} /></label></div>
              <label className="flex cursor-pointer items-start gap-3 rounded-[20px] border border-slate-200 bg-slate-50/70 p-4"><input type="checkbox" name="privacy_consent" checked={form.privacyConsent} onChange={(event) => updateForm('privacyConsent', event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[var(--journey-brand)]" /><span className="text-[13px] leading-5 text-slate-600">I consent to {intake.firmName} collecting and using these details to respond to my enquiry, in accordance with applicable privacy law.</span></label>
              {formError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800" role="alert">{formError}</div> : null}
              <button type="submit" disabled={submitting} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--journey-brand)] px-6 text-base font-semibold text-white shadow-[0_14px_30px_color-mix(in_srgb,var(--journey-brand)_24%,transparent)] disabled:cursor-wait disabled:opacity-70">{submitting ? <><LoaderCircle className="animate-spin" size={19} aria-hidden="true" /> Sending securely…</> : <>Send enquiry <ArrowRight size={19} aria-hidden="true" /></>}</button>
            </form>
          </section>
        )}

        <footer className="mt-auto pt-9 text-center">
          <p className="inline-flex items-center justify-center gap-1.5 text-[11px] leading-5 text-slate-400"><BadgeCheck size={13} aria-hidden="true" /> Your information is sent securely to {intake.firmName}.</p>
          <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-300">Powered by ARCH9</p>
        </footer>
      </div>
    </main>
  )
}
