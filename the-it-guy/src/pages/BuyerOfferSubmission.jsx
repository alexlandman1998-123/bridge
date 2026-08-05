import {
  AlertTriangle,
  ArrowRight,
  Bath,
  BadgeCheck,
  BedDouble,
  Bookmark,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Home,
  LockKeyhole,
  Ruler,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import PremiumOnboardingLanding from '../components/onboarding/PremiumOnboardingLanding'
import {
  getCanonicalOfferInviteContext,
  getOfferLifecycleSummary,
  submitCanonicalBuyerOffer,
} from '../lib/buyerLifecycleService'
import { resolveOnboardingBranding } from '../lib/onboardingBranding'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import {
  getOfferInviteContext,
  OFFER_WORKFLOW_STATUS,
  normalizeOfferWorkflowStatus,
  submitBuyerOffer,
} from '../lib/listingOffersService'
import { resolveOtpDocumentVariant } from '../core/documents/otpRouteUniverse'

const ARCH_GREEN = '#0F7A5A'
const WARM_WHITE = '#FAFAF8'
const PRIMARY_TEXT = '#111827'
const INTEREST_RATE = 0.1175
const LOAN_TERM_MONTHS = 240
const BUYER_OFFER_DRAFT_VERSION = 1
const BUYER_OFFER_STAGES = ['landing', 'offer', 'onboarding', 'review', 'complete']
const BUYER_OFFER_PROGRESS = [
  { key: 'offer', label: 'Offer' },
  { key: 'onboarding', label: 'Buyer' },
  { key: 'review', label: 'Review' },
]

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

function getBuyerOfferDraftKey(token = '') {
  const safeToken = normalizeText(token)
  return safeToken ? `arch9:buyer-offer-onboarding-draft:${safeToken}` : ''
}

function readBuyerOfferDraft(token = '') {
  const key = getBuyerOfferDraftKey(token)
  if (!key || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== BUYER_OFFER_DRAFT_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

function writeBuyerOfferDraft(token = '', draft = {}) {
  const key = getBuyerOfferDraftKey(token)
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify({
      version: BUYER_OFFER_DRAFT_VERSION,
      ...draft,
      savedAt: new Date().toISOString(),
    }))
  } catch {
    // Local resume is helpful but should never block the public offer flow.
  }
}

function clearBuyerOfferDraft(token = '') {
  const key = getBuyerOfferDraftKey(token)
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore storage failures.
  }
}

function normalizeStage(value = '', fallback = 'landing') {
  const stage = normalizeText(value).toLowerCase()
  return BUYER_OFFER_STAGES.includes(stage) ? stage : fallback
}

function getMediaUrl(item) {
  if (!item) return ''
  if (typeof item === 'string') return normalizeText(item)
  return firstText(item.url, item.signedUrl, item.publicUrl, item.imageUrl, item.src, item.mediaUrl)
}

function getListingImageUrl(listing = {}) {
  const safeListing = listing && typeof listing === 'object' ? listing : {}
  const marketing = safeListing.marketing && typeof safeListing.marketing === 'object' ? safeListing.marketing : {}
  const propertyDetails = safeListing.propertyDetails && typeof safeListing.propertyDetails === 'object' ? safeListing.propertyDetails : {}
  const raw = safeListing.raw && typeof safeListing.raw === 'object' ? safeListing.raw : {}
  const rawMarketing = raw?.marketing && typeof raw.marketing === 'object' ? raw.marketing : {}
  const onboardingFormData = raw?.onboarding?.formData && typeof raw.onboarding.formData === 'object' ? raw.onboarding.formData : {}
  const galleries = [
    ...(Array.isArray(safeListing.galleryImages) ? safeListing.galleryImages : []),
    ...(Array.isArray(safeListing.images) ? safeListing.images : []),
    ...(Array.isArray(safeListing.photos) ? safeListing.photos : []),
    ...(Array.isArray(marketing.imageGallery) ? marketing.imageGallery : []),
    ...(Array.isArray(marketing.image_gallery) ? marketing.image_gallery : []),
    ...(Array.isArray(rawMarketing.imageGallery) ? rawMarketing.imageGallery : []),
    ...(Array.isArray(propertyDetails.imageGallery) ? propertyDetails.imageGallery : []),
    ...(Array.isArray(onboardingFormData.imageGallery) ? onboardingFormData.imageGallery : []),
  ]
  return firstText(
    safeListing.imageUrl,
    safeListing.image_url,
    safeListing.heroImageUrl,
    safeListing.primaryImageUrl,
    safeListing.coverImageUrl,
    safeListing.thumbnailUrl,
    marketing.mediaUrl,
    marketing.media_url,
    rawMarketing.mediaUrl,
    getMediaUrl(galleries.find((item) => getMediaUrl(item))),
  )
}

function getListingTitle(listing = {}) {
  const safeListing = listing && typeof listing === 'object' ? listing : {}
  return firstText(safeListing.listingTitle, safeListing.title, safeListing.propertyAddress, safeListing.addressLine1, safeListing.address) || 'Selected Property'
}

function getListingAddress(listing = {}) {
  const safeListing = listing && typeof listing === 'object' ? listing : {}
  return [safeListing.propertyAddress, safeListing.addressLine1, safeListing.address, safeListing.suburb, safeListing.city]
    .map(normalizeText)
    .filter(Boolean)
    .join(', ') || 'Address pending'
}

function getListingPrice(listing = {}) {
  const safeListing = listing && typeof listing === 'object' ? listing : {}
  return moneyNumber(safeListing.askingPrice || safeListing.asking_price || safeListing.price || safeListing.estimatedValue || safeListing.estimated_value)
}

function getListingType(listing = {}) {
  const safeListing = listing && typeof listing === 'object' ? listing : {}
  return firstText(safeListing.propertyType, safeListing.property_type, safeListing.propertyStructureType, safeListing.listingCategory) || 'Residential Property'
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

function TextAreaInput({ label, value, onChange, placeholder = '' }) {
  return (
    <label className="grid gap-2">
      <span className="text-[0.78rem] font-semibold text-[#4B5563]">{label}</span>
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={3}
        className="min-h-[96px] rounded-[16px] border border-[#E5E7EB] bg-white px-4 py-3 text-base font-semibold text-[#111827] outline-none transition focus:border-[#0F7A5A] focus:ring-4 focus:ring-[#0F7A5A]/10"
      />
    </label>
  )
}

function PropertyFeature({ icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2 rounded-[16px] bg-[#F5F5F2] px-3 py-2 text-sm font-semibold text-[#374151]">
      {createElement(icon, { size: 16 })}
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

function ProgressDots({ stage }) {
  const activeIndex = Math.max(0, BUYER_OFFER_PROGRESS.findIndex((item) => item.key === stage))
  return (
    <div className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-[#FAFAF8]/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        {BUYER_OFFER_PROGRESS.map((item, index) => {
          const active = activeIndex === index
          const done = activeIndex > index || stage === 'complete'
          return (
            <div key={item.key} className="flex flex-1 items-center">
              <div className={`flex h-8 min-w-8 items-center justify-center rounded-full text-xs font-bold ${active || done ? 'bg-[#0F7A5A] text-white' : 'bg-white text-[#6B7280]'}`}>
                {done ? <CheckCircle2 size={14} /> : index + 1}
              </div>
              <span className={`ml-2 text-xs font-bold ${active ? 'text-[#111827]' : 'text-[#6B7280]'}`}>{item.label}</span>
              {index < BUYER_OFFER_PROGRESS.length - 1 ? <div className="mx-2 h-px flex-1 bg-[#E5E7EB]" /> : null}
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
  const [flowStage, setFlowStage] = useState('landing')
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [activeBuyerSection, setActiveBuyerSection] = useState('overview')
  const [confirmedAccuracy, setConfirmedAccuracy] = useState(false)
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    idNumber: '',
    offerAmount: '',
    depositAmount: '',
    financeType: 'bond',
    otpDocumentVariant: '',
    bondAmount: '',
    cashContribution: '',
    needsBondAssistance: false,
    proofOfFundsUrl: '',
    depositDueDate: '',
    bondApprovalDeadline: '',
    cashProofDeadline: '',
    guaranteeDeliveryDeadline: '',
    guaranteeDeliveryPeriod: '',
    suspensiveConditions: '',
    subjectToSale: false,
    subjectSaleProperty: '',
    subjectSaleTimeline: '',
    subjectSaleMinimumPrice: '',
    subjectSaleFulfilmentDate: '',
    subjectSaleAgentInvolved: false,
    occupationDate: '',
    occupationalRent: false,
    occupationalRentAmount: '',
    includedFixtures: '',
    excludedFixtures: '',
    specialConditions: '',
    acknowledgeDevelopmentRules: false,
    acknowledgeNhbrcWarranty: false,
    acknowledgeBodyCorporateRules: false,
    acknowledgeUtilityConnectionCharges: false,
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
  const otpDocumentVariant = form.otpDocumentVariant || resolveOtpDocumentVariant({
    placeholders: {
      otpDocumentVariant: invite?.otpDocumentVariant || canonicalOffer?.conditions?.otpDocumentVariant,
      transactionType: invite?.transactionType || canonicalOffer?.conditions?.transactionType,
    },
    property: listing || {},
    transaction: canonicalOffer || {},
  })
  const isDevelopmentOffer = otpDocumentVariant === 'new_development'
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
  const offerBrand = useMemo(() => {
    const conditions = context?.canonicalOffer?.conditions || {}
    const resolved = resolveOnboardingBranding(conditions, listing || {}, invite || {})
    return {
      ...resolved,
      organisationName: resolved.organisationName || agencyName,
    }
  }, [agencyName, context?.canonicalOffer?.conditions, invite, listing])
  const submitButtonLabel = counterPendingBuyer ? 'Submit Revised Offer' : 'Submit Offer + Onboarding'
  const buyerSectionCards = useMemo(() => {
    const personalComplete = Boolean(form.fullName && form.idNumber)
    const contactComplete = Boolean(form.email && form.phone)
    const financeComplete = Boolean(form.financeType && (financeType === 'cash' || form.bondAmount || loanAmount))
    const complianceComplete = Boolean(confirmedAccuracy)
    return [
      {
        key: 'personal',
        title: 'Personal Details',
        description: 'Your legal name and ID or passport number.',
        complete: personalComplete,
        fields: ['fullName', 'idNumber'],
      },
      {
        key: 'contact',
        title: 'Contact Information',
        description: 'How your agent can reach you about this offer.',
        complete: contactComplete,
        fields: ['email', 'phone'],
      },
      {
        key: 'finance',
        title: 'Finance Readiness',
        description: 'Finance route and buyer-side funding signals.',
        complete: financeComplete,
        fields: ['financeType', 'bondAmount', 'cashContribution', 'proofOfFundsUrl'],
      },
      {
        key: 'compliance',
        title: 'ID & FICA',
        description: 'A light compliance check before review.',
        complete: complianceComplete,
        fields: ['confirmedAccuracy'],
      },
    ]
  }, [confirmedAccuracy, financeType, form.bondAmount, form.cashContribution, form.email, form.financeType, form.fullName, form.idNumber, form.phone, form.proofOfFundsUrl, loanAmount])
  const buyerCompletion = buyerSectionCards.filter((item) => item.complete).length
  const hasDraft = useMemo(() => Boolean(readBuyerOfferDraft(token)), [token, draftLoaded])
  const stageIndex = BUYER_OFFER_STAGES.indexOf(flowStage)
  const previousStage = stageIndex > 1 ? BUYER_OFFER_STAGES[stageIndex - 1] : 'offer'
  const offerAmountLabel = offerAmount > 0 ? formatCurrency(offerAmount) : 'Pending'
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
    if (!context?.ok || draftLoaded) return
    const conditions = context?.canonicalOffer?.conditions || {}
    const draft = readBuyerOfferDraft(token)
    const draftForm = draft?.form && typeof draft.form === 'object' ? draft.form : {}
    setForm((previous) => ({
      ...previous,
      fullName: draftForm.fullName || previous.fullName || conditions.buyerName || invite?.buyerLeadName || '',
      email: draftForm.email || previous.email || conditions.buyerEmail || '',
      phone: draftForm.phone || previous.phone || conditions.buyerPhone || '',
      ...draftForm,
      otpDocumentVariant: draftForm.otpDocumentVariant || previous.otpDocumentVariant || conditions.otpDocumentVariant || invite?.otpDocumentVariant || resolveOtpDocumentVariant({ property: listing || {}, transaction: canonicalOffer || {} }),
    }))
    setConfirmedAccuracy(Boolean(draft?.confirmedAccuracy))
    setFlowStage(normalizeStage(draft?.stage, 'landing'))
    setActiveBuyerSection(normalizeText(draft?.activeBuyerSection) || 'overview')
    setDraftLoaded(true)
  }, [canonicalOffer, context?.canonicalOffer?.conditions, context?.ok, draftLoaded, invite?.buyerLeadName, invite?.otpDocumentVariant, listing, token])

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

  useEffect(() => {
    setDraftLoaded(false)
    setFlowStage('landing')
    setActiveBuyerSection('overview')
  }, [token])

  useEffect(() => {
    if (!context?.ok || !draftLoaded || flowStage === 'complete') return
    writeBuyerOfferDraft(token, {
      stage: flowStage,
      activeBuyerSection,
      form,
      confirmedAccuracy,
    })
  }, [activeBuyerSection, confirmedAccuracy, context?.ok, draftLoaded, flowStage, form, token])

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

  function validateStageTransition(nextStage) {
    if (['onboarding', 'review'].includes(nextStage) && !offerAmount) {
      setErrorMessage('Enter your offer amount before continuing.')
      return false
    }
    if (nextStage === 'review' && (!form.fullName || !form.email || !form.phone || !form.idNumber)) {
      setErrorMessage('Complete your buyer details before review.')
      return false
    }
    setErrorMessage('')
    return true
  }

  function goToStage(nextStage) {
    const normalizedStage = normalizeStage(nextStage, flowStage)
    if (!validateStageTransition(normalizedStage)) return
    setFlowStage(normalizedStage)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function goNext() {
    if (flowStage === 'landing') {
      goToStage('offer')
      return
    }
    if (flowStage === 'offer') {
      goToStage('onboarding')
      return
    }
    if (flowStage === 'onboarding') {
      goToStage('review')
    }
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
      const submission = { ...form, otpDocumentVariant }
      setSubmitting(true)
      let submittedOffer = null
      if (context?.source === 'canonical') {
        submittedOffer = await submitCanonicalBuyerOffer({ token, submission })
      } else {
        submittedOffer = await submitBuyerOffer({ token, mode: counterPendingBuyer ? 'counter_response' : 'new', submission })
      }
      await sendAgentOfferSubmittedNotification(submittedOffer).catch((notificationError) => {
        console.warn('[BUYER OFFER] agent offer submission notification failed', notificationError)
      })
      clearBuyerOfferDraft(token)
      setSuccessMessage('Offer submitted successfully. The agent will review any conditions before OTP generation.')
      setFlowStage('complete')
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
          ['OTP Route', isDevelopmentOffer ? 'New Development' : 'Normal Sale'],
          ['Expiry Date', expiryLabel],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[18px] bg-white/8 p-4">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/45">{label}</p>
            <p className="mt-2 text-sm font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
    </section>
  )

  const buyerOnboardingWorkspace = (
    <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F7A5A]">Buyer onboarding</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[#111827]">Tell us about yourself.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280]">
            Complete each section before review. Your progress is saved on this device.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[#EEF6F2] px-3 py-1.5 text-xs font-bold text-[#0F7A5A]">{buyerCompletion} of {buyerSectionCards.length} complete</span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {buyerSectionCards.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveBuyerSection(section.key)}
            className={`rounded-[20px] border p-4 text-left transition ${activeBuyerSection === section.key ? 'border-[#0F7A5A] bg-[#F2FBF7]' : 'border-[#E5E7EB] bg-[#FAFAF8] hover:border-[#B8D8C9]'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#111827]">{section.title}</p>
                <p className="mt-1 text-xs leading-5 text-[#6B7280]">{section.description}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.68rem] font-bold ${section.complete ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-white text-[#6B7280]'}`}>
                {section.complete ? 'Complete' : 'Not started'}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-[22px] border border-[#E5E7EB] bg-white p-4">
        {activeBuyerSection === 'overview' ? (
          <p className="text-sm leading-6 text-[#6B7280]">Choose a section above to complete or update your buyer details.</p>
        ) : null}
        {activeBuyerSection === 'personal' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Full Name" value={form.fullName} onChange={(event) => updateForm('fullName', event.target.value)} placeholder="Full legal name" autoComplete="name" />
            <TextInput label="ID / Passport" value={form.idNumber} onChange={(event) => updateForm('idNumber', event.target.value)} placeholder="ID or passport number" />
          </div>
        ) : null}
        {activeBuyerSection === 'contact' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Email" type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="name@email.com" autoComplete="email" />
            <TextInput label="Phone" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} placeholder="082..." inputMode="tel" autoComplete="tel" />
          </div>
        ) : null}
        {activeBuyerSection === 'finance' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <SelectInput label="Finance Type" value={form.financeType} onChange={(event) => updateFinanceType(event.target.value)}>
              <option value="cash">Cash</option>
              <option value="bond">Bond</option>
              <option value="hybrid">Hybrid</option>
            </SelectInput>
            {financeType !== 'cash' ? <TextInput label="Bond Amount" value={form.bondAmount} onChange={(event) => updateForm('bondAmount', event.target.value)} placeholder="2250000" inputMode="decimal" /> : null}
            {financeType !== 'bond' ? <TextInput label="Cash Contribution" value={form.cashContribution} onChange={(event) => updateForm('cashContribution', event.target.value)} placeholder="250000" inputMode="decimal" /> : null}
            <TextInput label="Proof of Funds URL" value={form.proofOfFundsUrl} onChange={(event) => updateForm('proofOfFundsUrl', event.target.value)} placeholder="Optional document link" />
          </div>
        ) : null}
        {activeBuyerSection === 'compliance' ? (
          <label className="flex items-start gap-3 rounded-[18px] bg-[#F7F7F4] p-4 text-sm font-semibold text-[#374151]">
            <input type="checkbox" checked={confirmedAccuracy} onChange={(event) => setConfirmedAccuracy(event.target.checked)} className="mt-1" />
            <span>I confirm the information captured so far is accurate.</span>
          </label>
        ) : null}
      </div>

      <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#F7F7F4] px-3 py-2 text-xs font-bold text-[#374151]">
        <LockKeyhole size={14} color={ARCH_GREEN} />
        Your information is secure and encrypted.
      </p>
    </section>
  )

  const offerDetails = (
    <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 md:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#111827]">Offer Details</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <TextInput label="Offer Amount" value={form.offerAmount} onChange={(event) => updateForm('offerAmount', event.target.value)} placeholder="2500000" inputMode="decimal" />
        <TextInput label="Deposit Amount" value={form.depositAmount} onChange={(event) => updateForm('depositAmount', event.target.value)} placeholder="250000" inputMode="decimal" />
        <TextInput label="Deposit Due Date" type="date" value={form.depositDueDate} onChange={(event) => updateForm('depositDueDate', event.target.value)} />
        <SelectInput label="Finance Type" value={form.financeType} onChange={(event) => updateFinanceType(event.target.value)}>
          <option value="cash">Cash</option>
          <option value="bond">Bond</option>
          <option value="hybrid">Hybrid</option>
        </SelectInput>
        {financeType !== 'cash' ? (
          <>
            <TextInput label="Bond Amount" value={form.bondAmount} onChange={(event) => updateForm('bondAmount', event.target.value)} placeholder="2250000" inputMode="decimal" />
            <TextInput label="Bond Approval Deadline" type="date" value={form.bondApprovalDeadline} onChange={(event) => updateForm('bondApprovalDeadline', event.target.value)} />
          </>
        ) : null}
        {financeType !== 'bond' ? (
          <TextInput label="Cash Proof Deadline" type="date" value={form.cashProofDeadline} onChange={(event) => updateForm('cashProofDeadline', event.target.value)} />
        ) : null}
        <TextInput label="Guarantee Delivery Deadline" type="date" value={form.guaranteeDeliveryDeadline} onChange={(event) => updateForm('guaranteeDeliveryDeadline', event.target.value)} />
        <TextInput label="Occupation Date" type="date" value={form.occupationDate} onChange={(event) => updateForm('occupationDate', event.target.value)} />
        <TextInput label="Expiry Date" type="date" value={form.expiryDate} onChange={(event) => updateForm('expiryDate', event.target.value)} />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="flex min-h-12 items-center gap-3 rounded-[16px] border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#374151]">
          <input type="checkbox" checked={form.occupationalRent} onChange={(event) => updateForm('occupationalRent', event.target.checked)} />
          <span>Occupational rent applies</span>
        </label>
        {form.occupationalRent ? (
          <TextInput label="Occupational Rent Amount" value={form.occupationalRentAmount} onChange={(event) => updateForm('occupationalRentAmount', event.target.value)} placeholder="18000" inputMode="decimal" />
        ) : null}
        <label className="flex min-h-12 items-center gap-3 rounded-[16px] border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#374151]">
          <input type="checkbox" checked={form.subjectToSale} onChange={(event) => updateForm('subjectToSale', event.target.checked)} />
          <span>Subject to sale of another property</span>
        </label>
      </div>
      {form.subjectToSale ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextInput label="Property To Be Sold" value={form.subjectSaleProperty} onChange={(event) => updateForm('subjectSaleProperty', event.target.value)} placeholder="Address or property description" />
          <TextInput label="Minimum Sale Price" value={form.subjectSaleMinimumPrice} onChange={(event) => updateForm('subjectSaleMinimumPrice', event.target.value)} placeholder="2000000" inputMode="decimal" />
          <TextInput label="Fulfilment Date" type="date" value={form.subjectSaleFulfilmentDate} onChange={(event) => updateForm('subjectSaleFulfilmentDate', event.target.value)} />
          <TextInput label="Timeline Note" value={form.subjectSaleTimeline} onChange={(event) => updateForm('subjectSaleTimeline', event.target.value)} placeholder="For example, within 90 days" />
        </div>
      ) : null}
      <details className="mt-5 rounded-[22px] border border-[#E5E7EB] bg-[#FBFCFA] p-4">
        <summary className="cursor-pointer list-none text-sm font-bold text-[#111827]">
          Conditions
          <span className="ml-2 rounded-full bg-[#EEF6F2] px-2 py-1 text-[0.68rem] font-bold text-[#0F7A5A]">
            {[form.includedFixtures, form.excludedFixtures, form.suspensiveConditions, form.specialConditions].filter((value) => normalizeText(value)).length} added
          </span>
        </summary>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextAreaInput label="Included Fixtures" value={form.includedFixtures} onChange={(event) => updateForm('includedFixtures', event.target.value)} placeholder="Fixtures the buyer wants included" />
          <TextAreaInput label="Excluded Fixtures" value={form.excludedFixtures} onChange={(event) => updateForm('excludedFixtures', event.target.value)} placeholder="Fixtures the seller may remove" />
          <TextAreaInput label="Other Suspensive Conditions" value={form.suspensiveConditions} onChange={(event) => updateForm('suspensiveConditions', event.target.value)} placeholder="Only add deal-specific conditions that need agent review" />
          <TextAreaInput label="Special Conditions" value={form.specialConditions} onChange={(event) => updateForm('specialConditions', event.target.value)} placeholder="Only add deal-specific special conditions" />
        </div>
      </details>
      {isDevelopmentOffer ? (
        <div className="mt-5 grid gap-3 rounded-[22px] bg-[#F7F7F4] p-5">
          {[
            ['acknowledgeDevelopmentRules', 'I acknowledge this is a new-development offer route.'],
            ['acknowledgeNhbrcWarranty', 'I acknowledge NHBRC/building warranty information may form part of the agreement.'],
            ['acknowledgeBodyCorporateRules', 'I acknowledge body corporate or scheme rules may apply.'],
            ['acknowledgeUtilityConnectionCharges', 'I acknowledge levies, rates, deposits or connection charges may apply.'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-start gap-3 text-sm font-semibold text-[#374151]">
              <input type="checkbox" checked={Boolean(form[key])} onChange={(event) => updateForm(key, event.target.checked)} className="mt-1" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      ) : null}
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
        {['Submit Offer + Onboarding', 'Agent Reviews Conditions', 'OTP Generated', 'Buyer Signs', 'Seller Accepts'].map((item, index) => (
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
          ['OTP Route', isDevelopmentOffer ? 'New Development' : 'Normal Sale'],
          ['Bond Deadline', form.bondApprovalDeadline ? formatDate(form.bondApprovalDeadline) : 'Not set'],
          ['Guarantee Deadline', form.guaranteeDeliveryDeadline ? formatDate(form.guaranteeDeliveryDeadline) : 'Not set'],
          ['Occupation', form.occupationDate ? formatDate(form.occupationDate) : 'Not set'],
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

  const confirmationSection = (
    <section className="rounded-[24px] border border-[#CFE8DC] bg-white p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#DCFCE7] text-[#166534]">
            <BadgeCheck size={24} />
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.055em] text-[#111827]">Offer submitted.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280]">
            Your offer and buyer onboarding have been securely delivered to {agentName}. The agent will review the conditions before moving the transaction forward.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[#EDF9F0] px-3 py-1.5 text-xs font-bold text-[#17643A]">Securely submitted</span>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {[
          ['Property', getListingTitle(listing)],
          ['Buyer', form.fullName || 'Buyer'],
          ['Offer Amount', offerAmountLabel],
          ['Agent', agentName],
          ['Agency', offerBrand.organisationName || agencyName],
          ['Submitted', formatDateTime(new Date().toISOString())],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[18px] bg-[#F7F7F4] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6B7280]">{label}</p>
            <p className="mt-1 text-sm font-bold text-[#111827]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-5">
        {['Offer submitted', 'Agent review', 'Seller feedback', 'OTP prepared', 'Signature'].map((item, index) => (
          <div key={item} className="rounded-[18px] border border-[#E5E7EB] bg-white p-4">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${index === 0 ? 'bg-[#0F7A5A] text-white' : 'bg-[#F7F7F4] text-[#6B7280]'}`}>{index + 1}</div>
            <p className="mt-3 text-sm font-bold text-[#111827]">{item}</p>
          </div>
        ))}
      </div>
    </section>
  )

  const activeStageContent = flowStage === 'offer' ? (
    <>
      {offerHero}
      {offerDetails}
    </>
  ) : flowStage === 'onboarding' ? (
    buyerOnboardingWorkspace
  ) : flowStage === 'review' ? (
    <>
      {reviewSection}
      {trustSection}
      {timeline}
    </>
  ) : flowStage === 'complete' ? (
    confirmationSection
  ) : null

  const stageCtaLabel = flowStage === 'offer'
    ? 'Continue to Buyer Details'
    : flowStage === 'onboarding'
      ? 'Continue to Review'
      : flowStage === 'review'
        ? (submitting ? 'Submitting...' : submitButtonLabel)
        : 'Submitted'

  const stageCtaIcon = flowStage === 'review' ? <ShieldCheck size={16} /> : <ArrowRight size={16} />
  const canShowFooter = flowStage !== 'complete'
  const canGoBack = ['onboarding', 'review'].includes(flowStage)

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

  if (flowStage === 'landing') {
    return (
      <PremiumOnboardingLanding
        portalType="buyer"
        agencyLogo={offerBrand.logoDarkUrl || offerBrand.logoLightUrl || offerBrand.logoIconUrl || ''}
        agencyName={offerBrand.organisationName || agencyName}
        personName={form.fullName || invite?.buyerLeadName || ''}
        propertyAddress={getListingAddress(listing)}
        propertyImage={propertyImageUrl}
        propertyTitle={getListingTitle(listing)}
        propertyMeta={[getListingAddress(listing), getListingType(listing)].filter(Boolean).join(' · ')}
        propertyPrice={askingPrice ? formatCurrency(askingPrice) : ''}
        primaryColour={offerBrand.primaryColour}
        secondaryColour={offerBrand.secondaryColour}
        accentColour={offerBrand.accentColour}
        label="MAKE AN OFFER"
        headlinePrefix="Let's make"
        headlineAccent="your move."
        subtext="Submit your residential property offer and complete buyer onboarding in one secure flow."
        ctaLabel={hasDraft ? 'Resume Offer' : 'Start Offer'}
        reassuranceRows={[
          { title: 'Secure offer link', description: 'Private token access', icon: ShieldCheck },
          { title: 'Save and continue later', description: 'Progress is saved here', icon: Bookmark },
          { title: 'Review before submit', description: 'Nothing is sent early', icon: Clock3 },
        ]}
        contextRows={[
          { icon: UserRound, label: 'Property Professional', value: agentName },
          { icon: ChevronRight, label: 'Process', value: 'Offer terms, buyer details, review and submit' },
        ]}
        beforeStartTitle="One guided offer flow."
        beforeStartText="You can save and continue later. Your agent receives the offer only after you review and submit."
        onStart={() => goToStage('offer')}
      />
    )
  }

  return (
    <main style={{ background: WARM_WHITE, color: PRIMARY_TEXT }} className="min-h-screen pb-32 md:pb-28">
      <ProgressDots stage={flowStage} />
      <form onSubmit={handleSubmitOffer}>
        <div className="mx-auto w-full max-w-[1360px] px-4 py-5 md:px-8 md:py-8">
          <header className="rounded-[26px] border border-[#E5E7EB] bg-white p-5 md:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0F7A5A]">Secure Offer + Onboarding</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-[#111827] md:text-5xl">Make an Offer</h1>
                <p className="mt-2 text-base font-medium text-[#6B7280]">Complete your buyer details, finance route and residential offer terms in one secure flow.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 md:flex md:flex-wrap md:justify-end">
                {[
                  [ShieldCheck, 'Secure Token Active'],
                  [LockKeyhole, 'Encrypted'],
                  [Clock3, 'Time Stamped'],
                ].map(([icon, label]) => (
                  <div key={label} className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-[#FAFAF8] px-3 py-2 text-xs font-bold text-[#374151]">
                    {createElement(icon, { size: 14, color: ARCH_GREEN })}
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

          <div className="mt-5 grid gap-6 md:grid-cols-[0.4fr_0.6fr]">
            <div className={flowStage === 'complete' ? 'hidden md:block' : ''}>{propertySummary}</div>
            <div className="space-y-5">
              {activeStageContent}
            </div>
          </div>
        </div>

        {canShowFooter ? <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E5E7EB] bg-white/95 px-4 py-3 shadow-[0_-16px_40px_rgba(17,24,39,0.08)] backdrop-blur supports-[padding:max(0px)]:pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-[1360px] items-center gap-3">
            <button
              type="button"
              onClick={() => goToStage(previousStage)}
              className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] text-[#374151] ${canGoBack ? '' : 'invisible'}`}
              aria-label="Go back"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6B7280]">Current Offer</p>
              <p className="truncate text-xl font-bold tracking-[-0.04em] text-[#111827]">{offerAmountLabel}</p>
            </div>
            <button
              type={flowStage === 'review' ? 'submit' : 'button'}
              onClick={flowStage === 'review' ? undefined : goNext}
              disabled={submitting || (flowStage === 'review' && context?.source === 'canonical' && !canSubmitCanonicalOffer)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[18px] bg-[#0F7A5A] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(15,122,90,0.22)] transition hover:bg-[#0B654A] disabled:bg-[#9CA3AF] sm:min-w-[260px]"
            >
              {stageCtaLabel}
              {stageCtaIcon}
            </button>
          </div>
        </div> : null}
      </form>
    </main>
  )
}

export default BuyerOfferSubmission
