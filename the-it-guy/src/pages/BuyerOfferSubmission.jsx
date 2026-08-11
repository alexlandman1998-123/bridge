import {
  AlertTriangle,
  ArrowRight,
  Bath,
  BadgeCheck,
  BedDouble,
  Bookmark,
  Briefcase,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Home,
  Landmark,
  LockKeyhole,
  Ruler,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import PremiumOnboardingLanding from '../components/onboarding/PremiumOnboardingLanding'
import {
  getCanonicalOfferInviteContext,
  getOfferLifecycleSummary,
  submitCanonicalBuyerVerification,
} from '../lib/buyerLifecycleService'
import { resolveOnboardingBranding } from '../lib/onboardingBranding'
import { buildOfferBuyerVerificationModel } from '../lib/offerBuyerOnboardingBridge'
import {
  getOfferInviteContext,
  OFFER_WORKFLOW_STATUS,
  normalizeOfferWorkflowStatus,
  submitBuyerVerification,
} from '../lib/listingOffersService'
import { resolveOtpDocumentVariant } from '../core/documents/otpRouteUniverse'

const ARCH_GREEN = '#0F7A5A'
const WARM_WHITE = '#FAFAF8'
const PRIMARY_TEXT = '#111827'
const BUYER_VERIFICATION_DRAFT_VERSION = 1
const BUYER_VERIFICATION_STAGES = ['landing', 'onboarding', 'review', 'complete']
const BUYER_VERIFICATION_PROGRESS = [
  { key: 'onboarding', label: 'Buyer Verification' },
  { key: 'review', label: 'Review Details' },
]
const BOND_ASSISTANCE_OPTIONS = Object.freeze({
  SELF_MANAGED: 'self_managed',
  ORIGINATOR_ASSISTED: 'originator_assisted',
})

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

function getBuyerVerificationDraftKey(token = '') {
  const safeToken = normalizeText(token)
  return safeToken ? `arch9:buyer-verification-draft:${safeToken}` : ''
}

function getLegacyBuyerVerificationDraftKey(token = '') {
  const safeToken = normalizeText(token)
  return safeToken ? `arch9:buyer-offer-onboarding-draft:${safeToken}` : ''
}

function readBuyerVerificationDraft(token = '') {
  const keys = [getBuyerVerificationDraftKey(token), getLegacyBuyerVerificationDraftKey(token)].filter(Boolean)
  if (!keys.length || typeof window === 'undefined') return null
  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (parsed?.version === BUYER_VERIFICATION_DRAFT_VERSION) return parsed
    } catch {
      // Try the next compatible draft key.
    }
  }
  return null
}

function writeBuyerVerificationDraft(token = '', draft = {}) {
  const key = getBuyerVerificationDraftKey(token)
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify({
      version: BUYER_VERIFICATION_DRAFT_VERSION,
      ...draft,
      savedAt: new Date().toISOString(),
    }))
    const legacyKey = getLegacyBuyerVerificationDraftKey(token)
    if (legacyKey && legacyKey !== key) window.localStorage.removeItem(legacyKey)
  } catch {
    // Local resume is helpful but should never block the public buyer verification flow.
  }
}

function clearBuyerVerificationDraft(token = '') {
  const keys = [getBuyerVerificationDraftKey(token), getLegacyBuyerVerificationDraftKey(token)].filter(Boolean)
  if (!keys.length || typeof window === 'undefined') return
  try {
    keys.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // Ignore storage failures.
  }
}

async function fetchBuyerVerificationBrandingSnapshot(token = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken || typeof fetch !== 'function') return null

  const response = await fetch(`/api/public/buyer-offer-branding?token=${encodeURIComponent(normalizedToken)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return null
  const payload = await response.json().catch(() => null)
  return payload?.branding && typeof payload.branding === 'object' ? payload.branding : null
}

function normalizeStage(value = '', fallback = 'landing') {
  const stage = normalizeText(value).toLowerCase()
  if (stage === 'offer') return 'onboarding'
  return BUYER_VERIFICATION_STAGES.includes(stage) ? stage : fallback
}

function isBondFinanceType(value = '') {
  return ['bond', 'hybrid', 'combination'].includes(normalizeText(value).toLowerCase())
}

function normalizeBondAssistancePreference(value = '', fallback = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (['self_managed', 'self-managed', 'self', 'own', 'buyer_managed', 'client', 'no'].includes(normalized)) {
    return BOND_ASSISTANCE_OPTIONS.SELF_MANAGED
  }
  if (['originator_assisted', 'originator-assisted', 'assisted', 'help', 'bond_originator', 'yes'].includes(normalized)) {
    return BOND_ASSISTANCE_OPTIONS.ORIGINATOR_ASSISTED
  }
  return fallback
}

function getBondAssistanceLabel(value = '') {
  const preference = normalizeBondAssistancePreference(value)
  if (preference === BOND_ASSISTANCE_OPTIONS.SELF_MANAGED) return 'Buyer will manage bond'
  if (preference === BOND_ASSISTANCE_OPTIONS.ORIGINATOR_ASSISTED) return 'Bond originator help requested'
  return 'Not selected'
}

function getBondHelpRequestedValue(value = '') {
  const preference = normalizeBondAssistancePreference(value)
  if (preference === BOND_ASSISTANCE_OPTIONS.ORIGINATOR_ASSISTED) return 'yes'
  if (preference === BOND_ASSISTANCE_OPTIONS.SELF_MANAGED) return 'no'
  return ''
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

function ChoicePill({ label, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-[16px] border px-4 text-sm font-semibold transition ${
        selected
          ? 'border-[#0F7A5A] bg-[#F0FAF5] text-[#111827] shadow-[0_10px_22px_rgba(15,122,90,0.12)]'
          : 'border-[#E5E7EB] bg-white text-[#111827] hover:border-[#B8D8C9]'
      }`}
    >
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-[#0F7A5A] bg-[#0F7A5A]' : 'border-[#9CA3AF]'}`}>
        {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      {label}
    </button>
  )
}

function ProgressDots({ stage }) {
  const activeIndex = Math.max(0, BUYER_VERIFICATION_PROGRESS.findIndex((item) => item.key === stage))
  return (
    <div className="sticky top-0 z-30 overflow-x-hidden border-b border-[#E5E7EB] bg-[#FAFAF8]/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        {BUYER_VERIFICATION_PROGRESS.map((item, index) => {
          const active = activeIndex === index
          const done = activeIndex > index || stage === 'complete'
          return (
            <div key={item.key} className="flex min-w-0 flex-1 items-center">
              <div className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active || done ? 'bg-[#0F7A5A] text-white' : 'bg-white text-[#6B7280]'}`}>
                {done ? <CheckCircle2 size={14} /> : index + 1}
              </div>
              <span className={`ml-2 min-w-0 text-[11px] font-bold leading-tight sm:text-xs ${active ? 'text-[#111827]' : 'text-[#6B7280]'}`}>{item.label}</span>
              {index < BUYER_VERIFICATION_PROGRESS.length - 1 ? <div className="mx-2 h-px min-w-3 flex-1 bg-[#E5E7EB]" /> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const BUYER_VERIFICATION_ICONS = {
  about: UserRound,
  household: Users,
  employment: Briefcase,
  finance: Landmark,
  documents: FileText,
  compliance: ShieldCheck,
}

function BuyerVerificationSubmission() {
  const { token = '' } = useParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [canonicalContext, setCanonicalContext] = useState(null)
  const [canonicalLoading, setCanonicalLoading] = useState(false)
  const [verificationBrandingSnapshot, setVerificationBrandingSnapshot] = useState(null)
  const [verificationBrandingLoaded, setVerificationBrandingLoaded] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [flowStage, setFlowStage] = useState('landing')
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [activeBuyerSection, setActiveBuyerSection] = useState('about')
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
    bondAssistancePreference: '',
    needsBondAssistance: false,
    bond_help_requested: '',
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
    conditionBondApproval: false,
    conditionOther: false,
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
  const canSubmitCanonicalVerification = !canonicalLifecycle || !canonicalLifecycle.terminal

  useEffect(() => {
    let active = true
    setVerificationBrandingSnapshot(null)
    setVerificationBrandingLoaded(false)
    if (!token || !context?.ok) {
      return () => {
        active = false
      }
    }
    fetchBuyerVerificationBrandingSnapshot(token)
      .then((branding) => {
        if (active) setVerificationBrandingSnapshot(branding)
      })
      .catch(() => {
        if (active) setVerificationBrandingSnapshot(null)
      })
      .finally(() => {
        if (active) setVerificationBrandingLoaded(true)
      })
    return () => {
      active = false
    }
  }, [context?.ok, token])

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
  const bondFinanceSelected = isBondFinanceType(financeType)
  const bondAssistancePreference = bondFinanceSelected
    ? normalizeBondAssistancePreference(form.bondAssistancePreference, form.needsBondAssistance ? BOND_ASSISTANCE_OPTIONS.ORIGINATOR_ASSISTED : '')
    : ''
  const bondAssistanceLabel = bondFinanceSelected ? getBondAssistanceLabel(bondAssistancePreference) : 'Not applicable'
  const askingPrice = getListingPrice(listing)
  const offerAmount = moneyNumber(form.offerAmount)
  const depositAmount = moneyNumber(form.depositAmount)
  const loanAmount = financeType === 'cash' ? 0 : Math.max(0, offerAmount - depositAmount)
  const financeLabel = financeType === 'cash' ? 'Cash' : financeType === 'hybrid' || financeType === 'combination' ? 'Combination' : 'Bond'
  const propertyImageUrl = getListingImageUrl(listing)
  const agentName = firstText(context?.canonicalOffer?.conditions?.agentName, invite?.agentName) || 'Assigned agent'
  const agencyName = firstText(context?.canonicalOffer?.conditions?.organisationName, context?.canonicalOffer?.conditions?.agencyName) || 'Arch9 Partner Agency'
  const verificationBrand = useMemo(() => {
    const conditions = context?.canonicalOffer?.conditions || {}
    const resolved = resolveOnboardingBranding(verificationBrandingSnapshot || {}, conditions, listing || {}, invite || {})
    return {
      ...resolved,
      organisationName: resolved.organisationName || agencyName,
    }
  }, [agencyName, context?.canonicalOffer?.conditions, invite, listing, verificationBrandingSnapshot])
  const submitButtonLabel = counterPendingBuyer ? 'Submit Updated Verification' : 'Submit Buyer Verification'
  const buyerVerificationModel = useMemo(
    () =>
      buildOfferBuyerVerificationModel(form, {
        confirmedAccuracy,
        offerAmount,
        depositAmount,
        loanAmount,
        financeType,
        transaction: canonicalOffer || latestOffer || {},
      }),
    [canonicalOffer, confirmedAccuracy, depositAmount, financeType, form, latestOffer, loanAmount, offerAmount],
  )
  const buyerSectionCards = buyerVerificationModel.sections
  const hasDraft = useMemo(() => {
    void draftLoaded
    return Boolean(readBuyerVerificationDraft(token))
  }, [token, draftLoaded])
  const stageIndex = BUYER_VERIFICATION_STAGES.indexOf(flowStage)
  const previousStage = stageIndex > 1 ? BUYER_VERIFICATION_STAGES[stageIndex - 1] : 'landing'
  const expectedPurchaseAmountLabel = offerAmount > 0 ? formatCurrency(offerAmount) : 'Pending'

  const canonicalBanner = useMemo(() => {
    if (!canonicalLifecycle) return null
    if (canonicalLifecycle.effectiveStatus === 'countered') {
      return { tone: 'amber', text: 'Updated purchase details were requested. Review the information below before submitting your verification.' }
    }
    if (canonicalLifecycle.effectiveStatus === 'changes_requested') {
      return { tone: 'amber', text: 'The agent asked for changes before the buyer record can be finalised. Update the details and resubmit.' }
    }
    if (canonicalLifecycle.activeNegotiation) {
      return { tone: 'amber', text: 'This record already has offer activity in review. Buyer verification can still be submitted without changing the offer status.' }
    }
    if (canonicalLifecycle.acceptedOrConverted) {
      return { tone: 'green', text: canonicalLifecycle.blockedReason }
    }
    if (canonicalLifecycle.terminal && !canonicalLifecycle.buyerCanResubmit) {
      return { tone: 'red', text: canonicalLifecycle.blockedReason || 'This buyer verification link is closed. Ask the agent for a new secure link if needed.' }
    }
    return null
  }, [canonicalLifecycle])

  useEffect(() => {
    if (!context?.ok || draftLoaded) return
    const conditions = context?.canonicalOffer?.conditions || {}
    const draft = readBuyerVerificationDraft(token)
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
    setActiveBuyerSection(normalizeText(draft?.activeBuyerSection) === 'overview' ? 'about' : normalizeText(draft?.activeBuyerSection) || 'about')
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
    setActiveBuyerSection('about')
  }, [token])

  useEffect(() => {
    if (!context?.ok || !draftLoaded || flowStage === 'complete') return
    writeBuyerVerificationDraft(token, {
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
    const normalizedValue = value === 'combination' ? 'hybrid' : value
    const nextBondFinanceSelected = isBondFinanceType(normalizedValue)
    setForm((previous) => {
      const nextPreference = nextBondFinanceSelected
        ? normalizeBondAssistancePreference(previous.bondAssistancePreference, previous.needsBondAssistance ? BOND_ASSISTANCE_OPTIONS.ORIGINATOR_ASSISTED : '')
        : ''
      return {
        ...previous,
        financeType: normalizedValue,
        bondAmount: nextBondFinanceSelected ? previous.bondAmount : '',
        cashContribution: normalizedValue === 'hybrid' ? previous.cashContribution : '',
        bondAssistancePreference: nextPreference,
        needsBondAssistance: nextPreference === BOND_ASSISTANCE_OPTIONS.ORIGINATOR_ASSISTED,
        bond_help_requested: getBondHelpRequestedValue(nextPreference),
        conditionBondApproval: nextBondFinanceSelected ? true : previous.conditionBondApproval,
      }
    })
  }

  function updateBondAssistancePreference(value) {
    const preference = normalizeBondAssistancePreference(value)
    setForm((previous) => ({
      ...previous,
      bondAssistancePreference: preference,
      needsBondAssistance: preference === BOND_ASSISTANCE_OPTIONS.ORIGINATOR_ASSISTED,
      bond_help_requested: getBondHelpRequestedValue(preference),
    }))
  }

  function validateStageTransition(nextStage) {
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
      goToStage('onboarding')
      return
    }
    if (flowStage === 'onboarding') {
      goToStage('review')
    }
  }

  async function handleSubmitVerification(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    try {
      if (context?.source === 'canonical' && !canSubmitCanonicalVerification) {
        throw new Error(canonicalLifecycle?.blockedReason || 'This buyer verification cannot be updated from this link anymore.')
      }
      if (!form.fullName || !form.email || !form.phone || !form.idNumber) {
        throw new Error('Complete your buyer details before submitting.')
      }
      if (!confirmedAccuracy) {
        throw new Error('Please confirm the information is accurate before submitting.')
      }
      const derivedBondAmount = bondFinanceSelected ? loanAmount : 0
      const submission = {
        ...form,
        bondAmount: derivedBondAmount ? String(derivedBondAmount) : '',
        bondAssistancePreference,
        needsBondAssistance: bondAssistancePreference === BOND_ASSISTANCE_OPTIONS.ORIGINATOR_ASSISTED,
        bond_help_requested: getBondHelpRequestedValue(bondAssistancePreference),
        ooba_assist_requested: getBondHelpRequestedValue(bondAssistancePreference),
        otpDocumentVariant,
      }
      setSubmitting(true)
      if (context?.source === 'canonical') {
        await submitCanonicalBuyerVerification({ token, submission })
      } else {
        await submitBuyerVerification({ token, submission })
      }
      clearBuyerVerificationDraft(token)
      setSuccessMessage('Buyer verification submitted successfully. The agent will review the details before moving the transaction forward.')
      setFlowStage('complete')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to submit buyer verification right now.')
    } finally {
      setSubmitting(false)
    }
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

  const activeBuyerCard = buyerSectionCards.find((section) => section.key === activeBuyerSection) || buyerSectionCards[0]
  const offerIdentityCount = [form.fullName, form.idNumber, form.email, form.phone].filter(Boolean).length
  const activeBuyerProgressLabel = activeBuyerSection === 'about'
    ? `${offerIdentityCount} of 4 identity fields captured`
    : activeBuyerSection === 'finance'
      ? `${financeLabel} route captured for verification`
      : activeBuyerSection === 'documents'
        ? `${buyerVerificationModel.requiredDocuments.length} downstream document requirements`
        : 'Buyer onboarding rule set'

  const buyerOnboardingWorkspace = (
    <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F7A5A]">Buyer verification</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[#111827]">Tell us about yourself.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280]">
            This follows the buyer verification rules for the selected property context. Your progress is saved on this device.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[#EEF6F2] px-3 py-1.5 text-xs font-bold text-[#0F7A5A]">{buyerSectionCards.length} sections</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-[22px] border border-[#E5E7EB]">
        {buyerSectionCards.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveBuyerSection(section.key)}
            className={`flex min-h-[92px] w-full items-center gap-4 border-b border-[#E5E7EB] px-4 py-4 text-left transition last:border-b-0 ${
              activeBuyerSection === section.key ? 'bg-[#F2FBF7]' : 'bg-white hover:bg-[#FAFAF8]'
            }`}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EEF6F2] text-[#0F7A5A]">
              {createElement(BUYER_VERIFICATION_ICONS[section.key] || UserRound, { size: 20 })}
            </span>
            <span className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#111827]">{section.title}</p>
                <p className="mt-1 text-xs leading-5 text-[#6B7280]">{section.description}</p>
            </span>
            <ChevronRight className="shrink-0 text-[#6B7280]" size={20} />
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-[22px] border border-[#E5E7EB] bg-white p-4">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-bold text-[#111827]">{activeBuyerCard?.title || 'Buyer Verification'}</p>
            <p className="text-xs font-semibold text-[#6B7280]">{activeBuyerProgressLabel}</p>
          </div>
        </div>
        {activeBuyerSection === 'about' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Full Name" value={form.fullName} onChange={(event) => updateForm('fullName', event.target.value)} placeholder="Full legal name" autoComplete="name" />
            <TextInput label="ID / Passport" value={form.idNumber} onChange={(event) => updateForm('idNumber', event.target.value)} placeholder="ID or passport number" />
            <TextInput label="Email" type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="name@email.com" autoComplete="email" />
            <TextInput label="Phone" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} placeholder="082..." inputMode="tel" autoComplete="tel" />
          </div>
        ) : null}
        {activeBuyerSection === 'finance' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Expected Purchase Amount" value={form.offerAmount} onChange={(event) => updateForm('offerAmount', event.target.value)} placeholder="2500000" inputMode="decimal" />
            <TextInput label="Deposit Amount (Optional)" value={form.depositAmount} onChange={(event) => updateForm('depositAmount', event.target.value)} placeholder="0" inputMode="decimal" />
            <div className="grid gap-2 md:col-span-2">
              <span className="text-[0.78rem] font-semibold text-[#4B5563]">Finance Type</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ChoicePill label="Cash" selected={financeType === 'cash'} onClick={() => updateFinanceType('cash')} />
                <ChoicePill label="Bond" selected={financeType === 'bond'} onClick={() => updateFinanceType('bond')} />
                <ChoicePill label="Combination" selected={financeType === 'hybrid' || financeType === 'combination'} onClick={() => updateFinanceType('hybrid')} />
              </div>
            </div>
            <div className="rounded-[18px] bg-[#F7F7F4] p-4">
              <p className="text-xs font-semibold text-[#6B7280]">Finance Route</p>
              <p className="mt-1 text-lg font-bold text-[#111827]">{financeLabel}</p>
            </div>
            <div className="rounded-[18px] bg-[#F7F7F4] p-4">
              <p className="text-xs font-semibold text-[#6B7280]">Bond Required</p>
              <p className="mt-1 text-lg font-bold text-[#111827]">{formatCurrency(loanAmount)}</p>
            </div>
            {financeType !== 'bond' ? <TextInput label="Cash Contribution" value={form.cashContribution} onChange={(event) => updateForm('cashContribution', event.target.value)} placeholder="250000" inputMode="decimal" /> : null}
            {bondFinanceSelected ? (
              <div className="grid gap-2 md:col-span-2">
                <span className="text-[0.78rem] font-semibold text-[#4B5563]">Bond Support</span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ChoicePill
                    label="I'll sort out my bond myself"
                    selected={bondAssistancePreference === BOND_ASSISTANCE_OPTIONS.SELF_MANAGED}
                    onClick={() => updateBondAssistancePreference(BOND_ASSISTANCE_OPTIONS.SELF_MANAGED)}
                  />
                  <ChoicePill
                    label="I need help with my bond"
                    selected={bondAssistancePreference === BOND_ASSISTANCE_OPTIONS.ORIGINATOR_ASSISTED}
                    onClick={() => updateBondAssistancePreference(BOND_ASSISTANCE_OPTIONS.ORIGINATOR_ASSISTED)}
                  />
                </div>
              </div>
            ) : null}
            <TextInput label="Proof of Funds URL" value={form.proofOfFundsUrl} onChange={(event) => updateForm('proofOfFundsUrl', event.target.value)} placeholder="Optional document link" />
          </div>
        ) : null}
        {activeBuyerSection === 'compliance' ? (
          <label className="flex items-start gap-3 rounded-[18px] bg-[#F7F7F4] p-4 text-sm font-semibold text-[#374151]">
            <input type="checkbox" checked={confirmedAccuracy} onChange={(event) => setConfirmedAccuracy(event.target.checked)} className="mt-1" />
            <span>I confirm the information captured so far is accurate.</span>
          </label>
        ) : null}
        {['household', 'employment', 'documents'].includes(activeBuyerSection) ? (
          <div className="rounded-[18px] bg-[#F7F7F4] p-4 text-sm leading-6 text-[#4B5563]">
            {activeBuyerSection === 'documents'
              ? `${buyerVerificationModel.requiredDocuments.length} supporting document requirement${buyerVerificationModel.requiredDocuments.length === 1 ? '' : 's'} will follow from the buyer onboarding rules.`
              : 'This section is governed by the buyer onboarding rules and remains part of the full buyer onboarding record.'}
          </div>
        ) : null}
      </div>

      <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#F7F7F4] px-3 py-2 text-xs font-bold text-[#374151]">
        <LockKeyhole size={14} color={ARCH_GREEN} />
        Your information is secure and encrypted.
      </p>
    </section>
  )

  const trustSection = (
    <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 md:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#111827]">Why Buyers Trust Arch9</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <TrustItem>Secure Submission</TrustItem>
        <TrustItem>Time Stamped</TrustItem>
        <TrustItem>Agent Notified</TrustItem>
        <TrustItem>Details Recorded</TrustItem>
        <TrustItem>Verification Tracked</TrustItem>
      </div>
    </section>
  )

  const timeline = (
    <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 md:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#111827]">What Happens Next?</h2>
      <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
        {['Submit Buyer Verification', 'Agent Reviews Details', 'Agency Document Handled Separately', 'Transaction Readiness Checked'].map((item, index) => (
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
      <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#111827]">Review Details</h2>
      <div className="mt-5 grid gap-3">
        {[
          ['Property', getListingTitle(listing)],
          ['Expected Purchase Amount', formatCurrency(offerAmount)],
          ['Deposit', formatCurrency(depositAmount)],
          ['Finance', financeLabel],
          ['Bond Required', formatCurrency(loanAmount)],
          ...(bondFinanceSelected ? [['Bond Support', bondAssistanceLabel]] : []),
          ['Verification Route', isDevelopmentOffer ? 'New Development' : 'Normal Sale'],
          ['Bond Deadline', form.bondApprovalDeadline ? formatDate(form.bondApprovalDeadline) : 'Not set'],
          ['Guarantee Deadline', form.guaranteeDeliveryDeadline ? formatDate(form.guaranteeDeliveryDeadline) : 'Not set'],
          ['Occupation', form.occupationDate ? formatDate(form.occupationDate) : 'Not set'],
          ['Buyer', form.fullName || 'Not captured'],
          ['Email', form.email || 'Not captured'],
        ].map(([label, value]) => (
          <div key={label} className="grid min-w-0 gap-1 border-b border-[#F0F1EF] py-3 text-sm sm:grid-cols-[minmax(0,0.38fr)_minmax(0,1fr)] sm:items-center sm:gap-4">
            <span className="min-w-0 font-semibold text-[#6B7280]">{label}</span>
            <span className="min-w-0 break-words font-bold text-[#111827] sm:text-right">{value}</span>
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
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.055em] text-[#111827]">Verification submitted.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280]">
            Your buyer verification details have been securely delivered to {agentName}. The agent will review the information before moving the transaction forward.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[#EDF9F0] px-3 py-1.5 text-xs font-bold text-[#17643A]">Securely submitted</span>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {[
          ['Property', getListingTitle(listing)],
          ['Buyer', form.fullName || 'Buyer'],
          ['Expected Purchase Amount', expectedPurchaseAmountLabel],
          ['Agent', agentName],
          ['Agency', verificationBrand.organisationName || agencyName],
          ['Submitted', formatDateTime(new Date().toISOString())],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[18px] bg-[#F7F7F4] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6B7280]">{label}</p>
            <p className="mt-1 text-sm font-bold text-[#111827]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-5">
        {['Verification submitted', 'Agent review', 'Agency document handled separately', 'Transaction readiness'].map((item, index) => (
          <div key={item} className="rounded-[18px] border border-[#E5E7EB] bg-white p-4">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${index === 0 ? 'bg-[#0F7A5A] text-white' : 'bg-[#F7F7F4] text-[#6B7280]'}`}>{index + 1}</div>
            <p className="mt-3 text-sm font-bold text-[#111827]">{item}</p>
          </div>
        ))}
      </div>
    </section>
  )

  const activeStageContent = flowStage === 'onboarding' ? (
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

  const stageCtaLabel = flowStage === 'onboarding'
      ? 'Continue to Review'
      : flowStage === 'review'
        ? (submitting ? 'Submitting...' : submitButtonLabel)
        : 'Submitted'

  const stageCtaIcon = flowStage === 'review' ? <ShieldCheck size={16} /> : <ArrowRight size={16} />
  const canShowFooter = flowStage !== 'complete'
  const canGoBack = ['onboarding', 'review'].includes(flowStage)
  const showPropertyAside = flowStage === 'onboarding'
  const pageTitle = flowStage === 'onboarding'
    ? 'Buyer Verification'
    : flowStage === 'review'
      ? 'Review Details'
      : flowStage === 'complete'
        ? 'Verification Submitted'
        : 'Buyer Verification'
  const pageSubtitle = flowStage === 'onboarding'
    ? 'Confirm your details and finance context for the agency record.'
    : flowStage === 'review'
      ? 'Check your buyer details before submitting.'
      : flowStage === 'complete'
        ? ''
        : 'Confirm the property and finance context before completing buyer verification.'

  if ((canonicalLoading && !context?.ok) || (context?.ok && flowStage === 'landing' && !verificationBrandingLoaded)) {
    return (
      <main className="min-h-screen bg-[#FAFAF8] px-4 py-8">
        <section className="mx-auto max-w-[760px] rounded-[24px] border border-[#E5E7EB] bg-white p-6 text-sm font-semibold text-[#6B7280]">
          Loading secure verification link...
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
              <h1 className="text-xl font-semibold text-[#111827]">Verification link unavailable</h1>
              <p className="mt-2 text-sm text-[#6B7280]">
                {context?.reason === 'expired' ? 'This verification link has expired. Ask the agent to send a new secure verification link.' : 'This verification link is invalid or no longer active.'}
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
        agencyLogo={verificationBrand.logoDarkUrl || verificationBrand.logoLightUrl || verificationBrand.logoIconUrl || ''}
        agencyName={verificationBrand.organisationName || agencyName}
        personName={form.fullName || invite?.buyerLeadName || ''}
        propertyAddress={getListingAddress(listing)}
        propertyImage={propertyImageUrl}
        propertyTitle={getListingTitle(listing)}
        propertyMeta={[getListingAddress(listing), getListingType(listing)].filter(Boolean).join(' · ')}
        propertyPrice={askingPrice ? formatCurrency(askingPrice) : ''}
        primaryColour={verificationBrand.primaryColour}
        secondaryColour={verificationBrand.secondaryColour}
        accentColour={verificationBrand.accentColour}
        label="BUYER VERIFICATION"
        headlinePrefix="Let's verify"
        headlineAccent="your details."
        subtext="Confirm your buyer details and finance context in one secure flow."
        ctaLabel={hasDraft ? 'Resume Verification' : 'Start Verification'}
        reassuranceRows={[
          { title: 'Secure verification link', description: 'Private token access', icon: ShieldCheck },
          { title: 'Save and continue later', description: 'Progress is saved here', icon: Bookmark },
          { title: 'Review before submit', description: 'Nothing is sent early', icon: Clock3 },
        ]}
        contextRows={[
          { icon: UserRound, label: 'Property Professional', value: agentName },
          { icon: ChevronRight, label: 'Process', value: 'Property context, buyer details, review and submit' },
        ]}
        beforeStartTitle="One guided verification flow."
        beforeStartText="You can save and continue later. Your agent receives the details only after you review and submit."
        onStart={() => goToStage('onboarding')}
      />
    )
  }

  return (
    <main style={{ background: WARM_WHITE, color: PRIMARY_TEXT }} className="min-h-screen overflow-x-hidden pb-[calc(8rem+env(safe-area-inset-bottom))] sm:pb-32 md:pb-28">
      <ProgressDots stage={flowStage} />
      <form onSubmit={handleSubmitVerification}>
        <div className="mx-auto w-full max-w-[980px] px-4 py-8 md:px-8 md:py-10">
          <header className="mb-7">
            <h1 className="break-words text-4xl font-semibold tracking-[-0.055em] text-[#111827] md:text-5xl">{pageTitle}</h1>
            {pageSubtitle ? <p className="mt-3 max-w-[560px] text-lg leading-8 text-[#374151]">{pageSubtitle}</p> : null}
          </header>

          {counterPendingBuyer || canonicalBanner || errorMessage || successMessage ? (
            <div className="mt-4 grid gap-3">
              {counterPendingBuyer ? (
                <section className="rounded-[20px] border border-[#F5DBB0] bg-[#FFF8EC] px-4 py-3 text-sm font-semibold text-[#8A4B08]">
                  Updated purchase details were requested. Submit updated verification details to respond.
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

          <div className={`mt-5 grid gap-5 ${showPropertyAside ? 'md:grid-cols-[minmax(0,0.48fr)_minmax(0,0.52fr)]' : ''}`}>
            {showPropertyAside ? <div>{propertySummary}</div> : null}
            <div className="space-y-5">
              {activeStageContent}
            </div>
          </div>
        </div>

        {canShowFooter ? <div data-testid="buyer-offer-action-dock" className="fixed inset-x-0 bottom-0 z-40 rounded-t-[22px] border border-b-0 border-[#E5E7EB] bg-white/95 px-4 py-3 shadow-[0_-16px_40px_rgba(17,24,39,0.08)] backdrop-blur supports-[padding:max(0px)]:pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-[980px] items-center gap-3">
            <button
              type="button"
              onClick={() => goToStage(previousStage)}
              className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] text-[#374151] ${canGoBack ? '' : 'invisible'}`}
              aria-label="Go back"
            >
              <ChevronLeft size={20} />
            </button>
            <div data-testid="buyer-offer-action-summary" className="hidden min-w-0 flex-1 grid-cols-3 gap-3 sm:grid">
              {[
                ['Buyer', form.fullName || 'Not captured'],
                ['Finance', financeLabel],
                ['Progress', `${buyerVerificationModel.completion.completed}/${buyerVerificationModel.completion.total}`],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[#4B5563]">{label}</p>
                  <p className="truncate text-sm font-bold text-[#111827] md:text-base">{value}</p>
                </div>
              ))}
            </div>
            <button
              type={flowStage === 'review' ? 'submit' : 'button'}
              onClick={flowStage === 'review' ? undefined : goNext}
              disabled={submitting || (flowStage === 'review' && context?.source === 'canonical' && !canSubmitCanonicalVerification)}
              className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] bg-[#0F7A5A] px-4 text-center text-sm font-bold text-white shadow-[0_12px_28px_rgba(15,122,90,0.22)] transition hover:bg-[#0B654A] disabled:bg-[#9CA3AF] sm:flex-none sm:px-5 sm:min-w-[260px]"
            >
              <span className="min-w-0 whitespace-nowrap">{stageCtaLabel}</span>
              <span className="shrink-0">{stageCtaIcon}</span>
            </button>
          </div>
        </div> : null}
      </form>
    </main>
  )
}

export default BuyerVerificationSubmission
