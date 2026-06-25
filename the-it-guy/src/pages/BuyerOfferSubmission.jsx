import {
  AlertTriangle,
  ArrowRight,
  Bath,
  BedDouble,
  Car,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Home,
  LockKeyhole,
  Ruler,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getCanonicalOfferInviteContext,
  getOfferLifecycleSummary,
  submitCanonicalBuyerOffer,
} from '../lib/buyerLifecycleService'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import {
  getOfferInviteContext,
  OFFER_WORKFLOW_STATUS,
  normalizeOfferWorkflowStatus,
  submitBuyerOffer,
} from '../lib/listingOffersService'

const ARCH_GREEN = '#0F7A5A'
const WARM_WHITE = '#FAFAF8'
const PRIMARY_TEXT = '#111827'
const INTEREST_RATE = 0.1175
const LOAN_TERM_MONTHS = 240

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(value) {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not set'
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function normalizeText(value) {
  return String(value || '').trim()
}

function moneyInputValue(value) {
  if (value === null || value === undefined || value === '') return ''
  const numeric = Number(value)
  return Number.isFinite(numeric) ? String(numeric) : ''
}

function moneyNumber(value) {
  const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDateTime(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
}

function firstText(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function getMediaUrl(item) {
  if (!item) return ''
  if (typeof item === 'string') return normalizeText(item)
  return firstText(item.url, item.signedUrl, item.publicUrl, item.imageUrl, item.src, item.mediaUrl)
}

function getListingImageUrl(listing = {}) {
  const marketing = listing?.marketing && typeof listing.marketing === 'object' ? listing.marketing : {}
  const propertyDetails = listing?.propertyDetails && typeof listing.propertyDetails === 'object' ? listing.propertyDetails : {}
  const raw = listing?.raw && typeof listing.raw === 'object' ? listing.raw : {}
  const rawMarketing = raw?.marketing && typeof raw.marketing === 'object' ? raw.marketing : {}
  const onboardingFormData = raw?.onboarding?.formData && typeof raw.onboarding.formData === 'object' ? raw.onboarding.formData : {}
  const galleries = [
    ...(Array.isArray(listing.galleryImages) ? listing.galleryImages : []),
    ...(Array.isArray(listing.images) ? listing.images : []),
    ...(Array.isArray(listing.photos) ? listing.photos : []),
    ...(Array.isArray(marketing.imageGallery) ? marketing.imageGallery : []),
    ...(Array.isArray(marketing.image_gallery) ? marketing.image_gallery : []),
    ...(Array.isArray(rawMarketing.imageGallery) ? rawMarketing.imageGallery : []),
    ...(Array.isArray(propertyDetails.imageGallery) ? propertyDetails.imageGallery : []),
    ...(Array.isArray(onboardingFormData.imageGallery) ? onboardingFormData.imageGallery : []),
  ]
  return firstText(
    listing.imageUrl,
    listing.image_url,
    listing.heroImageUrl,
    listing.primaryImageUrl,
    listing.coverImageUrl,
    listing.thumbnailUrl,
    marketing.mediaUrl,
    marketing.media_url,
    rawMarketing.mediaUrl,
    getMediaUrl(galleries.find((item) => getMediaUrl(item))),
  )
}

function getListingTitle(listing = {}) {
  return firstText(listing.listingTitle, listing.title, listing.propertyAddress, listing.addressLine1, listing.address) || 'Selected Property'
}

function getListingAddress(listing = {}) {
  return [listing.propertyAddress, listing.addressLine1, listing.address, listing.suburb, listing.city]
    .map(normalizeText)
    .filter(Boolean)
    .join(', ') || 'Address pending'
}

function getListingPrice(listing = {}) {
  return moneyNumber(listing.askingPrice || listing.asking_price || listing.price || listing.estimatedValue || listing.estimated_value)
}

function getListingType(listing = {}) {
  return firstText(listing.propertyType, listing.property_type, listing.propertyStructureType, listing.listingCategory) || 'Residential Property'
}

function calculateMonthlyRepayment(loanAmount = 0) {
  if (!loanAmount) return 0
  const monthlyRate = INTEREST_RATE / 12
  return loanAmount * (monthlyRate * ((1 + monthlyRate) ** LOAN_TERM_MONTHS)) / (((1 + monthlyRate) ** LOAN_TERM_MONTHS) - 1)
}

function TextInput({ label, value, onChange, type = 'text', placeholder = '', inputMode, autoComplete }) {
  return (
    <label className="grid gap-2">
      <span className="text-[0.78rem] font-semibold text-[#4B5563]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        className="min-h-12 rounded-[16px] border border-[#E5E7EB] bg-white px-4 text-base font-semibold text-[#111827] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
      />
    </label>
  )
}

function SelectInput({ label, value, onChange, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-[0.78rem] font-semibold text-[#4B5563]">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="min-h-12 rounded-[16px] border border-[#E5E7EB] bg-white px-4 text-base font-semibold text-[#111827] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
      >
        {children}
      </select>
    </label>
  )
}

function PropertyFeature({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2 rounded-[16px] bg-[#F5F5F2] px-3 py-2 text-sm font-semibold text-[#374151]">
      <Icon size={16} />
      <span>{value} {label}</span>
    </div>
  )
}

function TrustItem({ children }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-[#374151]">
      <CheckCircle2 size={16} color={ARCH_GREEN} />
      <span>{children}</span>
    </div>
  )
}

function ProgressDots({ step }) {
  const labels = ['Offer', 'Details', 'Review']
  return (
    <div className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-[#FAFAF8]/95 px-4 py-3 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between">
        {labels.map((label, index) => {
          const active = step === index
          const done = step > index
          return (
            <div key={label} className="flex flex-1 items-center">
              <div className={`flex h-8 min-w-8 items-center justify-center rounded-full text-xs font-bold ${active || done ? 'bg-[#0F7A5A] text-white' : 'bg-white text-[#6B7280]'}`}>
                {done ? <CheckCircle2 size={14} /> : index + 1}
              </div>
              <span className={`ml-2 text-xs font-bold ${active ? 'text-[#111827]' : 'text-[#6B7280]'}`}>{label}</span>
              {index < labels.length - 1 ? <div className="mx-2 h-px flex-1 bg-[#E5E7EB]" /> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BuyerOfferSubmission() {
  const { token = '' } = useParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [canonicalContext, setCanonicalContext] = useState(null)
  const [canonicalLoading, setCanonicalLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mobileStep, setMobileStep] = useState(0)
  const [confirmedAccuracy, setConfirmedAccuracy] = useState(false)
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    idNumber: '',
    offerAmount: '',
    depositAmount: '',
    financeType: 'bond',
    bondAmount: '',
    cashContribution: '',
    needsBondAssistance: false,
    proofOfFundsUrl: '',
    suspensiveConditions: '',
    subjectToSale: false,
    subjectSaleProperty: '',
    subjectSaleTimeline: '',
    subjectSaleAgentInvolved: false,
    occupationDate: '',
    occupationalRent: false,
    includedFixtures: '',
    excludedFixtures: '',
    specialConditions: '',
    expiryDate: '',
    acknowledgeSellerReview: true,
    acknowledgeLegalDisclaimer: true,
    acknowledgeInfoAccuracy: true,
  })

  const legacyContext = useMemo(() => {
    void refreshKey
    return getOfferInviteContext(token)
  }, [token, refreshKey])

  useEffect(() => {
    let active = true
    if (legacyContext?.ok) {
      setCanonicalContext(null)
      return () => {
        active = false
      }
    }
    setCanonicalLoading(true)
    getCanonicalOfferInviteContext(token)
      .then((nextContext) => {
        if (active) setCanonicalContext(nextContext)
      })
      .catch(() => {
        if (active) setCanonicalContext({ ok: false, reason: 'not_found', invite: null, listing: null, offers: [] })
      })
      .finally(() => {
        if (active) setCanonicalLoading(false)
      })
    return () => {
      active = false
    }
  }, [legacyContext?.ok, refreshKey, token])

  const context = legacyContext?.ok ? legacyContext : (canonicalContext || legacyContext)
  const listing = context?.listing || null
  const invite = context?.invite || null
  const existingOffers = Array.isArray(context?.offers) ? context.offers : []
  const canonicalOffer = context?.source === 'canonical' ? (context?.canonicalOffer || existingOffers[0] || null) : null
  const canonicalLifecycle = context?.source === 'canonical' && canonicalOffer ? getOfferLifecycleSummary(canonicalOffer) : null
  const latestOffer = existingOffers
    .slice()
    .sort((left, right) => new Date(right?.updatedAt || right?.submittedAt || right?.createdAt || 0) - new Date(left?.updatedAt || left?.submittedAt || left?.createdAt || 0))[0] || null
  const latestStatus = normalizeOfferWorkflowStatus(latestOffer?.status || '')
  const counterPendingBuyer = canonicalLifecycle?.effectiveStatus === 'countered' || latestStatus === OFFER_WORKFLOW_STATUS.BUYER_REVIEW_COUNTER || latestStatus === OFFER_WORKFLOW_STATUS.COUNTERED
  const canSubmitCanonicalOffer = !canonicalLifecycle || canonicalLifecycle.buyerCanResubmit
  const financeType = String(form.financeType || '').toLowerCase()
  const askingPrice = getListingPrice(listing)
  const offerAmount = moneyNumber(form.offerAmount)
  const depositAmount = moneyNumber(form.depositAmount)
  const loanAmount = financeType === 'cash' ? 0 : Math.max(0, offerAmount - depositAmount)
  const ltv = offerAmount > 0 && loanAmount > 0 ? Math.round((loanAmount / offerAmount) * 100) : 0
  const belowAskingPercent = askingPrice > 0 && offerAmount > 0 ? ((askingPrice - offerAmount) / askingPrice) * 100 : 0
  const monthlyRepayment = calculateMonthlyRepayment(loanAmount)
  const expiryLabel = formatDate(form.expiryDate || invite?.expiresAt)
  const propertyImageUrl = getListingImageUrl(listing)
  const agentName = firstText(context?.canonicalOffer?.conditions?.agentName, invite?.agentName) || 'Assigned agent'
  const agencyName = firstText(context?.canonicalOffer?.conditions?.organisationName, context?.canonicalOffer?.conditions?.agencyName) || 'Arch9 Partner Agency'
  const submitButtonLabel = counterPendingBuyer ? 'Submit Revised Offer' : 'Submit Offer Securely'
  const offerStrength = useMemo(() => {
    const hasBuyerDetails = Boolean(form.fullName && form.email && form.phone)
    const checks = [
      { label: depositAmount > 0 ? 'Deposit Included' : 'Low Deposit', good: depositAmount > 0 },
      { label: financeType === 'cash' ? 'Cash Offer' : 'Bond Required', good: true },
      { label: hasBuyerDetails ? 'Buyer Details Ready' : 'Buyer Details Needed', good: hasBuyerDetails },
    ]
    const score = checks.filter((item) => item.good).length + (offerAmount > 0 && belowAskingPercent <= 5 ? 1 : 0)
    return {
      label: score >= 4 ? 'Excellent Offer' : score >= 2 ? 'Moderate Offer' : 'Needs Detail',
      tone: score >= 4 ? 'green' : score >= 2 ? 'amber' : 'slate',
      checks,
    }
  }, [belowAskingPercent, depositAmount, financeType, form.email, form.fullName, form.phone, offerAmount])

  const canonicalBanner = useMemo(() => {
    if (!canonicalLifecycle) return null
    if (canonicalLifecycle.effectiveStatus === 'countered') {
      return { tone: 'amber', text: 'Seller sent a counter offer. Update the terms below and submit a revised offer if you still want to proceed.' }
    }
    if (canonicalLifecycle.effectiveStatus === 'changes_requested') {
      return { tone: 'amber', text: 'The agent asked for changes before the offer goes back to the seller. Update the details and resubmit.' }
    }
    if (canonicalLifecycle.activeNegotiation) {
      return { tone: 'amber', text: canonicalLifecycle.blockedReason || 'This offer is already under review. Wait for feedback before sending another version.' }
    }
    if (canonicalLifecycle.acceptedOrConverted) {
      return { tone: 'green', text: canonicalLifecycle.blockedReason }
    }
    if (canonicalLifecycle.terminal && !canonicalLifecycle.buyerCanResubmit) {
      return { tone: 'red', text: canonicalLifecycle.blockedReason || 'This offer is closed. Ask the agent for a new secure link if negotiations restart.' }
    }
    return null
  }, [canonicalLifecycle])

  useEffect(() => {
    if (!context?.ok) return
    const conditions = context?.canonicalOffer?.conditions || {}
    setForm((previous) => ({
      ...previous,
      fullName: previous.fullName || conditions.buyerName || invite?.buyerLeadName || '',
      email: previous.email || conditions.buyerEmail || '',
      phone: previous.phone || conditions.buyerPhone || '',
    }))
  }, [context?.canonicalOffer?.conditions, context?.ok, invite?.buyerLeadName])

  useEffect(() => {
    if (!canonicalLifecycle?.counterTerms || !counterPendingBuyer) return
    const counterTerms = canonicalLifecycle.counterTerms || {}
    setForm((previous) => ({
      ...previous,
      offerAmount: previous.offerAmount || moneyInputValue(counterTerms.offerAmount || counterTerms.amount),
      depositAmount: previous.depositAmount || moneyInputValue(counterTerms.depositAmount),
      bondAmount: previous.bondAmount || moneyInputValue(counterTerms.bondAmount),
      cashContribution: previous.cashContribution || moneyInputValue(counterTerms.cashContribution),
      occupationDate: previous.occupationDate || normalizeText(counterTerms.occupationDate),
      expiryDate: previous.expiryDate || normalizeText(counterTerms.expiryDate),
      includedFixtures: previous.includedFixtures || normalizeText(counterTerms.includedFixtures),
      excludedFixtures: previous.excludedFixtures || normalizeText(counterTerms.excludedFixtures),
      specialConditions: previous.specialConditions || normalizeText(counterTerms.specialConditions || counterTerms.suspensiveConditions),
    }))
  }, [canonicalLifecycle?.counterTerms, counterPendingBuyer])

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function updateFinanceType(value) {
    setForm((previous) => ({
      ...previous,
      financeType: value,
      bondAmount: value === 'hybrid' ? previous.bondAmount : '',
      cashContribution: value === 'hybrid' ? previous.cashContribution : '',
      needsBondAssistance: ['bond', 'hybrid'].includes(value) ? previous.needsBondAssistance : false,
    }))
  }

  function validateForStep(nextStep) {
    if (nextStep > 0 && !offerAmount) {
      setErrorMessage('Enter your offer amount before continuing.')
      return false
    }
    if (nextStep > 1 && (!form.fullName || !form.email || !form.phone || !form.idNumber)) {
      setErrorMessage('Complete your buyer details before review.')
      return false
    }
    setErrorMessage('')
    return true
  }

  function goNext() {
    const next = Math.min(2, mobileStep + 1)
    if (validateForStep(next)) setMobileStep(next)
  }

  async function handleSubmitOffer(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    try {
      if (context?.source === 'canonical' && !canSubmitCanonicalOffer) {
        throw new Error(canonicalLifecycle?.blockedReason || 'This offer cannot be updated from this link anymore.')
      }
      if (!offerAmount) {
        throw new Error('Enter your offer amount before submitting.')
      }
      if (!form.fullName || !form.email || !form.phone || !form.idNumber) {
        throw new Error('Complete your buyer details before submitting.')
      }
      if (!confirmedAccuracy) {
        throw new Error('Please confirm the information is accurate before submitting.')
      }
      setSubmitting(true)
      let submittedOffer = null
      if (context?.source === 'canonical') {
        submittedOffer = await submitCanonicalBuyerOffer({ token, submission: form })
      } else {
        submittedOffer = await submitBuyerOffer({ token, mode: counterPendingBuyer ? 'counter_response' : 'new', submission: form })
      }
      await sendAgentOfferSubmittedNotification(submittedOffer).catch((notificationError) => {
        console.warn('[BUYER OFFER] agent offer submission notification failed', notificationError)
      })
      setSuccessMessage('Offer submitted successfully. The agent will review and forward it to the seller.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to submit offer right now.')
    } finally {
      setSubmitting(false)
    }
  }

  async function sendAgentOfferSubmittedNotification(offer = {}) {
    const conditions = context?.canonicalOffer?.conditions || offer?.conditions || {}
    const agentEmail = normalizeText(conditions.agentEmail || context?.invite?.agentEmail).toLowerCase()
    if (!agentEmail) return null

    const response = await invokeEdgeFunction('send-email', {
      body: {
        type: 'buyer_offer_submitted_agent',
        to: agentEmail,
        organisationId: normalizeText(offer?.organisationId || context?.canonicalOffer?.organisationId),
        leadId: normalizeText(offer?.buyerLeadId || context?.canonicalOffer?.buyerLeadId || context?.invite?.buyerLeadId),
        listingId: normalizeText(offer?.listingId || listing?.id || context?.canonicalOffer?.listingId),
        appointmentId: normalizeText(offer?.viewingAppointmentId || context?.canonicalOffer?.viewingAppointmentId),
        offerId: normalizeText(offer?.id),
        agentName: normalizeText(conditions.agentName || context?.invite?.agentName),
        buyerName: normalizeText(form.fullName || conditions.buyerName || context?.invite?.buyerLeadName),
        propertyTitle: getListingTitle(listing),
        offerAmount: formatCurrency(offer?.offerAmount || form.offerAmount),
        financeType: normalizeText(offer?.financeType || form.financeType),
        offerSubmittedAt: formatDateTime(offer?.buyerSubmittedAt || offer?.submittedAt || new Date().toISOString()),
        agentReviewUrl: normalizeText(conditions.agentReviewUrl),
        note: normalizeText(form.specialConditions || form.suspensiveConditions),
      },
    })
    if (response?.error || response?.data?.error) throw response.error || new Error(response.data.error)
    return response?.data || null
  }

  const propertySummary = (
    <aside className="overflow-hidden rounded-[24px] border border-[#E5E7EB] bg-white shadow-[0_18px_45px_rgba(17,24,39,0.06)]">
      <div className="relative aspect-[4/3] bg-[#F3F4F1]">
        {propertyImageUrl ? (
          <img src={propertyImageUrl} alt={getListingTitle(listing)} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#9CA3AF]">
            <Home size={42} />
          </div>
        )}
        <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#111827] backdrop-blur">
          Property
        </div>
      </div>
      <div className="space-y-5 p-5">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#111827]">{getListingTitle(listing)}</h2>
          <p className="mt-2 text-sm leading-6 text-[#6B7280]">{getListingAddress(listing)}</p>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-[#6B7280]">{getListingType(listing)}</span>
            <span className="text-lg font-bold text-[#111827]">{formatCurrency(askingPrice)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PropertyFeature icon={BedDouble} label="Beds" value={listing?.bedrooms} />
          <PropertyFeature icon={Bath} label="Baths" value={listing?.bathrooms} />
          <PropertyFeature icon={Car} label="Garages" value={listing?.garages} />
          <PropertyFeature icon={Ruler} label="m2 Erf" value={listing?.erfSize || listing?.erf_size} />
        </div>
        <div className="rounded-[20px] bg-[#F7F7F4] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#0F7A5A]">
              <UserRound size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-[#111827]">{agentName}</p>
              <p className="text-xs font-semibold text-[#6B7280]">{agencyName}</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )

  const offerHero = (
    <section className="relative overflow-hidden rounded-[28px] bg-[#111827] p-6 text-white shadow-[0_22px_60px_rgba(17,24,39,0.16)] md:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/55">Your Offer</p>
          <p className="mt-3 text-[3rem] font-semibold leading-none tracking-[-0.07em] md:text-[4rem]">{formatCurrency(offerAmount)}</p>
          <p className="mt-4 text-sm font-semibold text-white/65">
            {askingPrice && offerAmount
              ? belowAskingPercent > 0
                ? `${Math.abs(belowAskingPercent).toFixed(1)}% below asking price`
                : `${Math.abs(belowAskingPercent).toFixed(1)}% above asking price`
              : 'Enter your offer amount to calculate price position'}
          </p>
        </div>
        <div className={`rounded-[22px] border p-4 ${offerStrength.tone === 'green' ? 'border-emerald-300/30 bg-emerald-400/10' : offerStrength.tone === 'amber' ? 'border-amber-300/30 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}>
          <p className="text-sm font-bold">{offerStrength.label}</p>
          <div className="mt-3 grid gap-2">
            {offerStrength.checks.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs font-semibold text-white/75">
                {item.good ? <CheckCircle2 size={14} color="#34D399" /> : <AlertTriangle size={14} color="#FBBF24" />}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        {[
          ['Deposit Amount', formatCurrency(depositAmount)],
          ['Finance Type', financeType === 'cash' ? 'Cash' : financeType === 'hybrid' ? 'Hybrid' : 'Bond'],
          ['Expiry Date', expiryLabel],
          ['Offer Validity', form.expiryDate ? 'Time Limited' : 'Pending'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[18px] bg-white/8 p-4">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/45">{label}</p>
            <p className="mt-2 text-sm font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
    </section>
  )

  const buyerDetails = (
    <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 md:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#111827]">Buyer Details</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <TextInput label="Full Name" value={form.fullName} onChange={(event) => updateForm('fullName', event.target.value)} placeholder="Full legal name" autoComplete="name" />
        <TextInput label="ID / Passport" value={form.idNumber} onChange={(event) => updateForm('idNumber', event.target.value)} placeholder="ID or passport number" />
        <TextInput label="Email" type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="name@email.com" autoComplete="email" />
        <TextInput label="Phone" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} placeholder="082..." inputMode="tel" autoComplete="tel" />
      </div>
    </section>
  )

  const offerDetails = (
    <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 md:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#111827]">Offer Details</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <TextInput label="Offer Amount" value={form.offerAmount} onChange={(event) => updateForm('offerAmount', event.target.value)} placeholder="2500000" inputMode="decimal" />
        <TextInput label="Deposit Amount" value={form.depositAmount} onChange={(event) => updateForm('depositAmount', event.target.value)} placeholder="250000" inputMode="decimal" />
        <SelectInput label="Finance Type" value={form.financeType} onChange={(event) => updateFinanceType(event.target.value)}>
          <option value="cash">Cash</option>
          <option value="bond">Bond</option>
          <option value="hybrid">Hybrid</option>
        </SelectInput>
        <TextInput label="Expiry Date" type="date" value={form.expiryDate} onChange={(event) => updateForm('expiryDate', event.target.value)} />
      </div>
      <div className="mt-5 rounded-[22px] bg-[#F7F7F4] p-5">
        <p className="text-sm font-bold text-[#111827]">Financial Insights</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ['Estimated Repayment', formatCurrency(monthlyRepayment), '/ month'],
            ['Loan Amount', formatCurrency(loanAmount), ''],
            ['Loan to Value', ltv ? `${ltv}%` : '0%', ''],
            ['Interest Rate', `${(INTEREST_RATE * 100).toFixed(2)}%`, 'estimate'],
          ].map(([label, value, suffix]) => (
            <div key={label}>
              <p className="text-xs font-semibold text-[#6B7280]">{label}</p>
              <p className="mt-1 text-lg font-bold text-[#111827]">{value}</p>
              {suffix ? <p className="text-[0.68rem] font-semibold text-[#9CA3AF]">{suffix}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  )

  const trustSection = (
    <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 md:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#111827]">Why Buyers Trust Arch9</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <TrustItem>Secure Submission</TrustItem>
        <TrustItem>Time Stamped</TrustItem>
        <TrustItem>Seller Notified Instantly</TrustItem>
        <TrustItem>Legally Recorded</TrustItem>
        <TrustItem>All Offers Tracked</TrustItem>
      </div>
    </section>
  )

  const timeline = (
    <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 md:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#111827]">What Happens Next?</h2>
      <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
        {['Submit Offer', 'Seller Reviews', 'Counter Offer', 'Offer Accepted', 'OTP Generated'].map((item, index) => (
          <div key={item} className="min-w-[150px] rounded-[18px] bg-[#F7F7F4] p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F7A5A] text-sm font-bold text-white">{index + 1}</div>
            <p className="mt-3 text-sm font-bold text-[#111827]">{item}</p>
          </div>
        ))}
      </div>
    </section>
  )

  const reviewSection = (
    <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 md:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#111827]">Review & Submit</h2>
      <div className="mt-5 grid gap-3">
        {[
          ['Property', getListingTitle(listing)],
          ['Offer Amount', formatCurrency(offerAmount)],
          ['Deposit', formatCurrency(depositAmount)],
          ['Finance', financeType === 'cash' ? 'Cash' : financeType === 'hybrid' ? 'Hybrid' : 'Bond'],
          ['Buyer', form.fullName || 'Not captured'],
          ['Email', form.email || 'Not captured'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 border-b border-[#F0F1EF] py-3 text-sm">
            <span className="font-semibold text-[#6B7280]">{label}</span>
            <span className="text-right font-bold text-[#111827]">{value}</span>
          </div>
        ))}
      </div>
      <label className="mt-5 flex items-start gap-3 rounded-[18px] bg-[#F7F7F4] p-4 text-sm font-semibold text-[#374151]">
        <input type="checkbox" checked={confirmedAccuracy} onChange={(event) => setConfirmedAccuracy(event.target.checked)} className="mt-1" />
        <span>I confirm the information is accurate.</span>
      </label>
    </section>
  )

  if (canonicalLoading && !context?.ok) {
    return (
      <main className="min-h-screen bg-[#FAFAF8] px-4 py-8">
        <section className="mx-auto max-w-[760px] rounded-[24px] border border-[#E5E7EB] bg-white p-6 text-sm font-semibold text-[#6B7280]">
          Loading secure offer link...
        </section>
      </main>
    )
  }

  if (!context?.ok) {
    return (
      <main className="min-h-screen bg-[#FAFAF8] px-4 py-8">
        <section className="mx-auto max-w-[760px] rounded-[24px] border border-[#F4D4D4] bg-white p-6">
          <div className="flex items-start gap-3 text-[#B42318]">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <h1 className="text-xl font-semibold text-[#111827]">Offer link unavailable</h1>
              <p className="mt-2 text-sm text-[#6B7280]">
                {context?.reason === 'expired' ? 'This offer link has expired. Ask the agent to send a new secure offer link.' : 'This offer link is invalid or no longer active.'}
              </p>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main style={{ background: WARM_WHITE, color: PRIMARY_TEXT }} className="min-h-screen pb-32 md:pb-28">
      <ProgressDots step={mobileStep} />
      <form onSubmit={handleSubmitOffer}>
        <div className="mx-auto w-full max-w-[1360px] px-4 py-5 md:px-8 md:py-8">
          <header className="rounded-[26px] border border-[#E5E7EB] bg-white p-5 md:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0F7A5A]">Secure Buyer Offer</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-[#111827] md:text-5xl">Submit Your Offer</h1>
                <p className="mt-2 text-base font-medium text-[#6B7280]">Submit your offer for seller review.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 md:flex md:flex-wrap md:justify-end">
                {[
                  [ShieldCheck, 'Secure Token Active'],
                  [LockKeyhole, 'Encrypted'],
                  [Clock3, 'Time Stamped'],
                ].map(([Icon, label]) => (
                  <div key={label} className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-[#FAFAF8] px-3 py-2 text-xs font-bold text-[#374151]">
                    <Icon size={14} color={ARCH_GREEN} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </header>

          {counterPendingBuyer || canonicalBanner || errorMessage || successMessage ? (
            <div className="mt-4 grid gap-3">
              {counterPendingBuyer ? (
                <section className="rounded-[20px] border border-[#F5DBB0] bg-[#FFF8EC] px-4 py-3 text-sm font-semibold text-[#8A4B08]">
                  Seller sent a counter offer. Submit a revised offer to respond.
                </section>
              ) : null}
              {canonicalBanner ? (
                <section className={`rounded-[20px] px-4 py-3 text-sm font-semibold ${canonicalBanner.tone === 'green' ? 'border border-[#CFE8DC] bg-[#EDF9F0] text-[#17643A]' : canonicalBanner.tone === 'red' ? 'border border-[#F4D4D4] bg-[#FFF5F5] text-[#B42318]' : 'border border-[#F5DBB0] bg-[#FFF8EC] text-[#8A4B08]'}`}>
                  {canonicalBanner.text}
                </section>
              ) : null}
              {errorMessage ? <section className="rounded-[18px] border border-[#F4D4D4] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#B42318]">{errorMessage}</section> : null}
              {successMessage ? <section className="rounded-[18px] border border-[#CFE8DC] bg-[#EDF9F0] px-4 py-3 text-sm font-semibold text-[#17643A]">{successMessage}</section> : null}
            </div>
          ) : null}

          <div className="mt-5 hidden gap-6 md:grid md:grid-cols-[0.4fr_0.6fr]">
            <div>{propertySummary}</div>
            <div className="space-y-5">
              {offerHero}
              {buyerDetails}
              {offerDetails}
              {trustSection}
              {timeline}
              {reviewSection}
            </div>
          </div>

          <div className="mt-5 space-y-5 md:hidden">
            {mobileStep === 0 ? (
              <>
                {propertySummary}
                {offerHero}
                {offerDetails}
              </>
            ) : null}
            {mobileStep === 1 ? buyerDetails : null}
            {mobileStep === 2 ? (
              <>
                {reviewSection}
                {trustSection}
                {timeline}
              </>
            ) : null}
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E5E7EB] bg-white/95 px-4 py-3 shadow-[0_-16px_40px_rgba(17,24,39,0.08)] backdrop-blur supports-[padding:max(0px)]:pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-[1360px] items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileStep((step) => Math.max(0, step - 1))}
              className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] text-[#374151] md:hidden ${mobileStep === 0 ? 'invisible' : ''}`}
            >
              <ChevronLeft size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6B7280]">Offer Amount</p>
              <p className="truncate text-xl font-bold tracking-[-0.04em] text-[#111827]">{formatCurrency(offerAmount)}</p>
            </div>
            <button
              type={mobileStep === 2 ? 'submit' : 'button'}
              onClick={mobileStep === 2 ? undefined : goNext}
              disabled={submitting || (mobileStep === 2 && context?.source === 'canonical' && !canSubmitCanonicalOffer)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[18px] bg-[#0F7A5A] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(15,122,90,0.22)] transition hover:bg-[#0B654A] disabled:bg-[#9CA3AF] md:hidden"
            >
              {mobileStep === 2 ? (submitting ? 'Submitting...' : submitButtonLabel) : 'Continue'}
              {mobileStep === 2 ? <ShieldCheck size={16} /> : <ArrowRight size={16} />}
            </button>
            <button
              type="submit"
              disabled={submitting || (context?.source === 'canonical' && !canSubmitCanonicalOffer)}
              className="hidden min-h-12 min-w-[360px] items-center justify-center gap-2 rounded-[18px] bg-[#0F7A5A] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(15,122,90,0.22)] transition hover:bg-[#0B654A] disabled:bg-[#9CA3AF] md:inline-flex"
            >
              {submitting ? 'Submitting...' : submitButtonLabel}
              <ShieldCheck size={16} />
            </button>
          </div>
        </div>
      </form>
    </main>
  )
}

export default BuyerOfferSubmission
