import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  AlertTriangle,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  HandCoins,
  Home,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MessageCircle,
  PhoneCall,
  Settings,
  ShieldCheck,
  Tag,
  User,
  Users,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import '../App.css'
import { normalizePortalWorkspaceCategory, resolvePortalDocumentMetadata } from '../core/documents/portalDocumentMetadata'
import { buildFinanceReadinessPayload } from '../core/finance/financeReadinessSelectors'
import { normalizeFinanceManagedBy, normalizeFinanceType } from '../core/transactions/financeType'
import { LatestUpdatesCard, PurchaseJourneyCard } from '../components/client-portal/ClientJourneySection'
import ClientDocumentCentre from '../components/client-portal/documents/ClientDocumentCentre'
import ClientAppointmentsSection from '../components/client-portal/appointments/ClientAppointmentsSection'
import ClientPortalMatterAccountsPanel from '../components/client-portal/ClientPortalMatterAccountsPanel'
import SellerOffersPage from '../components/client-portal/offers/SellerOffersPage'
import TransactionStageWorkspace, { resolveSellerTransactionStageKey } from '../components/client-portal/seller/TransactionStageWorkspace'
import ProgressTimeline from '../components/ProgressTimeline'
import TransactionLifecycleProgress from '../components/TransactionLifecycleProgress'
import MvpTransactionControlBoard from '../components/transaction/MvpTransactionControlBoard'
import AttorneyFirmRolePlayerCard from '../components/attorney/branding/AttorneyFirmRolePlayerCard'
import {
  buildClientJourney,
  deriveClientJourneyStatusFlag,
  resolveClientJourneyFinanceType,
  resolveClientJourneyPropertyType,
} from '../core/clientJourney/clientJourney.utils'
import { getSystemBanks } from '../services/bondOriginatorBankService'
import {
  createClientPortalDocumentSignedUrl,
  fetchClientPortalMatterFinancialAccounts,
  respondToClientPortalAppointment,
  saveClientPortalOnboardingDraft,
  submitClientPortalComment,
  uploadClientPortalMatterFinancialRequestDocument,
  uploadClientPortalMatterFinancialProof,
  uploadClientPortalDocument,
  submitAlterationRequest,
  submitClientIssue,
  submitClientSellerInterestRequest,
  submitServiceReview,
} from '../lib/api'
import { getClientPortalWorkspaceData } from '../services/clientPortalWorkspaceService'
import useTransactionLiveRefresh from '../hooks/useTransactionLiveRefresh'
import {
  clearSellerPortalAccessToken,
  completeSellerPortalPasswordRecovery,
  createSellerClientPortalDocumentSignedUrl,
  getStoredSellerPortalAccessToken,
  isSellerPortalAuthRequiredError,
  isSellerPortalSessionExpiredError,
  requestSellerPortalPasswordRecovery,
  setSellerPortalPassword,
  uploadSellerClientPortalDocument,
  verifySellerPortalPassword,
} from '../services/privateListingService'
import {
  dismissClientPortalNotification,
  markAllClientPortalNotificationsRead,
  markClientPortalNotificationRead,
} from '../services/clientPortalNotificationsService'
import {
  MAIN_PROCESS_STAGES,
  MAIN_STAGE_LABELS,
  getMainStageFromDetailedStage,
  getMainStageIndex,
} from '../lib/stages'
import { getOffersForListing } from '../lib/listingOffersService'
import { getSellerPortalStageMeta } from '../lib/sellerPortalStageMapper'
import { buildSellerDocumentExperienceModel } from '../lib/sellerDocumentExperienceModel'

const ISSUE_CATEGORIES = [
  'Paint / Finishes',
  'Plumbing',
  'Electrical',
  'Doors / Windows',
  'Flooring',
  'Kitchen / Cupboards',
  'Bathroom',
  'Other',
]

const SELLER_PORTAL_MENU = [
  { key: 'overview', label: 'Overview', icon: Home },
  { key: 'progress', label: 'Progress', icon: BarChart3 },
  { key: 'offers', label: 'Offers', icon: HandCoins },
  { key: 'appointments', label: 'Appointments', icon: CalendarClock },
  { key: 'listing', label: 'Listing', icon: Home, section: 'overview', hash: '#seller-property-hero' },
  { key: 'marketing', label: 'Marketing', icon: Megaphone, section: 'overview', hash: '#seller-marketing-activity' },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'account', label: 'Account', icon: HandCoins },
  { key: 'details', label: 'My Details', icon: User },
]

const SELLER_PORTAL_NAV_GROUPS = [
  {
    label: 'Home',
    items: [
      { key: 'overview', label: 'Overview', icon: Home },
    ],
  },
  {
    label: 'Your Sale',
    items: [
      { key: 'progress', label: 'Progress', icon: BarChart3 },
      { key: 'offers', label: 'Offers', icon: HandCoins },
      { key: 'appointments', label: 'Appointments', icon: CalendarClock },
    ],
  },
  {
    label: 'Property',
    items: [
      { key: 'listing', label: 'Listing', icon: Home, section: 'overview', hash: '#seller-property-hero' },
      { key: 'marketing', label: 'Marketing', icon: Megaphone, section: 'overview', hash: '#seller-marketing-activity' },
      { key: 'documents', label: 'Documents', icon: FileText },
    ],
  },
  {
    label: 'Account',
    items: [
      { key: 'account', label: 'Account', icon: HandCoins },
      { key: 'details', label: 'My Details', icon: User },
    ],
  },
]

const SELLER_ONBOARDING_STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  sent: 'Sent',
  submitted: 'Submitted',
  under_review: 'Under Review',
  completed: 'Completed',
  reviewed: 'Reviewed',
  approved: 'Approved',
}

const SELLER_OWNERSHIP_TYPE_LABELS = {
  individual: 'Individual',
  married_cop: 'Married (COP)',
  married_anc: 'Married (ANC)',
  company: 'Company',
  trust: 'Trust',
  deceased_estate: 'Deceased Estate',
  power_of_attorney: 'Power of Attorney',
  multiple_owners: 'Multiple Owners',
  other: 'Other',
}

const SELLER_MANDATE_TYPE_LABELS = {
  open: 'Open Mandate',
  sole: 'Sole Mandate',
  exclusive: 'Exclusive Mandate',
}

const SELLER_OCCUPANCY_STATUS_LABELS = {
  unknown: 'Unknown',
  vacant: 'Vacant',
  owner_occupied: 'Owner Occupied',
  tenant_occupied: 'Tenant Occupied',
  partially_occupied: 'Partially Occupied',
}

const SELLER_PROPERTY_CONDITION_LABELS = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  needs_renovation: 'Needs Renovation',
  recently_renovated: 'Recently Renovated',
}

const SELLER_PROGRESS_STEPS = [
  { key: 'contacted', label: 'Contacted' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'mandate_sent', label: 'Mandate Sent' },
  { key: 'mandate_signed', label: 'Mandate Signed' },
  { key: 'listing_created', label: 'Listing Created' },
  { key: 'documents_complete', label: 'Documents Complete' },
]

const SELLER_SALE_PROGRESS_STEPS = [
  { key: 'otp', label: 'OTP' },
  { key: 'finance', label: 'Finance' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'registration', label: 'Registration' },
]

const SELLER_SALE_PROGRESS_KEY_BY_PORTAL_STAGE = {
  mandate_signed: 'otp',
  listed: 'otp',
  offers: 'otp',
  offer_accepted: 'finance',
  transfer: 'transfer',
  registered: 'registration',
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatOnboardingFieldValue(value) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => formatOnboardingFieldValue(entry))
      .filter(Boolean)
      .join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, entryValue]) => `${toTitleLabel(key)}: ${formatOnboardingFieldValue(entryValue)}`)
      .join(' | ')
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return String(value)
}

function resolveBuyerBondOriginatorRequest(portal = {}) {
  const formData = portal?.onboardingFormData?.formData || {}
  return (
    portal?.buyerBondOriginatorRequest ||
    formData.buyer_bond_originator_request ||
    formData.buyerBondOriginatorRequest ||
    null
  )
}

function resolvePortalFinanceManagedBy(portal = {}) {
  const formData = portal?.onboardingFormData?.formData || {}
  const finance = formData?.finance && typeof formData.finance === 'object' ? formData.finance : {}
  return normalizeFinanceManagedBy(
    portal?.transaction?.finance_managed_by ||
      portal?.transaction?.financeManagedBy ||
      portal?.transaction?.finance_owner ||
      portal?.transaction?.financeOwner ||
      formData.finance_managed_by ||
      formData.financeManagedBy ||
      finance.finance_managed_by ||
      finance.financeManagedBy,
    { fallback: 'bond_originator' },
  )
}

function getBuyerBondOriginatorRequestMessage(request = null) {
  if (!request?.requested) return ''
  const originatorName = request.companyName || request.company_name || 'your nominated bond originator'
  const status = String(request.status || '').trim().toLowerCase()
  if (status === 'pending_approval') {
    return `Buyer request pending approval: ${originatorName}`
  }
  if (status === 'approved') {
    return `Buyer-appointed originator approved: ${originatorName}`
  }
  if (status === 'rejected') {
    return `Buyer-appointed originator not approved: ${originatorName}`
  }
  if (status === 'not_allowed') {
    return 'This development uses the appointed bond originator.'
  }
  return ''
}

function splitSellerPortalAddress(value = '') {
  const parts = String(value || '').split(',').map((part) => part.trim()).filter(Boolean)
  if (!parts.length) {
    return { line1: 'Property address pending', line2: '' }
  }
  if (parts.length === 1) {
    return { line1: parts[0], line2: '' }
  }
  return {
    line1: parts.slice(0, 2).join(', '),
    line2: parts.slice(2).join(', '),
  }
}

function formatSellerPortalLabel(value = '', labels = {}) {
  const normalized = normalizePortalStatus(value)
  if (!normalized) return ''
  return labels[normalized] || toTitleLabel(normalized)
}

function formatSellerPortalBoolean(value, yesLabel = 'Yes', noLabel = 'No') {
  if (value === null || value === undefined || value === '') return ''
  return isTruthyPortalValue(value) ? yesLabel : noLabel
}

function formatSellerPortalCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return ZAR_CURRENCY.format(amount)
}

function buildSellerPortalProgressModel({
  hasSellingContext = false,
  hasOnboardingStarted = false,
  hasOnboardingSubmitted = false,
  hasMandatePacket = false,
  hasMandateSigned = false,
  hasListingCreated = false,
  hasDocumentsComplete = false,
} = {}) {
  let currentKey = 'contacted'

  if (!hasSellingContext) {
    currentKey = 'contacted'
  } else if (!hasOnboardingStarted) {
    currentKey = 'contacted'
  } else if (!hasOnboardingSubmitted) {
    currentKey = 'onboarding'
  } else if (!hasMandatePacket) {
    currentKey = 'submitted'
  } else if (!hasMandateSigned) {
    currentKey = 'mandate_sent'
  } else if (!hasListingCreated) {
    currentKey = 'mandate_signed'
  } else if (!hasDocumentsComplete) {
    currentKey = 'listing_created'
  } else {
    currentKey = 'documents_complete'
  }

  const currentIndex = Math.max(
    SELLER_PROGRESS_STEPS.findIndex((step) => step.key === currentKey),
    0,
  )

  const steps = SELLER_PROGRESS_STEPS.map((step, index) => ({
    ...step,
    state: index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'upcoming',
  }))

  const percent = Math.round((currentIndex / Math.max(SELLER_PROGRESS_STEPS.length - 1, 1)) * 100)
  const helperMessageByKey = {
    contacted: 'Your seller workspace is active and your agent will guide the next milestone.',
    onboarding: 'Your onboarding details are the next step before your agent can prepare the file.',
    submitted: 'Your seller onboarding has been submitted and is under review by your agent.',
    mandate_sent: 'Your onboarding is complete and your mandate is being prepared for review.',
    mandate_signed: 'Your mandate is in place and the listing setup is moving forward.',
    listing_created: 'Your property is moving through listing setup and live marketing preparation.',
    documents_complete: 'Your seller file is complete and we will keep you updated as the sale progresses.',
  }

  return {
    steps,
    currentKey,
    currentIndex,
    percent,
    helperMessage: helperMessageByKey[currentKey] || helperMessageByKey.contacted,
  }
}

const SELLER_PROGRESS_PORTAL_KEY_BY_JOURNEY_KEY = {
  contacted: 'contacted',
  seller_onboarding_sent: 'onboarding',
  seller_onboarding_submitted: 'submitted',
  mandate_sent: 'mandate_sent',
  mandate_signed: 'mandate_signed',
  listing_created: 'listing_created',
  listing_live: 'listing_created',
  documents_submitted: 'documents_complete',
}

function buildSellerPortalProgressModelFromSharedJourney(journeyView = null) {
  const stages = Array.isArray(journeyView?.stages) ? journeyView.stages : []
  if (!stages.length) return null

  const stageMap = new Map(SELLER_PROGRESS_STEPS.map((step) => [step.key, []]))
  for (const stage of stages) {
    const portalKey = SELLER_PROGRESS_PORTAL_KEY_BY_JOURNEY_KEY[stage?.key]
    if (!portalKey || !stageMap.has(portalKey)) continue
    stageMap.get(portalKey).push(stage)
  }

  const currentKey =
    SELLER_PROGRESS_PORTAL_KEY_BY_JOURNEY_KEY[journeyView?.currentStage?.key] ||
    SELLER_PROGRESS_STEPS.find((step) => (stageMap.get(step.key) || []).some((stage) => stage.state === 'current'))?.key ||
    'contacted'

  const currentIndex = Math.max(
    SELLER_PROGRESS_STEPS.findIndex((step) => step.key === currentKey),
    0,
  )

  const stepsForUi = SELLER_PROGRESS_STEPS.map((step) => {
    const mappedStages = stageMap.get(step.key) || []
    const hasCurrent = mappedStages.some((stage) => stage.state === 'current')
    const hasCompleted = mappedStages.some((stage) => stage.state === 'completed')
    return {
      ...step,
      state: hasCurrent ? 'current' : hasCompleted ? 'completed' : 'upcoming',
    }
  })

  return {
    steps: stepsForUi,
    currentKey,
    currentIndex,
    percent: Math.round((currentIndex / Math.max(SELLER_PROGRESS_STEPS.length - 1, 1)) * 100),
    helperMessage:
      journeyView?.stageMeta?.currentStage?.message ||
      journeyView?.currentStage?.message ||
      'Your seller portal will keep you updated as the sale progresses.',
  }
}

function normalizeSellerSaleMainStage(mainStage = '') {
  const normalized = String(mainStage || '').trim().toUpperCase()
  if (['REG', 'REGISTERED', 'REGISTRATION', 'COMPLETE', 'COMPLETED'].includes(normalized)) return 'registration'
  if (['ATTY', 'XFER', 'TRANSFER'].includes(normalized)) return 'transfer'
  if (['FIN', 'FINANCE'].includes(normalized)) return 'finance'
  if (['OTP', 'OFFER', 'OFFER_ACCEPTED'].includes(normalized)) return 'otp'
  return ''
}

function resolveSellerSaleProgressKey({
  sellerStageMeta = null,
  mainStage = '',
  activeSellingContext = {},
  portal = {},
  sellerOfferItems = [],
} = {}) {
  const mainStageKey = normalizeSellerSaleMainStage(mainStage)
  if (mainStageKey) return mainStageKey

  const transactionMainStage = normalizeSellerSaleMainStage(
    portal?.transaction?.current_main_stage ||
      portal?.transaction?.mainStage ||
      portal?.mainStage ||
      activeSellingContext?.current_main_stage ||
      activeSellingContext?.mainStage,
  )
  if (transactionMainStage) return transactionMainStage

  const portalStageKey = normalizeSellerPortalKey(sellerStageMeta?.currentStageKey || sellerStageMeta?.currentStage?.key)
  if (SELLER_SALE_PROGRESS_KEY_BY_PORTAL_STAGE[portalStageKey]) {
    return SELLER_SALE_PROGRESS_KEY_BY_PORTAL_STAGE[portalStageKey]
  }

  const acceptedOffer = (Array.isArray(sellerOfferItems) ? sellerOfferItems : []).some((offer) =>
    ['accepted', 'offer_accepted', 'signed_otp_received', 'otp_signed'].includes(normalizeSellerPortalKey(offer?.status)),
  )
  if (acceptedOffer) return 'finance'

  return 'otp'
}

function shouldShowSellerSaleProgress({ hasDocumentsComplete = false, sellerStageMeta = null, mainStage = '' } = {}) {
  const portalStageKey = normalizeSellerPortalKey(sellerStageMeta?.currentStageKey || sellerStageMeta?.currentStage?.key)
  return Boolean(
    hasDocumentsComplete ||
      normalizeSellerSaleMainStage(mainStage) ||
      ['offer_accepted', 'transfer', 'registered'].includes(portalStageKey),
  )
}

function buildSellerSaleProgressModel({
  hasDocumentsComplete = false,
  sellerStageMeta = null,
  mainStage = '',
  activeSellingContext = {},
  portal = {},
  sellerOfferItems = [],
} = {}) {
  const isStarted = shouldShowSellerSaleProgress({ hasDocumentsComplete, sellerStageMeta, mainStage })
  const currentKey = isStarted
    ? resolveSellerSaleProgressKey({
        sellerStageMeta,
        mainStage,
        activeSellingContext,
        portal,
        sellerOfferItems,
      })
    : ''
  const currentIndex = isStarted
    ? Math.max(SELLER_SALE_PROGRESS_STEPS.findIndex((step) => step.key === currentKey), 0)
    : -1
  const steps = SELLER_SALE_PROGRESS_STEPS.map((step, index) => ({
    ...step,
    state: isStarted && index < currentIndex ? 'completed' : isStarted && index === currentIndex ? 'current' : 'upcoming',
  }))
  const helperMessageByKey = {
    otp: 'Your seller file is complete. The next milestone is OTP activity for the sale.',
    finance: 'The OTP milestone is in place and finance is being tracked before transfer moves forward.',
    transfer: 'Finance and guarantees are moving into legal transfer milestones.',
    registration: 'Registration is the final legal close-out milestone for your sale.',
  }

  return {
    steps,
    currentKey,
    currentIndex,
    percent: isStarted ? Math.round((currentIndex / Math.max(SELLER_SALE_PROGRESS_STEPS.length - 1, 1)) * 100) : 0,
    helperMessage: isStarted
      ? helperMessageByKey[currentKey] || helperMessageByKey.otp
      : 'Your sale workflow will begin once the listing journey is complete and the sale moves into OTP.',
    title: 'Sale Progress',
    workflowKey: 'sale',
    isStarted,
    statusLabel: isStarted ? '' : 'Not started',
    description: 'Track OTP, finance, transfer, and registration milestones for your sale.',
    actionLabel: !isStarted || currentKey === 'otp' ? 'View offers' : 'View documents',
    actionTo: !isStarted || currentKey === 'otp' ? 'offers' : 'documents',
  }
}

function buildSellerPortalDetailsSections({ formData = {}, propertyAddress = '', uploadedDocuments = [] } = {}) {
  const details = formData && typeof formData === 'object' ? formData : {}
  const uploaded = Array.isArray(uploadedDocuments) ? uploadedDocuments : []
  const ownershipTypeLabel = formatSellerPortalLabel(details.ownershipType, SELLER_OWNERSHIP_TYPE_LABELS)
  const mandateTypeLabel = formatSellerPortalLabel(details.mandateType, SELLER_MANDATE_TYPE_LABELS)
  const occupancyLabel = formatSellerPortalLabel(details.occupancyStatus, SELLER_OCCUPANCY_STATUS_LABELS)
  const propertyConditionLabel = formatSellerPortalLabel(details.propertyCondition, SELLER_PROPERTY_CONDITION_LABELS)
  const maritalStatusLabel = formatSellerPortalLabel(details.maritalStatus)
  const maritalRegimeLabel = formatSellerPortalLabel(details.maritalRegime)
  const uploadedDocumentItems = uploaded
    .map((document) => ({
      label: document?.name || document?.fileName || document?.category || 'Uploaded document',
      value: formatShortPortalDate(document?.created_at || document?.uploadedAt || document?.createdAt, 'Uploaded'),
    }))
    .filter((item) => item.label)

  const sections = [
    {
      key: 'personal',
      title: 'Personal Details',
      description: 'The information you submitted during seller onboarding.',
      items: [
        { label: 'Full name', value: [details.sellerFirstName, details.sellerSurname].filter(Boolean).join(' ').trim() },
        { label: 'Email', value: details.email },
        { label: 'Phone', value: details.phone },
        { label: 'ID number', value: details.idNumber },
        { label: 'Residential address', value: details.residentialAddress },
        { label: 'Marital status', value: maritalStatusLabel },
        { label: 'Marital regime', value: maritalRegimeLabel },
        { label: 'Spouse name', value: details.spouseName },
        { label: 'Spouse email', value: details.spouseEmail },
        { label: 'Spouse phone', value: details.spousePhone },
      ],
    },
    {
      key: 'property',
      title: 'Property Details',
      description: 'The property and sale context that was captured.',
      items: [
        { label: 'Property address', value: propertyAddress },
        { label: 'Property category', value: toTitleLabel(details.propertyCategory || '') },
        { label: 'Property type', value: toTitleLabel(details.propertyType || '') },
        { label: 'Structure type', value: toTitleLabel(details.propertyStructureType || '') },
        { label: 'Occupancy', value: occupancyLabel },
        { label: 'Property condition', value: propertyConditionLabel },
        { label: 'Asking price', value: formatSellerPortalCurrency(details.askingPrice) },
        { label: 'Mandate type', value: mandateTypeLabel },
      ],
    },
    {
      key: 'ownership',
      title: 'Ownership Details',
      description: 'Ownership and authority details from your submission.',
      items: [
        { label: 'Ownership structure', value: ownershipTypeLabel },
        { label: 'VAT registered', value: formatSellerPortalBoolean(details.vatRegistered) },
        { label: 'VAT number', value: details.vatNumber },
        { label: 'Company name', value: details.companyName },
        { label: 'Company registration', value: details.companyRegistrationNumber },
        { label: 'Trust name', value: details.trustName },
        { label: 'Trust registration', value: details.trustRegistrationNumber },
        { label: 'Estate name', value: details.estateName },
        { label: 'Executor name', value: details.executorName },
        { label: 'Representative name', value: details.powerOfAttorneyName },
        { label: 'Principal name', value: details.principalName },
      ],
      listItems: Array.isArray(details.multipleOwners)
        ? details.multipleOwners
            .map((owner, index) => {
              const ownerName = [owner?.name, owner?.surname].filter(Boolean).join(' ').trim()
              const ownerMeta = [
                owner?.ownershipShare ? `${owner.ownershipShare}% share` : '',
                owner?.email || '',
                owner?.phone || '',
              ].filter(Boolean).join(' • ')
              return ownerName || ownerMeta
                ? {
                    label: ownerName || `Owner ${index + 1}`,
                    value: ownerMeta,
                  }
                : null
            })
            .filter(Boolean)
        : [],
    },
    {
      key: 'declarations',
      title: 'Declarations',
      description: 'Your sale timing, finance, and occupancy declarations.',
      items: [
        { label: 'Selling timeline', value: toTitleLabel(details.sellingTimeline || '') },
        { label: 'Selling reason', value: toTitleLabel(details.sellingReason || '') },
        { label: 'Existing bond', value: formatSellerPortalBoolean(details.existingBond) },
        { label: 'Bond bank', value: details.bondBank },
        { label: 'Cancellation required', value: formatSellerPortalBoolean(details.cancellationRequired) },
        { label: 'Lease exists', value: formatSellerPortalBoolean(details.leaseExists) },
        { label: 'Lease expiry', value: details.leaseExpiryDate ? formatShortPortalDate(details.leaseExpiryDate, '') : '' },
        { label: 'Tenant name', value: details.tenantName },
        { label: 'Tenant contact', value: details.tenantContactDetails },
        { label: 'Recent renovations', value: details.recentRenovations },
      ],
    },
    {
      key: 'documents',
      title: 'Documents Submitted',
      description: 'Files already uploaded in your seller portal.',
      items: uploadedDocumentItems,
    },
  ]

  return sections
    .map((section) => ({
      ...section,
      items: Array.isArray(section.items) ? section.items.filter((item) => String(item?.value || '').trim()) : [],
      listItems: Array.isArray(section.listItems) ? section.listItems.filter((item) => String(item?.label || item?.value || '').trim()) : [],
    }))
    .filter((section) => section.items.length || section.listItems.length)
}

function isOnboardingMetaKey(key) {
  return String(key || '').startsWith('__bridge_')
}

function getOnboardingFieldGroupLabel(key) {
  const normalized = String(key || '').toLowerCase()

  if (
    normalized.includes('finance') ||
    normalized.includes('bond') ||
    normalized.includes('deposit') ||
    normalized.includes('fund') ||
    normalized.includes('bank') ||
    normalized.includes('loan') ||
    normalized.includes('reservation')
  ) {
    return 'Finance'
  }

  if (
    normalized.includes('employment') ||
    normalized.includes('employer') ||
    normalized.includes('income') ||
    normalized.includes('occupation') ||
    normalized.includes('salary') ||
    normalized.includes('commission') ||
    normalized.includes('retire') ||
    normalized.includes('contract')
  ) {
    return 'Employment & Income'
  }

  if (
    normalized.includes('spouse') ||
    normalized.includes('marriage') ||
    normalized.includes('marital') ||
    normalized.includes('trust') ||
    normalized.includes('trustee') ||
    normalized.includes('director') ||
    normalized.includes('company') ||
    normalized.includes('representative') ||
    normalized.includes('signatory')
  ) {
    return 'Purchasing Structure'
  }

  if (
    normalized.includes('address') ||
    normalized.includes('postal') ||
    normalized.includes('city') ||
    normalized.includes('province') ||
    normalized.includes('nationality') ||
    normalized.includes('residency') ||
    normalized.includes('tax') ||
    normalized.includes('identity') ||
    normalized.includes('passport')
  ) {
    return 'Identity & Address'
  }

  return 'Buyer Details'
}

function groupOnboardingFieldEntries(entries = []) {
  return entries.reduce((groups, entry) => {
    const [key] = entry
    const group = getOnboardingFieldGroupLabel(key)
    if (!groups[group]) {
      groups[group] = []
    }
    groups[group].push(entry)
    return groups
  }, {})
}

function getDocumentSearchBlob(document = {}) {
  return `${document.group || ''} ${document.label || ''} ${document.description || ''} ${document.key || ''} ${document.category || ''} ${document.name || ''}`
    .toLowerCase()
    .trim()
}

function normalizeDocumentKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isSignedMandateDocumentLink(requirement = {}, document = {}) {
  const requirementSource = normalizeDocumentKey([
    requirement?.key,
    requirement?.requirement_key,
    requirement?.label,
    requirement?.requirement_name,
    requirement?.name,
  ].filter(Boolean).join(' '))
  const documentSource = normalizeDocumentKey([
    document?.requirementKey,
    document?.requirement_key,
    document?.document_type,
    document?.documentType,
    document?.category,
    document?.document_category,
    document?.name,
    document?.document_name,
  ].filter(Boolean).join(' '))
  const requirementIsSignedMandate =
    requirementSource.includes('signed_mandate') ||
    requirementSource.includes('mandate_signature') ||
    (requirementSource.includes('mandate') && requirementSource.includes('signed'))
  const documentIsSignedMandate =
    documentSource.includes('signed_mandate') ||
    documentSource.includes('mandate_signature') ||
    (documentSource.includes('mandate') && documentSource.includes('signed'))
  return requirementIsSignedMandate && documentIsSignedMandate
}

function hasPersistedPortalDocument(document = null) {
  if (!document) return false
  return Boolean(document.id || document.file_path || document.url)
}

function getPortalDocumentFileName(document = null, fallback = 'Uploaded document') {
  const name = String(document?.name || document?.file_name || '').trim()
  return name || fallback
}

function getPortalDocumentUploadedAt(document = null) {
  return document?.uploaded_at || document?.created_at || ''
}

function isInformationSheetDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return source.includes('information sheet') || source.includes('information_sheet')
}

function isReservationDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return source.includes('reservation') || source.includes('deposit proof') || source.includes('reservation_deposit_proof')
}

function isOtpDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return source.includes('otp') || source.includes('offer to purchase') || source.includes('signed_otp')
}

function isPropertyDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return (
    source.includes('title deed') ||
    source.includes('transfer') ||
    source.includes('warranty') ||
    source.includes('certificate') ||
    source.includes('compliance') ||
    source.includes('coc') ||
    source.includes('handover')
  )
}

function isBondDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return (
    source.includes('bond') ||
    source.includes('lender') ||
    source.includes('bank offer') ||
    source.includes('bond offer') ||
    source.includes('grant') ||
    source.includes('approval') ||
    source.includes('payslip') ||
    source.includes('income') ||
    source.includes('salary') ||
    source.includes('statement') ||
    source.includes('credit') ||
    source.includes('tax')
  )
}

function isFicaDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return (
    source.includes('fica') ||
    source.includes('identity') ||
    source.includes('passport') ||
    source.includes('address') ||
    source.includes('marriage') ||
    source.includes('anc') ||
    source.includes('spouse') ||
    source.includes('company registration') ||
    source.includes('cipc') ||
    source.includes('director identity') ||
    source.includes('authority resolution') ||
    source.includes('trust deed') ||
    source.includes('trustee') ||
    source.includes('trust resolution') ||
    source.includes('letter of authority') ||
    source.includes('letters_of_authority')
  )
}

function isSalesDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return (
    isReservationDocument(document) ||
    isOtpDocument(document) ||
    source.includes('sale') ||
    source.includes('mandate') ||
    source.includes('instruction')
  )
}

function getClientPortalDocumentGroup(document = {}) {
  const explicitCategory = normalizePortalWorkspaceCategory(
    document?.portalWorkspaceCategory || document?.portal_workspace_category,
  )
  if (explicitCategory) {
    return explicitCategory
  }

  const metadataCategory = resolvePortalDocumentMetadata(document).portalWorkspaceCategory
  if (metadataCategory && metadataCategory !== 'additional') {
    return metadataCategory
  }

  if (isInformationSheetDocument(document)) {
    return 'additional'
  }
  if (isPropertyDocument(document)) {
    return 'property'
  }
  if (isBondDocument(document)) {
    return 'bond'
  }
  if (isSalesDocument(document)) {
    return 'sales'
  }
  if (isFicaDocument(document)) {
    return 'fica'
  }

  return metadataCategory || 'additional'
}

function groupPortalRequiredDocuments(items = []) {
  return items.reduce(
    (groups, item) => {
      const bucket = getClientPortalDocumentGroup(item)
      if (!groups[bucket]) {
        groups[bucket] = []
      }
      groups[bucket].push(item)
      return groups
    },
    { sales: [], fica: [], bond: [], additional: [], property: [] },
  )
}

function escapePortalHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildOnboardingDocumentMarkup({
  portal,
  groupedOnboardingFields,
  purchasePriceLabel,
  onboardingStatus,
}) {
  const generatedAt = new Date().toLocaleString()
  const sectionMarkup = Object.entries(groupedOnboardingFields)
    .map(
      ([sectionLabel, entries]) => `
        <section class="section-card">
          <div class="section-head">
            <h3>${escapePortalHtml(sectionLabel)}</h3>
            <span>${entries.length} fields</span>
          </div>
          <div class="field-grid">
            ${entries
              .map(
                ([key, value]) => `
                  <article class="field-card">
                    <span>${escapePortalHtml(toTitleLabel(key))}</span>
                    <strong>${escapePortalHtml(formatOnboardingFieldValue(value))}</strong>
                  </article>
                `,
              )
              .join('')}
          </div>
        </section>
      `,
    )
    .join('')

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Arch9 Onboarding Information</title>
      <style>
        :root {
          color-scheme: light;
          --ink: #142132;
          --muted: #6b7d93;
          --line: #dbe5ef;
          --soft: #f6f9fc;
          --panel: #fbfdff;
          --brand: #35546c;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #eef3f9;
          color: var(--ink);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: white;
          padding: 18mm 16mm;
        }
        .brand {
          margin: 0;
          font-size: 12px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #6f8298;
          font-weight: 700;
        }
        .topbar {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
        }
        h1 {
          margin: 10px 0 6px;
          font-size: 32px;
          line-height: 1.05;
          letter-spacing: -0.04em;
        }
        .subtext {
          margin: 0;
          font-size: 15px;
          line-height: 1.6;
          color: var(--muted);
        }
        .meta {
          text-align: right;
          min-width: 180px;
        }
        .meta span {
          display: block;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #7b8ca2;
          font-weight: 700;
        }
        .meta strong {
          display: block;
          margin-top: 8px;
          font-size: 18px;
          line-height: 1.4;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 24px;
        }
        .summary-card,
        .field-card,
        .section-card {
          border: 1px solid var(--line);
          border-radius: 18px;
          background: var(--panel);
        }
        .summary-card {
          padding: 14px 16px;
        }
        .summary-card span,
        .field-card span {
          display: block;
          font-size: 11px;
          line-height: 1.4;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #7b8ca2;
          font-weight: 700;
        }
        .summary-card strong {
          display: block;
          margin-top: 10px;
          font-size: 22px;
          line-height: 1.2;
          letter-spacing: -0.03em;
        }
        .content {
          display: grid;
          gap: 16px;
          margin-top: 18px;
        }
        .section-card {
          padding: 16px;
        }
        .section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .section-head h3 {
          margin: 0;
          font-size: 18px;
          line-height: 1.2;
          letter-spacing: -0.03em;
        }
        .section-head span {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--line);
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 12px;
          color: var(--muted);
          background: white;
          font-weight: 600;
        }
        .field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .field-card {
          padding: 14px 16px;
          background: white;
        }
        .field-card strong {
          display: block;
          margin-top: 8px;
          font-size: 14px;
          line-height: 1.7;
          word-break: break-word;
        }
        @media print {
          body { background: white; }
          .page { margin: 0; width: auto; min-height: auto; padding: 14mm 12mm; }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <header class="topbar">
          <div>
            <p class="brand">Arch9</p>
            <h1>Onboarding Information</h1>
            <p class="subtext">${escapePortalHtml(portal?.unit?.development?.name || 'Development')} • Unit ${escapePortalHtml(
              portal?.unit?.unit_number || '—',
            )}</p>
            <p class="subtext">${escapePortalHtml(portal?.buyer?.name || 'Client')} • ${escapePortalHtml(onboardingStatus)}</p>
          </div>
          <div class="meta">
            <span>Generated</span>
            <strong>${escapePortalHtml(generatedAt)}</strong>
          </div>
        </header>
        <section class="summary-grid">
          <article class="summary-card">
            <span>Purchaser</span>
            <strong>${escapePortalHtml(portal?.buyer?.name || 'Client')}</strong>
          </article>
          <article class="summary-card">
            <span>Purchaser Type</span>
            <strong>${escapePortalHtml(
              toTitleLabel(portal?.transaction?.purchaser_type || portal?.onboardingFormData?.purchaserType || '—'),
            )}</strong>
          </article>
          <article class="summary-card">
            <span>Finance Type</span>
            <strong>${escapePortalHtml(
              toTitleLabel(portal?.transaction?.finance_type || portal?.onboardingFormData?.formData?.purchase_finance_type || '—'),
            )}</strong>
          </article>
          <article class="summary-card">
            <span>Purchase Price</span>
            <strong>${escapePortalHtml(purchasePriceLabel)}</strong>
          </article>
        </section>
        <section class="content">
          ${sectionMarkup || '<section class="section-card"><div class="field-card"><strong>No onboarding information has been submitted yet.</strong></div></section>'}
        </section>
      </main>
    </body>
  </html>`
}

const CLIENT_PORTAL_MENU = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'appointments', label: 'Appointments', icon: CalendarClock },
  { key: 'details', label: 'My Details', icon: User },
  { key: 'account', label: 'Account', icon: HandCoins },
  { key: 'bond_application', label: 'Bond Application', icon: FileSignature },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'handover', label: 'Handover', icon: KeyRound },
  { key: 'snags', label: 'Snags', icon: Wrench },
  { key: 'team', label: 'Team', icon: Users },
]

const BOND_APPLICATION_TABS = [
  { key: 'application', label: 'Application' },
  { key: 'offers', label: 'Offers' },
  { key: 'grant', label: 'Grant' },
]

const BOND_APPLICATION_SECTION_TABS = [
  { key: 'summary', label: 'Application Summary' },
  { key: 'personal_details', label: 'Personal Details' },
  { key: 'contact_address', label: 'Contact & Address' },
  { key: 'employment', label: 'Employment' },
  { key: 'credit_history', label: 'Credit History' },
  { key: 'loan_details', label: 'Loan Details' },
  { key: 'income_deductions_expenses', label: 'Income, Deductions & Expenses' },
  { key: 'banking_liabilities', label: 'Bank Accounts & Existing Debt' },
  { key: 'assets_liabilities', label: 'Assets & Liabilities' },
  { key: 'declarations_consents', label: 'Declarations & Consents' },
  { key: 'documents', label: 'Documents' },
]

const BOND_APPLICATION_BANK_OPTIONS = getSystemBanks()
  .filter((bank) => ['absa', 'fnb', 'standard-bank', 'nedbank', 'other'].includes(bank.id))
  .map((bank) => bank.shortName)

const BOND_YES_NO_OPTIONS = [
  { value: '', label: 'Select option' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

const BOND_TITLE_OPTIONS = [
  { value: '', label: 'Select title' },
  { value: 'mr', label: 'Mr' },
  { value: 'mrs', label: 'Mrs' },
  { value: 'ms', label: 'Ms' },
  { value: 'dr', label: 'Dr' },
  { value: 'prof', label: 'Prof' },
]

const BOND_GENDER_OPTIONS = [
  { value: '', label: 'Select gender' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

const BOND_ID_TYPE_OPTIONS = [
  { value: '', label: 'Select ID type' },
  { value: 'sa_id', label: 'SA ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'refugee_id', label: 'Refugee ID Card' },
]

const BOND_MARITAL_STATUS_OPTIONS = [
  { value: '', label: 'Select marital status' },
  { value: 'single', label: 'Single' },
  { value: 'married_anc', label: 'Married ANC' },
  { value: 'married_icop', label: 'Married in community of property' },
  { value: 'married_oocop', label: 'Married out of community of property' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
]

const BOND_OCCUPATION_STATUS_OPTIONS = [
  { value: '', label: 'Select occupation status' },
  { value: 'full_time_employed', label: 'Full-time employed' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'home_executive', label: 'Home executive' },
  { value: 'pensioner', label: 'Pensioner' },
  { value: 'part_time_employed', label: 'Part-time employed' },
  { value: 'temporary_employed', label: 'Temporary employed' },
  { value: 'unemployed', label: 'Unemployed' },
]

const BOND_OCCUPATIONAL_LEVEL_OPTIONS = [
  { value: '', label: 'Select occupational level' },
  { value: 'senior_management', label: 'Senior management' },
  { value: 'management', label: 'Management' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'skilled_worker', label: 'Skilled worker' },
  { value: 'semi_skilled', label: 'Semi-skilled' },
  { value: 'unskilled', label: 'Unskilled' },
  { value: 'junior_position', label: 'Junior position' },
]

const BOND_ACCOUNT_TYPE_OPTIONS = [
  { value: '', label: 'Select account type' },
  { value: 'current', label: 'Current/Cheque' },
  { value: 'savings', label: 'Savings' },
  { value: 'transmission', label: 'Transmission' },
  { value: 'bond', label: 'Bond' },
]

const BOND_LEGAL_NOTICE_OPTIONS = [
  { value: '', label: 'Select delivery method' },
  { value: 'hand_delivered', label: 'Hand delivered' },
  { value: 'registered_mail', label: 'Registered mail' },
]

const BOND_APPLICATION_STATUS_OPTIONS = [
  'Not Started',
  'In Progress',
  'Submitted',
  'Under Review',
  'Approved',
  'Declined',
]

const BOND_APPLICATION_BANK_MATCHERS = getSystemBanks().map((bank) => bank.shortName)

function extractBondBankName(value) {
  const source = String(value || '')
  const uppercaseSource = source.toUpperCase()
  const match = BOND_APPLICATION_BANK_MATCHERS.find((bankName) => uppercaseSource.includes(bankName.toUpperCase()))
  return match || 'Other'
}

function resolveBondApplicationStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  const matched = BOND_APPLICATION_STATUS_OPTIONS.find((status) => status.toLowerCase() === normalized)
  return matched || 'Not Started'
}

function normalizeBondOfferDecisionState(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized === 'accepted' || normalized === 'declined' ? normalized : ''
}

function getBondApplicationApplicantDefault(roleKey, source = {}) {
  const buyerName = String(source?.buyer?.name || '').trim()
  const [firstName = '', ...surnameParts] = buyerName.split(/\s+/)
  const surnameFromBuyer = surnameParts.join(' ')
  const formData = source?.onboardingFormData?.formData || {}

  if (roleKey === 'co_applicant') {
    return {
      key: 'co_applicant',
      label: 'Co-applicant',
      title: '',
      gender: '',
      first_name: formData.spouse_full_name || '',
      last_name: '',
      date_of_birth: '',
      id_type: '',
      id_number: formData.spouse_identity_number || '',
      passport_number: '',
      passport_country_of_issue: '',
      refugee_id_card_number: '',
      sa_citizen: '',
      nationality: '',
      city_of_birth: '',
      country_of_birth: '',
      sa_permanent_resident: '',
      temporary_sa_resident: '',
      permit_type: '',
      permit_number: '',
      permit_expiry_date: '',
      marital_status: formData.marital_status || '',
      married_anc_register_both_names: '',
      country_of_marriage: '',
      number_of_dependants: '',
      ethnic_group: '',
      sa_tax_number: '',
      tax_number_unavailable_reason: '',
      tax_returns_outside_sa: '',
      foreign_tax_country: '',
      foreign_tax_number: '',
      current_residential_status: '',
      first_time_home_buyer: '',
      main_residence: '',
      highest_level_of_education: '',
      smoking_tobacco_ecig_declaration: '',
      email: formData.spouse_email || '',
      phone: formData.spouse_phone || '',
    }
  }

  return {
    key: 'primary',
    label: 'Primary applicant',
    title: '',
    gender: '',
    first_name: formData.first_name || firstName,
    last_name: formData.last_name || surnameFromBuyer,
    date_of_birth: formData.date_of_birth || '',
    id_type: formData.identity_number ? 'sa_id' : formData.passport_number ? 'passport' : '',
    id_number: formData.identity_number || '',
    passport_number: formData.passport_number || '',
    passport_country_of_issue: '',
    refugee_id_card_number: '',
    sa_citizen: formData.nationality ? 'yes' : '',
    nationality: formData.nationality || '',
    city_of_birth: '',
    country_of_birth: '',
    sa_permanent_resident: '',
    temporary_sa_resident: '',
    permit_type: '',
    permit_number: '',
    permit_expiry_date: '',
    married_anc_register_both_names: '',
    country_of_marriage: '',
    number_of_dependants: formData.number_of_dependants || '',
    ethnic_group: '',
    sa_tax_number: formData.tax_number || '',
    tax_number_unavailable_reason: '',
    tax_returns_outside_sa: '',
    foreign_tax_country: '',
    foreign_tax_number: '',
    current_residential_status: formData.residency_status || '',
    first_time_home_buyer: formData.first_time_buyer || '',
    main_residence: formData.primary_residence || '',
    highest_level_of_education: '',
    smoking_tobacco_ecig_declaration: '',
    email: formData.email || source?.buyer?.email || '',
    phone: formData.phone || source?.buyer?.phone || '',
    marital_status: formData.marital_status || '',
  }
}

function buildBondApplicationDraft(portal) {
  const formData = portal?.onboardingFormData?.formData || {}
  const existing = formData.bond_application && typeof formData.bond_application === 'object' ? formData.bond_application : {}
  const primaryDefault = getBondApplicationApplicantDefault('primary', portal)
  const coApplicantDefault = getBondApplicationApplicantDefault('co_applicant', portal)
  const purchasePrice =
    Number(formData.purchase_price || portal?.transaction?.purchase_price || portal?.transaction?.sales_price || portal?.unit?.price || 0) || 0
  const financeType = normalizeFinanceType(
    formData.purchase_finance_type || portal?.transaction?.finance_type || 'bond',
    { allowUnknown: true },
  )

  const existingApplicants = Array.isArray(existing.applicants) ? existing.applicants : []
  const primaryApplicant = existingApplicants.find((item) => String(item?.key || '').toLowerCase() === 'primary') || {}
  const coApplicant = existingApplicants.find((item) => String(item?.key || '').toLowerCase() === 'co_applicant') || {}

  const defaultSummary = {
    applicant_name: `${formData.first_name || ''} ${formData.last_name || ''}`.trim() || portal?.buyer?.name || '',
    has_co_applicant: formData.spouse_full_name || formData.spouse_email || formData.spouse_identity_number ? 'yes' : '',
    has_surety: '',
    property_reference: `${portal?.unit?.development?.name || 'Development'} ${portal?.unit?.unit_number ? `• Unit ${portal.unit.unit_number}` : ''}`.trim(),
    development_name: portal?.unit?.development?.name || '',
    unit_reference: portal?.unit?.unit_number ? `Unit ${portal.unit.unit_number}` : '',
    purchase_price: purchasePrice > 0 ? String(purchasePrice) : '',
    deposit_contribution:
      formData.deposit_amount ||
      formData.cash_amount ||
      (portal?.transaction?.deposit_amount !== null && portal?.transaction?.deposit_amount !== undefined
        ? String(portal.transaction.deposit_amount)
        : ''),
    finance_type: financeType,
    marital_status: formData.marital_status || '',
    main_residence: formData.primary_residence || '',
    first_time_home_buyer: formData.first_time_buyer || '',
  }

  return {
    status: resolveBondApplicationStatus(existing.status),
    submitted_at: existing.submitted_at || '',
    selected_banks: Array.isArray(existing.selected_banks)
      ? existing.selected_banks.filter(Boolean)
      : Array.isArray(existing.selectedBanks)
        ? existing.selectedBanks.filter(Boolean)
        : [],
    applicants: [
      { ...primaryDefault, ...primaryApplicant, key: 'primary', label: 'Primary applicant' },
      { ...coApplicantDefault, ...coApplicant, key: 'co_applicant', label: 'Co-applicant' },
    ],
    summary: {
      ...defaultSummary,
      ...(existing.summary || {}),
    },
    contact_address: {
      home_number: existing?.contact_address?.home_number || '',
      cellphone_number: existing?.contact_address?.cellphone_number || formData.phone || portal?.buyer?.phone || '',
      work_number: existing?.contact_address?.work_number || '',
      email_address: existing?.contact_address?.email_address || formData.email || portal?.buyer?.email || '',
      fax_number: existing?.contact_address?.fax_number || '',
      home_language: existing?.contact_address?.home_language || '',
      correspondence_language: existing?.contact_address?.correspondence_language || '',
      residential_address_street: existing?.contact_address?.residential_address_street || formData.street_address || '',
      residential_address_suburb: existing?.contact_address?.residential_address_suburb || formData.suburb || '',
      residential_address_city: existing?.contact_address?.residential_address_city || formData.city || '',
      residential_address_country: existing?.contact_address?.residential_address_country || 'South Africa',
      residential_address_postal_code: existing?.contact_address?.residential_address_postal_code || formData.postal_code || '',
      residential_years: existing?.contact_address?.residential_years || '',
      residential_months: existing?.contact_address?.residential_months || '',
      postal_same_as_residential: existing?.contact_address?.postal_same_as_residential || 'yes',
      postal_address_street: existing?.contact_address?.postal_address_street || '',
      postal_address_suburb: existing?.contact_address?.postal_address_suburb || '',
      postal_address_city: existing?.contact_address?.postal_address_city || '',
      postal_address_country: existing?.contact_address?.postal_address_country || 'South Africa',
      postal_address_postal_code: existing?.contact_address?.postal_address_postal_code || '',
      legal_notice_delivery_method: existing?.contact_address?.legal_notice_delivery_method || '',
      future_legal_correspondence_same_as_postal: existing?.contact_address?.future_legal_correspondence_same_as_postal || 'yes',
      future_legal_address_street: existing?.contact_address?.future_legal_address_street || '',
      future_legal_address_suburb: existing?.contact_address?.future_legal_address_suburb || '',
      future_legal_address_city: existing?.contact_address?.future_legal_address_city || '',
      future_legal_address_country: existing?.contact_address?.future_legal_address_country || 'South Africa',
      future_legal_address_postal_code: existing?.contact_address?.future_legal_address_postal_code || '',
      is_public_official: existing?.contact_address?.is_public_official || '',
      associated_with_public_official: existing?.contact_address?.associated_with_public_official || '',
      public_official_relationship_nature: existing?.contact_address?.public_official_relationship_nature || '',
      public_official_name: existing?.contact_address?.public_official_name || '',
    },
    employment: {
      primary: {
        occupation_status: existing?.employment?.primary?.occupation_status || existing?.employment?.employment_status || '',
        occupational_level: existing?.employment?.primary?.occupational_level || '',
        nature_of_occupation: existing?.employment?.primary?.nature_of_occupation || existing?.employment?.occupation || '',
        employer_name: existing?.employment?.primary?.employer_name || existing?.employment?.employer_name || formData.employer_name || '',
        company_registration_number: existing?.employment?.primary?.company_registration_number || '',
        employee_number: existing?.employment?.primary?.employee_number || '',
        employment_years: existing?.employment?.primary?.employment_years || '',
        employment_months: existing?.employment?.primary?.employment_months || '',
        works_in_south_africa: existing?.employment?.primary?.works_in_south_africa || '',
        employer_address_street: existing?.employment?.primary?.employer_address_street || '',
        employer_address_suburb: existing?.employment?.primary?.employer_address_suburb || '',
        employer_address_city: existing?.employment?.primary?.employer_address_city || '',
        employer_address_country: existing?.employment?.primary?.employer_address_country || 'South Africa',
        employer_address_postal_code: existing?.employment?.primary?.employer_address_postal_code || '',
        purchase_coincides_job_change: existing?.employment?.primary?.purchase_coincides_job_change || '',
        previously_employed: existing?.employment?.primary?.previously_employed || '',
        own_business_income_percent: existing?.employment?.primary?.own_business_income_percent || '',
        shareholder_in_employer_business: existing?.employment?.primary?.shareholder_in_employer_business || '',
        shareholding_percent: existing?.employment?.primary?.shareholding_percent || '',
        previous_employer_1_name: existing?.employment?.primary?.previous_employer_1_name || '',
        previous_employer_1_duration: existing?.employment?.primary?.previous_employer_1_duration || '',
        previous_employer_2_name: existing?.employment?.primary?.previous_employer_2_name || '',
        previous_employer_2_duration: existing?.employment?.primary?.previous_employer_2_duration || '',
      },
      co_applicant: {
        occupation_status: existing?.employment?.co_applicant?.occupation_status || '',
        occupational_level: existing?.employment?.co_applicant?.occupational_level || '',
        nature_of_occupation: existing?.employment?.co_applicant?.nature_of_occupation || '',
        employer_name: existing?.employment?.co_applicant?.employer_name || '',
        company_registration_number: existing?.employment?.co_applicant?.company_registration_number || '',
        employee_number: existing?.employment?.co_applicant?.employee_number || '',
        employment_years: existing?.employment?.co_applicant?.employment_years || '',
        employment_months: existing?.employment?.co_applicant?.employment_months || '',
        works_in_south_africa: existing?.employment?.co_applicant?.works_in_south_africa || '',
        employer_address_street: existing?.employment?.co_applicant?.employer_address_street || '',
        employer_address_suburb: existing?.employment?.co_applicant?.employer_address_suburb || '',
        employer_address_city: existing?.employment?.co_applicant?.employer_address_city || '',
        employer_address_country: existing?.employment?.co_applicant?.employer_address_country || 'South Africa',
        employer_address_postal_code: existing?.employment?.co_applicant?.employer_address_postal_code || '',
        purchase_coincides_job_change: existing?.employment?.co_applicant?.purchase_coincides_job_change || '',
        previously_employed: existing?.employment?.co_applicant?.previously_employed || '',
        own_business_income_percent: existing?.employment?.co_applicant?.own_business_income_percent || '',
        shareholder_in_employer_business: existing?.employment?.co_applicant?.shareholder_in_employer_business || '',
        shareholding_percent: existing?.employment?.co_applicant?.shareholding_percent || '',
        previous_employer_1_name: existing?.employment?.co_applicant?.previous_employer_1_name || '',
        previous_employer_1_duration: existing?.employment?.co_applicant?.previous_employer_1_duration || '',
        previous_employer_2_name: existing?.employment?.co_applicant?.previous_employer_2_name || '',
        previous_employer_2_duration: existing?.employment?.co_applicant?.previous_employer_2_duration || '',
      },
    },
    credit_history: {
      currently_under_administration: String(existing?.credit_history?.currently_under_administration || ''),
      ever_under_administration: String(existing?.credit_history?.ever_under_administration || ''),
      judgments_taken: String(existing?.credit_history?.judgments_taken || existing?.credit_history?.judgments || ''),
      currently_under_debt_review: String(existing?.credit_history?.currently_under_debt_review || existing?.credit_history?.under_debt_review || ''),
      debt_counsellor_name: existing?.credit_history?.debt_counsellor_name || '',
      debt_counsellor_phone: existing?.credit_history?.debt_counsellor_phone || '',
      under_debt_rearrangement: String(existing?.credit_history?.under_debt_rearrangement || ''),
      ever_declared_insolvent: String(existing?.credit_history?.ever_declared_insolvent || existing?.credit_history?.insolvent || ''),
      insolvency_date: existing?.credit_history?.insolvency_date || '',
      rehabilitation_date: existing?.credit_history?.rehabilitation_date || '',
      adverse_credit_listings: String(existing?.credit_history?.adverse_credit_listings || ''),
      adverse_credit_listing_details: existing?.credit_history?.adverse_credit_listing_details || '',
      credit_bureau_dispute: String(existing?.credit_history?.credit_bureau_dispute || existing?.credit_history?.disputes || ''),
      bound_by_surety_agreements: String(existing?.credit_history?.bound_by_surety_agreements || ''),
      surety_amount: existing?.credit_history?.surety_amount || '',
      currently_paying_surety_account: String(existing?.credit_history?.currently_paying_surety_account || ''),
      surety_monthly_instalment: existing?.credit_history?.surety_monthly_instalment || '',
      surety_details: existing?.credit_history?.surety_details || '',
      settling_surety_account: String(existing?.credit_history?.settling_surety_account || ''),
      surety_new_instalment_if_reduced: existing?.credit_history?.surety_new_instalment_if_reduced || '',
      surety_in_favour_of: existing?.credit_history?.surety_in_favour_of || '',
    },
    loan_details: {
      erf_or_section_number: existing?.loan_details?.erf_or_section_number || portal?.unit?.unit_number || '',
      street_or_complex: existing?.loan_details?.street_or_complex || portal?.transaction?.property_address_line_1 || formData.street_address || '',
      suburb: existing?.loan_details?.suburb || portal?.transaction?.suburb || formData.suburb || '',
      amount_to_be_registered:
        existing?.loan_details?.amount_to_be_registered ||
        formData.bond_amount ||
        (portal?.transaction?.bond_amount !== null && portal?.transaction?.bond_amount !== undefined
          ? String(portal.transaction.bond_amount)
          : ''),
      additional_amount_for_solar_energy: existing?.loan_details?.additional_amount_for_solar_energy || '',
      solar_energy_loan_amount: existing?.loan_details?.solar_energy_loan_amount || '',
      solar_loan_term: existing?.loan_details?.solar_loan_term || '',
      solar_panels_included: existing?.loan_details?.solar_panels_included || '',
      debit_order_bank_name: existing?.loan_details?.debit_order_bank_name || '',
      debit_order_account_number: existing?.loan_details?.debit_order_account_number || '',
      preferred_debit_order_date: existing?.loan_details?.preferred_debit_order_date || '',
    },
    income_deductions_expenses: {
      primary: {
        gross_salary: existing?.income_deductions_expenses?.primary?.gross_salary || existing?.income?.salary || formData.gross_monthly_income || '',
        average_commission: existing?.income_deductions_expenses?.primary?.average_commission || existing?.income?.commission || '',
        investment_income: existing?.income_deductions_expenses?.primary?.investment_income || '',
        rental_income: existing?.income_deductions_expenses?.primary?.rental_income || existing?.income?.rental_income || '',
        car_allowance: existing?.income_deductions_expenses?.primary?.car_allowance || '',
        travel_allowance: existing?.income_deductions_expenses?.primary?.travel_allowance || '',
        entertainment_allowance: existing?.income_deductions_expenses?.primary?.entertainment_allowance || '',
        income_from_sureties: existing?.income_deductions_expenses?.primary?.income_from_sureties || '',
        housing_subsidy: existing?.income_deductions_expenses?.primary?.housing_subsidy || '',
        maintenance_or_alimony_income: existing?.income_deductions_expenses?.primary?.maintenance_or_alimony_income || '',
        average_overtime: existing?.income_deductions_expenses?.primary?.average_overtime || '',
        other_income_description: existing?.income_deductions_expenses?.primary?.other_income_description || '',
        other_income_value: existing?.income_deductions_expenses?.primary?.other_income_value || existing?.income?.other_income || '',
        tax_paye: existing?.income_deductions_expenses?.primary?.tax_paye || '',
        pension: existing?.income_deductions_expenses?.primary?.pension || '',
        uif: existing?.income_deductions_expenses?.primary?.uif || '',
        medical_aid: existing?.income_deductions_expenses?.primary?.medical_aid || '',
        other_deductions_description: existing?.income_deductions_expenses?.primary?.other_deductions_description || '',
        other_deductions_value: existing?.income_deductions_expenses?.primary?.other_deductions_value || '',
        rental_expense: existing?.income_deductions_expenses?.primary?.rental_expense || existing?.expenses?.housing || '',
        maintenance_or_alimony_expense: existing?.income_deductions_expenses?.primary?.maintenance_or_alimony_expense || '',
        rates_taxes_levies: existing?.income_deductions_expenses?.primary?.rates_taxes_levies || '',
        water_electricity: existing?.income_deductions_expenses?.primary?.water_electricity || existing?.expenses?.utilities || '',
        assurance_insurance_funeral_ra: existing?.income_deductions_expenses?.primary?.assurance_insurance_funeral_ra || existing?.expenses?.insurance || '',
        groceries: existing?.income_deductions_expenses?.primary?.groceries || existing?.expenses?.groceries || '',
        transport: existing?.income_deductions_expenses?.primary?.transport || existing?.expenses?.transport || '',
        security: existing?.income_deductions_expenses?.primary?.security || '',
        education: existing?.income_deductions_expenses?.primary?.education || '',
        medical_excluding_payroll: existing?.income_deductions_expenses?.primary?.medical_excluding_payroll || '',
        cellphone_internet: existing?.income_deductions_expenses?.primary?.cellphone_internet || '',
        dstv_tv: existing?.income_deductions_expenses?.primary?.dstv_tv || '',
        other_expenses_description: existing?.income_deductions_expenses?.primary?.other_expenses_description || '',
        other_expenses_value: existing?.income_deductions_expenses?.primary?.other_expenses_value || existing?.expenses?.other_expenses || '',
      },
      co_applicant: {
        gross_salary: existing?.income_deductions_expenses?.co_applicant?.gross_salary || '',
        average_commission: existing?.income_deductions_expenses?.co_applicant?.average_commission || '',
        investment_income: existing?.income_deductions_expenses?.co_applicant?.investment_income || '',
        rental_income: existing?.income_deductions_expenses?.co_applicant?.rental_income || '',
        car_allowance: existing?.income_deductions_expenses?.co_applicant?.car_allowance || '',
        travel_allowance: existing?.income_deductions_expenses?.co_applicant?.travel_allowance || '',
        entertainment_allowance: existing?.income_deductions_expenses?.co_applicant?.entertainment_allowance || '',
        income_from_sureties: existing?.income_deductions_expenses?.co_applicant?.income_from_sureties || '',
        housing_subsidy: existing?.income_deductions_expenses?.co_applicant?.housing_subsidy || '',
        maintenance_or_alimony_income: existing?.income_deductions_expenses?.co_applicant?.maintenance_or_alimony_income || '',
        average_overtime: existing?.income_deductions_expenses?.co_applicant?.average_overtime || '',
        other_income_description: existing?.income_deductions_expenses?.co_applicant?.other_income_description || '',
        other_income_value: existing?.income_deductions_expenses?.co_applicant?.other_income_value || '',
        tax_paye: existing?.income_deductions_expenses?.co_applicant?.tax_paye || '',
        pension: existing?.income_deductions_expenses?.co_applicant?.pension || '',
        uif: existing?.income_deductions_expenses?.co_applicant?.uif || '',
        medical_aid: existing?.income_deductions_expenses?.co_applicant?.medical_aid || '',
        other_deductions_description: existing?.income_deductions_expenses?.co_applicant?.other_deductions_description || '',
        other_deductions_value: existing?.income_deductions_expenses?.co_applicant?.other_deductions_value || '',
        rental_expense: existing?.income_deductions_expenses?.co_applicant?.rental_expense || '',
        maintenance_or_alimony_expense: existing?.income_deductions_expenses?.co_applicant?.maintenance_or_alimony_expense || '',
        rates_taxes_levies: existing?.income_deductions_expenses?.co_applicant?.rates_taxes_levies || '',
        water_electricity: existing?.income_deductions_expenses?.co_applicant?.water_electricity || '',
        assurance_insurance_funeral_ra: existing?.income_deductions_expenses?.co_applicant?.assurance_insurance_funeral_ra || '',
        groceries: existing?.income_deductions_expenses?.co_applicant?.groceries || '',
        transport: existing?.income_deductions_expenses?.co_applicant?.transport || '',
        security: existing?.income_deductions_expenses?.co_applicant?.security || '',
        education: existing?.income_deductions_expenses?.co_applicant?.education || '',
        medical_excluding_payroll: existing?.income_deductions_expenses?.co_applicant?.medical_excluding_payroll || '',
        cellphone_internet: existing?.income_deductions_expenses?.co_applicant?.cellphone_internet || '',
        dstv_tv: existing?.income_deductions_expenses?.co_applicant?.dstv_tv || '',
        other_expenses_description: existing?.income_deductions_expenses?.co_applicant?.other_expenses_description || '',
        other_expenses_value: existing?.income_deductions_expenses?.co_applicant?.other_expenses_value || '',
      },
    },
    banking_liabilities: {
      primary_bank_name: existing?.banking_liabilities?.primary_bank_name || '',
      primary_account_type: existing?.banking_liabilities?.primary_account_type || '',
      primary_account_holder_name: existing?.banking_liabilities?.primary_account_holder_name || '',
      legal_entity_account_name_match: existing?.banking_liabilities?.legal_entity_account_name_match || '',
      business_bank_account: existing?.banking_liabilities?.business_bank_account || '',
      primary_account_number: existing?.banking_liabilities?.primary_account_number || '',
      primary_balance_debit_credit: existing?.banking_liabilities?.primary_balance_debit_credit || '',
      primary_bank_first_consideration_consent: existing?.banking_liabilities?.primary_bank_first_consideration_consent || '',
      home_loan_1_bank: existing?.banking_liabilities?.home_loan_1_bank || '',
      home_loan_1_account_holder_name: existing?.banking_liabilities?.home_loan_1_account_holder_name || '',
      home_loan_1_account_number: existing?.banking_liabilities?.home_loan_1_account_number || '',
      home_loan_1_outstanding_balance: existing?.banking_liabilities?.home_loan_1_outstanding_balance || '',
      home_loan_1_monthly_instalment: existing?.banking_liabilities?.home_loan_1_monthly_instalment || '',
      home_loan_1_selling_property: existing?.banking_liabilities?.home_loan_1_selling_property || '',
      home_loan_1_new_instalment_if_reduced: existing?.banking_liabilities?.home_loan_1_new_instalment_if_reduced || '',
      other_finance_1_bank: existing?.banking_liabilities?.other_finance_1_bank || '',
      other_finance_1_account_type: existing?.banking_liabilities?.other_finance_1_account_type || '',
      other_finance_1_current_balance: existing?.banking_liabilities?.other_finance_1_current_balance || '',
      other_finance_1_monthly_payment: existing?.banking_liabilities?.other_finance_1_monthly_payment || '',
      other_finance_1_settled: existing?.banking_liabilities?.other_finance_1_settled || '',
      other_finance_1_business_account: existing?.banking_liabilities?.other_finance_1_business_account || '',
      other_finance_1_legal_entity_account: existing?.banking_liabilities?.other_finance_1_legal_entity_account || '',
      retail_account_name: existing?.banking_liabilities?.retail_account_name || '',
      retail_current_balance: existing?.banking_liabilities?.retail_current_balance || '',
      retail_monthly_payment: existing?.banking_liabilities?.retail_monthly_payment || '',
      retail_settled: existing?.banking_liabilities?.retail_settled || '',
    },
    assets_liabilities: {
      fixed_property: existing?.assets_liabilities?.fixed_property || existing?.assets?.property_owned || '',
      vehicles: existing?.assets_liabilities?.vehicles || '',
      investments: existing?.assets_liabilities?.investments || existing?.assets?.investments || '',
      furniture_and_fittings: existing?.assets_liabilities?.furniture_and_fittings || '',
      other_assets_description: existing?.assets_liabilities?.other_assets_description || '',
      other_assets_value: existing?.assets_liabilities?.other_assets_value || '',
      liabilities_total: existing?.assets_liabilities?.liabilities_total || '',
      other_liabilities_description: existing?.assets_liabilities?.other_liabilities_description || '',
      other_liabilities_value: existing?.assets_liabilities?.other_liabilities_value || '',
      total_assets: existing?.assets_liabilities?.total_assets || '',
      total_liabilities: existing?.assets_liabilities?.total_liabilities || '',
      net_asset_value: existing?.assets_liabilities?.net_asset_value || existing?.assets?.net_worth || '',
    },
    declarations_consents: {
      loan_processing_consent: Boolean(existing?.declarations_consents?.loan_processing_consent || existing?.consent?.credit_check_consent),
      credit_bureau_fraud_bank_data_consent: Boolean(existing?.declarations_consents?.credit_bureau_fraud_bank_data_consent || existing?.consent?.credit_check_consent),
      insurance_third_party_communication_consent: Boolean(existing?.declarations_consents?.insurance_third_party_communication_consent),
      nhfc_first_home_finance_consent: Boolean(existing?.declarations_consents?.nhfc_first_home_finance_consent),
      marketing_privacy_preference: existing?.declarations_consents?.marketing_privacy_preference || '',
      declaration_accepted: Boolean(existing?.declarations_consents?.declaration_accepted || existing?.consent?.declaration_accepted),
      digital_signature_name: existing?.declarations_consents?.digital_signature_name || `${formData.first_name || ''} ${formData.last_name || ''}`.trim(),
      digital_signature_date: existing?.declarations_consents?.digital_signature_date || '',
    },
    consent: {
      credit_check_consent: Boolean(
        existing?.consent?.credit_check_consent ||
        existing?.declarations_consents?.loan_processing_consent ||
        existing?.declarations_consents?.credit_bureau_fraud_bank_data_consent,
      ),
      declaration_accepted: Boolean(
        existing?.consent?.declaration_accepted ||
        existing?.declarations_consents?.declaration_accepted,
      ),
    },
    offers: {
      accepted_offer_document_id:
        existing?.offers?.accepted_offer_document_id || existing?.offers?.acceptedOfferDocumentId || '',
      accepted_bank: existing?.offers?.accepted_bank || existing?.offers?.acceptedBank || '',
      accepted_at: existing?.offers?.accepted_at || existing?.offers?.acceptedAt || '',
      decision_state:
        normalizeBondOfferDecisionState(existing?.offers?.decision_state || existing?.offers?.decisionState) ||
        (existing?.offers?.accepted_offer_document_id || existing?.offers?.acceptedOfferDocumentId ? 'accepted' : ''),
      decision_offer_document_id:
        existing?.offers?.decision_offer_document_id ||
        existing?.offers?.decisionOfferDocumentId ||
        existing?.offers?.accepted_offer_document_id ||
        existing?.offers?.acceptedOfferDocumentId ||
        '',
      decision_at:
        existing?.offers?.decision_at ||
        existing?.offers?.decisionAt ||
        existing?.offers?.accepted_at ||
        existing?.offers?.acceptedAt ||
        '',
      declined_offer_document_ids: Array.isArray(existing?.offers?.declined_offer_document_ids)
        ? existing.offers.declined_offer_document_ids.map((value) => String(value)).filter(Boolean)
        : Array.isArray(existing?.offers?.declinedOfferDocumentIds)
          ? existing.offers.declinedOfferDocumentIds.map((value) => String(value)).filter(Boolean)
          : [],
      signed_offer_document_id:
        existing?.offers?.signed_offer_document_id || existing?.offers?.signedOfferDocumentId || '',
      signed_offer_uploaded_at:
        existing?.offers?.signed_offer_uploaded_at || existing?.offers?.signedOfferUploadedAt || '',
    },
    // Legacy keys kept for backward compatibility with existing reads.
    income: existing?.income || {},
    expenses: existing?.expenses || {},
    assets: existing?.assets || {},
  }
}

const MY_DETAILS_SELECT_OPTION_GROUPS = {
  purchaseType: [
    { value: '', label: 'Select purchase type' },
    { value: 'individual', label: 'Individual' },
    { value: 'joint', label: 'Joint Purchase' },
    { value: 'company', label: 'Company' },
    { value: 'trust', label: 'Trust' },
  ],
  entityType: [
    { value: '', label: 'Select entity type' },
    { value: 'individual', label: 'Individual' },
    { value: 'company', label: 'Company' },
    { value: 'trust', label: 'Trust' },
    { value: 'foreign_purchaser', label: 'Foreign Purchaser' },
  ],
  naturalMode: [
    { value: '', label: 'Select purchase mode' },
    { value: 'individual', label: 'Individual Purchaser' },
    { value: 'co_purchasing', label: 'Co-Purchasing' },
  ],
  yesNo: [
    { value: '', label: 'Select option' },
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ],
  financeType: [
    { value: '', label: 'Select finance type' },
    { value: 'cash', label: 'Cash' },
    { value: 'bond', label: 'Bond' },
    { value: 'combination', label: 'Hybrid' },
  ],
  maritalStatus: [
    { value: '', label: 'Select marital status' },
    { value: 'single', label: 'Single' },
    { value: 'married', label: 'Married' },
    { value: 'divorced', label: 'Divorced' },
    { value: 'widowed', label: 'Widowed' },
  ],
  maritalRegime: [
    { value: '', label: 'Select marital regime' },
    { value: 'not_applicable', label: 'Not applicable' },
    { value: 'in_community', label: 'In community of property' },
    { value: 'out_of_community', label: 'Out of community of property' },
    { value: 'out_of_community_with_accrual', label: 'Out of community with accrual' },
  ],
  bondStatus: [
    { value: '', label: 'Select bond status' },
    { value: 'not_started', label: 'Not started' },
    { value: 'pre_approval_only', label: 'Pre-approval only' },
    { value: 'application_in_progress', label: 'Application in progress' },
    { value: 'submitted_to_banks', label: 'Submitted to banks' },
    { value: 'bond_approved', label: 'Bond approved' },
  ],
}

const MY_DETAILS_PURCHASER_FIELDS = new Set([
  'first_name',
  'last_name',
  'date_of_birth',
  'identity_number',
  'passport_number',
  'nationality',
  'residency_status',
  'tax_number',
  'email',
  'phone',
  'street_address',
  'suburb',
  'city',
  'postal_code',
  'marital_status',
  'marital_regime',
  'spouse_full_name',
  'spouse_identity_number',
  'spouse_email',
  'spouse_phone',
  'spouse_is_co_purchaser',
  'employment_type',
  'employer_name',
  'job_title',
  'employment_start_date',
  'business_name',
  'years_in_business',
  'gross_monthly_income',
  'net_monthly_income',
  'income_frequency',
  'number_of_dependants',
  'monthly_credit_commitments',
  'first_time_buyer',
  'primary_residence',
  'investment_purchase',
])

const MY_DETAILS_FINANCE_FIELDS = new Set([
  'purchase_finance_type',
  'purchase_price',
  'cash_amount',
  'bond_amount',
  'bond_bank_name',
  'bond_current_status',
  'bond_process_started',
  'bond_help_requested',
  'ooba_assist_requested',
  'joint_bond_application',
  'source_of_funds',
  'deposit_required',
  'deposit_amount',
  'deposit_source',
  'deposit_already_paid',
  'deposit_holder',
  'reservation_required',
  'reservation_amount',
  'reservation_status',
  'reservation_paid_date',
])

const MY_DETAILS_COMPANY_FIELDS = new Set([
  'company_name',
  'company_registration_number',
  'vat_number',
  'authorised_signatory_name',
  'authorised_signatory_identity_number',
  'authorised_signatory_email',
  'authorised_signatory_phone',
])

const MY_DETAILS_TRUST_FIELDS = new Set([
  'trust_name',
  'trust_registration_number',
  'authorised_trustee_name',
  'authorised_trustee_identity_number',
  'authorised_trustee_email',
  'authorised_trustee_phone',
  'trust_resolution_available',
])

const MY_DETAILS_SECTIONS = [
  {
    key: 'buyer_structure',
    title: 'Buyer Structure',
    description: 'How this purchase is structured and captured for your transaction.',
    fields: [
      { key: 'purchaser_type', label: 'Purchase Type', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.purchaseType, required: true },
      { key: 'purchaser_entity_type', label: 'Buyer Entity Type', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.entityType, required: true },
      { key: 'natural_person_purchase_mode', label: 'Natural Person Purchase Mode', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.naturalMode, required: false },
      { key: 'first_time_buyer', label: 'First-time Buyer', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.yesNo, required: false },
      { key: 'primary_residence', label: 'Primary Residence', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.yesNo, required: false },
      { key: 'investment_purchase', label: 'Investment Purchase', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.yesNo, required: false },
    ],
  },
  {
    key: 'personal_details',
    title: 'Personal Details',
    description: 'Identity and legal profile details used for buyer and compliance records.',
    fields: [
      { key: 'first_name', label: 'First Name', type: 'text', required: true },
      { key: 'last_name', label: 'Surname', type: 'text', required: true },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: true },
      { key: 'identity_number', label: 'ID Number', type: 'text', required: false },
      { key: 'passport_number', label: 'Passport Number', type: 'text', required: false },
      { key: 'nationality', label: 'Nationality', type: 'text', required: false },
      { key: 'marital_status', label: 'Marital Status', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.maritalStatus, required: false },
      { key: 'marital_regime', label: 'Marital Regime', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.maritalRegime, required: false },
    ],
  },
  {
    key: 'contact_details',
    title: 'Contact Details',
    description: 'How your team can reach you and where formal records are linked.',
    fields: [
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Phone Number', type: 'tel', required: true },
      { key: 'street_address', label: 'Street Address', type: 'text', required: false },
      { key: 'suburb', label: 'Suburb', type: 'text', required: false },
      { key: 'city', label: 'City', type: 'text', required: false },
      { key: 'postal_code', label: 'Postal Code', type: 'text', required: false },
    ],
  },
  {
    key: 'purchase_details',
    title: 'Purchase Details',
    description: 'Core transaction details and payment setup captured during onboarding.',
    fields: [
      { key: 'purchase_price', label: 'Purchase Price', type: 'number', required: true, currency: true },
      { key: 'deposit_required', label: 'Deposit Required', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.yesNo, required: false },
      { key: 'deposit_amount', label: 'Deposit Amount', type: 'number', required: false, currency: true },
      { key: 'deposit_source', label: 'Deposit Source', type: 'text', required: false },
      { key: 'deposit_already_paid', label: 'Deposit Already Paid', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.yesNo, required: false },
      { key: 'reservation_amount', label: 'Reservation Amount', type: 'number', required: false, currency: true },
    ],
  },
  {
    key: 'finance_summary',
    title: 'Finance Summary',
    description: 'Funding profile used by bond and legal teams for this transaction.',
    fields: [
      { key: 'purchase_finance_type', label: 'Finance Type', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.financeType, required: true },
      { key: 'cash_amount', label: 'Cash Amount', type: 'number', required: false, currency: true },
      { key: 'bond_amount', label: 'Bond Amount', type: 'number', required: false, currency: true },
      { key: 'bond_bank_name', label: 'Bond Bank Name', type: 'text', required: false },
      { key: 'bond_current_status', label: 'Bond Status', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.bondStatus, required: false },
      { key: 'source_of_funds', label: 'Source of Funds', type: 'text', required: false },
    ],
  },
  {
    key: 'legal_entity_details',
    title: 'Legal / Entity Details',
    description: 'Entity-specific details for trust or company purchase structures.',
    fields: [
      { key: 'company_name', label: 'Company Name', type: 'text', required: false },
      { key: 'company_registration_number', label: 'Company Registration Number', type: 'text', required: false },
      { key: 'authorised_signatory_name', label: 'Authorised Signatory Name', type: 'text', required: false },
      { key: 'trust_name', label: 'Trust Name', type: 'text', required: false },
      { key: 'trust_registration_number', label: 'Trust Registration Number', type: 'text', required: false },
      { key: 'authorised_trustee_name', label: 'Authorised Trustee Name', type: 'text', required: false },
    ],
  },
]

const CLIENT_DOCUMENT_TABS = [
  { key: 'sales', label: 'Sales Documents' },
  { key: 'fica', label: 'FICA Documents' },
  { key: 'bond', label: 'Bond' },
  { key: 'additional', label: 'Additional Requests' },
  { key: 'property', label: 'Property Documents' },
]

const FICA_REQUIREMENT_CONFIG = {
  base: [
    { key: 'buyer_identity_document', label: 'Identity document', description: 'Valid ID or passport copy.', required: true },
    { key: 'buyer_proof_of_address', label: 'Proof of address', description: 'Recent proof of residential address.', required: true },
  ],
  byPurchaserType: {
    individual: [],
    company: [
      { key: 'company_registration_documents', label: 'Company registration documents', description: 'CIPC registration documents for the purchasing company.', required: true },
      { key: 'director_identity_documents', label: 'Director identity documents', description: 'ID copies for authorised directors/signatories.', required: true },
      { key: 'company_authority_resolution', label: 'Company authority resolution', description: 'Signed authority resolution permitting the transaction.', required: true },
    ],
    trust: [
      { key: 'trust_deed', label: 'Trust deed', description: 'Signed trust deed and supporting registration details.', required: true },
      { key: 'letters_of_authority', label: 'Letters of authority', description: 'Master-issued letters of authority for the trust.', required: true },
      { key: 'trustee_identity_documents', label: 'Trustee identity documents', description: 'ID copies for authorised trustees.', required: true },
      { key: 'trust_resolution', label: 'Trust resolution', description: 'Signed trustee resolution authorising the purchase.', required: true },
    ],
  },
  byMaritalRegime: {
    cop: [
      { key: 'spouse_identity_document', label: 'Spouse identity document', description: 'ID copy for spouse in community of property.', required: true },
      { key: 'marriage_certificate', label: 'Marriage certificate', description: 'Marriage certificate for compliance records.', required: true },
    ],
    anc: [
      { key: 'marriage_certificate', label: 'Marriage certificate', description: 'Marriage certificate for legal verification.', required: true },
      { key: 'anc_contract', label: 'ANC contract', description: 'Ante-nuptial contract where applicable.', required: false },
    ],
    married: [
      { key: 'marriage_certificate', label: 'Marriage certificate', description: 'Marriage certificate for legal verification.', required: true },
    ],
  },
  byTransactionType: {
    private_property: [
      { key: 'seller_legal_pack_confirmation', label: 'Private property legal pack confirmation', description: 'Additional legal confirmation may be required for private property transactions.', required: false },
    ],
    developer_sale: [],
  },
}

function getClientPortalPath(token, sectionKey) {
  if (sectionKey === 'overview') return `/client/${token}`
  if (sectionKey === 'bond_application') return `/client/${token}/bond-application`
  return `/client/${token}/${sectionKey}`
}

function getPortalWorkspaceBasePath(token, workspace = 'buyer') {
  if (workspace === 'seller') {
    return `/client/${token}/selling`
  }
  if (workspace === 'buyer_explicit') {
    return `/client/${token}/buying`
  }
  return `/client/${token}`
}

function getPortalWorkspacePath(token, workspace = 'buyer', sectionKey = 'overview') {
  const basePath = getPortalWorkspaceBasePath(token, workspace)
  if (!sectionKey || sectionKey === 'overview') return basePath
  if (workspace === 'seller') return `${basePath}/${sectionKey}`
  if (sectionKey === 'bond_application') return `${basePath}/bond-application`
  return `${basePath}/${sectionKey}`
}

function getPortalNavigationPath(token, workspace = 'buyer', item = {}) {
  const sectionKey = item.section || item.to || item.key || 'overview'
  return `${getPortalWorkspacePath(token, workspace, sectionKey)}${item.hash || ''}`
}

function isPortalNavigationItemActive(item = {}, activeSection = 'overview', activeHash = '') {
  const sectionKey = item.section || item.to || item.key || 'overview'
  if (item.hash) {
    return activeSection === sectionKey && activeHash === item.hash
  }
  return activeSection === item.key && !activeHash
}

function getPortalWorkspaceFromPath(pathname = '') {
  const normalizedPath = String(pathname || '')
  if (/^\/seller(\/|$)/.test(normalizedPath) || /\/selling(\/|$)/.test(normalizedPath)) {
    return 'seller'
  }
  if (/\/buying(\/|$)/.test(normalizedPath)) {
    return 'buyer'
  }
  return ''
}

function normalizePortalContextType(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'selling' || normalized === 'seller') return 'selling'
  return 'buying'
}

function normalizeSellerPortalKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
}

function normalizeSellerVisibleListingLinks(items = []) {
  const normalizedLinks = (Array.isArray(items) ? items : [])
    .filter((item) => {
      const status = normalizeSellerPortalKey(item?.status || '')
      const visible = item?.visibleToSeller ?? item?.visible_to_seller
      return Boolean(item?.url || item?.listingUrl) && (visible === true || status === 'live' || status === 'published')
    })
    .map((item, index) => ({
      id: String(item.id || item.key || `${item.platform || 'listing'}-${index}`),
      platform: String(item.platform || item.platformName || 'Listing platform').trim(),
      url: String(item.url || item.listingUrl || '').trim(),
      status: String(item.status || 'Live').trim(),
      publishedAt: item.publishedAt || item.published_at || '',
    }))

  const linksByChannel = new Map()
  for (const link of normalizedLinks) {
    const platformKey = normalizeSellerPortalKey(link.platform)
    const urlKey = String(link.url || '').trim().toLowerCase().replace(/\/+$/, '')
    const channelKey = platformKey || urlKey
    if (!channelKey || linksByChannel.has(channelKey)) continue
    linksByChannel.set(channelKey, link)
  }
  return [...linksByChannel.values()]
}

function getFriendlySellerStatusLabel(value = '', fallback = 'Awaiting update') {
  const normalized = normalizeSellerPortalKey(value)
  if (!normalized) return fallback
  if (normalized === 'fully_signed') return 'Signed'
  if (normalized === 'ready_for_client_signature') return 'Ready for signature'
  if (normalized === 'generated_not_ready') return 'Preparing'
  if (normalized === 'not_started') return 'Not started'
  return toTitleLabel(normalized)
}

function pickFirstText(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (normalized) return normalized
  }
  return ''
}

const SELLER_BRAND_PLACEHOLDERS = new Set([
  'selling',
  'seller',
  'seller portal',
  'property sale',
])

function pickSellerBrandText(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (!normalized || SELLER_BRAND_PLACEHOLDERS.has(normalized.toLowerCase())) continue
    return normalized
  }
  return ''
}

function formatSellerMoney(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Amount to be confirmed'
  return ZAR_CURRENCY.format(amount)
}

function normalizeSellerOfferForDisplay(offer = {}, index = 0) {
  const nestedOffer = offer?.offer && typeof offer.offer === 'object' ? offer.offer : {}
  const buyer = offer?.buyer && typeof offer.buyer === 'object' ? offer.buyer : {}
  const status = normalizeSellerPortalKey(offer?.status || offer?.workflowStatus || offer?.workflow_status || 'submitted')
  const amount = offer?.offerAmount ?? offer?.offerPrice ?? offer?.amount ?? nestedOffer?.offerAmount
  const receivedAt = offer?.submittedAt || offer?.offerDate || offer?.createdAt || offer?.created_at || ''
  const expiryDate = nestedOffer?.expiryDate || offer?.expiryDate || offer?.expiresAt || ''
  const buyerName = pickFirstText(offer?.buyerName, buyer?.fullName, buyer?.name, 'Buyer')
  const labelStatus = status === 'seller_review' || status === 'sent_to_seller'
    ? 'Seller review'
    : status === 'agent_review'
      ? 'Agent review'
      : status === 'converted_to_transaction'
        ? 'Converted to transaction'
        : getFriendlySellerStatusLabel(status, 'Submitted')
  const actionNeeded =
    ['seller_review', 'submitted', 'countered'].includes(status)
      ? 'Review required'
      : status === 'accepted'
        ? 'Accepted'
        : status === 'rejected'
          ? 'No action needed'
          : 'Waiting for agent update'

  return {
    id: offer?.id || `seller_offer_${index}`,
    buyerName,
    amountLabel: formatSellerMoney(amount),
    status,
    statusLabel: labelStatus,
    receivedAt,
    expiryDate,
    actionNeeded,
  }
}

const ZAR_CURRENCY = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function cloneMyDetailsFormData(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value || {})
  }

  try {
    return JSON.parse(JSON.stringify(value || {}))
  } catch {
    return { ...(value || {}) }
  }
}

function getNestedPortalValue(source, path = []) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== 'object') return undefined
    return current[key]
  }, source)
}

function setNestedPortalValue(source, path = [], value) {
  if (!path.length) return source
  const [head, ...tail] = path
  const current = source && typeof source === 'object' ? source : {}
  const nextNode = current[head]

  return {
    ...current,
    [head]: tail.length ? setNestedPortalValue(nextNode, tail, value) : value,
  }
}

function isMyDetailsValueFilled(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function resolveMyDetailsFieldValue(formData = {}, fieldKey) {
  const topLevelValue = formData?.[fieldKey]
  if (isMyDetailsValueFilled(topLevelValue)) {
    return topLevelValue
  }

  if (MY_DETAILS_PURCHASER_FIELDS.has(fieldKey)) {
    const nestedValue = getNestedPortalValue(formData, ['purchaser', fieldKey])
    if (isMyDetailsValueFilled(nestedValue)) return nestedValue
  }

  if (MY_DETAILS_FINANCE_FIELDS.has(fieldKey)) {
    const nestedValue = getNestedPortalValue(formData, ['finance', fieldKey])
    if (isMyDetailsValueFilled(nestedValue)) return nestedValue
  }

  if (MY_DETAILS_COMPANY_FIELDS.has(fieldKey)) {
    const nestedValue = getNestedPortalValue(formData, ['company', fieldKey])
    if (isMyDetailsValueFilled(nestedValue)) return nestedValue
  }

  if (MY_DETAILS_TRUST_FIELDS.has(fieldKey)) {
    const nestedValue = getNestedPortalValue(formData, ['trust', fieldKey])
    if (isMyDetailsValueFilled(nestedValue)) return nestedValue
  }

  return topLevelValue ?? ''
}

function updateMyDetailsDraftField(formData = {}, fieldKey, nextValue) {
  let nextDraft = {
    ...(formData || {}),
    [fieldKey]: nextValue,
  }

  if (MY_DETAILS_PURCHASER_FIELDS.has(fieldKey)) {
    nextDraft = setNestedPortalValue(nextDraft, ['purchaser', fieldKey], nextValue)
  }

  if (MY_DETAILS_FINANCE_FIELDS.has(fieldKey)) {
    nextDraft = setNestedPortalValue(nextDraft, ['finance', fieldKey], nextValue)
  }

  if (MY_DETAILS_COMPANY_FIELDS.has(fieldKey)) {
    nextDraft = setNestedPortalValue(nextDraft, ['company', fieldKey], nextValue)
  }

  if (MY_DETAILS_TRUST_FIELDS.has(fieldKey)) {
    nextDraft = setNestedPortalValue(nextDraft, ['trust', fieldKey], nextValue)
  }

  return nextDraft
}

function formatMyDetailsFieldDisplayValue(field, value) {
  if (!isMyDetailsValueFilled(value)) return '—'

  if (field?.type === 'date') {
    return formatShortPortalDate(value, '—')
  }

  if (field?.currency) {
    const numericValue = Number(value)
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return ZAR_CURRENCY.format(numericValue)
    }
  }

  if (field?.type === 'select' && Array.isArray(field.options)) {
    const option = field.options.find((item) => String(item.value) === String(value))
    if (option?.label) return option.label
  }

  return formatOnboardingFieldValue(value)
}

function getRequestedByLabel(role) {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'attorney') return 'Conveyancer'
  if (normalized === 'bond_originator') return 'Bond Originator'
  if (normalized === 'developer') return 'Developer Team'
  if (normalized === 'agent') return 'Agent'
  if (!normalized) return 'Team'
  return toTitleLabel(normalized)
}

function getPortalDocumentWorkspaceCategory(document = {}) {
  const explicitCategory = normalizePortalWorkspaceCategory(
    document?.portalWorkspaceCategory || document?.portal_workspace_category,
  )
  if (explicitCategory) {
    return explicitCategory
  }

  const metadataCategory = resolvePortalDocumentMetadata(document).portalWorkspaceCategory
  if (metadataCategory && metadataCategory !== 'additional') {
    return metadataCategory
  }

  if (isPropertyDocument(document)) {
    return 'property'
  }
  if (isBondDocument(document)) {
    return 'bond'
  }
  if (isSalesDocument(document)) {
    return 'sales'
  }
  if (isFicaDocument(document)) {
    return 'fica'
  }

  return metadataCategory || 'additional'
}

function resolveClientMaritalRegime(formData = {}) {
  const maritalStatus = normalizePortalStatus(formData?.marital_status || formData?.purchaser?.marital_status)
  const maritalRegime = normalizePortalStatus(formData?.marital_regime || formData?.purchaser?.marital_regime)

  if (maritalRegime.includes('cop') || maritalRegime.includes('community')) return 'cop'
  if (maritalRegime.includes('anc') || maritalRegime.includes('ante')) return 'anc'
  if (maritalStatus === 'married') return 'married'
  return 'single'
}

function resolvePurchaserTypeForDocuments(portal) {
  const formData = portal?.onboardingFormData?.formData || {}
  return normalizePortalStatus(
    formData?.purchaser_entity_type ||
      formData?.purchaser_type ||
      portal?.purchaserType ||
      portal?.transaction?.purchaser_type ||
      'individual',
  )
}

function resolveTransactionTypeForDocuments(portal) {
  return normalizePortalStatus(portal?.transaction?.transaction_type || 'developer_sale')
}

function getFicaRequirementTemplate({ transactionType, purchaserType, maritalRegime }) {
  return [
    ...FICA_REQUIREMENT_CONFIG.base,
    ...(FICA_REQUIREMENT_CONFIG.byPurchaserType[purchaserType] || []),
    ...(FICA_REQUIREMENT_CONFIG.byMaritalRegime[maritalRegime] || []),
    ...(FICA_REQUIREMENT_CONFIG.byTransactionType[transactionType] || []),
  ]
}

function resolveFicaRequirementStatus(requirement, requirementDocs = [], uploadedDocsById = new Map()) {
  const keyNeedle = String(requirement.key || '').toLowerCase()
  const labelNeedle = String(requirement.label || '').toLowerCase()
  const matchedRequirementDoc = requirementDocs.find((doc) => {
    const keyHaystack = String(doc.key || '').toLowerCase()
    const labelHaystack = String(doc.label || '').toLowerCase()
    return keyHaystack.includes(keyNeedle) || keyNeedle.includes(keyHaystack) || labelHaystack.includes(labelNeedle)
  }) || null

  const uploadedDocument =
    matchedRequirementDoc?.uploadedDocumentId ? uploadedDocsById.get(String(matchedRequirementDoc.uploadedDocumentId)) : null

  const isUploaded = Boolean(
    matchedRequirementDoc?.complete || matchedRequirementDoc?.isUploaded || hasPersistedPortalDocument(uploadedDocument),
  )
  return {
    matchedRequirementDoc,
    uploadedDocument,
    statusLabel: requirement.required ? (isUploaded ? 'Uploaded' : 'Missing') : (isUploaded ? 'Uploaded' : 'Not Required'),
    isUploaded,
  }
}

function formatClientPortalDate(value, fallback = 'Not set') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString()
}

function normalizePortalStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function isTruthyPortalValue(value) {
  if (value === true) return true
  if (value === false) return false
  const normalized = normalizePortalStatus(value)
  return normalized === 'true' || normalized === 'yes' || normalized === '1'
}

function normalizePortalFinancialChoice(value, allowedValues, fallback) {
  const normalized = normalizePortalStatus(value)
  return allowedValues.includes(normalized) ? normalized : fallback
}

function normalizePortalReservationAmountType(value) {
  return normalizePortalFinancialChoice(value, ['fixed', 'percentage'], 'fixed')
}

function normalizePortalReservationTreatment(value) {
  return normalizePortalFinancialChoice(
    value,
    ['credited_to_purchase_price', 'separate_invoice', 'refundable_hold'],
    'credited_to_purchase_price',
  )
}

function normalizePortalReservationPayableTo(value) {
  return normalizePortalFinancialChoice(value, ['developer', 'agency_trust', 'attorney_trust'], 'developer')
}

function normalizePortalAlterationChargeTreatment(value) {
  return normalizePortalFinancialChoice(
    value,
    ['included_in_purchase_price', 'separate_invoice', 'no_charge'],
    'included_in_purchase_price',
  )
}

function getReservationAmountTypeLabel(value) {
  return normalizePortalReservationAmountType(value) === 'percentage' ? 'Percentage of purchase price' : 'Fixed amount'
}

function getReservationTreatmentLabel(value) {
  const normalized = normalizePortalReservationTreatment(value)
  if (normalized === 'separate_invoice') return 'Separate invoice'
  if (normalized === 'refundable_hold') return 'Refundable holding deposit'
  return 'Deducted from purchase price'
}

function getReservationTreatmentDescription(value) {
  const normalized = normalizePortalReservationTreatment(value)
  if (normalized === 'separate_invoice') return 'This reservation payment is handled separately from the purchase price.'
  if (normalized === 'refundable_hold') return 'This reservation payment is held and may be refunded according to the agreement terms.'
  return 'This reservation payment is credited towards the agreed purchase price.'
}

function getReservationPayableToLabel(value) {
  const normalized = normalizePortalReservationPayableTo(value)
  if (normalized === 'agency_trust') return 'Agency trust account'
  if (normalized === 'attorney_trust') return 'Attorney trust account'
  return 'Developer'
}

function getAlterationChargeTreatmentLabel(value) {
  const normalized = normalizePortalAlterationChargeTreatment(value)
  if (normalized === 'separate_invoice') return 'Invoiced separately'
  if (normalized === 'no_charge') return 'No charge by default'
  return 'Included in purchase price'
}

function getAlterationChargeTreatmentDescription(value) {
  const normalized = normalizePortalAlterationChargeTreatment(value)
  if (normalized === 'separate_invoice') return 'Approved alteration costs are expected to be billed separately.'
  if (normalized === 'no_charge') return 'The team has marked this as no charge unless they advise otherwise.'
  return 'Approved alteration costs are expected to form part of the purchase price.'
}

function getDaysInStageLabel(value) {
  if (!value) return 'In progress'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'In progress'
  const elapsedDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)))
  if (elapsedDays === 0) return 'Today'
  if (elapsedDays === 1) return '1 day'
  return `${elapsedDays} days`
}

function getDaysElapsed(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)))
}

function formatShortPortalDate(value, fallback = 'Recently') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatClientNotificationTime(value) {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleString()
}

const CLIENT_ONBOARDING_COMPLETED_STATUSES = new Set([
  'submitted',
  'reviewed',
  'approved',
  'complete',
  'completed',
  'client_onboarding_complete',
  'awaiting_signed_otp',
  'signed_otp_received',
])

function isClientOnboardingComplete(status) {
  return CLIENT_ONBOARDING_COMPLETED_STATUSES.has(normalizePortalStatus(status))
}

function resolveClientNextStepState({
  nextActions = [],
  nextStage,
}) {
  const list = Array.isArray(nextActions) ? nextActions : []
  const actionable = list.find(
    (action) => Boolean(action?.blocking) || ['urgent', 'high', 'normal'].includes(normalizePortalStatus(action?.priority)),
  )
  const informative = list.find((action) => !actionable || action?.id !== actionable.id)
  const primary = actionable || informative || null
  if (!primary) {
    return {
      type: 'no_action_required',
      label: 'Next Step',
      title: 'No action required from you right now',
      description: 'Your team is currently progressing the next steps in your transaction.',
      helperText: `Everything is on track. Next milestone: ${nextStage}.`,
      ctaLabel: 'View Progress',
      ctaTo: 'overview',
      tone: 'calm',
      requiresAction: false,
      clientActionCount: 0,
    }
  }

  const normalizedCategory = normalizePortalStatus(primary?.category)
  const normalizedType = normalizePortalStatus(primary?.type)
  const ctaTo = String(primary?.actionRoute || '').trim() || 'overview'
  const ctaLabel = String(primary?.actionLabel || '').trim() || 'Open'
  const requiresAction = Boolean(primary?.blocking) || ['urgent', 'high', 'normal'].includes(normalizePortalStatus(primary?.priority))
  const helperText =
    normalizedCategory === 'documents'
      ? 'Please upload the outstanding items listed in your Documents section.'
      : normalizedCategory === 'onboarding'
        ? 'Complete your onboarding information so the transaction can move forward.'
        : normalizedType.includes('awaiting')
          ? 'No immediate action is required unless your team contacts you.'
          : `Everything is on track. Next milestone: ${nextStage}.`

  const actionCount = list.filter((action) => Boolean(action?.blocking)).length

  return {
    type: primary?.type || 'informational',
    label: 'Next Step',
    title: primary?.title || 'Action required',
    description: primary?.description || 'Please review your latest transaction action.',
    helperText,
    ctaLabel,
    ctaTo,
    tone: requiresAction ? 'action' : 'in_progress',
    requiresAction,
    clientActionCount: requiresAction ? Math.max(1, actionCount) : 0,
  }
}

function resolveChecklistProgressState({ complete = false, inProgress = false }) {
  if (complete) return 'complete'
  if (inProgress) return 'in_progress'
  return 'not_started'
}

function getChecklistProgressMeta(status) {
  if (status === 'complete') {
    return {
      label: 'Complete',
      className: 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]',
    }
  }
  if (status === 'in_progress') {
    return {
      label: 'In progress',
      className: 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]',
    }
  }
  return {
    label: 'Not started',
    className: 'border-[#dde7f1] bg-white text-[#64748b]',
  }
}

function normalizeHumanUpdateSummary(value) {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!compact) {
    return 'Your team posted a progress update.'
  }

  const firstSentence = compact.match(/^[^.?!]+[.?!]?/)
  const trimmed = String(firstSentence?.[0] || compact).trim()
  return trimmed.length > 170 ? `${trimmed.slice(0, 167).trimEnd()}...` : trimmed
}

function buildClientFacingUpdate(item) {
  if (item?.title || item?.description) {
    const actorName = item?.actor || item?.authorName || 'Arch9'
    const actorRole = item?.actorRole || item?.authorRoleLabel || 'Transaction Team'
    const createdLabel = (item?.timestamp || item?.createdAt)
      ? new Date(item?.timestamp || item?.createdAt).toLocaleString()
      : 'Recently'
    const contextLabel = `Updated by ${actorName} • ${actorRole} • ${createdLabel}`
    return {
      title: String(item?.title || 'Update from your team'),
      summary: normalizeHumanUpdateSummary(item?.description || item?.message || ''),
      contextLabel,
      actionLabel: item?.metadata?.actionLabel || '',
      actionRoute: item?.metadata?.actionRoute || '',
      requiresAttention: Boolean(item?.requiresAttention),
    }
  }

  const rawBody = String(item?.commentBody || item?.commentText || '')
    .replace(/\s+/g, ' ')
    .trim()
  const actorName = item?.authorName || 'Arch9 Team'
  const actorRole = item?.authorRoleLabel || 'Arch9 Team'
  const createdLabel = item?.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently'
  const contextLabel = `Updated by ${actorName} • ${actorRole} • ${createdLabel}`

  const stagePair = rawBody.match(/transaction stage updated:\s*(.+?)\s*changed to\s*(.+?)(?: by | at |$)/i)
  if (stagePair) {
    return {
      title: `Your transaction moved to ${stagePair[2]}`,
      summary: `Your team has completed ${stagePair[1]} and moved your purchase into the next milestone.`,
      contextLabel,
    }
  }

  const financeChange = rawBody.match(/finance workflow updated:\s*(.+?)(?: by | at |$)/i)
  if (financeChange) {
    return {
      title: 'Finance progress updated',
      summary: normalizeHumanUpdateSummary(financeChange[1]),
      contextLabel,
    }
  }

  const attorneyChange = rawBody.match(/attorney workflow updated:\s*(.+?)(?: by | at |$)/i)
  if (attorneyChange) {
    return {
      title: 'Transfer progress updated',
      summary: normalizeHumanUpdateSummary(attorneyChange[1]),
      contextLabel,
    }
  }

  const bodyLower = rawBody.toLowerCase()

  if (bodyLower.includes('otp') && bodyLower.includes('ready') && bodyLower.includes('sign')) {
    return {
      title: 'Your OTP is ready for signing',
      summary: 'Your Offer to Purchase is prepared and ready for your signature.',
      contextLabel,
    }
  }

  if (bodyLower.includes('mandate') && bodyLower.includes('signed')) {
    return {
      title: 'Your mandate has been signed',
      summary: 'Your signed mandate is now on file and your listing workflow can progress.',
      contextLabel,
    }
  }

  if (bodyLower.includes('offer') && bodyLower.includes('received')) {
    return {
      title: 'An offer has been received',
      summary: 'Your team has logged a new offer and will guide you through next decisions.',
      contextLabel,
    }
  }

  if (bodyLower.includes('bond') && (bodyLower.includes('review') || bodyLower.includes('bank'))) {
    return {
      title: 'Your bond application is under review',
      summary: 'Your finance team is progressing lender-side checks and approvals.',
      contextLabel,
    }
  }

  if (String(item?.discussionType || '').toLowerCase() === 'system') {
    return {
      title: 'Arch9 update',
      summary: normalizeHumanUpdateSummary(rawBody),
      contextLabel,
    }
  }

  return {
    title: 'Update from your team',
    summary: normalizeHumanUpdateSummary(rawBody),
    contextLabel,
  }
}

function buildClientJourneyFeedItem(item, index = 0) {
  const authoredAt = item?.timestamp || item?.createdAt || item?.created_at || ''
  const timestampLabel = authoredAt ? new Date(authoredAt).toLocaleString() : 'Recently'
  const authorName = item?.actor || item?.authorName || item?.author_name || 'Arch9 Team'
  const normalizedRole = String(item?.actorRole || item?.authorRoleLabel || item?.authorRole || item?.author_role || '').toLowerCase()
  const authorRole = normalizedRole.includes('attorney') || normalizedRole.includes('conveyancer')
    ? 'Attorney'
    : normalizedRole.includes('bond')
      ? 'Bond Originator'
      : normalizedRole.includes('agent') || normalizedRole.includes('sales')
        ? 'Agent'
        : normalizedRole.includes('developer')
          ? 'Developer'
          : normalizedRole.includes('admin')
            ? 'Internal Admin'
            : 'Arch9 System'
  const formatted = buildClientFacingUpdate(item)

  return {
    id: item?.id || `update_${index}`,
    authorName,
    authorRole,
    title: item?.title || formatted?.title || '',
    message: formatted?.summary || 'Your team posted a progress update.',
    timestampLabel,
    actionLabel: formatted?.actionLabel || '',
    actionRoute: formatted?.actionRoute || '',
    requiresAttention: formatted?.requiresAttention || false,
    statusLabel: item?.statusLabel || item?.metadata?.statusLabel || '',
    displayType: item?.displayType || item?.metadata?.displayType || 'update',
    dueStatus: item?.dueStatus || item?.metadata?.dueStatus || '',
  }
}

function buildClientWhatsHappeningSummary({
  mainStage,
  nextStage,
  latestJourneyUpdates = [],
  nextStepState,
}) {
  const normalizedMainStage = String(mainStage || '').toUpperCase()

  const stageSummaryMap = {
    AVAIL: 'Your transaction is currently in the early sales preparation stage.',
    DEP: 'Your reservation and deposit phase is currently active.',
    OTP: 'Your transaction has moved into the offer-to-purchase stage.',
    FIN: 'Your file is currently moving through finance progression.',
    ATTY: 'Your file is now in legal transfer preparation.',
    XFER: 'Your transfer is actively progressing toward registration.',
    REG: 'Your transaction has reached registration and close-out progression.',
  }

  const teamFocusMap = {
    AVAIL: 'Your team is aligning the initial transaction setup so the process can move smoothly.',
    DEP: 'Your team is confirming reservation records and preparing the next deal milestones.',
    OTP: 'Your team is finalising signed deal records and preparing finance and legal handover.',
    FIN: 'The finance team is handling lender-side workflow and approvals.',
    ATTY: 'The legal team is preparing transfer documents and required legal milestones.',
    XFER: 'The attorney and transfer teams are coordinating final legal progression and registration readiness.',
    REG: 'Your team is finalising registration confirmations and close-out tasks.',
  }

  const latestSummary = latestJourneyUpdates[0]?.summary || null
  const fallbackSummary = nextStepState?.requiresAction
    ? `Once your current step is completed, your transaction can move to ${nextStage}.`
    : 'No immediate action is required from you right now. Your team is progressing the next steps.'

  return [
    stageSummaryMap[normalizedMainStage] || 'Your transaction is progressing through the current stage.',
    teamFocusMap[normalizedMainStage] || 'Your team is actively progressing this part of your transaction.',
    latestSummary ? `Latest update: ${latestSummary}` : fallbackSummary,
  ]
}

function buildClientWhatHappensNextCopy({
  journeyType,
  nextStepState,
  nextStageLabel,
  financeType,
}) {
  const normalizedType = String(journeyType || '').toLowerCase() === 'seller' ? 'seller' : 'buyer'
  const normalizedFinanceType = String(financeType || '').toLowerCase()

  if (nextStepState?.requiresAction) {
    if (nextStepState.ctaTo === 'documents') {
      return [
        'After your documents are uploaded, your team will review them for completeness.',
        'Any missing details will be requested quickly so your file does not stall.',
        `Once reviewed, your journey will move to ${nextStageLabel}.`,
      ]
    }
    if (nextStepState.ctaTo === 'details') {
      return [
        'After your details are completed, your team validates all required fields.',
        'Your legal and operations teams then continue document preparation.',
        `Your journey will then progress to ${nextStageLabel}.`,
      ]
    }
  }

  if (normalizedType === 'seller') {
    return [
      'Your agent is coordinating the next seller milestone with your transaction team.',
      'Any required signatures or confirmations will appear here with clear actions.',
      `Your sale journey is moving toward ${nextStageLabel}.`,
    ]
  }

  if (normalizedFinanceType === 'bond') {
    return [
      'Your bond process is being coordinated with lenders and finance teams.',
      'Your team will contact you if any additional bank documents are required.',
      `Once finance clears, your journey moves to ${nextStageLabel}.`,
    ]
  }

  if (normalizedFinanceType === 'hybrid') {
    return [
      'Your team is progressing both cash contribution and bond finance requirements.',
      'Any required confirmations will be surfaced here as clear next actions.',
      `After finance checks are complete, your journey moves to ${nextStageLabel}.`,
    ]
  }

  return [
    'Your transaction team is actively progressing your file behind the scenes.',
    'No action is needed unless we request it in your Next Step card.',
    `Your journey is currently moving toward ${nextStageLabel}.`,
  ]
}

function getSellerDashboardGreeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getSellerInitials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'A'
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
}

function getFirstImageUrl(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = getFirstImageUrl(item)
      if (url) return url
    }
    return ''
  }
  if (typeof value === 'object') {
    return pickFirstText(
      value.url,
      value.secureUrl,
      value.secure_url,
      value.imageUrl,
      value.image_url,
      value.src,
      value.path,
      value.publicUrl,
      value.public_url,
      value.thumbnailUrl,
      value.thumbnail_url,
    )
  }
  return ''
}

function resolveSellerPropertyImageUrl({ portal = {}, activeSellingContext = {}, formData = {} } = {}) {
  return pickFirstText(
    portal?.listing?.heroImageUrl,
    portal?.listing?.hero_image_url,
    portal?.listing?.heroImage,
    portal?.listing?.imageUrl,
    portal?.listing?.image_url,
    portal?.listing?.propertyImage,
    portal?.listing?.property_image,
    portal?.listing?.marketing?.mediaUrl,
    portal?.listing?.marketing?.media_url,
    portal?.unit?.imageUrl,
    portal?.unit?.image_url,
    portal?.unit?.propertyImage,
    portal?.unit?.property_image,
    activeSellingContext?.heroImageUrl,
    activeSellingContext?.hero_image_url,
    activeSellingContext?.imageUrl,
    activeSellingContext?.image_url,
    activeSellingContext?.propertyImage,
    activeSellingContext?.property_image,
    formData?.heroImageUrl,
    formData?.hero_image_url,
    formData?.imageUrl,
    formData?.image_url,
    getFirstImageUrl(portal?.listing?.images),
    getFirstImageUrl(portal?.listing?.photos),
    getFirstImageUrl(portal?.listing?.galleryImages),
    getFirstImageUrl(portal?.listing?.gallery_images),
    getFirstImageUrl(portal?.listing?.marketing?.imageGallery),
    getFirstImageUrl(portal?.listing?.marketing?.galleryImages),
    getFirstImageUrl(activeSellingContext?.images),
    getFirstImageUrl(activeSellingContext?.photos),
    getFirstImageUrl(formData?.images),
    getFirstImageUrl(formData?.photos),
  )
}

function resolveSellerAgentAvatarUrl({ portal = {}, activeSellingContext = {} } = {}) {
  return pickFirstText(
    portal?.transaction?.assigned_agent_avatar_url,
    portal?.transaction?.assignedAgentAvatarUrl,
    portal?.transaction?.assigned_agent_photo_url,
    portal?.transaction?.assignedAgentPhotoUrl,
    portal?.agent?.avatarUrl,
    portal?.agent?.avatar_url,
    portal?.agent?.photoUrl,
    portal?.agent?.photo_url,
    activeSellingContext?.assignedAgentAvatarUrl,
    activeSellingContext?.assigned_agent_avatar_url,
    activeSellingContext?.assignedAgentPhotoUrl,
    activeSellingContext?.assigned_agent_photo_url,
  )
}

function resolveSellerStatusLabel({
  sellerStageMeta = {},
  hasListingCreated = false,
  sellerOfferItems = [],
  mainStage = '',
} = {}) {
  const stageKey = sellerStageMeta?.currentStageKey || sellerStageMeta?.currentStage?.key || ''
  const normalizedMainStage = String(mainStage || '').toUpperCase()
  if (['REGISTERED', 'REG'].includes(normalizedMainStage) || stageKey === 'registered') return 'Registered'
  if (['transfer'].includes(stageKey) || normalizedMainStage === 'XFER') return 'Transfer Underway'
  if (['offer_accepted'].includes(stageKey) || normalizedMainStage === 'FIN') return 'Offer Accepted'
  if (sellerOfferItems.length > 0 || stageKey === 'offers') return 'Offers Received'
  if (hasListingCreated || ['listed', 'listing_live'].includes(stageKey)) return 'Listing Live'
  if (stageKey === 'mandate_signed') return 'Mandate Signed'
  if (stageKey === 'mandate_sent') return 'Mandate Sent'
  return 'Sale In Progress'
}

function buildSellerTransactionHealth({
  hasOnboardingSubmitted = false,
  hasMandatePacket = false,
  hasMandateSigned = false,
  hasListingCreated = false,
  hasDocumentsComplete = false,
  documentsNeedingAttention = [],
  sellerPrimaryNextAction = null,
} = {}) {
  const signals = [
    { key: 'onboarding', complete: hasOnboardingSubmitted },
    { key: 'mandate_sent', complete: hasMandatePacket },
    { key: 'mandate_signed', complete: hasMandateSigned },
    { key: 'listing', complete: hasListingCreated },
    { key: 'documents', complete: hasDocumentsComplete },
  ]
  const completed = signals.filter((signal) => signal.complete).length
  const hasAnySignal = completed > 0 || documentsNeedingAttention.length > 0 || sellerPrimaryNextAction
  const blockerCount = documentsNeedingAttention.length + (sellerPrimaryNextAction?.blocking ? 1 : 0)

  if (!hasAnySignal) {
    return {
      score: null,
      label: 'On Track',
      summary: 'Your transaction team is setting up the next steps.',
      detail: 'No immediate action is required from you right now.',
      tone: 'neutral',
    }
  }

  const rawScore = Math.round((completed / signals.length) * 100)
  const score = Math.max(0, Math.min(100, rawScore - (blockerCount * 8)))
  const label = score >= 90
    ? 'Excellent'
    : score >= 72
      ? 'On Track'
      : blockerCount
        ? 'Needs Attention'
        : 'Progressing'

  const detail = blockerCount
    ? `${blockerCount} item${blockerCount === 1 ? '' : 's'} need attention to keep your sale moving.`
    : hasDocumentsComplete
      ? 'Everything required has been received. No action required from you.'
      : 'Your agent is progressing the next milestone.'

  return {
    score,
    label,
    summary: blockerCount ? 'A few items still need attention.' : 'Your property sale is progressing smoothly.',
    detail,
    tone: blockerCount ? 'action' : 'success',
  }
}

function buildSellerMarketingChannels(links = [], agencyLogoUrl = '') {
  const channels = new Map()
  for (const [index, link] of links.entries()) {
    const label = link.platform || 'Listing channel'
    const key = normalizeSellerPortalKey(label) || String(link.url || '').trim().toLowerCase() || `listing-${index}`
    if (channels.has(key)) continue
    const logoUrl = key.includes('property24')
      ? '/lead-sources/property24.png'
      : key.includes('private_property')
        ? '/lead-sources/private-property.jpeg'
        : key.includes('agency') || key.includes('website')
          ? agencyLogoUrl
          : ''
    channels.set(key, {
      id: link.id || key,
      label,
      status: link.status || 'Live',
      href: link.url || '',
      logoUrl,
      updatedLabel: formatShortPortalDate(link.publishedAt || link.updatedAt || link.createdAt, ''),
    })
  }
  return [...channels.values()]
}

function buildSellerAgentUpdate({ items = [], sellerAgentName = '', sellerAgencyName = '', sellerAgentAvatarUrl = '' } = {}) {
  const update = items.find((item) => String(item?.message || '').trim())
  if (!update) return null
  return {
    message: update.message,
    timestampLabel: update.timestampLabel || 'Recently',
    agentName: sellerAgentName || sellerAgencyName || 'Your agent',
    avatarUrl: sellerAgentAvatarUrl,
  }
}

function buildSellerJourneyTimelineItems(items = []) {
  return items
    .filter((item) => String(item?.message || '').trim())
    .slice(0, 5)
    .map((item, index) => ({
      id: item.id || `seller_timeline_${index}`,
      title: item.message,
      dateLabel: item.timestampLabel || 'Recently',
    }))
}

function buildSellerNextMilestoneModel({
  sellerNextStep = {},
  sellerProgressModel = {},
  sellerDocumentsNeedingAttention = [],
  sellerVisibleListingLinks = [],
  sellerOfferItems = [],
} = {}) {
  if (sellerNextStep?.tone === 'action') {
    return {
      title: sellerNextStep.title || 'Next action',
      statusLabel: sellerNextStep.label || 'Action needed',
      doing: ['Reviewing your sale file', 'Preparing the next milestone once this item is complete'],
      sellerActions: [sellerNextStep.description || 'Please complete the requested item.'],
      action: {
        label: sellerNextStep.label || 'Open next step',
        to: sellerNextStep.to,
        href: sellerNextStep.href,
      },
    }
  }

  const currentKey = sellerProgressModel?.currentKey || ''
  if (sellerDocumentsNeedingAttention.length) {
    return {
      title: 'Documents review',
      statusLabel: 'Action may be needed',
      doing: ['Checking your uploaded seller documents', 'Confirming your file is ready for the next milestone'],
      sellerActions: [`${sellerDocumentsNeedingAttention.length} document${sellerDocumentsNeedingAttention.length === 1 ? '' : 's'} still need attention.`],
      action: { label: 'Open documents', to: 'documents' },
    }
  }

  if (currentKey === 'registration') {
    return {
      title: 'Registration',
      statusLabel: 'Final stage',
      doing: ['Confirming registration and close-out records', 'Preparing final transaction updates'],
      sellerActions: ['Nothing for now. We will let you know if anything requires your attention.'],
      action: null,
    }
  }

  if (currentKey === 'transfer') {
    return {
      title: 'Transfer',
      statusLabel: 'In progress',
      doing: ['Coordinating attorney-side transfer milestones', 'Tracking remaining sale conditions'],
      sellerActions: ['Nothing for now. Any signature requests will appear in your documents.'],
      action: { label: 'View documents', to: 'documents' },
    }
  }

  if (currentKey === 'finance' || sellerOfferItems.length > 0) {
    return {
      title: 'Offer and finance follow-up',
      statusLabel: 'Agent coordinating',
      doing: ['Following up on accepted-offer requirements', 'Keeping finance and transfer handover aligned'],
      sellerActions: ['Nothing for now unless your agent requests a document or signature.'],
      action: { label: 'View offers', to: 'offers' },
    }
  }

  if (sellerVisibleListingLinks.length) {
    return {
      title: 'Marketing your property',
      statusLabel: 'Listing live',
      doing: ['Promoting your property on the shared listing channels', 'Monitoring buyer activity', 'Scheduling qualified viewings'],
      sellerActions: ['Nothing for now. We will notify you if anything requires your attention.'],
      action: { label: 'View listing', href: sellerVisibleListingLinks[0]?.url },
    }
  }

  return {
    title: sellerNextStep?.title || 'Next milestone',
    statusLabel: 'No action needed',
    doing: ['Preparing the next seller milestone', 'Keeping your sale records aligned'],
    sellerActions: ['Nothing for now. Your agent will update you when the next step is ready.'],
    action: sellerNextStep?.to ? { label: sellerNextStep.label || 'Open next step', to: sellerNextStep.to } : null,
  }
}

function getSellerDocumentTitle(document = {}) {
  return pickFirstText(
    document.title,
    document.label,
    document.name,
    document.documentName,
    document.document_name,
    document.documentTypeLabel,
    document.document_type_label,
    document.documentType,
    document.document_type,
    document.requiredDocumentLabel,
    document.required_document_label,
    document.key,
    'Document',
  )
}

function buildSellerImportantDocuments({ uploadedDocuments = [], requiredDocuments = [] } = {}) {
  const relevantPattern = /(mandate|otp|offer|disclosure|id|identity|proof|address|rates|title|deed|transfer|bond|finance)/i
  const merged = new Map()

  const addDocument = (document, source) => {
    const title = getSellerDocumentTitle(document)
    const key = normalizeSellerPortalKey(document?.key || document?.documentKey || document?.document_key || document?.documentType || document?.document_type || title)
    if (!key) return
    const existing = merged.get(key) || {}
    merged.set(key, {
      ...existing,
      ...document,
      key,
      title,
      source,
      statusLabel: getFriendlySellerStatusLabel(normalizePortalStatus(document?.status || document?.requiredDocumentStatus || document?.required_document_status), source === 'required' ? 'Requested' : 'Submitted'),
      dateLabel: formatShortPortalDate(
        document?.signedAt ||
          document?.signed_at ||
          document?.submittedAt ||
          document?.submitted_at ||
          document?.uploadedAt ||
          document?.uploaded_at ||
          document?.createdAt ||
          document?.created_at,
        '',
      ),
    })
  }

  requiredDocuments.forEach((document) => addDocument(document, 'required'))
  uploadedDocuments.forEach((document) => addDocument(document, 'uploaded'))

  const documents = Array.from(merged.values())
  const scored = documents.map((document) => ({
    ...document,
    score: relevantPattern.test(document.title || document.key || '') ? 2 : document.source === 'uploaded' ? 1 : 0,
  }))

  return scored
    .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title)))
    .slice(0, 4)
}

function SellerPortalAction({ action, token, workspaceNavigationScope, className = '', children }) {
  const content = children || (
    <>
      <span>{action.label}</span>
      <ChevronRight size={15} />
    </>
  )

  if (action.disabled) {
    return (
      <button
        type="button"
        disabled
        title="Coming soon"
        className={`${className} cursor-not-allowed opacity-55`}
      >
        {content}
      </button>
    )
  }

  if (action.href) {
    return (
      <a href={action.href} className={className}>
        {content}
      </a>
    )
  }

  return (
    <Link
      to={getPortalNavigationPath(token, workspaceNavigationScope, {
        key: action.to || 'overview',
        section: action.section,
        hash: action.hash,
      })}
      className={className}
    >
      {content}
    </Link>
  )
}

function SellerWelcomeHero({
  sellerFirstName,
  sellerAgentName,
  sellerAgentPhone,
  sellerAgentEmail,
  sellerAgencyName,
  sellerPropertyTitle,
  token,
  workspaceNavigationScope,
}) {
  const messageAction = sellerAgentEmail
    ? { label: 'Message agent', href: `mailto:${sellerAgentEmail}` }
    : { label: 'Message agent', disabled: true }
  const callAction = sellerAgentPhone
    ? { label: 'Call agent', href: `tel:${sellerAgentPhone}` }
    : { label: 'Call agent', disabled: true }
  const heroPrimaryButtonClass = 'inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[14px] bg-[#183b63] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#112d4b]'
  const heroSecondaryButtonClass = 'inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[14px] border border-[#d6e1ec] bg-white px-4 py-2.5 text-sm font-semibold text-[#20384f] transition hover:border-[#bfd0e1] hover:bg-[#f8fbff]'
  const sellerAddressLines = splitSellerPortalAddress(sellerPropertyTitle)
  const agentLabel = sellerAgentName && sellerAgentName !== sellerAgencyName
    ? `${sellerAgencyName || 'Your agent'} · ${sellerAgentName}`
    : sellerAgencyName || sellerAgentName || 'Your property team'

  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fcfdff_100%)] px-6 py-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)] md:px-8 md:py-8">
      <div className="min-w-0">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.05em] text-[#142132] sm:text-[2.35rem]">
          Welcome, {sellerFirstName}
        </h1>
        <p className="mt-2 max-w-3xl text-[1rem] font-medium leading-7 text-[#35546c]">
          Track your property sale from mandate to registration.
        </p>
        <div className="mt-5 space-y-1.5 text-sm leading-6 text-[#51657b]">
          {sellerAddressLines.line1 ? (
            <p>
              <span className="font-semibold text-[#142132]">Property:</span> {sellerAddressLines.line1}
              {sellerAddressLines.line2 ? <span className="text-[#64748b]">, {sellerAddressLines.line2}</span> : null}
            </p>
          ) : null}
          <p>
            <span className="font-semibold text-[#142132]">Agent:</span> {agentLabel}
          </p>
          {sellerAgentPhone ? (
            <p className="inline-flex items-center gap-2">
              <PhoneCall size={14} />
              {sellerAgentPhone}
            </p>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <SellerPortalAction
            action={messageAction}
            token={token}
            workspaceNavigationScope={workspaceNavigationScope}
            className={heroPrimaryButtonClass}
          >
            <MessageCircle size={15} />
            <span>Message agent</span>
          </SellerPortalAction>
          <SellerPortalAction
            action={callAction}
            token={token}
            workspaceNavigationScope={workspaceNavigationScope}
            className={heroSecondaryButtonClass}
          >
            <PhoneCall size={15} />
            <span>Call agent</span>
          </SellerPortalAction>
        </div>
      </div>
    </section>
  )
}

function SellerProgressJourney({ listingProgressModel, saleProgressModel, token, workspaceNavigationScope }) {
  const defaultWorkflowKey = saleProgressModel?.isStarted ? 'sale' : 'listing'
  const [activeWorkflowKey, setActiveWorkflowKey] = useState(defaultWorkflowKey)
  const progressModel = activeWorkflowKey === 'sale' ? saleProgressModel : listingProgressModel
  const stepCount = Math.max(progressModel?.steps?.length || 0, 1)
  const steps = Array.isArray(progressModel?.steps) ? progressModel.steps : []
  const currentIndex = Math.max(Number(progressModel?.currentIndex || 0), 0)
  const lineInset = '60px'
  const lineProgressRatio = progressModel?.isStarted === false ? 0 : currentIndex / Math.max(stepCount - 1, 1)
  const minRailWidth = Math.max(stepCount * 120, 720)
  const completionLabel = progressModel?.statusLabel || `${progressModel?.percent || 0}% complete`

  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.28rem] font-semibold tracking-[-0.03em] text-[#142132]">{progressModel?.title || 'Your Progress'}</h2>
          <p className="mt-1 text-sm leading-6 text-[#64748b]">{progressModel?.description || 'A simple view of where your property sale stands.'}</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-[#d8e7f7] bg-[#eef5ff] px-3.5 py-2 text-sm font-semibold text-[#0f65b7]">
          {completionLabel}
        </span>
      </div>

      <div className="mt-5 inline-flex rounded-[12px] border border-[#dce6ef] bg-[#f5f8fb] p-1" role="tablist" aria-label="Seller journey progress">
        {[
          { key: 'listing', label: 'Listing Progress', model: listingProgressModel },
          { key: 'sale', label: 'Sale Progress', model: saleProgressModel },
        ].map((workflow) => {
          const isActive = activeWorkflowKey === workflow.key
          return (
            <button
              key={workflow.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveWorkflowKey(workflow.key)}
              className={`rounded-[9px] px-3.5 py-2 text-sm font-semibold transition ${isActive ? 'bg-white text-[#123f3a] shadow-[0_3px_10px_rgba(15,23,42,0.1)]' : 'text-[#64748b] hover:text-[#274158]'}`}
            >
              {workflow.label}
              {workflow.key === 'sale' && workflow.model?.isStarted === false ? <span className="ml-2 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[#8a9aab]">Next</span> : null}
            </button>
          )
        })}
      </div>

      <div className="mt-7 overflow-x-auto pb-2">
        <div className="relative px-2 pb-1" style={{ minWidth: `${minRailWidth}px` }}>
          <div className="absolute top-5 h-[2px] rounded-full bg-[#dce6f1]" style={{ left: lineInset, right: lineInset }} />
          <div className="absolute top-5 h-[2px] rounded-full bg-[#16a34a]" style={{ left: lineInset, width: `calc((100% - (${lineInset} * 2)) * ${lineProgressRatio})` }} />
          <div className="grid justify-between gap-0" style={{ gridTemplateColumns: `repeat(${stepCount}, 120px)` }}>
            {steps.map((stage) => {
              const isComplete = stage.state === 'completed'
              const isCurrent = stage.state === 'current'
              return (
                <div key={stage.key} className="relative z-10 flex min-w-0 flex-col items-center text-center">
                  <span
                    className={[
                      'inline-flex h-10 w-10 items-center justify-center rounded-full border-4 text-sm transition',
                      isComplete
                        ? 'border-[#16a34a] bg-[#16a34a] text-white'
                        : isCurrent
                          ? 'border-[#d8ecff] bg-[#2563eb] text-white shadow-[0_0_0_6px_rgba(37,99,235,0.12)]'
                          : 'border-[#dce6f1] bg-[#eef3f8] text-[#9aacbd]',
                    ].join(' ')}
                  >
                    {isComplete ? <CheckCircle2 size={18} /> : <span className="h-3 w-3 rounded-full bg-current opacity-80" />}
                  </span>
                  <strong className="mt-3 max-w-[88px] text-[0.84rem] font-semibold leading-5 text-[#142132]">{stage.label}</strong>
                  <span className={`mt-1 min-h-[14px] text-[0.7rem] font-semibold ${isCurrent ? 'text-[#2563eb]' : 'text-transparent'}`}>
                    {isCurrent ? 'Current' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e5edf5] bg-[#f5f9fd] px-4 py-3">
        <p className="flex min-w-0 items-start gap-2 text-sm leading-6 text-[#4f647b]">
          <CheckCircle2 className="mt-0.5 shrink-0 text-[#16a34a]" size={16} />
          <span>{progressModel?.helperMessage || 'Your seller portal will keep you updated as the sale progresses.'}</span>
        </p>
        <Link
          to={getPortalWorkspacePath(token, workspaceNavigationScope, progressModel?.actionTo || 'documents')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f65b7] transition hover:text-[#084d8e]"
        >
          {progressModel?.actionLabel || 'View documents'}
          <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  )
}

function SellerMyDetailsReadonlyPage({ sections = [] }) {
  if (!sections.length) {
    return (
      <section className="space-y-5">
        <header className="rounded-[24px] border border-[#dbe5ef] bg-white px-6 py-6 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
          <h1 className="text-[1.5rem] font-semibold tracking-[-0.04em] text-[#142132]">My Details</h1>
          <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">The information you submitted during seller onboarding.</p>
        </header>
        <article className="rounded-[24px] border border-dashed border-[#d8e2ee] bg-white px-6 py-7 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
          <p className="text-base font-semibold text-[#142132]">No seller onboarding details have been submitted yet.</p>
          <p className="mt-2 text-sm leading-6 text-[#64748b]">Once your onboarding is submitted, your seller details will appear here.</p>
        </article>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <header className="rounded-[24px] border border-[#dbe5ef] bg-white px-6 py-6 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
        <h1 className="text-[1.5rem] font-semibold tracking-[-0.04em] text-[#142132]">My Details</h1>
        <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">The information you submitted during seller onboarding.</p>
      </header>

      {sections.map((section) => (
        <article key={section.key} className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div>
            <h2 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">{section.title}</h2>
            <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">{section.description}</p>
          </div>
          {section.items.length ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {section.items.map((item) => (
                <div key={`${section.key}-${item.label}`} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                  <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">{item.label}</span>
                  <p className="mt-1.5 text-sm font-semibold leading-6 text-[#142132]">{item.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          {section.listItems.length ? (
            <div className="mt-5 space-y-3">
              {section.listItems.map((item, index) => (
                <div key={`${section.key}-list-${index}`} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                  <p className="text-sm font-semibold text-[#142132]">{item.label}</p>
                  {item.value ? <p className="mt-1 text-sm leading-6 text-[#64748b]">{item.value}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  )
}

function SellerNextStepCard({ sellerNextStep, token, workspaceNavigationScope, sellerAgentEmail }) {
  const primaryAction = sellerNextStep?.tone === 'action'
    ? {
        label: sellerNextStep.label,
        to: sellerNextStep.to,
        href: sellerNextStep.href,
      }
    : null
  const statusPillClass = sellerNextStep?.tone === 'action'
    ? 'border-[#d8e7f7] bg-[#eef5ff] text-[#0f65b7]'
    : 'border-[#cfe9da] bg-[#eefbf4] text-[#157347]'
  const primaryClass = 'inline-flex min-h-[42px] items-center justify-center rounded-[14px] bg-[#183b63] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#112d4b]'

  return (
    <article className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">What happens next</h2>
          <p className="mt-1.5 text-sm leading-6 text-[#64748b]">Here&apos;s what to expect in the coming steps.</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${statusPillClass}`}>
          {sellerNextStep?.tone === 'action' ? sellerNextStep.label : 'No action needed'}
        </span>
      </div>

      {sellerNextStep?.tone === 'action' ? (
        <div className="mt-5 rounded-[20px] border border-[#d8e7f7] bg-[linear-gradient(135deg,#f7fbff_0%,#eef5ff_100%)] p-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-white text-[#0f65b7] shadow-[0_10px_24px_rgba(15,101,183,0.12)]">
            <CalendarClock size={20} />
          </span>
          <h3 className="mt-4 text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">{sellerNextStep.title}</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#52677f]">{sellerNextStep.description}</p>
          {primaryAction ? (
            <div className="mt-5">
              <SellerPortalAction action={primaryAction} token={token} workspaceNavigationScope={workspaceNavigationScope} className={primaryClass} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 rounded-[20px] border border-[#cfe9da] bg-[linear-gradient(135deg,#eefbf4_0%,#f8fffb_100%)] p-5">
          <p className="text-base font-semibold text-[#157347]">No action needed from you right now.</p>
          <p className="mt-2 text-sm leading-6 text-[#4d7a63]">
            We&apos;ll keep you updated as we move forward.
          </p>
          {sellerNextStep?.description ? (
            <p className="mt-3 text-sm leading-6 text-[#5d7468]">{sellerNextStep.description}</p>
          ) : null}
        </div>
      )}
      {sellerAgentEmail && sellerNextStep?.tone !== 'action' ? (
        <p className="mt-4 text-sm leading-6 text-[#64748b]">
          Questions? You can reach your agent at <a className="font-semibold text-[#0f65b7]" href={`mailto:${sellerAgentEmail}`}>{sellerAgentEmail}</a>.
        </p>
      ) : null}
    </article>
  )
}

function SellerSectionHeading({ title, subtitle }) {
  return (
    <div>
      <h2 className="text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">{title}</h2>
      {subtitle ? <p className="mt-1.5 text-sm leading-6 text-[#64748b]">{subtitle}</p> : null}
    </div>
  )
}

function SellerActivityPanel({ items = [] }) {
  return (
    <article className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SellerSectionHeading title="Recent Activity" subtitle="A quick look at the latest updates on your sale." />
        <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#4f647b]">
          {items.length ? `${items.length} updates` : 'No updates'}
        </span>
      </div>
      {items.length ? (
        <div className="mt-5 space-y-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#ecfdf5] text-[#16a34a]">
                  <CheckCircle2 size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 text-[#142132]">{item.message || 'Your seller workspace has been updated.'}</p>
                  <p className="mt-1 text-xs font-medium text-[#7b8ca2]">{item.timestampLabel || 'Recently'}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-5 text-sm leading-6 text-[#6b7d93]">
          No seller-facing updates yet. Your activity feed will appear here once your agent shares progress.
        </div>
      )}
    </article>
  )
}

function SellerListingDistribution({ links = [] }) {
  if (!links.length) return null

  return (
    <article className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Where Your Property Is Listed</h2>
          <p className="mt-1 text-sm leading-6 text-[#64748b]">Live listing links your agent has shared with you.</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#4f647b]">
          {links.length} live
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {links.map((link) => (
          <div key={link.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#142132]">{link.platform}</p>
              <p className="mt-1 text-xs font-medium text-[#7b8ca2]">Published {formatShortPortalDate(link.publishedAt, 'recently')}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-[#d8eddf] bg-[#ecfaf1] px-2.5 py-1 text-[0.68rem] font-semibold text-[#1f7d44]">
                {link.status || 'Live'}
              </span>
              <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex min-h-[38px] items-center gap-2 rounded-[12px] bg-[#10253a] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#1a3b5a]">
                Open listing
                <ArrowRight size={14} />
              </a>
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}

function SellerSupportCard({ sellerAgentPhone, sellerAgentEmail }) {
  const contactAction = sellerAgentEmail
    ? { label: 'Contact support', href: `mailto:${sellerAgentEmail}` }
    : { label: 'Contact support', disabled: true }
  const callAction = sellerAgentPhone
    ? { label: 'Call us', href: `tel:${sellerAgentPhone}` }
    : { label: 'Call us', disabled: true }

  return (
    <section className="rounded-[26px] border border-[#dbe5ef] bg-[linear-gradient(135deg,#f4f8fc_0%,#ffffff_100%)] px-5 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.04)] md:px-7">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-[#0f65b7] text-white shadow-[0_12px_24px_rgba(15,101,183,0.22)]">
            <ShieldCheck size={25} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#142132]">We&apos;re here to help you</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64748b]">
              If you have any questions about your sale, documents, or next steps, our team is ready to assist.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <SellerPortalAction action={contactAction} className="inline-flex min-h-[42px] items-center justify-center rounded-[12px] bg-[#10253a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1a3b5a]" />
          <SellerPortalAction action={callAction} className="inline-flex min-h-[42px] items-center justify-center rounded-[12px] border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]" />
        </div>
      </div>
    </section>
  )
}

function SellerPropertyHero({
  sellerGreeting,
  sellerFirstName,
  sellerAgentName,
  sellerAgentPhone,
  sellerAgentEmail,
  sellerAgentAvatarUrl,
  sellerAgencyName,
  sellerPropertyTitle,
  sellerPropertyImageUrl,
  sellerStatusLabel,
  sellerListingUrl,
  token,
  workspaceNavigationScope,
}) {
  const normalizedStatus = normalizeSellerPortalKey(sellerStatusLabel)
  const isListingLive = normalizedStatus.includes('listing_live') || normalizedStatus === 'live'
  const statusHeadline = isListingLive
    ? 'Your property is live and everything is on track.'
    : normalizedStatus.includes('offers_received')
      ? 'Your property is attracting buyer interest and offers are coming in.'
      : normalizedStatus.includes('offer_accepted')
        ? 'Your offer is accepted and the sale is moving forward.'
        : normalizedStatus.includes('transfer')
          ? 'Your property transfer is underway and on track.'
          : normalizedStatus.includes('registered')
            ? 'Your property sale is registered and complete.'
            : 'Your property sale is moving forward and everything is on track.'
  const messageAction = sellerAgentEmail
    ? { label: 'Message Agent', href: `mailto:${sellerAgentEmail}` }
    : sellerAgentPhone
      ? { label: 'Call Agent', href: `tel:${sellerAgentPhone}` }
      : { label: 'Message Agent', disabled: true }
  const scheduleAction = { label: 'Schedule Call', to: 'appointments' }
  const listingAction = sellerListingUrl
    ? { label: 'View Listing', href: sellerListingUrl }
    : null
  const primaryButtonClass = 'inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-[11px] bg-[#123f3a] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#0b312d]'
  const secondaryButtonClass = 'inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-[11px] border border-[#d7e2ea] bg-white px-3.5 py-2 text-sm font-semibold text-[#274158] transition hover:border-[#b8cbd9] hover:bg-[#f7fafc]'
  const agentName = sellerAgentName || sellerAgencyName || 'Your property team'

  return (
    <section id="seller-property-hero" className="grid gap-5 xl:grid-cols-[minmax(520px,0.92fr)_minmax(0,1.08fr)] xl:items-stretch">
      <div className="flex h-full min-w-0 flex-col py-1 xl:py-3">
        <h1 className="text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.045em] text-[#102a2b] sm:text-[2.55rem]">
          {sellerGreeting}, {sellerFirstName}.
        </h1>
        <p className="mt-3 max-w-2xl text-lg font-medium leading-7 text-[#078449] sm:text-[1.3rem]">
          {statusHeadline}
        </p>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#617187]">
          We&apos;re actively marketing your property across leading platforms and we&apos;ll let you know whenever something important happens.
        </p>

        <div className="mt-6 flex flex-1">
          <article className="flex min-h-[172px] w-full flex-col rounded-[20px] border border-[#dbe5ec] bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.055)]">
            <p className="text-[0.67rem] font-semibold uppercase tracking-[0.13em] text-[#718196]">Your agent</p>
            <div className="mt-3 flex min-w-0 items-center gap-4">
              <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-[#e6f2ef] text-lg font-semibold text-[#063f37] ring-1 ring-[#d6e8e2]">
                {sellerAgentAvatarUrl ? <img src={sellerAgentAvatarUrl} alt="" className="h-full w-full object-cover" /> : getSellerInitials(agentName)}
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-[1.05rem] font-semibold text-[#102032]">{agentName}</strong>
                {sellerAgencyName && sellerAgencyName !== agentName ? <p className="mt-0.5 truncate text-sm text-[#64748b]">{sellerAgencyName}</p> : null}
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#64748b]"><span className="h-1.5 w-1.5 rounded-full bg-[#16a466]" /> Here when you need us</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[#e7edf2] pt-3">
              <SellerPortalAction action={messageAction} token={token} workspaceNavigationScope={workspaceNavigationScope} className={primaryButtonClass}>
                {messageAction.label === 'Call Agent' ? <PhoneCall size={14} /> : <MessageCircle size={14} />}
                <span>{messageAction.label === 'Call Agent' ? 'Call' : 'Message'}</span>
              </SellerPortalAction>
              <SellerPortalAction action={scheduleAction} token={token} workspaceNavigationScope={workspaceNavigationScope} className={secondaryButtonClass}>
                <PhoneCall size={14} /><span>Schedule</span>
              </SellerPortalAction>
              {listingAction ? (
                <SellerPortalAction action={listingAction} token={token} workspaceNavigationScope={workspaceNavigationScope} className={secondaryButtonClass}>
                  <ExternalLink size={14} /><span>Open listing</span>
                </SellerPortalAction>
              ) : null}
            </div>
          </article>
        </div>
      </div>

      <div className="relative min-h-[360px] overflow-hidden rounded-[20px] border border-[#dbe5ef] bg-[#0b2e2a] shadow-[0_18px_38px_rgba(15,23,42,0.13)] xl:min-h-[410px]">
        {sellerPropertyImageUrl ? (
          <img src={sellerPropertyImageUrl} alt={sellerPropertyTitle || 'Property listing'} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#0b2e2a_0%,#173f55_58%,#f3f8f5_58%,#f3f8f5_100%)]">
            <div className="rounded-[16px] border border-white/20 bg-white/85 px-4 py-3 text-center shadow-[0_12px_28px_rgba(15,23,42,0.16)]">
              <Home size={26} className="mx-auto text-[#063f37]" />
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#41566c]">Property image pending</p>
            </div>
          </div>
        )}
        <div className="absolute left-4 top-4 rounded-[8px] bg-[#047857] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_10px_22px_rgba(4,120,87,0.28)]">
          {sellerStatusLabel}
        </div>
        {sellerPropertyImageUrl ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#071f22]/55 to-transparent" /> : null}
      </div>
    </section>
  )
}

function SellerTransactionHealthCard({ health }) {
  const hasScore = Number.isFinite(Number(health?.score))
  const score = hasScore ? Math.max(0, Math.min(100, Number(health.score))) : null
  const ringColor = health?.tone === 'action' ? '#d97706' : '#047857'

  return (
    <section className="rounded-[18px] border border-[#dbe5ef] bg-[linear-gradient(135deg,#f7fffb_0%,#ffffff_58%,#f7fbff_100%)] px-5 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-5">
          <div
            className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
            style={{
              background: hasScore ? `conic-gradient(${ringColor} ${score * 3.6}deg, #dbe5ef 0deg)` : '#e9f4f1',
            }}
          >
            <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-white">
              {hasScore ? (
                <span className="text-[1.35rem] font-semibold text-[#123024]">{score}%</span>
              ) : (
                <ShieldCheck size={30} className="text-[#047857]" />
              )}
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#26384d]">Transaction Health</p>
            <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.03em] text-[#063f37]">{health?.label || 'On Track'}</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[#52647a]">{health?.summary || 'Your sale is progressing.'}</p>
            <p className="text-sm leading-6 text-[#52647a]">{health?.detail || 'No action required from you.'}</p>
          </div>
        </div>
        <span className="hidden h-20 w-20 items-center justify-center rounded-[22px] bg-[#e8f6f0] text-[#047857] md:inline-flex">
          <ShieldCheck size={34} />
        </span>
      </div>
    </section>
  )
}

function SellerMarketingActivity({ channels = [] }) {
  return (
    <article id="seller-marketing-activity" className="h-full rounded-[18px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
      <SellerSectionHeading title="Marketing Activity" subtitle="Your property is shown only on channels shared by your agent." />
      {channels.length ? (
        <div className="mt-5 space-y-2.5">
          {channels.map((channel) => (
            <div key={channel.id} className="flex items-center justify-between gap-3 rounded-[13px] border border-[#e4ebf2] bg-[#fbfdff] px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[#e0e8ef] bg-white p-1.5">
                  {channel.logoUrl ? (
                    <img src={channel.logoUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <Megaphone size={16} className="text-[#047857]" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#102032]">{channel.label}</p>
                  <p className="text-xs leading-5 text-[#7b8ca2]">{channel.updatedLabel ? `Updated ${channel.updatedLabel}` : channel.status}</p>
                </div>
              </div>
              {channel.href ? (
                <a href={channel.href} target="_blank" rel="noreferrer" className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-[9px] bg-[#063f37] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#052f2a]">
                  View Listing
                  <ExternalLink size={12} />
                </a>
              ) : <span className="text-xs font-semibold text-[#047857]">{channel.status}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[14px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-5 text-sm leading-6 text-[#64748b]">
          No seller-visible listing channels have been published to this portal yet.
        </div>
      )}
    </article>
  )
}

function SellerAgentUpdate({ update }) {
  return (
    <article className="h-full rounded-[18px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
      <SellerSectionHeading title="Agent Update" subtitle="Latest update from your agent." />
      {update ? (
        <div className="mt-5 rounded-[14px] border border-[#d9eee6] bg-[#f2fbf7] p-4">
          <p className="text-2xl font-semibold leading-none text-[#047857]">"</p>
          <p className="mt-1 text-sm leading-6 text-[#0f2d24]">{update.message}</p>
          <div className="mt-5 flex items-center gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-xs font-semibold text-[#063f37]">
              {update.avatarUrl ? <img src={update.avatarUrl} alt="" className="h-full w-full object-cover" /> : getSellerInitials(update.agentName)}
            </span>
            <div>
              <p className="text-sm font-semibold text-[#102032]">{update.agentName}</p>
              <p className="text-xs text-[#64748b]">{update.timestampLabel}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-[14px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-5 text-sm leading-6 text-[#64748b]">
          No agent update has been posted yet.
        </div>
      )}
    </article>
  )
}

function SellerJourneyTimeline({ items = [] }) {
  return (
    <article className="flex h-full min-h-0 flex-col rounded-[18px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
      <SellerSectionHeading title="Journey Timeline" subtitle="A timeline of important milestones." />
      {items.length ? (
        <div className="mt-5 max-h-[250px] space-y-0 overflow-y-auto pr-2">
          {items.map((item, index) => (
            <div key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < items.length - 1 ? <span className="absolute left-[6px] top-5 h-[calc(100%-12px)] w-px bg-[#cfe5dc]" /> : null}
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-[#047857]" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0f766e]">{item.dateLabel}</p>
                <p className="mt-1 text-sm leading-5 text-[#52647a]">{item.title}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[14px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-5 text-sm leading-6 text-[#64748b]">
          Seller-visible milestones will appear here as your transaction team logs them.
        </div>
      )}
    </article>
  )
}

function SellerConversationCard({ updates = [], commentDraft = '', saving = false, onCommentDraftChange, onCommentSubmit }) {
  const visibleUpdates = updates.slice(0, 3)

  return (
    <article className="flex h-full min-h-[390px] flex-col rounded-[18px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <SellerSectionHeading title="Ask Your Property Team" subtitle="Post a question or follow up on your latest updates." />
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#e8f6f0] text-[#047857]">
          <MessageCircle size={18} />
        </span>
      </div>

      <div className="mt-4 max-h-[150px] space-y-2 overflow-y-auto pr-1">
        {visibleUpdates.length ? visibleUpdates.map((update, index) => (
          <div key={update.id || `seller-chat-update-${index}`} className="rounded-[12px] border border-[#dfeae6] bg-[#f3faf7] px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[#123f3a]">{update.authorName || update.agentName || 'Property team'}</span>
              <span className="text-[0.68rem] text-[#7b8ca2]">{update.timestampLabel || 'Recently'}</span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-[#40566b]">{update.message || update.title || 'Your property team posted an update.'}</p>
          </div>
        )) : (
          <div className="rounded-[12px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-3.5 py-4 text-sm leading-6 text-[#64748b]">
            Start a conversation with your agent or transaction team.
          </div>
        )}
      </div>

      <form onSubmit={onCommentSubmit} className="mt-auto border-t border-[#e5edf2] pt-4">
        <label htmlFor="seller-team-question" className="text-xs font-semibold uppercase tracking-[0.1em] text-[#718196]">Your message</label>
        <textarea
          id="seller-team-question"
          value={commentDraft}
          onChange={(event) => onCommentDraftChange?.(event.target.value)}
          rows={3}
          placeholder="Ask a question or share an update..."
          className="mt-2 w-full resize-none rounded-[12px] border border-[#dbe5ef] bg-[#fbfdff] px-3 py-2.5 text-sm leading-5 text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#9dbbb2] focus:ring-2 focus:ring-[#dff0ea]"
        />
        <div className="mt-3 flex justify-end">
          <button type="submit" disabled={saving || !String(commentDraft || '').trim()} className="inline-flex min-h-[38px] items-center gap-2 rounded-[10px] bg-[#063f37] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#052f2a] disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Posting...' : 'Post message'}
            <ArrowRight size={14} />
          </button>
        </div>
      </form>
    </article>
  )
}

function SellerDocumentTracker({ tracker = {}, token, workspaceNavigationScope }) {
  const percent = Math.max(0, Math.min(100, Number(tracker?.percent || 0)))
  const total = Number(tracker?.total || 0)
  const completed = Number(tracker?.completed || 0)
  const pending = Number(tracker?.pending || 0)
  const awaitingReview = Number(tracker?.awaitingReview || 0)

  return (
    <article className="flex h-full min-h-[390px] flex-col rounded-[18px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
      <SellerSectionHeading title="Document Tracker" subtitle="Approval progress is separate from files received for review." />
      <div className="mt-7 flex flex-1 flex-col items-center justify-center gap-7 sm:flex-row">
        <div className="relative grid h-36 w-36 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#078449 ${percent * 3.6}deg, #e4edf2 0deg)` }}>
          <div className="grid h-[108px] w-[108px] place-items-center rounded-full bg-white text-center shadow-inner">
            <div>
              <strong className="block text-2xl font-semibold text-[#123f3a]">{percent}%</strong>
              <span className="mt-0.5 block text-[0.67rem] font-semibold uppercase tracking-[0.1em] text-[#718196]">Approved</span>
            </div>
          </div>
        </div>
        <div className="w-full max-w-[260px] space-y-3">
          <div className="flex items-center justify-between rounded-[12px] bg-[#f2faf6] px-3.5 py-3">
            <span className="flex items-center gap-2 text-sm text-[#40566b]"><CheckCircle2 size={15} className="text-[#078449]" /> Approved</span>
            <strong className="text-sm text-[#123f3a]">{completed}</strong>
          </div>
          <div className="flex items-center justify-between rounded-[12px] bg-[#f3f7fc] px-3.5 py-3">
            <span className="flex items-center gap-2 text-sm text-[#40566b]"><Clock3 size={15} className="text-[#2f6fa4]" /> Awaiting review</span>
            <strong className="text-sm text-[#244c6d]">{awaitingReview}</strong>
          </div>
          <div className="flex items-center justify-between rounded-[12px] bg-[#fff8ec] px-3.5 py-3">
            <span className="flex items-center gap-2 text-sm text-[#40566b]"><AlertTriangle size={15} className="text-[#d97706]" /> Action needed</span>
            <strong className="text-sm text-[#8a570f]">{pending}</strong>
          </div>
          <div className="flex items-center justify-between px-3.5 py-1 text-sm text-[#64748b]">
            <span>Total tracked</span>
            <strong className="text-[#274158]">{total}</strong>
          </div>
        </div>
      </div>
      <Link to={getPortalWorkspacePath(token, workspaceNavigationScope, 'documents')} className="mt-6 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[10px] border border-[#cfe0da] bg-[#f3faf7] px-4 py-2 text-sm font-semibold text-[#047857] transition hover:bg-[#e9f6f0]">
        Open document centre
        <ArrowRight size={14} />
      </Link>
    </article>
  )
}

function SellerSecureSupportFooter({ sellerAgentEmail }) {
  const action = sellerAgentEmail
    ? { label: 'Message Agent', href: `mailto:${sellerAgentEmail}` }
    : { label: 'Message Agent', disabled: true }

  return (
    <section className="rounded-[18px] border border-[#dbe5ef] bg-[linear-gradient(135deg,#f7fffb_0%,#ffffff_100%)] px-5 py-4 shadow-[0_12px_26px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#cfe9da] bg-[#eefbf4] text-[#047857]">
            <ShieldCheck size={20} />
          </span>
          <div>
            <p className="text-sm font-semibold text-[#102032]">Your information is secure and confidential.</p>
            <p className="mt-0.5 text-xs leading-5 text-[#64748b]">Protected by bank-level security.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm leading-5 text-[#52647a]">
            <span className="font-semibold text-[#102032]">Questions?</span> We&apos;re here to help.
          </p>
          <SellerPortalAction
            action={action}
            className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-[10px] bg-[#063f37] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#052f2a] disabled:opacity-60"
          >
            <span>Message Agent</span>
            <MessageCircle size={14} />
          </SellerPortalAction>
        </div>
      </div>
    </section>
  )
}

function SellerPortalDashboard({
  sellerFirstName,
  sellerAgentName,
  sellerAgentPhone,
  sellerAgentEmail,
  sellerAgentAvatarUrl,
  sellerAgencyName,
  sellerPropertyTitle,
  sellerPropertyImageUrl,
  sellerStatusLabel,
  sellerHealth,
  sellerListingProgressModel,
  sellerSaleProgressModel,
  sellerMarketingChannels,
  sellerAgentUpdate,
  sellerTimelineItems,
  sellerChatUpdates,
  sellerDocumentTracker,
  sellerListingUrl,
  commentDraft,
  savingComment,
  onCommentDraftChange,
  onCommentSubmit,
  token,
  workspaceNavigationScope,
}) {
  const sellerGreeting = getSellerDashboardGreeting()

  return (
    <section className="space-y-6">
      <SellerPropertyHero
        sellerGreeting={sellerGreeting}
        sellerFirstName={sellerFirstName}
        sellerAgentName={sellerAgentName}
        sellerAgentPhone={sellerAgentPhone}
        sellerAgentEmail={sellerAgentEmail}
        sellerAgentAvatarUrl={sellerAgentAvatarUrl}
        sellerAgencyName={sellerAgencyName}
        sellerPropertyTitle={sellerPropertyTitle}
        sellerPropertyImageUrl={sellerPropertyImageUrl}
        sellerStatusLabel={sellerStatusLabel}
        sellerListingUrl={sellerListingUrl}
        token={token}
        workspaceNavigationScope={workspaceNavigationScope}
      />
      <SellerTransactionHealthCard health={sellerHealth} />
      <SellerProgressJourney
        listingProgressModel={sellerListingProgressModel}
        saleProgressModel={sellerSaleProgressModel}
        token={token}
        workspaceNavigationScope={workspaceNavigationScope}
      />
      <section className="grid gap-5 xl:grid-cols-3">
        <SellerMarketingActivity channels={sellerMarketingChannels} />
        <SellerAgentUpdate update={sellerAgentUpdate} />
        <SellerJourneyTimeline items={sellerTimelineItems} />
      </section>
      <section className="grid items-stretch gap-5 xl:grid-cols-2">
        <SellerConversationCard
          updates={sellerChatUpdates}
          commentDraft={commentDraft}
          saving={savingComment}
          onCommentDraftChange={onCommentDraftChange}
          onCommentSubmit={onCommentSubmit}
        />
        <SellerDocumentTracker
          tracker={sellerDocumentTracker}
          token={token}
          workspaceNavigationScope={workspaceNavigationScope}
        />
      </section>
      <SellerSecureSupportFooter sellerAgentEmail={sellerAgentEmail} />
    </section>
  )
}

function SellerPortalPasswordGate({
  authState = {},
  form,
  feedback = '',
  notice = '',
  saving = false,
  recoveryRequesting = false,
  onChange,
  onRequestRecovery,
  onSubmit,
}) {
  const passwordSet = Boolean(authState?.passwordSet)
  const recoveryMode = authState?.tokenKind === 'recovery'
  const sessionExpired = Boolean(authState?.sessionExpired)
  const title = recoveryMode ? 'Reset your seller portal password' : passwordSet ? 'Enter your seller portal password' : 'Set your seller portal password'
  const description = recoveryMode
    ? 'Create a new password to secure your seller portal. This recovery link can only be used once.'
    : passwordSet
    ? sessionExpired
      ? 'Your secure session ended. Enter your password to continue—your portal link is still active.'
      : 'Use the password you created for this seller portal.'
    : 'Create a password before opening your seller portal and document centre.'
  const propertyTitle = String(authState?.propertyTitle || '').trim()
  const sellerEmail = String(authState?.sellerEmail || '').trim()

  return (
    <main className="min-h-screen bg-[#f3f6fb] px-5 py-8 md:px-8">
      <section className="mx-auto max-w-[760px] rounded-[24px] border border-[#dbe5ef] bg-white px-6 py-7 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#eaf2fb] text-[#2f5478]">
            <KeyRound size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b7d93]">Seller portal</p>
            <h1 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.02em] text-[#142132]">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-[#5f7288]">{description}</p>
          </div>
        </div>

        {propertyTitle || sellerEmail ? (
          <div className="mt-5 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
            {propertyTitle ? <strong className="block text-sm font-semibold text-[#142132]">{propertyTitle}</strong> : null}
            {sellerEmail ? <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{sellerEmail}</p> : null}
          </div>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-sm font-semibold text-[#24364a]">Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => onChange('password', event.target.value)}
              autoComplete={passwordSet && !recoveryMode ? 'current-password' : 'new-password'}
              className="mt-2 h-12 w-full rounded-[14px] border border-[#dbe5ef] bg-white px-4 text-sm text-[#142132] outline-none transition focus:border-[#7ea1c4] focus:ring-4 focus:ring-[#d9e9f8]"
              placeholder="At least 8 characters"
            />
          </label>

          {!passwordSet || recoveryMode ? (
            <label className="block">
              <span className="text-sm font-semibold text-[#24364a]">Confirm password</span>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => onChange('confirmPassword', event.target.value)}
                autoComplete="new-password"
                className="mt-2 h-12 w-full rounded-[14px] border border-[#dbe5ef] bg-white px-4 text-sm text-[#142132] outline-none transition focus:border-[#7ea1c4] focus:ring-4 focus:ring-[#d9e9f8]"
                placeholder="Re-enter password"
              />
            </label>
          ) : null}

          {feedback ? (
            <div className="flex items-start gap-2 rounded-[14px] border border-[#f1d4cf] bg-[#fff8f6] px-3 py-3 text-sm leading-6 text-[#b42318]">
              <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{feedback}</span>
            </div>
          ) : null}

          {notice ? (
            <div className="rounded-[14px] border border-[#cfe8d8] bg-[#f2fbf5] px-3 py-3 text-sm leading-6 text-[#1f7d44]">
              {notice}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#2f5478] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#244463] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ShieldCheck size={18} aria-hidden="true" />
            {saving ? 'Saving password...' : recoveryMode ? 'Reset password and continue' : passwordSet ? 'Open seller portal' : 'Set password and open portal'}
          </button>
          {passwordSet && !recoveryMode ? (
            <button
              type="button"
              disabled={recoveryRequesting}
              onClick={onRequestRecovery}
              className="w-full text-center text-sm font-semibold text-[#2f5478] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {recoveryRequesting ? 'Requesting secure reset...' : 'Forgot your password?'}
            </button>
          ) : null}
        </form>
      </section>
    </main>
  )
}

function ClientPortal() {
  const { token = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [portal, setPortal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hydratingPortal, setHydratingPortal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sellerPortalAccessToken, setSellerPortalAccessToken] = useState(() => getStoredSellerPortalAccessToken(token))
  const [sellerPortalAuth, setSellerPortalAuth] = useState(null)
  const [sellerPortalPasswordForm, setSellerPortalPasswordForm] = useState({ password: '', confirmPassword: '' })
  const [sellerPortalPasswordFeedback, setSellerPortalPasswordFeedback] = useState('')
  const [sellerPortalPasswordSaving, setSellerPortalPasswordSaving] = useState(false)
  const [sellerPortalRecoveryNotice, setSellerPortalRecoveryNotice] = useState('')
  const [sellerPortalRecoveryRequesting, setSellerPortalRecoveryRequesting] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [uploadingDocumentKey, setUploadingDocumentKey] = useState('')
  const [activeDocumentsTab, setActiveDocumentsTab] = useState('sales')
  const [activeBondApplicationTab, setActiveBondApplicationTab] = useState('application')
  const [activeBondApplicationSectionTab, setActiveBondApplicationSectionTab] = useState('summary')
  const [activeBondApplicantKey, setActiveBondApplicantKey] = useState('primary')
  const [bondApplicationDraft, setBondApplicationDraft] = useState(null)
  const [bondApplicationDirty, setBondApplicationDirty] = useState(false)
  const [bondApplicationSaving, setBondApplicationSaving] = useState(false)
  const [reservationProofUploadFeedback, setReservationProofUploadFeedback] = useState({ tone: '', message: '' })
  const [expandedJourneyStepId, setExpandedJourneyStepId] = useState(null)
  const [myDetailsDraft, setMyDetailsDraft] = useState({})
  const [myDetailsEditingSection, setMyDetailsEditingSection] = useState('')
  const [myDetailsSavingSection, setMyDetailsSavingSection] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [showAdvancedDocuments, setShowAdvancedDocuments] = useState(false)
  const [openingDocumentPath, setOpeningDocumentPath] = useState('')
  const [appointmentActionPending, setAppointmentActionPending] = useState('')
  const [appointmentFeedback, setAppointmentFeedback] = useState('')
  const notificationsRef = useRef(null)
  const reservationProofInputRef = useRef(null)

  const [issueForm, setIssueForm] = useState({
    category: ISSUE_CATEGORIES[0],
    description: '',
    location: '',
    priority: '',
  })
  const [alterationForm, setAlterationForm] = useState({
    title: '',
    category: '',
    description: '',
    budgetRange: '',
    preferredTiming: '',
  })
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    reviewText: '',
    positives: '',
    improvements: '',
    allowMarketingUse: false,
  })
  const [handoverForm, setHandoverForm] = useState({
    handoverDate: '',
    electricityMeterReading: '',
    waterMeterReading: '',
    gasMeterReading: '',
    inspectionCompleted: false,
    keysHandedOver: false,
    remoteHandedOver: false,
    manualsHandedOver: false,
    notes: '',
    signatureName: '',
  })
  const portalContextsRef = useRef({ contexts: [], hasBuyingContext: true, hasSellingContext: false })
  const [workspaceData, setWorkspaceData] = useState(null)
  const [matterAccountsState, setMatterAccountsState] = useState({
    accounts: [],
    summary: null,
    loading: false,
    error: '',
    unavailable: false,
    message: '',
  })
  const [uploadingMatterProofAccountId, setUploadingMatterProofAccountId] = useState('')
  const [matterProofUploadFeedback, setMatterProofUploadFeedback] = useState({ accountId: '', tone: '', message: '' })
  const [uploadingMatterRequestId, setUploadingMatterRequestId] = useState('')
  const [matterRequestUploadFeedback, setMatterRequestUploadFeedback] = useState({ requestId: '', tone: '', message: '' })
  const [sellerRequestForm, setSellerRequestForm] = useState({
    propertyAddress: '',
    message: '',
    preferredContactMethod: 'email',
  })
  const [sellerRequestFeedback, setSellerRequestFeedback] = useState({ tone: '', message: '' })

  const requestedWorkspace = useMemo(() => getPortalWorkspaceFromPath(location.pathname), [location.pathname])
  const isSellerPortalToken = useMemo(() => String(token || '').trim().toLowerCase().startsWith('seller-'), [token])

  const requestedSection = useMemo(() => {
    if (location.pathname.endsWith('/progress')) return 'progress'
    if (location.pathname.endsWith('/bond-application')) return 'bond_application'
    if (location.pathname.endsWith('/appointments')) return 'appointments'
    if (location.pathname.endsWith('/offers')) return 'offers'
    if (location.pathname.endsWith('/account')) return 'account'
    if (location.pathname.endsWith('/documents') || location.pathname.endsWith('/forms/trust-investment')) return 'documents'
    if (location.pathname.endsWith('/details') || location.pathname.endsWith('/onboarding')) return 'details'
    if (location.pathname.endsWith('/handover')) return 'handover'
    if (location.pathname.endsWith('/homeowner')) return 'handover'
    if (location.pathname.endsWith('/snags') || location.pathname.endsWith('/issues')) return 'snags'
    if (location.pathname.endsWith('/settings')) return 'overview'
    if (location.pathname.endsWith('/team')) return 'team'
    if (location.pathname.endsWith('/alterations')) return 'alterations'
    if (location.pathname.endsWith('/review')) return 'review'
    return 'overview'
  }, [location.pathname])

  useEffect(() => {
    setSellerPortalAccessToken(getStoredSellerPortalAccessToken(token))
    setSellerPortalAuth(null)
    setSellerPortalPasswordFeedback('')
    setSellerPortalRecoveryNotice('')
    setSellerPortalRecoveryRequesting(false)
    setSellerPortalPasswordForm({ password: '', confirmPassword: '' })
  }, [token])

  useEffect(() => {
    const normalizedToken = String(token || '').trim().toLowerCase()
    if (!normalizedToken.startsWith('seller-')) return

    if (location.pathname.endsWith('/selling/onboarding')) {
      navigate(`/seller/onboarding/${token}`, { replace: true })
      return
    }

    if (!location.pathname.includes('/selling')) {
      navigate(`/client/${token}/selling`, { replace: true })
    }
  }, [location.pathname, navigate, token])

  const loadPortal = useCallback(async ({ background = false } = {}) => {
    if (!token) {
      setError('Missing client portal token.')
      setLoading(false)
      return
    }

    if (background) {
      const backgroundStartedAt = Date.now()
      try {
        setError('')
        setHydratingPortal(true)
        const data = await getClientPortalWorkspaceData(token, requestedWorkspace, {
          mode: 'full',
          sellerPortalAccessToken: isSellerPortalToken ? sellerPortalAccessToken : '',
        })
        portalContextsRef.current = {
          contexts: data?.portalContext?.contexts || [],
          hasBuyingContext: data?.portalContext?.hasBuyingContext !== false,
          hasSellingContext: Boolean(data?.portalContext?.hasSellingContext),
        }
        setWorkspaceData(data)
        setPortal(data?.legacyPortalData || null)
        setSellerPortalAuth(null)
        console.log('[perf][client-portal] background refresh complete', {
          token,
          durationMs: Date.now() - backgroundStartedAt,
        })
      } catch (loadError) {
        if (isSellerPortalAuthRequiredError(loadError)) {
          setSellerPortalAuth(loadError.portalAuth || { authRequired: true })
          setPortal(null)
          setWorkspaceData(null)
          setError('')
          return
        }
        setError(loadError?.message || 'We could not refresh your client workspace right now.')
      } finally {
        setHydratingPortal(false)
      }
      return
    }

    const startedAt = Date.now()
    let hasCoreData = false
    try {
      setLoading(true)
      setError('')
      const coreData = await getClientPortalWorkspaceData(token, requestedWorkspace, {
        mode: 'core',
        sellerPortalAccessToken: isSellerPortalToken ? sellerPortalAccessToken : '',
      })
      portalContextsRef.current = {
        contexts: coreData?.portalContext?.contexts || [],
        hasBuyingContext: coreData?.portalContext?.hasBuyingContext !== false,
        hasSellingContext: Boolean(coreData?.portalContext?.hasSellingContext),
      }
      setWorkspaceData(coreData)
      setPortal(coreData?.legacyPortalData || null)
      setSellerPortalAuth(null)
      hasCoreData = Boolean(coreData?.legacyPortalData)
      setLoading(false)
      console.log('[perf][client-portal] core data loaded', {
        token,
        durationMs: Date.now() - startedAt,
      })
    } catch (coreError) {
      if (isSellerPortalAuthRequiredError(coreError)) {
        setSellerPortalAuth(coreError.portalAuth || { authRequired: true })
        setPortal(null)
        setWorkspaceData(null)
        setLoading(false)
        return
      }
      if (!hasCoreData) {
        setError(coreError?.message || 'We could not load your client workspace.')
      }
    }

    try {
      setHydratingPortal(true)
      const fullData = await getClientPortalWorkspaceData(token, requestedWorkspace, {
        mode: 'full',
        sellerPortalAccessToken: isSellerPortalToken ? sellerPortalAccessToken : '',
      })
      portalContextsRef.current = {
        contexts: fullData?.portalContext?.contexts || [],
        hasBuyingContext: fullData?.portalContext?.hasBuyingContext !== false,
        hasSellingContext: Boolean(fullData?.portalContext?.hasSellingContext),
      }
      setWorkspaceData(fullData)
      setPortal(fullData?.legacyPortalData || null)
      setSellerPortalAuth(null)
      setError('')
      console.log('[perf][client-portal] full data loaded', {
        token,
        durationMs: Date.now() - startedAt,
      })
    } catch (loadError) {
      if (isSellerPortalAuthRequiredError(loadError)) {
        setSellerPortalAuth(loadError.portalAuth || { authRequired: true })
        setPortal(null)
        setWorkspaceData(null)
        setError('')
        return
      }
      if (!hasCoreData) {
        setError(loadError?.message || 'We could not finish loading your client workspace.')
      }
    } finally {
      setHydratingPortal(false)
      setLoading(false)
    }
  }, [isSellerPortalToken, sellerPortalAccessToken, token, requestedWorkspace])

  const handleSellerPortalPasswordChange = useCallback((field, value) => {
    setSellerPortalPasswordForm((previous) => ({
      ...previous,
      [field]: value,
    }))
    setSellerPortalPasswordFeedback('')
    setSellerPortalRecoveryNotice('')
  }, [])

  const handleSellerPortalRecoveryRequest = useCallback(async () => {
    try {
      setSellerPortalRecoveryRequesting(true)
      setSellerPortalPasswordFeedback('')
      setSellerPortalRecoveryNotice('')
      const recoveryToken = String(sellerPortalAuth?.stablePortalToken || token || '').trim()
      const result = await requestSellerPortalPasswordRecovery(recoveryToken)
      setSellerPortalRecoveryNotice(
        result?.message || 'If this portal can be recovered, a password reset email will arrive shortly.',
      )
    } catch (recoveryError) {
      setSellerPortalPasswordFeedback(recoveryError?.message || 'Password recovery is temporarily unavailable.')
    } finally {
      setSellerPortalRecoveryRequesting(false)
    }
  }, [sellerPortalAuth?.stablePortalToken, token])

  const handleSellerPortalPasswordSubmit = useCallback(async (event) => {
    event.preventDefault()
    const password = String(sellerPortalPasswordForm.password || '')
    const confirmPassword = String(sellerPortalPasswordForm.confirmPassword || '')
    const passwordSet = Boolean(sellerPortalAuth?.passwordSet)
    const recoveryMode = sellerPortalAuth?.tokenKind === 'recovery'

    if (password.length < 8) {
      setSellerPortalPasswordFeedback('Password must be at least 8 characters.')
      return
    }

    if ((!passwordSet || recoveryMode) && password !== confirmPassword) {
      setSellerPortalPasswordFeedback('Passwords do not match.')
      return
    }

    try {
      setSellerPortalPasswordSaving(true)
      setSellerPortalPasswordFeedback('')
      const session = recoveryMode
        ? await completeSellerPortalPasswordRecovery({ token, password })
        : passwordSet
          ? await verifySellerPortalPassword({ token, password })
          : await setSellerPortalPassword({ token, password })
      const accessToken = session?.accessToken || getStoredSellerPortalAccessToken(token)
      const stablePortalToken = String(session?.stablePortalToken || '').trim()
      const stablePortalPath = String(session?.stablePortalPath || '').trim()
      setLoading(true)
      setSellerPortalAccessToken(accessToken)
      setSellerPortalAuth(null)
      setSellerPortalPasswordForm({ password: '', confirmPassword: '' })
      setError('')
      if (stablePortalToken && stablePortalToken !== token && stablePortalPath) {
        clearSellerPortalAccessToken(token)
        navigate(stablePortalPath, { replace: true })
      }
    } catch (passwordError) {
      setSellerPortalPasswordFeedback(passwordError?.message || 'Unable to open your seller portal right now.')
    } finally {
      setSellerPortalPasswordSaving(false)
    }
  }, [navigate, sellerPortalAuth?.passwordSet, sellerPortalAuth?.tokenKind, sellerPortalPasswordForm.confirmPassword, sellerPortalPasswordForm.password, token])

  const applyUploadedPortalDocument = useCallback(
    (uploadedDocument, { requiredDocumentKey = null } = {}) => {
      if (!uploadedDocument?.id) {
        return
      }

      const markRequiredDocumentUploaded = (document) => {
        const normalizedRequiredKey = normalizeDocumentKey(requiredDocumentKey)
        if (!normalizedRequiredKey || normalizeDocumentKey(document?.key || document?.requirement_key) !== normalizedRequiredKey) {
          return document
        }
        return {
          ...document,
          status: 'uploaded',
          requiredDocumentStatus: 'uploaded',
          complete: true,
          isUploaded: true,
          uploadedDocumentId: uploadedDocument.id,
          uploaded_document_id: uploadedDocument.id,
          uploadedDocument: uploadedDocument,
          uploaded_document: uploadedDocument,
        }
      }

      const addUploadedDocument = (documents = []) => {
        const existingRows = Array.isArray(documents) ? documents : []
        const uploadedDocumentId = String(uploadedDocument.id)
        const uploadedDocumentType = normalizeDocumentKey(uploadedDocument.document_type)
        let nextDocuments = existingRows.filter((document) => String(document?.id || '') !== uploadedDocumentId)
        if (uploadedDocumentType === 'reservation_deposit_pop') {
          nextDocuments = nextDocuments.filter(
            (document) => normalizeDocumentKey(document?.document_type) !== 'reservation_deposit_pop',
          )
        }
        nextDocuments.unshift(uploadedDocument)
        return nextDocuments
      }

      setPortal((previous) => {
        if (!previous) {
          return previous
        }

        const normalizedRequiredKey = normalizeDocumentKey(requiredDocumentKey)
        const nextDocuments = addUploadedDocument(previous.documents)

        let nextRequiredDocuments = previous.requiredDocuments
        if (normalizedRequiredKey && Array.isArray(previous.requiredDocuments)) {
          nextRequiredDocuments = previous.requiredDocuments.map(markRequiredDocumentUploaded)
        }

        return {
          ...previous,
          documents: nextDocuments,
          requiredDocuments: nextRequiredDocuments,
        }
      })

      setWorkspaceData((previous) => {
        if (!previous?.documentCenter) return previous
        const nextUploadedDocuments = addUploadedDocument(previous.documentCenter.uploadedDocuments)
        const nextRequiredDocuments = Array.isArray(previous.documentCenter.requiredDocuments)
          ? previous.documentCenter.requiredDocuments.map(markRequiredDocumentUploaded)
          : previous.documentCenter.requiredDocuments
        return {
          ...previous,
          documentCenter: {
            ...previous.documentCenter,
            uploadedDocuments: nextUploadedDocuments,
            requiredDocuments: nextRequiredDocuments,
          },
        }
      })
    },
    [],
  )

  useEffect(() => {
    void loadPortal()
  }, [loadPortal])

  useTransactionLiveRefresh({
    transactionId: workspaceData?.transaction?.id || portal?.transaction?.id,
    onRefresh: () => loadPortal({ background: true }),
    includeNotifications: false,
    pollingIntervalMs: 30_000,
  })

  useEffect(() => {
    if (!portal) {
      setMyDetailsDraft({})
      setBondApplicationDraft(null)
      return
    }
    setMyDetailsDraft(cloneMyDetailsFormData(portal?.onboardingFormData?.formData || {}))
    setMyDetailsEditingSection('')
    setMyDetailsSavingSection('')
    setBondApplicationDraft(buildBondApplicationDraft(portal))
    setBondApplicationDirty(false)
    setActiveBondApplicantKey('primary')
  }, [portal])

  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setNotificationsOpen(false)
  }, [location.pathname])

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  const currentNotificationRole = (() => {
    const workspaceValue = String(
      workspaceData?.portalContext?.workspace || requestedWorkspace || 'buying',
    )
      .trim()
      .toLowerCase()
    return workspaceValue === 'selling' || workspaceValue === 'seller' ? 'seller' : 'buyer'
  })()

  const applyNotificationMutation = useCallback((mutator) => {
    setWorkspaceData((previous) => {
      if (!previous || !previous.notifications || typeof previous.notifications !== 'object') {
        return previous
      }
      const existingItems = Array.isArray(previous.notifications.items) ? previous.notifications.items : []
      const nextItems = mutator(existingItems)
      const nextUnreadCount = nextItems.filter((item) => String(item?.status || '').toLowerCase() === 'unread').length
      return {
        ...previous,
        notifications: {
          ...previous.notifications,
          items: nextItems,
          unreadCount: nextUnreadCount,
        },
      }
    })
  }, [])

  const handleMarkNotificationRead = useCallback(async (notificationId) => {
    if (!notificationId) return
    try {
      await markClientPortalNotificationRead(notificationId, { token })
      applyNotificationMutation((items) =>
        items.map((item) =>
          String(item?.id || '') === String(notificationId)
            ? { ...item, status: 'read' }
            : item,
        ),
      )
    } catch (notificationError) {
      console.warn('Failed to mark notification as read', notificationError)
    }
  }, [applyNotificationMutation, token])

  const handleMarkAllNotificationsRead = useCallback(async () => {
    try {
      await markAllClientPortalNotificationsRead(token, currentNotificationRole)
      applyNotificationMutation((items) => items.map((item) => ({ ...item, status: 'read' })))
    } catch (notificationError) {
      console.warn('Failed to mark all notifications as read', notificationError)
    }
  }, [applyNotificationMutation, currentNotificationRole, token])

  const handleDismissNotification = useCallback(async (notificationId) => {
    if (!notificationId) return
    try {
      await dismissClientPortalNotification(notificationId, { token })
      applyNotificationMutation((items) =>
        items.map((item) =>
          String(item?.id || '') === String(notificationId)
            ? { ...item, status: 'dismissed' }
            : item,
        ),
      )
    } catch (notificationError) {
      console.warn('Failed to dismiss notification', notificationError)
    }
  }, [applyNotificationMutation, token])

  function handleMyDetailsFieldChange(fieldKey, nextValue) {
    setMyDetailsDraft((previous) => updateMyDetailsDraftField(previous, fieldKey, nextValue))
  }

  function handleCancelMyDetailsEdit() {
    setMyDetailsDraft(cloneMyDetailsFormData(portal?.onboardingFormData?.formData || {}))
    setMyDetailsEditingSection('')
  }

  async function handleSaveMyDetailsSection(sectionKey) {
    try {
      setMyDetailsSavingSection(sectionKey)
      setError('')
      await saveClientPortalOnboardingDraft({
        token,
        formData: myDetailsDraft,
      })
      await loadPortal()
      setMyDetailsEditingSection('')
    } catch (saveError) {
      setError(saveError.message || 'Unable to save your details right now.')
    } finally {
      setMyDetailsSavingSection('')
    }
  }

  function updateBondApplicationField(path, value) {
    setBondApplicationDraft((previous) => {
      if (!previous) return previous
      return setNestedPortalValue(previous, path, value)
    })
    setBondApplicationDirty(true)
  }

  function updateBondApplicationApplicantField(applicantKey, fieldKey, value) {
    setBondApplicationDraft((previous) => {
      if (!previous) return previous
      const nextApplicants = Array.isArray(previous.applicants)
        ? previous.applicants.map((applicant) =>
            applicant.key === applicantKey ? { ...applicant, [fieldKey]: value } : applicant,
          )
        : []
      return {
        ...previous,
        applicants: nextApplicants,
      }
    })
    setBondApplicationDirty(true)
  }

  function toggleBondApplicationBank(bankName) {
    setBondApplicationDraft((previous) => {
      if (!previous) return previous
      const selectedBanks = Array.isArray(previous.selected_banks) ? previous.selected_banks : []
      const isSelected = selectedBanks.includes(bankName)
      return {
        ...previous,
        selected_banks: isSelected
          ? selectedBanks.filter((item) => item !== bankName)
          : [...selectedBanks, bankName],
      }
    })
    setBondApplicationDirty(true)
  }

  async function persistBondApplicationDraft(nextDraft = bondApplicationDraft, { submitted = false } = {}) {
    if (!nextDraft) return

    try {
      setBondApplicationSaving(true)
      setError('')

      const timestamp = new Date().toISOString()
      const nextStatus = submitted
        ? 'Submitted'
        : nextDraft.status === 'Not Started' || !nextDraft.status
          ? 'In Progress'
          : nextDraft.status

      const draftToPersist = {
        ...nextDraft,
        status: nextStatus,
        submitted_at: submitted ? timestamp : nextDraft.submitted_at || '',
      }

      const nextFormData = cloneMyDetailsFormData(portal?.onboardingFormData?.formData || {})
      nextFormData.bond_application = draftToPersist
      const primaryIncomeExpenses = draftToPersist?.income_deductions_expenses?.primary || {}
      const primaryEmployment = draftToPersist?.employment?.primary || {}
      nextFormData.finance_readiness = buildFinanceReadinessPayload({
        monthlyIncome: primaryIncomeExpenses.gross_salary || draftToPersist?.income?.salary || nextFormData.gross_monthly_income,
        monthlyDebt:
          primaryIncomeExpenses.total_monthly_debt ||
          primaryIncomeExpenses.total_debt_repayments ||
          draftToPersist?.banking_liabilities?.other_finance_1_monthly_payment,
        monthlyExpenses: primaryIncomeExpenses.total_monthly_expenses || primaryIncomeExpenses.living_expenses,
        deposit: draftToPersist?.summary?.deposit_amount || draftToPersist?.summary?.cash_contribution || nextFormData.deposit_amount,
        employmentType: primaryEmployment.occupation_status || primaryEmployment.employment_type,
        employmentDurationMonths:
          (Number(primaryEmployment.employment_years || 0) * 12) + Number(primaryEmployment.employment_months || 0),
        dependants: draftToPersist?.personal_details?.primary?.dependants || nextFormData.dependants,
        estimatedPurchaseRange: draftToPersist?.summary?.purchase_price || nextFormData.purchase_price,
        documentReadiness: submitted ? 1 : 0.5,
        onboardingCompleteness: submitted ? 1 : 0.65,
      }, nextFormData).finance_readiness

      await saveClientPortalOnboardingDraft({
        token,
        formData: nextFormData,
      })

      setBondApplicationDraft(draftToPersist)
      setBondApplicationDirty(false)
      await loadPortal()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save bond application details right now.')
      throw saveError
    } finally {
      setBondApplicationSaving(false)
    }
  }

  async function handleBondApplicationSectionChange(nextSectionKey) {
    if (nextSectionKey === activeBondApplicationSectionTab) return
    if (bondApplicationDirty) {
      await persistBondApplicationDraft()
    }
    setActiveBondApplicationSectionTab(nextSectionKey)
  }

  async function handleBondApplicationTabChange(nextTabKey) {
    if (nextTabKey === activeBondApplicationTab) return
    if (bondApplicationDirty && activeBondApplicationTab === 'application') {
      await persistBondApplicationDraft()
    }
    setActiveBondApplicationTab(nextTabKey)
  }

  async function handleBondApplicationSubmit() {
    if (!bondApplicationDraft) return

    const hasConsent = Boolean(
      bondApplicationDraft?.declarations_consents?.loan_processing_consent &&
      bondApplicationDraft?.declarations_consents?.credit_bureau_fraud_bank_data_consent &&
      bondApplicationDraft?.declarations_consents?.declaration_accepted &&
      String(bondApplicationDraft?.declarations_consents?.digital_signature_name || '').trim() &&
      String(bondApplicationDraft?.declarations_consents?.digital_signature_date || '').trim(),
    )
    if (!hasConsent) {
      setError('Please complete the declarations, consents, and digital signature before submitting your bond application.')
      return
    }

    if (!Array.isArray(bondApplicationDraft.selected_banks) || bondApplicationDraft.selected_banks.length === 0) {
      setError('Select at least one bank before submitting your bond application.')
      return
    }

    await persistBondApplicationDraft(
      {
        ...bondApplicationDraft,
        status: 'Submitted',
      },
      { submitted: true },
    )
  }

  async function handleAcceptBondOffer(offer) {
    if (!offer?.id || !bondApplicationDraft) return

    const offerId = String(offer.id)
    const existingDeclinedIds = Array.isArray(bondApplicationDraft?.offers?.declined_offer_document_ids)
      ? bondApplicationDraft.offers.declined_offer_document_ids.map((value) => String(value)).filter(Boolean)
      : []
    const timestamp = new Date().toISOString()

    const nextDraft = {
      ...bondApplicationDraft,
      status: ['Not Started', 'Declined'].includes(bondApplicationDraft.status) ? 'In Progress' : bondApplicationDraft.status,
      offers: {
        ...(bondApplicationDraft.offers || {}),
        accepted_offer_document_id: offerId,
        accepted_bank: offer.bankName || 'Other',
        accepted_at: timestamp,
        decision_state: 'accepted',
        decision_offer_document_id: offerId,
        decision_at: timestamp,
        declined_offer_document_ids: existingDeclinedIds.filter((value) => value !== offerId),
      },
    }

    await persistBondApplicationDraft(nextDraft)
  }

  async function handleDeclineBondOffer(offer) {
    if (!offer?.id || !bondApplicationDraft) return

    const offerId = String(offer.id)
    const existingOffers = bondApplicationDraft?.offers || {}
    const existingDeclinedIds = Array.isArray(existingOffers.declined_offer_document_ids)
      ? existingOffers.declined_offer_document_ids.map((value) => String(value)).filter(Boolean)
      : []
    const declinedOfferDocumentIds = [...new Set([...existingDeclinedIds, offerId])]
    const currentAcceptedId = String(existingOffers.accepted_offer_document_id || '')
    const hasDifferentAcceptedOffer = Boolean(currentAcceptedId && currentAcceptedId !== offerId)
    const timestamp = new Date().toISOString()

    const nextOffers = {
      ...existingOffers,
      decision_state: hasDifferentAcceptedOffer ? 'accepted' : 'declined',
      decision_offer_document_id: hasDifferentAcceptedOffer ? currentAcceptedId : offerId,
      decision_at: timestamp,
      declined_offer_document_ids: declinedOfferDocumentIds,
    }

    if (currentAcceptedId === offerId) {
      nextOffers.accepted_offer_document_id = ''
      nextOffers.accepted_bank = ''
      nextOffers.accepted_at = ''
      nextOffers.signed_offer_document_id = ''
      nextOffers.signed_offer_uploaded_at = ''
    }

    const nextDraft = {
      ...bondApplicationDraft,
      status: hasDifferentAcceptedOffer ? bondApplicationDraft.status : 'Declined',
      offers: nextOffers,
    }

    await persistBondApplicationDraft(nextDraft)
  }

  async function handleUploadSignedBondOffer(file, offer) {
    if (!file || !bondApplicationDraft) return

    try {
      setBondApplicationSaving(true)
      setError('')
      const uploaded = await uploadClientPortalDocument({
        token,
        file,
        category: offer?.bankName ? `Bond Offer Signed - ${offer.bankName}` : 'Bond Offer Signed',
      })
      applyUploadedPortalDocument(uploaded)

      const nextDraft = {
        ...bondApplicationDraft,
        offers: {
          ...(bondApplicationDraft.offers || {}),
          accepted_offer_document_id:
            bondApplicationDraft?.offers?.accepted_offer_document_id || String(offer?.id || ''),
          accepted_bank: bondApplicationDraft?.offers?.accepted_bank || offer?.bankName || 'Other',
          accepted_at: bondApplicationDraft?.offers?.accepted_at || new Date().toISOString(),
          decision_state: 'accepted',
          decision_offer_document_id:
            bondApplicationDraft?.offers?.accepted_offer_document_id || String(offer?.id || ''),
          decision_at: new Date().toISOString(),
          declined_offer_document_ids: Array.isArray(bondApplicationDraft?.offers?.declined_offer_document_ids)
            ? bondApplicationDraft.offers.declined_offer_document_ids
                .map((value) => String(value))
                .filter((value) => value && value !== String(offer?.id || ''))
            : [],
          signed_offer_document_id: uploaded?.id ? String(uploaded.id) : bondApplicationDraft?.offers?.signed_offer_document_id || '',
          signed_offer_uploaded_at: new Date().toISOString(),
        },
      }

      const nextFormData = cloneMyDetailsFormData(portal?.onboardingFormData?.formData || {})
      nextFormData.bond_application = nextDraft
      await saveClientPortalOnboardingDraft({
        token,
        formData: nextFormData,
      })

      setBondApplicationDraft(nextDraft)
      setBondApplicationDirty(false)
      await loadPortal()
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to upload your signed offer right now.')
    } finally {
      setBondApplicationSaving(false)
    }
  }

  function handleDownloadOnboardingSummary() {
    try {
      setError('')
      const markup = buildOnboardingDocumentMarkup({
        portal,
        groupedOnboardingFields,
        purchasePriceLabel,
        onboardingStatus,
      })
      const blob = new Blob([markup], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const printWindow = window.open(url, '_blank', 'noopener,noreferrer')

      if (!printWindow) {
        setError('Unable to open the onboarding document. Please allow pop-ups and try again.')
        URL.revokeObjectURL(url)
        return
      }

      const cleanup = () => {
        window.setTimeout(() => URL.revokeObjectURL(url), 4000)
      }

      printWindow.addEventListener?.('load', () => {
        printWindow.focus()
        cleanup()
      })
    } catch (downloadError) {
      setError(downloadError.message || 'Unable to download onboarding information right now.')
    }
  }

  async function handleSubmitIssue(event) {
    event.preventDefault()
    const file = event.currentTarget.photo?.files?.[0] || null

    try {
      setSaving(true)
      setError('')
      await submitClientIssue({ token, ...issueForm, photoFile: file })
      setIssueForm({ category: ISSUE_CATEGORIES[0], description: '', location: '', priority: '' })
      event.currentTarget.reset()
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitAlteration(event) {
    event.preventDefault()
    const file = event.currentTarget.referenceImage?.files?.[0] || null

    try {
      setSaving(true)
      setError('')
      await submitAlterationRequest({ token, ...alterationForm, referenceImageFile: file })
      setAlterationForm({ title: '', category: '', description: '', budgetRange: '', preferredTiming: '' })
      event.currentTarget.reset()
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitReview(event) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      await submitServiceReview({ token, ...reviewForm })
      setReviewForm({
        rating: 5,
        reviewText: '',
        positives: '',
        improvements: '',
        allowMarketingUse: false,
      })
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitPortalComment(event) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      await submitClientPortalComment({
        token,
        commentText: commentDraft,
      })
      setCommentDraft('')
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadRequiredDocument(documentKey, file, options = {}) {
    if (!file) {
      return
    }

    const normalizedDocumentKey = normalizeDocumentKey(documentKey)
    const isReservationProofUpload =
      normalizedDocumentKey.includes('reservation') &&
      (normalizedDocumentKey.includes('proof') || normalizedDocumentKey.includes('payment'))

    try {
      setUploadingDocumentKey(options.uploadingKey || documentKey)
      setError('')
      if (isReservationProofUpload) {
        setReservationProofUploadFeedback({
          tone: 'loading',
          message: 'Uploading proof of payment...',
        })
      }
      const uploaded = effectiveWorkspace === 'seller'
        ? await uploadSellerClientPortalDocument({
            token,
            accessToken: sellerPortalAccessToken,
            file,
            requirementKey: documentKey,
            requirementInstanceId: options.requirementInstanceId || null,
            category: options.category || 'Seller Document',
            documentType: options.documentType || documentKey,
          })
        : await uploadClientPortalDocument({
            token,
            requiredDocumentKey: documentKey,
            category: options.category || (isReservationProofUpload ? 'Reservation Deposit / Proof of Payment' : 'Required Document'),
            documentType: isReservationProofUpload ? 'reservation_deposit_pop' : undefined,
            documentRequestId: options.documentRequestId || null,
            file,
          })
      applyUploadedPortalDocument(uploaded, { requiredDocumentKey: documentKey })
      if (isReservationProofUpload) {
        setReservationProofUploadFeedback({
          tone: 'success',
          message: 'Proof of payment received. Thank you.',
        })
      }
      void loadPortal({ background: true })
    } catch (uploadError) {
      if (effectiveWorkspace === 'seller' && isSellerPortalSessionExpiredError(uploadError)) {
        clearSellerPortalAccessToken(token)
        setSellerPortalAccessToken('')
        setSellerPortalAuth({
          authRequired: true,
          passwordSet: true,
          sessionExpired: true,
        })
        setError('')
        return
      }
      setError(uploadError.message)
      if (isReservationProofUpload) {
        setReservationProofUploadFeedback({
          tone: 'error',
          message: 'Upload failed. Please try again.',
        })
      }
    } finally {
      setUploadingDocumentKey('')
    }
  }

  function handleDocumentCentreUpload(uploadSpec, file) {
    if (!file || !uploadSpec || typeof uploadSpec !== 'object') return

    if (uploadSpec.type === 'additional_request') {
      const requestId = String(uploadSpec.requestId || '').trim()
      if (!requestId) return
      void handleUploadRequiredDocument(`additional_request_${requestId}`, file, {
        documentRequestId: requestId,
        category: 'Additional Requests',
      })
      return
    }

    if (uploadSpec.type === 'canonical_requirement') {
      const requirementInstanceId = String(uploadSpec.requirementInstanceId || '').trim()
      const requirementKey = String(uploadSpec.requirementKey || uploadSpec.documentDefinitionKey || '').trim()
      if (!requirementInstanceId || !requirementKey) return
      void handleUploadRequiredDocument(requirementKey, file, {
        requirementInstanceId,
        uploadingKey: requirementInstanceId,
        category: uploadSpec.category || 'Canonical Document Requirement',
        documentType: uploadSpec.documentType || requirementKey,
      })
      return
    }

    const requirementKey = String(uploadSpec.requirementKey || '').trim()
    if (!requirementKey) return
    void handleUploadRequiredDocument(requirementKey, file)
  }

  function handleActivityAction(item) {
    const route = String(item?.actionRoute || '').trim() || String(item?.to || '').trim()
    if (!route) return
    navigate(getPortalWorkspacePath(token, workspaceNavigationScope, route))
  }

  async function handleRespondToAppointment(appointment, action, options = {}) {
    const appointmentId = String(appointment?.appointmentId || appointment?.id || '').trim()
    if (!appointmentId) {
      setError('Appointment ID is missing.')
      return
    }

    const normalizedAction = String(action || '').trim().toLowerCase()
    const pendingKey = `${appointmentId}:${normalizedAction}`
    try {
      setError('')
      setAppointmentFeedback('')
      setAppointmentActionPending(pendingKey)
      const response = await respondToClientPortalAppointment({
        token,
        appointmentId,
        action: normalizedAction,
        clientRole: effectiveWorkspace === 'seller' ? 'seller' : 'buyer',
        preferredDateTime: options?.preferredDateTime || null,
        notes: options?.notes || '',
      })
      setAppointmentFeedback(
        normalizedAction === 'confirm'
          ? 'Appointment confirmed. Your transaction team has been updated.'
          : normalizedAction === 'decline'
            ? 'Appointment declined. Your transaction team has been updated.'
            : (Array.isArray(response?.suggestedSlots) && response.suggestedSlots.length
                ? `Reschedule request sent. ${response.suggestedSlots.length} alternative slots were shared with your transaction team.`
                : 'Reschedule request sent. The team will confirm a new time shortly.'),
      )
      await loadPortal({ background: true })
    } catch (responseError) {
      setError(responseError?.message || 'Unable to update appointment response right now.')
    } finally {
      setAppointmentActionPending('')
    }
  }

  async function handleUploadReservationDepositProof(file) {
    if (!file) {
      return
    }

    const uploadStateKey = reservationProofRequirement?.key || 'reservation_deposit_proof'

    try {
      setUploadingDocumentKey(uploadStateKey)
      setError('')
      setReservationProofUploadFeedback({
        tone: 'loading',
        message: 'Uploading proof of payment...',
      })
      const uploaded = await uploadClientPortalDocument({
        token,
        requiredDocumentKey: reservationProofRequirement?.key || null,
        category: 'Reservation Deposit / Proof of Payment',
        documentType: 'reservation_deposit_pop',
        file,
      })
      applyUploadedPortalDocument(uploaded, {
        requiredDocumentKey: reservationProofRequirement?.key || 'reservation_deposit_proof',
      })
      setReservationProofUploadFeedback({
        tone: 'success',
        message: 'Proof of payment received. Thank you.',
      })
      void loadPortal({ background: true })
    } catch (uploadError) {
      setError(uploadError.message)
      setReservationProofUploadFeedback({
        tone: 'error',
        message: 'Upload failed. Please try again.',
      })
    } finally {
      setUploadingDocumentKey('')
    }
  }

  async function handleOpenPortalDocument(document) {
    if (!document?.file_path && !document?.url) {
      return
    }

    try {
      setError('')
      setOpeningDocumentPath(String(document?.file_path || document?.url || document?.id || 'opening'))
      const openDirectUrl = Boolean(document?.openDirectUrl && document?.url)
      const signedUrl = openDirectUrl
        ? document.url
        : document?.file_path
        ? effectiveWorkspace === 'seller'
          ? await createSellerClientPortalDocumentSignedUrl({
              token,
              accessToken: sellerPortalAccessToken,
              filePath: document.file_path,
              expiresInSeconds: 60,
            })
          : await createClientPortalDocumentSignedUrl({
              token,
              filePath: document.file_path,
              fileBucket: document.file_bucket || document.bucket || '',
              expiresInSeconds: 60,
            })
        : document?.url
      if (!signedUrl) {
        throw new Error('Unable to open this document right now.')
      }
      window.open(signedUrl, '_blank', 'noopener,noreferrer')
    } catch (openError) {
      setError(openError.message || 'Unable to open this document right now.')
    } finally {
      setOpeningDocumentPath('')
    }
  }

  useEffect(() => {
    if (!portal?.handover) {
      return
    }

    setHandoverForm({
      handoverDate: portal.handover.handoverDate || '',
      electricityMeterReading: portal.handover.electricityMeterReading || '',
      waterMeterReading: portal.handover.waterMeterReading || '',
      gasMeterReading: portal.handover.gasMeterReading || '',
      inspectionCompleted: Boolean(portal.handover.inspectionCompleted),
      keysHandedOver: Boolean(portal.handover.keysHandedOver),
      remoteHandedOver: Boolean(portal.handover.remoteHandedOver),
      manualsHandedOver: Boolean(portal.handover.manualsHandedOver),
      notes: portal.handover.notes || '',
      signatureName: portal.handover.signatureName || portal.buyer?.name || '',
    })
  }, [portal])

  async function handleSubmitSellerAssistanceRequest(event) {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      setSellerRequestFeedback({ tone: '', message: '' })
      await submitClientSellerInterestRequest({
        token,
        propertyAddress: sellerRequestForm.propertyAddress,
        message: sellerRequestForm.message,
        preferredContactMethod: sellerRequestForm.preferredContactMethod,
      })
      setSellerRequestFeedback({
        tone: 'success',
        message: 'Request sent. Your agent has been notified and will contact you to start seller onboarding.',
      })
      setSellerRequestForm((previous) => ({ ...previous, message: '' }))
      await loadPortal({ background: true })
    } catch (submitError) {
      setError(submitError?.message || 'Unable to submit seller assistance request right now.')
      setSellerRequestFeedback({ tone: '', message: '' })
    } finally {
      setSaving(false)
    }
  }

  const financeTypeForPortal = normalizeFinanceType(
    portal?.onboardingFormData?.formData?.purchase_finance_type || portal?.transaction?.finance_type,
    { allowUnknown: true },
  )
  const isBondOrHybridTransaction =
    financeTypeForPortal === 'bond' || financeTypeForPortal === 'combination' || financeTypeForPortal === 'hybrid'
  const financeManagedByForPortal = resolvePortalFinanceManagedBy(portal)
  const isOriginatorManagedPortalFinance = isBondOrHybridTransaction && financeManagedByForPortal === 'bond_originator'

  const sectionEnabled = {
    overview: true,
    progress: true,
    appointments: true,
    offers: true,
    details: true,
    account: true,
    bond_application: isOriginatorManagedPortalFinance,
    documents: true,
    handover: true,
    snags: Boolean(portal?.settings?.snag_reporting_enabled),
    settings: true,
    team: true,
    alterations: Boolean(portal?.settings?.alteration_requests_enabled),
    review: Boolean(portal?.settings?.service_reviews_enabled),
  }

  const availableWorkspaces = Array.isArray(portal?.__workspaceRoles) && portal.__workspaceRoles.length
    ? portal.__workspaceRoles
    : ['buyer']
  const activeWorkspace = requestedWorkspace || availableWorkspaces[0] || 'buyer'
  const activeSection = sectionEnabled[requestedSection] ? requestedSection : 'overview'
  const hasSellingContext = Boolean(portal?.__hasSellingContext || availableWorkspaces.includes('seller'))
  const sellerContexts = Array.isArray(portal?.__portalContexts)
    ? portal.__portalContexts.filter((context) => normalizePortalContextType(context?.contextType || context?.context_type) === 'selling')
    : []
  const activeSellingContext = sellerContexts.find((context) => {
    const status = String(context?.status || '').trim().toLowerCase()
    return !status || status === 'active' || status === 'pending'
  }) || sellerContexts[0] || null
  const effectiveWorkspace = activeWorkspace === 'seller' && !hasSellingContext ? 'seller' : activeWorkspace
  const selectedJourney = effectiveWorkspace === 'seller' ? 'seller' : 'buyer'
  const canSwitchJourney = hasSellingContext
  const workspaceNavigationScope = effectiveWorkspace === 'seller' ? 'seller' : 'buyer'

  useEffect(() => {
    let active = true

    async function loadMatterAccounts() {
      if (!token || !portal?.transaction?.id) {
        setMatterAccountsState({
          accounts: [],
          summary: null,
          loading: false,
          error: '',
          unavailable: false,
          message: '',
        })
        return
      }

      try {
        setMatterAccountsState((previous) => ({
          ...previous,
          loading: true,
          error: '',
        }))
        const result = await fetchClientPortalMatterFinancialAccounts({
          token,
          workspace: effectiveWorkspace === 'seller' ? 'seller' : 'buyer',
        })
        if (!active) return
        setMatterAccountsState({
          accounts: result.accounts || [],
          summary: result.summary || null,
          loading: false,
          error: '',
          unavailable: result.unavailable === true,
          message: result.message || '',
        })
      } catch (accountError) {
        if (!active) return
        setMatterAccountsState({
          accounts: [],
          summary: null,
          loading: false,
          error: accountError?.message || 'Account details are not available right now.',
          unavailable: false,
          message: '',
        })
      }
    }

    void loadMatterAccounts()

    return () => {
      active = false
    }
  }, [effectiveWorkspace, portal?.transaction?.id, token])

  const handleUploadMatterAccountProof = useCallback(async ({ account, file, amount, paidOn, reference, notes, requestId } = {}) => {
    const accountId = account?.id || ''
    if (!accountId) {
      setMatterProofUploadFeedback({ accountId: '', tone: 'error', message: 'Choose the account this payment proof belongs to.' })
      return { ok: false }
    }
    if (!file) {
      setMatterProofUploadFeedback({ accountId, tone: 'error', message: 'Select a proof of payment file to upload.' })
      return { ok: false }
    }

    try {
      setUploadingMatterProofAccountId(accountId)
      setMatterProofUploadFeedback({ accountId, tone: '', message: '' })
      const result = await uploadClientPortalMatterFinancialProof({
        token,
        workspace: effectiveWorkspace === 'seller' ? 'seller' : 'buyer',
        accountId,
        file,
        amount,
        paidOn,
        reference,
        notes,
        requestId,
      })
      const refreshed = await fetchClientPortalMatterFinancialAccounts({
        token,
        workspace: effectiveWorkspace === 'seller' ? 'seller' : 'buyer',
      })
      setMatterAccountsState({
        accounts: refreshed.accounts || [],
        summary: refreshed.summary || null,
        loading: false,
        error: '',
        unavailable: refreshed.unavailable === true,
        message: refreshed.message || '',
      })
      setMatterProofUploadFeedback({
        accountId,
        tone: 'success',
        message: result?.message || 'Proof of payment uploaded for attorney review.',
      })
      return { ok: true }
    } catch (proofError) {
      setMatterProofUploadFeedback({
        accountId,
        tone: 'error',
        message: proofError?.message || 'Unable to upload this proof of payment right now.',
      })
      return { ok: false }
    } finally {
      setUploadingMatterProofAccountId('')
    }
  }, [effectiveWorkspace, token])

  const handleUploadMatterRequestDocument = useCallback(async ({ account, request, file, amount, documentDate, reference, notes } = {}) => {
    const accountId = account?.id || ''
    const requestId = request?.id || ''
    if (!accountId || !requestId) {
      setMatterRequestUploadFeedback({ requestId: requestId || '', tone: 'error', message: 'Choose the finance request you are submitting against.' })
      return { ok: false }
    }
    if (!file) {
      setMatterRequestUploadFeedback({ requestId, tone: 'error', message: 'Select the requested finance document to upload.' })
      return { ok: false }
    }

    try {
      setUploadingMatterRequestId(requestId)
      setMatterRequestUploadFeedback({ requestId, tone: '', message: '' })
      const result = await uploadClientPortalMatterFinancialRequestDocument({
        token,
        workspace: effectiveWorkspace === 'seller' ? 'seller' : 'buyer',
        accountId,
        requestId,
        file,
        amount,
        documentDate,
        reference,
        notes,
      })
      const refreshed = await fetchClientPortalMatterFinancialAccounts({
        token,
        workspace: effectiveWorkspace === 'seller' ? 'seller' : 'buyer',
      })
      setMatterAccountsState({
        accounts: refreshed.accounts || [],
        summary: refreshed.summary || null,
        loading: false,
        error: '',
        unavailable: refreshed.unavailable === true,
        message: refreshed.message || '',
      })
      setMatterRequestUploadFeedback({
        requestId,
        tone: 'success',
        message: result?.message || 'Document uploaded against the request for attorney review.',
      })
      return { ok: true }
    } catch (requestUploadError) {
      setMatterRequestUploadFeedback({
        requestId,
        tone: 'error',
        message: requestUploadError?.message || 'Unable to upload this requested finance document right now.',
      })
      return { ok: false }
    } finally {
      setUploadingMatterRequestId('')
    }
  }, [effectiveWorkspace, token])

  const handleJourneyChange = useCallback((value) => {
    if (value === 'seller' && !hasSellingContext) {
      navigate(getPortalWorkspacePath(token, 'seller', 'overview'))
      return
    }

    if (value === 'seller') {
      navigate(getPortalWorkspacePath(token, 'seller', 'overview'))
      return
    }

    navigate(getPortalWorkspacePath(token, 'buyer', 'overview'))
  }, [hasSellingContext, navigate, token])

  useEffect(() => {
    if (!portal) return
    if (effectiveWorkspace === 'seller') return
    if (requestedSection !== activeSection) {
      navigate(getPortalWorkspacePath(token, effectiveWorkspace === 'buyer' ? 'buyer' : 'buyer_explicit', 'overview'), { replace: true })
    }
  }, [activeSection, effectiveWorkspace, navigate, portal, requestedSection, token])

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f3f6fb] px-5 py-8 md:px-8">
        <section className="mx-auto max-w-[760px] rounded-[24px] border border-[#dbe5ef] bg-white px-6 py-7 text-center shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
          <h1 className="text-[1.2rem] font-semibold tracking-[-0.02em] text-[#142132]">Preparing your portal</h1>
          <p className="mt-2 text-sm leading-6 text-[#5f7288]">
            We are loading your transaction workspace and latest updates.
          </p>
        </section>
      </main>
    )
  }

  if (sellerPortalAuth?.authRequired) {
    return (
      <SellerPortalPasswordGate
        authState={sellerPortalAuth}
        form={sellerPortalPasswordForm}
        feedback={sellerPortalPasswordFeedback}
        notice={sellerPortalRecoveryNotice}
        saving={sellerPortalPasswordSaving}
        recoveryRequesting={sellerPortalRecoveryRequesting}
        onChange={handleSellerPortalPasswordChange}
        onRequestRecovery={handleSellerPortalRecoveryRequest}
        onSubmit={handleSellerPortalPasswordSubmit}
      />
    )
  }

  if (error || !portal) {
    return (
      <main className="min-h-screen bg-[#f3f6fb] px-5 py-8 md:px-8">
        <section className="mx-auto max-w-[760px] rounded-[24px] border border-[#f1d4cf] bg-white px-6 py-7 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
          <h1 className="text-[1.2rem] font-semibold tracking-[-0.02em] text-[#142132]">We could not load your client portal</h1>
          <p className="mt-2 text-sm leading-6 text-[#b42318]">
            {error || 'Your portal link may be invalid, expired, or temporarily unavailable.'}
          </p>
          <p className="mt-1 text-sm leading-6 text-[#5f7288]">
            Please retry now. If this continues, contact your property representative for a new secure link.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadPortal()}
              className="inline-flex min-h-[40px] items-center justify-center rounded-[12px] bg-[#2f5478] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#244463]"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex min-h-[40px] items-center justify-center rounded-[12px] border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
            >
              Go to Home
            </button>
          </div>
        </section>
      </main>
    )
  }

  const mainStage = portal.mainStage || getMainStageFromDetailedStage(portal.stage)
  const stageIndex = getMainStageIndex(mainStage)
  const progressPercent = Math.round(((stageIndex + 1) / MAIN_PROCESS_STAGES.length) * 100)
  const nextStageKey = stageIndex < MAIN_PROCESS_STAGES.length - 1 ? MAIN_PROCESS_STAGES[stageIndex + 1] : 'Completed'
  const nextStage = nextStageKey === 'Completed' ? 'Completed' : MAIN_STAGE_LABELS[nextStageKey]
  const sellerListingId = pickFirstText(
    activeSellingContext?.listingId,
    activeSellingContext?.listing_id,
    portal?.activeSellingContext?.listingId,
    portal?.activeSellingContext?.listing_id,
    portal?.unit?.id,
  )
  const localSellerOffers = (() => {
    if (!sellerListingId || typeof window === 'undefined') return []
    try {
      return getOffersForListing(sellerListingId)
    } catch {
      return []
    }
  })()
  const rawSellerOffers = [
    ...(Array.isArray(portal?.offers) ? portal.offers : []),
    ...(Array.isArray(portal?.activeSellingContext?.offers) ? portal.activeSellingContext.offers : []),
    ...(Array.isArray(activeSellingContext?.offers) ? activeSellingContext.offers : []),
    ...localSellerOffers,
  ]
  const sellerOfferItems = Array.from(
    new Map(
      rawSellerOffers
        .map((offer, index) => normalizeSellerOfferForDisplay(offer, index))
        .map((offer) => [String(offer.id || '').trim(), offer]),
    ).values(),
  )
  const activeSellerOfferCount = sellerOfferItems.filter((offer) =>
    !['rejected', 'withdrawn', 'expired'].includes(normalizeSellerPortalKey(offer.status)),
  ).length
  const sharedSellerPortalJourney =
    workspaceData?.sellerPortalJourney ||
    portal?.sellerPortalJourney ||
    portal?.activeSellingContext?.sellerPortalJourney ||
    activeSellingContext?.sellerPortalJourney ||
    null
  const fallbackSellerStageMeta = getSellerPortalStageMeta({
    ...(portal?.transaction || {}),
    portal,
    context: activeSellingContext,
    activeSellingContext,
    status: activeSellingContext?.status,
    mandateStatus: activeSellingContext?.mandateStatus || activeSellingContext?.mandate_status,
    mandatePacketState: activeSellingContext?.mandatePacket?.state || portal?.mandate?.packet?.state,
    sellerOnboardingStatus:
      activeSellingContext?.sellerOnboardingStatus ||
      activeSellingContext?.seller_onboarding_status ||
      portal?.onboarding?.status ||
      portal?.onboardingFormData?.status,
    listingStatus: activeSellingContext?.listingStatus || activeSellingContext?.listing_status || portal?.unit?.status,
    listingId: sellerListingId,
    hasListing: Boolean(sellerListingId || portal?.unit?.id),
    hasMandate: Boolean(activeSellingContext?.mandatePacketId || activeSellingContext?.mandate_packet_id || activeSellingContext?.mandatePacket || portal?.mandate?.packet),
    offers: sellerOfferItems,
    sellerOfferCount: activeSellerOfferCount,
    hasOffers: activeSellerOfferCount > 0,
  })
  const sellerStageMeta = sharedSellerPortalJourney?.stageMeta || fallbackSellerStageMeta
  const sellerCurrentStage = sellerStageMeta.currentStage.label
  const missingRequired = Math.max(
    Number(portal.requiredDocumentSummary?.totalRequired || 0) - Number(portal.requiredDocumentSummary?.uploadedCount || 0),
    0,
  )
  const financeProcess = portal?.subprocesses?.find((item) => item.process_type === 'finance') || null
  const transferProcess =
    portal?.subprocesses?.find((item) => item.process_type === 'transfer') ||
    portal?.subprocesses?.find((item) => item.process_type === 'attorney') ||
    null
  const bondProcess = portal?.subprocesses?.find((item) => item.process_type === 'bond') || null
  const attorneyProcess = transferProcess

  const workspaceSection = activeSection
  const isOverview = workspaceSection === 'overview'
  const isProgress = workspaceSection === 'progress'
  const isAppointments = workspaceSection === 'appointments'
  const isOffers = workspaceSection === 'offers'
  const isDetails = workspaceSection === 'details'
  const isAccount = workspaceSection === 'account'
  const isBondApplication = workspaceSection === 'bond_application'
  const isDocuments = workspaceSection === 'documents'
  const isHandover = workspaceSection === 'handover'
  const isSnags = workspaceSection === 'snags'
  const isSettings = workspaceSection === 'settings'
  const isTeam = workspaceSection === 'team'
  const isAlterations = workspaceSection === 'alterations'
  const isReview = workspaceSection === 'review'
  const hideSellerWorkspaceHeader = effectiveWorkspace === 'seller' && ['overview', 'progress', 'appointments', 'offers', 'documents', 'details', 'account'].includes(workspaceSection)

  const handoverStatus = portal?.handover?.status || 'not_started'
  const handoverCompleted = handoverStatus === 'completed'
  const onboardingFieldEntries = Object.entries(portal?.onboardingFormData?.formData || {})
    .filter(([key]) => !isOnboardingMetaKey(key))
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
  const groupedOnboardingFields = groupOnboardingFieldEntries(onboardingFieldEntries)
  const onboardingStatus = portal?.onboardingFormData?.status || 'In Progress'
  const purchasePriceValue = Number(portal?.transaction?.purchase_price || portal?.transaction?.sales_price || portal?.unit?.price || 0)
  const purchasePriceLabel = purchasePriceValue
    ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(purchasePriceValue)
    : '—'
  const myDetailsFallbackValues = {
    purchaser_type: portal?.transaction?.purchaser_type || portal?.onboardingFormData?.purchaserType || '',
    purchaser_entity_type: portal?.onboardingFormData?.formData?.purchaser_entity_type || '',
    purchase_finance_type: portal?.transaction?.finance_type || '',
    purchase_price: purchasePriceValue > 0 ? String(purchasePriceValue) : '',
  }
  const myDetailsSections = (() => {
    const purchaserEntityType = String(
      resolveMyDetailsFieldValue(myDetailsDraft, 'purchaser_entity_type') || myDetailsFallbackValues.purchaser_entity_type || '',
    )
      .trim()
      .toLowerCase()

    return MY_DETAILS_SECTIONS.map((section) => {
      let sectionFieldConfig = section.fields
      if (section.key === 'legal_entity_details') {
        if (purchaserEntityType === 'company') {
          sectionFieldConfig = section.fields.filter((field) => MY_DETAILS_COMPANY_FIELDS.has(field.key))
        } else if (purchaserEntityType === 'trust') {
          sectionFieldConfig = section.fields.filter((field) => MY_DETAILS_TRUST_FIELDS.has(field.key))
        } else {
          sectionFieldConfig = section.fields.filter((field) =>
            isMyDetailsValueFilled(resolveMyDetailsFieldValue(myDetailsDraft, field.key)),
          )
        }
      }

      if (!sectionFieldConfig.length) {
        return null
      }

      const fields = sectionFieldConfig.map((field) => {
        const initialValue = resolveMyDetailsFieldValue(myDetailsDraft, field.key)
        const value = isMyDetailsValueFilled(initialValue) ? initialValue : myDetailsFallbackValues[field.key] || ''
        const baseOptions = Array.isArray(field.options) ? [...field.options] : null
        if (baseOptions && isMyDetailsValueFilled(value) && !baseOptions.some((item) => String(item.value) === String(value))) {
          baseOptions.push({ value: String(value), label: toTitleLabel(String(value)) })
        }
        return {
          ...field,
          value,
          options: baseOptions,
        }
      })

      const requiredFields = fields.filter((field) => field.required)
      const requiredCompleteCount = requiredFields.filter((field) => isMyDetailsValueFilled(field.value)).length
      const requiredTotalCount = requiredFields.length
      const capturedCount = fields.filter((field) => isMyDetailsValueFilled(field.value)).length
      const complete = requiredTotalCount === 0 ? capturedCount > 0 : requiredCompleteCount === requiredTotalCount
      const inProgress = !complete && capturedCount > 0

      return {
        ...section,
        fields,
        capturedCount,
        requiredCompleteCount,
        requiredTotalCount,
        complete,
        inProgress,
      }
    }).filter(Boolean)
  })()
  const myDetailsRequiredTotal = myDetailsSections.reduce((sum, section) => sum + section.requiredTotalCount, 0)
  const myDetailsRequiredCompleted = myDetailsSections.reduce((sum, section) => sum + section.requiredCompleteCount, 0)
  const myDetailsCompletionPercent = myDetailsRequiredTotal > 0
    ? Math.round((myDetailsRequiredCompleted / myDetailsRequiredTotal) * 100)
    : 0
  const myDetailsCapturedFields = myDetailsSections.reduce((sum, section) => sum + section.capturedCount, 0)
  const myDetailsFieldCount = myDetailsSections.reduce((sum, section) => sum + section.fields.length, 0)
  const portalRequiredDocuments = portal?.requiredDocuments || []
  const visiblePortalRequiredDocuments = portalRequiredDocuments.filter((document) => !isInformationSheetDocument(document))
  const reservationRequiredFromOnboarding = isTruthyPortalValue(
    portal?.onboardingFormData?.formData?.reservation_required,
  )
  const reservationRequiredForClient = Boolean(portal?.transaction?.reservation_required || reservationRequiredFromOnboarding)
  const reservationPaymentDetails =
    portal?.transaction?.reservation_payment_details &&
    typeof portal.transaction.reservation_payment_details === 'object'
      ? portal.transaction.reservation_payment_details
      : {}
  const reservationPaymentInstructions = reservationPaymentDetails?.payment_instructions || ''
  const reservationAmountLabel =
    portal?.transaction?.reservation_amount === null || portal?.transaction?.reservation_amount === undefined
      ? 'Amount pending'
      : ZAR_CURRENCY.format(Number(portal.transaction.reservation_amount) || 0)
  const reservationStatus = normalizePortalStatus(portal?.transaction?.reservation_status || '')
  const reservationAmountTypeLabel = getReservationAmountTypeLabel(
    portal?.transaction?.reservation_amount_type || portal?.transaction?.reservationAmountType,
  )
  const reservationTreatmentLabel = getReservationTreatmentLabel(
    portal?.transaction?.reservation_treatment || portal?.transaction?.reservationTreatment,
  )
  const reservationTreatmentDescription = getReservationTreatmentDescription(
    portal?.transaction?.reservation_treatment || portal?.transaction?.reservationTreatment,
  )
  const reservationPayableToLabel = getReservationPayableToLabel(
    portal?.transaction?.reservation_payable_to || portal?.transaction?.reservationPayableTo,
  )
  const defaultAlterationChargeTreatment = normalizePortalAlterationChargeTreatment(
    portal?.transaction?.alteration_charge_treatment ||
      portal?.transaction?.alterationChargeTreatment ||
      portal?.settings?.default_alteration_charge_treatment ||
      portal?.settings?.defaultAlterationChargeTreatment,
  )
  const defaultAlterationChargeTreatmentLabel = getAlterationChargeTreatmentLabel(defaultAlterationChargeTreatment)
  const defaultAlterationChargeTreatmentDescription = getAlterationChargeTreatmentDescription(defaultAlterationChargeTreatment)
  const alterationRequestItems = Array.isArray(portal?.alterations) ? portal.alterations : []
  const alterationIncludedTotal = alterationRequestItems
    .filter((item) => normalizePortalAlterationChargeTreatment(item?.charge_treatment || item?.chargeTreatment || defaultAlterationChargeTreatment) === 'included_in_purchase_price')
    .reduce((sum, item) => sum + (Number(item?.amount_inc_vat) || 0), 0)
  const alterationSeparateInvoiceTotal = alterationRequestItems
    .filter((item) => normalizePortalAlterationChargeTreatment(item?.charge_treatment || item?.chargeTreatment || defaultAlterationChargeTreatment) === 'separate_invoice')
    .reduce((sum, item) => sum + (Number(item?.amount_inc_vat) || 0), 0)
  const groupedPortalRequiredDocuments = groupPortalRequiredDocuments(visiblePortalRequiredDocuments)
  const sharedPortalDocuments = (portal?.documents || []).filter((document) => String(document.uploaded_by_role || '').toLowerCase() !== 'client')
  const portalDocumentLookupRows = [
    ...(Array.isArray(portal?.documents) ? portal.documents : []),
    ...(Array.isArray(workspaceData?.documentCenter?.uploadedDocuments) ? workspaceData.documentCenter.uploadedDocuments : []),
  ]
  const portalDocumentsById = new Map()
  portalDocumentLookupRows.forEach((document) => {
    ;[
      document?.id,
      document?.file_path,
      document?.storage_path,
      document?.url,
      document?.file_url,
    ].forEach((key) => {
      const normalizedKey = String(key || '').trim()
      if (normalizedKey) portalDocumentsById.set(normalizedKey, document)
    })
  })
  const documentPurchaserType = resolvePurchaserTypeForDocuments(portal)
  const documentTransactionType = resolveTransactionTypeForDocuments(portal)
  const documentMaritalRegime = resolveClientMaritalRegime(portal?.onboardingFormData?.formData || {})
  const legacyFicaRequirementsTemplate = getFicaRequirementTemplate({
    transactionType: documentTransactionType,
    purchaserType: documentPurchaserType,
    maritalRegime: documentMaritalRegime,
  })
  const buyerRequirementProfile = portal?.buyerRequirementProfile || null
  const buyerRequirementType = String(buyerRequirementProfile?.buyerType || documentPurchaserType || 'individual').trim().toLowerCase()
  const buyerRequirementFinanceType = String(buyerRequirementProfile?.financeType || portal?.transaction?.finance_type || 'cash').trim().toLowerCase()
  const buyerRequirementMissing = Number(portal?.missingBuyerRequirements?.totalMissingCritical || 0)
  const buyerRequirementOutstanding = buyerRequirementMissing > 0
  const buyerRequirementGuidance =
    buyerRequirementType === 'trust'
      ? 'Because this purchase is being made by a trust, we need trust deed, letters of authority, trustee IDs, and trust resolution records.'
      : buyerRequirementType === 'company'
        ? 'Because this purchase is being made by a company, we need company registration, authority resolution, and director/signatory records.'
        : 'We need your personal FICA documents and any marital documents that apply to your situation.'
  const buyerRequirementFinanceGuidance =
    buyerRequirementFinanceType === 'bond'
      ? financeManagedByForPortal === 'bond_originator'
        ? 'Because this is a bond purchase, bond application and approval documents are required.'
        : 'Because you are arranging bond finance directly, upload your approval, bank confirmation, or lender support documents.'
      : buyerRequirementFinanceType === 'combination' || buyerRequirementFinanceType === 'hybrid'
        ? financeManagedByForPortal === 'bond_originator'
          ? 'Because this is a hybrid purchase, both proof of funds for the cash portion and bond documents are required.'
          : 'Because this is a hybrid purchase, upload proof of funds for the cash portion and approval or support documents for your direct finance.'
        : 'Because this is a cash purchase, proof of funds is required.'
  const buyerRequirementFlowSummary = buyerRequirementProfile?.branchSummary
    ? [
        buyerRequirementProfile.branchSummary.purchaser?.label
          ? `Buyer: ${buyerRequirementProfile.branchSummary.purchaser.label}`
          : null,
        buyerRequirementProfile.branchSummary.purchase_mode?.label
          ? `Purchase: ${buyerRequirementProfile.branchSummary.purchase_mode.label}`
          : null,
        buyerRequirementProfile.branchSummary.finance?.label
          ? `Finance: ${buyerRequirementProfile.branchSummary.finance.label}`
          : null,
        buyerRequirementProfile.branchSummary.finance?.support_mode?.label
          ? `Support: ${buyerRequirementProfile.branchSummary.finance.support_mode.label}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  const salesRequiredDocuments = groupedPortalRequiredDocuments.sales
  const ficaRequiredDocuments = groupedPortalRequiredDocuments.fica
  const bondRequiredDocuments = groupedPortalRequiredDocuments.bond
  const additionalRequestDocuments = groupedPortalRequiredDocuments.additional
  const additionalDocumentRequests = Array.isArray(portal?.additionalDocumentRequests)
    ? portal.additionalDocumentRequests
    : []
  const additionalDocumentRequestsForWorkspace = additionalDocumentRequests
    .filter((request) => {
      const assignedToRole = String(request?.assignedToRole || '').trim().toLowerCase()
      const fallbackClientVisible = ['client', 'buyer', 'seller'].includes(assignedToRole)
      if (!request?.clientVisible && !fallbackClientVisible) return false
      const requestedFrom = String(request?.requestedFrom || '').trim().toLowerCase()
      if (effectiveWorkspace === 'seller') {
        return requestedFrom === 'seller' || requestedFrom === 'buyer_and_seller'
      }
      return requestedFrom === 'buyer' || requestedFrom === 'buyer_and_seller'
    })
    .reduce((accumulator, request) => {
      const key = String(request?.id || '').trim() || `${request?.title || 'request'}-${request?.createdAt || ''}`
      if (!key) return accumulator
      if (accumulator.seen.has(key)) return accumulator
      accumulator.seen.add(key)
      accumulator.items.push(request)
      return accumulator
    }, { items: [], seen: new Set() })
    .items
  const salesSharedDocuments = sharedPortalDocuments.filter((document) => getPortalDocumentWorkspaceCategory(document) === 'sales')
  const bondSharedDocuments = sharedPortalDocuments.filter((document) => getPortalDocumentWorkspaceCategory(document) === 'bond')
  const additionalSharedDocuments = sharedPortalDocuments.filter((document) => getPortalDocumentWorkspaceCategory(document) === 'additional')
  const propertySharedDocuments = sharedPortalDocuments.filter((document) => getPortalDocumentWorkspaceCategory(document) === 'property')
  const reservationProofRequirement =
    salesRequiredDocuments.find((item) => normalizeDocumentKey(item?.key) === 'reservation_deposit_proof') ||
    salesRequiredDocuments.find((item) => isReservationDocument(item) && /proof|payment/.test(getDocumentSearchBlob(item))) ||
    salesRequiredDocuments.find((item) => isReservationDocument(item)) ||
    null
  const reservationProofUploadedDocument = reservationProofRequirement?.uploadedDocumentId
    ? portalDocumentsById.get(String(reservationProofRequirement.uploadedDocumentId))
    : null
  const reservationProofDocumentByType =
    (portal?.documents || []).find(
      (document) => normalizeDocumentKey(document?.document_type) === 'reservation_deposit_pop',
    ) ||
    (portal?.documents || []).find((document) => {
      const source = getDocumentSearchBlob(document)
      const filePath = String(document?.file_path || '').toLowerCase()
      return (
        source.includes('reservation') &&
        (source.includes('proof') || source.includes('payment') || source.includes('pop')) &&
        filePath.includes(`client-portal/${String(portal?.transaction?.id || '').toLowerCase()}/`)
      )
    }) ||
    null
  const reservationProofFallbackUploadedDocument =
    reservationProofUploadedDocument ||
    reservationProofDocumentByType ||
    (portal?.documents || []).find(
      (document) =>
        isReservationDocument(document) &&
        /proof|payment|pop/.test(getDocumentSearchBlob(document)),
    ) ||
    null
  const reservationProofUploadStateKey = reservationProofRequirement?.key || 'reservation_deposit_proof'
  const reservationProofUploaded =
    Boolean(
      reservationProofRequirement?.complete ||
      reservationProofFallbackUploadedDocument?.id ||
      reservationProofFallbackUploadedDocument?.file_path ||
      reservationStatus === 'paid' ||
      reservationStatus === 'verified',
    )
  const reservationProofIsUploading = uploadingDocumentKey === reservationProofUploadStateKey
  const reservationProofFileName = String(reservationProofFallbackUploadedDocument?.name || '').trim()
  const reservationProofUploadedAt =
    reservationProofFallbackUploadedDocument?.created_at ||
    reservationProofFallbackUploadedDocument?.uploaded_at ||
    portal?.transaction?.reservation_proof_uploaded_at ||
    ''
  const reservationProofStatusLabel =
    reservationStatus === 'rejected'
      ? 'Rejected - Reupload required'
      : reservationProofIsUploading
        ? 'Uploading'
        : reservationProofUploaded || reservationStatus === 'verified'
          ? 'Payment Received'
          : 'Awaiting Proof of Payment'
  const showReservationDepositUploadCard =
    reservationRequiredForClient &&
    (reservationStatus === 'rejected' || !reservationProofUploaded)
  const showReservationDepositCompletedCard =
    reservationRequiredForClient &&
    !showReservationDepositUploadCard &&
    Boolean(
      reservationProofUploaded ||
      reservationProofFallbackUploadedDocument?.file_path ||
      reservationProofFallbackUploadedDocument?.url,
    )
  const reservationRejectedNote = reservationStatus === 'rejected'
    ? String(
      portal?.transaction?.reservation_review_notes ||
      portal?.transaction?.reservation_review_note ||
      '',
    ).trim()
    : ''
  const reservationProofUploadFeedbackClasses =
    reservationProofUploadFeedback.tone === 'success'
      ? 'border-[#cde4d5] bg-[#edf8f1] text-[#2f7a51]'
      : reservationProofUploadFeedback.tone === 'error'
        ? 'border-[#f1cbc7] bg-[#fff5f4] text-[#b42318]'
        : reservationProofUploadFeedback.tone === 'loading'
          ? 'border-[#d8e4ef] bg-[#f4f8fc] text-[#35546c]'
          : ''
  const bondApplicationData = bondApplicationDraft || buildBondApplicationDraft(portal)
  const bondApplicationStatus = resolveBondApplicationStatus(bondApplicationData?.status)
  const bondApplicationStatusClasses =
    bondApplicationStatus === 'Submitted' || bondApplicationStatus === 'Under Review'
      ? 'border-[#d8e4ef] bg-[#f4f8fc] text-[#35546c]'
      : bondApplicationStatus === 'Approved'
        ? 'border-[#cfe3d7] bg-[#eef8f1] text-[#2f7a51]'
        : bondApplicationStatus === 'Declined'
          ? 'border-[#f1d8d0] bg-[#fff5f2] text-[#b5472d]'
          : 'border-[#e1e9f2] bg-[#fbfdff] text-[#64748b]'
  const bondApplicants = Array.isArray(bondApplicationData?.applicants) ? bondApplicationData.applicants : []
  const bondOfferDocuments = bondSharedDocuments
    .filter((document) => {
      const source = `${document?.category || ''} ${document?.name || ''}`.toLowerCase()
      return /bond/.test(source) && /offer|approval/.test(source) && !/signed/.test(source)
    })
    .map((document) => ({
      id: String(document.id),
      name: document.name || 'Bond offer',
      category: document.category || 'Bond Offer',
      bankName: extractBondBankName(`${document.category || ''} ${document.name || ''}`),
      uploadedAt: document.created_at || '',
      status: 'Uploaded',
      downloadUrl: document.url || '',
    }))
  const bondOfferDecisionState = normalizeBondOfferDecisionState(
    bondApplicationData?.offers?.decision_state || bondApplicationData?.offers?.decisionState,
  )
  const bondOfferDecisionDocumentId = String(
    bondApplicationData?.offers?.decision_offer_document_id ||
      bondApplicationData?.offers?.decisionOfferDocumentId ||
      '',
  )
  const persistedAcceptedBondOfferId = String(bondApplicationData?.offers?.accepted_offer_document_id || '')
  const acceptedBondOfferId =
    bondOfferDecisionState === 'declined' && bondOfferDecisionDocumentId === persistedAcceptedBondOfferId
      ? ''
      : persistedAcceptedBondOfferId
  const declinedBondOfferIds = new Set(
    [
      ...(Array.isArray(bondApplicationData?.offers?.declined_offer_document_ids)
        ? bondApplicationData.offers.declined_offer_document_ids
        : []),
      ...(bondOfferDecisionState === 'declined' && bondOfferDecisionDocumentId ? [bondOfferDecisionDocumentId] : []),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )
  const acceptedBondOffer = acceptedBondOfferId
    ? bondOfferDocuments.find((offer) => String(offer.id) === acceptedBondOfferId) || null
    : null
  const signedBondOfferDocuments = (portal?.documents || []).filter((document) => {
    const source = `${document?.category || ''} ${document?.name || ''}`.toLowerCase()
    return /bond/.test(source) && /offer/.test(source) && /signed|accept/.test(source)
  })
  const signedAcceptedOfferDocument =
    signedBondOfferDocuments.find((document) => String(document.id) === String(bondApplicationData?.offers?.signed_offer_document_id || '')) ||
    signedBondOfferDocuments[0] ||
    null
  const hasSignedAcceptedOfferDocument = hasPersistedPortalDocument(signedAcceptedOfferDocument)
  const bondGrantDocuments = bondSharedDocuments.filter((document) => {
    const source = `${document?.category || ''} ${document?.name || ''}`.toLowerCase()
    return /bond/.test(source) && /grant|final approval|instruction/.test(source)
  })
  const bondOfferIds = new Set(bondOfferDocuments.map((item) => String(item.id)))
  const bondGrantIds = new Set(bondGrantDocuments.map((item) => String(item.id)))
  const bondSupportingSharedDocuments = bondSharedDocuments.filter((document) => {
    const documentId = String(document?.id || '')
    if (bondOfferIds.has(documentId) || bondGrantIds.has(documentId)) {
      return false
    }
    return true
  })
  const bondSupportingDocumentsEmptyText = isOriginatorManagedPortalFinance
    ? 'No bond supporting documents are active right now.'
    : 'No external finance supporting documents are active right now.'
  const bondSupportingDocumentsSummaryText = isOriginatorManagedPortalFinance
    ? 'Bond-related supporting documents and lender offers for this transaction.'
    : 'Approval letters, bank confirmations, and supporting documents for finance you are arranging directly.'
  const lenderOffersIntroText = isOriginatorManagedPortalFinance
    ? 'Your bond originator will upload lender offers here. Select one offer to proceed and upload your signed copy.'
    : 'Upload or review lender approvals and finance offers from your bank or external finance provider.'
  const lenderOffersEmptyText = isOriginatorManagedPortalFinance
    ? 'No lender offers uploaded yet. Your bond originator will add offers as they are received.'
    : 'No lender offers or approval letters have been uploaded yet.'
  const salesOtpRequiredDocuments = salesRequiredDocuments.filter((document) => isOtpDocument(document))
  const salesOtherRequiredDocuments = salesRequiredDocuments.filter((document) => !isOtpDocument(document) && !isReservationDocument(document))
  const otpPrimaryRequirement =
    salesOtpRequiredDocuments.find((document) => /sign|signed|signature/.test(getDocumentSearchBlob(document))) ||
    salesOtpRequiredDocuments[0] ||
    null
  const otpSharedDocuments = salesSharedDocuments.filter((document) => isOtpDocument(document))
  const otpPrimarySharedDocument = otpSharedDocuments[0] || null
  const otpUploadedDocument = otpPrimaryRequirement?.uploadedDocumentId
    ? portalDocumentsById.get(String(otpPrimaryRequirement.uploadedDocumentId))
    : null
  const otpHasUploadedDocument = hasPersistedPortalDocument(otpUploadedDocument)
  const otpRejected = salesOtpRequiredDocuments.some((document) => {
    const status = normalizePortalStatus(document?.requiredDocumentStatus || document?.status || '')
    return status.includes('reject')
  })
  const otpApprovedFromShared = otpSharedDocuments.some((document) =>
    /approved|final|signed/i.test(`${document?.category || ''} ${document?.name || ''}`),
  )
  const otpApprovedFromStage = normalizePortalStatus(portal?.transaction?.stage || '').includes('otp_signed')
  const otpPacketState = String(portal?.otpPacket?.state || '').trim().toLowerCase()
  const otpPacketSignPath = String(portal?.otpPacket?.signPath || '').trim()
  const otpPacketFinalSignedFilePath = String(portal?.otpPacket?.finalSignedFilePath || '').trim()
  const otpPacketFinalSignedFileName = String(portal?.otpPacket?.finalSignedFileName || 'Signed OTP').trim()
  const otpPacketGeneratedPreviewFilePath = String(portal?.otpPacket?.generatedPreviewFilePath || '').trim()
  const otpPacketGeneratedPreviewFileName = String(portal?.otpPacket?.generatedPreviewFileName || 'Offer to Purchase (OTP)').trim()
  const otpPacketUsingStructuredFlow = Boolean(portal?.otpPacket?.packet?.id) || [
    'not_generated',
    'preparing',
    'generated_not_ready',
    'ready_for_client_signature',
    'awaiting_other_signatures',
    'fully_signed',
  ].includes(otpPacketState)
  const otpStatusLabel = otpPacketUsingStructuredFlow
    ? (
      otpPacketState === 'fully_signed'
        ? 'Signed'
        : otpPacketState === 'awaiting_other_signatures'
          ? 'Awaiting signatures'
          : otpPacketState === 'ready_for_client_signature'
            ? 'Ready to sign'
            : otpPacketState === 'generated_not_ready' || otpPacketState === 'preparing'
              ? 'Preparing'
              : 'Not available'
    )
    : (
      !otpPrimaryRequirement && !otpPrimarySharedDocument
        ? 'Not available'
        : otpRejected
          ? 'Rejected'
          : otpApprovedFromShared || otpApprovedFromStage
            ? 'Approved'
            : otpPrimaryRequirement?.complete || otpHasUploadedDocument
              ? 'Uploaded'
              : 'Awaiting signature'
    )
  const mandatePacket = activeSellingContext?.mandatePacket || null
  const mandatePacketState = String(mandatePacket?.state || '').trim().toLowerCase()
  const mandatePacketSignPath = String(mandatePacket?.signPath || '').trim()
  const mandatePacketFinalSignedFilePath = String(mandatePacket?.finalSignedFilePath || '').trim()
  const mandatePacketFinalSignedFileName = String(mandatePacket?.finalSignedFileName || 'Signed Mandate').trim()
  const mandatePacketFinalSignedDownloadUrl = String(mandatePacket?.finalSignedDownloadUrl || '').trim()
  const mandatePacketGeneratedPreviewFilePath = String(mandatePacket?.generatedPreviewFilePath || '').trim()
  const mandatePacketGeneratedPreviewFileName = String(mandatePacket?.generatedPreviewFileName || 'Mandate').trim()
  const mandatePacketUsingStructuredFlow = effectiveWorkspace === 'seller'
    && (
      Boolean(mandatePacket?.packet?.id) ||
      ['not_generated', 'preparing', 'generated_not_ready', 'ready_for_client_signature', 'awaiting_other_signatures', 'fully_signed'].includes(mandatePacketState)
    )
  const mandateStatusLabel = mandatePacketUsingStructuredFlow
    ? (
      mandatePacketState === 'fully_signed'
        ? 'Signed'
        : mandatePacketState === 'awaiting_other_signatures'
          ? 'Awaiting signatures'
          : mandatePacketState === 'ready_for_client_signature'
            ? 'Ready to sign'
            : mandatePacketState === 'generated_not_ready' || mandatePacketState === 'preparing'
              ? 'Preparing'
              : 'Not available'
    )
    : 'Not available'
  const salesOtherSharedDocuments = salesSharedDocuments.filter((document) => !isOtpDocument(document) && !isReservationDocument(document))
  const bondApplicationHeaderApplicants = bondApplicants
    .map((applicant) => `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim())
    .filter(Boolean)
  const bondApplicationApplicantHeader =
    bondApplicationHeaderApplicants.length > 0 ? bondApplicationHeaderApplicants.join(' & ') : portal?.buyer?.name || 'Client'
  const bondApplicationRequiredDocuments = visiblePortalRequiredDocuments.filter((document) => {
    const source = `${document.key || ''} ${document.label || ''} ${document.description || ''}`.toLowerCase()
    return /bond|bank|payslip|income|statement|id|address|fica|credit/.test(source)
  })
  const requirementProfileFicaDocuments = (portal?.clientVisibleBuyerRequirements || [])
    .filter((item) => String(item?.groupKey || '').trim().toLowerCase() === 'buyer_fica')
    .map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description || '',
      required: String(item?.requirementLevel || 'required').trim().toLowerCase() !== 'optional_required',
    }))
  const effectiveFicaRequirementsTemplate = requirementProfileFicaDocuments.length
    ? requirementProfileFicaDocuments
    : legacyFicaRequirementsTemplate
  const resolvedFicaRequirements = effectiveFicaRequirementsTemplate.map((requirement) => ({
    ...requirement,
    ...resolveFicaRequirementStatus(requirement, ficaRequiredDocuments, portalDocumentsById),
  }))
  const salesTabBuyerCount = ((showReservationDepositUploadCard || showReservationDepositCompletedCard) ? 1 : 0) + 1 + salesOtherRequiredDocuments.length + salesOtherSharedDocuments.length
  const salesTabSellerCount = 1 + salesOtherRequiredDocuments.length + salesOtherSharedDocuments.length
  const documentTabCountByKey = {
    sales: effectiveWorkspace === 'seller' ? salesTabSellerCount : salesTabBuyerCount,
    fica: resolvedFicaRequirements.length,
    bond: bondRequiredDocuments.length + bondSupportingSharedDocuments.length + bondOfferDocuments.length + bondGrantDocuments.length,
    additional: additionalRequestDocuments.length + additionalDocumentRequestsForWorkspace.length + additionalSharedDocuments.length,
    property: propertySharedDocuments.length,
  }
  const documentTabs = CLIENT_DOCUMENT_TABS
    .filter((tab) => {
      if (effectiveWorkspace === 'seller') {
        return ['sales', 'additional', 'property'].includes(tab.key)
      }
      if (tab.key === 'bond') return isBondOrHybridTransaction
      return true
    })
    .map((tab) => ({ ...tab, count: Number(documentTabCountByKey[tab.key] || 0) }))
  const hasDocumentsTab = documentTabs.some((tab) => tab.key === activeDocumentsTab)
  const activeDocumentsTabKey = hasDocumentsTab ? activeDocumentsTab : (documentTabs[0]?.key || 'sales')
  const occupationalRent = portal?.occupationalRent || null
  const occupationalRentProofDocument =
    (portal?.documents || []).find((item) =>
      /occupational rent|occupation rent/i.test(`${item?.category || ''} ${item?.name || ''}`) &&
      /proof of payment/i.test(`${item?.category || ''} ${item?.name || ''}`),
    ) || null
  const snagOpenCount = (portal?.issues || []).filter((item) => !['resolved', 'closed', 'completed'].includes(String(item.status || '').toLowerCase()))
    .length
  const snagResolvedCount = Math.max((portal?.issues || []).length - snagOpenCount, 0)
  const latestUpdates = Array.isArray(workspaceData?.activityFeed) && workspaceData.activityFeed.length
    ? workspaceData.activityFeed.slice(0, 8)
    : (portal?.discussion || []).slice(0, 5)
  const activityFeedSummary = workspaceData?.activityFeedSummary || {}
  const latestUpdatesSubtitle = (() => {
    const actionRequired = Number(activityFeedSummary?.actionRequired || 0)
    const overdue = Number(activityFeedSummary?.overdue || 0)
    const dueSoon = Number(activityFeedSummary?.dueSoon || 0)
    if (overdue > 0) return `${overdue} overdue item${overdue === 1 ? '' : 's'} need attention.`
    if (actionRequired > 0) return `${actionRequired} update${actionRequired === 1 ? '' : 's'} need your attention.`
    if (dueSoon > 0) return `${dueSoon} document reminder${dueSoon === 1 ? '' : 's'} due soon.`
    return 'Latest progress from your transaction team.'
  })()
  const latestJourneyUpdates = latestUpdates.map((item) => buildClientFacingUpdate(item))
  const latestJourneyFeedItems = latestUpdates.map((item, index) => buildClientJourneyFeedItem(item, index))
  const otpSignaturePending = portalRequiredDocuments.some((item) => {
    if (item.complete) return false
    const haystack = `${item.key || ''} ${item.label || ''} ${item.description || ''}`.toLowerCase()
    return /otp|offer to purchase/.test(haystack) && /sign|signature|signed/.test(haystack)
  })
  const uploadedRequiredDocuments = Number(portal.requiredDocumentSummary?.uploadedCount || 0)
  const onboardingComplete = isClientOnboardingComplete(onboardingStatus)
  const buyerPortalAccessMethod = 'Secure link'
  const buyerPortalAccessDescription =
    'This buyer portal opens from your private transaction link. You do not need to create a password for this buyer workspace.'
  const buyerPortalStatusItems = [
    {
      key: 'access',
      label: 'Portal access',
      value: 'Link active',
      detail: buyerPortalAccessMethod,
      tone: 'complete',
    },
    {
      key: 'onboarding',
      label: 'Onboarding',
      value: onboardingComplete ? 'Complete' : toTitleLabel(onboardingStatus || 'In progress'),
      detail: onboardingComplete ? 'Buyer profile received' : 'Buyer details still need attention',
      tone: onboardingComplete ? 'complete' : 'action',
    },
    {
      key: 'documents',
      label: 'Documents',
      value: missingRequired > 0 ? `${missingRequired} outstanding` : 'Ready',
      detail: missingRequired > 0 ? 'Uploads are still required' : 'No required uploads outstanding',
      tone: missingRequired > 0 ? 'action' : 'complete',
    },
    isBondOrHybridTransaction
      ? {
          key: 'bond',
          label: 'Bond application',
          value: bondApplicationStatus,
          detail:
            bondApplicationStatus === 'Submitted'
              ? 'Submitted to the transaction workspace'
              : bondApplicationStatus === 'Not Started'
                ? 'Available when ready'
                : 'Progress saved in the portal',
          tone: ['Submitted', 'Approved'].includes(bondApplicationStatus) ? 'complete' : 'info',
        }
      : {
          key: 'bond',
          label: 'Bond application',
          value: 'Not required',
          detail: 'This transaction is not bond-financed',
          tone: 'neutral',
        },
  ]
  const buyerPortalStatusToneClasses = {
    complete: 'border-[#cfe4d8] bg-[#eef9f2] text-[#2f7a51]',
    action: 'border-[#f0d8ae] bg-[#fff6e7] text-[#9a5b0f]',
    info: 'border-[#d6e3f1] bg-[#eef5fb] text-[#35546c]',
    neutral: 'border-[#dde7f1] bg-white text-[#64748b]',
  }
  const occupationalRentProofPending =
    occupationalRent?.enabled &&
    occupationalRent?.status &&
    normalizePortalStatus(occupationalRent.status) !== 'settled' &&
    !occupationalRentProofDocument
  const financeSteps = financeProcess?.steps || []
  const attorneySteps = transferProcess?.steps || []
  const hasStepWithStatus = (steps = [], matcher, allowedStatuses = []) =>
    steps.some((step) => {
      const label = `${step?.step_label || ''} ${step?.step_key || ''}`
      if (!matcher.test(label)) return false
      const status = normalizePortalStatus(step?.status)
      return allowedStatuses.includes(status)
    })
  const hasStartedStep = (steps = [], matcher) =>
    steps.some((step) => {
      const label = `${step?.step_label || ''} ${step?.step_key || ''}`
      if (!matcher.test(label)) return false
      const status = normalizePortalStatus(step?.status)
      return !['', 'pending', 'not_started'].includes(status)
    })
  const atOrBeyondFinance = stageIndex > getMainStageIndex('FIN')
  const atOrBeyondTransfer = stageIndex >= getMainStageIndex('ATTY')
  const atOrBeyondRegistration = stageIndex >= getMainStageIndex('REG')
  const hasComplianceCertificates = propertySharedDocuments.some((document) =>
    /certificate|coc|compliance|warranty|title deed/i.test(`${document?.category || ''} ${document?.name || ''}`),
  )
  const hasWelcomePack = propertySharedDocuments.some((document) =>
    /welcome pack|handover pack|manual/i.test(`${document?.category || ''} ${document?.name || ''}`),
  )
  const handoverScheduled = Boolean(handoverForm.handoverDate || portal?.handover?.handoverDate)
  const clientChecklistItems = [
    {
      key: 'upload_documents',
      title: 'Upload outstanding documents',
      description:
        missingRequired > 0
          ? `${missingRequired} required document${missingRequired === 1 ? '' : 's'} still need to be uploaded.`
          : 'All required documents have been uploaded.',
      status: resolveChecklistProgressState({
        complete: missingRequired === 0 && !occupationalRentProofPending,
        inProgress: uploadedRequiredDocuments > 0 || Boolean(occupationalRentProofDocument),
      }),
      responsible: 'You',
      actionTo: 'documents',
      actionLabel: 'Open Documents',
    },
    {
      key: 'sign_agreements',
      title: 'Sign agreements',
      description: otpSignaturePending
        ? 'One or more agreement signatures are still outstanding.'
        : 'All required signatures currently on record.',
      status: resolveChecklistProgressState({
        complete: !otpSignaturePending,
        inProgress: portalRequiredDocuments.some((item) => /otp|agreement|signature/i.test(`${item?.key || ''} ${item?.label || ''}`)),
      }),
      responsible: 'You',
      actionTo: 'documents',
      actionLabel: 'Review Documents',
    },
    {
      key: 'confirm_personal_details',
      title: 'Confirm personal details',
      description: onboardingComplete
        ? 'Your onboarding information has been completed.'
        : 'Complete your personal and transaction information sheet.',
      status: resolveChecklistProgressState({
        complete: onboardingComplete,
        inProgress: onboardingFieldEntries.length > 0,
      }),
      responsible: 'You',
      actionTo: 'details',
      actionLabel: 'Update My Details',
    },
  ]
  const financialChecklistItems = [
    {
      key: 'bond_approved',
      title: 'Bond approved',
      description: 'Finance approval from the lending side is required before handover.',
      status: resolveChecklistProgressState({
        complete: atOrBeyondFinance || hasStepWithStatus(financeSteps, /approval|approved|bond/i, ['completed', 'approved']),
        inProgress: mainStage === 'FIN' || hasStartedStep(financeSteps, /approval|bond/i),
      }),
      responsible: 'Agent',
    },
    {
      key: 'guarantees_issued',
      title: 'Guarantees issued',
      description: 'Guarantees must be in place to progress legal transfer confidently.',
      status: resolveChecklistProgressState({
        complete:
          atOrBeyondTransfer ||
          hasStepWithStatus(financeSteps, /guarantee/i, ['completed']) ||
          hasStepWithStatus(attorneySteps, /guarantee/i, ['completed']),
        inProgress: hasStartedStep(financeSteps, /guarantee/i) || hasStartedStep(attorneySteps, /guarantee/i),
      }),
      responsible: 'Agent',
    },
    {
      key: 'final_payments',
      title: 'Final payments settled',
      description: occupationalRent?.enabled
        ? 'Occupational rent or final settlement proof needs to be on file.'
        : 'Final payment clearances are being tracked by your team.',
      status: resolveChecklistProgressState({
        complete: !occupationalRent?.enabled || normalizePortalStatus(occupationalRent?.status) === 'settled',
        inProgress: Boolean(occupationalRentProofDocument) || normalizePortalStatus(occupationalRent?.status) === 'in_progress',
      }),
      responsible: 'You',
      actionTo: occupationalRent?.enabled ? 'documents' : null,
      actionLabel: occupationalRent?.enabled ? 'Upload Proof' : null,
      dueDate: occupationalRent?.nextDueDate ? formatClientPortalDate(occupationalRent.nextDueDate) : null,
    },
  ]
  const legalChecklistItems = [
    {
      key: 'transfer_documents_prepared',
      title: 'Transfer documents prepared',
      description: 'Attorney transfer packs and legal records must be prepared.',
      status: resolveChecklistProgressState({
        complete:
          atOrBeyondTransfer ||
          hasStepWithStatus(attorneySteps, /draft|transfer preparation|documents prepared/i, ['completed']),
        inProgress: hasStartedStep(attorneySteps, /draft|transfer preparation|document/i),
      }),
      responsible: 'Attorney',
    },
    {
      key: 'lodgement_complete',
      title: 'Lodgement complete',
      description: 'The transfer must move through lodgement before final registration.',
      status: resolveChecklistProgressState({
        complete: atOrBeyondRegistration || hasStepWithStatus(attorneySteps, /lodg/i, ['completed']),
        inProgress: hasStartedStep(attorneySteps, /lodg/i),
      }),
      responsible: 'Attorney',
    },
    {
      key: 'registration_confirmed',
      title: 'Registration confirmed',
      description: 'Registration confirmation marks legal completion of transfer.',
      status: resolveChecklistProgressState({
        complete: atOrBeyondRegistration || normalizePortalStatus(portal?.transaction?.status).includes('registered'),
        inProgress: hasStartedStep(attorneySteps, /register/i),
      }),
      responsible: 'Attorney',
    },
  ]
  const propertyChecklistItems = [
    {
      key: 'snag_list_complete',
      title: 'Snag list complete',
      description: portal?.settings?.snag_reporting_enabled
        ? snagOpenCount === 0
          ? 'No open snag items are currently blocking handover.'
          : `${snagOpenCount} snag item${snagOpenCount === 1 ? '' : 's'} still open.`
        : 'Snag reporting is not required for this transaction.',
      status: resolveChecklistProgressState({
        complete: !portal?.settings?.snag_reporting_enabled || snagOpenCount === 0,
        inProgress: portal?.settings?.snag_reporting_enabled && portal?.issues?.length > 0 && snagOpenCount > 0,
      }),
      responsible: 'Developer',
      actionTo: portal?.settings?.snag_reporting_enabled ? 'snags' : null,
      actionLabel: portal?.settings?.snag_reporting_enabled ? 'View Snags' : null,
    },
    {
      key: 'final_inspection_done',
      title: 'Final inspection done',
      description: 'The final property walk-through must be completed before key release.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.inspectionCompleted),
        inProgress: handoverScheduled,
      }),
      responsible: 'Developer',
    },
    {
      key: 'utilities_connected',
      title: 'Utilities connected and recorded',
      description: 'Electricity and water readings should be captured for handover records.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.electricityMeterReading) && Boolean(handoverForm.waterMeterReading),
        inProgress: Boolean(handoverForm.electricityMeterReading) || Boolean(handoverForm.waterMeterReading),
      }),
      responsible: 'Developer',
    },
    {
      key: 'certificates_issued',
      title: 'Certificates issued',
      description: 'Compliance and warranty certificates should be available for reference.',
      status: resolveChecklistProgressState({
        complete: hasComplianceCertificates,
        inProgress: propertySharedDocuments.length > 0,
      }),
      responsible: 'Developer',
      actionTo: 'documents',
      actionLabel: 'View Property Docs',
    },
  ]
  const handoverPreparationItems = [
    {
      key: 'handover_scheduled',
      title: 'Handover date scheduled',
      description: handoverScheduled
        ? `Handover is currently scheduled for ${formatClientPortalDate(handoverForm.handoverDate || portal?.handover?.handoverDate)}.`
        : 'A confirmed handover date is still pending.',
      status: resolveChecklistProgressState({
        complete: handoverScheduled,
        inProgress: normalizePortalStatus(handoverStatus) === 'in_progress',
      }),
      responsible: 'Agent',
    },
    {
      key: 'key_collection_arranged',
      title: 'Key collection arranged',
      description: 'Key collection details should be confirmed before handover day.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.keysHandedOver) || normalizePortalStatus(handoverStatus) === 'completed',
        inProgress: handoverScheduled,
      }),
      responsible: 'Agent',
    },
    {
      key: 'welcome_pack_ready',
      title: 'Welcome pack ready',
      description: 'Final manuals and welcome pack should be prepared for handover.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.manualsHandedOver) || hasWelcomePack,
        inProgress: Boolean(handoverForm.remoteHandedOver),
      }),
      responsible: 'Developer',
    },
  ]
  const handoverChecklistSections = [
    {
      key: 'client_requirements',
      title: 'Client requirements',
      description: 'Items you need to complete before handover can be finalized.',
      items: clientChecklistItems,
    },
    {
      key: 'financial_completion',
      title: 'Financial completion',
      description: 'Finance-side conditions that need to be cleared before possession.',
      items: financialChecklistItems,
    },
    {
      key: 'legal_transfer',
      title: 'Legal & transfer',
      description: 'Attorney-led milestones that drive legal readiness.',
      items: legalChecklistItems,
    },
    {
      key: 'property_readiness',
      title: 'Property readiness',
      description: 'Physical unit readiness and supporting certification.',
      items: propertyChecklistItems,
    },
    {
      key: 'handover_preparation',
      title: 'Handover preparation',
      description: 'Final readiness checks before key collection.',
      items: handoverPreparationItems,
    },
  ].map((section) => {
    const completedCount = section.items.filter((item) => item.status === 'complete').length
    return {
      ...section,
      completedCount,
      totalCount: section.items.length,
    }
  })
  const handoverChecklistTotalCount = handoverChecklistSections.reduce((total, section) => total + section.totalCount, 0)
  const handoverChecklistCompletedCount = handoverChecklistSections.reduce((total, section) => total + section.completedCount, 0)
  const handoverChecklistProgressPercent = handoverChecklistTotalCount
    ? Math.round((handoverChecklistCompletedCount / handoverChecklistTotalCount) * 100)
    : 0
  const clientRequirementsSection = handoverChecklistSections.find((section) => section.key === 'client_requirements')
  const clientRequirementsComplete = clientRequirementsSection
    ? clientRequirementsSection.completedCount === clientRequirementsSection.totalCount
    : true
  const handoverReadinessStatus = handoverCompleted
    ? 'Completed'
    : handoverChecklistCompletedCount === handoverChecklistTotalCount && handoverChecklistTotalCount > 0
      ? 'Ready'
      : clientRequirementsComplete && handoverChecklistProgressPercent >= 70
        ? 'Ready'
        : handoverChecklistCompletedCount > 0
          ? 'In Progress'
          : 'Not Ready'
  const handoverReadinessStatusClasses =
    handoverReadinessStatus === 'Completed' || handoverReadinessStatus === 'Ready'
      ? 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]'
      : handoverReadinessStatus === 'In Progress'
        ? 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]'
        : 'border-[#f1ddd0] bg-[#fff6f0] text-[#a15b31]'
  const handoverReadinessSummary =
    handoverReadinessStatus === 'Completed'
      ? 'Your handover is complete and all readiness items are closed.'
      : handoverReadinessStatus === 'Ready'
        ? 'Your file is close to handover completion. Final scheduling and key collection can proceed.'
        : handoverReadinessStatus === 'In Progress'
          ? 'Handover preparation is underway. Complete the remaining items to stay on track.'
          : 'Handover is not ready yet. Start with your client requirements to move forward.'
  const stageUpdatedAt = portal?.transaction?.stage_updated_at || portal?.lastUpdated || portal?.transaction?.updated_at || null
  const stageAgeDays = getDaysElapsed(stageUpdatedAt)
  const timeInStageLabel = getDaysInStageLabel(stageUpdatedAt)
  const stageUpdatedDateLabel = formatShortPortalDate(stageUpdatedAt)
  const transactionCompleted =
    ['completed', 'registered', 'closed'].includes(normalizePortalStatus(portal?.transaction?.status || '')) &&
    mainStage === 'REG'
  const workspaceEducationalContent = workspaceData?.educationalContent || {}
  const stageEducation = workspaceEducationalContent?.currentStage || {}
  const rolePlayerGuidance = Array.isArray(workspaceEducationalContent?.rolePlayerGuidance)
    ? workspaceEducationalContent.rolePlayerGuidance
    : []
  const workspaceNextActions = Array.isArray(workspaceData?.nextActions) ? workspaceData.nextActions : []
  const blockingActionCount = workspaceNextActions.filter((action) => action?.blocking).length
  const prioritizedNextActions = workspaceNextActions.slice(0, 4)
  const hiddenNextActionCount = Math.max(workspaceNextActions.length - prioritizedNextActions.length, 0)
  const nextStepState = resolveClientNextStepState({
    nextActions: workspaceNextActions,
    nextStage,
  })
  const journeyType = effectiveWorkspace === 'seller' ? 'seller' : 'buyer'
  const journeyPropertyType = resolveClientJourneyPropertyType(portal?.transaction || {})
  const journeyFinanceType = resolveClientJourneyFinanceType(financeTypeForPortal)
  const hasSubjectToSaleIndicator = Boolean(
    normalizePortalStatus(portal?.transaction?.subject_to_sale) === 'yes' ||
      normalizePortalStatus(portal?.transaction?.subject_to_sale_flag) === 'yes' ||
      normalizePortalStatus(portal?.transaction?.purchase_subject_to_sale) === 'yes' ||
      normalizePortalStatus(portal?.transaction?.purchase_subject_to_sale_flag) === 'yes',
  )
  const sellerJourneyStatus = (
    activeSellingContext?.status ||
    activeSellingContext?.mandatePacket?.state ||
    ''
  )
  const { steps: clientJourneySteps, currentStepId } = buildClientJourney({
    journeyType,
    propertyType: journeyPropertyType,
    financeType: journeyFinanceType,
    mainStage,
    nextStepState,
    reservationRequired: reservationRequiredForClient,
    reservationStatus,
    otpSignaturePending,
    isCompleted: transactionCompleted,
    financeProcess,
    transferProcess,
    bondProcess,
    attorneyProcess,
    subjectToSale: hasSubjectToSaleIndicator,
    sellerStatus: sellerJourneyStatus,
  })
  const journeyStatusFlag = deriveClientJourneyStatusFlag({
    nextStepState,
    stageAgeDays,
  })
  const resolvedExpandedJourneyStepId =
    expandedJourneyStepId && clientJourneySteps.some((step) => step.id === expandedJourneyStepId)
      ? expandedJourneyStepId
      : currentStepId || clientJourneySteps[0]?.id || null
  const journeyCurrentStep = clientJourneySteps.find((step) => step.id === resolvedExpandedJourneyStepId) ||
    clientJourneySteps.find((step) => step.status === 'current' || step.status === 'blocked') ||
    clientJourneySteps[0] ||
    null
  const journeyCurrentStageLabel = journeyCurrentStep?.label || MAIN_STAGE_LABELS[mainStage]
  const journeyCurrentStepIndex = Math.max(0, clientJourneySteps.findIndex((step) => step.id === journeyCurrentStep?.id))
  const journeyNextStageLabel = clientJourneySteps[journeyCurrentStepIndex + 1]?.label || 'Completed'
  const journeyCompletedSteps = clientJourneySteps.filter((step) => step.status === 'complete').length
  const journeyProgressPercent = clientJourneySteps.length
    ? Math.round((journeyCompletedSteps / clientJourneySteps.length) * 100)
    : progressPercent
  const journeyHeroSubtext = journeyCurrentStep?.whatHappensNow
    ? String(journeyCurrentStep.whatHappensNow)
    : stageEducation?.shortDescription || `Your team is progressing ${journeyCurrentStageLabel.toLowerCase()} right now.`
  const whatHappensNextItems = buildClientWhatHappensNextCopy({
    journeyType,
    nextStepState,
    nextStageLabel: journeyNextStageLabel,
    financeType: journeyFinanceType,
  })

  const whatsHappeningSummary = buildClientWhatsHappeningSummary({
    mainStage,
    nextStage,
    latestJourneyUpdates,
    nextStepState,
  })
  const notificationPayload = workspaceData?.notifications && typeof workspaceData.notifications === 'object'
    ? workspaceData.notifications
    : { unreadCount: 0, items: [] }
  const notificationItems = (Array.isArray(notificationPayload?.items) ? notificationPayload.items : [])
    .map((item) => {
      const priority = String(item?.priority || '').trim().toLowerCase()
      const normalizedType = String(item?.type || '').toLowerCase()
      const route = String(item?.actionRoute || '').trim().toLowerCase() || (
        normalizedType.includes('document')
          ? 'documents'
          : normalizedType.includes('appointment')
            ? 'appointments'
            : 'progress'
      )
      return {
        id: item?.id || `notification_${Math.random().toString(36).slice(2, 8)}`,
        type: item?.type || 'message_shared',
        title: item?.title || 'Update',
        message: item?.description || item?.message || 'You have a new update.',
        createdAt: item?.createdAt || item?.created_at || portal?.lastUpdated || '',
        to: route,
        tone: priority === 'urgent' || priority === 'high' ? 'action' : 'info',
        priority,
        status: String(item?.status || 'unread').trim().toLowerCase(),
        actionLabel: item?.actionLabel || item?.action_label || '',
      }
    })
    .filter((item) => item.status !== 'dismissed')
    .sort((a, b) => {
      const aTime = Date.parse(a.createdAt || '')
      const bTime = Date.parse(b.createdAt || '')
      const safeA = Number.isNaN(aTime) ? 0 : aTime
      const safeB = Number.isNaN(bTime) ? 0 : bTime
      return safeB - safeA
    })
  const unreadNotificationCount = Number(
    notificationPayload?.unreadCount ??
      notificationItems.filter((item) => item.status === 'unread').length,
  )
  const transferAttorneyRolePlayer = portal?.attorneyRolePlayers?.transferAttorney || null
  const bondAttorneyRolePlayer = portal?.attorneyRolePlayers?.bondAttorney || null
  const attorneyRolePlayerCards = [
    transferAttorneyRolePlayer ? { key: 'transfer', label: 'Transfer Attorney', value: transferAttorneyRolePlayer } : null,
    bondAttorneyRolePlayer ? { key: 'bond', label: 'Bond Attorney', value: bondAttorneyRolePlayer } : null,
  ].filter(Boolean)
  const hasAttorneyRolePlayers = attorneyRolePlayerCards.length > 0
  const buyerBondOriginatorRequest = resolveBuyerBondOriginatorRequest(portal)
  const buyerBondOriginatorRequestMessage = getBuyerBondOriginatorRequestMessage(buyerBondOriginatorRequest)

  const teamMembers = [
    {
      title: 'Sales Team',
      name: portal?.transaction?.assigned_agent || portal?.unit?.development?.developer_company || 'Arch9 Sales',
      detail: portal?.transaction?.assigned_agent_email || 'Handles deal updates and coordination.',
    },
    ...(hasAttorneyRolePlayers
      ? []
      : [
          {
            title: 'Attorney / Conveyancer',
            name: portal?.transaction?.attorney || 'Attorney / Conveyancer',
            detail: portal?.transaction?.assigned_attorney_email || 'Manages transfer preparation and lodgement.',
          },
        ]),
    {
      title: 'Bond Originator',
      name: portal?.transaction?.bond_originator || 'Bond Originator',
      detail: portal?.transaction?.assigned_bond_originator_email || 'Supports finance approvals and lender feedback.',
      extraDetail: buyerBondOriginatorRequestMessage,
    },
    {
      title: 'Arch9 Support',
      name: portal?.unit?.development?.developer_company || 'Arch9 Operations',
      detail: 'Keeps the transaction workspace, documents, and handover records aligned.',
    },
  ]
  const visibleMenuItems = CLIENT_PORTAL_MENU.filter((item) => {
    if (effectiveWorkspace === 'seller') {
      return false
    }
    if (item.key === 'snags' && !portal?.settings?.snag_reporting_enabled) return false
    if (item.key === 'bond_application' && !isBondOrHybridTransaction) return false
    return true
  })
  const portalNavigationItems = effectiveWorkspace === 'seller' ? SELLER_PORTAL_MENU : visibleMenuItems
  const portalAppointments = Array.isArray(workspaceData?.appointments)
    ? workspaceData.appointments
    : (Array.isArray(portal?.appointments) ? portal.appointments : [])
  const clientVisibleAppointments = portalAppointments.filter((appointment) => {
    const visibility = String(appointment?.visibility || appointment?.visibility_scope || '').trim().toLowerCase()
    return visibility !== 'internal_only'
  })
  const upcomingAppointmentCount = clientVisibleAppointments.filter((appointment) => {
    const status = normalizePortalStatus(appointment?.status)
    if (status.includes('complete') || status.includes('cancel') || status.includes('declin')) return false
    const time = Date.parse(appointment?.dateTime || appointment?.date_time || '')
    return Number.isNaN(time) || time >= Date.now() - (1000 * 60 * 60 * 2)
  }).length
  const sidebarStatusByKey = {
    documents: missingRequired > 0 ? `${missingRequired} required` : 'Ready',
    account: matterAccountsState.loading
      ? 'Loading'
      : matterAccountsState.summary?.documentCount
        ? `${matterAccountsState.summary.documentCount} docs`
        : matterAccountsState.accounts?.length
          ? 'Published'
          : null,
    appointments: upcomingAppointmentCount > 0 ? `${upcomingAppointmentCount} upcoming` : null,
    offers: activeSellerOfferCount > 0 ? `${activeSellerOfferCount}` : null,
    snags: portal?.settings?.snag_reporting_enabled ? `${snagOpenCount} open` : null,
  }
  const activeMenuItem = portalNavigationItems.find((item) => item.key === activeSection) || portalNavigationItems[0] || CLIENT_PORTAL_MENU[0]
  const activeSectionLabel =
    activeSection === 'alterations'
      ? 'Alterations'
      : activeSection === 'review'
        ? 'Review'
        : activeMenuItem.label
  const developmentName = portal?.unit?.development?.name || 'Development'
  const unitLabel = portal?.unit?.unit_number ? `Unit ${portal.unit.unit_number}` : 'Unit'
  const buyerName = portal?.buyer?.name || 'Client'
  const clientFirstName = String(buyerName || 'Client').trim().split(/\s+/)[0] || 'Client'
  const buyerInitial = String(buyerName || 'C').trim().charAt(0).toUpperCase() || 'C'
  const sellerDisplayName = pickFirstText(portal?.buyer?.name, activeSellingContext?.clientName, activeSellingContext?.client_name, 'Seller')
  const sellerFirstName = String(sellerDisplayName || 'Seller').trim().split(/\s+/)[0] || 'Seller'
  const sellerPropertyTitle = pickFirstText(
    portal?.onboardingFormData?.formData?.propertyAddress,
    portal?.onboardingFormData?.formData?.property_address,
    portal?.unit?.unit_number,
    portal?.unit?.development?.name,
    activeSellingContext?.listingTitle,
    activeSellingContext?.listing_title,
    'Property sale',
  )
  const sellerAgencyName = pickSellerBrandText(
    portal?.listing?.agencyName,
    portal?.listing?.agency_name,
    portal?.listing?.organisationName,
    portal?.listing?.organisation_name,
    portal?.listing?.branding?.agencyName,
    portal?.listing?.branding?.organisationName,
    activeSellingContext?.agencyName,
    activeSellingContext?.agency_name,
    portal?.branding?.agencyName,
    portal?.branding?.organisationName,
    portal?.unit?.development?.developer_company,
    'Arch9',
  )
  const sellerAgencyLogoUrl = pickFirstText(
    portal?.listing?.agencyLogoLightUrl,
    portal?.listing?.agency_logo_light_url,
    portal?.listing?.organisationLogoLightUrl,
    portal?.listing?.organisation_logo_light_url,
    portal?.listing?.branding?.logoLightUrl,
    portal?.listing?.branding?.logoLight,
    portal?.listing?.branding?.logo_light_url,
    activeSellingContext?.agencyLogoLightUrl,
    activeSellingContext?.agency_logo_light_url,
    activeSellingContext?.branding?.logoLightUrl,
    activeSellingContext?.branding?.logoLight,
    activeSellingContext?.branding?.logo_light_url,
    portal?.branding?.logoLightUrl,
    portal?.branding?.logoLight,
    portal?.branding?.logo_light_url,
    portal?.listing?.agencyLogoUrl,
    portal?.listing?.agency_logo_url,
    portal?.listing?.organisationLogoUrl,
    portal?.listing?.organisation_logo_url,
    portal?.listing?.branding?.logoUrl,
    activeSellingContext?.agencyLogoUrl,
    activeSellingContext?.agency_logo_url,
    activeSellingContext?.branding?.logoUrl,
    portal?.branding?.logoUrl,
    portal?.listing?.agencyLogoDarkUrl,
    portal?.listing?.agency_logo_dark_url,
    portal?.listing?.organisationLogoDarkUrl,
    portal?.listing?.organisation_logo_dark_url,
    portal?.listing?.branding?.logoDarkUrl,
    portal?.listing?.branding?.logoDark,
    activeSellingContext?.branding?.logoDarkUrl,
    portal?.branding?.logoDarkUrl,
  )
  const sellerAgentName = pickFirstText(
    portal?.transaction?.assigned_agent,
    activeSellingContext?.assignedAgentName,
    activeSellingContext?.assigned_agent_name,
    sellerAgencyName,
  )
  const sellerAgentEmail = pickFirstText(
    portal?.transaction?.assigned_agent_email,
    activeSellingContext?.assignedAgentEmail,
    activeSellingContext?.assigned_agent_email,
    portal?.buyer?.email,
  )
  const sellerAgentPhone = pickFirstText(
    portal?.transaction?.assigned_agent_phone,
    portal?.transaction?.agent_phone,
    activeSellingContext?.assignedAgentPhone,
    activeSellingContext?.assigned_agent_phone,
    activeSellingContext?.agentPhone,
    activeSellingContext?.agent_phone,
  )
  const sellerOfferAskingPrice = Number(
    activeSellingContext?.askingPrice ||
      activeSellingContext?.asking_price ||
      activeSellingContext?.listPrice ||
      activeSellingContext?.list_price ||
      portal?.activeSellingContext?.askingPrice ||
      portal?.activeSellingContext?.asking_price ||
      portal?.unit?.price ||
      purchasePriceValue ||
      0,
  )
  const sellerOnboardingFormData =
    portal?.onboardingFormData?.formData && typeof portal.onboardingFormData.formData === 'object'
      ? portal.onboardingFormData.formData
      : {}
  const sellerVisibleListingLinks = normalizeSellerVisibleListingLinks([
    ...(Array.isArray(activeSellingContext?.externalListingLinks) ? activeSellingContext.externalListingLinks : []),
    ...(Array.isArray(activeSellingContext?.listingExternalLinks) ? activeSellingContext.listingExternalLinks : []),
    ...(Array.isArray(portal?.activeSellingContext?.externalListingLinks) ? portal.activeSellingContext.externalListingLinks : []),
    ...(Array.isArray(portal?.activeSellingContext?.listingExternalLinks) ? portal.activeSellingContext.listingExternalLinks : []),
    ...(Array.isArray(portal?.listing?.externalLinks) ? portal.listing.externalLinks : []),
  ])
  const sellerRequiredDocuments = Array.isArray(workspaceData?.documentCenter?.requiredDocuments)
    ? workspaceData.documentCenter.requiredDocuments
    : (Array.isArray(portal?.requiredDocuments) ? portal.requiredDocuments : [])
  const sellerUploadedDocuments = Array.isArray(workspaceData?.documentCenter?.uploadedDocuments)
    ? workspaceData.documentCenter.uploadedDocuments
    : (Array.isArray(portal?.documents) ? portal.documents : [])
  const sellerDocumentExperience = buildSellerDocumentExperienceModel({
    requirements: sellerRequiredDocuments.filter((item) => item?.visibility !== 'internal'),
    documents: sellerUploadedDocuments,
    audience: 'seller',
  })
  const sellerDocumentsNeedingAttention = sellerDocumentExperience.actionItems
  const normalizedSellerOnboardingStatus = normalizePortalStatus(
    activeSellingContext?.sellerOnboardingStatus ||
      activeSellingContext?.seller_onboarding_status ||
      portal?.onboarding?.status ||
      portal?.onboardingFormData?.status,
  )
  const hasSellerOnboardingSubmitted = ['submitted', 'under_review', 'completed', 'reviewed', 'approved'].includes(normalizedSellerOnboardingStatus)
  const hasSellerOnboardingData = Object.keys(sellerOnboardingFormData).length > 0
  const hasMandatePacket = Boolean(
    activeSellingContext?.mandatePacketId ||
      activeSellingContext?.mandate_packet_id ||
      activeSellingContext?.mandatePacket ||
      portal?.mandate?.packet,
  )
  const hasMandateSigned = Boolean(
    ['listed', 'offers', 'offer_accepted', 'transfer', 'registered'].includes(sellerStageMeta.currentStageKey) ||
      ['signed', 'fully_signed', 'completed', 'uploaded_signed'].includes(normalizeSellerPortalKey(mandatePacketState)) ||
      activeSellingContext?.mandatePacket?.finalSignedFilePath ||
      portal?.mandate?.packet?.finalSignedFilePath,
  )
  const hasListingCreated = Boolean(
    ['listed', 'offers', 'offer_accepted', 'transfer', 'registered'].includes(sellerStageMeta.currentStageKey) ||
      sellerVisibleListingLinks.length ||
      normalizePortalStatus(activeSellingContext?.listingStatus || activeSellingContext?.listing_status).includes('active'),
  )
  const hasDocumentsComplete = Boolean(
    (sellerDocumentExperience.summary.ready || sellerStageMeta.currentStageKey === 'registered') &&
      hasListingCreated,
  )
  const inferredSellerListingProgressModel = buildSellerPortalProgressModel({
    hasSellingContext,
    hasAppointment: clientVisibleAppointments.length > 0,
    hasOnboardingStarted: hasSellerOnboardingData || Boolean(normalizedSellerOnboardingStatus && normalizedSellerOnboardingStatus !== 'not_started'),
    hasOnboardingSubmitted: hasSellerOnboardingSubmitted,
    hasMandatePacket,
    hasMandateSigned,
    hasListingCreated,
    hasDocumentsComplete,
  })
  const sharedSellerListingProgressModel = buildSellerPortalProgressModelFromSharedJourney(sharedSellerPortalJourney)
  const sellerListingProgressModel = {
    ...(hasDocumentsComplete ? inferredSellerListingProgressModel : sharedSellerListingProgressModel || inferredSellerListingProgressModel),
    title: 'Listing Progress',
    workflowKey: 'listing',
    isStarted: true,
    description: 'Track onboarding, mandate, listing activation, and seller document milestones.',
    actionLabel: 'View documents',
    actionTo: 'documents',
  }
  const sellerSaleProgressModel = buildSellerSaleProgressModel({
    hasDocumentsComplete,
    sellerStageMeta,
    mainStage,
    activeSellingContext,
    portal,
    sellerOfferItems,
  })
  const sellerDetailsSections = buildSellerPortalDetailsSections({
    formData: sellerOnboardingFormData,
    propertyAddress: sellerPropertyTitle,
    uploadedDocuments: sellerUploadedDocuments,
  })
  const sellerPrimaryNextAction = workspaceNextActions.find((action) => action?.blocking) || workspaceNextActions[0] || null
  const pendingSellerAppointment = clientVisibleAppointments.find((appointment) => {
    const status = normalizePortalStatus(appointment?.status)
    return ['pending', 'proposed', 'awaiting_confirmation'].includes(status)
  }) || null
  const sellerNextStep = (() => {
    if (sellerPrimaryNextAction) {
      return {
        title: sellerPrimaryNextAction.title || 'Review your next step',
        description: sellerPrimaryNextAction.description || 'Your transaction team needs one item from you.',
        to: sellerPrimaryNextAction.actionRoute || 'documents',
        label: sellerPrimaryNextAction.actionLabel || 'Open next step',
        tone: sellerPrimaryNextAction.blocking ? 'action' : 'info',
      }
    }
    if (!hasSellerOnboardingSubmitted) {
      return {
        title: 'Complete seller onboarding',
        description: 'Finish your seller details so your agent can prepare the mandate and document requirements.',
        href: `/seller/onboarding/${token}`,
        to: 'documents',
        label: 'Open onboarding',
        tone: 'action',
      }
    }
    if (mandatePacketState === 'ready_for_client_signature') {
      return {
        title: 'Review mandate',
        description: 'Your mandate is ready for review and signature in your secure workspace.',
        to: 'documents',
        label: 'Review mandate',
        tone: 'action',
      }
    }
    if (pendingSellerAppointment) {
      return {
        title: 'Confirm appointment',
        description: 'Please confirm the proposed appointment time or request an alternative.',
        to: 'appointments',
        label: 'View appointment',
        tone: 'action',
      }
    }
    if (sellerOfferItems.some((offer) => ['seller_review', 'submitted', 'countered'].includes(normalizeSellerPortalKey(offer.status)))) {
      return {
        title: 'Review offers with your agent',
        description: 'Your agent will present all offers received and advise you on the best next steps.',
        to: 'offers',
        label: 'View offers',
        tone: 'action',
      }
    }
    if (sellerDocumentsNeedingAttention.length) {
      return {
        title: 'Upload requested document',
        description: `${sellerDocumentsNeedingAttention.length} seller document${sellerDocumentsNeedingAttention.length === 1 ? '' : 's'} need attention.`,
        to: 'documents',
        label: 'Open documents',
        tone: 'action',
      }
    }
    return {
      title: sellerStageMeta.currentStage.nextStepTitle,
      description: sellerStageMeta.currentStage.nextStepDescription,
      to: sellerStageMeta.currentStage.primaryRoute,
      label: sellerStageMeta.currentStage.primaryAction,
      tone: 'info',
    }
  })()
  const safeSellerActivityItems = latestJourneyFeedItems
    .filter((item) => {
      const haystack = `${item.message || ''} ${item.contextLabel || ''}`.toLowerCase()
      if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(haystack)) return false
      return !/(internal|system|admin|workflow|supabase|row id|debug|rls|stage key)/i.test(haystack)
    })
    .slice(0, 5)
  const sellerActivityFallbackItems = [
    activeSellerOfferCount > 0
      ? {
          id: 'seller-offer-activity',
          message: activeSellerOfferCount === 1 ? 'New offer received for your property.' : `${activeSellerOfferCount} offers received for your property.`,
          timestampLabel: formatShortPortalDate(sellerOfferItems[0]?.receivedAt, 'Recently'),
        }
      : null,
    ['Listed', 'Offers', 'Offer Accepted', 'Transfer', 'Registered'].includes(sellerCurrentStage)
      ? {
          id: 'seller-listed-activity',
          message: 'Your property has been listed.',
          timestampLabel: formatShortPortalDate(
            activeSellingContext?.listingPublishedAt ||
              activeSellingContext?.listing_published_at ||
              activeSellingContext?.listingCreatedAt ||
              activeSellingContext?.listing_created_at ||
              portal?.unit?.published_at ||
              portal?.unit?.created_at,
            'Recently',
          ),
        }
      : null,
    sellerUploadedDocuments.length > 0
      ? {
          id: 'seller-documents-activity',
          message: `${sellerUploadedDocuments.length} document${sellerUploadedDocuments.length === 1 ? '' : 's'} uploaded to your workspace.`,
          timestampLabel: 'Recently',
        }
      : null,
    upcomingAppointmentCount > 0
      ? {
          id: 'seller-appointment-activity',
          message: 'Appointment scheduled with your agent.',
          timestampLabel: 'Recently',
        }
      : null,
  ].filter(Boolean)
  const sellerActivityItems = safeSellerActivityItems.length ? safeSellerActivityItems : sellerActivityFallbackItems
  const sellerPropertyImageUrl = resolveSellerPropertyImageUrl({
    portal,
    activeSellingContext,
    formData: sellerOnboardingFormData,
  })
  const sellerAgentAvatarUrl = resolveSellerAgentAvatarUrl({ portal, activeSellingContext })
  const sellerListingUrl = sellerVisibleListingLinks[0]?.url || ''
  const sellerMarketingChannels = buildSellerMarketingChannels(sellerVisibleListingLinks, sellerAgencyLogoUrl)
  const sellerDocumentTracker = {
    total: sellerDocumentExperience.summary.total,
    completed: sellerDocumentExperience.summary.approved,
    pending: sellerDocumentExperience.summary.actionRequired,
    awaitingReview: sellerDocumentExperience.summary.reviewRequired,
    percent: sellerDocumentExperience.summary.assurancePercent,
    collectionPercent: sellerDocumentExperience.summary.collectionPercent,
  }
  const sellerHealth = buildSellerTransactionHealth({
    hasOnboardingSubmitted: hasSellerOnboardingSubmitted,
    hasMandatePacket,
    hasMandateSigned,
    hasListingCreated,
    hasDocumentsComplete,
    documentsNeedingAttention: sellerDocumentsNeedingAttention,
    sellerPrimaryNextAction,
  })
  const sellerDashboardStatusLabel = resolveSellerStatusLabel({
    sellerStageMeta,
    hasListingCreated,
    sellerOfferItems,
    mainStage,
  })
  const sellerAgentUpdate = buildSellerAgentUpdate({
    items: sellerActivityItems,
    sellerAgentName,
    sellerAgencyName,
    sellerAgentAvatarUrl,
  })
  const sellerTimelineItems = buildSellerJourneyTimelineItems(sellerActivityItems)
  const sellerTransactionStageKey = resolveSellerTransactionStageKey(
    portal?.transaction?.stage,
    portal?.transaction?.detailed_stage,
    portal?.transaction?.current_stage,
    sellerStageMeta?.currentStageKey,
    sellerStageMeta?.currentStage?.key,
    sellerSaleProgressModel?.currentKey,
    mainStage,
  )
  const sellerProgressParticipants = [
    sellerAgentName
      ? {
          role: 'Estate Agent',
          name: sellerAgentName,
          company: sellerAgencyName,
          email: sellerAgentEmail,
          phone: sellerAgentPhone,
          avatarUrl: sellerAgentAvatarUrl,
        }
      : null,
    transferAttorneyRolePlayer || portal?.transaction?.attorney
      ? {
          role: 'Transferring Attorney',
          name: pickFirstText(
            transferAttorneyRolePlayer?.attorneyUser?.name,
            transferAttorneyRolePlayer?.primaryAttorney?.name,
            transferAttorneyRolePlayer?.firm?.name,
            portal?.transaction?.attorney,
          ),
          company: pickFirstText(transferAttorneyRolePlayer?.firm?.name, portal?.transaction?.attorney_firm),
          email: pickFirstText(
            transferAttorneyRolePlayer?.attorneyUser?.email,
            transferAttorneyRolePlayer?.primaryAttorney?.email,
            transferAttorneyRolePlayer?.firm?.email,
            portal?.transaction?.assigned_attorney_email,
          ),
          avatarUrl: pickFirstText(
            transferAttorneyRolePlayer?.attorneyUser?.avatarUrl,
            transferAttorneyRolePlayer?.attorneyUser?.avatar_url,
            transferAttorneyRolePlayer?.primaryAttorney?.avatarUrl,
          ),
        }
      : null,
    portal?.transaction?.bond_originator || portal?.transaction?.assigned_bond_originator_email
      ? {
          role: 'Bond Originator',
          name: pickFirstText(portal?.transaction?.bond_originator, 'Bond Originator'),
          company: pickFirstText(portal?.transaction?.bond_originator_company),
          email: pickFirstText(portal?.transaction?.assigned_bond_originator_email),
          avatarUrl: pickFirstText(portal?.transaction?.bond_originator_avatar_url),
        }
      : null,
  ].filter((participant) => participant?.name)
  const sellerProgressAction = {
    ...sellerNextStep,
    href: sellerNextStep?.href || getPortalWorkspacePath(token, workspaceNavigationScope, sellerNextStep?.to || 'documents'),
  }
  const overviewStatusLabel = ['REGISTERED', 'REG'].includes(mainStage) ? 'Registered' : 'In Progress'
  const workspaceHeaderStatusLabel = isHandover ? (handoverCompleted ? 'Handover Completed' : 'Preparing for Handover') : overviewStatusLabel
  const hasCoApplicantProfile =
    normalizePortalStatus(bondApplicationData?.summary?.has_co_applicant) === 'yes' ||
    Boolean(bondApplicationData?.applicants?.find((applicant) => applicant?.key === 'co_applicant')?.first_name)

  const bondValuePresent = (value) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value)
    if (Array.isArray(value)) return value.length > 0
    return String(value || '').trim().length > 0
  }

  const primaryApplicant = bondApplicationData?.applicants?.find((applicant) => applicant?.key === 'primary') || {}
  const coApplicant = bondApplicationData?.applicants?.find((applicant) => applicant?.key === 'co_applicant') || {}
  const personalApplicantChecks = (applicant) => {
    const checks = [
      bondValuePresent(applicant?.first_name),
      bondValuePresent(applicant?.last_name),
      bondValuePresent(applicant?.date_of_birth),
      bondValuePresent(applicant?.id_type),
      bondValuePresent(applicant?.marital_status),
      bondValuePresent(applicant?.sa_tax_number) || bondValuePresent(applicant?.tax_number_unavailable_reason),
    ]
    if (normalizePortalStatus(applicant?.id_type) === 'passport') {
      checks.push(bondValuePresent(applicant?.passport_number))
      checks.push(bondValuePresent(applicant?.passport_country_of_issue))
    } else if (normalizePortalStatus(applicant?.id_type) === 'refugee_id') {
      checks.push(bondValuePresent(applicant?.refugee_id_card_number))
    } else {
      checks.push(bondValuePresent(applicant?.id_number))
    }
    if (normalizePortalStatus(applicant?.temporary_sa_resident) === 'yes') {
      checks.push(bondValuePresent(applicant?.permit_type))
      checks.push(bondValuePresent(applicant?.permit_number))
      checks.push(bondValuePresent(applicant?.permit_expiry_date))
    }
    return checks
  }

  const sectionCheckMap = {
    summary: [
      bondValuePresent(bondApplicationData?.summary?.applicant_name),
      bondValuePresent(bondApplicationData?.summary?.property_reference),
      bondValuePresent(bondApplicationData?.summary?.purchase_price),
      bondValuePresent(bondApplicationData?.summary?.finance_type),
      bondValuePresent(bondApplicationData?.summary?.marital_status),
      bondValuePresent(bondApplicationData?.summary?.main_residence),
      bondValuePresent(bondApplicationData?.summary?.first_time_home_buyer),
    ],
    personal_details: [
      ...personalApplicantChecks(primaryApplicant),
      ...(hasCoApplicantProfile ? personalApplicantChecks(coApplicant) : []),
    ],
    contact_address: [
      bondValuePresent(bondApplicationData?.contact_address?.cellphone_number),
      bondValuePresent(bondApplicationData?.contact_address?.email_address),
      bondValuePresent(bondApplicationData?.contact_address?.residential_address_street),
      bondValuePresent(bondApplicationData?.contact_address?.residential_address_city),
      bondValuePresent(bondApplicationData?.contact_address?.residential_address_postal_code),
      bondValuePresent(bondApplicationData?.contact_address?.legal_notice_delivery_method),
    ],
    employment: [
      bondValuePresent(bondApplicationData?.employment?.primary?.occupation_status),
      bondValuePresent(bondApplicationData?.employment?.primary?.occupational_level),
      bondValuePresent(bondApplicationData?.employment?.primary?.nature_of_occupation),
      bondValuePresent(bondApplicationData?.employment?.primary?.employment_years) ||
        bondValuePresent(bondApplicationData?.employment?.primary?.employment_months),
      ...(hasCoApplicantProfile
        ? [
            bondValuePresent(bondApplicationData?.employment?.co_applicant?.occupation_status),
            bondValuePresent(bondApplicationData?.employment?.co_applicant?.occupational_level),
          ]
        : []),
    ],
    credit_history: [
      bondValuePresent(bondApplicationData?.credit_history?.currently_under_administration),
      bondValuePresent(bondApplicationData?.credit_history?.currently_under_debt_review),
      bondValuePresent(bondApplicationData?.credit_history?.ever_declared_insolvent),
      bondValuePresent(bondApplicationData?.credit_history?.bound_by_surety_agreements),
    ],
    loan_details: [
      bondValuePresent(bondApplicationData?.loan_details?.street_or_complex),
      bondValuePresent(bondApplicationData?.loan_details?.suburb),
      bondValuePresent(bondApplicationData?.loan_details?.amount_to_be_registered),
      bondValuePresent(bondApplicationData?.loan_details?.debit_order_bank_name),
      bondValuePresent(bondApplicationData?.loan_details?.debit_order_account_number),
      bondValuePresent(bondApplicationData?.loan_details?.preferred_debit_order_date),
    ],
    income_deductions_expenses: [
      bondValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.gross_salary),
      bondValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.tax_paye),
      bondValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.groceries),
      bondValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.transport),
      ...(hasCoApplicantProfile
        ? [bondValuePresent(bondApplicationData?.income_deductions_expenses?.co_applicant?.gross_salary)]
        : []),
    ],
    banking_liabilities: [
      bondValuePresent(bondApplicationData?.banking_liabilities?.primary_bank_name),
      bondValuePresent(bondApplicationData?.banking_liabilities?.primary_account_type),
      bondValuePresent(bondApplicationData?.banking_liabilities?.primary_account_number),
      bondValuePresent(bondApplicationData?.banking_liabilities?.other_finance_1_account_type),
    ],
    assets_liabilities: [
      bondValuePresent(bondApplicationData?.assets_liabilities?.fixed_property),
      bondValuePresent(bondApplicationData?.assets_liabilities?.vehicles),
      bondValuePresent(bondApplicationData?.assets_liabilities?.total_assets),
      bondValuePresent(bondApplicationData?.assets_liabilities?.total_liabilities),
      bondValuePresent(bondApplicationData?.assets_liabilities?.net_asset_value),
    ],
    declarations_consents: [
      Boolean(bondApplicationData?.declarations_consents?.loan_processing_consent),
      Boolean(bondApplicationData?.declarations_consents?.credit_bureau_fraud_bank_data_consent),
      Boolean(bondApplicationData?.declarations_consents?.declaration_accepted),
      bondValuePresent(bondApplicationData?.declarations_consents?.digital_signature_name),
      bondValuePresent(bondApplicationData?.declarations_consents?.digital_signature_date),
    ],
    documents: [
      !bondApplicationRequiredDocuments.length ||
        bondApplicationRequiredDocuments.some((document) => Boolean(document?.complete || document?.uploadedDocumentId)),
    ],
  }

  const bondApplicationSectionStatusByKey = Object.fromEntries(
    BOND_APPLICATION_SECTION_TABS.map((section) => {
      const checks = sectionCheckMap[section.key] || []
      const total = checks.length
      const complete = checks.filter(Boolean).length
      return [
        section.key,
        {
          total,
          complete,
          isComplete: total > 0 && complete === total,
          hasMissing: total > 0 && complete < total,
          completionPercent: total > 0 ? Math.round((complete / total) * 100) : 0,
        },
      ]
    }),
  )
  const bondApplicationProgressSections = BOND_APPLICATION_SECTION_TABS.filter((section) => section.key !== 'documents')
  const bondApplicationCompletedCount = bondApplicationProgressSections.filter(
    (section) => bondApplicationSectionStatusByKey[section.key]?.isComplete,
  ).length
  const missingBondApplicationSectionLabels = bondApplicationProgressSections
    .filter((section) => bondApplicationSectionStatusByKey[section.key]?.hasMissing)
    .map((section) => section.label)
  const bondApplicationProgressPercent = bondApplicationProgressSections.length
    ? Math.round((bondApplicationCompletedCount / bondApplicationProgressSections.length) * 100)
    : 0
  const primaryOverviewAction = {
    to: nextStepState.ctaTo || 'documents',
    label: nextStepState.ctaLabel || 'Open Documents',
  }
  const secondaryOverviewActions = [
    { to: 'handover', label: 'Handover', icon: KeyRound },
    { to: 'team', label: 'Team Contacts', icon: Users },
    { to: 'documents', label: 'Documents', icon: FileText },
  ]
    .filter((action) => action.to !== primaryOverviewAction.to)
    .slice(0, 2)
  const primaryOverviewActionClasses =
    nextStepState.tone === 'action'
      ? 'bg-[#d97706] text-white hover:bg-[#b15f07]'
      : 'bg-[#35546c] text-white hover:bg-[#2d475d]'
  const heroStatusBadge = nextStepState.requiresAction
    ? {
        label: 'Action Required',
        className: 'border-[#f0d8ae] bg-[#fff6e7] text-[#9a5b0f]',
      }
    : stageAgeDays !== null && stageAgeDays >= 21
      ? {
          label: 'At Risk',
          className: 'border-[#f3d6ce] bg-[#fff5f2] text-[#b5472d]',
        }
      : ['awaiting_finance_outcome', 'awaiting_transfer_legal_progress'].includes(nextStepState.type)
        ? {
            label: 'Awaiting Team',
            className: 'border-[#d6e3f1] bg-[#eef5fb] text-[#35546c]',
          }
        : {
            label: 'On Track',
            className: 'border-[#cfe4d8] bg-[#eef9f2] text-[#2f7a51]',
          }
  const getStatusToneClasses = (statusLabel) => {
    const normalizedStatus = normalizePortalStatus(statusLabel)
    if (
      normalizedStatus === 'missing' ||
      normalizedStatus === 'pending' ||
      normalizedStatus === 'awaiting_signature' ||
      normalizedStatus === 'not_uploaded' ||
      normalizedStatus === 'not_available' ||
      normalizedStatus === 'rejected'
    ) {
      return 'border-[#f3d6ce] bg-[#fff5f2] text-[#b5472d]'
    }
    if (
      normalizedStatus === 'uploaded' ||
      normalizedStatus === 'awaiting_review' ||
      normalizedStatus === 'proof_uploaded' ||
      normalizedStatus === 'awaiting_payment'
    ) {
      return 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]'
    }
    if (
      normalizedStatus === 'completed' ||
      normalizedStatus === 'submitted' ||
      normalizedStatus === 'approved' ||
      normalizedStatus === 'verified' ||
      normalizedStatus === 'accepted'
    ) {
      return 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]'
    }
    return 'border-[#dde7f1] bg-white text-[#64748b]'
  }

  const activeBondApplicationSectionIndex = Math.max(
    0,
    BOND_APPLICATION_SECTION_TABS.findIndex((section) => section.key === activeBondApplicationSectionTab),
  )
  const activeBondApplicationSectionMeta =
    BOND_APPLICATION_SECTION_TABS[activeBondApplicationSectionIndex] || BOND_APPLICATION_SECTION_TABS[0]
  const previousBondApplicationSectionMeta =
    activeBondApplicationSectionIndex > 0 ? BOND_APPLICATION_SECTION_TABS[activeBondApplicationSectionIndex - 1] : null
  const nextBondApplicationSectionMeta =
    activeBondApplicationSectionIndex < BOND_APPLICATION_SECTION_TABS.length - 1
      ? BOND_APPLICATION_SECTION_TABS[activeBondApplicationSectionIndex + 1]
      : null

  const readBondField = (path, fallback = '') => {
    const value = getNestedPortalValue(bondApplicationData, path.split('.'))
    return value === null || value === undefined ? fallback : value
  }
  const updateBondField = (path, value) => {
    updateBondApplicationField(path.split('.'), value)
  }

  const renderBondInputField = ({
    path,
    label,
    type = 'text',
    options = null,
    required = false,
    helperText = '',
    placeholder = '',
    rows = 3,
    readOnly = false,
    hidden = false,
    inputMode = undefined,
  }) => {
    if (hidden) return null
    const fieldId = `bond-${path.replaceAll('.', '-')}`
    const value = readBondField(path, type === 'checkbox' ? false : '')

    return (
      <label key={path} htmlFor={fieldId} className="rounded-[14px] border border-[#e3ebf4] bg-white px-3 py-2.5">
        <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
          {label}{required ? ' *' : ''}
        </span>
        {helperText ? <span className="mt-1 block text-xs leading-5 text-[#7b8ca2]">{helperText}</span> : null}
        {type === 'select' ? (
          <select
            id={fieldId}
            value={String(value || '')}
            onChange={(event) => updateBondField(path, event.target.value)}
            className="mt-2 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
          >
            {(options || []).map((option) => (
              <option key={`${path}-${option.value || 'empty'}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        {type === 'textarea' ? (
          <textarea
            id={fieldId}
            rows={rows}
            value={String(value || '')}
            placeholder={placeholder}
            onChange={(event) => updateBondField(path, event.target.value)}
            className="mt-2 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
          />
        ) : null}
        {type === 'checkbox' ? (
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => updateBondField(path, event.target.checked)}
            className="mt-2 h-4 w-4 rounded border-[#c7d4e3]"
          />
        ) : null}
        {!['select', 'textarea', 'checkbox'].includes(type) ? (
          <input
            id={fieldId}
            type={type}
            value={String(value || '')}
            placeholder={placeholder}
            readOnly={readOnly}
            inputMode={inputMode}
            onChange={(event) => updateBondField(path, event.target.value)}
            className={`mt-2 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12 ${
              readOnly ? 'cursor-not-allowed bg-[#f8fbff] text-[#6b7d93]' : ''
            }`}
          />
        ) : null}
      </label>
    )
  }

  const renderBondApplicantSection = (applicantKey, heading, helperText = '') => {
    const applicant =
      bondApplicants.find((item) => item.key === applicantKey) ||
      getBondApplicationApplicantDefault(applicantKey === 'co_applicant' ? 'co_applicant' : 'primary', portal)
    const idType = normalizePortalStatus(applicant?.id_type)
    const isTemporaryResident = normalizePortalStatus(applicant?.temporary_sa_resident) === 'yes'
    const isMarried = normalizePortalStatus(applicant?.marital_status).startsWith('married')
    const isMarriedAnc = normalizePortalStatus(applicant?.marital_status) === 'married_anc'

    const applicantField = ({ key, label, type = 'text', options = null, required = false, helper = '', hidden = false }) => (
      <label key={`${applicantKey}-${key}`} className="rounded-[14px] border border-[#e3ebf4] bg-white px-3 py-2.5">
        <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
          {label}{required ? ' *' : ''}
        </span>
        {helper ? <span className="mt-1 block text-xs leading-5 text-[#7b8ca2]">{helper}</span> : null}
        {hidden ? null : type === 'select' ? (
          <select
            value={String(applicant?.[key] || '')}
            onChange={(event) => updateBondApplicationApplicantField(applicantKey, key, event.target.value)}
            className="mt-2 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
          >
            {(options || []).map((option) => (
              <option key={`${applicantKey}-${key}-${option.value || 'empty'}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={String(applicant?.[key] || '')}
            onChange={(event) => updateBondApplicationApplicantField(applicantKey, key, event.target.value)}
            className="mt-2 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
          />
        )}
      </label>
    )

    return (
      <article className="space-y-4 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
        <div>
          <h5 className="text-sm font-semibold text-[#142132]">{heading}</h5>
          {helperText ? <p className="mt-1 text-xs leading-5 text-[#6b7d93]">{helperText}</p> : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {applicantField({ key: 'title', label: 'Title', type: 'select', options: BOND_TITLE_OPTIONS, required: true })}
          {applicantField({ key: 'gender', label: 'Gender', type: 'select', options: BOND_GENDER_OPTIONS, required: true })}
          {applicantField({ key: 'first_name', label: 'First names', required: true })}
          {applicantField({ key: 'last_name', label: 'Surname', required: true })}
          {applicantField({ key: 'date_of_birth', label: 'Date of birth', type: 'date', required: true })}
          {applicantField({ key: 'id_type', label: 'ID type', type: 'select', options: BOND_ID_TYPE_OPTIONS, required: true })}
          {applicantField({ key: 'id_number', label: 'ID number', required: idType === 'sa_id', hidden: idType !== 'sa_id' })}
          {applicantField({ key: 'passport_number', label: 'Passport number', required: idType === 'passport', hidden: idType !== 'passport' })}
          {applicantField({ key: 'passport_country_of_issue', label: 'Passport country of issue', required: idType === 'passport', hidden: idType !== 'passport' })}
          {applicantField({ key: 'refugee_id_card_number', label: 'Refugee ID card number', required: idType === 'refugee_id', hidden: idType !== 'refugee_id' })}
          {applicantField({ key: 'sa_citizen', label: 'SA citizen', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'nationality', label: 'Nationality' })}
          {applicantField({ key: 'city_of_birth', label: 'City of birth' })}
          {applicantField({ key: 'country_of_birth', label: 'Country of birth' })}
          {applicantField({ key: 'sa_permanent_resident', label: 'SA permanent resident', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'temporary_sa_resident', label: 'Temporary resident in SA', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'permit_type', label: 'Permit type', hidden: !isTemporaryResident })}
          {applicantField({ key: 'permit_number', label: 'Permit number', hidden: !isTemporaryResident })}
          {applicantField({ key: 'permit_expiry_date', label: 'Permit expiry date', type: 'date', hidden: !isTemporaryResident })}
          {applicantField({ key: 'marital_status', label: 'Marital status', type: 'select', options: BOND_MARITAL_STATUS_OPTIONS, required: true })}
          {applicantField({ key: 'married_anc_register_both_names', label: 'Register in both names', type: 'select', options: BOND_YES_NO_OPTIONS, hidden: !isMarriedAnc })}
          {applicantField({ key: 'country_of_marriage', label: 'Country of marriage', hidden: !isMarried })}
          {applicantField({ key: 'number_of_dependants', label: 'Number of dependants', type: 'number' })}
          {applicantField({ key: 'ethnic_group', label: 'Ethnic group' })}
          {applicantField({ key: 'sa_tax_number', label: 'SA tax number' })}
          {applicantField({ key: 'tax_number_unavailable_reason', label: 'Tax number unavailable reason' })}
          {applicantField({ key: 'tax_returns_outside_sa', label: 'Tax returns outside SA', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'foreign_tax_country', label: 'Foreign tax country' })}
          {applicantField({ key: 'foreign_tax_number', label: 'Foreign tax number' })}
          {applicantField({ key: 'current_residential_status', label: 'Current residential status' })}
          {applicantField({ key: 'first_time_home_buyer', label: 'First-time home buyer', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'main_residence', label: 'Main residence', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'highest_level_of_education', label: 'Highest level of education' })}
          {applicantField({ key: 'smoking_tobacco_ecig_declaration', label: 'Smoking / tobacco / e-cig declaration', type: 'select', options: BOND_YES_NO_OPTIONS })}
        </div>
      </article>
    )
  }

  const bondIncomeSectionFields = (prefix) => ([
    { path: `${prefix}.gross_salary`, label: 'Gross salary', inputMode: 'decimal' },
    { path: `${prefix}.average_commission`, label: 'Average commission', inputMode: 'decimal' },
    { path: `${prefix}.investment_income`, label: 'Investment income', inputMode: 'decimal' },
    { path: `${prefix}.rental_income`, label: 'Rental income', inputMode: 'decimal' },
    { path: `${prefix}.car_allowance`, label: 'Car allowance', inputMode: 'decimal' },
    { path: `${prefix}.travel_allowance`, label: 'Travel allowance', inputMode: 'decimal' },
    { path: `${prefix}.entertainment_allowance`, label: 'Entertainment allowance', inputMode: 'decimal' },
    { path: `${prefix}.income_from_sureties`, label: 'Income from sureties', inputMode: 'decimal' },
    { path: `${prefix}.housing_subsidy`, label: 'Housing subsidy', inputMode: 'decimal' },
    { path: `${prefix}.maintenance_or_alimony_income`, label: 'Maintenance / alimony income', inputMode: 'decimal' },
    { path: `${prefix}.average_overtime`, label: 'Average overtime (6 months)', inputMode: 'decimal' },
    { path: `${prefix}.other_income_description`, label: 'Other income description' },
    { path: `${prefix}.other_income_value`, label: 'Other income value', inputMode: 'decimal' },
    { path: `${prefix}.tax_paye`, label: 'Tax (PAYE / SITE)', inputMode: 'decimal' },
    { path: `${prefix}.pension`, label: 'Pension', inputMode: 'decimal' },
    { path: `${prefix}.uif`, label: 'UIF', inputMode: 'decimal' },
    { path: `${prefix}.medical_aid`, label: 'Medical aid', inputMode: 'decimal' },
    { path: `${prefix}.other_deductions_description`, label: 'Other deductions description' },
    { path: `${prefix}.other_deductions_value`, label: 'Other deductions value', inputMode: 'decimal' },
    { path: `${prefix}.rental_expense`, label: 'Rental expense', inputMode: 'decimal' },
    { path: `${prefix}.maintenance_or_alimony_expense`, label: 'Maintenance / alimony expense', inputMode: 'decimal' },
    { path: `${prefix}.rates_taxes_levies`, label: 'Rates, taxes & levies', inputMode: 'decimal' },
    { path: `${prefix}.water_electricity`, label: 'Water & electricity', inputMode: 'decimal' },
    { path: `${prefix}.assurance_insurance_funeral_ra`, label: 'Assurance / insurance / RA', inputMode: 'decimal' },
    { path: `${prefix}.groceries`, label: 'Groceries', inputMode: 'decimal' },
    { path: `${prefix}.transport`, label: 'Transport / petrol / maintenance', inputMode: 'decimal' },
    { path: `${prefix}.security`, label: 'Security', inputMode: 'decimal' },
    { path: `${prefix}.education`, label: 'Education', inputMode: 'decimal' },
    { path: `${prefix}.medical_excluding_payroll`, label: 'Medical (excluding payroll)', inputMode: 'decimal' },
    { path: `${prefix}.cellphone_internet`, label: 'Cellphone / internet', inputMode: 'decimal' },
    { path: `${prefix}.dstv_tv`, label: 'M-Net / DSTV / TV', inputMode: 'decimal' },
    { path: `${prefix}.other_expenses_description`, label: 'Other expenses description' },
    { path: `${prefix}.other_expenses_value`, label: 'Other expenses value', inputMode: 'decimal' },
  ])

  const sumBondNumericFields = (paths = []) =>
    paths.reduce((total, path) => total + (Number(readBondField(path, 0)) || 0), 0)

  return (
    <main className="min-h-screen bg-[#f3f6fb] text-[#142132]">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col overflow-y-auto bg-[#152432] px-5 py-4 text-slate-100 [background-image:radial-gradient(circle_at_18%_-6%,rgba(108,152,193,0.18)_0%,transparent_34%),linear-gradient(180deg,#243c4f_0%,#152432_100%)] lg:flex">
          <div className="border-b border-white/10 pb-3 pt-[1.2rem]">
            {effectiveWorkspace === 'seller' ? (
              <div className="min-h-[72px]">
                {sellerAgencyLogoUrl ? (
                  <img
                    src={sellerAgencyLogoUrl}
                    alt={`${sellerAgencyName || 'Agency'} logo`}
                    className="max-h-14 max-w-[210px] object-contain object-left"
                  />
                ) : (
                  <h1 className="text-[2rem] font-bold leading-tight tracking-[-0.04em] text-[#f8fbff]">{sellerAgencyName || 'Seller Portal'}</h1>
                )}
                <p className="mt-2 text-[0.82rem] tracking-[0.02em] text-[#c8d5e3]">Seller Portal</p>
              </div>
            ) : (
            <>
              <h1 className="text-[3rem] font-bold leading-none tracking-[-0.05em] text-[#f8fbff]">Arch9</h1>
              <p className="mt-2.5 text-[0.82rem] tracking-[0.02em] text-[#c8d5e3]">Client Transaction Workspace</p>
            <div className="mt-4 rounded-[14px] border border-white/10 bg-[rgba(7,14,24,0.34)] px-3 py-3">
              <label htmlFor="client-journey-selector" className="block text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[#a8bdd2]">
                Journey
              </label>
              <select
                id="client-journey-selector"
                value={selectedJourney}
                onChange={(event) => handleJourneyChange(event.target.value)}
                className="mt-1.5 w-full rounded-[10px] border border-white/12 bg-[rgba(10,20,32,0.55)] px-2.5 py-2 text-sm font-semibold text-white outline-none focus:border-[#7aa3cc] focus:ring-2 focus:ring-[#7aa3cc]/35"
              >
                <option value="buyer">Buying</option>
                <option value="seller">{canSwitchJourney ? 'Selling' : 'Selling (Request access)'}</option>
              </select>
            </div>
            </>
            )}
          </div>

          {effectiveWorkspace === 'seller' ? (
            <nav className="mt-4 grid gap-5 pb-4">
              {SELLER_PORTAL_NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 px-1 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#94a9bd]">{group.label}</p>
                  <div className="grid gap-1">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive = isPortalNavigationItemActive(item, activeSection, location.hash)
                      const navStatus = sidebarStatusByKey[item.key]

                      return (
                        <Link
                          key={item.key}
                          to={getPortalNavigationPath(token, workspaceNavigationScope, item)}
                          className={[
                            'relative flex min-h-[44px] items-center gap-3 rounded-[10px] border px-3 py-2 text-[0.9rem] font-medium transition duration-150 ease-out',
                            isActive
                              ? 'border-[rgba(52,211,153,0.42)] bg-[rgba(22,95,76,0.5)] text-white shadow-[inset_3px_0_0_#2fd18a]'
                              : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white',
                          ].join(' ')}
                        >
                          <Icon size={16} />
                          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-normal [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                            {item.label}
                          </span>
                          {navStatus ? (
                            <span
                              className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold ${
                                isActive
                                  ? 'border-white/40 bg-white/15 text-white'
                                  : 'border-white/15 bg-[rgba(2,6,23,0.24)] text-[#c0cfde]'
                              }`}
                            >
                              {navStatus}
                            </span>
                          ) : null}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div className="mt-2 rounded-[14px] border border-white/12 bg-[rgba(4,30,28,0.52)] p-3">
                <p className="text-sm font-semibold text-white">Need help?</p>
                <p className="mt-1 text-xs leading-5 text-[#c0cfde]">We&apos;re here for you.</p>
                <div className="mt-3 grid gap-2">
                  {sellerAgentEmail ? (
                    <a href={`mailto:${sellerAgentEmail}`} className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-[9px] bg-[#12a06b] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0f855b]">
                      <MessageCircle size={14} />
                      Message Agent
                    </a>
                  ) : null}
                  {sellerAgentPhone ? (
                    <a href={`tel:${sellerAgentPhone}`} className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-[9px] border border-white/12 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/5">
                      <PhoneCall size={14} />
                      Call Agent
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="mt-auto px-1 pb-2 pt-4 text-xs leading-5 text-[#d8e5ef]">
                <p className="font-semibold text-white">{sellerAgencyName || 'Arch9'}</p>
                <p className="text-[#a9bdce]">Real Estate</p>
              </div>
            </nav>
          ) : (
            <nav className="mt-4 grid gap-1 pb-4">
              {portalNavigationItems.map((item) => {
                const Icon = item.icon
                const isActive = isPortalNavigationItemActive(item, activeSection, location.hash)
                const navStatus = sidebarStatusByKey[item.key]

                return (
                  <Link
                    key={item.key}
                    to={getPortalNavigationPath(token, workspaceNavigationScope, item)}
                    className={[
                      'relative flex min-h-[46px] items-center gap-3 rounded-[14px] border px-3 py-2 text-[0.92rem] font-medium transition duration-150 ease-out',
                      isActive
                        ? 'border-[rgba(52,211,153,0.42)] bg-[rgba(2,6,23,0.25)] text-white shadow-[inset_3px_0_0_#2fd18a]'
                        : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white',
                    ].join(' ')}
                  >
                    <Icon size={16} />
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-normal [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {item.label}
                    </span>
                    {navStatus ? (
                      <span
                        className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold ${
                          isActive
                            ? 'border-white/40 bg-white/15 text-white'
                            : 'border-white/15 bg-[rgba(2,6,23,0.24)] text-[#c0cfde]'
                        }`}
                      >
                        {navStatus}
                      </span>
                    ) : null}
                  </Link>
                )
              })}
            </nav>
          )}
        </aside>

        <div className="min-w-0 flex-1 lg:pl-[280px]">
          <div className="border-b border-[#dbe5ef] bg-white/80 px-5 py-4 backdrop-blur lg:hidden">
            {effectiveWorkspace === 'seller' ? (
              <div className="mb-3 flex min-h-[54px] items-center gap-3">
                {sellerAgencyLogoUrl ? (
                  <img src={sellerAgencyLogoUrl} alt={`${sellerAgencyName || 'Agency'} logo`} className="max-h-11 max-w-[180px] object-contain object-left" />
                ) : (
                  <strong className="text-base font-semibold text-[#142132]">{sellerAgencyName || 'Seller Portal'}</strong>
                )}
                <span className="ml-auto text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">Seller Portal</span>
              </div>
            ) : (
            <div className="mb-3 rounded-[12px] border border-[#dbe5ef] bg-[#f8fbff] px-3 py-2.5">
              <label htmlFor="client-journey-selector-mobile" className="block text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">
                Journey
              </label>
              <select
                id="client-journey-selector-mobile"
                value={selectedJourney}
                onChange={(event) => handleJourneyChange(event.target.value)}
                className="mt-1.5 w-full rounded-[10px] border border-[#d5e1ee] bg-white px-2.5 py-2 text-sm font-semibold text-[#21384d] outline-none focus:border-[#9cb8d6] focus:ring-2 focus:ring-[#d7e5f4]"
              >
                <option value="buyer">Buying</option>
                <option value="seller">{canSwitchJourney ? 'Selling' : 'Selling (Request access)'}</option>
              </select>
            </div>
            )}
            <div className="overflow-x-auto">
              <nav className="flex min-w-max items-center gap-2 rounded-[22px] border border-[#e2eaf3] bg-[#f8fbff] p-2 md:min-w-[640px]">
                {portalNavigationItems.map((item) => {
                  const Icon = item.icon
                  const isActive = isPortalNavigationItemActive(item, activeSection, location.hash)
                  return (
                    <Link
                      key={item.key}
                      to={getPortalNavigationPath(token, workspaceNavigationScope, item)}
                      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold transition ${
                        isActive
                          ? 'bg-[#35546c] text-white shadow-[0_12px_24px_rgba(53,84,108,0.18)]'
                          : 'text-[#5f7086] hover:bg-white hover:text-[#142132]'
                      }`}
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>

          <div className="space-y-6 px-3 py-5 md:px-4 md:py-8 xl:px-5">
            {hideSellerWorkspaceHeader ? null : (
            <section className="rounded-[24px] border border-[#223d57] bg-[linear-gradient(135deg,#10253a_0%,#1d3c5b_60%,#2a5078_100%)] px-5 py-5 text-white shadow-[0_20px_36px_rgba(12,24,40,0.3)]">
              <h2 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[#f8fbff]">Welcome, {clientFirstName}</h2>
              <p className="mt-2 text-sm leading-6 text-[#d6e5f3]">
                This is your secure transaction workspace. Your updates, documents, and next steps are kept in one place so
                you can always see what is happening.
              </p>
              <p className="mt-2 text-sm leading-6 text-[#d6e5f3]">
                {effectiveWorkspace === 'seller'
                  ? 'Track your sale from onboarding through mandate, offers, and transfer with clear progress updates.'
                  : 'Track your purchase from onboarding to registration with clear stage-by-stage guidance.'}
              </p>
            </section>
            )}

            {hideSellerWorkspaceHeader ? null : (
            <section className="rounded-[28px] border border-[#dbe5ef] bg-white px-6 py-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
              {effectiveWorkspace === 'seller' ? (
                <div>
                  <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                    Selling Workspace
                  </span>
                  <h1 className="mt-3 text-[1.75rem] font-semibold tracking-[-0.04em] text-[#142132]">
                    {hasSellingContext ? 'Property Sale Journey' : 'Thinking of selling your property?'}
                  </h1>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                    {hasSellingContext
                      ? 'Your seller workflow is active and linked to your Arch9 record.'
                      : 'Let your agent know you would like to sell a property and they can help you start onboarding.'}
                  </p>
                </div>
              ) : isOverview ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                        Client Portal Overview
                      </span>
                      {hydratingPortal ? (
                        <span className="inline-flex items-center rounded-full border border-info/35 bg-infoSoft px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-info">
                          Updating
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="relative" ref={notificationsRef}>
                        <button
                          type="button"
                          onClick={() => setNotificationsOpen((previous) => !previous)}
                          className="relative inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#dbe5ef] bg-white text-[#4f647b] transition hover:border-[#b9cbde] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8d8e7]"
                          aria-label="Notifications"
                          aria-expanded={notificationsOpen}
                        >
                          <Bell size={16} />
                          {unreadNotificationCount > 0 ? (
                            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#d97706] px-1.5 text-[0.64rem] font-semibold text-white">
                              {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                            </span>
                          ) : null}
                        </button>

                        {notificationsOpen ? (
                          <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[min(92vw,380px)] rounded-[16px] border border-[#dbe5ef] bg-white p-3 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
                            <div className="mb-2 flex items-center justify-between gap-2 px-1">
                              <strong className="text-sm font-semibold text-[#142132]">Notifications</strong>
                              <div className="flex items-center gap-2 text-xs font-medium text-[#7b8ca2]">
                                <span>{notificationItems.length ? `${notificationItems.length} items` : 'No updates'}</span>
                                {unreadNotificationCount > 0 ? (
                                  <button
                                    type="button"
                                    onClick={handleMarkAllNotificationsRead}
                                    className="rounded-md border border-[#dbe5ef] px-2 py-0.5 text-[0.68rem] font-semibold text-[#35546c] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                                  >
                                    Mark all read
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                              {notificationItems.length ? (
                                notificationItems.map((item) => (
                                  <div
                                    key={item.id}
                                    className={`w-full rounded-[12px] border px-3 py-2.5 text-left transition ${
                                      item.tone === 'action'
                                        ? 'border-[#f0d8ae] bg-[#fff7eb] hover:border-[#e4c994]'
                                        : 'border-[#e3ebf4] bg-[#fbfdff] hover:border-[#cfdceb] hover:bg-white'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <strong className="text-sm font-semibold text-[#142132]">{item.title}</strong>
                                      <time className="shrink-0 text-[0.68rem] font-medium text-[#7b8ca2]">
                                        {formatClientNotificationTime(item.createdAt)}
                                      </time>
                                    </div>
                                    <p className="mt-1.5 text-sm leading-6 text-[#51657b]">{item.message}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await handleMarkNotificationRead(item.id)
                                          setNotificationsOpen(false)
                                          navigate(getPortalWorkspacePath(token, workspaceNavigationScope, item.to || 'overview'))
                                        }}
                                        className="rounded-md border border-[#dbe5ef] px-2.5 py-1 text-[0.68rem] font-semibold text-[#35546c] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                                      >
                                        {item.actionLabel || 'Open'}
                                      </button>
                                      {item.status === 'unread' ? (
                                        <button
                                          type="button"
                                          onClick={() => handleMarkNotificationRead(item.id)}
                                          className="rounded-md border border-[#dbe5ef] px-2.5 py-1 text-[0.68rem] font-semibold text-[#5c6f86] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                                        >
                                          Mark read
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => handleDismissNotification(item.id)}
                                        className="rounded-md border border-[#f0d8ae] px-2.5 py-1 text-[0.68rem] font-semibold text-[#9a5b0f] transition hover:border-[#e2c48f] hover:bg-[#fff8ed]"
                                      >
                                        Dismiss
                                      </button>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-[12px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-3 py-3 text-sm text-[#6b7d93]">
                                  <p className="font-semibold text-[#35546c]">You&apos;re all caught up</p>
                                  <p className="mt-1">No unread notifications.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <span className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-3 text-sm font-semibold text-[#21384d]">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#eef4fb] text-[0.68rem] font-semibold text-[#35546c]">
                          {buyerInitial}
                        </span>
                      </span>
                    </div>
                  </div>

                  <article className="rounded-[22px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h1 className="text-[1.95rem] font-semibold leading-tight tracking-[-0.05em] text-[#142132] sm:text-[2.2rem]">
                          {developmentName}
                        </h1>
                        <p className="mt-1.5 text-[1.03rem] font-semibold text-[#35546c]">{unitLabel}</p>
                        <p className="mt-1 text-sm text-[#6b7d93]">{buyerName}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${heroStatusBadge.className}`}>
                        {heroStatusBadge.label}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <article className="rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Current stage</span>
                        <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{MAIN_STAGE_LABELS[mainStage]}</strong>
                      </article>
                      <article className="rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Purchase price</span>
                        <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{purchasePriceLabel}</strong>
                      </article>
                      <article className="rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Active for</span>
                        <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{timeInStageLabel} active</strong>
                        <span className="mt-1 block text-xs font-medium text-[#6b7d93]">Updated {stageUpdatedDateLabel}</span>
                      </article>
                      <article className="rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Next stage</span>
                        <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{nextStage}</strong>
                      </article>
                    </div>
                  </article>

                  <article className="rounded-[20px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">
                        {progressPercent}% complete
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                        Current: {MAIN_STAGE_LABELS[mainStage]} • Next: {nextStage}
                      </span>
                    </div>
                    <div className="mt-3">
                      <TransactionLifecycleProgress
                        transaction={portal?.transaction}
                        mainStage={mainStage}
                        subprocesses={portal?.subprocesses || []}
                        compact
                        premium
                        framed={false}
                        showCurrentSummary={false}
                      />
                    </div>
                  </article>

                  <article className="rounded-[20px] border border-[#dbe5ef] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Your next step</span>
                        <h3 className="mt-1 text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">{nextStepState.title}</h3>
                      </div>
                      <Link
                        to={getPortalWorkspacePath(token, workspaceNavigationScope, primaryOverviewAction.to)}
                        className={`inline-flex min-h-[42px] items-center justify-center rounded-[12px] px-4 py-2 text-sm font-semibold transition ${primaryOverviewActionClasses}`}
                      >
                        {primaryOverviewAction.label}
                      </Link>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#566b82]">{nextStepState.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      {secondaryOverviewActions.map((action) => {
                        const Icon = action.icon
                        return (
                          <Link
                            key={action.to}
                            to={getPortalWorkspacePath(token, workspaceNavigationScope, action.to)}
                            className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-[11px] border border-[#d1deeb] bg-white px-3 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8d8e7]"
                          >
                            <Icon size={14} />
                            {action.label}
                          </Link>
                        )
                      })}
                    </div>
                  </article>

                  <article className="rounded-[20px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Portal access</span>
                        <h3 className="mt-1 text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">Secure buyer link active</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#566b82]">{buyerPortalAccessDescription}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {buyerPortalStatusItems.map((item) => (
                        <article key={item.key} className="rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                          <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">{item.label}</span>
                          <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{item.value}</strong>
                          <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold ${buyerPortalStatusToneClasses[item.tone] || buyerPortalStatusToneClasses.neutral}`}>
                            {item.detail}
                          </span>
                        </article>
                      ))}
                    </div>
                  </article>
                </div>
              ) : isDocuments || isHandover || isBondApplication ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#4a5f77]">
                      {isBondApplication ? `Application status: ${bondApplicationStatus}` : workspaceHeaderStatusLabel}
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      <Link
                        to={getClientPortalPath(token, 'documents')}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-3.5 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                      >
                        <FileText size={15} />
                        Documents
                      </Link>
                      {isHandover || isBondApplication ? (
                        <Link
                          to={getClientPortalPath(token, 'overview')}
                          className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-3.5 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                        >
                          <LayoutDashboard size={15} />
                          Overview
                        </Link>
                      ) : (
                        <Link
                          to={getClientPortalPath(token, 'handover')}
                          className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-3.5 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                        >
                          <KeyRound size={15} />
                          Handover
                        </Link>
                      )}
                      <Link
                        to={getClientPortalPath(token, 'team')}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] bg-[#2f5478] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#254664]"
                      >
                        <Users size={15} />
                        Team Contacts
                      </Link>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h1 className="flex flex-wrap items-center gap-3 text-[2.1rem] font-semibold leading-tight tracking-[-0.05em] text-[#142132] sm:text-[2.25rem]">
                      <span>{developmentName}</span>
                      <span className="hidden text-[#90a2b6] sm:inline">|</span>
                      <span className="inline-flex items-center rounded-full border border-[#d1deeb] bg-[#f4f8fc] px-4 py-2 text-[1.25rem] tracking-[-0.03em] text-[#35546c]">
                        {unitLabel}
                      </span>
                    </h1>
                    <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">{buyerName}</p>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                    {activeSectionLabel}
                  </span>
                  <h1 className="mt-3 text-[1.75rem] font-semibold tracking-[-0.04em] text-[#142132]">{developmentName} | {unitLabel}</h1>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                    {buyerName} • Last updated {new Date(portal.lastUpdated).toLocaleString()}
                  </p>
                </div>
              )}
            </section>
            )}

            {error ? <p className="rounded-[18px] border border-[#f1cbc7] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}

            {isOverview ? (
              effectiveWorkspace === 'seller' ? (
                <section className="space-y-5">
                  {hasSellingContext ? (
                    <SellerPortalDashboard
                      sellerFirstName={sellerFirstName}
                      sellerAgentName={sellerAgentName}
                      sellerAgentPhone={sellerAgentPhone}
                      sellerAgentEmail={sellerAgentEmail}
                      sellerAgentAvatarUrl={sellerAgentAvatarUrl}
                      sellerAgencyName={sellerAgencyName}
                      sellerPropertyTitle={sellerPropertyTitle}
                      sellerPropertyImageUrl={sellerPropertyImageUrl}
                      sellerStatusLabel={sellerDashboardStatusLabel}
                      sellerHealth={sellerHealth}
                      sellerListingProgressModel={sellerListingProgressModel}
                      sellerSaleProgressModel={sellerSaleProgressModel}
                      sellerMarketingChannels={sellerMarketingChannels}
                      sellerAgentUpdate={sellerAgentUpdate}
                      sellerTimelineItems={sellerTimelineItems}
                      sellerChatUpdates={sellerActivityItems}
                      sellerDocumentTracker={sellerDocumentTracker}
                      sellerListingUrl={sellerListingUrl}
                      commentDraft={commentDraft}
                      savingComment={saving}
                      onCommentDraftChange={setCommentDraft}
                      onCommentSubmit={handleSubmitPortalComment}
                      token={token}
                      workspaceNavigationScope={workspaceNavigationScope}
                    />
                  ) : (
                    <form className="space-y-4" onSubmit={handleSubmitSellerAssistanceRequest}>
                      <p className="text-sm text-[#5f7086]">
                        Let your agent know you would like to sell a property and they can help you start the seller onboarding process.
                      </p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1.5">
                          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7d93]">Property address</span>
                          <input
                            className="rounded-[12px] border border-[#d5e1ee] bg-white px-3 py-2 text-sm text-[#142132] outline-none focus:border-[#9cb8d6] focus:ring-2 focus:ring-[#d7e5f4]"
                            value={sellerRequestForm.propertyAddress}
                            onChange={(event) => setSellerRequestForm((previous) => ({ ...previous, propertyAddress: event.target.value }))}
                            placeholder="Street address or suburb"
                          />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7d93]">Preferred contact method</span>
                          <select
                            className="rounded-[12px] border border-[#d5e1ee] bg-white px-3 py-2 text-sm text-[#142132] outline-none focus:border-[#9cb8d6] focus:ring-2 focus:ring-[#d7e5f4]"
                            value={sellerRequestForm.preferredContactMethod}
                            onChange={(event) => setSellerRequestForm((previous) => ({ ...previous, preferredContactMethod: event.target.value }))}
                          >
                            <option value="email">Email</option>
                            <option value="phone">Phone call</option>
                            <option value="whatsapp">WhatsApp</option>
                          </select>
                        </label>
                      </div>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7d93]">Message</span>
                        <textarea
                          className="min-h-[100px] rounded-[12px] border border-[#d5e1ee] bg-white px-3 py-2 text-sm text-[#142132] outline-none focus:border-[#9cb8d6] focus:ring-2 focus:ring-[#d7e5f4]"
                          value={sellerRequestForm.message}
                          onChange={(event) => setSellerRequestForm((previous) => ({ ...previous, message: event.target.value }))}
                          placeholder="Tell us a bit about your property and when you'd like to be contacted."
                        />
                      </label>
                      {sellerRequestFeedback.message ? (
                        <p className={`rounded-[12px] border px-3 py-2 text-sm ${
                          sellerRequestFeedback.tone === 'success'
                            ? 'border-[#cde7d5] bg-[#eefbf3] text-[#1f7d44]'
                            : 'border-[#f1cbc7] bg-[#fff5f4] text-[#b42318]'
                        }`}>
                          {sellerRequestFeedback.message}
                        </p>
                      ) : null}
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="inline-flex min-h-[42px] items-center justify-center rounded-[12px] bg-[#2f5478] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#254664] disabled:cursor-not-allowed disabled:opacity-70"
                          disabled={saving}
                        >
                          {saving ? 'Sending…' : 'Request Seller Assistance'}
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              ) : (
              <>
                {effectiveWorkspace !== 'seller' && showReservationDepositUploadCard ? (
                  <section className="rounded-[22px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                    <div className="grid gap-5 lg:grid-cols-[1.45fr_0.55fr]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">Reservation Deposit Required</h3>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getStatusToneClasses(reservationProofStatusLabel)}`}>
                            {reservationProofStatusLabel}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                          Please pay the reservation deposit and upload proof of payment so your team can verify and continue.
                        </p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
                            <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Amount due</span>
                            <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{reservationAmountLabel}</strong>
                          </article>
                          <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
                            <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Amount type</span>
                            <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{reservationAmountTypeLabel}</strong>
                          </article>
                          <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
                            <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">How it is treated</span>
                            <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{reservationTreatmentLabel}</strong>
                          </article>
                          <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
                            <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Payable to</span>
                            <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{reservationPayableToLabel}</strong>
                          </article>
                          <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
                            <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Current status</span>
                            <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{reservationProofStatusLabel}</strong>
                          </article>
                        </div>

                        <p className="mt-3 rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3 py-2 text-xs leading-5 text-[#5f7288]">
                          {reservationTreatmentDescription}
                        </p>

                        {reservationProofUploaded ? (
                          <div className="mt-3 space-y-1 text-xs text-[#6b7d93]">
                            <p>
                              File: <span className="font-medium text-[#324559]">{reservationProofFileName || 'Reservation deposit proof of payment'}</span>
                            </p>
                            <p>Uploaded: {formatShortPortalDate(reservationProofUploadedAt, 'Recently')}</p>
                          </div>
                        ) : null}

                        {reservationPaymentInstructions ? (
                          <p className="mt-3 text-sm leading-6 text-[#566b82]">{reservationPaymentInstructions}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-col justify-end gap-2.5">
                        <button
                          type="button"
                          disabled={uploadingDocumentKey === reservationProofUploadStateKey}
                          onClick={() => reservationProofInputRef.current?.click()}
                          className="inline-flex min-h-[42px] items-center justify-center rounded-[12px] bg-[#35546c] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#7e95ab]"
                        >
                          {uploadingDocumentKey === reservationProofUploadStateKey
                            ? 'Uploading...'
                            : reservationProofUploaded
                              ? 'Replace proof of payment'
                              : 'Upload proof of payment'}
                        </button>
                        <input
                          ref={reservationProofInputRef}
                          type="file"
                          className="hidden"
                          disabled={uploadingDocumentKey === reservationProofUploadStateKey}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) {
                              if (reservationProofRequirement?.key) {
                                void handleUploadRequiredDocument(reservationProofRequirement.key, file)
                              } else {
                                void handleUploadReservationDepositProof(file)
                              }
                            }
                            event.target.value = ''
                          }}
                        />
                        {reservationProofUploadFeedback.message ? (
                          <p className={`rounded-[10px] border px-3 py-2 text-xs font-medium ${reservationProofUploadFeedbackClasses}`}>
                            {reservationProofUploadFeedback.message}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </section>
                ) : null}

                <section className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[1.1rem] font-semibold tracking-[-0.03em] text-[#142132]">What You Need To Do Now</h3>
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                      {blockingActionCount} blocking
                    </span>
                  </div>
                  {prioritizedNextActions.length ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {prioritizedNextActions.map((action) => {
                        const normalizedPriority = normalizePortalStatus(action?.priority)
                        const priorityClasses =
                          normalizedPriority === 'urgent'
                            ? 'border-[#f5c9bf] bg-[#fff3ef] text-[#b5472d]'
                            : normalizedPriority === 'high'
                              ? 'border-[#f0d8ae] bg-[#fff6e7] text-[#9a5b0f]'
                              : normalizedPriority === 'informational'
                                ? 'border-[#d6e3f1] bg-[#eef5fb] text-[#35546c]'
                                : 'border-[#dde7f1] bg-[#f8fbff] text-[#5f7086]'
                        const toneClasses = action?.blocking
                          ? 'border-[#f1ddd0] bg-[#fff8f3]'
                          : 'border-[#dbe5ef] bg-[#fcfdff]'
                        const dueDateLabel = action?.dueDate ? formatShortPortalDate(action.dueDate, '') : ''
                        const actionRoute = String(action?.actionRoute || '').trim() || 'overview'
                        const actionLabel = String(action?.actionLabel || 'Open').trim()
                        return (
                          <article key={action?.id || `${action?.type}-${action?.title}`} className={`rounded-[14px] border px-3.5 py-3 ${toneClasses}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] ${priorityClasses}`}>
                                {toTitleLabel(normalizedPriority || 'normal')}
                              </span>
                              {action?.blocking ? (
                                <span className="inline-flex items-center rounded-full border border-[#f0d8ae] bg-[#fff6e7] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#9a5b0f]">
                                  Blocking
                                </span>
                              ) : null}
                              {dueDateLabel ? (
                                <span className="text-[0.68rem] font-medium text-[#6b7d93]">Due {dueDateLabel}</span>
                              ) : null}
                            </div>
                            <h4 className="mt-2 text-sm font-semibold text-[#142132]">{action?.title || 'Action required'}</h4>
                            <p className="mt-1 text-sm leading-6 text-[#566b82]">{action?.description || 'Please review this item.'}</p>
                            {action?.educationalSummary ? (
                              <p className="mt-1 text-xs leading-5 text-[#5f738a]">Why this matters: {action.educationalSummary}</p>
                            ) : null}
                            <div className="mt-3">
                              <Link
                                to={getPortalWorkspacePath(token, workspaceNavigationScope, actionRoute)}
                                className="inline-flex min-h-[36px] items-center justify-center rounded-[10px] border border-[#d1deeb] bg-white px-3 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                              >
                                {actionLabel}
                              </Link>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-[12px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-3 py-3 text-sm leading-6 text-[#6b7d93]">
                      You have no actions required at the moment.
                    </p>
                  )}
                  {hiddenNextActionCount > 0 ? (
                    <p className="mt-3 text-xs font-medium text-[#6b7d93]">
                      {hiddenNextActionCount} more action{hiddenNextActionCount === 1 ? '' : 's'} are available in your full workflow.
                    </p>
                  ) : null}
                </section>

                <section className="grid gap-6 xl:grid-cols-2">
                  <MvpTransactionControlBoard controlBoard={workspaceData?.mvpControlBoard} compact />
                  <PurchaseJourneyCard
                  progressPercent={journeyProgressPercent}
                  currentStageLabel={journeyCurrentStageLabel}
                  nextStageLabel={journeyNextStageLabel}
                  journeyStatus={journeyStatusFlag}
                  steps={clientJourneySteps}
                  expandedStepId={resolvedExpandedJourneyStepId}
                  title={effectiveWorkspace === 'seller' ? 'Your Sale Journey' : 'Your Purchase Journey'}
                  subtitle={
                    effectiveWorkspace === 'seller'
                      ? 'Track each milestone from seller onboarding to transfer registration.'
                      : 'Track each milestone from reservation through registration.'
                  }
                  onToggleStep={(stepId) =>
                    setExpandedJourneyStepId((previous) => (previous === stepId ? null : stepId))
                  }
                  />
                  <LatestUpdatesCard
                  updates={latestJourneyFeedItems}
                  commentDraft={commentDraft}
                  saving={saving}
                  onCommentDraftChange={setCommentDraft}
                  onCommentSubmit={handleSubmitPortalComment}
                  onActionClick={handleActivityAction}
                  heading="Recent Updates"
                  subtitle={latestUpdatesSubtitle}
                />
                </section>

                <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  <article className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                      Current Stage
                    </span>
                    <h3 className="mt-2 text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">{journeyCurrentStageLabel}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#566b82]">{journeyHeroSubtext}</p>
                    <p className="mt-3 text-xs font-medium text-[#7b8ca2]">Next: {journeyNextStageLabel}</p>
                  </article>

                  <article className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                      Next Step For You
                    </span>
                    <h3 className="mt-2 text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">{nextStepState.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#566b82]">{nextStepState.description}</p>
                    <div className="mt-4">
                      <Link
                        to={getPortalWorkspacePath(token, workspaceNavigationScope, primaryOverviewAction.to)}
                        className={`inline-flex min-h-[42px] items-center justify-center rounded-[12px] px-4 py-2 text-sm font-semibold transition ${primaryOverviewActionClasses}`}
                      >
                        {primaryOverviewAction.label}
                      </Link>
                    </div>
                  </article>

                  <article className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                      What Happens Next
                    </span>
                    <ul className="mt-3 space-y-2.5 text-sm leading-6 text-[#324559]">
                      {whatHappensNextItems.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#8ba0b8]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
                    <h3 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">Handover status</h3>
                    <div className="mt-3 space-y-2.5 rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3.5 text-sm">
                      <div>
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Estimated handover</span>
                        <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">
                          {formatClientPortalDate(portal?.handover?.handoverDate, 'Awaiting schedule')}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Status</span>
                        <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{toTitleLabel(handoverStatus)}</strong>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
                    <h3 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">Snag summary</h3>
                    {portal?.settings?.snag_reporting_enabled ? (
                      <div className="mt-3 grid grid-cols-2 gap-2.5">
                        <article className="rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3 py-3">
                          <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Open</span>
                          <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{snagOpenCount}</strong>
                        </article>
                        <article className="rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3 py-3">
                          <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Resolved</span>
                          <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{snagResolvedCount}</strong>
                        </article>
                      </div>
                    ) : (
                      <p className="mt-3 rounded-[12px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-3 py-3 text-sm leading-6 text-[#6b7d93]">
                        Snag reporting is not active for this transaction.
                      </p>
                    )}
                  </article>

                  <article className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)] md:col-span-2 xl:col-span-1">
                    <h3 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">What&apos;s happening</h3>
                    <ul className="mt-3 space-y-2.5 text-sm leading-6 text-[#324559]">
                      {whatsHappeningSummary.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#8ba0b8]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)] md:col-span-2 xl:col-span-3">
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                      Stage Guide
                    </span>
                    <h3 className="mt-2 text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">
                      {stageEducation?.title || 'Transaction stage in progress'}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#566b82]">
                      {stageEducation?.detailedExplanation || stageEducation?.shortDescription || 'This stage is currently in progress.'}
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">What you need to do</span>
                        <p className="mt-1.5 text-sm leading-6 text-[#324559]">
                          {stageEducation?.whatClientNeedsToDo || 'No action is required unless your team requests something.'}
                        </p>
                      </article>
                      <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">What happens next</span>
                        <p className="mt-1.5 text-sm leading-6 text-[#324559]">
                          {stageEducation?.whatHappensNext || 'Your team will guide you through the next stage.'}
                        </p>
                      </article>
                    </div>
                    {rolePlayerGuidance.length ? (
                      <div className="mt-3">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Role players at this stage</span>
                        <ul className="mt-2 space-y-1.5 text-sm leading-6 text-[#324559]">
                          {rolePlayerGuidance.slice(0, 3).map((entry) => (
                            <li key={entry?.key} className="flex items-start gap-2">
                              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#8ba0b8]" />
                              <span>{entry?.explanation}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </article>
                </section>
              </>
              )
            ) : null}

            {isProgress && effectiveWorkspace === 'seller' ? (
              <TransactionStageWorkspace
                currentStageKey={sellerTransactionStageKey}
                startedAt={
                  portal?.transaction?.stage_updated_at ||
                  portal?.transaction?.updated_at ||
                  portal?.lastUpdated
                }
                completedAt={portal?.transaction?.completed_at || portal?.transaction?.registered_at}
                pendingAction={sellerProgressAction}
                activity={sellerActivityItems}
                participants={sellerProgressParticipants}
                overviewPath={getPortalWorkspacePath(token, workspaceNavigationScope, 'overview')}
                documentsPath={getPortalWorkspacePath(token, workspaceNavigationScope, 'documents')}
                listingUrl={sellerListingUrl}
                agentEmail={sellerAgentEmail}
              />
            ) : null}

            {isAppointments ? (
              <ClientAppointmentsSection
                appointments={clientVisibleAppointments}
                workspace={effectiveWorkspace === 'seller' ? 'selling' : 'buying'}
                documentCenter={workspaceData?.documentCenter || {}}
                hideHeader={effectiveWorkspace === 'seller'}
                pendingAction={appointmentActionPending}
                feedbackMessage={appointmentFeedback}
                onConfirmAppointment={(appointment) => {
                  void handleRespondToAppointment(appointment, 'confirm')
                }}
                onDeclineAppointment={(appointment) => {
                  void handleRespondToAppointment(appointment, 'decline')
                }}
                onRequestReschedule={(appointment, payload) => {
                  void handleRespondToAppointment(appointment, 'reschedule', payload || {})
                }}
              />
            ) : null}

            {isOffers && effectiveWorkspace === 'seller' ? (
              <SellerOffersPage
                offers={rawSellerOffers}
                askingPrice={sellerOfferAskingPrice}
                transactionId={portal?.transaction?.id || ''}
                propertyId={sellerListingId || portal?.unit?.id || ''}
                agent={{
                  name: sellerAgentName,
                  email: sellerAgentEmail,
                  phone: sellerAgentPhone,
                }}
              />
            ) : null}

            {isDetails ? (
              effectiveWorkspace === 'seller' ? (
                <SellerMyDetailsReadonlyPage sections={sellerDetailsSections} />
              ) : (
              <section className="space-y-5">
                <header className="rounded-[26px] border border-[#dbe5ef] bg-white px-6 py-6 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
                  <h3 className="text-[1.36rem] font-semibold tracking-[-0.03em] text-[#142132]">My Details</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Review and update your information for this purchase.</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6edf5] pt-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-[#5f7288]">
                      <span className="font-medium text-[#274055]">{myDetailsRequiredCompleted}/{myDetailsRequiredTotal || 0} required fields complete</span>
                      <span className="hidden text-[#a2b2c4] sm:inline">•</span>
                      <span>{myDetailsCompletionPercent}% completion</span>
                      <span className="hidden text-[#a2b2c4] sm:inline">•</span>
                      <span>{myDetailsCapturedFields}/{myDetailsFieldCount || 0} fields captured</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadOnboardingSummary}
                      className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white"
                    >
                      <Download size={14} />
                      Download Summary
                    </button>
                  </div>
                </header>

                {myDetailsSections.map((section) => {
                  const isEditingSection = myDetailsEditingSection === section.key
                  const isSavingSection = myDetailsSavingSection === section.key
                  const editingLocked = Boolean(myDetailsEditingSection) && !isEditingSection
                  const sectionStatusLabel = section.complete ? 'Complete' : section.inProgress ? 'In progress' : 'Incomplete'
                  const sectionStatusToneClasses = section.complete
                    ? 'bg-[#35a26b]'
                    : section.inProgress
                      ? 'bg-[#dd9d2f]'
                      : 'bg-[#b8c7d8]'
                  const isPurchaseDetailsSection = section.key === 'purchase_details'
                  const detailsCardClassName = isPurchaseDetailsSection
                    ? 'border-[#cfdfee] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]'
                    : 'border-[#dbe5ef] bg-white'

                  return (
                    <article
                      key={section.key}
                      className={`rounded-[24px] border p-6 shadow-[0_12px_28px_rgba(15,23,42,0.05)] transition duration-200 ${detailsCardClassName} ${
                        isEditingSection ? 'shadow-[0_18px_32px_rgba(15,23,42,0.07)]' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">{section.title}</h4>
                          <div className="mt-1.5 inline-flex items-center gap-2 text-xs font-medium text-[#6b7d93]">
                            <span className={`inline-flex h-2 w-2 rounded-full ${sectionStatusToneClasses}`} />
                            <span>{sectionStatusLabel}</span>
                            <span>•</span>
                            <span>
                              {section.requiredTotalCount > 0
                                ? `${section.requiredCompleteCount}/${section.requiredTotalCount} required`
                                : `${section.capturedCount}/${section.fields.length} captured`}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">{section.description}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isEditingSection ? (
                            <>
                              <button
                                type="button"
                                disabled={isSavingSection}
                                onClick={handleCancelMyDetailsEdit}
                                className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#3f566e] transition hover:border-[#c8d8e9] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={isSavingSection}
                                onClick={() => handleSaveMyDetailsSection(section.key)}
                                className="inline-flex items-center rounded-full bg-[#2f5478] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#244463] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSavingSection ? 'Saving...' : 'Save section'}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={editingLocked}
                              onClick={() => setMyDetailsEditingSection(section.key)}
                              className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Edit section
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {section.fields.map((field) => {
                          const fieldId = `my-details-${section.key}-${field.key}`
                          const displayValue = formatMyDetailsFieldDisplayValue(field, field.value)

                          if (isEditingSection) {
                            return (
                              <label key={field.key} htmlFor={fieldId} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                                <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">
                                  {field.label}{field.required ? ' *' : ''}
                                </span>
                                {field.type === 'select' ? (
                                  <select
                                    id={fieldId}
                                    value={field.value ?? ''}
                                    onChange={(event) => handleMyDetailsFieldChange(field.key, event.target.value)}
                                    className="mt-2 w-full rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2.5 text-sm text-[#162334] outline-none transition focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                                  >
                                    {(field.options || [{ value: '', label: 'Select option' }]).map((option) => (
                                      <option key={`${field.key}-${option.value || 'empty'}`} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    id={fieldId}
                                    type={field.type || 'text'}
                                    inputMode={field.type === 'number' ? 'decimal' : undefined}
                                    value={field.value ?? ''}
                                    onChange={(event) => handleMyDetailsFieldChange(field.key, event.target.value)}
                                    className="mt-2 w-full rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2.5 text-sm text-[#162334] outline-none transition placeholder:text-[#8aa0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                                  />
                                )}
                              </label>
                            )
                          }

                          return (
                            <article key={field.key} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                              <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{field.label}</span>
                              <strong className="mt-1.5 block text-sm font-semibold leading-7 text-[#142132]">{displayValue}</strong>
                            </article>
                          )
                        })}
                      </div>
                    </article>
                  )
                })}
              </section>
              )
            ) : null}

            {isBondApplication ? (
              <section className="space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
                <header className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Bond Application</span>
                      <h3 className="mt-2 text-[1.26rem] font-semibold tracking-[-0.03em] text-[#142132]">{bondApplicationApplicantHeader}</h3>
                      <p className="mt-1 text-sm text-[#6b7d93]">
                        {unitLabel} • {developmentName}
                      </p>
                      <p className="mt-2 text-sm text-[#5f7288]">
                        Purchase price <strong className="text-[#142132]">{purchasePriceLabel}</strong>
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${bondApplicationStatusClasses}`}>
                      {bondApplicationStatus}
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                      <span>Application completion</span>
                      <span>{bondApplicationProgressPercent}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[#e4ebf3]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#3f78b1_0%,#2f8a64_100%)] transition-all duration-300"
                        style={{ width: `${bondApplicationProgressPercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <Link
                      to={getClientPortalPath(token, 'overview')}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] border border-[#d1deeb] bg-white px-3 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                    >
                      <LayoutDashboard size={13} />
                      Overview
                    </Link>
                    <Link
                      to={getClientPortalPath(token, 'documents')}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] border border-[#d1deeb] bg-white px-3 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                    >
                      <FileText size={13} />
                      Documents
                    </Link>
                    <Link
                      to={getClientPortalPath(token, 'team')}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] bg-[#2f5478] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#254664]"
                    >
                      <Users size={13} />
                      Team Contacts
                    </Link>
                  </div>
                </header>

                <div className="overflow-x-auto">
                  <nav className="inline-flex min-w-full gap-2 rounded-[18px] border border-[#e2eaf3] bg-[#f8fbff] p-2">
                    {BOND_APPLICATION_TABS.map((tab) => {
                      const isActive = activeBondApplicationTab === tab.key
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => {
                            void handleBondApplicationTabChange(tab.key)
                          }}
                          className={`inline-flex min-h-[44px] min-w-[150px] items-center justify-center rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
                            isActive
                              ? 'border border-[#d1deeb] bg-white text-[#142132] shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
                              : 'border border-transparent text-[#5f7086] hover:border-[#d8e4ef] hover:bg-white hover:text-[#142132]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      )
                    })}
                  </nav>
                </div>

                {activeBondApplicationTab === 'application' ? (
                  <section className="space-y-5 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Application</h4>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                          Structured around the OOBA interview flow. Prefilled values come from onboarding and My Details.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void persistBondApplicationDraft()
                        }}
                        disabled={bondApplicationSaving || !bondApplicationDirty}
                        className="inline-flex min-h-[40px] items-center rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                      >
                        {bondApplicationSaving ? 'Saving...' : 'Save Progress'}
                      </button>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
                      <aside className="rounded-[16px] border border-[#e3ebf4] bg-white p-3 lg:sticky lg:top-6 lg:h-fit">
                        <nav className="space-y-1.5">
                          {BOND_APPLICATION_SECTION_TABS.map((section) => {
                            const isActive = section.key === activeBondApplicationSectionTab
                            const status = bondApplicationSectionStatusByKey[section.key]
                            const statusLabel = status?.isComplete ? 'Complete' : status?.hasMissing ? `${status.complete}/${status.total}` : 'Pending'
                            return (
                              <button
                                key={section.key}
                                type="button"
                                onClick={() => {
                                  void handleBondApplicationSectionChange(section.key)
                                }}
                                className={`flex w-full items-center justify-between rounded-[12px] border px-3 py-2 text-left transition ${
                                  isActive
                                    ? 'border-[#b9ccdf] bg-[#eef4fb] text-[#1f3449]'
                                    : status?.isComplete
                                      ? 'border-[#d4e8dc] bg-[#f5fbf7] text-[#2f7a51] hover:border-[#c8dfd2]'
                                      : status?.hasMissing
                                        ? 'border-[#ead9c6] bg-[#fffaf3] text-[#8a5a22] hover:border-[#e2c9ab]'
                                        : 'border-[#e3ebf4] bg-white text-[#5f7086] hover:border-[#d3e0ed]'
                                }`}
                              >
                                <span className="pr-3 text-sm font-semibold">{section.label}</span>
                                <span className="text-[0.66rem] font-semibold uppercase tracking-[0.08em]">{statusLabel}</span>
                              </button>
                            )
                          })}
                        </nav>
                      </aside>

                      <div className="space-y-4 rounded-[18px] border border-[#e3ebf4] bg-white p-4">
                        <div className="border-b border-[#e6edf5] pb-3">
                          <h5 className="text-[1.05rem] font-semibold text-[#142132]">{activeBondApplicationSectionMeta?.label}</h5>
                        </div>

                        {activeBondApplicationSectionTab === 'summary' ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {renderBondInputField({ path: 'summary.applicant_name', label: 'Applicant name', required: true, helperText: 'Pre-filled from onboarding.' })}
                              {renderBondInputField({ path: 'summary.has_co_applicant', label: 'Co-applicant present', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'summary.has_surety', label: 'Surety present', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'summary.property_reference', label: 'Property reference', required: true })}
                              {renderBondInputField({ path: 'summary.development_name', label: 'Development' })}
                              {renderBondInputField({ path: 'summary.unit_reference', label: 'Unit reference' })}
                              {renderBondInputField({ path: 'summary.purchase_price', label: 'Purchase price', required: true, inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'summary.deposit_contribution', label: 'Deposit / contribution', inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'summary.finance_type', label: 'Finance type', required: true })}
                              {renderBondInputField({ path: 'summary.marital_status', label: 'Marital status', required: true, type: 'select', options: BOND_MARITAL_STATUS_OPTIONS })}
                              {renderBondInputField({ path: 'summary.main_residence', label: 'Main residence', required: true, type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'summary.first_time_home_buyer', label: 'First-time home buyer', required: true, type: 'select', options: BOND_YES_NO_OPTIONS })}
                            </div>
                            <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                              <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Missing required sections</span>
                              <p className="mt-1 text-sm text-[#324559]">
                                {missingBondApplicationSectionLabels.length ? missingBondApplicationSectionLabels.join(', ') : 'All required sections complete.'}
                              </p>
                            </article>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'personal_details' ? (
                          <div className="space-y-4">
                            {renderBondApplicantSection('primary', 'Primary Applicant', 'Required personal data based on OOBA Section A.')}
                            {hasCoApplicantProfile ? renderBondApplicantSection('co_applicant', 'Co-applicant / Surety') : null}
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'contact_address' ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              {renderBondInputField({ path: 'contact_address.home_number', label: 'Home number' })}
                              {renderBondInputField({ path: 'contact_address.cellphone_number', label: 'Cellphone number', required: true })}
                              {renderBondInputField({ path: 'contact_address.work_number', label: 'Work number' })}
                              {renderBondInputField({ path: 'contact_address.email_address', label: 'Email address', required: true, type: 'email' })}
                              {renderBondInputField({ path: 'contact_address.fax_number', label: 'Fax number' })}
                              {renderBondInputField({ path: 'contact_address.home_language', label: 'Home language' })}
                              {renderBondInputField({ path: 'contact_address.correspondence_language', label: 'Language for correspondence' })}
                              {renderBondInputField({ path: 'contact_address.legal_notice_delivery_method', label: 'Legal notice delivery method', type: 'select', options: BOND_LEGAL_NOTICE_OPTIONS, required: true })}
                            </div>
                            <div className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Residential address</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'contact_address.residential_address_street', label: 'Street', required: true })}
                                {renderBondInputField({ path: 'contact_address.residential_address_suburb', label: 'Suburb' })}
                                {renderBondInputField({ path: 'contact_address.residential_address_city', label: 'City', required: true })}
                                {renderBondInputField({ path: 'contact_address.residential_address_country', label: 'Country' })}
                                {renderBondInputField({ path: 'contact_address.residential_address_postal_code', label: 'Postal code', required: true })}
                                {renderBondInputField({ path: 'contact_address.residential_years', label: 'Length at address (years)', inputMode: 'numeric' })}
                                {renderBondInputField({ path: 'contact_address.residential_months', label: 'Length at address (months)', inputMode: 'numeric' })}
                              </div>
                            </div>
                            <div className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Postal / legal correspondence</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'contact_address.postal_same_as_residential', label: 'Postal same as residential', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'contact_address.future_legal_correspondence_same_as_postal', label: 'Future legal correspondence same as postal', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              </div>
                              {normalizePortalStatus(readBondField('contact_address.postal_same_as_residential')) === 'no' ? (
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  {renderBondInputField({ path: 'contact_address.postal_address_street', label: 'Postal street / PO Box' })}
                                  {renderBondInputField({ path: 'contact_address.postal_address_suburb', label: 'Postal suburb' })}
                                  {renderBondInputField({ path: 'contact_address.postal_address_city', label: 'Postal city' })}
                                  {renderBondInputField({ path: 'contact_address.postal_address_country', label: 'Postal country' })}
                                  {renderBondInputField({ path: 'contact_address.postal_address_postal_code', label: 'Postal code' })}
                                </div>
                              ) : null}
                              {normalizePortalStatus(readBondField('contact_address.future_legal_correspondence_same_as_postal')) === 'no' ? (
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  {renderBondInputField({ path: 'contact_address.future_legal_address_street', label: 'Future legal street / PO Box' })}
                                  {renderBondInputField({ path: 'contact_address.future_legal_address_suburb', label: 'Future legal suburb' })}
                                  {renderBondInputField({ path: 'contact_address.future_legal_address_city', label: 'Future legal city' })}
                                  {renderBondInputField({ path: 'contact_address.future_legal_address_country', label: 'Future legal country' })}
                                  {renderBondInputField({ path: 'contact_address.future_legal_address_postal_code', label: 'Future legal postal code' })}
                                </div>
                              ) : null}
                            </div>
                            <div className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Public official / politically exposed</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'contact_address.is_public_official', label: 'Public official in position of authority', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'contact_address.associated_with_public_official', label: 'Associated with public official', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'contact_address.public_official_relationship_nature', label: 'Nature of relationship / association' })}
                                {renderBondInputField({ path: 'contact_address.public_official_name', label: 'Public official full name' })}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'employment' ? (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3 py-2.5">
                              {[
                                { key: 'primary', label: 'Primary Applicant' },
                                ...(hasCoApplicantProfile ? [{ key: 'co_applicant', label: 'Co-applicant' }] : []),
                              ].map((item) => (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => setActiveBondApplicantKey(item.key)}
                                  className={`inline-flex min-h-[36px] items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] ${
                                    activeBondApplicantKey === item.key
                                      ? 'border-[#b8cadc] bg-[#eef4fb] text-[#274055]'
                                      : 'border-[#dde7f1] bg-white text-[#6d7f93] hover:border-[#cad8e7]'
                                  }`}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.occupation_status`, label: 'Occupation status', type: 'select', options: BOND_OCCUPATION_STATUS_OPTIONS, required: true })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.occupational_level`, label: 'Occupational level', type: 'select', options: BOND_OCCUPATIONAL_LEVEL_OPTIONS, required: true })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.nature_of_occupation`, label: 'Nature of occupation', required: true })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.company_registration_number`, label: 'Company registration number' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employee_number`, label: 'Employee number' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employment_years`, label: 'Employment years', inputMode: 'numeric' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employment_months`, label: 'Employment months', inputMode: 'numeric' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.works_in_south_africa`, label: 'Works in South Africa', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employer_address_street`, label: 'Employer street' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employer_address_suburb`, label: 'Employer suburb' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employer_address_city`, label: 'Employer city' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employer_address_country`, label: 'Employer country' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employer_address_postal_code`, label: 'Employer postal code' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.purchase_coincides_job_change`, label: 'Purchase coincides with job change', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.previously_employed`, label: 'Previously employed', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.own_business_income_percent`, label: '% income from own business', inputMode: 'decimal' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.shareholder_in_employer_business`, label: 'Shareholder in employer business', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.shareholding_percent`, label: '% shareholding', inputMode: 'decimal' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.previous_employer_1_name`, label: 'Previous employer 1' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.previous_employer_1_duration`, label: 'Previous employer 1 duration' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.previous_employer_2_name`, label: 'Previous employer 2' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.previous_employer_2_duration`, label: 'Previous employer 2 duration' })}
                            </div>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'credit_history' ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            {renderBondInputField({ path: 'credit_history.currently_under_administration', label: 'Currently under administration', type: 'select', options: BOND_YES_NO_OPTIONS, required: true })}
                            {renderBondInputField({ path: 'credit_history.ever_under_administration', label: 'Ever under administration', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.judgments_taken', label: 'Judgement taken against you', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.currently_under_debt_review', label: 'Currently under debt review', type: 'select', options: BOND_YES_NO_OPTIONS, required: true })}
                            {renderBondInputField({ path: 'credit_history.debt_counsellor_name', label: 'Debt counsellor name' })}
                            {renderBondInputField({ path: 'credit_history.debt_counsellor_phone', label: 'Debt counsellor phone' })}
                            {renderBondInputField({ path: 'credit_history.under_debt_rearrangement', label: 'Under debt re-arrangement', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.ever_declared_insolvent', label: 'Ever declared insolvent', type: 'select', options: BOND_YES_NO_OPTIONS, required: true })}
                            {renderBondInputField({ path: 'credit_history.insolvency_date', label: 'Date of insolvency', type: 'date' })}
                            {renderBondInputField({ path: 'credit_history.rehabilitation_date', label: 'Rehabilitation date', type: 'date' })}
                            {renderBondInputField({ path: 'credit_history.adverse_credit_listings', label: 'Aware of adverse credit listings', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.adverse_credit_listing_details', label: 'Adverse listing details', type: 'textarea' })}
                            {renderBondInputField({ path: 'credit_history.credit_bureau_dispute', label: 'In a credit bureau dispute', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.bound_by_surety_agreements', label: 'Bound by surety agreements', type: 'select', options: BOND_YES_NO_OPTIONS, required: true })}
                            {renderBondInputField({ path: 'credit_history.surety_amount', label: 'Surety amount', inputMode: 'decimal' })}
                            {renderBondInputField({ path: 'credit_history.currently_paying_surety_account', label: 'Currently paying this account', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.surety_monthly_instalment', label: 'Monthly instalment', inputMode: 'decimal' })}
                            {renderBondInputField({ path: 'credit_history.surety_details', label: 'Suretyship details', type: 'textarea' })}
                            {renderBondInputField({ path: 'credit_history.settling_surety_account', label: 'Will settle this account', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.surety_new_instalment_if_reduced', label: 'New instalment if reduced', inputMode: 'decimal' })}
                            {renderBondInputField({ path: 'credit_history.surety_in_favour_of', label: 'Surety in favour of' })}
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'loan_details' ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              {renderBondInputField({ path: 'loan_details.erf_or_section_number', label: 'Erf / section number' })}
                              {renderBondInputField({ path: 'loan_details.street_or_complex', label: 'Street / complex', required: true })}
                              {renderBondInputField({ path: 'loan_details.suburb', label: 'Suburb', required: true })}
                              {renderBondInputField({ path: 'loan_details.amount_to_be_registered', label: 'Amount to be registered', required: true, inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'loan_details.additional_amount_for_solar_energy', label: 'Additional amount for solar energy', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'loan_details.solar_energy_loan_amount', label: 'Solar energy loan amount', inputMode: 'decimal', hidden: normalizePortalStatus(readBondField('loan_details.additional_amount_for_solar_energy')) !== 'yes' })}
                              {renderBondInputField({ path: 'loan_details.solar_loan_term', label: 'Solar loan term', hidden: normalizePortalStatus(readBondField('loan_details.additional_amount_for_solar_energy')) !== 'yes' })}
                              {renderBondInputField({ path: 'loan_details.solar_panels_included', label: 'Solar panels included', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'loan_details.debit_order_bank_name', label: 'Debit order bank name', required: true })}
                              {renderBondInputField({ path: 'loan_details.debit_order_account_number', label: 'Debit order account number', required: true })}
                              {renderBondInputField({ path: 'loan_details.preferred_debit_order_date', label: 'Preferred debit order date', required: true, type: 'date' })}
                            </div>
                            <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Preferred lenders</h6>
                              <p className="mt-1 text-xs text-[#6b7d93]">Choose lenders you want this application submitted to.</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {BOND_APPLICATION_BANK_OPTIONS.map((bankName) => {
                                  const selected = bondApplicationData?.selected_banks?.includes(bankName)
                                  return (
                                    <button
                                      key={bankName}
                                      type="button"
                                      onClick={() => toggleBondApplicationBank(bankName)}
                                      className={`inline-flex min-h-[40px] items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                        selected
                                          ? 'border-[#b8cadc] bg-[#eef4fb] text-[#274055]'
                                          : 'border-[#dde7f1] bg-white text-[#5f7288] hover:border-[#cbd9e8]'
                                      }`}
                                    >
                                      {bankName}
                                    </button>
                                  )
                                })}
                              </div>
                            </article>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'income_deductions_expenses' ? (
                          <div className="space-y-4">
                            {[
                              { key: 'primary', label: 'Primary Applicant' },
                              ...(hasCoApplicantProfile ? [{ key: 'co_applicant', label: 'Co-applicant' }] : []),
                            ].map((applicantSection) => {
                              const incomePaths = [
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.gross_salary`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.average_commission`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.investment_income`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.rental_income`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.car_allowance`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.travel_allowance`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.entertainment_allowance`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.income_from_sureties`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.housing_subsidy`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.maintenance_or_alimony_income`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.average_overtime`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.other_income_value`,
                              ]
                              const deductionPaths = [
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.tax_paye`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.pension`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.uif`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.medical_aid`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.other_deductions_value`,
                              ]
                              const expensePaths = [
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.rental_expense`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.maintenance_or_alimony_expense`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.rates_taxes_levies`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.water_electricity`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.assurance_insurance_funeral_ra`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.groceries`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.transport`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.security`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.education`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.medical_excluding_payroll`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.cellphone_internet`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.dstv_tv`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.other_expenses_value`,
                              ]
                              const prefix = applicantSection.key === 'primary'
                                ? 'income_deductions_expenses.primary'
                                : 'income_deductions_expenses.co_applicant'
                              const incomeTotal = sumBondNumericFields(incomePaths)
                              const deductionsTotal = sumBondNumericFields(deductionPaths)
                              const expensesTotal = sumBondNumericFields(expensePaths)
                              const netAfterDeductions = incomeTotal - deductionsTotal
                              const netSurplus = netAfterDeductions - expensesTotal

                              return (
                                <article key={applicantSection.key} className="space-y-4 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                                  <h6 className="text-sm font-semibold text-[#142132]">{applicantSection.label}</h6>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    {bondIncomeSectionFields(prefix).map((field) => renderBondInputField({
                                      path: field.path,
                                      label: field.label,
                                      inputMode: field.inputMode,
                                    }))}
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <article className="rounded-[12px] border border-[#dde7f1] bg-white px-3 py-2.5">
                                      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Total income</span>
                                      <strong className="mt-1 block text-sm text-[#142132]">{ZAR_CURRENCY.format(incomeTotal)}</strong>
                                    </article>
                                    <article className="rounded-[12px] border border-[#dde7f1] bg-white px-3 py-2.5">
                                      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Total deductions</span>
                                      <strong className="mt-1 block text-sm text-[#142132]">{ZAR_CURRENCY.format(deductionsTotal)}</strong>
                                    </article>
                                    <article className="rounded-[12px] border border-[#dde7f1] bg-white px-3 py-2.5">
                                      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Income after deductions</span>
                                      <strong className="mt-1 block text-sm text-[#142132]">{ZAR_CURRENCY.format(netAfterDeductions)}</strong>
                                    </article>
                                    <article className="rounded-[12px] border border-[#dde7f1] bg-white px-3 py-2.5">
                                      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Net surplus / deficit</span>
                                      <strong className={`mt-1 block text-sm ${netSurplus >= 0 ? 'text-[#2f7a51]' : 'text-[#b5472d]'}`}>
                                        {ZAR_CURRENCY.format(netSurplus)}
                                      </strong>
                                    </article>
                                  </div>
                                </article>
                              )
                            })}
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'banking_liabilities' ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              {renderBondInputField({ path: 'banking_liabilities.primary_bank_name', label: 'Primary bank / institution', required: true })}
                              {renderBondInputField({ path: 'banking_liabilities.primary_account_type', label: 'Primary account type', type: 'select', options: BOND_ACCOUNT_TYPE_OPTIONS, required: true })}
                              {renderBondInputField({ path: 'banking_liabilities.primary_account_holder_name', label: 'Account holder name' })}
                              {renderBondInputField({ path: 'banking_liabilities.legal_entity_account_name_match', label: 'Account in legal entity name', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'banking_liabilities.business_bank_account', label: 'Business bank account', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'banking_liabilities.primary_account_number', label: 'Account number', required: true })}
                              {renderBondInputField({ path: 'banking_liabilities.primary_balance_debit_credit', label: 'Balance debit / credit' })}
                              {renderBondInputField({ path: 'banking_liabilities.primary_bank_first_consideration_consent', label: 'Primary bank first consideration consent', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            </div>
                            <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Existing home loan</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_bank', label: 'Bank / institution' })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_account_holder_name', label: 'Account holder name' })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_account_number', label: 'Account number' })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_outstanding_balance', label: 'Outstanding balance', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_monthly_instalment', label: 'Monthly instalment', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_selling_property', label: 'Selling existing property', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_new_instalment_if_reduced', label: 'New instalment if reduced', inputMode: 'decimal' })}
                              </div>
                            </article>
                            <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Other bank / finance account</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_bank', label: 'Bank / institution' })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_account_type', label: 'Account type', type: 'select', options: BOND_ACCOUNT_TYPE_OPTIONS, required: true })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_current_balance', label: 'Current balance', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_monthly_payment', label: 'Monthly payment', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_settled', label: 'Will this account be settled?', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_business_account', label: 'Business account?', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_legal_entity_account', label: 'Legal entity account?', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              </div>
                            </article>
                            <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Retail accounts</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'banking_liabilities.retail_account_name', label: 'Retail store name' })}
                                {renderBondInputField({ path: 'banking_liabilities.retail_current_balance', label: 'Current balance', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.retail_monthly_payment', label: 'Monthly payment', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.retail_settled', label: 'Will this account be settled?', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              </div>
                            </article>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'assets_liabilities' ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              {renderBondInputField({ path: 'assets_liabilities.fixed_property', label: 'Fixed property', inputMode: 'decimal', required: true })}
                              {renderBondInputField({ path: 'assets_liabilities.vehicles', label: 'Vehicles', inputMode: 'decimal', required: true })}
                              {renderBondInputField({ path: 'assets_liabilities.investments', label: 'Investments', inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'assets_liabilities.furniture_and_fittings', label: 'Furniture & fittings', inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'assets_liabilities.other_assets_description', label: 'Other assets description' })}
                              {renderBondInputField({ path: 'assets_liabilities.other_assets_value', label: 'Other assets market value', inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'assets_liabilities.other_liabilities_description', label: 'Other liabilities description' })}
                              {renderBondInputField({ path: 'assets_liabilities.other_liabilities_value', label: 'Other liabilities value', inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'assets_liabilities.total_assets', label: 'Total assets', inputMode: 'decimal', required: true })}
                              {renderBondInputField({ path: 'assets_liabilities.total_liabilities', label: 'Total liabilities', inputMode: 'decimal', required: true })}
                              {renderBondInputField({ path: 'assets_liabilities.net_asset_value', label: 'Net asset value', inputMode: 'decimal', required: true })}
                            </div>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'declarations_consents' ? (
                          <div className="space-y-4">
                            <article className="space-y-3 rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Declarations & privacy</h6>
                              {[
                                ['declarations_consents.loan_processing_consent', 'I consent to loan processing and affordability assessment.'],
                                ['declarations_consents.credit_bureau_fraud_bank_data_consent', 'I consent to credit bureau, fraud, and bank data retrieval checks.'],
                                ['declarations_consents.insurance_third_party_communication_consent', 'I consent to related insurance and third-party communication where required.'],
                                ['declarations_consents.nhfc_first_home_finance_consent', 'I consent to First Home Finance / NHFC processing where applicable.'],
                                ['declarations_consents.declaration_accepted', 'I confirm that all information submitted is true and complete.'],
                              ].map(([path, copy]) => (
                                <label key={path} className="flex items-start gap-3 rounded-[12px] border border-[#e3ebf4] bg-white px-3 py-3">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(readBondField(path))}
                                    onChange={(event) => updateBondField(path, event.target.checked)}
                                    className="mt-1 h-4 w-4 rounded border-[#c7d4e3]"
                                  />
                                  <span className="text-sm leading-6 text-[#324559]">{copy}</span>
                                </label>
                              ))}
                              <div className="grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'declarations_consents.marketing_privacy_preference', label: 'Marketing / privacy preference', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'declarations_consents.digital_signature_name', label: 'Digital signature name', required: true })}
                                {renderBondInputField({ path: 'declarations_consents.digital_signature_date', label: 'Digital signature date', type: 'date', required: true })}
                              </div>
                            </article>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6edf5] pt-3">
                              <span className="text-xs font-medium text-[#6b7d93]">
                                {bondApplicationData?.submitted_at
                                  ? `Submitted ${formatClientPortalDate(bondApplicationData.submitted_at)}`
                                  : 'Submit when all sections are complete.'}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleBondApplicationSubmit()
                                }}
                                disabled={bondApplicationSaving || bondApplicationStatus === 'Submitted' || bondApplicationStatus === 'Approved'}
                                className="inline-flex min-h-[42px] items-center rounded-[12px] bg-[#2f5478] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#244463] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                              >
                                {bondApplicationSaving ? 'Submitting...' : bondApplicationStatus === 'Submitted' ? 'Submitted' : 'Submit Application'}
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'documents' ? (
                          <div className="space-y-3">
                            <p className="text-sm text-[#5f7288]">
                              Bond supporting documents are linked here by type. You can also manage all uploads in{' '}
                              <Link to={getClientPortalPath(token, 'documents')} className="font-semibold text-[#2f5478] underline underline-offset-2">
                                Documents
                              </Link>.
                            </p>
                            <div className="space-y-3">
                              {bondApplicationRequiredDocuments.length ? (
                                bondApplicationRequiredDocuments.map((document) => {
                                  const uploadedDocument = document.uploadedDocumentId
                                    ? portalDocumentsById.get(String(document.uploadedDocumentId))
                                    : null
                                  const hasUploadedDocument = hasPersistedPortalDocument(uploadedDocument)
                                  const source = `${document?.key || ''} ${document?.label || ''}`.toLowerCase()
                                  const documentTypeLabel = source.includes('passport') || source.includes('identity')
                                    ? 'ID / Passport'
                                    : source.includes('income') || source.includes('payslip')
                                      ? 'Proof of income'
                                      : source.includes('address')
                                        ? 'Proof of address'
                                        : source.includes('marriage') || source.includes('anc')
                                          ? 'Marriage docs'
                                          : source.includes('tax')
                                            ? 'Tax docs'
                                            : source.includes('company') || source.includes('trust')
                                              ? 'Company / Trust docs'
                                              : 'Additional supporting docs'
                                  return (
                                    <article key={document.key} className="rounded-[14px] border border-[#e3ebf4] bg-white px-4 py-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <strong className="text-sm font-semibold text-[#142132]">{document.label}</strong>
                                          <p className="text-xs text-[#6b7d93]">{document.description || 'Supporting bond application document.'}</p>
                                          <span className="mt-2 inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-2.5 py-0.5 text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-[#5f7288]">
                                            {documentTypeLabel}
                                          </span>
                                        </div>
                                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                          document.complete || hasUploadedDocument
                                            ? 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]'
                                            : 'border-[#f1ddd0] bg-[#fff6f0] text-[#a15b31]'
                                        }`}>
                                          {document.complete || hasUploadedDocument ? 'Uploaded' : 'Missing'}
                                        </span>
                                      </div>
                                      <div className="mt-3 flex flex-wrap items-center gap-3">
                                        {hasUploadedDocument ? (
                                          <button
                                            type="button"
                                            onClick={() => void handleOpenPortalDocument(uploadedDocument)}
                                            disabled={
                                              openingDocumentPath ===
                                              String(uploadedDocument?.file_path || uploadedDocument?.id || '')
                                            }
                                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                                          >
                                            <Download size={13} />
                                            {openingDocumentPath ===
                                            String(uploadedDocument?.file_path || uploadedDocument?.id || '')
                                              ? 'Opening...'
                                              : 'View latest'}
                                          </button>
                                        ) : null}
                                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c] hover:border-[#c6d7e7]">
                                          {hasUploadedDocument ? 'Replace upload' : 'Upload'}
                                          <input
                                            type="file"
                                            className="hidden"
                                            disabled={uploadingDocumentKey === document.key}
                                            onChange={(event) => {
                                              const file = event.target.files?.[0]
                                              if (file) {
                                                void handleUploadRequiredDocument(document.key, file)
                                              }
                                              event.target.value = ''
                                            }}
                                          />
                                        </label>
                                      </div>
                                      {hasUploadedDocument ? (
                                        <div className="mt-2 space-y-1 text-xs text-[#6b7d93]">
                                          <p>
                                            File: <span className="font-medium text-[#324559]">{getPortalDocumentFileName(uploadedDocument)}</span>
                                          </p>
                                          <p>Uploaded: {formatShortPortalDate(getPortalDocumentUploadedAt(uploadedDocument), 'Recently')}</p>
                                        </div>
                                      ) : null}
                                    </article>
                                  )
                                })
                              ) : (
                                <article className="rounded-[14px] border border-dashed border-[#d8e2ee] bg-white px-4 py-4 text-sm text-[#6b7d93]">
                                  {isBondOrHybridTransaction
                                    ? 'Bond document requirements will appear here once your finance team requests them.'
                                    : 'Bond documents are not required for this purchase type.'}
                                </article>
                              )}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6edf5] pt-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (previousBondApplicationSectionMeta) {
                                void handleBondApplicationSectionChange(previousBondApplicationSectionMeta.key)
                              }
                            }}
                            disabled={!previousBondApplicationSectionMeta}
                            className="inline-flex min-h-[40px] items-center rounded-[10px] border border-[#d1deeb] bg-white px-3 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Previous section
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void persistBondApplicationDraft()
                              }}
                              disabled={bondApplicationSaving || !bondApplicationDirty}
                              className="inline-flex min-h-[40px] items-center rounded-[10px] border border-[#d1deeb] bg-white px-3 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (nextBondApplicationSectionMeta) {
                                  void handleBondApplicationSectionChange(nextBondApplicationSectionMeta.key)
                                }
                              }}
                              disabled={!nextBondApplicationSectionMeta}
                              className="inline-flex min-h-[40px] items-center rounded-[10px] bg-[#35546c] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                            >
                              Next section
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                {activeBondApplicationTab === 'offers' ? (
                  <section className="space-y-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <div>
                      <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Offers</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                        {lenderOffersIntroText}
                      </p>
                    </div>
                    {bondOfferDocuments.length ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {bondOfferDocuments.map((offer) => {
                          const isAccepted = acceptedBondOfferId && String(offer.id) === acceptedBondOfferId
                          const isDeclined = declinedBondOfferIds.has(String(offer.id))
                          return (
                            <article key={offer.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{offer.bankName}</span>
                                  <strong className="mt-1 block text-sm font-semibold text-[#142132]">{offer.name}</strong>
                                  <p className="mt-1 text-xs text-[#6b7d93]">Uploaded {formatClientPortalDate(offer.uploadedAt, 'Recently')}</p>
                                </div>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] ${
                                  isAccepted
                                    ? 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]'
                                    : isDeclined
                                      ? 'border-[#f1d8d0] bg-[#fff5f2] text-[#b5472d]'
                                      : 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]'
                                }`}>
                                  {isAccepted ? 'Accepted' : isDeclined ? 'Declined' : 'Uploaded'}
                                </span>
                              </div>
                              <div className="mt-4 flex flex-wrap items-center gap-2">
                                {offer.downloadUrl ? (
                                  <a
                                    href={offer.downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                                  >
                                    <Download size={13} />
                                    Download
                                  </a>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleAcceptBondOffer(offer)
                                  }}
                                  disabled={bondApplicationSaving || isAccepted}
                                  className="inline-flex items-center rounded-full bg-[#35546c] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                                >
                                  {isAccepted ? 'Accepted' : 'Accept offer'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleDeclineBondOffer(offer)
                                  }}
                                  disabled={bondApplicationSaving || isDeclined}
                                  className="inline-flex items-center rounded-full border border-[#f1d8d0] bg-white px-3 py-1.5 text-xs font-semibold text-[#b5472d] transition hover:bg-[#fff5f2] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isDeclined ? 'Declined' : 'Decline offer'}
                                </button>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    ) : (
                      <article className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                        {lenderOffersEmptyText}
                      </article>
                    )}

                    <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                      <h5 className="text-sm font-semibold text-[#142132]">Upload signed accepted offer</h5>
                      <p className="mt-1 text-sm text-[#6b7d93]">
                        {acceptedBondOffer
                          ? `Accepted offer: ${acceptedBondOffer.bankName}. Upload your signed copy once complete.`
                          : 'Accept an offer first, then upload your signed copy here.'}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c] hover:border-[#c6d7e7]">
                          Upload signed offer
                          <input
                            type="file"
                            className="hidden"
                            disabled={!acceptedBondOffer || bondApplicationSaving}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file && acceptedBondOffer) {
                                void handleUploadSignedBondOffer(file, acceptedBondOffer)
                              }
                              event.target.value = ''
                            }}
                          />
                        </label>
                        {hasSignedAcceptedOfferDocument ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenPortalDocument(signedAcceptedOfferDocument)}
                            disabled={
                              openingDocumentPath ===
                              String(signedAcceptedOfferDocument?.file_path || signedAcceptedOfferDocument?.id || '')
                            }
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                          >
                            <Download size={13} />
                            {openingDocumentPath ===
                            String(signedAcceptedOfferDocument?.file_path || signedAcceptedOfferDocument?.id || '')
                              ? 'Opening...'
                              : 'View signed upload'}
                          </button>
                        ) : null}
                      </div>
                      {hasSignedAcceptedOfferDocument ? (
                        <div className="mt-2 space-y-1 text-xs text-[#6b7d93]">
                          <p>
                            File: <span className="font-medium text-[#324559]">{getPortalDocumentFileName(signedAcceptedOfferDocument)}</span>
                          </p>
                          <p>Uploaded: {formatShortPortalDate(getPortalDocumentUploadedAt(signedAcceptedOfferDocument), 'Recently')}</p>
                        </div>
                      ) : null}
                    </article>
                  </section>
                ) : null}

                {activeBondApplicationTab === 'grant' ? (
                  <section className="space-y-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <div>
                      <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Grant</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                        Final bond grant and instruction documents uploaded by your finance team will appear here.
                      </p>
                    </div>
                    {bondGrantDocuments.length ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {bondGrantDocuments.map((document) => (
                          <article key={document.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                            <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{extractBondBankName(`${document.category || ''} ${document.name || ''}`)}</span>
                            <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{document.name || 'Bond grant document'}</strong>
                            <p className="mt-1 text-xs text-[#6b7d93]">Uploaded {formatClientPortalDate(document.created_at, 'Recently')}</p>
                            {document.url ? (
                              <a
                                href={document.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                              >
                                <Download size={13} />
                                Download
                              </a>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <article className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                        Grant documents are not uploaded yet.
                      </article>
                    )}
                  </section>
                ) : null}
              </section>
            ) : null}

            {isAccount ? (
              <ClientPortalMatterAccountsPanel
                accounts={matterAccountsState.accounts}
                summary={matterAccountsState.summary || {}}
                loading={matterAccountsState.loading}
                error={matterAccountsState.error}
                unavailable={matterAccountsState.unavailable}
                workspace={effectiveWorkspace === 'seller' ? 'seller' : 'buyer'}
                uploadingProofAccountId={uploadingMatterProofAccountId}
                proofUploadFeedback={matterProofUploadFeedback}
                onUploadProof={handleUploadMatterAccountProof}
                uploadingRequestId={uploadingMatterRequestId}
                requestUploadFeedback={matterRequestUploadFeedback}
                onUploadRequestDocument={handleUploadMatterRequestDocument}
              />
            ) : null}

      {isDocuments ? (
        <>
          <ClientDocumentCentre
            documentCenter={workspaceData?.documentCenter || {}}
            workspace={effectiveWorkspace === 'seller' ? 'selling' : 'buying'}
            uploadingDocumentKey={uploadingDocumentKey}
            openingDocumentPath={openingDocumentPath}
            hideHeader={effectiveWorkspace === 'seller'}
            onUpload={handleDocumentCentreUpload}
            onOpenDocument={handleOpenPortalDocument}
          />

          <section className="mt-5 rounded-[18px] border border-[#dbe5ef] bg-white px-4 py-3 shadow-[0_12px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-[#142132]">Need the detailed workspace?</h4>
                <p className="text-xs leading-5 text-[#6b7d93]">
                  Use the advanced view for grouped legacy tabs and full historical document utilities.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvancedDocuments((previous) => !previous)}
                className="inline-flex min-h-[36px] items-center justify-center rounded-[10px] border border-[#d1deeb] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-white"
              >
                {showAdvancedDocuments ? 'Hide Advanced View' : 'Open Advanced View'}
              </button>
            </div>
          </section>

          {showAdvancedDocuments ? (
          <section className="mt-5 space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <nav className="inline-flex min-w-full gap-2 rounded-[18px] border border-[#e2eaf3] bg-[#f8fbff] p-2">
              {documentTabs.map((tab) => {
                const isActive = activeDocumentsTabKey === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveDocumentsTab(tab.key)}
                    className={`inline-flex min-h-[44px] min-w-[170px] items-center justify-center rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'border border-[#d1deeb] bg-white text-[#142132] shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
                        : 'border border-transparent text-[#5f7086] hover:border-[#d8e4ef] hover:bg-white hover:text-[#142132]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="ml-2 inline-flex min-w-[22px] items-center justify-center rounded-full border border-[#dce6f0] bg-white px-1.5 py-0.5 text-[0.68rem] font-semibold text-[#5f7086]">
                      {tab.count}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>

          {effectiveWorkspace !== 'seller' ? (
            <section className="rounded-[20px] border border-[#dbe5ef] bg-[#f8fbff] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">
                    Buyer requirements: {buyerRequirementProfile?.buyerTypeLabel || toTitleLabel(buyerRequirementType || 'individual')}
                  </h4>
                  {buyerRequirementFlowSummary ? (
                    <p className="mt-2 text-xs leading-5 text-[#7b8ca2]">{buyerRequirementFlowSummary}</p>
                  ) : null}
                  <p className="mt-1 text-sm leading-6 text-[#5f738a]">{buyerRequirementGuidance}</p>
                  <p className="mt-1 text-sm leading-6 text-[#5f738a]">{buyerRequirementFinanceGuidance}</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  buyerRequirementOutstanding
                    ? 'border-[#f1d8d0] bg-[#fff5f2] text-[#b5472d]'
                    : 'border-[#cfe3d7] bg-[#eef8f1] text-[#2f7a51]'
                }`}>
                  {buyerRequirementOutstanding
                    ? `${buyerRequirementMissing} required item${buyerRequirementMissing === 1 ? '' : 's'} outstanding`
                    : 'All required buyer documents completed'}
                </span>
              </div>
            </section>
          ) : null}

          {activeDocumentsTabKey === 'sales' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Sales documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Core sale-stage documents. Complete actions directly on each card.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {documentTabCountByKey.sales} items
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {showReservationDepositUploadCard ? (
                  <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">Reservation Deposit Proof of Payment</strong>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                          Upload your proof of payment for the reservation deposit so your team can verify it.
                        </p>
                        {reservationPaymentInstructions ? (
                          <p className="mt-2 text-xs leading-5 text-[#6b7d93]">{reservationPaymentInstructions}</p>
                        ) : null}
                        <p className="mt-2 text-xs font-medium text-[#7b8ca2]">Deposit amount: {reservationAmountLabel}</p>
                        <p className="mt-1 text-xs font-medium text-[#7b8ca2]">Treatment: {reservationTreatmentLabel}</p>
                        <p className="mt-1 text-xs font-medium text-[#7b8ca2]">Payable to: {reservationPayableToLabel}</p>
                        {reservationRejectedNote ? (
                          <p className="mt-2 text-xs font-medium text-[#b5472d]">Review note: {reservationRejectedNote}</p>
                        ) : null}
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(reservationProofStatusLabel)}`}>
                        {reservationProofStatusLabel}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
                        <FileSignature size={14} />
                        {uploadingDocumentKey === reservationProofUploadStateKey
                          ? 'Uploading...'
                          : reservationProofUploaded
                            ? 'Replace proof of payment'
                            : 'Upload proof of payment'}
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploadingDocumentKey === reservationProofUploadStateKey}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) {
                              if (reservationProofRequirement?.key) {
                                void handleUploadRequiredDocument(reservationProofRequirement.key, file)
                              } else {
                                void handleUploadReservationDepositProof(file)
                              }
                            }
                            event.target.value = ''
                          }}
                        />
                      </label>
                      {reservationProofFallbackUploadedDocument?.file_path || reservationProofFallbackUploadedDocument?.url ? (
                        <button
                          type="button"
                          onClick={() => void handleOpenPortalDocument(reservationProofFallbackUploadedDocument)}
                          disabled={
                            openingDocumentPath ===
                            String(reservationProofFallbackUploadedDocument?.file_path || reservationProofFallbackUploadedDocument?.id || '')
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                        >
                          <Download size={14} />
                          {openingDocumentPath ===
                          String(reservationProofFallbackUploadedDocument?.file_path || reservationProofFallbackUploadedDocument?.id || '')
                            ? 'Opening...'
                            : 'View upload'}
                        </button>
                      ) : null}
                    </div>
                    {reservationProofUploadFeedback.message ? (
                      <p className={`mt-3 rounded-[10px] border px-3 py-2 text-xs font-medium ${reservationProofUploadFeedbackClasses}`}>
                        {reservationProofUploadFeedback.message}
                      </p>
                    ) : null}
                    {reservationProofUploaded ? (
                      <div className="mt-3 space-y-1 text-xs text-[#6b7d93]">
                        <p>
                          File: <span className="font-medium text-[#324559]">{reservationProofFileName || 'Reservation deposit proof of payment'}</span>
                        </p>
                        <p>Uploaded: {formatShortPortalDate(reservationProofUploadedAt, 'Recently')}</p>
                      </div>
                    ) : null}
                  </article>
                ) : effectiveWorkspace !== 'seller' && showReservationDepositCompletedCard ? (
                  <article className="rounded-[18px] border border-[#d6e7dc] bg-[#f4fbf6] px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">Reservation Deposit Proof of Payment</strong>
                        <p className="mt-1 text-sm leading-6 text-[#5f7288]">
                          Payment received and captured for this transaction.
                        </p>
                        <p className="mt-2 text-xs font-medium text-[#5f7288]">Deposit amount: {reservationAmountLabel}</p>
                        <p className="mt-1 text-xs font-medium text-[#5f7288]">Treatment: {reservationTreatmentLabel}</p>
                        <p className="mt-1 text-xs font-medium text-[#5f7288]">Payable to: {reservationPayableToLabel}</p>
                        <div className="mt-2 space-y-1 text-xs text-[#5f7288]">
                          <p>
                            File:{' '}
                            <span className="font-medium text-[#324559]">
                              {reservationProofFileName || 'Reservation deposit proof of payment'}
                            </span>
                          </p>
                          <p>Uploaded: {formatShortPortalDate(reservationProofUploadedAt, 'Recently')}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-[#c9dfd3] bg-white px-3 py-1.5 text-xs font-semibold text-[#2f7a51]">
                        Payment Received
                      </span>
                    </div>
                    {reservationProofFallbackUploadedDocument?.file_path || reservationProofFallbackUploadedDocument?.url ? (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => void handleOpenPortalDocument(reservationProofFallbackUploadedDocument)}
                          disabled={
                            openingDocumentPath ===
                            String(reservationProofFallbackUploadedDocument?.file_path || reservationProofFallbackUploadedDocument?.id || '')
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                        >
                          <Download size={14} />
                          {openingDocumentPath ===
                          String(reservationProofFallbackUploadedDocument?.file_path || reservationProofFallbackUploadedDocument?.id || '')
                            ? 'Opening...'
                            : 'Download proof of payment'}
                        </button>
                      </div>
                    ) : null}
                  </article>
                ) : null}

                {effectiveWorkspace === 'seller' ? (
                  <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">Mandate</strong>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                          {mandatePacketUsingStructuredFlow
                            ? (
                              mandatePacketState === 'not_generated'
                                ? 'Your agent is preparing your mandate. It will appear here when ready.'
                                : mandatePacketState === 'ready_for_client_signature'
                                  ? 'Your mandate is ready. Sign online to proceed.'
                                  : mandatePacketState === 'awaiting_other_signatures'
                                    ? 'You have signed the mandate. We are waiting for the remaining parties to complete signing.'
                                    : mandatePacketState === 'fully_signed'
                                      ? 'Your mandate is fully signed. Download the final signed document below.'
                                      : 'Your mandate has been generated and is being prepared for signing.'
                            )
                            : 'Your agent is preparing your mandate. It will appear here when ready.'}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(mandateStatusLabel)}`}>
                        {mandateStatusLabel}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {mandatePacketUsingStructuredFlow ? (
                        <>
                          {mandatePacketState === 'ready_for_client_signature' && mandatePacketSignPath ? (
                            <a
                              href={mandatePacketSignPath}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d]"
                            >
                              <FileSignature size={14} />
                              Sign Mandate
                            </a>
                          ) : null}
                          {mandatePacketGeneratedPreviewFilePath ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleOpenPortalDocument({
                                  id: `mandate-generated-${mandatePacket?.version?.id || ''}`,
                                  file_path: mandatePacketGeneratedPreviewFilePath,
                                  name: mandatePacketGeneratedPreviewFileName,
                                })
                              }
                              disabled={openingDocumentPath === String(mandatePacketGeneratedPreviewFilePath || '')}
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              <Download size={14} />
                              {openingDocumentPath === String(mandatePacketGeneratedPreviewFilePath || '')
                                ? 'Opening...'
                                : 'View Mandate'}
                            </button>
                          ) : null}
                          {mandatePacketState === 'fully_signed' && mandatePacketFinalSignedFilePath ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleOpenPortalDocument({
                                  id: `mandate-final-signed-${mandatePacket?.version?.id || ''}`,
                                  file_path: mandatePacketFinalSignedFilePath,
                                  file_bucket: String(mandatePacket?.finalSignedFileBucket || '').trim(),
                                  url: mandatePacketFinalSignedDownloadUrl,
                                  openDirectUrl: Boolean(mandatePacketFinalSignedDownloadUrl),
                                  name: mandatePacketFinalSignedFileName,
                                })
                              }
                              disabled={openingDocumentPath === String(mandatePacketFinalSignedFilePath || '')}
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              <Download size={14} />
                              {openingDocumentPath === String(mandatePacketFinalSignedFilePath || '')
                                ? 'Opening...'
                                : 'Download Signed Mandate'}
                            </button>
                          ) : null}
                          {mandatePacketState === 'not_generated' ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#8ba0b8]"
                            >
                              <Download size={14} />
                              Mandate not available yet
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#8ba0b8]"
                        >
                          <Download size={14} />
                          Mandate not available yet
                        </button>
                      )}
                    </div>
                  </article>
                ) : (
                  <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">Offer to Purchase (OTP)</strong>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                          {otpPacketUsingStructuredFlow
                            ? (
                              otpPacketState === 'not_generated'
                                ? 'Your agent is preparing the Offer to Purchase. It will appear here when ready.'
                                : otpPacketState === 'ready_for_client_signature'
                                  ? 'Your Offer to Purchase is ready. Sign online to proceed.'
                                  : otpPacketState === 'awaiting_other_signatures'
                                    ? 'You have signed the OTP. We are waiting for the remaining parties to complete signing.'
                                    : otpPacketState === 'fully_signed'
                                      ? 'Your Offer to Purchase is fully signed. Download the final signed document below.'
                                      : 'Your Offer to Purchase has been generated and is being prepared for signing.'
                            )
                            : 'Review the latest OTP document for this transaction.'}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(otpStatusLabel)}`}>
                        {otpStatusLabel}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {otpPacketUsingStructuredFlow ? (
                        <>
                          {otpPacketState === 'ready_for_client_signature' && otpPacketSignPath ? (
                            <a
                              href={otpPacketSignPath}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d]"
                            >
                              <FileSignature size={14} />
                              Sign OTP
                            </a>
                          ) : null}
                          {otpPacketGeneratedPreviewFilePath ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleOpenPortalDocument({
                                  id: `otp-generated-${portal?.otpPacket?.version?.id || ''}`,
                                  file_path: otpPacketGeneratedPreviewFilePath,
                                  name: otpPacketGeneratedPreviewFileName,
                                })
                              }
                              disabled={openingDocumentPath === String(otpPacketGeneratedPreviewFilePath || '')}
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              <Download size={14} />
                              {openingDocumentPath === String(otpPacketGeneratedPreviewFilePath || '')
                                ? 'Opening...'
                                : 'View OTP'}
                            </button>
                          ) : null}
                          {otpPacketState === 'fully_signed' && otpPacketFinalSignedFilePath ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleOpenPortalDocument({
                                  id: `otp-final-signed-${portal?.otpPacket?.version?.id || ''}`,
                                  file_path: otpPacketFinalSignedFilePath,
                                  file_bucket: String(portal?.otpPacket?.finalSignedFileBucket || '').trim(),
                                  name: otpPacketFinalSignedFileName,
                                })
                              }
                              disabled={openingDocumentPath === String(otpPacketFinalSignedFilePath || '')}
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              <Download size={14} />
                              {openingDocumentPath === String(otpPacketFinalSignedFilePath || '')
                                ? 'Opening...'
                                : 'Download Signed OTP'}
                            </button>
                          ) : null}
                          {otpPacketState === 'not_generated' ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#8ba0b8]"
                            >
                              <Download size={14} />
                              OTP not available yet
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {otpPrimarySharedDocument?.url ? (
                            <a
                              href={otpPrimarySharedDocument.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              <Download size={14} />
                              Download OTP
                            </a>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#8ba0b8]"
                            >
                              <Download size={14} />
                              OTP not available yet
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {!otpPacketUsingStructuredFlow && otpHasUploadedDocument ? (
                      <div className="mt-3 space-y-1 text-xs text-[#6b7d93]">
                        <p>
                          File: <span className="font-medium text-[#324559]">{getPortalDocumentFileName(otpUploadedDocument)}</span>
                        </p>
                        <p>Uploaded: {formatShortPortalDate(getPortalDocumentUploadedAt(otpUploadedDocument), 'Recently')}</p>
                      </div>
                    ) : null}
                  </article>
                )}

                {salesOtherRequiredDocuments.map((document) => {
                  const uploadedDocument = document.uploadedDocument || document.uploaded_document || (document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null)
                  const hasUploadedDocument = hasPersistedPortalDocument(uploadedDocument)
                  const isLinkedSignedMandate = hasUploadedDocument && isSignedMandateDocumentLink(document, uploadedDocument)
                  const statusLabel = isLinkedSignedMandate ? 'Completed' : document.complete || hasUploadedDocument ? 'Uploaded' : 'Not uploaded'
                  return (
                    <article key={document.key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{document.label || 'Sales document'}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.description || 'Complete this document to proceed with the transaction.'}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {!isLinkedSignedMandate ? (
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
                            <FileSignature size={14} />
                            {hasUploadedDocument ? 'Replace upload' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingDocumentKey === document.key}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) {
                                  void handleUploadRequiredDocument(document.key, file)
                                }
                                event.target.value = ''
                              }}
                              />
                          </label>
                        ) : null}
                        {hasUploadedDocument ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenPortalDocument(uploadedDocument)}
                            disabled={openingDocumentPath === String(uploadedDocument?.file_path || uploadedDocument?.id || '')}
                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                          >
                            <Download size={14} />
                            {openingDocumentPath === String(uploadedDocument?.file_path || uploadedDocument?.id || '')
                              ? 'Opening...'
                              : isLinkedSignedMandate ? 'Download Signed Mandate' : 'View upload'}
                          </button>
                        ) : null}
                      </div>
                      {hasUploadedDocument ? (
                        <div className="mt-3 space-y-1 text-xs text-[#6b7d93]">
                          <p>
                            File: <span className="font-medium text-[#324559]">{getPortalDocumentFileName(uploadedDocument)}</span>
                          </p>
                          <p>Uploaded: {formatShortPortalDate(getPortalDocumentUploadedAt(uploadedDocument), 'Recently')}</p>
                        </div>
                      ) : null}
                    </article>
                  )
                })}

                {salesOtherSharedDocuments.map((document) => (
                  <article
                    key={document.id}
                    className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Shared sales document'}</strong>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Shared by your deal team.'}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses('Uploaded')}`}>
                        Uploaded
                      </span>
                    </div>
                    {document.url ? (
                      <div className="mt-4">
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                        >
                          <Download size={14} />
                          Download
                        </a>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              {effectiveWorkspace !== 'seller' &&
              !showReservationDepositUploadCard &&
              !showReservationDepositCompletedCard &&
              !otpPacketUsingStructuredFlow &&
              !otpPrimaryRequirement &&
              !otpPrimarySharedDocument &&
              !salesOtherRequiredDocuments.length &&
              !salesOtherSharedDocuments.length ? (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No sales documents are available yet.
                </div>
              ) : null}
            </section>
          ) : null}

          {activeDocumentsTabKey === 'fica' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">FICA documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    Required documents are generated from your purchaser profile and transaction setup.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {documentTabCountByKey.fica} requirements
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {resolvedFicaRequirements.map((requirement) => {
                  const statusLabel = requirement.statusLabel || 'Missing'
                  const uploadDocument = requirement.matchedRequirementDoc || null
                  const hasUploadedDocument = hasPersistedPortalDocument(requirement.uploadedDocument)
                  return (
                    <article
                      key={requirement.key}
                      className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{requirement.label}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{requirement.description}</p>
                          <span className="mt-2 inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#6d8197]">
                            {requirement.required ? 'Required' : 'Optional'}
                          </span>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {uploadDocument?.key ? (
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
                            <FileSignature size={14} />
                            {hasUploadedDocument ? 'Replace upload' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingDocumentKey === uploadDocument.key}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) {
                                  void handleUploadRequiredDocument(uploadDocument.key, file)
                                }
                                event.target.value = ''
                              }}
                            />
                          </label>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#8ba0b8]"
                          >
                            <FileSignature size={14} />
                            Awaiting request
                          </button>
                        )}
                        {hasUploadedDocument ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenPortalDocument(requirement.uploadedDocument)}
                            disabled={
                              openingDocumentPath ===
                              String(requirement.uploadedDocument?.file_path || requirement.uploadedDocument?.id || '')
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                          >
                            <Download size={14} />
                            {openingDocumentPath ===
                            String(requirement.uploadedDocument?.file_path || requirement.uploadedDocument?.id || '')
                              ? 'Opening...'
                              : 'View upload'}
                          </button>
                        ) : null}
                      </div>
                      {hasUploadedDocument ? (
                        <div className="mt-3 space-y-1 text-xs text-[#6b7d93]">
                          <p>
                            File: <span className="font-medium text-[#324559]">{getPortalDocumentFileName(requirement.uploadedDocument)}</span>
                          </p>
                          <p>Uploaded: {formatShortPortalDate(getPortalDocumentUploadedAt(requirement.uploadedDocument), 'Recently')}</p>
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          {activeDocumentsTabKey === 'bond' ? (
            <section className="space-y-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Bond documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    {bondSupportingDocumentsSummaryText}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {documentTabCountByKey.bond} items
                </span>
              </div>

              <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h5 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6d8197]">Supporting Documentation</h5>
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.68rem] font-semibold text-[#6d8197]">
                    {bondRequiredDocuments.length + bondSupportingSharedDocuments.length}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {bondRequiredDocuments.map((document) => {
                    const uploadedDocument = document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null
                    const hasUploadedDocument = hasPersistedPortalDocument(uploadedDocument)
                    const statusLabel = document.complete || hasUploadedDocument ? 'Uploaded' : 'Pending'
                    const requestedByLabel = getRequestedByLabel(
                      document.requested_by_role || document.requestedByRole || document.assigned_to_role || 'bond_originator',
                    )
                    return (
                      <article key={document.key} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{document.label || 'Bond supporting document'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.description || 'Supporting document for bond processing.'}</p>
                            <p className="mt-2 text-xs font-medium text-[#7b8ca2]">Requested by: {document.requested_by_name || requestedByLabel}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7]">
                            <FileSignature size={13} />
                            {hasUploadedDocument ? 'Replace upload' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingDocumentKey === document.key}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) {
                                  void handleUploadRequiredDocument(document.key, file)
                                }
                                event.target.value = ''
                              }}
                              />
                          </label>
                          {hasUploadedDocument ? (
                            <button
                              type="button"
                              onClick={() => void handleOpenPortalDocument(uploadedDocument)}
                              disabled={openingDocumentPath === String(uploadedDocument?.file_path || uploadedDocument?.id || '')}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                            >
                              <Download size={13} />
                              {openingDocumentPath === String(uploadedDocument?.file_path || uploadedDocument?.id || '')
                                ? 'Opening...'
                                : 'View upload'}
                            </button>
                          ) : null}
                        </div>
                        {hasUploadedDocument ? (
                          <div className="mt-2 space-y-1 text-xs text-[#6b7d93]">
                            <p>
                              File: <span className="font-medium text-[#324559]">{getPortalDocumentFileName(uploadedDocument)}</span>
                            </p>
                            <p>Uploaded: {formatShortPortalDate(getPortalDocumentUploadedAt(uploadedDocument), 'Recently')}</p>
                          </div>
                        ) : null}
                      </article>
                    )
                  })}

                  {bondSupportingSharedDocuments.map((document) => (
                    <article key={document.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Supporting document'}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Uploaded by your finance team.'}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses('Uploaded')}`}>
                          Uploaded
                        </span>
                      </div>
                      {document.url ? (
                        <div className="mt-3">
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                          >
                            <Download size={13} />
                            Download
                          </a>
                        </div>
                      ) : null}
                    </article>
                  ))}

                  {!bondRequiredDocuments.length && !bondSupportingSharedDocuments.length ? (
                    <article className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-4 text-sm text-[#6b7d93]">
                      {bondSupportingDocumentsEmptyText}
                    </article>
                  ) : null}
                </div>
              </article>

              <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h5 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6d8197]">Bond Offers</h5>
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.68rem] font-semibold text-[#6d8197]">
                    {bondOfferDocuments.length + bondGrantDocuments.length}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {bondOfferDocuments.map((offer) => {
                    const isAccepted = acceptedBondOfferId && String(offer.id) === acceptedBondOfferId
                    const isDeclined = declinedBondOfferIds.has(String(offer.id))
                    return (
                      <article key={offer.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <span className="text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{offer.bankName}</span>
                            <strong className="mt-1 block text-sm font-semibold text-[#142132]">{offer.name}</strong>
                            <p className="mt-1 text-xs text-[#6b7d93]">Uploaded {formatClientPortalDate(offer.uploadedAt, 'Recently')}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(
                            isAccepted ? 'Approved' : isDeclined ? 'Rejected' : 'Uploaded',
                          )}`}>
                            {isAccepted ? 'Accepted' : isDeclined ? 'Declined' : 'Uploaded'}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {offer.downloadUrl ? (
                            <a
                              href={offer.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                            >
                              <Download size={13} />
                              View offer
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              void handleAcceptBondOffer(offer)
                            }}
                            disabled={bondApplicationSaving || isAccepted}
                            className="inline-flex items-center rounded-full bg-[#35546c] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                          >
                            {isAccepted ? 'Accepted' : 'Accept offer'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleDeclineBondOffer(offer)
                            }}
                            disabled={bondApplicationSaving || isDeclined}
                            className="inline-flex items-center rounded-full border border-[#f1d8d0] bg-white px-3 py-1.5 text-xs font-semibold text-[#b5472d] transition hover:bg-[#fff5f2] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isDeclined ? 'Declined' : 'Decline offer'}
                          </button>
                        </div>
                      </article>
                    )
                  })}

                  <article className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                    <strong className="block text-sm font-semibold text-[#142132]">Signed accepted offer</strong>
                    <p className="mt-1 text-sm text-[#6b7d93]">
                      {acceptedBondOffer
                        ? `Accepted offer: ${acceptedBondOffer.bankName}. Upload your signed copy once complete.`
                        : 'Accept an offer first, then upload your signed copy here.'}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                        Upload signed offer
                        <input
                          type="file"
                          className="hidden"
                          disabled={!acceptedBondOffer || bondApplicationSaving}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file && acceptedBondOffer) {
                              void handleUploadSignedBondOffer(file, acceptedBondOffer)
                            }
                            event.target.value = ''
                          }}
                        />
                      </label>
                      {hasSignedAcceptedOfferDocument ? (
                        <button
                          type="button"
                          onClick={() => void handleOpenPortalDocument(signedAcceptedOfferDocument)}
                          disabled={
                            openingDocumentPath ===
                            String(signedAcceptedOfferDocument?.file_path || signedAcceptedOfferDocument?.id || '')
                          }
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                        >
                          <Download size={13} />
                          {openingDocumentPath ===
                          String(signedAcceptedOfferDocument?.file_path || signedAcceptedOfferDocument?.id || '')
                            ? 'Opening...'
                            : 'View signed upload'}
                        </button>
                      ) : null}
                    </div>
                    {hasSignedAcceptedOfferDocument ? (
                      <div className="mt-2 space-y-1 text-xs text-[#6b7d93]">
                        <p>
                          File: <span className="font-medium text-[#324559]">{getPortalDocumentFileName(signedAcceptedOfferDocument)}</span>
                        </p>
                        <p>Uploaded: {formatShortPortalDate(getPortalDocumentUploadedAt(signedAcceptedOfferDocument), 'Recently')}</p>
                      </div>
                    ) : null}
                  </article>

                  {bondGrantDocuments.map((document) => (
                    <article key={document.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                      <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Bond grant document'}</strong>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Final approval document shared by your finance team.'}</p>
                      {document.url ? (
                        <div className="mt-3">
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                          >
                            <Download size={13} />
                            Download
                          </a>
                        </div>
                      ) : null}
                    </article>
                  ))}

                  {!bondOfferDocuments.length && !bondGrantDocuments.length ? (
                    <article className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-4 text-sm text-[#6b7d93]">
                      No bond offers have been shared yet.
                    </article>
                  ) : null}
                </div>
              </article>
            </section>
          ) : null}

          {activeDocumentsTabKey === 'additional' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Additional requests</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Ad hoc documents requested by attorneys, bond originators, or your team.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {documentTabCountByKey.additional} items
                </span>
              </div>
              {additionalDocumentRequestsForWorkspace.length || additionalRequestDocuments.length || additionalSharedDocuments.length ? (
                <div className="mt-4 space-y-3">
                  {additionalDocumentRequestsForWorkspace.map((request) => {
                    const uploadStateKey = `additional_request_${request.id}`
                    const linkedDocument = request?.requestedDocumentId
                      ? portalDocumentsById.get(String(request.requestedDocumentId))
                      : null
                    const hasUploadedDocument = hasPersistedPortalDocument(linkedDocument)
                    const statusLabel = String(request?.status || '').trim()
                      ? toTitleLabel(String(request.status || '').replaceAll('_', ' '))
                      : 'Requested'
                    return (
                      <article key={`request-${request.id}`} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{request.title || 'Additional request'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{request.notes || request.description || 'An additional document has been requested for your transaction.'}</p>
                            <p className="mt-2 text-xs font-medium text-[#7b8ca2]">
                              Requested by: {getRequestedByLabel(request.createdByRole || request.assignedToRole || 'agent')}
                              {request.dueDate ? ` • Due ${formatShortPortalDate(request.dueDate, 'TBC')}` : ''}
                            </p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
                            <FileSignature size={14} />
                            {hasUploadedDocument ? 'Replace upload' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingDocumentKey === uploadStateKey}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) {
                                  void handleUploadRequiredDocument(
                                    uploadStateKey,
                                    file,
                                    {
                                      documentRequestId: request.id,
                                      category: 'Additional Requests',
                                    },
                                  )
                                }
                                event.target.value = ''
                              }}
                            />
                          </label>
                          {hasUploadedDocument ? (
                            <button
                              type="button"
                              onClick={() => void handleOpenPortalDocument(linkedDocument)}
                              disabled={openingDocumentPath === String(linkedDocument?.file_path || linkedDocument?.id || '')}
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              <Download size={14} />
                              {openingDocumentPath === String(linkedDocument?.file_path || linkedDocument?.id || '')
                                ? 'Opening...'
                                : 'View upload'}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    )
                  })}

                  {additionalRequestDocuments.map((document) => {
                    const uploadedDocument = document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null
                    const hasUploadedDocument = hasPersistedPortalDocument(uploadedDocument)
                    const statusLabel = document.complete || hasUploadedDocument ? 'Uploaded' : 'Pending'
                    const requestedByLabel = getRequestedByLabel(
                      document.requested_by_role || document.requestedByRole || document.assigned_to_role,
                    )
                    return (
                      <article key={document.key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{document.label || 'Additional request'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.description || 'Your team requested an additional supporting document.'}</p>
                            <p className="mt-2 text-xs font-medium text-[#7b8ca2]">Requested by: {document.requested_by_name || requestedByLabel}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
                            <FileSignature size={14} />
                            {hasUploadedDocument ? 'Replace upload' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingDocumentKey === document.key}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) {
                                  void handleUploadRequiredDocument(document.key, file)
                                }
                                event.target.value = ''
                              }}
                              />
                          </label>
                          {hasUploadedDocument ? (
                            <button
                              type="button"
                              onClick={() => void handleOpenPortalDocument(uploadedDocument)}
                              disabled={openingDocumentPath === String(uploadedDocument?.file_path || uploadedDocument?.id || '')}
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              <Download size={14} />
                              {openingDocumentPath === String(uploadedDocument?.file_path || uploadedDocument?.id || '')
                                ? 'Opening...'
                                : 'View upload'}
                            </button>
                          ) : null}
                        </div>
                        {hasUploadedDocument ? (
                          <div className="mt-3 space-y-1 text-xs text-[#6b7d93]">
                            <p>
                              File: <span className="font-medium text-[#324559]">{getPortalDocumentFileName(uploadedDocument)}</span>
                            </p>
                            <p>Uploaded: {formatShortPortalDate(getPortalDocumentUploadedAt(uploadedDocument), 'Recently')}</p>
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
                  {additionalSharedDocuments.map((document) => (
                    <article key={document.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Additional request document'}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Shared by your transaction team.'}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses('Uploaded')}`}>
                          Uploaded
                        </span>
                      </div>
                      {document.url ? (
                        <div className="mt-4">
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                          >
                            <Download size={14} />
                            Download
                          </a>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No additional document requests are active right now.
                </div>
              )}
            </section>
          ) : null}

          {activeDocumentsTabKey === 'property' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Property documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Reference documents for the property and supporting transfer records.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {documentTabCountByKey.property} documents
                </span>
              </div>
              {propertySharedDocuments.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {propertySharedDocuments.map((document) => (
                    <article
                      key={document.id}
                      className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4"
                    >
                      <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{document.category || 'Property'}</span>
                      <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{document.name || 'Property document'}</strong>
                      {document.url ? (
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                        >
                          <Download size={14} />
                          View / Download
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No property documents have been shared yet.
                </div>
              )}
            </section>
          ) : null}
          </section>
          ) : null}
        </>
      ) : null}

      {isHandover ? (
        <section className="space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <article className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">About handover</span>
            <h3 className="mt-3 text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Final readiness before key collection</h3>
            <p className="mt-2 text-sm leading-7 text-[#5f7288]">
              Handover is the final step where the property is officially ready for you to take possession. This checklist shows
              what still needs to be completed, who is responsible, and how close your file is to completion.
            </p>
          </article>

          <article className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Handover status</span>
                <strong className="mt-3 block text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">{handoverReadinessStatus}</strong>
                <p className="mt-2 text-sm leading-7 text-[#5f7288]">{handoverReadinessSummary}</p>
              </div>
              <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold ${handoverReadinessStatusClasses}`}>
                {handoverReadinessStatus}
              </span>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#e6edf4]">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${handoverChecklistProgressPercent}%`, backgroundImage: 'linear-gradient(90deg,#3d78b0_0%,#2f8a64_100%)' }}
              />
            </div>
            <p className="mt-3 text-sm font-medium text-[#5f7288]">
              {handoverChecklistCompletedCount} of {handoverChecklistTotalCount} items completed
            </p>
          </article>

          <div className="space-y-4">
            {handoverChecklistSections.map((section) => (
              <section key={section.key} className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">{section.title}</h4>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{section.description}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                    {section.completedCount} / {section.totalCount} complete
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf3f8]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#3d78b0_0%,#2f8a64_100%)]"
                    style={{ width: `${section.totalCount ? Math.round((section.completedCount / section.totalCount) * 100) : 0}%` }}
                  />
                </div>

                <div className="mt-4 space-y-3">
                  {section.items.map((item) => {
                    const statusMeta = getChecklistProgressMeta(item.status)
                    return (
                      <article key={item.key} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{item.title}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{item.description}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                            Responsible: {item.responsible}
                          </span>
                          {item.dueDate ? (
                            <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                              Due: {item.dueDate}
                            </span>
                          ) : null}
                          <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                            Updated {stageUpdatedDateLabel}
                          </span>
                        </div>
                        {item.actionTo && item.status !== 'complete' ? (
                          <div className="mt-4">
                            <Link
                              to={getClientPortalPath(token, item.actionTo)}
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              {item.actionLabel || 'Open'}
                            </Link>
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {isSnags ? (
        <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Snags</h3>
              <p>Log practical completion items, attach supporting photos, and track how your team is progressing each fix.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Logged snags', portal.issues.length],
              ['Open items', snagOpenCount],
              ['Resolved', snagResolvedCount],
            ].map(([label, value]) => (
              <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                <span className="block text-[0.74rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
              </article>
            ))}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Log a new snag</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Add the room, explain the issue clearly, and upload a supporting image if you have one.</p>
                </div>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#dde7f1] bg-[#f8fbff] text-[#35546c]">
                  <AlertTriangle size={18} />
                </span>
              </div>

              <form className="mt-5 space-y-4" onSubmit={handleSubmitIssue}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="block text-sm font-semibold text-[#142132]">Category</span>
                    <select
                      value={issueForm.category}
                      onChange={(event) => setIssueForm((prev) => ({ ...prev, category: event.target.value }))}
                      className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#142132] outline-none transition focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                    >
                      {ISSUE_CATEGORIES.map((category) => (
                        <option value={category} key={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="block text-sm font-semibold text-[#142132]">Priority</span>
                    <select
                      value={issueForm.priority}
                      onChange={(event) => setIssueForm((prev) => ({ ...prev, priority: event.target.value }))}
                      className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#142132] outline-none transition focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                    >
                      <option value="">Select priority</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="block text-sm font-semibold text-[#142132]">Location / Area</span>
                  <input
                    type="text"
                    value={issueForm.location}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, location: event.target.value }))}
                    placeholder="Kitchen, Bedroom 2, Balcony..."
                    className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-semibold text-[#142132]">Description</span>
                  <textarea
                    value={issueForm.description}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Describe the issue clearly"
                    required
                    rows={5}
                    className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm leading-7 text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                  />
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#8ba0b8]">Upload photo (optional)</span>
                  <input
                    type="file"
                    name="photo"
                    accept="image/*"
                    className="mt-2 block w-full text-sm text-[#64748b] file:mr-3 file:rounded-full file:border-0 file:bg-[#e9f1f8] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#35546c]"
                  />
                </label>

                <div className="flex justify-end">
                  <button type="submit" disabled={saving || !issueForm.description.trim()}>
                    Submit Snag
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Snag register</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Every snag raised on this unit, with the latest internal status against each item.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {portal.issues.length} items
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {portal.issues.map((item) => (
                  <article key={item.id} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-base font-semibold text-[#142132]">{item.category}</strong>
                          <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                            {item.priority || 'Normal priority'}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-[#324559]">{item.description}</p>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                        {toTitleLabel(item.status || 'Open')}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Location</span>
                        <strong className="mt-2 block text-sm font-semibold text-[#142132]">{item.location || 'Location not provided'}</strong>
                      </div>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Logged</span>
                        <strong className="mt-2 block text-sm font-semibold text-[#142132]">
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recently'}
                        </strong>
                      </div>
                    </div>

                    {item.photo_url ? (
                      <a
                        href={item.photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                      >
                        <Download size={14} />
                        View uploaded photo
                      </a>
                    ) : null}
                  </article>
                ))}

                {!portal.issues.length ? (
                  <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-5 text-sm text-[#6b7d93]">
                    No snags have been submitted yet.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {isSettings ? (
        <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-[1.3rem] font-semibold tracking-[-0.03em] text-[#142132]">Settings</h3>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                The client workspace stays intentionally light. These settings show which support features are active on your transaction and how the team will communicate with you.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dde7f1] bg-[#fbfdff] px-4 py-2 text-sm font-semibold text-[#64748b]">
              <Settings size={16} />
              Client preferences
            </span>
          </div>

          <section className="mt-5 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">Portal access</h4>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5a6b80]">{buyerPortalAccessDescription}</p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#cfe4d8] bg-[#eef9f2] px-4 py-2 text-sm font-semibold text-[#2f7a51]">
                <ShieldCheck size={16} />
                Link active
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {buyerPortalStatusItems.map((item) => (
                <article key={`settings-${item.key}`} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                  <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">{item.label}</span>
                  <strong className="mt-3 block text-sm font-semibold text-[#142132]">{item.value}</strong>
                  <p className="mt-1 text-xs leading-5 text-[#6b7d93]">{item.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <h4 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">Workspace configuration</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Snag reporting', portal?.settings?.snag_reporting_enabled ? 'Enabled' : 'Not active'],
                  ['Alteration requests', portal?.settings?.alteration_requests_enabled ? 'Enabled' : 'Not active'],
                  ['Service reviews', portal?.settings?.service_reviews_enabled ? 'Enabled' : 'Not active'],
                  ['Document uploads', 'Always available when requested'],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-3 block text-sm font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <h4 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">Support notes</h4>
              <div className="mt-4 space-y-3">
                {[
                  'Keep your buyer portal link private. Anyone who needs access should use the link sent by your transaction team.',
                  'Use Comments & Updates on the progress page when you want your team to respond inside the shared transaction record.',
                  'Document upload requests will appear automatically in your document workspace as different role players ask for additional items.',
                  'Handover scheduling and warranty information will only appear once your transaction is close enough to occupation or transfer.',
                ].map((note) => (
                  <article key={note} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4 text-sm leading-6 text-[#5a6b80]">
                    {note}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {isTeam ? (
        <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-[1.3rem] font-semibold tracking-[-0.03em] text-[#142132]">Team</h3>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                The people and firms currently supporting your transaction across sales, legal transfer, finance, and operational coordination.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dde7f1] bg-[#fbfdff] px-4 py-2 text-sm font-semibold text-[#64748b]">
              <Users size={16} />
              {teamMembers.length + attorneyRolePlayerCards.length} team contacts
            </span>
          </div>

          {attorneyRolePlayerCards.length ? (
            <section className="mt-5 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h4 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">Legal team handling this transaction</h4>
                  <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                    Your transfer and legal milestones are managed by the firms below.
                  </p>
                </div>
                <div className="rounded-[16px] border border-[#dce7f3] bg-white px-4 py-3 text-sm text-[#35546c]">
                  <p className="m-0">
                    <strong className="text-[#142132]">Current legal stage:</strong> {MAIN_STAGE_LABELS[mainStage] || toTitleLabel(mainStage || 'in_progress')}
                  </p>
                  <p className="m-0 mt-1.5">
                    <strong className="text-[#142132]">Next legal action:</strong> {portal?.transaction?.next_action || 'Your legal team will share the next update shortly.'}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {attorneyRolePlayerCards.map((rolePlayer) => (
                  <AttorneyFirmRolePlayerCard
                    key={rolePlayer.key}
                    rolePlayer={rolePlayer.value}
                    assignmentLabel={rolePlayer.label}
                    readOnly
                  />
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {teamMembers.map((member) => (
              <article key={member.title} className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">{member.title}</span>
                    <h4 className="mt-3 text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">{member.name}</h4>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{member.detail}</p>
                    {member.extraDetail ? (
                      <p className="mt-3 rounded-[14px] border border-[#d7eadf] bg-white px-3 py-2 text-sm leading-6 text-[#1f6f46]">
                        {member.extraDetail}
                      </p>
                    ) : null}
                  </div>
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#dde7f1] bg-white text-[#35546c]">
                    <Users size={18} />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {isAlterations ? (
        <section className="client-portal-card">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Alteration Requests</h3>
              <p>Submit controlled changes for developer review and formal response.</p>
            </div>
          </div>

          <section className="rounded-[18px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Default cost treatment</p>
                <h4 className="mt-1 text-[1rem] font-semibold text-[#142132]">{defaultAlterationChargeTreatmentLabel}</h4>
                <p className="mt-1 text-sm leading-6 text-[#5f7288]">{defaultAlterationChargeTreatmentDescription}</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                Applied unless your team confirms otherwise
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <article className="rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Included in purchase price</span>
                <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{ZAR_CURRENCY.format(alterationIncludedTotal)}</strong>
              </article>
              <article className="rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Separate invoices</span>
                <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{ZAR_CURRENCY.format(alterationSeparateInvoiceTotal)}</strong>
              </article>
            </div>
          </section>

          <form className="stack-form client-form" onSubmit={handleSubmitAlteration}>
            <label>
              Request Title
              <input
                type="text"
                value={alterationForm.title}
                onChange={(event) => setAlterationForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </label>

            <label>
              Category
              <input
                type="text"
                value={alterationForm.category}
                onChange={(event) => setAlterationForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Kitchen, Lighting, Flooring..."
              />
            </label>

            <label>
              Description
              <textarea
                value={alterationForm.description}
                onChange={(event) => setAlterationForm((prev) => ({ ...prev, description: event.target.value }))}
                required
              />
            </label>

            <div className="client-two-col">
              <label>
                Budget Range (optional)
                <input
                  type="text"
                  value={alterationForm.budgetRange}
                  onChange={(event) => setAlterationForm((prev) => ({ ...prev, budgetRange: event.target.value }))}
                  placeholder="R 10,000 - R 15,000"
                />
              </label>

              <label>
                Preferred Timing (optional)
                <input
                  type="text"
                  value={alterationForm.preferredTiming}
                  onChange={(event) => setAlterationForm((prev) => ({ ...prev, preferredTiming: event.target.value }))}
                  placeholder="Before occupancy"
                />
              </label>
            </div>

            <label>
              Reference image (optional)
              <input type="file" name="referenceImage" accept="image/*" />
            </label>

            <button className="client-primary-btn" type="submit" disabled={saving || !alterationForm.title.trim() || !alterationForm.description.trim()}>
              Submit Request
            </button>
          </form>

          <ul className="request-list">
            {alterationRequestItems.map((item) => {
              const itemChargeTreatment = normalizePortalAlterationChargeTreatment(
                item?.charge_treatment || item?.chargeTreatment || defaultAlterationChargeTreatment,
              )
              const itemAmount = Number(item?.amount_inc_vat) || 0
              return (
                <li key={item.id} className="request-row">
                  <div className="request-main">
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                    <span>
                      {item.category || 'General'} • {item.budget_range || 'No budget supplied'} •{' '}
                      {item.preferred_timing || 'No timing supplied'}
                    </span>
                    <span>
                      Cost treatment: {getAlterationChargeTreatmentLabel(itemChargeTreatment)}
                      {itemAmount > 0 ? ` • Amount: ${ZAR_CURRENCY.format(itemAmount)}` : ''}
                    </span>
                    {item.reference_image_url ? (
                      <a href={item.reference_image_url} target="_blank" rel="noreferrer" className="inline-link">
                        View reference image
                      </a>
                    ) : null}
                  </div>
                  <span className="status-pill">{item.status}</span>
                </li>
              )
            })}
            {!alterationRequestItems.length ? <li className="empty-text">No alteration requests submitted yet.</li> : null}
          </ul>
        </section>
      ) : null}

      {isReview ? (
        <section className="client-portal-card">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Service Review</h3>
              <p>Share your experience once your transaction reaches final completion stages.</p>
            </div>
          </div>

          {portal.featureAvailability.review ? (
            <form className="stack-form client-form" onSubmit={handleSubmitReview}>
              <label>
                Rating
                <select value={reviewForm.rating} onChange={(event) => setReviewForm((prev) => ({ ...prev, rating: Number(event.target.value) }))}>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option value={rating} key={rating}>
                      {rating} Star{rating > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Review
                <textarea
                  value={reviewForm.reviewText}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, reviewText: event.target.value }))}
                  placeholder="How was your overall experience?"
                />
              </label>

              <label>
                What went well
                <textarea
                  value={reviewForm.positives}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, positives: event.target.value }))}
                />
              </label>

              <label>
                What could be improved
                <textarea
                  value={reviewForm.improvements}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, improvements: event.target.value }))}
                />
              </label>

              <label className="upload-client-visible-toggle">
                <input
                  type="checkbox"
                  checked={reviewForm.allowMarketingUse}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, allowMarketingUse: event.target.checked }))}
                />
                Allow testimonial/marketing use of this review
              </label>

              <button className="client-primary-btn" type="submit" disabled={saving}>
                Submit Review
              </button>
            </form>
          ) : (
            <p className="status-message">Reviews open once your transaction reaches registration/handover stage.</p>
          )}

          <ul className="request-list">
            {portal.reviews.map((item) => (
              <li key={item.id} className="review-row">
                <div className="review-rating">{'★'.repeat(item.rating)}{'☆'.repeat(Math.max(0, 5 - item.rating))}</div>
                <p>{item.review_text || 'No review text submitted.'}</p>
                <span>
                  Positives: {item.positives || '-'}
                  <br />
                  Improvements: {item.improvements || '-'}
                </span>
                <small>{new Date(item.created_at).toLocaleDateString()}</small>
              </li>
            ))}
            {!portal.reviews.length ? <li className="empty-text">No reviews submitted yet.</li> : null}
          </ul>
        </section>
      ) : null}

          </div>

        </div>
      </div>
    </main>
  )
}

export default ClientPortal
