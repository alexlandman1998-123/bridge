import {
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe,
  HandCoins,
  Home,
  ImagePlus,
  Info,
  Eye,
  Loader2,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Copy,
  Download,
  Link2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import StartDocumentModal from '../components/documents/StartDocumentModal'
import SellerDocumentReviewActions from '../components/documents/SellerDocumentReviewActions'
import {
  ListingWorkspacePortalActionPanel,
  ListingWorkspacePortalChecklist,
  ListingWorkspacePortalFixGuide,
  ListingWorkspacePortalGoLiveProof,
  ListingWorkspacePortalPublishGate,
  ListingWorkspacePortalReadinessGrid,
  ListingWorkspaceTabs,
} from '../components/listings/ListingWorkspaceShell'
import AddressAutocomplete from '../components/location/AddressAutocomplete'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  DOCUMENT_START_DOCUMENT_KINDS,
  DOCUMENT_START_ENTRY_POINTS,
  DOCUMENT_START_PACKET_TYPES,
  DOCUMENT_START_SOURCE_MODES,
} from '../core/documents/documentStartRules'
import { appendDocumentStartLegalScenarioParams } from '../core/documents/documentStartLegalScenario'
import {
  buildAcceptedOfferConversionPreflight,
  formatAcceptedOfferConversionPreflightMessage,
} from '../core/transactions/acceptedOfferConversionPreflight'
import {
  OFFER_WORKFLOW_RETIRED,
  OFFER_WORKFLOW_RETIRED_MESSAGE,
} from '../core/offers/offerWorkflowRetirement'
import { requestPersistedPdfAccess } from '../lib/documentPacketsApi'
import {
  getListingReadinessSummary,
  getRequiredSellerDocuments,
  getSellerRequirementProfile,
} from '../lib/privateListingRequirementEngine'
import {
  createAppointmentAsync,
  listAppointmentsAsync,
} from '../lib/agencyPipelineService'
import {
  fetchAgencyCrmLeadWorkspace,
  listAgencyCrmLeadContacts,
  updateAgencyCrmContactRecord,
  updateAgencyCrmLeadRecord,
} from '../lib/agencyCrmRepository'
import {
  buildLeadListingLinkPatch,
  getBuyerLeadOptions,
  isLeadLinkedToListing,
  mapAgencyLeadSelectionRows,
} from '../lib/agencyLeadSelection'
import { assessBuyerOfferEligibility, assessBuyerOfferIntegrity, assessSellerOnboardingIntegrity } from '../lib/listingDataIntegrity'
import { buildAgentAssistedOfferEntry } from '../lib/agentAssistedOfferEntry'
import {
  LISTING_SELLER_PROFILE_BRANCHES,
  addListingSellerProfileDraftPerson,
  buildListingSellerProfileRequirementProjection,
  createListingSellerProfileBuilderDraft,
  removeListingSellerProfileDraftPerson,
  updateListingSellerProfileDraftPerson,
  validateListingSellerProfileBuilderDraft,
} from '../lib/listingSellerProfileBuilderModel'
import { resolveOfferLinkDeliveryPlan } from '../lib/offerLinkDeliveryPlan'
import {
  buildSellerOnboardingLink,
  buildSellerClientPortalLink,
  deleteAgentPrivateListingCascade,
  generateId,
  generateSellerOnboardingToken,
  readAgentPrivateListings,
  writeAgentPrivateListings,
} from '../lib/agentListingStorage'
import { buildDirectListingOperationalSummary } from '../lib/directListingOperationalSummary'
import { findPrivateListingById, getPrivateListingRecordId, sanitizePrivateListingRows } from '../lib/privateListingRecordIntegrity'
import {
  completeViewingRequest,
  formatViewingStatusLabel,
  getViewingRequestsForListing,
  rescheduleViewingRequest,
  saveViewingFeedback,
  updateViewingParticipantResponse,
  VIEWING_RESPONSE_STATUS,
  VIEWING_STATUS,
} from '../lib/viewingWorkflow'
import {
  createOfferInvite,
  getOfferInvitesForListing,
  getOffersForListing,
  markOfferAgentAction,
  normalizeOfferWorkflowStatus,
  OFFER_WORKFLOW_STATUS,
} from '../lib/listingOffersService'
import {
  CLIENT_INTAKE_PREFERENCE,
  createCanonicalOffer,
  createOfferSellerReviewSession,
  createTransactionFromAcceptedCanonicalOffer,
  getClientIntakePreferenceLabel,
  getSellerOfferReviewDeliveryModeLabel,
  listCanonicalOffersForListing,
  normalizeSellerReviewDeliveryMode,
  buildSellerOfferReviewPreparation,
  normalizeClientIntakePreference,
  recordBuyerLeadActivity,
  SELLER_REVIEW_DELIVERY_MODE,
  updateCanonicalOfferStatus,
} from '../lib/buyerLifecycleService'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { isUnsafeFallbackAllowed } from '../lib/envValidation'
import { resolveTransactionRoutingProfile } from '../services/transactionRoutingProfileService'
import {
  getPrivateListing,
  createPrivateListingDocumentDownloadUrl,
  deletePrivateListing,
  getSellerPortalAccessState,
  getSellerPortalSecurityDiagnostics,
  issueSellerPortalInvite,
  isSellerPortalInviteReadyAfterSignedMandate,
  markPrivateListingDocumentsPendingTransactionPromotion,
  resetSellerPortalPassword,
  sendSellerOnboarding,
  syncPrivateListingDistributionData,
  updatePrivateListing,
  updatePrivateListingOnboardingFormData,
  uploadPrivateListingDocument,
  uploadPrivateListingMediaAsset,
} from '../services/privateListingService'
import { repairSellerDocumentTransactionContinuity } from '../services/sellerDocumentTransactionContinuityService'
import { listListingLeadInterests } from '../services/leadListingInterestService'
import { listListingPropertyShares } from '../services/leadPropertySharingService'
import {
  buildDefaultLeadCommunicationPreferences,
  getLeadCommunicationPreferences,
  NOTIFICATION_MODE,
  resolveNotificationDispatchPlan,
  listCommunicationDeliveries,
} from '../services/communicationDeliveryService'
import {
  prepareNotificationOutbox,
  updateNotificationOutboxStatus,
} from '../services/notificationOutboxService'
import { buildListingWorkspaceAnalyticsSummary } from '../services/leadAnalyticsService'
import {
  buildListingWorkspacePortalActionPlan,
  buildListingWorkspacePortalChecklist,
  buildListingWorkspacePortalFixGuide,
  buildListingWorkspacePortalGoLiveProof,
  buildListingWorkspacePortalPublishGate,
  buildListingWorkspacePortalSummary,
  buildListingWorkspaceTabs,
  resolveSalesListingWorkspaceTabFromLegacyState,
  resolveSalesListingWorkspaceTarget,
} from '../services/listings/listingWorkspaceUiModel'
import { buildSellerMandateContinuityModel } from '../services/sellerMandateContinuityService'
import { buildSellerDocumentSourceOfTruth } from '../services/sellerDocumentRequirementsService'
import { reviewSellerDocument, sendSellerDocumentManualReminder } from '../services/sellerDocumentReviewWorkflowService'
import {
  getSellerBasePackAliases,
  SELLER_BASE_PACK_KEYS,
} from '../lib/sellerBasePackContract'
import { buildSellerDocumentExperienceModel } from '../lib/sellerDocumentExperienceModel'
import { buildSellerDocumentReviewSlaReport } from '../lib/sellerDocumentReviewSla'
import {
  KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS,
  KINGSTONS_SELLER_PROCESS_PROFILE,
  resolveSellerProcessProfile,
} from '../services/sellerProcessProfileService'
import { buildKingstonsDigitalSigningDecision } from '../core/kingstons/digitalSigningDecision'
import {
  buildKingstonsBuyerOtpDigitalDecision,
  buildKingstonsBuyerOtpOfferLink,
  buildKingstonsBuyerOtpReadiness,
  KINGSTONS_BUYER_OTP_REQUIREMENT,
  KINGSTONS_BUYER_OTP_TRANSACTION_HANDOFF_SOURCE,
} from '../core/transactions/kingstonsBuyerOtpReadiness'
import {
  SELLER_PORTAL_ACTIVATION_SOURCES,
  activateSellerPortalForListing,
  buildSellerPortalInvitationPreview,
  getSellerPortalStatusLabel,
  resolveSellerPortalLifecycle,
} from '../services/sellerPortalActivationService'
import {
  captureShowDayLead,
  captureShowDayLeadBatch,
  DEFAULT_SHOW_DAY_NEXT_STEP,
  parseShowDayVisitorRows,
} from '../services/showDayLeadCaptureService'
import {
  acceptSuggestion,
  generateSuggestionsForListing,
  getSuggestionsForListing,
  rejectSuggestion,
} from '../services/leadSuggestionService'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import { upsertAreaFromAddress } from '../lib/location/upsertArea'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'

const PIPELINE_STORAGE_KEY = 'itg:pipeline-leads:v1'
const LISTING_MARKETING_DRAFT_STORAGE_KEY = 'itg:listing-marketing-draft:v1'

const CLIENT_INTAKE_PREFERENCE_OPTIONS = [
  { value: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL, label: getClientIntakePreferenceLabel(CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL) },
  { value: CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED, label: getClientIntakePreferenceLabel(CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED) },
  { value: CLIENT_INTAKE_PREFERENCE.HARD_COPY, label: getClientIntakePreferenceLabel(CLIENT_INTAKE_PREFERENCE.HARD_COPY) },
]

const SELLER_REVIEW_DELIVERY_OPTIONS = [
  { value: SELLER_REVIEW_DELIVERY_MODE.EMAIL, label: getSellerOfferReviewDeliveryModeLabel(SELLER_REVIEW_DELIVERY_MODE.EMAIL) },
  { value: SELLER_REVIEW_DELIVERY_MODE.AGENT_ASSISTED, label: getSellerOfferReviewDeliveryModeLabel(SELLER_REVIEW_DELIVERY_MODE.AGENT_ASSISTED) },
  { value: SELLER_REVIEW_DELIVERY_MODE.HARD_COPY, label: getSellerOfferReviewDeliveryModeLabel(SELLER_REVIEW_DELIVERY_MODE.HARD_COPY) },
]

const SELLER_WORKSPACE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'leads', label: 'Leads' },
  { key: 'seller', label: 'Seller' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'documents', label: 'Documents' },
  { key: 'commission', label: 'Commission' },
  { key: 'activity', label: 'Activity' },
]

const SELLER_PROFILE_SECTION_FIELDS = [
  {
    key: 'seller_details',
    title: 'Seller Details',
    icon: UserRound,
    fields: [
      { key: 'fullName', label: 'Full name' },
      { key: 'idNumber', label: 'ID / Registration number' },
      { key: 'sellerType', label: 'Seller type', as: 'select', options: ['individual', 'company', 'trust', 'close_corporation', 'deceased_estate'] },
      { key: 'maritalStatus', label: 'Marital status' },
    ],
  },
  {
    key: 'contact_details',
    title: 'Contact Details',
    icon: Link2,
    fields: [
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'alternativeContact', label: 'Alternative contact' },
      { key: 'preferredContactMethod', label: 'Preferred contact method', as: 'select', options: ['email', 'phone', 'whatsapp'] },
    ],
  },
  {
    key: 'property_ownership',
    title: 'Property & Ownership',
    icon: Home,
    fields: [
      { key: 'propertyAddress', label: 'Property address' },
      { key: 'ownershipType', label: 'Ownership type' },
      { key: 'titleDeedNumber', label: 'Title deed number' },
      { key: 'bondHolder', label: 'Bond holder' },
      { key: 'outstandingBond', label: 'Outstanding bond', type: 'number' },
      { key: 'coOwnerDetails', label: 'Co-owner details', as: 'textarea' },
    ],
  },
  {
    key: 'mandate_details',
    title: 'Mandate Details',
    icon: FileText,
    fields: [
      { key: 'mandateType', label: 'Mandate type' },
      { key: 'askingPrice', label: 'Asking price', type: 'number' },
      { key: 'mandateStartDate', label: 'Mandate start date', type: 'date' },
      { key: 'expiryDate', label: 'Expiry date', type: 'date' },
      { key: 'commissionPreference', label: 'Commission preference' },
      { key: 'mandateTerms', label: 'Mandate terms', as: 'textarea' },
      { key: 'popiConsent', label: 'POPI consent', as: 'select', options: ['yes', 'no'] },
    ],
  },
  {
    key: 'compliance',
    title: 'Compliance',
    icon: ShieldCheck,
    fields: [
      { key: 'ficaStatus', label: 'FICA status' },
      { key: 'taxNumber', label: 'Tax number' },
      { key: 'popiConsent', label: 'POPI consent', as: 'select', options: ['yes', 'no'] },
      { key: 'electricalCertificate', label: 'Electrical certificate' },
      { key: 'plumbingCertificate', label: 'Plumbing certificate' },
      { key: 'occupationCertificate', label: 'Occupation certificate' },
      { key: 'buildingPlans', label: 'Building plans' },
    ],
  },
  {
    key: 'notes',
    title: 'Notes / Special Conditions',
    icon: Info,
    fields: [
      { key: 'sellingReason', label: 'Selling reason' },
      { key: 'sellingTimeline', label: 'Selling timeline' },
      { key: 'specialConditions', label: 'Special conditions', as: 'textarea' },
      { key: 'notes', label: 'Notes', as: 'textarea' },
    ],
  },
]

const SELLER_PROFILE_SECTION_BY_KEY = new Map(SELLER_PROFILE_SECTION_FIELDS.map((section) => [section.key, section]))

const LISTING_PERFORMANCE_OVERRIDE_FIELDS = [
  { key: 'totalViews', label: 'Views', helper: 'Total buyer views across all channels.' },
  { key: 'portalViews', label: 'Portal views', helper: 'Property portal views shown to the seller.' },
  { key: 'bridgeViews', label: 'Arch9 views', helper: 'Arch9 / agency website views.' },
  { key: 'leadCount', label: 'Leads', helper: 'Total buyer leads received.' },
  { key: 'newThisWeek', label: 'New this week', helper: 'New leads received in the last seven days.' },
  { key: 'scheduledViewings', label: 'Viewings', helper: 'Booked or requested viewings.' },
  { key: 'completedViewings', label: 'Completed viewings', helper: 'Viewings already completed.' },
  { key: 'offerCount', label: 'Offers', helper: 'Total offers received.' },
  { key: 'pendingOffers', label: 'Active / pending offers', helper: 'Offers still active or pending.' },
  { key: 'daysOnMarket', label: 'Days on market', helper: 'Current days marketed.' },
  { key: 'areaAverageDays', label: 'Area average days', helper: 'Local benchmark shown with days on market.' },
]

const LISTING_PERFORMANCE_OVERRIDE_KEYS = new Set(LISTING_PERFORMANCE_OVERRIDE_FIELDS.map((field) => field.key))

function getSellerWorkspaceTabFromSearch(search = '') {
  const requestedTab = new URLSearchParams(String(search || '')).get('tab')
  const normalizedTab = requestedTab === 'offers' ? 'leads' : requestedTab === 'listing' ? 'marketing' : requestedTab
  return SELLER_WORKSPACE_TABS.some((tab) => tab.key === normalizedTab) ? normalizedTab : ''
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || '').trim())
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function buildAcceptedOfferOtpWorkspacePath({
  transactionId = '',
  offerId = '',
  leadId = '',
  listingId = '',
  sourceMode = DOCUMENT_START_SOURCE_MODES.saved,
  legalScenario = null,
  returnTo = '',
} = {}) {
  const resolvedTransactionId = normalizeText(transactionId)
  if (!resolvedTransactionId) return ''
  const params = new URLSearchParams()
  params.set('mode', 'generate')
  params.set('sourceMode', normalizeText(sourceMode) || DOCUMENT_START_SOURCE_MODES.saved)
  params.set('documentStart', DOCUMENT_START_ENTRY_POINTS.acceptedOfferOtp)
  appendDocumentStartLegalScenarioParams(params, legalScenario || {}, 'otp')
  if (offerId) params.set('offerId', normalizeText(offerId))
  if (leadId) params.set('leadId', normalizeText(leadId))
  if (listingId) params.set('listingId', normalizeText(listingId))
  if (returnTo) params.set('returnTo', returnTo)
  return `/transactions/${encodeURIComponent(resolvedTransactionId)}/legal/otp?${params.toString()}`
}

const ATTORNEY_OPTIONS = [
  'Arch9 Conveyancing',
  'Hayley Appel',
  'Stonehouse Legal',
  'Transfer Desk Pretoria',
]

const BOND_ORIGINATOR_OPTIONS = [
  'Arch9 Finance',
  'Sygnia Home Loans',
  'Mortgage Connect',
  'Prime Bond Desk',
]

const PROPERTY_TYPE_OPTIONS = ['House', 'Apartment', 'Townhouse', 'Cluster', 'Land', 'Commercial', 'Mixed-use']
const LISTING_STATUS_OPTIONS = ['mandate_signed', 'active', 'under_offer', 'sold', 'withdrawn']
const FEATURE_OPTIONS = [
  'Pool',
  'Garden',
  'Security',
  'Electric Fence',
  'Solar',
  'Backup Power',
  'Backup Water',
  'Borehole',
  'Fibre',
  'Pet Friendly',
  'Study',
  'Staff Quarters',
  'Entertainment Area',
  'Built-in Braai',
  'Fireplace',
  'Air Conditioning',
  'Open-plan Living',
  'Balcony',
  'Sea View',
  'Mountain View',
  'Flatlet',
  'New Development',
]
const LISTING_TYPE_OPTIONS = ['Sale', 'Rental']
const PUBLICATION_STATUS_OPTIONS = ['Draft', 'Ready', 'Published', 'Archived']
const AMENITY_OPTIONS = ['Security Estate', 'Clubhouse', 'Kids Play Area', 'Walking Trails', 'Built-in Braai', 'Solar System', 'Staff Accommodation', 'Open Plan Living']
const EXTERNAL_LINK_PLATFORM_OPTIONS = ['Property24', 'Private Property', 'Agency Website', 'Facebook Marketplace', 'Instagram', 'Gumtree', 'Other']
const EXTERNAL_LINK_STATUS_OPTIONS = ['Draft', 'Live', 'Removed', 'Expired']
const PORTAL_STATUS_OPTIONS = ['not_published', 'draft', 'published', 'paused', 'removed']
const PROPERTY24_STATUS_UPDATE_OPTIONS = ['Active', 'Pending', 'Sold', 'Withdrawn']
const ARCH9_PUBLIC_SITE_ORIGIN = 'https://www.arch9.co.za'
const ARCH9_PUBLIC_LISTINGS_API_PATH = '/api/public/listings'
const PROPERTY24_LISTING_API_BASE_PATH = '/api/property24/listings'
const LISTING_SYSTEM_PUBLICATION_FEATURE_KEYS = new Set([
  'estate_or_hoa',
  'sectional_title',
  'on_auction',
  'price_on_application',
  'reduced_banner',
  'no_transfer_duty',
])
const LISTING_FEATURE_LABEL_BY_KEY = new Map(
  [...FEATURE_OPTIONS, ...AMENITY_OPTIONS].map((label) => [normalizeKey(label), label]),
)

function toTitleCaseLabel(value = '') {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ')
}

function normalizeListingFeatureLabel(value = '') {
  const key = normalizeKey(value)
  if (!key || LISTING_SYSTEM_PUBLICATION_FEATURE_KEYS.has(key)) return ''
  return LISTING_FEATURE_LABEL_BY_KEY.get(key) || toTitleCaseLabel(value)
}

function normalizeListingFeatureSelections(...sources) {
  const labels = []
  const pushValue = (value) => {
    if (Array.isArray(value)) {
      value.forEach(pushValue)
      return
    }
    if (value && typeof value === 'object') {
      pushValue(value.label || value.name || value.value || value.key || value.id)
      return
    }
    String(value || '')
      .split(/[\n,]+/)
      .map(normalizeListingFeatureLabel)
      .filter(Boolean)
      .forEach((label) => labels.push(label))
  }

  sources.forEach(pushValue)
  return [...new Set(labels)]
}
const SELLER_PACK_TRANSACTION_REQUIREMENT_KEYS = [
  SELLER_BASE_PACK_KEYS.SIGNED_MANDATE,
  SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM,
  SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
]
const KINGSTONS_SELLER_PACK_TRANSACTION_HANDOFF_SOURCE = 'kingstons_seller_pack_phase5_transaction_handoff'
const SELLER_PACK_TRANSACTION_REQUIREMENT_LABELS = Object.freeze({
  [SELLER_BASE_PACK_KEYS.SIGNED_MANDATE]: 'Signed Mandate',
  [SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM]: 'Signed Mandatory Disclosure / Defects Form',
  [SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION]: 'Signed FICA Declaration',
})
const SELLER_PACK_TRANSACTION_REQUIREMENT_ALIASES = Object.freeze({
  [SELLER_BASE_PACK_KEYS.SIGNED_MANDATE]: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_MANDATE),
  [SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM]: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM),
  [SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION]: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION),
})

function hasKingstonsListingSignal({ listingRecord = {}, listingOrganisationId = '', profile = {} } = {}) {
  const explicitOrganisationId = String(
    listingOrganisationId ||
      listingRecord?.organisationId ||
      listingRecord?.organisation_id ||
      profile?.organisationId ||
      profile?.organisation_id ||
      '',
  ).trim().toLowerCase()
  if (KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS.includes(explicitOrganisationId)) return true

  const processProfile = resolveSellerProcessProfile({
    listing: listingRecord,
    row: listingRecord,
    organisationId: explicitOrganisationId,
    profile: listingRecord?.sellerProcessProfile || listingRecord?.seller_process_profile,
  })
  if (processProfile.profile === KINGSTONS_SELLER_PROCESS_PROFILE) return true

  const signals = [
    profile?.email,
    listingRecord?.assignedAgentEmail,
    listingRecord?.assigned_agent_email,
    listingRecord?.assignedAgentName,
    listingRecord?.assigned_agent_name,
    listingRecord?.agencyName,
    listingRecord?.agency_name,
    profile?.organisationName,
    profile?.companyName,
    profile?.agencyName,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)

  return signals.some((value) => value.includes('kingstons.training@arch9.test') || value.includes('@kingstons.') || value.includes('kingstons'))
}

function mergeListingRecord(existing = {}, incoming = {}) {
  return {
    ...(existing || {}),
    ...(incoming || {}),
    marketing: {
      ...((existing || {}).marketing || {}),
      ...((incoming || {}).marketing || {}),
    },
    propertyDetails: {
      ...((existing || {}).propertyDetails || {}),
      ...((incoming || {}).propertyDetails || {}),
    },
    rolePlayers: {
      ...((existing || {}).rolePlayers || {}),
      ...((incoming || {}).rolePlayers || {}),
    },
  }
}

function upsertListingRecord(rows = [], incoming = null) {
  if (!incoming?.id) return rows
  let found = false
  const nextRows = sanitizePrivateListingRows(rows).map((row) => {
    if (String(row?.id || '') !== String(incoming.id)) return row
    found = true
    return mergeListingRecord(row, incoming)
  })
  return found ? nextRows : [incoming, ...nextRows]
}

function firstDraftValue(...values) {
  for (const value of values) {
    if (value === 0 || value === false) return value
    const normalized = String(value ?? '').trim()
    if (normalized) return value
  }
  return ''
}

function buildListingMandatePacketSummary(listingRecord = {}, mandateWorkspace = {}) {
  const mandate = listingRecord?.mandate || {}
  const storedPacket = listingRecord?.mandatePacket && typeof listingRecord.mandatePacket === 'object'
    ? listingRecord.mandatePacket
    : listingRecord?.mandate_packet && typeof listingRecord.mandate_packet === 'object'
      ? listingRecord.mandate_packet
      : mandate?.packet && typeof mandate.packet === 'object'
        ? mandate.packet
        : {}
  const storedVersion = storedPacket?.version && typeof storedPacket.version === 'object' ? storedPacket.version : {}
  const mandatePacketId = firstDraftValue(
    listingRecord?.mandatePacketId,
    listingRecord?.mandate_packet_id,
    storedPacket?.id,
    storedPacket?.packetId,
    storedPacket?.packet_id,
    storedPacket?.packet?.id,
    storedVersion?.packet_id,
    mandate?.packetId,
    mandate?.packet_id,
    mandate?.id,
  )
  const finalSignedFilePath = firstDraftValue(
    listingRecord?.mandateSignedDocumentPath,
    listingRecord?.mandate_signed_document_path,
    listingRecord?.finalSignedFilePath,
    listingRecord?.final_signed_file_path,
    mandate?.finalSignedFilePath,
    mandate?.final_signed_file_path,
    mandate?.signedFilePath,
    mandate?.signed_file_path,
    storedPacket?.finalSignedFilePath,
    storedPacket?.final_signed_file_path,
    storedVersion?.finalSignedFilePath,
    storedVersion?.final_signed_file_path,
  )
  const finalSignedFileUrl = firstDraftValue(
    listingRecord?.mandateSignedDocumentUrl,
    listingRecord?.mandate_signed_document_url,
    listingRecord?.finalSignedFileUrl,
    listingRecord?.final_signed_file_url,
    mandate?.finalSignedFileUrl,
    mandate?.finalSignedDownloadUrl,
    mandate?.final_signed_file_url,
    mandate?.signedFileUrl,
    mandate?.signed_file_url,
    storedPacket?.finalSignedDownloadUrl,
    storedPacket?.finalSignedFileAccessUrl,
    storedPacket?.final_signed_file_url,
    storedVersion?.final_signed_file_access_url,
    storedVersion?.final_signed_file_url,
    mandateWorkspace.signedUrl,
    mandateWorkspace.viewUrl,
  )
  const finalSignedFileBucket = firstDraftValue(
    listingRecord?.finalSignedFileBucket,
    listingRecord?.final_signed_file_bucket,
    listingRecord?.mandateSignedDocumentBucket,
    listingRecord?.mandate_signed_document_bucket,
    mandate?.finalSignedFileBucket,
    mandate?.final_signed_file_bucket,
    mandate?.signedFileBucket,
    mandate?.signed_file_bucket,
    storedPacket?.finalSignedFileBucket,
    storedPacket?.final_signed_file_bucket,
    storedVersion?.finalSignedFileBucket,
    storedVersion?.final_signed_file_bucket,
  )
  if (!mandatePacketId && !finalSignedFilePath && !finalSignedFileUrl) return null

  const versionId = firstDraftValue(
    mandate?.versionId,
    mandate?.version_id,
    listingRecord?.mandatePacketVersionId,
    listingRecord?.mandate_packet_version_id,
    storedPacket?.packetVersionId,
    storedPacket?.packet_version_id,
    storedVersion?.id,
  )
  const finalSignedFileName = firstDraftValue(
    mandate?.finalSignedFileName,
    mandate?.signedFileName,
    storedPacket?.finalSignedFileName,
    storedPacket?.final_signed_file_name,
    storedVersion?.finalSignedFileName,
    storedVersion?.final_signed_file_name,
    'Signed Mandate.pdf',
  )

  return {
    id: mandatePacketId,
    state: mandateWorkspace.isSigned ? 'fully_signed' : mandateWorkspace.status,
    status: mandateWorkspace.status,
    packet: { ...(storedPacket?.packet || {}), id: mandatePacketId, status: mandateWorkspace.status },
    version: {
      ...storedVersion,
      id: versionId,
      final_signed_file_path: finalSignedFilePath,
      final_signed_file_url: finalSignedFileUrl,
      final_signed_file_name: finalSignedFileName,
      final_signed_file_bucket: finalSignedFileBucket,
      finalised_at: firstDraftValue(storedVersion?.finalised_at, storedVersion?.finalized_at, mandateWorkspace.signedDate),
    },
    finalSignedFilePath,
    finalSignedDownloadUrl: finalSignedFileUrl,
    finalSignedFileName,
    finalSignedFileBucket,
    finalSignedRecorded: Boolean(
      listingRecord?.finalSignedRecorded ||
        listingRecord?.final_signed_recorded ||
        mandate?.finalSignedRecorded ||
        mandate?.final_signed_recorded ||
        storedPacket?.finalSignedRecorded ||
        storedPacket?.final_signed_recorded ||
        storedVersion?.final_signed_document_id ||
        finalSignedFilePath ||
        finalSignedFileUrl,
    ),
  }
}

function mapAppointmentStatusToViewingStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (['confirmed', 'accepted'].includes(normalized)) return VIEWING_STATUS.CONFIRMED
  if (normalized === 'completed') return VIEWING_STATUS.COMPLETED
  if (normalized === 'cancelled' || normalized === 'canceled') return VIEWING_STATUS.CANCELLED
  if (normalized === 'declined') return VIEWING_STATUS.DECLINED
  if (normalized === 'no_show' || normalized === 'no show') return VIEWING_STATUS.NO_SHOW
  if (normalized.includes('alternative') || normalized.includes('reschedule')) return VIEWING_STATUS.RESCHEDULE_REQUESTED
  return VIEWING_STATUS.PENDING_APPROVAL
}

function mapAppointmentParticipantToViewingParticipant(participant = {}) {
  const rsvpStatus = String(participant?.rsvpStatus || participant?.rsvp_status || '').trim().toLowerCase()
  return {
    participant_id: participant?.participantId || participant?.participant_id || participant?.userId || participant?.user_id || participant?.email || participant?.name || '',
    role: String(participant?.participantRole || participant?.participant_role || participant?.role || 'participant').trim().toLowerCase(),
    name: participant?.name || participant?.email || 'Participant',
    response_status:
      rsvpStatus === 'accepted'
        ? VIEWING_RESPONSE_STATUS.ACCEPTED
        : rsvpStatus === 'declined'
          ? VIEWING_RESPONSE_STATUS.DECLINED
          : rsvpStatus.includes('proposed')
            ? VIEWING_RESPONSE_STATUS.PROPOSED_NEW_TIME
            : VIEWING_RESPONSE_STATUS.PENDING,
    responded_at: participant?.respondedAt || participant?.responded_at || null,
  }
}

function mapAppointmentToViewingRecord(appointment = {}) {
  const participants = Array.isArray(appointment?.participants) ? appointment.participants : []
  const clientParticipant = participants.find((participant) => {
    const role = String(participant?.participantRole || participant?.participant_role || '').trim().toLowerCase()
    return role && role !== 'agent' && role !== 'principal'
  }) || participants.find((participant) => participant?.email || participant?.name) || null
  const dateTime = appointment?.dateTime || appointment?.date_time || ''
  const proposedDate = appointment?.date || appointment?.appointmentDate || appointment?.appointment_date || (dateTime ? String(dateTime).slice(0, 10) : '')
  const proposedTime = appointment?.startTime || appointment?.start_time || (dateTime ? String(dateTime).slice(11, 16) : '')
  return {
    viewing_id: appointment?.appointmentId || appointment?.appointment_id || appointment?.id,
    appointment_id: appointment?.appointmentId || appointment?.appointment_id || appointment?.id,
    listing_id: appointment?.listingId || appointment?.listing_id || '',
    listing_type: 'appointment',
    listing_title: appointment?.listingLabel || appointment?.title || 'Appointment',
    buyer_lead_id: appointment?.leadId || appointment?.lead_id || appointment?.contactId || appointment?.contact_id || '',
    buyer_name: clientParticipant?.name || clientParticipant?.email || appointment?.title || 'Participant',
    agent_id: appointment?.assignedAgentId || appointment?.agent_id || '',
    created_by: appointment?.createdBy || appointment?.created_by || '',
    created_by_role: 'agent',
    proposed_date: proposedDate,
    proposed_time: proposedTime,
    alternative_times: [],
    location: appointment?.location || '',
    notes: appointment?.notes || '',
    status: mapAppointmentStatusToViewingStatus(appointment?.status),
    participants: participants.map(mapAppointmentParticipantToViewingParticipant),
    feedback: appointment?.clientFeedback || appointment?.agentNotes || appointment?.outcomeSummary
      ? {
          interest_level: '',
          feedback_notes: appointment?.clientFeedback || appointment?.agentNotes || '',
          next_action: appointment?.nextStep || '',
          created_at: appointment?.updatedAt || appointment?.updated_at || appointment?.createdAt || appointment?.created_at || null,
        }
      : null,
    created_at: appointment?.createdAt || appointment?.created_at || dateTime || '',
    updated_at: appointment?.updatedAt || appointment?.updated_at || dateTime || '',
    source: 'appointments',
  }
}

function mergeAppointmentAndLocalViewings(appointmentRows = [], localRows = []) {
  const seen = new Set()
  const merged = []
  for (const row of [...appointmentRows, ...localRows]) {
    const key = String(row?.appointment_id || row?.viewing_id || '').trim()
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    merged.push(row)
  }
  return merged.sort((left, right) => new Date(right?.updated_at || right?.created_at || 0) - new Date(left?.updated_at || left?.created_at || 0))
}

function normalizeMediaItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.url || item?.signedUrl || item?.publicUrl)
    .map((item, index) => ({
      id: String(item.id || item.path || `media-${index + 1}`),
      name: String(item.name || item.fileName || `Image ${index + 1}`),
      url: String(item.url || item.signedUrl || item.publicUrl || ''),
      path: item.path || '',
      bucket: item.bucket || '',
      signedUrl: item.signedUrl || '',
      publicUrl: item.publicUrl || '',
      contentType: item.contentType || '',
      size: Number(item.size || 0) || 0,
      label: item.label || '',
    }))
}

function isExternalLinkSellerVisible(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized === 'live' || normalized === 'published'
}

function normalizeExternalUrl(value = '') {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url
  if (url.startsWith('www.') || url.includes('.')) return `https://${url}`
  return url
}

function normalizeExternalListingLinks(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.url || item?.platform)
    .map((item, index) => {
      const status = String(item.status || 'Draft').trim() || 'Draft'
      return {
        id: String(item.id || item.key || `external-link-${index + 1}`),
        platform: String(item.platform || item.platformName || 'Other').trim() || 'Other',
        url: normalizeExternalUrl(item.url || item.listingUrl || item.listing_url || ''),
        status,
        publishedAt: String(item.publishedAt || item.published_at || '').trim(),
        lastCheckedAt: String(item.lastCheckedAt || item.last_checked_at || '').trim(),
        notes: String(item.notes || '').trim(),
        visibleToSeller: item.visibleToSeller === undefined ? isExternalLinkSellerVisible(status) : Boolean(item.visibleToSeller),
      }
    })
}

function createExternalLinkDraft() {
  return {
    platform: 'Property24',
    url: '',
    status: 'Live',
    publishedAt: '',
    lastCheckedAt: '',
    notes: '',
  }
}

function buildListingSnapshotFormData(draft = {}) {
  return {
    propertyAddress: String(draft.addressLine1 || '').trim(),
    formattedAddress: String(draft.formattedAddress || '').trim(),
    streetAddress: String(draft.streetAddress || draft.addressLine1 || '').trim(),
    suburb: String(draft.suburb || '').trim(),
    city: String(draft.city || '').trim(),
    province: String(draft.province || '').trim(),
    country: String(draft.country || 'South Africa').trim(),
    postalCode: String(draft.postalCode || '').trim(),
    latitude: draft.latitude ?? null,
    longitude: draft.longitude ?? null,
    googlePlaceId: String(draft.googlePlaceId || '').trim(),
    propertyType: draft.propertyType,
    listingType: draft.listingType,
    bedrooms: draft.bedrooms,
    bathrooms: draft.bathrooms,
    garages: draft.garages,
    parkingBays: draft.parkingBays,
    parkingCovered: draft.coveredParking,
    parkingOpen: draft.openParking,
    erfSize: draft.erfSize,
    floorSize: draft.floorSize,
    askingPrice: draft.price,
    levies: draft.leviesNotApplicable ? '' : draft.levies,
    leviesNotApplicable: Boolean(draft.leviesNotApplicable),
    ratesTaxes: draft.ratesTaxesNotApplicable ? '' : draft.ratesTaxes,
    ratesTaxesNotApplicable: Boolean(draft.ratesTaxesNotApplicable),
    saleType: String(draft.saleType || '').trim(),
    vatApplicable: String(draft.vatApplicable || '').trim(),
    offersFrom: draft.offersFrom,
    features: Array.isArray(draft.selectedFeatures) ? draft.selectedFeatures : [],
    keySellingPoints: Array.isArray(draft.selectedFeatures) ? draft.selectedFeatures : [],
    amenities: Array.isArray(draft.amenities) ? draft.amenities : [],
    petFriendly: Boolean(draft.petFriendly),
    fibreReady: Boolean(draft.fibreReady),
    securityFeatures: String(draft.securityFeatures || '').trim(),
    propertyNotes: String(draft.description || '').trim(),
    propertyDescription: String(draft.description || '').trim(),
    listingDescription: String(draft.description || '').trim(),
    listingPreviewDescription: String(draft.listingPreviewDescription || draft.description || '').trim(),
    internalNotes: String(draft.notes || '').trim(),
    publicationStatus: String(draft.publicationStatus || 'Draft').trim(),
    imageGallery: normalizeMediaItems(draft.galleryImages),
    coverImageId: draft.coverImageId || '',
    floorplans: normalizeMediaItems(draft.floorplans),
    videoLink: String(draft.videoLink || '').trim(),
    virtualTourLink: String(draft.virtualTourLink || '').trim(),
    externalListingLinks: normalizeExternalListingLinks(draft.externalLinks),
    mandateSignedDate: draft.mandateSignedDate || '',
    listingDate: draft.listingDate || '',
    expiryDate: draft.expiryDate || '',
    property24ListingUrl: String(draft.property24ListingUrl || '').trim(),
    property24Reference: String(draft.property24Reference || '').trim(),
    property24Status: String(draft.property24Status || 'not_published').trim(),
    privatePropertyListingUrl: String(draft.privatePropertyListingUrl || '').trim(),
    privatePropertyReference: String(draft.privatePropertyReference || '').trim(),
    privatePropertyStatus: String(draft.privatePropertyStatus || 'not_published').trim(),
    bridgeListingStatus: String(draft.bridgeListingStatus || 'not_published').trim(),
    bridgeListingPublicUrl: String(draft.bridgeListingPublicUrl || '').trim(),
  }
}

function normalizePublicListingSlugPart(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

function buildArch9PublicListingSlug(draft = {}, listing = {}) {
  const listingSource = listing && typeof listing === 'object' ? listing : {}
  const base = [
    draft.headline || listingSource.listingTitle || listingSource.title,
    draft.suburb || listingSource.suburb,
    draft.province || listingSource.province,
  ]
    .map(normalizePublicListingSlugPart)
    .filter(Boolean)
    .join('-')

  const id = String(listingSource.id || '').trim()
  const suffix = id ? id.replace(/-/g, '').slice(0, 8).toLowerCase() : ''

  return [base || 'listing', suffix].filter(Boolean).join('-')
}

function buildArch9PublicListingUrl(draft = {}, listing = {}) {
  const slug = buildArch9PublicListingSlug(draft, listing)
  return slug ? `${ARCH9_PUBLIC_SITE_ORIGIN}/buy/${slug}` : ''
}

function getPublicListingSlugFromUrl(publicUrl = '') {
  const value = String(publicUrl || '').trim()
  if (!value) return ''
  try {
    const parsed = new URL(value, ARCH9_PUBLIC_SITE_ORIGIN)
    const parts = parsed.pathname.split('/').map((part) => part.trim()).filter(Boolean)
    const buyIndex = parts.indexOf('buy')
    return buyIndex >= 0 ? parts[buyIndex + 1] || '' : parts.at(-1) || ''
  } catch {
    const parts = value.split(/[/?#]/).map((part) => part.trim()).filter(Boolean)
    const buyIndex = parts.indexOf('buy')
    return buyIndex >= 0 ? parts[buyIndex + 1] || '' : parts.at(-1) || ''
  }
}

function getArch9PublicationBlockers(draft = {}, coverImage = null) {
  const blockers = []
  const listingStatus = normalizeKey(draft.listingStatus)
  if (!String(draft.headline || '').trim()) blockers.push('Add a listing title.')
  if (!Number(draft.price || 0)) blockers.push('Add an asking price.')
  if (!String(draft.description || '').trim()) blockers.push('Add a public-facing description.')
  if (!String(draft.suburb || draft.city || '').trim()) blockers.push('Add at least a suburb or city.')
  if (!coverImage?.url) blockers.push('Upload and select a cover image.')
  if (['sold', 'withdrawn', 'transaction_created'].includes(listingStatus)) {
    blockers.push('Only active market listings can be published.')
  }
  return blockers
}

function formatProperty24Blocker(value = '') {
  return String(value || '')
    .replace(/^missing_/, 'missing ')
    .replace(/^listing_/, 'listing ')
    .replace(/_/g, ' ')
    .replace(/\bproperty24\b/g, 'Property24')
}

function getProperty24ApiMessage(payload = {}, fallback = 'Property24 request failed.') {
  const missing = Array.isArray(payload?.missingConfiguration) ? payload.missingConfiguration : []
  if (missing.length) return `Property24 setup is incomplete: ${missing.join(', ')}.`
  const dataBlockers = payload?.preview?.dataBlockers || payload?.report?.preview?.dataBlockers || []
  const technicalBlockers = payload?.preview?.technicalBlockers || payload?.report?.preview?.technicalBlockers || []
  if (technicalBlockers.includes('sandbox_property24_agent_id_required_before_submit')) {
    return 'Property24 sandbox payload is ready to review, but real publishing needs a usable Property24 agent ID first.'
  }
  const blockers = [...dataBlockers, ...technicalBlockers].map(formatProperty24Blocker)
  if (blockers.length) return `Property24 cannot publish yet: ${blockers.join(', ')}.`
  return String(payload?.message || payload?.error || fallback)
}

function getProperty24ListingNumberFromResponse(payload = {}) {
  const values = [
    payload?.report?.databaseWrite?.listingNumber,
    payload?.report?.databaseWrite?.listing_number,
    payload?.report?.property24Response?.data?.listingNumber,
    payload?.report?.property24Response?.data?.ListingNumber,
    payload?.report?.property24Response?.data,
    payload?.report?.preview?.summary?.listingNumber,
    payload?.preview?.summary?.listingNumber,
  ]
  for (const value of values) {
    if (value && typeof value !== 'object') return String(value).trim()
  }
  return ''
}

function getProperty24ReadinessCounts(payload = {}) {
  const preview = payload?.preview || payload?.report?.preview || {}
  return {
    dataBlockers: Array.isArray(preview.dataBlockers) ? preview.dataBlockers.length : 0,
    technicalBlockers: Array.isArray(preview.technicalBlockers) ? preview.technicalBlockers.length : 0,
    imagesLoaded: Number(preview.imageByteLoad?.summary?.loaded || 0) || 0,
    imagesFailed: Number(preview.imageByteLoad?.summary?.failed || 0) || 0,
  }
}

function hasProperty24SandboxAgentIdBlocker(payload = {}) {
  const preview = payload?.preview || payload?.report?.preview || {}
  return Array.isArray(preview.technicalBlockers) &&
    preview.technicalBlockers.includes('sandbox_property24_agent_id_required_before_submit')
}

function getProperty24ReadinessIssues(payload = {}) {
  const preview = payload?.preview || payload?.report?.preview || {}
  const missingConfiguration = Array.isArray(payload?.missingConfiguration) ? payload.missingConfiguration : []
  const issues = [
    ...missingConfiguration.map((item) => `Setup: ${formatProperty24Blocker(item)}`),
    ...(Array.isArray(preview.dataBlockers) ? preview.dataBlockers.map(formatProperty24Blocker) : []),
    ...(Array.isArray(preview.technicalBlockers) ? preview.technicalBlockers.map(formatProperty24Blocker) : []),
  ]
  return [...new Set(issues.filter(Boolean))]
}

function getProperty24StatusLabel(statusResult = {}) {
  const portalCheck = statusResult?.status?.portalCheck
  if (portalCheck) return portalCheck.isOnPortal ? 'Live on Property24' : 'Not live on Property24'
  const syncStatus = statusResult?.status?.sync?.external_status || statusResult?.status?.listing?.property24_status || ''
  return syncStatus ? formatStatusLabel(syncStatus) : 'Not checked yet'
}

function getProperty24StatusCheckedAt(statusResult = {}) {
  return statusResult?.status?.sync?.last_checked_at ||
    statusResult?.status?.sync?.lastCheckedAt ||
    statusResult?.status?.listing?.updated_at ||
    ''
}

function getProperty24LeadImportCounts(payload = {}) {
  const leads = payload?.leads || payload || {}
  const summary = leads.summary || {}
  const importSummary = leads.import?.summary || {}
  return {
    received: Number(importSummary.receivedCount ?? summary.receivedCount ?? summary.count ?? 0) || 0,
    imported: Number(importSummary.importedCount ?? 0) || 0,
    alreadyImported: Number(importSummary.alreadyImportedCount ?? 0) || 0,
    needsReview: Number(importSummary.needsReviewCount ?? summary.needsReviewCount ?? 0) || 0,
    failed: Number(importSummary.failedCount ?? 0) || 0,
  }
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on request'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatMoneyValue(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatCompactNumber(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return '0'
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(number)
}

function formatPercentValue(value, digits = 1) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return '0%'
  return `${number.toFixed(digits)}%`
}

function formatSignedPercentValue(value, digits = 1) {
  const number = Number(value || 0)
  if (!Number.isFinite(number) || number === 0) return '0%'
  return `${number > 0 ? '+' : ''}${number.toFixed(digits)}%`
}

function formatOverviewTimestamp(value) {
  if (!value) return 'Date pending'
  const parsed = new Date(typeof value === 'string' ? value.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T') : value)
  if (Number.isNaN(parsed.getTime())) return 'Date pending'
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime()
  const time = parsed.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
  if (day === today) return `Today ${time}`
  if (day === today - 24 * 60 * 60 * 1000) return `Yesterday ${time}`
  if (day === today + 24 * 60 * 60 * 1000) return `Tomorrow ${time}`
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: parsed.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

function toCleanText(value) {
  return String(value || '').trim()
}

function isValidEmail(value) {
  const text = toCleanText(value)
  if (!text) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
}

function getListingSellerFormData(listing = {}) {
  const mergeObjects = (...sources) => sources.reduce((accumulator, source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return accumulator
    return {
      ...accumulator,
      ...source,
    }
  }, {})

  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || {}
  const canonicalFacts = listing?.sellerCanonicalFacts || listing?.seller_canonical_facts_json || {}
  const sellerFacts = canonicalFacts?.seller && typeof canonicalFacts.seller === 'object' ? canonicalFacts.seller : {}
  const propertyFacts = canonicalFacts?.property && typeof canonicalFacts.property === 'object' ? canonicalFacts.property : {}

  return mergeObjects(
    sellerFacts,
    propertyFacts,
    canonicalFacts,
    onboarding.formData,
    onboarding.form_data,
    listing?.sellerOnboardingFormData,
    listing?.seller_onboarding_form_data,
  )
}

function isRemoteListingMissingError(error) {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || error || '').toLowerCase()
  return code === 'PGRST116' ||
    message.includes('private listing not found') ||
    message.includes('no rows') ||
    message.includes('0 rows')
}

function normalizeListingPerformanceOverrides(source = {}) {
  if (!source || typeof source !== 'object') return {}
  return Object.entries(source).reduce((accumulator, [key, value]) => {
    if (!LISTING_PERFORMANCE_OVERRIDE_KEYS.has(key)) return accumulator
    if (value === '' || value === null || value === undefined) return accumulator
    const number = Number(value)
    if (!Number.isFinite(number)) return accumulator
    accumulator[key] = Math.max(0, Math.round(number))
    return accumulator
  }, {})
}

function getListingPerformanceOverrides(listing = {}) {
  const formData = getListingSellerFormData(listing)
  return normalizeListingPerformanceOverrides(
    formData.listingPerformanceOverrides ||
      formData.listingPerformance ||
      listing?.listingPerformanceOverrides ||
      listing?.listingPerformance ||
      {},
  )
}

function applyListingPerformanceOverrides(basePerformance = {}, overrides = {}) {
  const normalizedOverrides = normalizeListingPerformanceOverrides(overrides)
  return {
    ...basePerformance,
    ...normalizedOverrides,
    hasOverrides: Object.keys(normalizedOverrides).length > 0,
    overrides: normalizedOverrides,
  }
}

function getSellerDocumentSourceLabel(row = {}) {
  if (row?.source?.document === 'document_packets.final_signed_artifact') return 'Signed mandate packet'
  if (row?.original?.document?.source === 'seller_onboarding.property_disclosure.generated_document') return 'Seller onboarding generated document'
  if (row?.source?.document === 'private_listing_documents' || row?.hasUpload) return 'Seller portal / linked document'
  if (row?.source?.requirement === 'private_listing_document_requirements') return 'Requirement checklist'
  return 'Generated seller requirement'
}

function mapSellerDocumentSourceRowForListing(row = {}) {
  const upload = row?.upload || {}
  const linkedDocument = row?.linkedDocument && typeof row.linkedDocument === 'object'
    ? row.linkedDocument
    : row?.linked_document && typeof row.linked_document === 'object'
      ? row.linked_document
      : {}
  const originalDocument = {
    ...(row?.original?.document && typeof row.original.document === 'object' ? row.original.document : {}),
    ...linkedDocument,
  }
  const url = normalizeText(
    upload.url ||
      row.url ||
      row.documentUrl ||
      originalDocument.url ||
      originalDocument.fileUrl ||
      originalDocument.file_url ||
      originalDocument.signedUrl ||
      originalDocument.signed_url ||
      originalDocument.finalSignedFileUrl ||
      originalDocument.final_signed_file_url ||
      originalDocument.finalSignedDownloadUrl ||
      originalDocument.final_signed_file_access_url,
  )
  const filePath = normalizeText(
    upload.filePath ||
      row.filePath ||
      originalDocument.storagePath ||
      originalDocument.storage_path ||
      originalDocument.filePath ||
      originalDocument.file_path ||
      originalDocument.finalSignedFilePath ||
      originalDocument.final_signed_file_path,
  )
  const generatedHtml = normalizeText(upload.generatedHtml || row.generatedHtml || row.generated_html || originalDocument.generatedHtml || originalDocument.generated_html)
  const generatedFileName = normalizeText(upload.generatedFileName || row.generatedFileName || row.generated_file_name || originalDocument.generatedFileName || originalDocument.generated_file_name)
  const uploadedOn = normalizeText(upload.uploadedAt || row.uploadedAt || originalDocument.uploadedAt || originalDocument.uploaded_at || originalDocument.createdAt || originalDocument.created_at)
  const packetId = normalizeText(row.packetId || row.packet_id || originalDocument.packetId || originalDocument.packet_id)
  const packetVersionId = normalizeText(row.packetVersionId || row.packet_version_id || row.versionId || row.version_id || originalDocument.packetVersionId || originalDocument.packet_version_id || originalDocument.versionId || originalDocument.version_id)
  const pendingTransactionPromotion = Boolean(row.pendingTransactionPromotion || row.pending_transaction_promotion || originalDocument.pendingTransactionPromotion || originalDocument.pending_transaction_promotion)
  const promotedTransactionId = normalizeText(row.promotedTransactionId || row.promoted_transaction_id || originalDocument.promotedTransactionId || originalDocument.promoted_transaction_id)
  const promotedDocumentId = normalizeText(row.promotedDocumentId || row.promoted_document_id || originalDocument.promotedDocumentId || originalDocument.promoted_document_id)
  const promotionStatus = normalizeText(row.promotionStatus || row.promotion_status || originalDocument.promotionStatus || originalDocument.promotion_status)
  const promotionError = normalizeText(row.promotionError || row.promotion_error || originalDocument.promotionError || originalDocument.promotion_error)
  const promotionAttemptedAt = normalizeText(row.promotionAttemptedAt || row.promotion_attempted_at || originalDocument.promotionAttemptedAt || originalDocument.promotion_attempted_at)
  const hasUpload = Boolean(row.hasUpload || url || filePath || generatedHtml || uploadedOn)
  const key = normalizeText(row.key || row.id || row.title || row.label)
  const rowStatus = normalizeKey(row.status)
  const resolvedStatus = hasUpload && (!rowStatus || ['required', 'requested'].includes(rowStatus))
    ? generatedHtml || row?.source?.document === 'document_packets.final_signed_artifact' || originalDocument?.source === 'document_packets.final_signed_artifact'
      ? 'completed'
      : 'uploaded'
    : row.status || (hasUpload ? 'uploaded' : 'required')
  return {
    ...row,
    key,
    label: row.label || row.title || 'Seller document',
    required: row.required !== false,
    uploaded: hasUpload,
    status: resolvedStatus,
    statusLabel: rowStatus !== normalizeKey(resolvedStatus) ? formatStatusLabel(resolvedStatus) : row.statusLabel || formatStatusLabel(resolvedStatus),
    uploadedOn,
    fileName: upload.fileName || row.uploadedFileName || row.fileName || originalDocument.fileName || originalDocument.file_name || originalDocument.document_name || generatedFileName || '',
    filePath,
    url,
    packetId,
    packetVersionId,
    generatedHtml,
    generatedFileName,
    pendingTransactionPromotion,
    pending_transaction_promotion: pendingTransactionPromotion,
    promotedTransactionId,
    promoted_transaction_id: promotedTransactionId,
    promotedDocumentId,
    promoted_document_id: promotedDocumentId,
    promotionStatus,
    promotion_status: promotionStatus,
    promotionError,
    promotion_error: promotionError,
    promotionAttemptedAt,
    promotion_attempted_at: promotionAttemptedAt,
    sourceLabel: getSellerDocumentSourceLabel(row),
  }
}

function documentMatchesSellerPackTransactionKey(document = {}, targetKey = '') {
  const aliases = SELLER_PACK_TRANSACTION_REQUIREMENT_ALIASES[targetKey] || [targetKey]
  const signals = [
    document.key,
    document.id,
    document.requirementKey,
    document.requirement_key,
    document.documentType,
    document.document_type,
    document.category,
    document.label,
    document.title,
    document.fileName,
    document.documentName,
    document.document_name,
    document.linkedDocument?.document_type,
    document.linkedDocument?.document_name,
    document.linkedDocument?.category,
  ].map(normalizeKey).filter(Boolean)
  return aliases.map(normalizeKey).some((alias) =>
    signals.some((signal) => signal === alias || signal.includes(alias) || alias.includes(signal)),
  )
}

function getOfferIdentitySignals(offer = {}) {
  return [
    offer.id,
    offer.offerId,
    offer.offer_id,
    offer.canonicalOfferId,
    offer.canonical_offer_id,
    offer.buyerLeadId,
    offer.buyer_lead_id,
    offer.buyerContactId,
    offer.buyer_contact_id,
  ].map(normalizeKey).filter(Boolean)
}

function documentMatchesKingstonsBuyerOtpOffer(document = {}, offer = {}) {
  const documentType = normalizeKey(document?.document_type || document?.documentType)
  const category = normalizeKey(document?.category)
  const requirementKey = normalizeKey(document?.requirementKey || document?.requirement_key)
  const otpRequirementAliases = [
    KINGSTONS_BUYER_OTP_REQUIREMENT.key,
    ...KINGSTONS_BUYER_OTP_REQUIREMENT.aliases,
  ].map(normalizeKey)
  const isSignedOtpDocument = otpRequirementAliases.some((alias) =>
    [documentType, category, requirementKey].some((signal) => signal && (signal === alias || signal.includes(alias) || alias.includes(signal))),
  )
  if (!isSignedOtpDocument) return false

  const offerSignals = getOfferIdentitySignals(offer)
  if (!offerSignals.length) return true

  const documentSignals = [
    document?.offerId,
    document?.offer_id,
    document?.canonicalOfferId,
    document?.canonical_offer_id,
    document?.buyerLeadId,
    document?.buyer_lead_id,
    document?.buyerContactId,
    document?.buyer_contact_id,
    document?.document_name,
    document?.documentName,
    document?.name,
    document?.fileName,
    document?.file_name,
    document?.storage_path,
    document?.file_url,
  ].map(normalizeKey).filter(Boolean)

  return offerSignals.some((offerSignal) =>
    documentSignals.some((documentSignal) => documentSignal === offerSignal || documentSignal.includes(offerSignal)),
  )
}

function getSellerPackTransactionHandoffPresentation(document = null) {
  if (!document) {
    return {
      status: 'missing',
      label: 'Missing',
      description: 'Upload the signed document before creating or repairing handoff.',
      classes: 'border-[#f3d9b0] bg-[#fff9ee] text-[#8f5c18]',
    }
  }
  const promotionStatus = normalizeKey(document.promotionStatus || document.promotion_status || document.handoff?.status)
  const promotionError = normalizeText(document.promotionError || document.promotion_error || document.handoff?.error)
  const promotedDocumentId = normalizeText(document.promotedDocumentId || document.promoted_document_id)
  const pendingPromotion = Boolean(document.pendingTransactionPromotion || document.pending_transaction_promotion)
  if (promotionError || ['blocked', 'failed', 'error'].includes(promotionStatus)) {
    return {
      status: 'attention',
      label: 'Needs attention',
      description: promotionError || 'Promotion to transaction documents failed.',
      classes: 'border-[#f0c8c4] bg-[#fff7f6] text-[#963d35]',
    }
  }
  if (promotedDocumentId || ['ready', 'promoted', 'completed', 'complete', 'synced'].includes(promotionStatus)) {
    return {
      status: 'promoted',
      label: 'Promoted',
      description: 'Available in the transaction document stream.',
      classes: 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]',
    }
  }
  if (pendingPromotion || ['pending', 'pending_transaction', 'queued', 'waiting'].includes(promotionStatus)) {
    return {
      status: 'queued',
      label: 'Queued',
      description: 'Ready to promote when the transaction continuity repair runs.',
      classes: 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]',
    }
  }
  if (document.uploaded) {
    return {
      status: 'uploaded',
      label: 'Uploaded',
      description: 'Uploaded on the listing, but not queued for transaction handoff yet.',
      classes: 'border-[#f3d9b0] bg-[#fff9ee] text-[#8f5c18]',
    }
  }
  return {
    status: 'missing',
    label: 'Missing',
    description: 'Upload the signed document before creating or repairing handoff.',
    classes: 'border-[#f3d9b0] bg-[#fff9ee] text-[#8f5c18]',
  }
}

const LISTING_DOCUMENT_GROUP_CONFIG = [
  {
    key: 'property',
    label: 'Property Documents',
    description: 'Title deed, rates, compliance certificates, and property records.',
    icon: Building2,
    toneClasses: 'bg-[#eef5fb] text-[#1f4f78] border-[#d7e6f5]',
  },
  {
    key: 'fica',
    label: 'FICA Documents',
    description: 'Seller identity, address, marital, company, trust, and authority checks.',
    icon: ShieldCheck,
    toneClasses: 'bg-[#ecfaf1] text-[#1f7d44] border-[#d8eddf]',
  },
  {
    key: 'sales',
    label: 'Sales Documents',
    description: 'Mandates, OTPs, seller instructions, and sale-related paperwork.',
    icon: HandCoins,
    toneClasses: 'bg-[#fff8ea] text-[#8a5b16] border-[#f2dfbf]',
  },
  {
    key: 'requests',
    label: 'Additional Requests',
    description: 'Ad hoc requests and any requirement that does not fit the standard packs.',
    icon: FileText,
    toneClasses: 'bg-[#f8fbfd] text-[#607387] border-[#dbe6f2]',
  },
]

function getListingDocumentGroupingKey(document = {}) {
  const category = normalizeKey(document?.category)
  const group = normalizeKey(document?.group)
  const source = [
    document?.key,
    document?.label,
    document?.description,
    document?.category,
    document?.group,
    document?.sourceLabel,
    document?.fileName,
  ].map((value) => String(value || '').toLowerCase()).join(' ')

  if (
    category === 'sales' ||
    group === 'mandate' ||
    /mandate|otp|offer to purchase|sale agreement|sale instruction|seller instruction|commission|property condition disclosure|condition disclosure|disclosure|defects/.test(source)
  ) {
    return 'sales'
  }

  if (
    category === 'fica' ||
    ['seller_identity', 'fica', 'marital', 'company', 'trust', 'deceased_estate', 'power_of_attorney'].includes(group) ||
    /fica|identity|id document|passport|proof of residential address|proof of address|marriage|anc|spouse|company registration|cipc|director|authority|resolution|trust deed|trustee|letter of authority/.test(source)
  ) {
    return 'fica'
  }

  if (
    category === 'property' ||
    ['property', 'compliance', 'property_compliance', 'financial', 'occupancy'].includes(group) ||
    /title deed|rates|levy|levies|body corporate|hoa|homeowners|gas|solar|electrical|electric|beetle|plumbing|compliance|certificate|coc|building plan|approved plan|occupancy|occupation|erf|sectional title/.test(source)
  ) {
    return 'property'
  }

  return 'requests'
}

function groupListingDocumentsForDisplay(documents = []) {
  const grouped = LISTING_DOCUMENT_GROUP_CONFIG.map((config) => ({ ...config, documents: [] }))
  const groupByKey = new Map(grouped.map((group) => [group.key, group]))
  documents.forEach((document) => {
    const key = getListingDocumentGroupingKey(document)
    const group = groupByKey.get(key) || groupByKey.get('requests')
    group.documents.push(document)
  })
  return grouped
}

function isListingDocumentComplete(document = {}) {
  return Boolean(
    document?.uploaded ||
      document?.hasUpload ||
      document?.url ||
      document?.filePath ||
      ['complete', 'completed', 'approved', 'verified', 'signed', 'uploaded'].includes(normalizeKey(document?.status)),
  )
}

function getSellerDocumentSlaPresentation(reviewSla = null) {
  const state = String(reviewSla?.slaState || '').trim().toLowerCase()
  if (!reviewSla || state === 'resolved') return null
  if (state === 'critical' || state === 'unassigned') {
    return {
      label: state === 'unassigned' ? 'Review owner missing' : 'Review critically overdue',
      classes: 'border-[#f0c8c4] bg-[#fff7f6] text-[#963d35]',
    }
  }
  if (state === 'breached') return { label: 'Review SLA breached', classes: 'border-[#f0c8c4] bg-[#fff7f6] text-[#963d35]' }
  if (state === 'due_soon') return { label: 'Review due within 24 hours', classes: 'border-[#f3d9b0] bg-[#fff9ee] text-[#8f5c18]' }
  return { label: 'Review within SLA', classes: 'border-[#d6e4f5] bg-[#f4f9ff] text-[#315b7d]' }
}

function resolveSellerEmailFromListing(listing = {}) {
  const formData = getListingSellerFormData(listing)
  const canonicalFacts = listing?.sellerCanonicalFacts || listing?.seller_canonical_facts_json || {}
  return toCleanText(
    formData.sellerEmail ||
      formData.email ||
      formData.contactEmail ||
      canonicalFacts.email ||
      canonicalFacts.sellerEmail ||
      listing?.sellerEmail ||
      listing?.seller_email ||
      listing?.seller?.email,
  ).toLowerCase()
}

function resolveSellerPhoneFromListing(listing = {}) {
  const formData = getListingSellerFormData(listing)
  const canonicalFacts = listing?.sellerCanonicalFacts || listing?.seller_canonical_facts_json || {}
  return toCleanText(
    formData.sellerPhone ||
      formData.phone ||
      formData.contactNumber ||
      formData.mobile ||
      canonicalFacts.phone ||
      canonicalFacts.sellerPhone ||
      canonicalFacts.mobile ||
      listing?.sellerPhone ||
      listing?.seller_phone ||
      listing?.seller?.phone,
  )
}

function resolveSellerNameFromListing(listing = {}) {
  const formData = getListingSellerFormData(listing)
  const canonicalFacts = listing?.sellerCanonicalFacts || listing?.seller_canonical_facts_json || {}
  return toCleanText(
    [formData.sellerFirstName || formData.firstName, formData.sellerSurname || formData.lastName].filter(Boolean).join(' ') ||
      formData.sellerName ||
      formData.fullName ||
      canonicalFacts.fullName ||
      canonicalFacts.sellerName ||
      canonicalFacts.name ||
      [canonicalFacts.firstName, canonicalFacts.lastName].filter(Boolean).join(' ') ||
      listing?.sellerName ||
      listing?.seller_name ||
      listing?.seller?.name,
  )
}

function resolveSellerLeadIdFromListing(listing = {}) {
  return toCleanText(
    listing?.sellerLeadId ||
      listing?.seller_lead_id ||
      listing?.leadId ||
      listing?.lead_id ||
      listing?.seller?.leadId ||
      listing?.seller?.lead_id ||
      listing?.sellerLead?.leadId ||
      listing?.sellerLead?.lead_id,
  )
}

function describeSellerReviewPreparation(preparation = {}) {
  const blockers = Array.isArray(preparation?.blockers) ? preparation.blockers : []
  const warnings = Array.isArray(preparation?.warnings) ? preparation.warnings : []
  return {
    blockers,
    warnings,
    blockerText: blockers.join(' '),
    warningText: warnings.join(' '),
  }
}

function extractSellerPortalTokenFromLink(link = '') {
  const text = toCleanText(link)
  if (!text) return ''
  const path = (() => {
    try {
      return new URL(text, typeof window !== 'undefined' ? window.location.origin : 'https://app.arch9.co.za').pathname
    } catch {
      return text
    }
  })()
  const clientMatch = path.match(/\/client\/([^/]+)/i)
  if (clientMatch?.[1]) return decodeURIComponent(clientMatch[1])
  const onboardingMatch = path.match(/\/seller\/onboarding\/([^/]+)/i)
  if (onboardingMatch?.[1]) return decodeURIComponent(onboardingMatch[1])
  return ''
}

function resolveSellerPortalTokenFromListing(listing = {}) {
  let token = toCleanText(
    listing?.sellerOnboarding?.sellerPortalToken ||
      listing?.sellerOnboarding?.seller_portal_token ||
      listing?.sellerPortalToken ||
      listing?.seller_portal_token ||
      listing?.sellerOnboarding?.token ||
      listing?.sellerOnboardingToken ||
      listing?.seller_onboarding_token,
  )
  token = token || extractSellerPortalTokenFromLink(listing?.sellerOnboarding?.clientPortalLink)
  token = token || extractSellerPortalTokenFromLink(listing?.sellerOnboarding?.link)
  return token
}

function CompactActionButton({ active = false, disabled = false, className = '', children, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${
        active
          ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_8px_14px_rgba(31,79,120,0.18)]'
          : 'border-[#dbe6f2] bg-white text-[#2f4862] hover:border-[#b7c8db] hover:bg-[#f7fbff]'
      } disabled:cursor-not-allowed disabled:border-[#dbe6f2] disabled:bg-[#f5f8fb] disabled:text-[#9aa9ba] ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

const SHOW_DAY_OUTCOME_OPTIONS = [
  'Interested',
  'Wants to offer',
  'Needs finance',
  'Wants second viewing',
  'Still deciding',
  'Not interested',
]

function toLocalDateInput(date = new Date()) {
  const parsed = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDaysToDateInput(value = '', days = 1) {
  const base = value ? new Date(`${value}T00:00:00`) : new Date()
  if (Number.isNaN(base.getTime())) return toLocalDateInput(new Date())
  base.setDate(base.getDate() + days)
  return toLocalDateInput(base)
}

function createShowDayCaptureForm() {
  const showDayDate = toLocalDateInput(new Date())
  return {
    mode: 'single',
    name: '',
    phone: '',
    email: '',
    showDayDate,
    showDayTime: '',
    outcome: SHOW_DAY_OUTCOME_OPTIONS[0],
    buyerFeedback: '',
    notes: '',
    nextStep: DEFAULT_SHOW_DAY_NEXT_STEP,
    followUpDueDate: addDaysToDateInput(showDayDate, 1),
    bulkVisitorText: '',
  }
}

function ShowDayLeadCaptureModal({
  open,
  form,
  setForm,
  listingTitle = '',
  saving = false,
  feedback = { kind: '', message: '' },
  onClose,
  onSubmit,
}) {
  function updateField(key, value) {
    setForm((previous) => {
      const next = { ...previous, [key]: value }
      if (key === 'showDayDate' && !previous.followUpDueDate) {
        next.followUpDueDate = addDaysToDateInput(value, 1)
      }
      return next
    })
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Capture Show Day Lead"
      subtitle={listingTitle ? `Record a buyer who already viewed ${listingTitle}.` : 'Record a buyer who already viewed this property.'}
      className="max-w-4xl"
      footer={(
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="show-day-lead-capture-form" disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <UserRound size={15} />}
            Capture Lead
          </Button>
        </div>
      )}
    >
      <form id="show-day-lead-capture-form" className="grid gap-5" onSubmit={onSubmit}>
        {feedback?.message ? (
          <div className={`rounded-[14px] border px-3 py-2 text-sm font-medium ${
            feedback.kind === 'error'
              ? 'border-[#f4d4d4] bg-[#fff5f5] text-[#b42318]'
              : 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
          }`}>
            {feedback.message}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 rounded-[14px] border border-[#dce6f2] bg-[#f7fbff] p-1">
          {[
            ['single', 'Single Visitor'],
            ['bulk', 'Bulk Paste'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => updateField('mode', mode)}
              className={`min-h-10 rounded-[10px] px-3 text-sm font-semibold transition ${
                form.mode === mode
                  ? 'bg-white text-[#142132] shadow-[0_8px_16px_rgba(15,23,42,0.08)]'
                  : 'text-[#5f748a] hover:bg-white/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {form.mode === 'bulk' ? (
          <section className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Visitor List</span>
              <Field
                as="textarea"
                rows={8}
                value={form.bulkVisitorText}
                onChange={(event) => updateField('bulkVisitorText', event.target.value)}
                placeholder={'Name, Phone, Email, Outcome, Feedback\nSipho Visitor, 082 111 2222, sipho@example.com, Wants to offer, Liked the garden'}
                autoFocus
              />
            </label>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 md:col-span-3">
              <span className="text-sm font-semibold text-[#2d445e]">Buyer Name</span>
              <Field value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Buyer name" autoFocus />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Phone</span>
              <Field value={form.phone} onChange={(event) => updateField('phone', event.target.value)} placeholder="082 000 0000" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Email</span>
              <Field type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="buyer@example.com" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Outcome</span>
              <Field as="select" value={form.outcome} onChange={(event) => updateField('outcome', event.target.value)}>
                {SHOW_DAY_OUTCOME_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </Field>
            </label>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Show Day Date</span>
            <Field type="date" value={form.showDayDate} onChange={(event) => updateField('showDayDate', event.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Approx. Time</span>
            <Field type="time" value={form.showDayTime} onChange={(event) => updateField('showDayTime', event.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Follow-up Due</span>
            <Field type="date" value={form.followUpDueDate} onChange={(event) => updateField('followUpDueDate', event.target.value)} />
          </label>
        </section>

        {form.mode === 'bulk' ? (
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Shared Outcome</span>
            <Field as="select" value={form.outcome} onChange={(event) => updateField('outcome', event.target.value)}>
              {SHOW_DAY_OUTCOME_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </label>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          {form.mode === 'single' ? (
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Buyer Feedback</span>
              <Field as="textarea" rows={4} value={form.buyerFeedback} onChange={(event) => updateField('buyerFeedback', event.target.value)} placeholder="What did they like, hesitate on, or compare against?" />
            </label>
          ) : null}
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Internal Notes</span>
            <Field as="textarea" rows={4} value={form.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder="Anything the agent should know before following up." />
          </label>
          <label className={`grid gap-2 ${form.mode === 'single' ? 'md:col-span-2' : ''}`}>
            <span className="text-sm font-semibold text-[#2d445e]">Next Step</span>
            <Field as="textarea" rows={3} value={form.nextStep} onChange={(event) => updateField('nextStep', event.target.value)} />
          </label>
        </section>
      </form>
    </Modal>
  )
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-ZA')
}

function formatDateInputValue(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-ZA')
}

function formatRelativeTime(value) {
  if (!value) return 'Not synced yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not synced yet'
  const diffMs = Date.now() - parsed.getTime()
  if (diffMs < 0) return formatDateTime(value)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) {
    const minutes = Math.max(1, Math.round(diffMs / minute))
    return `${minutes} min ago`
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.round(diffMs / hour))
    return `${hours} hr${hours === 1 ? '' : 's'} ago`
  }
  return formatDate(value)
}

function formatStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Requested'
  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getSellerPortalRecoveryStatusLabel(accessState = null) {
  if (accessState?.linkActive === false) return 'Unavailable'
  const recovery = accessState?.recovery || {}
  const status = normalizeKey(recovery.status)
  if (status === 'active') return recovery.expiresAt ? `Active until ${formatDateTime(recovery.expiresAt)}` : 'Active'
  if (status === 'consumed') return recovery.consumedAt ? `Completed ${formatDateTime(recovery.consumedAt)}` : 'Completed'
  if (status === 'expired') return 'Expired'
  if (status === 'not_requested') return 'Not requested'
  if (recovery.lastRequestedAt) return `Requested ${formatDateTime(recovery.lastRequestedAt)}`
  return accessState?.passwordSet ? 'Available' : 'Not set'
}

const SELLER_ONBOARDING_EMAIL_COMMUNICATION_TYPES = new Set([
  'seller_onboarding_link',
  'seller_onboarding_link_seller',
  'seller_portal_link_seller',
  'seller_onboarding_submitted_agent',
])

function isSellerOnboardingEmailDelivery(row = {}) {
  const communicationType = normalizeKey(row.communicationType || row.communication_type || row.type || row.notificationType || row.notification_type)
  const channel = normalizeKey(row.channel || row.deliveryChannel || row.delivery_channel || row.mode || row.notificationMode || row.notification_mode)
  if (!SELLER_ONBOARDING_EMAIL_COMMUNICATION_TYPES.has(communicationType)) return false
  return !channel || channel === 'email'
}

function buildSellerOnboardingEmailDiagnostics(deliveries = []) {
  const rows = (Array.isArray(deliveries) ? deliveries : [])
    .filter(isSellerOnboardingEmailDelivery)
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt || left.created_at || left.sentAt || left.sent_at || 0).getTime()
      const rightTime = new Date(right.createdAt || right.created_at || right.sentAt || right.sent_at || 0).getTime()
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })
  const failedRows = rows.filter((row) => ['failed', 'error', 'bounced'].includes(normalizeKey(row.status || row.deliveryStatus || row.delivery_status)))
  const sentRows = rows.filter((row) => ['sent', 'delivered', 'queued'].includes(normalizeKey(row.status || row.deliveryStatus || row.delivery_status)))
  const latestFailure = failedRows[0] || null
  const latestFailureMessage = latestFailure
    ? String(latestFailure.errorMessage || latestFailure.error_message || latestFailure.providerError || latestFailure.provider_error || latestFailure.failureReason || latestFailure.failure_reason || 'Email delivery needs attention.').trim()
    : ''

  return {
    rows,
    totalCount: rows.length,
    sentCount: sentRows.length,
    failedCount: failedRows.length,
    pendingCount: Math.max(0, rows.length - sentRows.length - failedRows.length),
    latestFailureMessage,
  }
}

function statusClass(status) {
  const key = String(status || '').trim().toLowerCase()
  if (key === 'approved' || key === 'completed' || key === 'accepted' || key === 'delivered') return 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
  if (key === 'uploaded' || key === 'under_review' || key === 'agent_review' || key === 'sent_to_seller' || key === 'seller_viewed' || key === 'reviewed' || key === 'in_progress' || key === 'sent') {
    return 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
  }
  if (key === 'changes_requested' || key === 'countered') return 'border-[#f1dfb8] bg-[#fff8e8] text-[#8a641d]'
  if (key === 'rejected' || key === 'expired' || key === 'failed') return 'border-[#f6d7d7] bg-[#fff5f5] text-[#b42318]'
  if (key === 'submitted') return 'border-[#e6dcf7] bg-[#faf7ff] text-[#6d46a1]'
  return 'border-[#dbe4ef] bg-[#f8fbff] text-[#48627f]'
}

function getOnboardingStatusLabel(status) {
  const key = String(status || '').trim().toLowerCase()
  if (key === 'completed') return 'Completed'
  if (key === 'submitted') return 'Submitted'
  if (key === 'under_review') return 'Under Review'
  if (key === 'in_progress') return 'In Progress'
  return 'Not Started'
}

function getImageBlock(mediaUrl, title) {
  if (mediaUrl) {
    return <img src={mediaUrl} alt={title} className="h-full w-full object-cover" />
  }

  return (
    <div className="relative h-full w-full bg-[linear-gradient(130deg,#133654_0%,#1f4f78_52%,#a8c2dc_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.24),transparent_52%)]" />
    </div>
  )
}

function CompletionBadge({ complete = false, label = '' }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
      {complete ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
      {label || (complete ? 'Complete' : 'Missing info')}
    </span>
  )
}

function HubCard({ icon = Info, title, copy = '', complete = null, children, className = '' }) {
  const Icon = icon
  return (
    <section className={`rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-[#dce6f2] bg-[#f7fbff] text-[#1f4f78]">
            <Icon size={17} />
          </div>
          <div className="min-w-0">
            <h4 className="text-[1rem] font-semibold text-[#142132]">{title}</h4>
            {copy ? <p className="mt-1 text-sm leading-5 text-[#607387]">{copy}</p> : null}
          </div>
        </div>
        {complete === null ? null : <CompletionBadge complete={complete} />}
      </div>
      {children}
    </section>
  )
}

function SnapshotRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#e7edf5] py-2.5 last:border-b-0">
      <span className="text-xs font-semibold text-[#6b7d93]">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-semibold text-[#142132]">{value || '—'}</span>
    </div>
  )
}

function CompactSnapshotRow({ label, value }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] items-center gap-3 border-b border-[#edf2f7] py-2 last:border-b-0">
      <span className="min-w-0 text-[0.72rem] font-semibold leading-5 text-[#6b7d93]">{label}</span>
      <span className="min-w-0 break-words text-right text-[0.8rem] font-semibold leading-5 text-[#142132]">{value || '—'}</span>
    </div>
  )
}

function OverviewStatusRow({ label, value, status = '' }) {
  return (
    <div className="flex min-h-[34px] items-center justify-between gap-3 border-b border-[#edf2f7] py-1.5 last:border-b-0">
      <span className="text-xs font-semibold text-[#6b7d93]">{label}</span>
      {status ? <StatusPill status={status} label={value} /> : <span className="text-right text-xs font-semibold text-[#142132]">{value}</span>}
    </div>
  )
}

function StatusPill({ status = '', label = '' }) {
  const normalized = String(status || label || '').trim().toLowerCase()
  const done = ['done', 'complete', 'completed', 'uploaded', 'signed', 'published', 'active', 'activated', 'profile_complete', 'live', 'verified'].includes(normalized)
  const pending = ['pending', 'in_progress', 'in progress', 'under_review', 'sent', 'invitation_sent', 'invitation_pending', 'draft', 'requested'].includes(normalized)
  const className = done
    ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
    : pending
      ? 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
      : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${className}`}>
      {label || (done ? 'Done' : pending ? 'Pending' : 'Missing')}
    </span>
  )
}

function MarketingSummaryItem({ icon = Info, value, label, actionLabel = '', onAction, tone = 'default' }) {
  const Icon = icon
  const toneClass = tone === 'success'
    ? 'bg-[#ecfaf1] text-[#1f7d44]'
    : tone === 'attention'
      ? 'bg-[#fff8ec] text-[#9a5b13]'
      : 'bg-[#eef5fb] text-[#1f4f78]'
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 border-b border-[#e5edf6] px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${toneClass}`}>
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <p className="break-words text-xl font-semibold leading-6 text-[#142132]">{value}</p>
        <p className="mt-1 text-xs font-semibold text-[#2d445e]">{label}</p>
        {actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-1 text-xs font-semibold text-[#1f4f78] hover:text-[#143a5b]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function PlatformLogo({ src = '', icon = ExternalLink, label = '' }) {
  const Icon = icon
  if (src) {
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-[#dbe6f2] bg-white">
        <img src={src} alt={`${label} logo`} className="max-h-7 max-w-8 object-contain" />
      </span>
    )
  }

  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-[#dbe6f2] bg-white text-[#1f4f78]">
      <Icon size={18} />
    </span>
  )
}

function DistributionChannel({
  icon = ExternalLink,
  logoSrc = '',
  name,
  subtitle = '',
  reference = '',
  status = 'pending',
  statusLabel = '',
  contextTitle = '',
  contextDetail = '',
  lastSynced = '',
  primaryAction = null,
  secondaryAction = null,
  menuActions = [],
}) {
  const Icon = icon
  const statusKey = normalizeKey(status || statusLabel)
  const live = ['live', 'published', 'active', 'done', 'complete'].includes(statusKey)
  const syncing = ['syncing', 'updating', 'publishing', 'loading'].includes(statusKey)
  const attention = ['needs_attention', 'attention', 'warning', 'blocked', 'missing', 'failed', 'error'].includes(statusKey)
  const dotClass = live ? 'bg-[#1f9d64]' : attention ? 'bg-[#d99321]' : syncing ? 'bg-[#2f6fb3]' : 'border border-[#aebdca] bg-white'
  const statusTextClass = live
    ? 'text-[#18713e]'
    : attention
      ? 'text-[#9a5b13]'
      : syncing
        ? 'text-[#2f6fb3]'
        : 'text-[#526a82]'
  return (
    <div className="grid gap-4 border-b border-[#edf2f7] px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(230px,0.9fr)_minmax(150px,190px)_minmax(260px,1fr)_minmax(130px,170px)_auto] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <PlatformLogo src={logoSrc} icon={Icon} label={name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-5 text-[#142132]">{name}</p>
          {subtitle ? <p className="truncate text-xs leading-5 text-[#607387]">{subtitle}</p> : null}
          {reference ? (
            <span className="mt-1 inline-flex max-w-full rounded-full border border-[#dbe6f2] bg-[#f8fbfd] px-2 py-0.5 text-[0.68rem] font-semibold text-[#607387]">
              <span className="truncate">{reference}</span>
            </span>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 md:justify-self-start">
        <p className={`inline-flex items-center gap-2 text-sm font-semibold ${statusTextClass}`}>
          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
          {statusLabel || formatStatusLabel(status)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-5 text-[#243d56]">{contextTitle || 'Ready to publish'}</p>
        {contextDetail ? <p className="mt-0.5 truncate text-xs leading-5 text-[#607387]">{contextDetail}</p> : null}
      </div>
      <div className="min-w-0">
        {lastSynced ? (
          <>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">Last synced</p>
            <p className="mt-0.5 text-xs font-semibold text-[#607387]">{lastSynced}</p>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {primaryAction}
        {secondaryAction}
        {menuActions.length ? (
          <details className="relative">
            <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-lg border border-[#dbe6f2] bg-white text-[#35546c] transition hover:border-[#b7c8db] hover:bg-[#f7fbff] [&::-webkit-details-marker]:hidden">
              <MoreVertical size={15} />
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-[16px] border border-[#dbe6f2] bg-white p-1.5 shadow-[0_18px_34px_rgba(15,23,42,0.14)]">
              {menuActions.map((action) => action)}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  )
}

function InfoTile({ icon = Info, label, value, status = '' }) {
  const Icon = icon
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] px-3.5 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#eef5fb] text-[#1f4f78]">
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#243d56]" title={String(value || '—')}>{value || '—'}</p>
      </div>
      {status ? <StatusPill status={status} /> : null}
    </div>
  )
}

function FieldDisplay({ label, value }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-[#e5edf6] bg-[#fbfdff] px-3.5 py-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#243d56]">{value || 'Not captured'}</p>
    </div>
  )
}

function SellerProfilePeopleEditor({ title, rows = [], roleTitle = 'Person', onAdd, onUpdate, onRemove }) {
  return (
    <div className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4 sm:col-span-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-[#142132]">{title}</h4>
          <p className="mt-1 text-xs text-[#607387]">{rows.length ? `${rows.length} captured` : `Add ${roleTitle.toLowerCase()} details when available.`}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onAdd}>
          <Plus size={14} />
          Add
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length ? rows.map((row, index) => (
          <div key={row.id || `${roleTitle}-${index}`} className="rounded-[16px] border border-[#dce6f2] bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839a]">{roleTitle} {index + 1}</p>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#e3c7c2] bg-[#fff7f6] text-[#a83b32] transition hover:bg-[#ffefed]"
                aria-label={`Remove ${roleTitle.toLowerCase()} ${index + 1}`}
                title={`Remove ${roleTitle.toLowerCase()}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Name
                <Field value={row.name || ''} onChange={(event) => onUpdate(index, 'name', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Surname
                <Field value={row.surname || ''} onChange={(event) => onUpdate(index, 'surname', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Email
                <Field type="email" value={row.email || ''} onChange={(event) => onUpdate(index, 'email', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                ID / Passport
                <Field value={row.idNumber || ''} onChange={(event) => onUpdate(index, 'idNumber', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Capacity
                <Field value={row.capacity || row.roleCapacity || ''} onChange={(event) => onUpdate(index, 'capacity', event.target.value)} placeholder={roleTitle} />
              </label>
              <label className="inline-flex min-h-[42px] items-center gap-2 self-end rounded-[12px] border border-[#dbe6f2] bg-[#fbfdff] px-3 text-sm font-semibold text-[#2d445e]">
                <input
                  type="checkbox"
                  checked={Boolean(row.signingAuthority)}
                  onChange={(event) => onUpdate(index, 'signingAuthority', event.target.checked)}
                />
                Signing authority
              </label>
            </div>
          </div>
        )) : (
          <div className="rounded-[14px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#607387]">
            No {title.toLowerCase()} captured yet.
          </div>
        )}
      </div>
    </div>
  )
}

function formatLongDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function humanizeProfileToken(value = '') {
  const text = String(value || '').trim()
  if (!text) return ''
  const normalized = text.toLowerCase().replace(/\s+/g, '_')
  const labels = {
    yes: 'Yes',
    no: 'No',
    true: 'Yes',
    false: 'No',
    individual: 'Individual',
    company: 'Company',
    trust: 'Trust',
    deceased_estate: 'Deceased Estate',
    sole: 'Sole Mandate',
    open: 'Open Mandate',
    exclusive: 'Exclusive Mandate',
    not_married: 'Not married',
    married_cop: 'Married in community of property',
    married_anc: 'Married out of community of property',
    married_anc_accrual: 'Married out of community of property with accrual',
    divorced: 'Divorced',
    widowed: 'Widowed',
    one_to_three_months: '1-3 months',
    '1_3_months': '1-3 months',
    three_to_six_months: '3-6 months',
    '3_6_months': '3-6 months',
    six_plus_months: '6+ months',
    complete: 'Complete',
    completed: 'Complete',
    incomplete: 'Incomplete',
    pending: 'Pending',
    uploaded: 'Uploaded',
    approved: 'Approved',
    missing: 'Missing',
  }
  if (labels[normalized]) return labels[normalized]
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return formatLongDate(text)
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function summarizeProfileCollection(value) {
  if (!Array.isArray(value)) return ''
  const readable = value
    .map((item) => {
      if (item === null || item === undefined || item === '') return ''
      if (typeof item !== 'object') return humanizeProfileToken(item)
      return toCleanText(
        item.name ||
          item.fullName ||
          [item.firstName, item.lastName].filter(Boolean).join(' ') ||
          item.label ||
          item.title ||
          item.value,
      )
    })
    .filter(Boolean)
  if (readable.length) return readable.join(', ')
  return value.length ? `${value.length} item${value.length === 1 ? '' : 's'} captured` : ''
}

function formatSellerProfileValue(value, type = 'text') {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return summarizeProfileCollection(value) || '—'
  if (typeof value === 'object') {
    const readable = toCleanText(
      value.name ||
        value.fullName ||
        [value.firstName, value.lastName].filter(Boolean).join(' ') ||
        value.label ||
        value.title ||
        value.value,
    )
    return readable || 'Details captured'
  }
  const text = String(value || '').trim()
  if (!text) return '—'
  if (/^https?:\/\//i.test(text) || text.includes('supabase.co') || text.includes('/storage/v1/')) return '—'
  if (type === 'currency') return formatMoneyValue(text)
  if (type === 'date') return formatLongDate(text)
  if (type === 'percentage') {
    const amount = Number(text)
    return Number.isFinite(amount) ? `${amount}%` : humanizeProfileToken(text)
  }
  return humanizeProfileToken(text)
}

function presentSellerWorkspaceValue(value, fallback = 'Not provided') {
  const text = String(value ?? '').trim()
  if (!text || text === '—' || text.toLowerCase() === 'n/a' || text.toLowerCase() === 'not captured') return fallback
  return value
}

function isSellerProfileFilled(value) {
  const formatted = formatSellerProfileValue(value)
  return Boolean(formatted && formatted !== '—' && formatted !== 'Details captured')
}

function getInitials(value = '') {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'S'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function sanitizeFileName(value = '') {
  return String(value || 'seller-profile')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'seller-profile'
}

function escapePdfText(value = '') {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function wrapPdfText(value = '', maxChars = 86) {
  const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    if (!current) {
      current = word
    } else if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function buildSellerProfilePdf({ agencyName = 'Arch9', generatedDate = '', summary = [], sections = [] }) {
  const pageWidth = 595
  const margin = 42
  const contentWidth = pageWidth - margin * 2
  const footerY = 40
  const labelColumnWidth = 172
  const valueColumnWidth = contentWidth - labelColumnWidth
  const generatedLabel = generatedDate || formatLongDate(new Date())
  const colors = {
    navy: '0.071 0.224 0.333',
    blue: '0.184 0.439 0.643',
    green: '0.161 0.541 0.392',
    ink: '0.078 0.129 0.196',
    muted: '0.373 0.447 0.533',
    line: '0.847 0.902 0.953',
    pale: '0.969 0.984 1',
    white: '1 1 1',
  }
  const pages = []
  let y = 0

  const pdfNumber = (value) => Number(Number(value).toFixed(2)).toString()
  const currentPage = () => pages[pages.length - 1]
  const push = (command) => currentPage().push(command)
  const charsForWidth = (width, size = 10) => Math.max(12, Math.floor(width / (size * 0.52)))
  const cleanCellValue = (value) => String(value || '').trim() || '-'
  const upperLabel = (value) => cleanCellValue(value).toUpperCase()
  const truncatePdfText = (value, maxLength = 22) => {
    const text = cleanCellValue(value)
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
  }

  const textCommand = (text, x, baseline, { size = 10, bold = false, color = colors.ink } = {}) => (
    `${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${pdfNumber(x)} ${pdfNumber(baseline)} Tm (${escapePdfText(text)}) Tj ET`
  )
  const rectCommand = (x, rectY, width, height, { fill = '', stroke = '', lineWidth = 0.8 } = {}) => {
    const paint = fill && stroke ? 'B' : fill ? 'f' : 'S'
    return [
      'q',
      `${pdfNumber(lineWidth)} w`,
      fill ? `${fill} rg` : '',
      stroke ? `${stroke} RG` : '',
      `${pdfNumber(x)} ${pdfNumber(rectY)} ${pdfNumber(width)} ${pdfNumber(height)} re ${paint}`,
      'Q',
    ].filter(Boolean).join(' ')
  }
  const lineCommand = (x1, y1, x2, y2, { stroke = colors.line, lineWidth = 0.8 } = {}) => (
    `q ${pdfNumber(lineWidth)} w ${stroke} RG ${pdfNumber(x1)} ${pdfNumber(y1)} m ${pdfNumber(x2)} ${pdfNumber(y2)} l S Q`
  )
  const drawText = (text, x, baseline, options = {}) => push(textCommand(text, x, baseline, options))
  const drawRect = (x, rectY, width, height, options = {}) => push(rectCommand(x, rectY, width, height, options))
  const drawWrappedText = (value, x, baseline, { maxChars, size = 10, bold = false, color = colors.ink, leading = 12 } = {}) => {
    const lines = wrapPdfText(cleanCellValue(value), maxChars)
    lines.forEach((line, index) => drawText(line, x, baseline - index * leading, { size, bold, color }))
    return lines.length * leading
  }

  const drawDocumentHeader = () => {
    drawRect(0, 760, pageWidth, 82, { fill: colors.navy, stroke: colors.navy, lineWidth: 0 })
    drawText(truncatePdfText(agencyName, 34), margin, 815, { size: 10, bold: true, color: colors.white })
    drawText('SELLER MANDATE WORKSPACE', margin, 738, { size: 8, bold: true, color: colors.blue })
    drawText('Seller Profile', margin, 778, { size: 24, bold: true, color: colors.white })
    drawText(`Generated ${generatedLabel}`, pageWidth - margin - 142, 808, { size: 9, color: colors.white })
    drawRect(pageWidth - margin - 142, 774, 142, 22, { fill: colors.green, stroke: colors.green, lineWidth: 0 })
    drawText('Seller onboarding record', pageWidth - margin - 130, 781, { size: 9, bold: true, color: colors.white })
  }

  const startPage = () => {
    pages.push([])
    drawDocumentHeader()
    y = 724
  }

  const ensureSpace = (height) => {
    if (y - height < 58) startPage()
  }

  const addGap = (amount = 14) => {
    y -= amount
    ensureSpace(1)
  }

  const drawSectionBand = (title) => {
    ensureSpace(36)
    drawRect(margin, y - 30, contentWidth, 30, { fill: colors.pale, stroke: colors.line })
    drawText(cleanCellValue(title), margin + 12, y - 20, { size: 12, bold: true, color: colors.ink })
    y -= 30
  }

  const drawTableHeaderRow = () => {
    drawRect(margin, y - 24, labelColumnWidth, 24, { fill: colors.navy, stroke: colors.navy })
    drawRect(margin + labelColumnWidth, y - 24, valueColumnWidth, 24, { fill: colors.navy, stroke: colors.navy })
    drawText('FIELD', margin + 12, y - 16, { size: 7, bold: true, color: colors.white })
    drawText('DETAILS', margin + labelColumnWidth + 12, y - 16, { size: 7, bold: true, color: colors.white })
    y -= 24
  }

  const drawTableTitle = (title, { continued = false } = {}) => {
    drawSectionBand(`${cleanCellValue(title)}${continued ? ' continued' : ''}`)
    drawTableHeaderRow()
  }

  const drawSummaryGrid = (rows = []) => {
    drawSectionBand('Profile Summary')
    const colGap = 10
    const colWidth = (contentWidth - colGap) / 2
    for (let index = 0; index < rows.length; index += 2) {
      const rowItems = rows.slice(index, index + 2)
      const heights = rowItems.map((row) => {
        const valueLines = wrapPdfText(cleanCellValue(row?.value), charsForWidth(colWidth - 24, 10))
        return Math.max(48, 28 + valueLines.length * 13)
      })
      const rowHeight = Math.max(...heights, 48)
      ensureSpace(rowHeight + 8)
      rowItems.forEach((row, colIndex) => {
        const x = margin + colIndex * (colWidth + colGap)
        drawRect(x, y - rowHeight, colWidth, rowHeight, { fill: colors.white, stroke: colors.line })
        drawText(upperLabel(row?.label), x + 12, y - 18, { size: 7, bold: true, color: colors.muted })
        drawWrappedText(row?.value, x + 12, y - 36, {
          maxChars: charsForWidth(colWidth - 24, 10),
          size: 10,
          bold: true,
          color: colors.ink,
          leading: 13,
        })
      })
      y -= rowHeight + 8
    }
    addGap(8)
  }

  const drawTableRow = (row, sectionTitle) => {
    const label = upperLabel(row?.label)
    const value = cleanCellValue(row?.value)
    const labelLines = wrapPdfText(label, charsForWidth(labelColumnWidth - 22, 7))
    const valueLines = wrapPdfText(value, charsForWidth(valueColumnWidth - 24, 10))
    const rowHeight = Math.max(34, 16 + Math.max(labelLines.length * 10, valueLines.length * 12))
    if (y - rowHeight < 58) {
      startPage()
      drawTableTitle(sectionTitle, { continued: true })
    }
    drawRect(margin, y - rowHeight, labelColumnWidth, rowHeight, { fill: colors.pale, stroke: colors.line })
    drawRect(margin + labelColumnWidth, y - rowHeight, valueColumnWidth, rowHeight, { fill: colors.white, stroke: colors.line })
    labelLines.forEach((line, index) => drawText(line, margin + 12, y - 17 - index * 10, {
      size: 7,
      bold: true,
      color: colors.muted,
    }))
    valueLines.forEach((line, index) => drawText(line, margin + labelColumnWidth + 12, y - 17 - index * 12, {
      size: 10,
      bold: false,
      color: colors.ink,
    }))
    y -= rowHeight
  }

  const drawTableSection = (section) => {
    const title = cleanCellValue(section?.title)
    const rows = Array.isArray(section?.rows) ? section.rows : []
    ensureSpace(74)
    drawTableTitle(title)
    if (!rows.length) {
      drawTableRow({ label: 'Status', value: 'No details captured' }, title)
    } else {
      rows.forEach((row) => drawTableRow(row, title))
    }
    addGap(14)
  }

  startPage()
  drawSummaryGrid(summary)
  sections.forEach((section) => drawTableSection(section))

  pages.forEach((pageCommands, index) => {
    pageCommands.push(lineCommand(margin, footerY, pageWidth - margin, footerY, { stroke: colors.line }))
    pageCommands.push(textCommand(cleanCellValue(agencyName), margin, 24, { size: 8, color: colors.muted }))
    pageCommands.push(textCommand(`Page ${index + 1} of ${pages.length}`, pageWidth - margin - 64, 24, { size: 8, color: colors.muted }))
  })

  const objects = []
  objects[0] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  objects[2] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  objects[3] = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n'
  const pageIds = []
  pages.forEach((pageLines, index) => {
    const pageId = 5 + index * 2
    const contentId = pageId + 1
    pageIds.push(`${pageId} 0 R`)
    const stream = pageLines.join('\n')
    objects[pageId - 1] = `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    objects[contentId - 1] = `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
  })
  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageIds.join(' ')}] /Count ${pageIds.length} >>\nendobj\n`

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object) => {
    offsets.push(pdf.length)
    pdf += object
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new Blob([pdf], { type: 'application/pdf' })
}

function downloadBlob(blob, filename) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
}

function toPdfFileName(value = '', fallback = 'seller-document.pdf') {
  const raw = String(value || fallback || 'seller-document.pdf').trim() || 'seller-document.pdf'
  return raw.replace(/\.(html?|pdf)$/i, '') + '.pdf'
}

async function downloadGeneratedSellerDocumentPdf(markup = '', fileName = 'seller-document.pdf') {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PDF downloads are only available in the browser.')
  }

  let pdfStage = null
  let styleElement = null
  try {
    const { default: html2pdf } = await import('html2pdf.js/src/index.js')
    const pdfDocument = new window.DOMParser().parseFromString(markup, 'text/html')
    const style = pdfDocument.head.querySelector('style')
    styleElement = document.createElement('style')
    styleElement.setAttribute('data-generated-seller-document-pdf-style', 'true')
    styleElement.textContent = style?.textContent || ''
    pdfStage = document.createElement('div')
    pdfStage.setAttribute('data-generated-seller-document-pdf-stage', 'true')
    pdfStage.style.position = 'fixed'
    pdfStage.style.left = '-10000px'
    pdfStage.style.top = '0'
    pdfStage.style.width = '210mm'
    pdfStage.style.background = '#ffffff'
    pdfStage.style.pointerEvents = 'none'
    pdfStage.innerHTML = pdfDocument.body.innerHTML
    document.head.appendChild(styleElement)
    document.body.appendChild(pdfStage)

    const imageLoads = Array.from(pdfStage.querySelectorAll('img')).map((image) => {
      if (image.complete) return Promise.resolve()
      return new Promise((resolve) => {
        image.onload = resolve
        image.onerror = resolve
      })
    })
    await Promise.all(imageLoads)
    await new Promise((resolve) => window.requestAnimationFrame(resolve))

    await html2pdf()
      .set({
        margin: 0,
        filename: toPdfFileName(fileName),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: 794,
          windowHeight: 1123,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(pdfStage)
      .save()
  } finally {
    pdfStage?.remove()
    styleElement?.remove()
  }
}

function readPipelineLeads() {
  if (typeof window === 'undefined') return []
  if (!isUnsafeFallbackAllowed()) return []
  try {
    const raw = window.localStorage.getItem(PIPELINE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeListingStatus(listing) {
  const raw = String(listing?.status || '').trim().toLowerCase()
  if (raw.includes('offer')) return 'under_offer'
  if (raw.includes('sold')) return 'sold'
  if (raw.includes('withdraw')) return 'withdrawn'
  return raw || 'active'
}

function getDaysOnMarket(createdAt) {
  if (!createdAt) return 0
  const delta = Date.now() - new Date(createdAt).getTime()
  if (!Number.isFinite(delta) || delta < 0) return 0
  return Math.max(0, Math.floor(delta / (1000 * 60 * 60 * 24)))
}

function getListingMarketStartDate(listing = {}, draft = {}) {
  return firstDraftValue(
    draft?.listingDate,
    listing?.listingDate,
    listing?.publishedAt,
    listing?.published_at,
    listing?.firstPublishedAt,
    listing?.first_published_at,
    listing?.marketedAt,
    listing?.marketed_at,
    listing?.listedAt,
    listing?.listed_at,
    listing?.mandateStartDate,
    listing?.createdAt,
  )
}

function getOfferAverage(offers = []) {
  const prices = offers.map((offer) => Number(offer?.offerPrice || 0)).filter((value) => Number.isFinite(value) && value > 0)
  if (!prices.length) return 0
  return prices.reduce((sum, value) => sum + value, 0) / prices.length
}

function getLeadStage(lead) {
  return String(lead?.journeyStage || lead?.status || '').trim().toLowerCase()
}

function getLeadRecordId(lead = {}) {
  return String(lead?.leadId || lead?.lead_id || lead?.id || '').trim()
}

function getLeadContactId(lead = {}) {
  return String(lead?.contactId || lead?.contact_id || '').trim()
}

function getLeadCreatedAt(lead = {}) {
  return firstDraftValue(lead?.createdAt, lead?.created_at, lead?.leadCreatedAt, lead?.lead_created_at)
}

function getLeadContactedAt(lead = {}) {
  return firstDraftValue(
    lead?.lastContactedAt,
    lead?.last_contacted_at,
    lead?.contactedAt,
    lead?.contacted_at,
    lead?.lastCommunicationAt,
    lead?.last_communication_at,
    lead?.lastOutboundAt,
    lead?.last_outbound_at,
  )
}

function getLeadContactedBy(lead = {}) {
  return firstDraftValue(
    lead?.lastContactedByName,
    lead?.last_contacted_by_name,
    lead?.lastContactedBy,
    lead?.last_contacted_by,
    lead?.assignedAgentName,
    lead?.assignedAgentEmail,
    lead?.assigned_agent_name,
    lead?.assigned_agent_email,
  )
}

function normalizeLeadSourceLabel(value = '') {
  const key = normalizeKey(value || 'manual')
  if (key.includes('property24') || key === 'p24') return 'Property24'
  if (key.includes('private_property') || key.includes('privateproperty')) return 'Private Property'
  if (key.includes('arch9') || key.includes('agency_website')) return 'Arch9'
  if (key.includes('website') || key.includes('web')) return 'Website'
  if (key.includes('whatsapp')) return 'WhatsApp'
  if (key.includes('facebook')) return 'Facebook'
  if (key.includes('instagram')) return 'Instagram'
  if (key.includes('referral')) return 'Referral'
  if (key.includes('show_day')) return 'Show Day'
  if (key.includes('manual') || key.includes('direct')) return 'Manual'
  return formatStatusLabel(value || 'Manual')
}

function getListingLeadStatusGroup(value = '') {
  const key = normalizeKey(value)
  if (key.includes('convert') || key.includes('transaction') || key.includes('sold')) return 'converted'
  if (key.includes('lost') || key.includes('not_interested') || key.includes('dismiss') || key.includes('archive')) return 'lost'
  if (key.includes('offer') || key.includes('negotiat')) return 'offer'
  if (key.includes('view')) return 'viewing'
  if (key.includes('contact') || key.includes('sent') || key.includes('shortlist')) return 'contacted'
  return 'new'
}

function formatListingLeadStatusLabel(value = '') {
  const key = normalizeKey(value)
  if (!key) return 'New Lead'
  if (key === 'viewing_scheduled' || key === 'viewing_requested') return key === 'viewing_scheduled' ? 'Viewing Scheduled' : 'Viewing Requested'
  if (key === 'offer_submitted') return 'Offer Submitted'
  if (key === 'not_interested') return 'Not Interested'
  return formatStatusLabel(value)
}

function getNextBestAction({ pendingOffers, missingDocuments, onboardingStatus, sellerProfileCompletion = 100 }) {
  if (pendingOffers > 0) {
    return {
      key: 'review_offers',
      title: `${pendingOffers} offer${pendingOffers === 1 ? '' : 's'} pending review`,
      copy: 'Review, compare, and decide whether to accept, reject, or counter before momentum drops.',
      buttonLabel: 'Review Offers',
    }
  }
  if (sellerProfileCompletion < 60) {
    return {
      key: 'complete_seller_facts',
      title: 'Seller profile needs completion',
      copy: 'Capture the seller model and contact facts before generating mandate packs or activating the portal for an existing listing.',
      buttonLabel: 'Complete Seller Profile',
    }
  }
  if (missingDocuments > 0) {
    return {
      key: 'open_documents',
      title: `${missingDocuments} seller document${missingDocuments === 1 ? '' : 's'} still missing`,
      copy: 'Push FICA and property compliance completion so the listing can move cleanly into offer-to-deal progression.',
      buttonLabel: 'Open Documents',
    }
  }
  if (onboardingStatus !== 'Completed') {
    return {
      key: 'open_pipeline',
      title: 'Seller onboarding still in progress',
      copy: 'Use the onboarding link and mandate review workflow to close outstanding seller steps.',
      buttonLabel: 'Open Pipeline',
    }
  }
  return {
    key: 'open_pipeline',
    title: 'Listing is in a healthy operating state',
    copy: 'Focus on buyer follow-up, keeping viewings moving, and converting interest into signed offers.',
    buttonLabel: 'Open Pipeline',
  }
}

function MetricCard({ label, value, meta }) {
  return (
    <article className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</p>
      <p className="mt-2 text-[1.25rem] font-semibold text-[#142132]">{value}</p>
      {meta ? <p className="mt-1 text-sm text-[#6b7d93]">{meta}</p> : null}
    </article>
  )
}

function FollowUpActionCard({ action, loading = false, onAction, onUpload }) {
  const Icon = action.icon || CircleAlert
  const ButtonIcon = action.buttonIcon || ExternalLink
  const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 py-2 text-sm font-semibold text-[#1f4f78] transition hover:border-[#b7c8db] hover:bg-[#f7fbff] disabled:cursor-not-allowed disabled:bg-[#f5f8fb] disabled:text-[#9aa9b8]'
  return (
    <article className="flex h-full min-h-[172px] flex-col justify-between rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#eef5fb] text-[#1f4f78]">
            <Icon size={16} />
          </span>
          <StatusPill status={action.complete ? 'done' : action.status || 'pending'} label={action.complete ? 'Done' : action.statusLabel || 'Needs action'} />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-[#142132]">{action.title}</h3>
        <p className="mt-2 text-sm leading-5 text-[#607387]">{action.copy}</p>
        {action.priorityLabel || action.dueLabel ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
            {action.priorityLabel ? <span>{action.priorityLabel}</span> : null}
            {action.dueLabel ? <span>{action.dueLabel}</span> : null}
          </div>
        ) : null}
      </div>
      {action.upload ? (
        <label className={`${buttonClass} mt-4 cursor-pointer ${loading ? 'pointer-events-none opacity-65' : ''}`}>
          <Upload size={15} />
          {loading ? 'Uploading...' : action.buttonLabel}
          <input
            type="file"
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            disabled={loading}
            onChange={onUpload}
          />
        </label>
      ) : (
        <button
          type="button"
          className={`${buttonClass} mt-4`}
          onClick={() => onAction(action)}
          disabled={loading || action.disabled}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ButtonIcon size={15} />}
          {loading ? action.loadingLabel || 'Working...' : action.buttonLabel}
        </button>
      )}
    </article>
  )
}

function buildDonutStyle(segments, fallback = '#dbe6f2') {
  const safeSegments = Array.isArray(segments) ? segments.filter((segment) => Number(segment?.value || 0) > 0) : []
  const total = safeSegments.reduce((sum, segment) => sum + Number(segment.value || 0), 0)
  if (!total) {
    return { background: `conic-gradient(${fallback} 0deg 360deg)` }
  }

  let current = 0
  const stops = safeSegments.map((segment) => {
    const angle = (Number(segment.value || 0) / total) * 360
    const start = current
    const end = current + angle
    current = end
    return `${segment.color} ${start}deg ${end}deg`
  })

  return { background: `conic-gradient(${stops.join(', ')})` }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read file'))
    reader.readAsDataURL(file)
  })
}

function buildPropertyDraft(listingRecord) {
  const propertyDetails = listingRecord?.propertyDetails || {}
  const marketing = listingRecord?.marketing || {}
  const onboardingFormData =
    listingRecord?.sellerOnboarding?.formData && typeof listingRecord.sellerOnboarding.formData === 'object'
      ? listingRecord.sellerOnboarding.formData
      : {}
  const storedGallery = Array.isArray(marketing?.imageGallery) ? marketing.imageGallery : []
  const onboardingGallery = Array.isArray(onboardingFormData.imageGallery) ? onboardingFormData.imageGallery : []
  const fallbackGallery = marketing?.mediaUrl
    ? [
        {
          id: 'cover-image',
          name: 'Cover image',
          url: String(marketing.mediaUrl).trim(),
        },
      ]
    : []
  const galleryImages = normalizeMediaItems(storedGallery.length ? storedGallery : onboardingGallery.length ? onboardingGallery : fallbackGallery)
  const coverImageId =
    String(marketing?.coverImageId || propertyDetails?.coverImageId || onboardingFormData.coverImageId || '').trim() ||
    String(galleryImages[0]?.id || '').trim()

  const rawListingStatus = String(propertyDetails?.listingStatus || listingRecord?.status || 'active').trim().toLowerCase()
  const normalizedListingStatus = rawListingStatus === 'listing_active' ? 'active' : rawListingStatus

  const selectedFeatures = normalizeListingFeatureSelections(
    propertyDetails?.selectedFeatures,
    propertyDetails?.features,
    listingRecord?.keySellingPoints,
    listingRecord?.features,
    listingRecord?.listingPublicationData?.features,
    listingRecord?.publicationData?.features,
    onboardingFormData.keySellingPoints,
    onboardingFormData.features,
    marketing?.selectedFeatures,
    marketing?.features,
  )
  const amenities = Array.isArray(propertyDetails?.amenities)
    ? propertyDetails.amenities
    : Array.isArray(onboardingFormData.amenities)
      ? onboardingFormData.amenities
      : []
  const externalLinks = normalizeExternalListingLinks(
    propertyDetails?.externalLinks ||
      marketing?.externalLinks ||
      listingRecord?.externalLinks ||
      listingRecord?.listingExternalLinks ||
      onboardingFormData.externalListingLinks ||
      [],
  )
  const parkingBays = firstDraftValue(
    propertyDetails?.parkingBays,
    onboardingFormData.parkingBays,
    Number(onboardingFormData.parkingCovered || 0) + Number(onboardingFormData.parkingOpen || 0) || '',
  )

  return {
    listingCode: String(listingRecord?.listingCode || '').trim(),
    headline: String(firstDraftValue(propertyDetails?.headline, listingRecord?.listingTitle, onboardingFormData.propertyAddress)).trim(),
    propertyType: String(firstDraftValue(propertyDetails?.propertyType, listingRecord?.propertyType, onboardingFormData.propertyType, 'House')).trim(),
    listingType: String(firstDraftValue(propertyDetails?.listingType, onboardingFormData.listingType, onboardingFormData.saleType, 'Sale')).trim(),
    publicationStatus: String(firstDraftValue(propertyDetails?.publicationStatus, onboardingFormData.publicationStatus, listingRecord?.publicationData?.status, 'Draft')).trim(),
    listingStatus: normalizedListingStatus,
    source: String(firstDraftValue(marketing?.source, propertyDetails?.source, listingRecord?.listingSource, onboardingFormData.listingSource, 'seller_onboarding')).trim(),
    addressLine1: String(firstDraftValue(propertyDetails?.addressLine1, listingRecord?.addressLine1, onboardingFormData.propertyAddress, onboardingFormData.residentialAddress)).trim(),
    formattedAddress: String(firstDraftValue(propertyDetails?.formattedAddress, listingRecord?.formattedAddress, listingRecord?.formatted_address, onboardingFormData.formattedAddress)).trim(),
    streetAddress: String(firstDraftValue(propertyDetails?.streetAddress, listingRecord?.streetAddress, listingRecord?.street_address, onboardingFormData.streetAddress, propertyDetails?.addressLine1, listingRecord?.addressLine1, onboardingFormData.propertyAddress)).trim(),
    suburb: String(firstDraftValue(propertyDetails?.suburb, listingRecord?.suburb, onboardingFormData.suburb)).trim(),
    city: String(firstDraftValue(propertyDetails?.city, listingRecord?.city, onboardingFormData.city)).trim(),
    province: String(firstDraftValue(propertyDetails?.province, listingRecord?.province, onboardingFormData.province)).trim(),
    country: String(firstDraftValue(propertyDetails?.country, listingRecord?.country, onboardingFormData.country, 'South Africa')).trim(),
    postalCode: String(firstDraftValue(propertyDetails?.postalCode, listingRecord?.postalCode, listingRecord?.postal_code, onboardingFormData.postalCode)).trim(),
    latitude: firstDraftValue(propertyDetails?.latitude, listingRecord?.latitude, onboardingFormData.latitude) ?? null,
    longitude: firstDraftValue(propertyDetails?.longitude, listingRecord?.longitude, onboardingFormData.longitude) ?? null,
    googlePlaceId: String(firstDraftValue(propertyDetails?.googlePlaceId, listingRecord?.googlePlaceId, listingRecord?.google_place_id, onboardingFormData.googlePlaceId)).trim(),
    bedrooms: String(firstDraftValue(propertyDetails?.bedrooms, onboardingFormData.bedrooms)).trim(),
    bathrooms: String(firstDraftValue(propertyDetails?.bathrooms, onboardingFormData.bathrooms)).trim(),
    garages: String(firstDraftValue(propertyDetails?.garages, onboardingFormData.garages)).trim(),
    parkingBays: String(parkingBays).trim(),
    coveredParking: String(firstDraftValue(propertyDetails?.coveredParking, onboardingFormData.parkingCovered, onboardingFormData.coveredParking)).trim(),
    openParking: String(firstDraftValue(propertyDetails?.openParking, onboardingFormData.parkingOpen, onboardingFormData.openParking)).trim(),
    erfSize: String(firstDraftValue(propertyDetails?.erfSize, onboardingFormData.erfSize)).trim(),
    floorSize: String(firstDraftValue(propertyDetails?.floorSize, onboardingFormData.floorSize)).trim(),
    price: String(firstDraftValue(propertyDetails?.price, listingRecord?.askingPrice, onboardingFormData.askingPrice)).trim(),
    levies: String(firstDraftValue(propertyDetails?.levies, onboardingFormData.levies)).trim(),
    leviesNotApplicable: Boolean(propertyDetails?.leviesNotApplicable),
    ratesTaxes: String(firstDraftValue(propertyDetails?.ratesTaxes, onboardingFormData.ratesTaxes)).trim(),
    ratesTaxesNotApplicable: Boolean(propertyDetails?.ratesTaxesNotApplicable),
    saleType: String(firstDraftValue(propertyDetails?.saleType, onboardingFormData.saleType, 'For Sale')).trim(),
    vatApplicable: String(firstDraftValue(propertyDetails?.vatApplicable, onboardingFormData.vatApplicable, 'no')).trim(),
    offersFrom: String(firstDraftValue(propertyDetails?.offersFrom, onboardingFormData.offersFrom)).trim(),
    selectedFeatures,
    amenities,
    petFriendly: Boolean(firstDraftValue(propertyDetails?.petFriendly, onboardingFormData.petFriendly, selectedFeatures.includes('Pet Friendly'))),
    fibreReady: Boolean(firstDraftValue(propertyDetails?.fibreReady, onboardingFormData.fibreReady, selectedFeatures.includes('Fibre'))),
    securityFeatures: String(firstDraftValue(propertyDetails?.securityFeatures, onboardingFormData.securityFeatures)).trim(),
    description: String(firstDraftValue(
      propertyDetails?.description,
      marketing?.description,
      listingRecord?.listingDescription,
      listingRecord?.description,
      listingRecord?.listingPublicationData?.description,
      listingRecord?.publicationData?.description,
      onboardingFormData.listingDescription,
      onboardingFormData.propertyDescription,
      onboardingFormData.propertyNotes,
      onboardingFormData.description,
    )).trim(),
    listingPreviewDescription: String(firstDraftValue(
      propertyDetails?.listingPreviewDescription,
      listingRecord?.listingPreviewDescription,
      onboardingFormData.listingPreviewDescription,
    )).trim(),
    notes: String(firstDraftValue(propertyDetails?.notes, marketing?.notes, onboardingFormData.sellingReason, onboardingFormData.sellingTimeline)).trim(),
    galleryImages,
    coverImageId,
    floorplans: Array.isArray(propertyDetails?.floorplans)
      ? propertyDetails.floorplans
      : Array.isArray(onboardingFormData.floorplans)
        ? onboardingFormData.floorplans
      : Array.isArray(marketing?.floorplans)
        ? marketing.floorplans
        : [],
    mandateSignedDate: String(firstDraftValue(propertyDetails?.mandateSignedDate, onboardingFormData.mandateSignedDate)).trim(),
    listingDate: String(firstDraftValue(propertyDetails?.listingDate, onboardingFormData.listingDate)).trim(),
    expiryDate: String(firstDraftValue(propertyDetails?.expiryDate, onboardingFormData.expiryDate)).trim(),
    property24ListingUrl: String(firstDraftValue(propertyDetails?.property24ListingUrl, listingRecord?.property24ListingUrl, onboardingFormData.property24ListingUrl)).trim(),
    property24Reference: String(firstDraftValue(propertyDetails?.property24Reference, listingRecord?.property24Reference, onboardingFormData.property24Reference)).trim(),
    property24Status: String(firstDraftValue(propertyDetails?.property24Status, listingRecord?.property24Status, onboardingFormData.property24Status, 'not_published')).trim(),
    privatePropertyListingUrl: String(firstDraftValue(propertyDetails?.privatePropertyListingUrl, listingRecord?.privatePropertyListingUrl, onboardingFormData.privatePropertyListingUrl)).trim(),
    privatePropertyReference: String(firstDraftValue(propertyDetails?.privatePropertyReference, listingRecord?.privatePropertyReference, onboardingFormData.privatePropertyReference)).trim(),
    privatePropertyStatus: String(firstDraftValue(propertyDetails?.privatePropertyStatus, listingRecord?.privatePropertyStatus, onboardingFormData.privatePropertyStatus, 'not_published')).trim(),
    bridgeListingStatus: String(firstDraftValue(propertyDetails?.bridgeListingStatus, listingRecord?.bridgeListingStatus, onboardingFormData.bridgeListingStatus, 'not_published')).trim(),
    bridgeListingPublicUrl: String(firstDraftValue(propertyDetails?.bridgeListingPublicUrl, listingRecord?.bridgeListingPublicUrl, onboardingFormData.bridgeListingPublicUrl)).trim(),
    videoLink: String(firstDraftValue(propertyDetails?.videoLink, onboardingFormData.videoLink, marketing?.videoLink)).trim(),
    virtualTourLink: String(firstDraftValue(propertyDetails?.virtualTourLink, onboardingFormData.virtualTourLink, marketing?.virtualTourLink)).trim(),
    externalLinks,
  }
}

function getListingMarketingDraftStorageKey(listingId) {
  const normalizedId = String(listingId || '').trim()
  return normalizedId ? `${LISTING_MARKETING_DRAFT_STORAGE_KEY}:${normalizedId}` : ''
}

function buildLightweightMarketingDraft(draft = {}) {
  const safeDraft = draft && typeof draft === 'object' ? draft : {}
  return {
    headline: String(safeDraft.headline || '').trim(),
    description: String(safeDraft.description || '').trim(),
    listingPreviewDescription: String(safeDraft.listingPreviewDescription || '').trim(),
    selectedFeatures: Array.isArray(safeDraft.selectedFeatures) ? safeDraft.selectedFeatures.map(String).filter(Boolean) : [],
    amenities: Array.isArray(safeDraft.amenities) ? safeDraft.amenities.map(String).filter(Boolean) : [],
    videoLink: String(safeDraft.videoLink || '').trim(),
    virtualTourLink: String(safeDraft.virtualTourLink || '').trim(),
    property24ListingUrl: String(safeDraft.property24ListingUrl || '').trim(),
    property24Reference: String(safeDraft.property24Reference || '').trim(),
    property24Status: String(safeDraft.property24Status || '').trim(),
    privatePropertyListingUrl: String(safeDraft.privatePropertyListingUrl || '').trim(),
    privatePropertyReference: String(safeDraft.privatePropertyReference || '').trim(),
    privatePropertyStatus: String(safeDraft.privatePropertyStatus || '').trim(),
    bridgeListingStatus: String(safeDraft.bridgeListingStatus || '').trim(),
    bridgeListingPublicUrl: String(safeDraft.bridgeListingPublicUrl || '').trim(),
    externalLinks: normalizeExternalListingLinks(safeDraft.externalLinks),
    savedAt: new Date().toISOString(),
  }
}

function hasMeaningfulMarketingDraft(draft = {}) {
  if (!draft || typeof draft !== 'object') return false
  return Boolean(
    String(draft.description || '').trim() ||
      String(draft.listingPreviewDescription || '').trim() ||
      (Array.isArray(draft.selectedFeatures) && draft.selectedFeatures.length) ||
      (Array.isArray(draft.amenities) && draft.amenities.length),
  )
}

function readStoredMarketingDraft(listingId) {
  const storageKey = getListingMarketingDraftStorageKey(listingId)
  if (!storageKey || typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return null
    const parsed = JSON.parse(stored)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    window.localStorage.removeItem(storageKey)
    return null
  }
}

function writeStoredMarketingDraft(listingId, draft) {
  const storageKey = getListingMarketingDraftStorageKey(listingId)
  if (!storageKey || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(buildLightweightMarketingDraft(draft)))
  } catch (storageError) {
    console.warn('[AgentListingDetail] marketing draft cache write skipped', storageError)
  }
}

function clearStoredMarketingDraft(listingId) {
  const storageKey = getListingMarketingDraftStorageKey(listingId)
  if (!storageKey || typeof window === 'undefined') return
  window.localStorage.removeItem(storageKey)
}

function buildAddressAutocompleteValueFromDraft(draft = {}) {
  const formattedAddress = String(
    draft.formattedAddress ||
      [draft.addressLine1 || draft.streetAddress, draft.suburb, draft.city, draft.province].filter(Boolean).join(', '),
  ).trim()

  if (!formattedAddress) return null

  return {
    formattedAddress,
    streetAddress: String(draft.streetAddress || draft.addressLine1 || '').trim(),
    suburb: String(draft.suburb || '').trim(),
    city: String(draft.city || '').trim(),
    province: String(draft.province || '').trim(),
    country: String(draft.country || 'South Africa').trim(),
    postalCode: String(draft.postalCode || '').trim(),
    latitude: typeof draft.latitude === 'number' ? draft.latitude : Number(draft.latitude) || undefined,
    longitude: typeof draft.longitude === 'number' ? draft.longitude : Number(draft.longitude) || undefined,
    placeId: String(draft.googlePlaceId || '').trim(),
  }
}

function mergeAddressIntoMarketingDraft(previous, value) {
  if (!value) {
    return {
      ...previous,
      formattedAddress: '',
      streetAddress: '',
      addressLine1: '',
      suburb: '',
      city: '',
      province: '',
      country: 'South Africa',
      postalCode: '',
      latitude: null,
      longitude: null,
      googlePlaceId: '',
    }
  }

  return {
    ...previous,
    formattedAddress: value.formattedAddress || '',
    streetAddress: value.streetAddress || value.formattedAddress || '',
    addressLine1: value.streetAddress || value.formattedAddress || '',
    suburb: value.suburb || '',
    city: value.city || '',
    province: value.province || '',
    country: value.country || 'South Africa',
    postalCode: value.postalCode || '',
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    googlePlaceId: value.placeId || '',
  }
}

function AgentListingDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { listingId: encodedListingId } = useParams()
  const { profile } = useWorkspace()
  const listingId = useMemo(() => {
    try {
      return decodeURIComponent(String(encodedListingId || '')).trim()
    } catch {
      return ''
    }
  }, [encodedListingId])

  const [activeTab, setActiveTab] = useState('seller')
  const [privateListings, setPrivateListings] = useState([])
  const [pipelineLeads, setPipelineLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeOrganisationId, setActiveOrganisationId] = useState('')
  const [offersRefreshTick, setOffersRefreshTick] = useState(0)
  const [showSendOfferLinkForm, setShowSendOfferLinkForm] = useState(false)
  const [offerInviteDraft, setOfferInviteDraft] = useState({
    buyerLeadId: '',
    expiresInDays: 7,
    clientIntakePreference: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
    offerAmount: '',
    depositAmount: '',
    financeType: 'cash',
    specialConditions: '',
  })
  const [offerActionMessage, setOfferActionMessage] = useState('')
  const [offerActionError, setOfferActionError] = useState('')
  const [sendingOfferLink, setSendingOfferLink] = useState(false)
  const [copiedOfferToken, setCopiedOfferToken] = useState('')
  const [canonicalListingOffers, setCanonicalListingOffers] = useState([])
  const [canonicalOffersLoading, setCanonicalOffersLoading] = useState(false)
  const [canonicalOffersError, setCanonicalOffersError] = useState('')
  const [canonicalOfferActionId, setCanonicalOfferActionId] = useState('')
  const [detailMessage, setDetailMessage] = useState('')
  const [detailError, setDetailError] = useState('')
  const [deletingListing, setDeletingListing] = useState(false)
  const [gallerySaving, setGallerySaving] = useState(false)
  const [publicationSaving, setPublicationSaving] = useState(false)
  const [arch9LiveChecking, setArch9LiveChecking] = useState(false)
  const [property24Action, setProperty24Action] = useState('')
  const [property24Preview, setProperty24Preview] = useState(null)
  const [property24StatusCheck, setProperty24StatusCheck] = useState(null)
  const [property24LeadImport, setProperty24LeadImport] = useState(null)
  const [property24StatusUpdate, setProperty24StatusUpdate] = useState(PROPERTY24_STATUS_UPDATE_OPTIONS[0])
  const [openingSellerDocumentKey, setOpeningSellerDocumentKey] = useState('')
  const [sellerDocumentWorkflowAction, setSellerDocumentWorkflowAction] = useState('')
  const [activeListingDocumentTab, setActiveListingDocumentTab] = useState('property')
  const [resendingSellerPortalLink, setResendingSellerPortalLink] = useState(false)
  const [resettingSellerPortalPassword, setResettingSellerPortalPassword] = useState(false)
  const [sellerPortalAccessState, setSellerPortalAccessState] = useState(null)
  const [, setSellerPortalAccessLoading] = useState(false)
  const [sellerPortalSecurityDiagnostics, setSellerPortalSecurityDiagnostics] = useState(null)
  const [, setSellerPortalSecurityDiagnosticsLoading] = useState(false)
  const [sellerPortalActivationOpen, setSellerPortalActivationOpen] = useState(false)
  const [sellerPortalActivationDraft, setSellerPortalActivationDraft] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [sellerPortalActivationSending, setSellerPortalActivationSending] = useState(false)
  const [sellerContactEditorOpen, setSellerContactEditorOpen] = useState(false)
  const [sellerContactSaving, setSellerContactSaving] = useState(false)
  const [sellerContactDraft, setSellerContactDraft] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [sellerProfileBuilderOpen, setSellerProfileBuilderOpen] = useState(false)
  const [sellerProfileBuilderSaving, setSellerProfileBuilderSaving] = useState(false)
  const [sellerProfileBuilderDraft, setSellerProfileBuilderDraft] = useState(() => createListingSellerProfileBuilderDraft())
  const [sellerSectionEditorKey, setSellerSectionEditorKey] = useState('')
  const [sellerSectionDraft, setSellerSectionDraft] = useState({})
  const [sellerSectionSaving, setSellerSectionSaving] = useState(false)
  const [sellerDocumentUploadKey, setSellerDocumentUploadKey] = useState('')
  const [buyerOtpUploadKey, setBuyerOtpUploadKey] = useState('')
  const [sellerPackHandoffAction, setSellerPackHandoffAction] = useState('')
  const [listingPerformanceEditorOpen, setListingPerformanceEditorOpen] = useState(false)
  const [listingPerformanceDraft, setListingPerformanceDraft] = useState({})
  const [listingPerformanceSaving, setListingPerformanceSaving] = useState(false)
  const [followUpActionId, setFollowUpActionId] = useState('')
  const [mandateStartOpen, setMandateStartOpen] = useState(false)
  const [acceptedOfferOtpStartOffer, setAcceptedOfferOtpStartOffer] = useState(null)
  const [showFullGallery, setShowFullGallery] = useState(false)
  const [offerNotesDraftById, setOfferNotesDraftById] = useState({})
  const [sellerReviewDeliveryModeByOfferId, setSellerReviewDeliveryModeByOfferId] = useState({})
  const [marketingDraft, setMarketingDraft] = useState(() => buildPropertyDraft(null))
  const marketingDraftDirtyRef = useRef(false)
  const hydratedMarketingListingIdRef = useRef('')
  const [externalLinkDraft, setExternalLinkDraft] = useState(() => createExternalLinkDraft())
  const [readinessChecklistOpen, setReadinessChecklistOpen] = useState(false)
  const [property24ManageOpen, setProperty24ManageOpen] = useState(false)
  const [externalLinkPanelOpen, setExternalLinkPanelOpen] = useState(false)
  const [externalLinkEditingId, setExternalLinkEditingId] = useState('')
  const [propertyDetailsReturnTarget, setPropertyDetailsReturnTarget] = useState('')
  const [sellerWorkspaceTab, setSellerWorkspaceTab] = useState(() => getSellerWorkspaceTabFromSearch(typeof window !== 'undefined' ? window.location.search : '') || 'overview')
  const salesWorkspaceTabs = useMemo(() => buildListingWorkspaceTabs('sales'), [])
  const activeSalesWorkspaceTab = useMemo(
    () => resolveSalesListingWorkspaceTabFromLegacyState({ activeTab, sellerWorkspaceTab }),
    [activeTab, sellerWorkspaceTab],
  )
  const [commissionDraft, setCommissionDraft] = useState({
    percentage: '',
    amount: '',
    vatHandling: '',
    mandateTerms: '',
    paymentResponsibility: '',
    notes: '',
  })
  const [savingCommission, setSavingCommission] = useState(false)
  const [rolePlayersDraft, setRolePlayersDraft] = useState({
    attorney: 'Arch9 Conveyancing',
    bondOriginator: 'Arch9 Finance',
  })
  const [viewings, setViewings] = useState([])
  const [interestedLeadRows, setInterestedLeadRows] = useState([])
  const [sentPropertyRows, setSentPropertyRows] = useState([])
  const [communicationDeliveryRows, setCommunicationDeliveryRows] = useState([])
  const [sellerNotificationMode, setSellerNotificationMode] = useState(NOTIFICATION_MODE.EMAIL)
  const [sentPropertiesLoading, setSentPropertiesLoading] = useState(false)
  const [sentPropertiesError, setSentPropertiesError] = useState('')
  const [interestedLeadsLoading, setInterestedLeadsLoading] = useState(false)
  const [interestedLeadsError, setInterestedLeadsError] = useState('')
  const [listingLeadSearch, setListingLeadSearch] = useState('')
  const [listingLeadFiltersOpen, setListingLeadFiltersOpen] = useState(false)
  const [listingLeadStatusFilter, setListingLeadStatusFilter] = useState('all')
  const [listingLeadSourceFilter, setListingLeadSourceFilter] = useState('all')
  const [listingLeadActivityFilter, setListingLeadActivityFilter] = useState('all')
  const [listingLeadDateFilter, setListingLeadDateFilter] = useState('all')
  const [listingLeadPage, setListingLeadPage] = useState(1)
  const [suggestedLeadRows, setSuggestedLeadRows] = useState([])
  const [suggestedLeadsLoading, setSuggestedLeadsLoading] = useState(false)
  const [suggestedLeadsError, setSuggestedLeadsError] = useState('')
  const [suggestionActionId, setSuggestionActionId] = useState('')
  const [suggestionActionMessage, setSuggestionActionMessage] = useState('')
  const [showViewingForm, setShowViewingForm] = useState(false)
  const [viewingForm, setViewingForm] = useState({
    buyerLeadId: '',
    proposedDate: '',
    proposedTime: '',
    alternativeTimeA: '',
    alternativeTimeB: '',
    notes: '',
  })
  const [showDayCaptureOpen, setShowDayCaptureOpen] = useState(false)
  const [showDayCaptureForm, setShowDayCaptureForm] = useState(() => createShowDayCaptureForm())
  const [showDayCaptureSaving, setShowDayCaptureSaving] = useState(false)
  const [showDayCaptureFeedback, setShowDayCaptureFeedback] = useState({ kind: '', message: '' })
  const [feedbackDrafts, setFeedbackDrafts] = useState({})

  useEffect(() => {
    if (!listingId.startsWith('development-')) return
    const developmentId = listingId.replace('development-', '')
    navigate(`/developments/${developmentId}`, { replace: true })
  }, [listingId, navigate])

  useEffect(() => {
    const requestedTab = getSellerWorkspaceTabFromSearch(location.search)
    if (!requestedTab) return
    setPropertyDetailsReturnTarget('')
    setActiveTab('seller')
    setSellerWorkspaceTab(requestedTab)
  }, [location.search])

  const loadListingData = useCallback(async () => {
    setLoading(true)
    setDetailError('')
    if (!listingId) {
      setPrivateListings([])
      setDetailError('This listing link is invalid. Return to Listings and open the record again.')
      setLoading(false)
      return
    }

    const runtimeListings = sanitizePrivateListingRows(readAgentPrivateListings())
    if (!isSupabaseConfigured) {
      setPipelineLeads(readPipelineLeads())
    }

    let nextListings = runtimeListings
    if (isSupabaseConfigured && listingId && !listingId.startsWith('development-')) {
      try {
        const dbListing = await getPrivateListing(listingId)
        const returnedListingId = getPrivateListingRecordId(dbListing)
        if (dbListing && returnedListingId !== listingId) {
          setDetailError('This listing returned an invalid record. Refresh Listings and open it again; no changes were made.')
        } else if (returnedListingId) {
          nextListings = upsertListingRecord(runtimeListings, dbListing)
        }
      } catch (error) {
        console.error('[AgentListingDetail] Supabase listing load failed', error)
        setDetailError(error?.message || 'Unable to load this listing from Supabase.')
      }
    }

    setPrivateListings(sanitizePrivateListingRows(nextListings))
    setLoading(false)
  }, [listingId])

  useEffect(() => {
    void loadListingData()
  }, [loadListingData])

  useEffect(() => {
    const refreshListingData = () => {
      void loadListingData()
      setOffersRefreshTick((value) => value + 1)
    }

    window.addEventListener('itg:listings-updated', refreshListingData)
    window.addEventListener('itg:pipeline-updated', refreshListingData)
    return () => {
      window.removeEventListener('itg:listings-updated', refreshListingData)
      window.removeEventListener('itg:pipeline-updated', refreshListingData)
    }
  }, [loadListingData])

  const listingRecord = useMemo(() => {
    return findPrivateListingById(privateListings, listingId)
  }, [listingId, privateListings])

  const listingOrganisationId = useMemo(
    () => String(listingRecord?.organisationId || listingRecord?.organisation_id || activeOrganisationId || '').trim(),
    [activeOrganisationId, listingRecord?.organisationId, listingRecord?.organisation_id],
  )

  const sellerLeadId = useMemo(
    () => resolveSellerLeadIdFromListing(listingRecord),
    [listingRecord],
  )

  const listingActor = useMemo(() => {
    const id = String(profile?.id || listingRecord?.agentId || listingRecord?.assignedAgentId || '').trim()
    const name = String(
      profile?.fullName ||
        [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
        listingRecord?.assignedAgentName ||
        listingRecord?.assignedAgent ||
        profile?.email ||
        'Agent',
    ).trim()
    const email = String(profile?.email || listingRecord?.assignedAgentEmail || '').trim().toLowerCase()
    return {
      id,
      userId: id,
      name,
      email,
      branchId: String(profile?.branchId || listingRecord?.branchId || '').trim(),
    }
  }, [
    listingRecord?.agentId,
    listingRecord?.assignedAgent,
    listingRecord?.assignedAgentEmail,
    listingRecord?.assignedAgentId,
    listingRecord?.assignedAgentName,
    listingRecord?.branchId,
    profile?.branchId,
    profile?.email,
    profile?.firstName,
    profile?.fullName,
    profile?.id,
    profile?.lastName,
  ])
  const listingHasKingstonsSellerProcess = useMemo(
    () => hasKingstonsListingSignal({ listingRecord, listingOrganisationId, profile }),
    [listingOrganisationId, listingRecord, profile],
  )
  const listingKingstonsDigitalSigningDecision = useMemo(
    () => buildKingstonsDigitalSigningDecision({
      isKingstons: listingHasKingstonsSellerProcess,
      requestedAction: 'listing_mandate_signing',
    }),
    [listingHasKingstonsSellerProcess],
  )
  const listingKingstonsBuyerOtpDigitalDecision = useMemo(
    () => buildKingstonsBuyerOtpDigitalDecision({
      isKingstons: listingHasKingstonsSellerProcess,
      requestedAction: 'accepted_offer_otp_generation_and_signing',
    }),
    [listingHasKingstonsSellerProcess],
  )

  useEffect(() => {
    const token = resolveSellerPortalTokenFromListing(listingRecord)
    if (!token || !isSupabaseConfigured) {
      setSellerPortalAccessState(null)
      setSellerPortalAccessLoading(false)
      setSellerPortalSecurityDiagnostics(null)
      setSellerPortalSecurityDiagnosticsLoading(false)
      return
    }

    let cancelled = false
    setSellerPortalAccessLoading(true)
    setSellerPortalSecurityDiagnosticsLoading(true)
    getSellerPortalAccessState(token)
      .then((state) => {
        if (!cancelled) setSellerPortalAccessState(state || null)
      })
      .catch((error) => {
        console.warn('[AgentListingDetail] Seller portal access state unavailable', error)
        if (!cancelled) setSellerPortalAccessState(null)
      })
      .finally(() => {
        if (!cancelled) setSellerPortalAccessLoading(false)
      })
    getSellerPortalSecurityDiagnostics(token)
      .then((diagnostics) => {
        if (!cancelled) setSellerPortalSecurityDiagnostics(diagnostics || null)
      })
      .catch((error) => {
        console.warn('[AgentListingDetail] Seller portal security diagnostics unavailable', error)
        if (!cancelled) setSellerPortalSecurityDiagnostics(null)
      })
      .finally(() => {
        if (!cancelled) setSellerPortalSecurityDiagnosticsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [listingRecord])

  useEffect(() => {
    if (!listingOrganisationId || !listingRecord?.id || !isSupabaseConfigured) {
      setCanonicalListingOffers([])
      setCanonicalOffersError('')
      setCanonicalOffersLoading(false)
      return
    }
    let cancelled = false
    setCanonicalOffersLoading(true)
    setCanonicalOffersError('')
    listCanonicalOffersForListing({
      organisationId: listingOrganisationId,
      listingId: listingRecord.id,
    })
      .then((offers) => {
        if (!cancelled) setCanonicalListingOffers(Array.isArray(offers) ? offers : [])
      })
      .catch((error) => {
        if (!cancelled) {
          setCanonicalListingOffers([])
          setCanonicalOffersError(error?.message || 'Unable to load canonical offers.')
        }
      })
      .finally(() => {
        if (!cancelled) setCanonicalOffersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [listingOrganisationId, listingRecord?.id, offersRefreshTick])

  const refreshInterestedLeads = useCallback(async () => {
    if (!listingOrganisationId || !listingRecord?.id || !isSupabaseConfigured) {
      setInterestedLeadRows([])
      setInterestedLeadsError('')
      setInterestedLeadsLoading(false)
      return
    }
    try {
      setInterestedLeadsLoading(true)
      setInterestedLeadsError('')
      const rows = await listListingLeadInterests({
        organisationId: listingOrganisationId,
        listingId: listingRecord.id,
      })
      setInterestedLeadRows(Array.isArray(rows) ? rows : [])
    } catch (error) {
      setInterestedLeadRows([])
      setInterestedLeadsError(error?.message || 'Unable to load interested leads.')
    } finally {
      setInterestedLeadsLoading(false)
    }
  }, [listingOrganisationId, listingRecord?.id])

  useEffect(() => {
    void refreshInterestedLeads()
  }, [refreshInterestedLeads])

  const refreshSentProperties = useCallback(async () => {
    if (!listingOrganisationId || !listingRecord?.id || !isSupabaseConfigured) {
      setSentPropertyRows([])
      setCommunicationDeliveryRows([])
      setSentPropertiesError('')
      setSentPropertiesLoading(false)
      return
    }
    try {
      setSentPropertiesLoading(true)
      setSentPropertiesError('')
      const rows = await listListingPropertyShares({
        organisationId: listingOrganisationId,
        listingId: listingRecord.id,
      })
      const deliveries = await listCommunicationDeliveries({
        organisationId: listingOrganisationId,
        listingId: listingRecord.id,
      }).catch(() => [])
      setSentPropertyRows(Array.isArray(rows) ? rows : [])
      setCommunicationDeliveryRows(Array.isArray(deliveries) ? deliveries : [])
    } catch (error) {
      setSentPropertyRows([])
      setCommunicationDeliveryRows([])
      setSentPropertiesError(error?.message || 'Unable to load sent property history.')
    } finally {
      setSentPropertiesLoading(false)
    }
  }, [listingOrganisationId, listingRecord?.id])

  useEffect(() => {
    void refreshSentProperties()
  }, [refreshSentProperties])

  const refreshSellerNotificationDelivery = useCallback(async () => {
    if (!listingOrganisationId || !sellerLeadId || !listingRecord?.id || !isSupabaseConfigured) {
      return
    }
    try {
      const preferences = await getLeadCommunicationPreferences({ organisationId: listingOrganisationId, leadId: sellerLeadId }).catch(() => null)
      const fallbackPreferences = buildDefaultLeadCommunicationPreferences({ organisationId: listingOrganisationId, leadId: sellerLeadId })
      setSellerNotificationMode(preferences?.notificationMode || fallbackPreferences.notificationMode || NOTIFICATION_MODE.EMAIL)
    } catch (error) {
      console.warn('[AgentListingDetail] seller notification preference load failed', error)
    }
  }, [listingOrganisationId, listingRecord?.id, sellerLeadId])

  useEffect(() => {
    void refreshSellerNotificationDelivery()
  }, [refreshSellerNotificationDelivery])

  const refreshListingSuggestions = useCallback(async () => {
    if (!listingOrganisationId || !listingRecord?.id || !isSupabaseConfigured) {
      setSuggestedLeadRows([])
      setSuggestedLeadsError('')
      setSuggestedLeadsLoading(false)
      return
    }
    try {
      setSuggestedLeadsLoading(true)
      setSuggestedLeadsError('')
      const rows = await getSuggestionsForListing({
        organisationId: listingOrganisationId,
        listingId: listingRecord.id,
      })
      setSuggestedLeadRows(Array.isArray(rows) ? rows : [])
    } catch (error) {
      setSuggestedLeadRows([])
      setSuggestedLeadsError(error?.message || 'Unable to load suggested leads.')
    } finally {
      setSuggestedLeadsLoading(false)
    }
  }, [listingOrganisationId, listingRecord?.id])

  useEffect(() => {
    void refreshListingSuggestions()
  }, [refreshListingSuggestions])

  async function handleListingSuggestionAction(action, suggestion) {
    try {
      setSuggestionActionId(suggestion.suggestionId)
      setSuggestedLeadsError('')
      setSuggestionActionMessage('')
      if (action === 'accept') {
        await acceptSuggestion({ suggestionId: suggestion.suggestionId }, { actor: profile })
        setSuggestionActionMessage('Suggestion accepted and added to Interested Leads.')
      } else {
        await rejectSuggestion({ suggestionId: suggestion.suggestionId, reason: 'Rejected by agent from Listing Workspace.' }, { actor: profile })
        setSuggestionActionMessage('Suggestion rejected.')
      }
      await refreshListingSuggestions()
      if (action === 'accept') await refreshInterestedLeads()
    } catch (error) {
      setSuggestedLeadsError(error?.message || 'Unable to update suggested lead.')
    } finally {
      setSuggestionActionId('')
    }
  }

  async function regenerateListingSuggestions() {
    try {
      setSuggestionActionId('generate')
      setSuggestedLeadsError('')
      setSuggestionActionMessage('')
      const generated = await generateSuggestionsForListing({
        organisationId: listingOrganisationId,
        listingId: listingRecord.id,
        force: true,
      })
      setSuggestionActionMessage(`${generated.length} suggested lead${generated.length === 1 ? '' : 's'} generated.`)
      await refreshListingSuggestions()
    } catch (error) {
      setSuggestedLeadsError(error?.message || 'Unable to generate suggested leads.')
    } finally {
      setSuggestionActionId('')
    }
  }

  const refreshListingViewings = useCallback(async () => {
    if (!listingId) return
    const localRows = isUnsafeFallbackAllowed() ? getViewingRequestsForListing(listingId) : []
    let appointmentRows = []
    if (listingOrganisationId && isSupabaseConfigured) {
      try {
        const appointments = await listAppointmentsAsync(listingOrganisationId, {
          includeAll: true,
          listingId,
        })
        appointmentRows = (Array.isArray(appointments) ? appointments : [])
          .filter((appointment) => String(appointment?.listingId || appointment?.listing_id || '') === String(listingId))
          .map(mapAppointmentToViewingRecord)
      } catch (error) {
        console.warn('[AgentListingDetail] listing appointments load failed.', error)
      }
    }
    setViewings(mergeAppointmentAndLocalViewings(appointmentRows, localRows))
  }, [listingId, listingOrganisationId])

  useEffect(() => {
    if (!listingId) return undefined
    void refreshListingViewings()
    const refreshViewings = () => {
      void refreshListingViewings()
    }
    window.addEventListener('itg:viewings-updated', refreshViewings)
    window.addEventListener('itg:agency-crm-updated', refreshViewings)
    return () => {
      window.removeEventListener('itg:viewings-updated', refreshViewings)
      window.removeEventListener('itg:agency-crm-updated', refreshViewings)
    }
  }, [listingId, refreshListingViewings])

  const listingAnalyticsSummary = useMemo(() => buildListingWorkspaceAnalyticsSummary({
    interests: interestedLeadRows,
    viewings,
    offers: canonicalListingOffers,
    transactions: [],
    propertyShares: sentPropertyRows,
    communicationDeliveries: communicationDeliveryRows,
  }), [canonicalListingOffers, communicationDeliveryRows, interestedLeadRows, sentPropertyRows, viewings])
  const sellerOnboardingEmailDiagnostics = useMemo(
    () => buildSellerOnboardingEmailDiagnostics(communicationDeliveryRows),
    [communicationDeliveryRows],
  )

  useEffect(() => {
    if (!listingRecord) return
    const nextListingId = String(listingRecord.id || listingId || '').trim()
    if (marketingDraftDirtyRef.current && hydratedMarketingListingIdRef.current === nextListingId) {
      return
    }
    const nextDraft = buildPropertyDraft(listingRecord)
    const storedDraft = readStoredMarketingDraft(nextListingId)
    const shouldRestoreStoredDraft = hydratedMarketingListingIdRef.current !== nextListingId && hasMeaningfulMarketingDraft(storedDraft)
    setMarketingDraft(shouldRestoreStoredDraft ? { ...nextDraft, ...storedDraft } : nextDraft)
    hydratedMarketingListingIdRef.current = nextListingId
    marketingDraftDirtyRef.current = shouldRestoreStoredDraft
    setRolePlayersDraft({
      attorney: String(listingRecord?.rolePlayers?.attorney || 'Arch9 Conveyancing').trim(),
      bondOriginator: String(listingRecord?.rolePlayers?.bondOriginator || 'Arch9 Finance').trim(),
    })
  }, [listingId, listingRecord])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    let cancelled = false
    async function loadOrganisationContext() {
      try {
        const context = await fetchOrganisationSettings()
        if (!cancelled) {
          setActiveOrganisationId(String(context?.organisation?.id || '').trim())
        }
      } catch (error) {
        console.warn('[AgentListingDetail] organisation context load failed for appointments', error)
      }
    }
    void loadOrganisationContext()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!listingOrganisationId || !isSupabaseConfigured) return undefined
    let cancelled = false
    listAgencyCrmLeadContacts(listingOrganisationId, { includeLocalFallback: false })
      .then((snapshot) => {
        if (!cancelled) {
          setPipelineLeads(mapAgencyLeadSelectionRows(snapshot))
        }
      })
      .catch((error) => {
        console.warn('[AgentListingDetail] CRM lead selector load failed', error)
      })
    return () => {
      cancelled = true
    }
  }, [listingOrganisationId])

  function patchListing(updater) {
    if (!listingRecord) return null
    let updatedListing = null
    const baseRows = sanitizePrivateListingRows(privateListings)
    const nextRows = baseRows.map((item) => {
      if (String(item?.id || '') !== String(listingRecord.id)) return item
      updatedListing = updater({ ...item })
      return updatedListing
    })
    const rowsWithListing = updatedListing ? nextRows : [
      updater({ ...listingRecord }),
      ...baseRows,
    ]
    if (!updatedListing) {
      updatedListing = rowsWithListing[0]
    }
    setPrivateListings(rowsWithListing)
    try {
      writeAgentPrivateListings(rowsWithListing)
    } catch (storageError) {
      // The remote database save must not be blocked by oversized browser fallback cache data.
      console.warn('[AgentListingDetail] local listing cache write skipped', storageError)
    }
    return updatedListing
  }

  async function persistListingSnapshot(nextDraft, { message = '', persistCoreFields = false } = {}) {
    if (!listingRecord?.id || !nextDraft) return null
    const selectedCover = nextDraft.galleryImages.find((image) => String(image?.id) === String(nextDraft.coverImageId)) || nextDraft.galleryImages[0] || null
    const localListing = patchListing((row) => ({
      ...row,
      ...(persistCoreFields
        ? {
            listingCode: nextDraft.listingCode || row?.listingCode || '',
            listingTitle: nextDraft.headline.trim() || row?.listingTitle || '',
            propertyType: nextDraft.propertyType || row?.propertyType || 'House',
            status: nextDraft.publicationStatus === 'Published' ? 'active' : nextDraft.listingStatus || row?.status || 'active',
            description: nextDraft.description.trim(),
            listingDescription: nextDraft.description.trim(),
            listingPreviewDescription: String(nextDraft.listingPreviewDescription || nextDraft.description || '').trim(),
            keySellingPoints: nextDraft.selectedFeatures,
            selectedFeatures: nextDraft.selectedFeatures,
            features: nextDraft.selectedFeatures,
            addressLine1: nextDraft.addressLine1.trim(),
            formattedAddress: nextDraft.formattedAddress.trim(),
            streetAddress: nextDraft.streetAddress.trim(),
            suburb: nextDraft.suburb.trim(),
            city: nextDraft.city.trim(),
            province: nextDraft.province.trim(),
            country: nextDraft.country.trim() || 'South Africa',
            postalCode: nextDraft.postalCode.trim(),
            latitude: nextDraft.latitude ?? null,
            longitude: nextDraft.longitude ?? null,
            googlePlaceId: nextDraft.googlePlaceId.trim(),
            askingPrice: Number(nextDraft.price || 0),
          }
        : {}),
      marketing: {
        ...(row?.marketing || {}),
        mediaUrl: selectedCover?.url || '',
        source: nextDraft.source,
        status: nextDraft.listingStatus,
        description: nextDraft.description,
        selectedFeatures: nextDraft.selectedFeatures,
        keySellingPoints: nextDraft.selectedFeatures,
        features: nextDraft.selectedFeatures.join(', '),
        externalLinks: normalizeExternalListingLinks(nextDraft.externalLinks),
        videoLink: nextDraft.videoLink,
        virtualTourLink: nextDraft.virtualTourLink,
        notes: nextDraft.notes,
        imageGallery: normalizeMediaItems(nextDraft.galleryImages),
        coverImageId: nextDraft.coverImageId,
        floorplans: nextDraft.floorplans,
      },
      propertyDetails: {
        ...(row?.propertyDetails || {}),
        listingCode: nextDraft.listingCode,
        headline: nextDraft.headline.trim(),
        propertyType: nextDraft.propertyType,
        listingType: nextDraft.listingType,
        publicationStatus: nextDraft.publicationStatus,
        listingStatus: nextDraft.listingStatus,
        source: nextDraft.source.trim(),
        addressLine1: nextDraft.addressLine1.trim(),
        formattedAddress: nextDraft.formattedAddress.trim(),
        streetAddress: nextDraft.streetAddress.trim(),
        suburb: nextDraft.suburb.trim(),
        city: nextDraft.city.trim(),
        province: nextDraft.province.trim(),
        country: nextDraft.country.trim() || 'South Africa',
        postalCode: nextDraft.postalCode.trim(),
        latitude: nextDraft.latitude ?? null,
        longitude: nextDraft.longitude ?? null,
        googlePlaceId: nextDraft.googlePlaceId.trim(),
        bedrooms: nextDraft.bedrooms,
        bathrooms: nextDraft.bathrooms,
        garages: nextDraft.garages,
        parkingBays: nextDraft.parkingBays,
        coveredParking: nextDraft.coveredParking,
        openParking: nextDraft.openParking,
        erfSize: nextDraft.erfSize,
        floorSize: nextDraft.floorSize,
        price: Number(nextDraft.price || 0),
        levies: nextDraft.leviesNotApplicable ? 0 : Number(nextDraft.levies || 0),
        leviesNotApplicable: nextDraft.leviesNotApplicable,
        ratesTaxes: nextDraft.ratesTaxesNotApplicable ? 0 : Number(nextDraft.ratesTaxes || 0),
        ratesTaxesNotApplicable: nextDraft.ratesTaxesNotApplicable,
        saleType: nextDraft.saleType,
        vatApplicable: nextDraft.vatApplicable,
        offersFrom: Number(nextDraft.offersFrom || 0),
        selectedFeatures: nextDraft.selectedFeatures,
        amenities: nextDraft.amenities,
        petFriendly: nextDraft.petFriendly,
        fibreReady: nextDraft.fibreReady,
        securityFeatures: nextDraft.securityFeatures,
        description: nextDraft.description.trim(),
        listingPreviewDescription: String(nextDraft.listingPreviewDescription || nextDraft.description || '').trim(),
        notes: nextDraft.notes.trim(),
        floorplans: nextDraft.floorplans,
        coverImageId: nextDraft.coverImageId,
        videoLink: nextDraft.videoLink,
        virtualTourLink: nextDraft.virtualTourLink,
        externalLinks: normalizeExternalListingLinks(nextDraft.externalLinks),
        mandateSignedDate: nextDraft.mandateSignedDate,
        listingDate: nextDraft.listingDate,
        expiryDate: nextDraft.expiryDate,
        property24ListingUrl: nextDraft.property24ListingUrl.trim(),
        property24Reference: nextDraft.property24Reference.trim(),
        property24Status: nextDraft.property24Status,
        privatePropertyListingUrl: nextDraft.privatePropertyListingUrl.trim(),
        privatePropertyReference: nextDraft.privatePropertyReference.trim(),
        privatePropertyStatus: nextDraft.privatePropertyStatus,
        bridgeListingStatus: nextDraft.bridgeListingStatus,
        bridgeListingPublicUrl: nextDraft.bridgeListingPublicUrl.trim(),
      },
      publicationData: {
        title: nextDraft.headline.trim(),
        address: nextDraft.addressLine1.trim(),
        formattedAddress: nextDraft.formattedAddress.trim(),
        suburb: nextDraft.suburb.trim(),
        city: nextDraft.city.trim(),
        province: nextDraft.province.trim(),
        country: nextDraft.country.trim() || 'South Africa',
        postalCode: nextDraft.postalCode.trim(),
        latitude: nextDraft.latitude ?? null,
        longitude: nextDraft.longitude ?? null,
        googlePlaceId: nextDraft.googlePlaceId.trim(),
        propertyType: nextDraft.propertyType,
        listingType: nextDraft.listingType,
        askingPrice: Number(nextDraft.price || 0),
        bedrooms: nextDraft.bedrooms,
        bathrooms: nextDraft.bathrooms,
        garages: nextDraft.garages,
        parkingBays: nextDraft.parkingBays,
        floorSize: nextDraft.floorSize,
        erfSize: nextDraft.erfSize,
        ratesTaxes: nextDraft.ratesTaxesNotApplicable ? '' : nextDraft.ratesTaxes,
        levies: nextDraft.leviesNotApplicable ? '' : nextDraft.levies,
        description: nextDraft.description.trim(),
        keySellingPoints: nextDraft.selectedFeatures,
        selectedFeatures: nextDraft.selectedFeatures,
        features: nextDraft.selectedFeatures,
        amenities: nextDraft.amenities,
        status: nextDraft.publicationStatus,
      },
      listingMedia: {
        coverImageId: nextDraft.coverImageId,
        galleryImages: normalizeMediaItems(nextDraft.galleryImages),
        floorplans: normalizeMediaItems(nextDraft.floorplans),
        videoLink: nextDraft.videoLink,
        virtualTourLink: nextDraft.virtualTourLink,
      },
      externalLinks: normalizeExternalListingLinks(nextDraft.externalLinks),
      listingExternalLinks: normalizeExternalListingLinks(nextDraft.externalLinks),
      sellerOnboarding: {
        ...(row?.sellerOnboarding || {}),
        formData: {
          ...((row?.sellerOnboarding?.formData && typeof row.sellerOnboarding.formData === 'object') ? row.sellerOnboarding.formData : {}),
          ...buildListingSnapshotFormData(nextDraft),
        },
      },
    }))

    if (!isSupabaseConfigured) {
      if (message) setDetailMessage(message)
      return localListing
    }

    const savedOnboarding = await updatePrivateListingOnboardingFormData(listingRecord.id, buildListingSnapshotFormData(nextDraft)).catch((error) => {
      console.warn('[AgentListingDetail] listing snapshot save skipped', error)
      setDetailError(error?.message || 'Saved locally, but Supabase could not be updated.')
      return null
    })
    if (savedOnboarding?.form_data) {
      setPrivateListings((rows) => upsertListingRecord(rows, {
        ...localListing,
        sellerOnboarding: {
          ...(localListing?.sellerOnboarding || {}),
          status: savedOnboarding.status || localListing?.sellerOnboarding?.status,
          formData: savedOnboarding.form_data,
        },
      }))
    }
    if (message) setDetailMessage(message)
    return localListing
  }

  async function saveMarketingDraft(draftOverride = marketingDraft, options = {}) {
    const draft = draftOverride &&
      typeof draftOverride === 'object' &&
      !('nativeEvent' in draftOverride) &&
      !('currentTarget' in draftOverride)
      ? draftOverride
      : marketingDraft
    setDetailMessage('')
    setDetailError('')
    const normalizedExternalLinks = normalizeExternalListingLinks(draft.externalLinks)
    const property24ExternalLink = normalizedExternalLinks.find((link) => String(link.platform || '').trim().toLowerCase().includes('property24')) || null
    const privatePropertyExternalLink = normalizedExternalLinks.find((link) => String(link.platform || '').trim().toLowerCase().includes('private')) || null
    const updatedListing = await persistListingSnapshot(draft, { persistCoreFields: true })
    if (!updatedListing?.id || !isSupabaseConfigured) {
      marketingDraftDirtyRef.current = false
      hydratedMarketingListingIdRef.current = String(updatedListing?.id || listingRecord?.id || listingId || '').trim()
      clearStoredMarketingDraft(hydratedMarketingListingIdRef.current)
      setDetailMessage('Listing details saved locally.')
      return { ok: true, localOnly: true }
    }

    try {
      const listingPatch = {
        title: draft.headline.trim() || updatedListing.listingTitle || '',
        propertyType: draft.propertyType || updatedListing.propertyType || '',
        listingStatus: draft.listingStatus || updatedListing.listingStatus || updatedListing.status || 'mandate_signed',
        listingSource: draft.source || updatedListing.listingSource || 'private_listing',
        description: draft.description.trim(),
        askingPrice: Number(draft.price || 0),
        addressLine1: draft.addressLine1.trim(),
        formattedAddress: draft.formattedAddress.trim(),
        streetAddress: draft.streetAddress.trim(),
        suburb: draft.suburb.trim(),
        city: draft.city.trim(),
        province: draft.province.trim(),
        country: draft.country.trim() || 'South Africa',
        postalCode: draft.postalCode.trim(),
        latitude: draft.latitude ?? null,
        longitude: draft.longitude ?? null,
        googlePlaceId: draft.googlePlaceId.trim(),
        isActive: String(draft.listingStatus || '').trim().toLowerCase() === 'active',
        property24ListingUrl: draft.property24ListingUrl.trim() || property24ExternalLink?.url || '',
        property24Reference: draft.property24Reference.trim(),
        property24Status: draft.property24Status || property24ExternalLink?.status || 'not_published',
        privatePropertyListingUrl: draft.privatePropertyListingUrl.trim() || privatePropertyExternalLink?.url || '',
        privatePropertyReference: draft.privatePropertyReference.trim(),
        privatePropertyStatus: draft.privatePropertyStatus || privatePropertyExternalLink?.status || 'not_published',
        bridgeListingStatus: draft.bridgeListingStatus,
        bridgeListingPublicUrl: draft.bridgeListingPublicUrl.trim(),
        listingPreviewDescription: String(draft.listingPreviewDescription || draft.description || '').trim(),
        internalListingNotes: draft.notes.trim(),
      }
      if (options.listingVisibility) listingPatch.listingVisibility = options.listingVisibility
      const savedListing = await updatePrivateListing(updatedListing.id, listingPatch)
      const mergedSavedListing = savedListing?.id ? mergeListingRecord(savedListing, updatedListing) : updatedListing
      if (savedListing?.id) {
        setPrivateListings((rows) => upsertListingRecord(rows, mergedSavedListing))
      }
      const distributionSync = await syncPrivateListingDistributionData(updatedListing.id, {
        publicationData: {
          title: draft.headline.trim(),
          address: draft.addressLine1.trim(),
          formattedAddress: draft.formattedAddress.trim(),
          suburb: draft.suburb.trim(),
          city: draft.city.trim(),
          province: draft.province.trim(),
          country: draft.country.trim() || 'South Africa',
          postalCode: draft.postalCode.trim(),
          latitude: draft.latitude ?? null,
          longitude: draft.longitude ?? null,
          googlePlaceId: draft.googlePlaceId.trim(),
          propertyType: draft.propertyType,
          listingType: draft.listingType,
          askingPrice: Number(draft.price || 0),
          bedrooms: draft.bedrooms,
          bathrooms: draft.bathrooms,
          garages: draft.garages,
          parkingBays: draft.parkingBays,
          floorSize: draft.floorSize,
          erfSize: draft.erfSize,
          ratesTaxes: draft.ratesTaxesNotApplicable ? null : draft.ratesTaxes,
          levies: draft.leviesNotApplicable ? null : draft.levies,
          description: draft.description.trim(),
          features: draft.selectedFeatures,
          amenities: draft.amenities,
          status: draft.publicationStatus,
        },
        media: {
          coverImageId: draft.coverImageId,
          galleryImages: draft.galleryImages,
          floorplans: draft.floorplans,
          videoLink: draft.videoLink,
          virtualTourLink: draft.virtualTourLink,
        },
        externalLinks: normalizedExternalLinks,
      }).catch((syncError) => {
        console.warn('[AgentListingDetail] listing distribution sync skipped', syncError)
        setDetailError('Listing content saved, but portal/distribution sync needs another attempt.')
        return { skipped: true, reason: 'distribution_sync_failed', error: syncError }
      })
      if (distributionSync?.skipped) {
        console.warn('[AgentListingDetail] listing distribution sync skipped', distributionSync.reason)
      }
      await upsertAreaFromAddress(buildAddressAutocompleteValueFromDraft(draft), { incrementListingCount: false })
      marketingDraftDirtyRef.current = false
      hydratedMarketingListingIdRef.current = String(mergedSavedListing?.id || updatedListing.id || listingId || '').trim()
      clearStoredMarketingDraft(hydratedMarketingListingIdRef.current)
      setDetailMessage(options.successMessage || 'Listing details saved.')
      return { ok: true, listing: mergedSavedListing }
    } catch (error) {
      console.error('[AgentListingDetail] Supabase listing save failed', error)
      setDetailError(error?.message || 'Saved locally, but Supabase could not be updated.')
      return { ok: false, error }
    }
  }

  async function verifyArch9PublicListing(publicUrlOverride = arch9PublicListingUrl, options = {}) {
    const slug = getPublicListingSlugFromUrl(publicUrlOverride)
    if (!slug) {
      const nextCheck = { status: 'missing_url', message: 'Save listing data before checking the public page.' }
      if (!options.silent) {
        setDetailMessage('')
        setDetailError(nextCheck.message)
      }
      return nextCheck
    }

    setArch9LiveChecking(true)
    if (!options.silent) {
      setDetailError('')
      setDetailMessage('Checking the public catalogue...')
    }
    try {
      const response = await fetch(`${ARCH9_PUBLIC_LISTINGS_API_PATH}?slug=${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null)
      if (response.ok && payload?.listing?.slug) {
        const nextCheck = { status: 'live', message: 'Confirmed live on the public catalogue.' }
        if (!options.silent) {
          setDetailError('')
          setDetailMessage(nextCheck.message)
        }
        return nextCheck
      }

      const nextCheck = {
        status: 'not_found',
        message: payload?.message || 'Not visible on the public catalogue yet. Check readiness, save, then try again.',
      }
      if (!options.silent) {
        setDetailMessage('')
        setDetailError(nextCheck.message)
      }
      return nextCheck
    } catch (error) {
      const nextCheck = {
        status: 'error',
        message: error?.message || 'The public catalogue could not be checked from this browser.',
      }
      if (!options.silent) {
        setDetailMessage('')
        setDetailError(nextCheck.message)
      }
      return nextCheck
    } finally {
      setArch9LiveChecking(false)
    }
  }

  async function publishToArch9Buy() {
    const blockers = getArch9PublicationBlockers(marketingDraft, coverImage)
    if (blockers.length) {
      setDetailMessage('')
      setDetailError(`Before publishing the public listing: ${blockers.join(' ')}`)
      return
    }

    const publicUrl = buildArch9PublicListingUrl(marketingDraft, listingRecord)
    const currentListingStatus = normalizeKey(marketingDraft.listingStatus)
    const nextDraft = {
      ...marketingDraft,
      publicationStatus: 'Published',
      bridgeListingStatus: 'published',
      bridgeListingPublicUrl: publicUrl,
      listingStatus: ['sold', 'withdrawn', 'transaction_created'].includes(currentListingStatus)
        ? marketingDraft.listingStatus
        : 'active',
    }

    setPublicationSaving(true)
    setMarketingDraft(nextDraft)
    try {
      const saveResult = await saveMarketingDraft(nextDraft, {
        listingVisibility: 'active_market',
        successMessage: 'Listing published to the public catalogue.',
      })
      if (saveResult?.ok && !saveResult.localOnly) {
        const liveResult = await verifyArch9PublicListing(publicUrl, { silent: true })
        if (liveResult.status === 'live') {
          setDetailError('')
          setDetailMessage('Listing published and confirmed live on the public catalogue.')
        }
      }
    } finally {
      setPublicationSaving(false)
    }
  }

  async function pauseArch9BuyPublication() {
    const publicUrl = buildArch9PublicListingUrl(marketingDraft, listingRecord)
    const nextDraft = {
      ...marketingDraft,
      publicationStatus: 'Draft',
      bridgeListingStatus: 'paused',
      bridgeListingPublicUrl: publicUrl,
    }

    setPublicationSaving(true)
    setMarketingDraft(nextDraft)
    try {
      const saveResult = await saveMarketingDraft(nextDraft, {
        successMessage: 'Listing removed from the public catalogue.',
      })
      if (saveResult?.ok) {
        setDetailError('')
        setDetailMessage('Publication paused. The public link should no longer resolve once cache refreshes.')
      }
    } finally {
      setPublicationSaving(false)
    }
  }

  async function callProperty24ListingAction(action, body = {}, options = {}) {
    if (!listingRecord?.id) throw new Error('Open a saved listing before using Property24.')
    if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before using Property24 publishing.')
    const sessionResult = await supabase.auth.getSession()
    const accessToken = sessionResult.data?.session?.access_token
    if (!accessToken) throw new Error('Sign in again before using Property24 publishing.')
    const method = String(options.method || 'POST').toUpperCase()
    const query = options.query instanceof URLSearchParams ? `?${options.query.toString()}` : ''
    const requestOptions = {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
    if (method !== 'GET') {
      requestOptions.headers['Content-Type'] = 'application/json'
      requestOptions.body = JSON.stringify({
        maxImages: 20,
        photosChanged: true,
        ...body,
      })
    }
    const response = await fetch(`${PROPERTY24_LISTING_API_BASE_PATH}/${encodeURIComponent(listingRecord.id)}/${action}${query}`, requestOptions)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(getProperty24ApiMessage(payload, options.fallbackMessage || 'Property24 request failed.'))
    }
    return payload
  }

  async function previewProperty24Listing() {
    setProperty24Action('preview')
    setProperty24Preview(null)
    setDetailError('')
    setDetailMessage('Checking Property24 readiness...')
    try {
      const saveResult = await saveMarketingDraft(marketingDraft, {
        successMessage: '',
      })
      if (saveResult?.ok === false) throw saveResult.error || new Error('Save the listing before checking Property24 readiness.')
      const payload = await callProperty24ListingAction('preview', {}, { fallbackMessage: 'Property24 preview failed.' })
      setProperty24Preview(payload)
      const counts = getProperty24ReadinessCounts(payload)
      setDetailError('')
      setDetailMessage(
        counts.dataBlockers || counts.technicalBlockers
          ? getProperty24ApiMessage(payload, 'Property24 readiness has blockers.')
          : `Property24 preview is ready. ${counts.imagesLoaded} image${counts.imagesLoaded === 1 ? '' : 's'} loaded.`,
      )
      return payload
    } catch (error) {
      setDetailMessage('')
      setDetailError(error?.message || 'Property24 preview failed.')
      return null
    } finally {
      setProperty24Action('')
    }
  }

  async function publishProperty24Listing() {
    setProperty24Action('publish')
    setDetailError('')
    setDetailMessage('Publishing to Property24...')
    try {
      const saveResult = await saveMarketingDraft(marketingDraft, {
        successMessage: '',
      })
      if (saveResult?.ok === false) throw saveResult.error || new Error('Save the listing before publishing to Property24.')
      const payload = await callProperty24ListingAction('publish', {}, { fallbackMessage: 'Property24 publish failed.' })
      setProperty24Preview(payload)
      const listingNumber = getProperty24ListingNumberFromResponse(payload)
      setMarketingDraft((previous) => ({
        ...previous,
        property24Reference: listingNumber || previous.property24Reference,
        property24Status: 'published',
      }))
      await loadListingData()
      setDetailError('')
      setDetailMessage(listingNumber ? `Published to Property24. Listing number ${listingNumber}.` : 'Published to Property24.')
      return payload
    } catch (error) {
      setDetailMessage('')
      setDetailError(error?.message || 'Property24 publish failed.')
      return null
    } finally {
      setProperty24Action('')
    }
  }

  async function refreshProperty24ListingStatus() {
    setProperty24Action('status')
    setDetailError('')
    setDetailMessage('Checking Property24 live status...')
    try {
      const query = new URLSearchParams({ refresh: 'true' })
      const payload = await callProperty24ListingAction('status', {}, {
        method: 'GET',
        query,
        fallbackMessage: 'Property24 status check failed.',
      })
      setProperty24StatusCheck(payload)
      const portalCheck = payload?.status?.portalCheck
      const databaseStatus = portalCheck?.databaseWrite?.property24Status
      const listingNumber = payload?.status?.listingNumber || portalCheck?.databaseWrite?.listingNumber
      setMarketingDraft((previous) => ({
        ...previous,
        property24Reference: listingNumber ? String(listingNumber) : previous.property24Reference,
        property24Status: databaseStatus || previous.property24Status,
      }))
      await loadListingData()
      setDetailError('')
      setDetailMessage(portalCheck?.isOnPortal ? 'Property24 confirms this listing is live.' : 'Property24 does not currently show this listing as live.')
      return payload
    } catch (error) {
      setDetailMessage('')
      setDetailError(error?.message || 'Property24 status check failed.')
      return null
    } finally {
      setProperty24Action('')
    }
  }

  async function updateProperty24ListingStatus() {
    const nextStatus = String(property24StatusUpdate || '').trim()
    if (!nextStatus) return null
    setProperty24Action('status-update')
    setDetailError('')
    setDetailMessage(`Updating Property24 status to ${nextStatus}...`)
    try {
      const payload = await callProperty24ListingAction('status-update', {
        status: nextStatus,
        listingNumber: property24Reference || undefined,
      }, {
        fallbackMessage: 'Property24 status update failed.',
      })
      const databaseStatus = payload?.report?.databaseWrite?.property24Status
      const listingNumber = payload?.report?.databaseWrite?.listingNumber || payload?.report?.listingNumber
      setMarketingDraft((previous) => ({
        ...previous,
        property24Reference: listingNumber ? String(listingNumber) : previous.property24Reference,
        property24Status: databaseStatus || previous.property24Status,
      }))
      setProperty24StatusCheck({
        route: 'listingStatus',
        status: {
          listingNumber: listingNumber || property24Reference || null,
          listing: {
            property24_status: databaseStatus || marketingDraft.property24Status,
            updated_at: payload?.report?.generatedAt || new Date().toISOString(),
          },
          portalCheck: payload?.report?.portalCheck
            ? {
                ...payload.report.portalCheck,
                isOnPortal: Boolean(payload.report.portalCheck?.data),
                databaseWrite: payload.report.databaseWrite || null,
              }
            : null,
        },
      })
      await loadListingData()
      setDetailError('')
      setDetailMessage(`Property24 status update sent: ${nextStatus}.`)
      return payload
    } catch (error) {
      setDetailMessage('')
      setDetailError(error?.message || 'Property24 status update failed.')
      return null
    } finally {
      setProperty24Action('')
    }
  }

  async function pullProperty24ListingLeads({ applyLeads = false } = {}) {
    setProperty24Action(applyLeads ? 'lead-import' : 'lead-preview')
    setDetailError('')
    setDetailMessage(applyLeads ? 'Importing Property24 leads...' : 'Checking Property24 leads...')
    try {
      const query = new URLSearchParams()
      if (applyLeads) query.set('applyLeads', 'true')
      const payload = await callProperty24ListingAction('leads', {}, {
        method: 'GET',
        query,
        fallbackMessage: applyLeads ? 'Property24 lead import failed.' : 'Property24 lead check failed.',
      })
      setProperty24LeadImport(payload)
      const counts = getProperty24LeadImportCounts(payload)
      if (applyLeads) {
        await Promise.all([
          refreshInterestedLeads(),
          listAgencyCrmLeadContacts(listingOrganisationId, { includeLocalFallback: false })
            .then((snapshot) => setPipelineLeads(mapAgencyLeadSelectionRows(snapshot)))
            .catch(() => null),
        ])
        window.dispatchEvent(new Event('itg:agency-crm-updated'))
        setDetailMessage(
          counts.imported
            ? `Imported ${counts.imported} Property24 lead${counts.imported === 1 ? '' : 's'}.`
            : counts.alreadyImported
              ? 'No new Property24 leads. Existing enquiries were already imported.'
              : counts.received
                ? 'Property24 leads checked. Some need review before import.'
                : 'No Property24 leads found for this listing yet.',
        )
      } else {
        setDetailMessage(
          counts.received
            ? `Found ${counts.received} Property24 lead${counts.received === 1 ? '' : 's'} for this listing.`
            : 'No Property24 leads found for this listing yet.',
        )
      }
      return payload
    } catch (error) {
      setDetailMessage('')
      setDetailError(error?.message || (applyLeads ? 'Property24 lead import failed.' : 'Property24 lead check failed.'))
      return null
    } finally {
      setProperty24Action('')
    }
  }

  async function copyArch9PublicListingUrl() {
    if (!arch9PublicListingUrl) return
    try {
      await navigator.clipboard.writeText(arch9PublicListingUrl)
      setDetailError('')
      setDetailMessage('Public listing link copied.')
    } catch {
      setDetailMessage('')
      setDetailError('Unable to copy the public listing link from this browser.')
    }
  }

  function saveRolePlayers() {
    patchListing((row) => ({
      ...row,
      rolePlayers: {
        attorney: rolePlayersDraft.attorney,
        bondOriginator: rolePlayersDraft.bondOriginator,
      },
    }))
    setDetailMessage('Role players saved locally.')
  }

  async function handleCreateOfferLink(event) {
    event.preventDefault()
    if (!listingRecord) return
    setOfferActionError('')
    setOfferActionMessage('')
    if (OFFER_WORKFLOW_RETIRED) {
      setOfferActionError(OFFER_WORKFLOW_RETIRED_MESSAGE)
      setShowSendOfferLinkForm(false)
      return
    }
    const selectedLead = buyerOfferLeads.find((lead) => String(lead?.id || '') === String(offerInviteDraft.buyerLeadId || ''))
    if (!selectedLead) {
      setOfferActionError('Select a buyer lead before generating an offer link.')
      return
    }
    const buyerOfferIntegrity = assessBuyerOfferIntegrity({
      organisationId: listingOrganisationId,
      listing: listingRecord,
      buyerLead: selectedLead,
    })
    if (!buyerOfferIntegrity.ok) {
      setOfferActionError(buyerOfferIntegrity.message)
      return
    }
    const buyerOfferEligibility = assessBuyerOfferEligibility({
      organisationId: listingOrganisationId,
      listing: listingRecord,
      buyerLead: selectedLead,
    })
    if (!buyerOfferEligibility.eligible) {
      setOfferActionError(buyerOfferEligibility.message)
      return
    }
    const clientIntakePreference = normalizeClientIntakePreference(
      offerInviteDraft.clientIntakePreference || selectedLead?.clientIntakePreference,
    )
    const agentAssistedEntry = clientIntakePreference === CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED
      ? buildAgentAssistedOfferEntry({ buyer: selectedLead, draft: offerInviteDraft })
      : null
    if (agentAssistedEntry && !agentAssistedEntry.ok) {
      setOfferActionError(agentAssistedEntry.blockers.join(' '))
      return
    }

    try {
      setSendingOfferLink(true)
      const buyerEmail = String(selectedLead?.email || '').trim().toLowerCase()
      const buyerPhone = formatSouthAfricanWhatsAppNumber(selectedLead?.phone)
      const buyerPreferences = clientIntakePreference === CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL
        ? await getLeadCommunicationPreferences({
            organisationId: listingOrganisationId,
            leadId: selectedLead.leadId || selectedLead.id,
          })
        : null
      const deliveryPlan = resolveOfferLinkDeliveryPlan({
        clientIntakePreference,
        notificationMode: buyerPreferences?.notificationMode || NOTIFICATION_MODE.EMAIL,
        email: buyerEmail,
        phone: buyerPhone,
        recipientName: selectedLead?.name || '',
      })
      if (deliveryPlan.blockers.length) {
        throw new Error(deliveryPlan.blockers.join(' '))
      }
      const listingLinkPatch = buildLeadListingLinkPatch(listingRecord)
      await updateAgencyCrmLeadRecord(listingOrganisationId, selectedLead.leadId || selectedLead.id, listingLinkPatch)
      setPipelineLeads((previous) => previous.map((lead) => (
        String(lead?.leadId || lead?.id || '') === String(selectedLead.leadId || selectedLead.id)
          ? { ...lead, ...listingLinkPatch }
          : lead
      )))
      const canonicalOffer = await createCanonicalOffer({
        organisationId: listingOrganisationId,
        buyerLeadId: selectedLead.leadId || selectedLead.id,
        buyerContactId: selectedLead.contactId,
        listingId: listingRecord.id,
        agentId: profile?.id || listingRecord?.agentId,
        status: agentAssistedEntry ? 'agent_review' : 'draft',
        offerAmount: agentAssistedEntry?.payload.offerAmount,
        depositAmount: agentAssistedEntry?.payload.depositAmount,
        financeType: agentAssistedEntry?.payload.financeType,
        conditionsJson: agentAssistedEntry?.payload.conditionsJson || { clientIntakePreference },
      }, {
        actor: {
          id: profile?.id || listingRecord?.agentId || '',
          name: String(profile?.fullName || listingRecord?.assignedAgentName || listingRecord?.assignedAgent || 'Agent').trim(),
          email: String(profile?.email || listingRecord?.assignedAgentEmail || '').trim(),
        },
      })

      if (agentAssistedEntry) {
        setOfferActionMessage('Agent-assisted offer captured for internal review. No buyer link was sent.')
        setShowSendOfferLinkForm(false)
        setOfferInviteDraft({
          buyerLeadId: '',
          expiresInDays: 7,
          clientIntakePreference: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
          offerAmount: '',
          depositAmount: '',
          financeType: 'cash',
          specialConditions: '',
        })
        setOffersRefreshTick((value) => value + 1)
        return
      }
      const buyerName = String(selectedLead?.name || 'Buyer').trim()
      const propertyLabel = String(listingRecord?.listingTitle || listingRecord?.propertyAddress || 'property').trim()
      if (!deliveryPlan.deliversLink && !deliveryPlan.suppressed) {
        const prepared = await prepareNotificationOutbox({
          organisationId: listingOrganisationId,
          assignedUserId: profile?.id || listingRecord?.agentId,
          leadId: selectedLead.leadId || selectedLead.id,
          listingId: listingRecord.id,
          offerId: canonicalOffer?.offerId || canonicalOffer?.id || '',
          communicationType: 'buyer_offer_hard_copy_handoff',
          notificationMode: NOTIFICATION_MODE.AGENT_ASSISTED,
          recipientName: buyerName,
          recipientRole: 'buyer',
          email: buyerEmail,
          phone: buyerPhone,
          subject: `Hard-copy offer pack: ${propertyLabel}`,
          message: `Prepare the hard-copy offer pack for ${buyerName}. No portal link may be sent.`,
          dedupeKey: `buyer-offer-hard-copy:${canonicalOffer?.offerId || canonicalOffer?.id || ''}`,
          metadata: { clientIntakePreference, controlledDelivery: true },
        })
        setOfferActionMessage(`Hard-copy offer handoff prepared (${prepared.items.length} internal task). No buyer link was sent.`)
        setShowSendOfferLinkForm(false)
        setOfferInviteDraft({ buyerLeadId: '', expiresInDays: 7, clientIntakePreference: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL, offerAmount: '', depositAmount: '', financeType: 'cash', specialConditions: '' })
        setOffersRefreshTick((value) => value + 1)
        return
      }
      const { invite, link } = createOfferInvite({
        listingId: listingRecord.id,
        buyerLeadId: selectedLead.id,
        buyerLeadName: selectedLead.name || '',
        agentId: String(listingRecord?.agentId || listingRecord?.assignedAgentEmail || '').trim(),
        agentName: String(listingRecord?.assignedAgentName || listingRecord?.assignedAgent || 'Assigned Agent').trim(),
        agentEmail: String(listingRecord?.assignedAgentEmail || '').trim(),
        agencyName: String(listingRecord?.agencyOrganisation || '').trim(),
        sellerToken: String(listingRecord?.sellerOnboarding?.token || '').trim(),
        organisationId: listingOrganisationId,
        canonicalOfferId: canonicalOffer?.offerId || canonicalOffer?.id || '',
        expiresInDays: Math.max(1, Number(offerInviteDraft.expiresInDays || 7)),
      })

      const prepared = await prepareNotificationOutbox({
        organisationId: listingOrganisationId,
        assignedUserId: profile?.id || listingRecord?.agentId,
        leadId: selectedLead.leadId || selectedLead.id,
        listingId: listingRecord.id,
        offerId: canonicalOffer?.offerId || canonicalOffer?.id || '',
        communicationType: 'buyer_offer_link',
        notificationMode: deliveryPlan.notificationMode,
        recipientName: buyerName,
        recipientRole: 'buyer',
        email: buyerEmail,
        phone: buyerPhone,
        subject: `Secure offer link: ${propertyLabel}`,
        message: `Secure offer link prepared for ${buyerName}.`,
        dedupeKey: `buyer-offer-link:${canonicalOffer?.offerId || canonicalOffer?.id || ''}`,
        metadata: { offerLink: link, expiresAt: invite?.expiresAt || '', controlledDelivery: true },
      })
      const outboxItems = prepared.items || []
      const updateOfferOutbox = async (channel, status, errorMessage = '', provider = '') => {
        const item = outboxItems.find((entry) => entry.channel === channel)
        if (!item?.id) return
        await updateNotificationOutboxStatus({ eventId: item.id, status, errorMessage, provider }).catch((error) => {
          console.warn('[Offers] offer-link outbox status update failed', error)
        })
      }
      const deliveryFailures = []
      if (deliveryPlan.channels.includes('email')) {
        try {
          await invokeEdgeFunction('send-email', {
            body: {
              type: 'buyer_offer_link',
              to: buyerEmail,
              buyerName,
              propertyTitle: propertyLabel,
              offerLink: link,
              expiresAt: invite?.expiresAt || '',
            },
          })
          await updateOfferOutbox('email', 'sent', '', 'send-email')
        } catch (error) {
          await updateOfferOutbox('email', 'failed', error?.message || 'Email delivery failed', 'send-email').catch(() => null)
          deliveryFailures.push('email')
        }
      }

      if (deliveryPlan.channels.includes('whatsapp')) {
        try {
          await sendWhatsAppNotification({
            to: buyerPhone,
            role: 'buyer',
            message: `Hi ${buyerName},\n\nYour viewing for ${propertyLabel} is complete.\n\nSubmit your secure offer here:\n${link}\n\nThis link expires on ${formatDate(invite?.expiresAt)}.\n\n- Arch9`,
          })
          await updateOfferOutbox('whatsapp', 'sent', '', 'whatsapp')
        } catch (error) {
          await updateOfferOutbox('whatsapp', 'failed', error?.message || 'WhatsApp delivery failed', 'whatsapp').catch(() => null)
          deliveryFailures.push('WhatsApp')
        }
      }

      setOfferActionMessage(deliveryFailures.length
        ? `Secure offer link generated, but ${deliveryFailures.join(' and ')} delivery failed. Check the notification outbox before retrying.`
        : deliveryPlan.suppressed
          ? 'Secure offer link generated for the controlled test. External delivery was suppressed and recorded in the notification outbox.'
          : `Secure offer link sent via ${deliveryPlan.label}.`)
      setShowSendOfferLinkForm(false)
      setOfferInviteDraft({
        buyerLeadId: '',
        expiresInDays: 7,
        clientIntakePreference: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
        offerAmount: '',
        depositAmount: '',
        financeType: 'cash',
        specialConditions: '',
      })
      setOffersRefreshTick((value) => value + 1)
    } catch (error) {
      setOfferActionError(error?.message || 'Unable to generate offer link.')
    } finally {
      setSendingOfferLink(false)
    }
  }

  function handleCopyOfferLink(token) {
    if (!token) return
    if (OFFER_WORKFLOW_RETIRED) {
      setOfferActionError(OFFER_WORKFLOW_RETIRED_MESSAGE)
      return
    }
    const link = `${window.location.origin}/client/offer/${token}`
    navigator.clipboard.writeText(link).then(
      () => {
        setCopiedOfferToken(token)
        setTimeout(() => setCopiedOfferToken(''), 1800)
      },
      () => {
        setOfferActionError('Unable to copy offer link.')
      },
    )
  }

  function handleOfferAction(offerId, action) {
    setOfferActionError('')
    setOfferActionMessage('')
    if (OFFER_WORKFLOW_RETIRED) {
      setOfferActionError(OFFER_WORKFLOW_RETIRED_MESSAGE)
      return
    }
    try {
      const notes = String(offerNotesDraftById?.[offerId] || '').trim()
      markOfferAgentAction(offerId, action, notes)
      setOfferActionMessage('Offer updated successfully.')
      setOffersRefreshTick((value) => value + 1)
    } catch (error) {
      setOfferActionError(error?.message || 'Unable to update offer.')
    }
  }

  async function resolveSellerClientPortalInviteContext() {
    if (!listingRecord?.id) throw new Error('Listing is not available yet.')

    let token = resolveSellerPortalTokenFromListing(listingRecord)

    let sellerEmail = resolveSellerEmailFromListing(listingRecord)
    let sellerName = resolveSellerNameFromListing(listingRecord)
    let onboardingRow = null

    if (isSupabaseConfigured && supabase && (!token || !sellerEmail)) {
      let onboardingQuery = await supabase
        .from('private_listing_seller_onboarding')
        .select('token, seller_portal_token, status, form_data, updated_at')
        .eq('private_listing_id', listingRecord.id)
        .maybeSingle()

      if (
        onboardingQuery.error &&
        (
          ['PGRST204', '42703'].includes(String(onboardingQuery.error?.code || '').toUpperCase()) ||
          String(onboardingQuery.error?.message || '').includes('seller_portal_token')
        )
      ) {
        onboardingQuery = await supabase
          .from('private_listing_seller_onboarding')
          .select('token, status, form_data, updated_at')
          .eq('private_listing_id', listingRecord.id)
          .maybeSingle()
      }

      if (onboardingQuery.error && String(onboardingQuery.error?.code || '') !== '42P01') {
        throw onboardingQuery.error
      }

      onboardingRow = onboardingQuery.data || null
      const formData = onboardingRow?.form_data && typeof onboardingRow.form_data === 'object' ? onboardingRow.form_data : {}
      token = token || toCleanText(onboardingRow?.seller_portal_token || onboardingRow?.token)
      sellerEmail = sellerEmail || toCleanText(formData.sellerEmail || formData.email || formData.contactEmail).toLowerCase()
      sellerName = sellerName || toCleanText(
        [formData.sellerFirstName || formData.firstName, formData.sellerSurname || formData.lastName].filter(Boolean).join(' ') ||
          formData.sellerName ||
          formData.fullName,
      )
    }

    if (!token) {
      throw new Error('No seller client portal token is linked to this listing yet. Send seller onboarding first so Arch9 can create the portal link.')
    }
    if (!isValidEmail(sellerEmail)) {
      throw new Error('No seller email is linked to this listing yet. Add the seller email before resending the client portal link.')
    }

    const stablePortalToken = toCleanText(onboardingRow?.seller_portal_token || listingRecord?.sellerOnboarding?.sellerPortalToken || token)
    const portalLink = buildSellerClientPortalLink(stablePortalToken)
    if (!portalLink) throw new Error('Seller client portal link could not be built from the saved token.')

    if (onboardingRow) {
      const existingFormData = onboardingRow.form_data && typeof onboardingRow.form_data === 'object' ? onboardingRow.form_data : {}
      setPrivateListings((rows) => upsertListingRecord(rows, {
        ...listingRecord,
        sellerOnboarding: {
          ...(listingRecord?.sellerOnboarding || {}),
          token,
          sellerPortalToken: stablePortalToken,
          status: onboardingRow.status || listingRecord?.sellerOnboarding?.status,
          updatedAt: onboardingRow.updated_at || listingRecord?.sellerOnboarding?.updatedAt,
          link: listingRecord?.sellerOnboarding?.link || portalLink,
          clientPortalLink: portalLink,
          formData: {
            ...getListingSellerFormData(listingRecord),
            ...existingFormData,
          },
        },
      }))
    }

    return {
      token,
      stablePortalToken,
      portalLink,
      sellerEmail,
      sellerName: sellerName || 'Seller',
    }
  }

  async function handleResendSellerClientPortalLink() {
    setDetailError('')
    setDetailMessage('')
    try {
      setResendingSellerPortalLink(true)
      if (!isSupabaseConfigured) {
        throw new Error('Email sending requires Supabase to be configured.')
      }
      if (!resolveSellerPortalTokenFromListing(listingRecord)) {
        await handleSendSellerOnboardingFollowUp()
        return
      }
      const { token, stablePortalToken: savedStablePortalToken, sellerEmail, sellerName } = await resolveSellerClientPortalInviteContext()
      const invitation = await issueSellerPortalInvite(token)
      const stablePortalToken = toCleanText(invitation?.stablePortalToken || invitation?.stable_portal_token || savedStablePortalToken || token)
      const portalLink = buildSellerClientPortalLink(stablePortalToken || invitation?.inviteToken)
      if (!portalLink) throw new Error('Seller portal invitation could not be created.')
      const agent = getCanonicalOfferActor()
      const emailResponse = await invokeEdgeFunction('send-email', {
        body: {
          type: 'seller_portal_link',
          emailKind: 'portal_documents',
          to: sellerEmail,
          organisationId: listingOrganisationId,
          listingId: listingRecord?.id || '',
          recipientRole: 'seller',
          recipientName: sellerName,
          sellerName,
          propertyTitle: listingRecord?.listingTitle || listingRecord?.title || listingRecord?.propertyAddress || 'your property',
          propertyType: listingRecord?.propertyType || listingRecord?.property_type || '',
          onboardingLink: portalLink,
          portalLink,
          agentName: agent.name,
        },
      })
      if (emailResponse?.error || emailResponse?.data?.error) {
        throw emailResponse.error || new Error(emailResponse.data.error)
      }
      if (typeof navigator !== 'undefined') {
        void navigator.clipboard?.writeText(portalLink)
      }
      void getSellerPortalSecurityDiagnostics(token)
        .then((diagnostics) => setSellerPortalSecurityDiagnostics(diagnostics || null))
        .catch(() => null)
      setDetailMessage(`Seller client portal link resent to ${sellerEmail}. Link copied.`)
    } catch (error) {
      setDetailError(error?.message || 'Unable to resend the seller client portal link.')
    } finally {
      setResendingSellerPortalLink(false)
    }
  }

  async function handleResetSellerPortalPasswordAndResend() {
    setDetailError('')
    setDetailMessage('')
    try {
      setResettingSellerPortalPassword(true)
      const { token } = await resolveSellerClientPortalInviteContext()
      await resetSellerPortalPassword(token)
      setSellerPortalAccessState((previous) => ({
        ...(previous || {}),
        valid: true,
        passwordSet: false,
        passwordRequired: true,
        passwordSetAt: null,
        accessTokenExpiresAt: null,
      }))
      await handleResendSellerClientPortalLink()
      setDetailMessage('Seller portal password reset. A fresh portal link was sent so the seller can set a new password.')
    } catch (error) {
      setDetailError(error?.message || 'Unable to reset the seller portal password.')
    } finally {
      setResettingSellerPortalPassword(false)
    }
  }

  async function handleOpenSellerDocument(doc) {
    if (!doc?.uploaded) return
    setDetailError('')
    setOpeningSellerDocumentKey(doc.key)
    if (doc.generatedHtml) {
      try {
        await downloadGeneratedSellerDocumentPdf(
          doc.generatedHtml,
          doc.generatedFileName || doc.fileName || `${doc.key || 'seller-document'}.pdf`,
        )
      } catch (error) {
        setDetailError(error?.message || 'Unable to download this generated document.')
      } finally {
        setOpeningSellerDocumentKey('')
      }
      return
    }
    const pendingWindow = typeof window !== 'undefined' ? window.open('', '_blank') : null
    if (pendingWindow) pendingWindow.opener = null
    try {
      const filePath = String(doc.filePath || '').trim()
      const fallbackUrl = String(doc.url || '').trim()
      const isFinalSignedMandateArtifact =
        doc?.source?.document === 'document_packets.final_signed_artifact' ||
        doc?.source === 'document_packets.final_signed_artifact' ||
        (normalizeKey(doc.key).includes('mandate') && doc.packetId && doc.packetVersionId)
      const downloadUrl = isFinalSignedMandateArtifact && doc.packetId && doc.packetVersionId
        ? (await requestPersistedPdfAccess({
            packetId: doc.packetId,
            versionId: doc.packetVersionId,
            purpose: 'download',
          })).signedUrl
        : filePath
        ? await createPrivateListingDocumentDownloadUrl({
            listingId,
            filePath,
            expiresInSeconds: 300,
          })
        : fallbackUrl
      if (!downloadUrl) throw new Error('No downloadable file is linked to this document yet.')
      if (pendingWindow) {
        pendingWindow.location.href = downloadUrl
      } else if (typeof window !== 'undefined') {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      if (pendingWindow) pendingWindow.close()
      setDetailError(error?.message || 'Unable to open this document.')
    } finally {
      setOpeningSellerDocumentKey('')
    }
  }

  async function handleSellerDocumentReview({ item, document, action, reason }) {
    const actionKey = `${item?.key || item?.id}:${action}`
    setDetailError('')
    setDetailMessage('')
    setSellerDocumentWorkflowAction(actionKey)
    try {
      const result = await reviewSellerDocument({ document, action, reason })
      await loadListingData()
      const title = item?.title || item?.label || 'Seller document'
      const message = action === 'approve'
        ? `${title} approved. Assurance and transaction handoff will update automatically.`
        : action === 'reject'
          ? `${title} rejected. The seller replacement request and follow-up cadence were reopened automatically.`
          : `${title} is now marked under review.`
      setDetailMessage(result?.idempotent ? `${message} This action was already recorded.` : message)
      return true
    } catch (error) {
      setDetailError(error?.message || 'Unable to update the seller document review.')
      return false
    } finally {
      setSellerDocumentWorkflowAction('')
    }
  }

  async function handleSellerDocumentReminder({ item, requirementId }) {
    const actionKey = `${item?.key || item?.id}:remind`
    setDetailError('')
    setDetailMessage('')
    setSellerDocumentWorkflowAction(actionKey)
    try {
      const result = await sendSellerDocumentManualReminder({ requirementId })
      await loadListingData()
      setDetailMessage(
        result?.idempotent
          ? 'A reminder for this document was already queued today; no duplicate was sent.'
          : `Reminder queued for ${item?.title || item?.label || 'the outstanding seller document'}.`,
      )
      return true
    } catch (error) {
      setDetailError(error?.message || 'Unable to send the seller document reminder.')
      return false
    } finally {
      setSellerDocumentWorkflowAction('')
    }
  }

  function openSellerWorkspaceSection(tab, message = '') {
    const normalizedTab = tab === 'offers' ? 'leads' : tab === 'listing' ? 'marketing' : tab
    if (!SELLER_WORKSPACE_TABS.some((item) => item.key === normalizedTab)) return
    setPropertyDetailsReturnTarget('')
    setActiveTab('seller')
    setSellerWorkspaceTab((currentTab) => (currentTab === normalizedTab ? currentTab : normalizedTab))
    setDetailError('')
    if (message) setDetailMessage(message)
    if (typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.set('tab', normalizedTab)
      window.history.replaceState(window.history.state, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
    }
  }

  function openPropertyDetailsFromMarketing() {
    const targetListingId = encodeURIComponent(String(listingRecord?.id || listingId || '').trim())
    if (!targetListingId) {
      setDetailError('Unable to open the listing editor because this listing is missing an id.')
      return
    }
    navigate(`/listings/${targetListingId}/edit?step=property`)
  }

  function openDetailTab(tab) {
    setPropertyDetailsReturnTarget('')
    setActiveTab(tab)
  }

  function openSalesListingWorkspaceTab(tab) {
    const target = resolveSalesListingWorkspaceTarget(tab)
    setPropertyDetailsReturnTarget('')
    setDetailError('')

    if (target.sellerWorkspaceTab) {
      openSellerWorkspaceSection(target.sellerWorkspaceTab)
    } else {
      setActiveTab(target.activeTab || 'overview')
    }

    if (target.openProperty24Manage) {
      setProperty24ManageOpen(true)
    }
  }

  function handleSalesPortalReadinessAction(item) {
    if (item?.actionTarget === 'property24') {
      openSalesListingWorkspaceTab('syndication')
      return
    }
    openSellerWorkspaceSection('marketing')
  }

  function handleSalesPortalFixGuideAction(item) {
    const target = item?.actionTarget || 'marketing'
    if (salesWorkspaceTabs.some((tab) => tab.key === target)) {
      openSalesListingWorkspaceTab(target)
      return
    }
    handleSalesPortalReadinessAction(item)
  }

  function returnToMarketingConsole() {
    openSellerWorkspaceSection('marketing')
  }

  function handleExportListingLeads() {
    const headers = ['Lead', 'Phone', 'Email', 'Source', 'Status', 'Contacted', 'Viewing', 'Offer', 'Date Added']
    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = filteredListingLeadRows.map((lead) => {
      const viewing = lead.viewing
        ? [formatDate(lead.viewing.proposed_date), lead.viewing.proposed_time, formatViewingStatusLabel(lead.viewing.status)].filter(Boolean).join(' ')
        : ''
      const offer = lead.offer
        ? [lead.offer.offerPrice ? formatMoneyValue(lead.offer.offerPrice) : '', formatStatusLabel(lead.offer.status)].filter(Boolean).join(' ')
        : ''
      return [
        lead.name,
        lead.phone,
        lead.email,
        lead.sourceLabel,
        lead.statusLabel,
        lead.contactedAt ? `${formatOverviewTimestamp(lead.contactedAt)}${lead.contactedBy ? ` by ${lead.contactedBy}` : ''}` : '',
        viewing,
        offer,
        formatDate(lead.createdAt),
      ].map(escapeCsv).join(',')
    })
    const csv = [headers.map(escapeCsv).join(','), ...rows].join('\n')
    const fileName = `${sanitizeFileName(listingIdentity.title || 'listing')}-leads.csv`
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName)
  }

  function handleContactListingLead(lead = {}) {
    if (lead.leadId) {
      navigate(`/pipeline/leads/${lead.leadId}`)
      return
    }
    if (lead.email && typeof window !== 'undefined') {
      window.location.href = `mailto:${lead.email}`
      return
    }
    if (lead.phone && typeof window !== 'undefined') {
      window.location.href = `tel:${lead.phone}`
    }
  }

  async function handleSendSellerOnboardingFollowUp() {
    if (!listingRecord?.id) return
    setDetailError('')
    setDetailMessage('')
    const sellerEmail = resolveSellerEmailFromListing(listingRecord)
    const sellerPhone = resolveSellerPhoneFromListing(listingRecord)
    const hasSellerContact = isValidEmail(sellerEmail) || Boolean(formatSouthAfricanWhatsAppNumber(sellerPhone))
    const selectedNotificationPlan = resolveNotificationDispatchPlan({
      mode: sellerNotificationMode,
      email: sellerEmail,
      phone: formatSouthAfricanWhatsAppNumber(sellerPhone),
      recipientName: resolveSellerNameFromListing(listingRecord),
    })
    const existingOnboardingLink = String(listingRecord?.sellerOnboarding?.link || '').trim()
    if (isSupabaseConfigured) {
      const sellerOnboardingIntegrity = assessSellerOnboardingIntegrity({
        organisationId: listingOrganisationId,
        listing: listingRecord,
      })
      if (!sellerOnboardingIntegrity.ok) {
        setDetailError(sellerOnboardingIntegrity.message)
        return
      }
    }
    if (!hasSellerContact) {
      if (existingOnboardingLink) {
        if (typeof navigator !== 'undefined') {
          void navigator.clipboard?.writeText(existingOnboardingLink)
        }
        setDetailMessage('Seller onboarding link copied. Add seller contact details before sending it directly.')
        return
      }
      openSellerWorkspaceSection('seller', 'Add a seller email or phone number before sending the onboarding link.')
      return
    }
    if (selectedNotificationPlan.blockers.length) {
      setDetailError(selectedNotificationPlan.blockers.join(' '))
      return
    }

    try {
      setFollowUpActionId('send_onboarding')
      const token = isSupabaseConfigured && isUuidLike(listingRecord.id)
        ? ''
        : generateSellerOnboardingToken()
      const localLink = token ? buildSellerOnboardingLink(token) : ''
      const response = isSupabaseConfigured && isUuidLike(listingRecord.id)
        ? await sendSellerOnboarding(listingRecord.id, {
            sellerType: sellerFormData?.sellerType || listingRecord?.sellerType || listingRecord?.seller?.sellerType || null,
            ownershipStructure: sellerFormData?.ownershipStructure || sellerFormData?.ownershipType || null,
            maritalRegime: sellerFormData?.maritalRegime || sellerFormData?.maritalStatus || null,
            sellerContactEmail: sellerEmail,
            sellerContactPhone: sellerPhone,
          })
        : { token, link: localLink, expiresAt: '' }
      const onboardingToken = response?.token || token
      const onboardingLink = response?.link || localLink
      const sentAt = new Date().toISOString()
      const currentStatus = normalizeKey(listingRecord?.listingStatus || listingRecord?.status || '')
      const nextListingStatus = currentStatus === 'seller_lead' ? 'onboarding_sent' : listingRecord?.listingStatus || listingRecord?.status

      const localListing = patchListing((row) => ({
        ...row,
        listingStatus: nextListingStatus,
        status: nextListingStatus || row?.status,
        sellerOnboardingStatus: 'sent',
        seller_onboarding_status: 'sent',
        sellerOnboarding: {
          ...(row?.sellerOnboarding || {}),
          token: onboardingToken,
          link: onboardingLink,
          status: 'sent',
          sentAt,
          expiresAt: response?.expiresAt || row?.sellerOnboarding?.expiresAt || '',
          formData: {
            ...((row?.sellerOnboarding?.formData && typeof row.sellerOnboarding.formData === 'object') ? row.sellerOnboarding.formData : {}),
            sellerEmail: sellerEmail || row?.sellerOnboarding?.formData?.sellerEmail || '',
            sellerPhone: sellerPhone || row?.sellerOnboarding?.formData?.sellerPhone || '',
          },
        },
        updatedAt: sentAt,
      }))

      if (isSupabaseConfigured && isUuidLike(listingRecord.id)) {
        await updatePrivateListing(listingRecord.id, { sellerOnboardingStatus: 'sent' }, { includeRequirementsAndDocuments: false }).catch((error) => {
          console.warn('[AgentListingDetail] seller onboarding listing status sync skipped', error)
        })
      }

      let deliveryWarning = ''
      const sellerDisplayName = resolveSellerNameFromListing(localListing || listingRecord) || 'Seller'
      const propertyLabel = listingRecord?.propertyAddress || marketingDraft.addressLine1 || listingRecord?.listingTitle || listingRecord?.title || 'your property'
      const agentDisplayName = getCanonicalOfferActor().name || 'your agent'
      if (isSupabaseConfigured && onboardingLink) {
        let outboxItems = []
        try {
          const prepared = await prepareNotificationOutbox({
            organisationId: listingOrganisationId,
            branchId: listingActor.branchId,
            assignedUserId: listingActor.id,
            leadId: sellerLeadId,
            listingId: listingRecord.id,
            communicationType: 'seller_onboarding_link',
            notificationMode: selectedNotificationPlan.mode,
            recipientName: sellerDisplayName,
            recipientRole: 'seller',
            email: sellerEmail,
            phone: formatSouthAfricanWhatsAppNumber(sellerPhone),
            subject: `Seller onboarding: ${propertyLabel}`,
            message: `Seller onboarding link prepared for ${sellerDisplayName}.`,
            dedupeKey: `seller-onboarding:${listingRecord.id}:${onboardingToken}`,
            metadata: { onboardingLink, listingReference: listingRecord?.listingReference || '' },
          })
          outboxItems = prepared.items || []
        } catch (error) {
          console.warn('[AgentListingDetail] seller onboarding outbox preparation failed', error)
          deliveryWarning = ' Delivery was sent, but could not be recorded in the outbox.'
        }

        const updateOutboxItem = async (channel, status, errorMessage = '', provider = '') => {
          const item = outboxItems.find((entry) => entry.channel === channel)
          if (!item?.id) return
          await updateNotificationOutboxStatus({ eventId: item.id, status, errorMessage, provider }).catch((error) => {
            console.warn('[AgentListingDetail] seller onboarding outbox status update failed', error)
          })
        }

        if (selectedNotificationPlan.handoffRequired) {
          deliveryWarning = `${deliveryWarning} Delivery is prepared for agent handoff; no external message was sent.`
        }
        if (selectedNotificationPlan.suppressed) {
          deliveryWarning = `${deliveryWarning} Controlled test recipient: external delivery was suppressed and recorded in the notification outbox.`
        }
        if (selectedNotificationPlan.channels.includes('email') && isValidEmail(sellerEmail)) {
          try {
            const emailResponse = await invokeEdgeFunction('send-email', {
              body: {
                type: 'seller_onboarding_link',
                to: sellerEmail,
                organisationId: listingOrganisationId,
                sellerName: sellerDisplayName,
                propertyTitle: propertyLabel,
                propertyType: listingRecord?.propertyType || marketingDraft.propertyType || '',
                transactionReference: listingRecord?.listingCode || listingRecord?.listingReference || '',
                onboardingLink,
                onboardingUrl: onboardingLink,
                expiresAt: response?.expiresAt || '',
                agentName: agentDisplayName,
                agentEmail: getCanonicalOfferActor().email,
              },
            })
            if (emailResponse?.error || emailResponse?.data?.error) {
              await updateOutboxItem('email', 'failed', 'Email delivery needs attention.', 'resend')
              deliveryWarning = `${deliveryWarning} Email delivery needs attention.`
            } else {
              await updateOutboxItem('email', 'sent', '', 'resend')
            }
          } catch (error) {
            console.warn('[AgentListingDetail] seller onboarding email failed', error)
            await updateOutboxItem('email', 'failed', error?.message || 'Email delivery needs attention.', 'resend')
            deliveryWarning = `${deliveryWarning} Email delivery needs attention.`
          }
        }
        const normalizedSellerPhone = formatSouthAfricanWhatsAppNumber(sellerPhone)
        if (selectedNotificationPlan.channels.includes('whatsapp') && normalizedSellerPhone) {
          try {
            const whatsappResult = await sendWhatsAppNotification({
              to: normalizedSellerPhone,
              role: 'seller',
              message: `Hi ${sellerDisplayName},\n\nYour agent has started your seller onboarding for ${propertyLabel}.\n\nPlease complete your onboarding here:\n${onboardingLink}\n\nAgent: ${agentDisplayName}\n\n- Arch9`,
            })
            if (!whatsappResult?.ok) {
              await updateOutboxItem('whatsapp', 'failed', 'WhatsApp delivery needs attention.', 'meta')
              deliveryWarning = `${deliveryWarning} WhatsApp delivery needs attention.`
            } else {
              await updateOutboxItem('whatsapp', 'sent', '', 'meta')
            }
          } catch (error) {
            console.warn('[AgentListingDetail] seller onboarding WhatsApp failed', error)
            await updateOutboxItem('whatsapp', 'failed', error?.message || 'WhatsApp delivery needs attention.', 'meta')
            deliveryWarning = `${deliveryWarning} WhatsApp delivery needs attention.`
          }
        }
        await refreshSellerNotificationDelivery()
      }

      if (onboardingLink && typeof navigator !== 'undefined') {
        void navigator.clipboard?.writeText(onboardingLink)
      }
      setDetailMessage(
        onboardingLink
          ? `Seller onboarding link ready and copied.${deliveryWarning || ''}`
          : `Seller onboarding was marked as sent.${deliveryWarning || ''}`,
      )
    } catch (error) {
      setDetailError(error?.message || 'Unable to create the seller onboarding link.')
    } finally {
      setFollowUpActionId('')
    }
  }

  async function handleGenerateMandateFollowUp({ silent = false } = {}) {
    if (!listingRecord?.id) return
    setDetailError('')
    if (!silent) setDetailMessage('')
    try {
      setFollowUpActionId('generate_mandate')
      const preparedAt = new Date().toISOString()
      const localListing = patchListing((row) => ({
        ...row,
        mandateStatus: 'ready',
        mandate: {
          ...(row?.mandate || {}),
          status: 'ready',
          preparedAt,
          updatedAt: preparedAt,
          preparedBy: String(profile?.id || profile?.email || 'agent').trim(),
        },
        updatedAt: preparedAt,
      }))
      if (isSupabaseConfigured && isUuidLike(listingRecord.id)) {
        const savedListing = await updatePrivateListing(listingRecord.id, { mandateStatus: 'ready' }, { includeRequirementsAndDocuments: false })
        if (savedListing?.id) {
          setPrivateListings((rows) => upsertListingRecord(rows, mergeListingRecord(localListing, savedListing)))
        }
      }
      if (!silent) {
        setDetailMessage('Mandate marked ready for generation. Complete seller facts and commission before sending it out.')
      }
    } catch (error) {
      setDetailError(error?.message || 'Unable to prepare the mandate.')
    } finally {
      setFollowUpActionId('')
    }
  }

  async function handleStartListingMandateDocument(selection = {}) {
    if (!listingRecord?.id) return
    if (listingKingstonsDigitalSigningDecision.blocked) {
      setMandateStartOpen(false)
      openSellerWorkspaceSection('documents')
      return
    }
    const sourceMode = selection?.sourceMode || DOCUMENT_START_SOURCE_MODES.saved
    setDetailError('')
    setDetailMessage('')
    setMandateStartOpen(false)

    if (sourceMode === DOCUMENT_START_SOURCE_MODES.onboarding) {
      await handleSendSellerOnboardingFollowUp()
      return
    }

    await handleGenerateMandateFollowUp({ silent: true })

    const params = new URLSearchParams()
    const sellerLeadId = resolveSellerLeadIdFromListing(listingRecord)
    if (sellerLeadId) params.set('leadId', sellerLeadId)
    params.set('mode', 'generate')
    params.set('sourceMode', sourceMode)
    params.set('documentStart', DOCUMENT_START_ENTRY_POINTS.listingMandate)
    params.set('listingId', String(listingRecord.id))
    appendDocumentStartLegalScenarioParams(params, selection?.legalScenario || {}, 'mandate')
    params.set('returnTo', `/agent/listings/${encodeURIComponent(String(listingRecord.id))}?tab=seller`)

    navigate(`/agent/listings/${encodeURIComponent(String(listingRecord.id))}/legal/mandate?${params.toString()}`)
  }

  function getCanonicalOfferActor() {
    return {
      id: String(profile?.id || listingRecord?.agentId || '').trim(),
      name: String(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || listingRecord?.assignedAgentName || listingRecord?.assignedAgent || 'Agent').trim(),
      email: String(profile?.email || listingRecord?.assignedAgentEmail || '').trim(),
    }
  }

  function buildCanonicalListingOfferPatch(offerRow, actionLabel, note = '') {
    const canonicalOffer = canonicalListingOffers.find((offer) => String(offer.id) === String(offerRow?.canonicalOfferId || ''))
    const conditions = canonicalOffer?.conditions || {}
    const trimmedNote = String(note || '').trim()
    return {
      conditions_json: {
        ...conditions,
        agentActionHistory: [
          ...(Array.isArray(conditions.agentActionHistory) ? conditions.agentActionHistory : []),
          {
            action: actionLabel,
            note: trimmedNote,
            at: new Date().toISOString(),
            actorId: getCanonicalOfferActor().id,
            actorName: getCanonicalOfferActor().name,
          },
        ],
        latestAgentNote: trimmedNote || conditions.latestAgentNote || '',
      },
    }
  }

  function getSellerReviewDeliveryModeForOffer(offerId, sellerContact = {}) {
    return normalizeSellerReviewDeliveryMode(
      sellerReviewDeliveryModeByOfferId?.[offerId],
      { sellerEmail: sellerContact.email, sellerPhone: sellerContact.phone },
    )
  }

  function buildListingSellerReviewPreparation(offerRow, offer = canonicalListingOffers.find((item) => String(item.id) === String(offerRow?.canonicalOfferId || ''))) {
    const sellerContact = {
      email: resolveSellerEmailFromListing(listingRecord),
      phone: resolveSellerPhoneFromListing(listingRecord),
      name: resolveSellerNameFromListing(listingRecord),
    }
    const deliveryMode = getSellerReviewDeliveryModeForOffer(offerRow?.id, sellerContact)
    return buildSellerOfferReviewPreparation({
      listing: listingRecord,
      offer,
      deliveryMode,
      sellerEmail: sellerContact.email,
      sellerPhone: sellerContact.phone,
      sellerName: sellerContact.name,
      sellerLeadId: offer?.sellerLeadId || listingRecord?.sellerLeadId || listingRecord?.leadId,
      sellerContactId: offer?.sellerContactId || listingRecord?.sellerContactId,
    })
  }

  async function handleCanonicalListingOfferStatus(offerRow, nextStatus, actionLabel) {
    if (!listingOrganisationId || !offerRow?.canonicalOfferId) return
    const note = offerNotesDraftById?.[offerRow.id] || ''
    setOfferActionError('')
    setOfferActionMessage('')
    if (OFFER_WORKFLOW_RETIRED) {
      setOfferActionError(OFFER_WORKFLOW_RETIRED_MESSAGE)
      return
    }
    try {
      setCanonicalOfferActionId(`${offerRow.id}:${nextStatus}`)
      await updateCanonicalOfferStatus(offerRow.canonicalOfferId, nextStatus, {
        organisationId: listingOrganisationId,
        actor: getCanonicalOfferActor(),
        patch: buildCanonicalListingOfferPatch(offerRow, actionLabel || nextStatus, note),
      })
      setOfferNotesDraftById((previous) => ({ ...previous, [offerRow.id]: '' }))
      setOfferActionMessage(`Canonical offer moved to ${nextStatus.replaceAll('_', ' ')}.`)
      setOffersRefreshTick((value) => value + 1)
    } catch (error) {
      setOfferActionError(error?.message || 'Unable to update canonical offer.')
    } finally {
      setCanonicalOfferActionId('')
    }
  }

  async function handleCanonicalListingOfferSendToSeller(offerRow) {
    if (!listingOrganisationId || !offerRow?.canonicalOfferId || !listingRecord) return
    const canonicalOffer = canonicalListingOffers.find((offer) => String(offer.id) === String(offerRow.canonicalOfferId))
    const note = offerNotesDraftById?.[offerRow.id] || ''
    let createdReviewSession = null
    setOfferActionError('')
    setOfferActionMessage('')
    if (OFFER_WORKFLOW_RETIRED) {
      setOfferActionError(OFFER_WORKFLOW_RETIRED_MESSAGE)
      return
    }
    try {
      setCanonicalOfferActionId(`${offerRow.id}:sent_to_seller`)
      const reviewPreparation = buildListingSellerReviewPreparation(offerRow, canonicalOffer)
      const sellerEmail = reviewPreparation.sellerEmail
      const sellerPhone = reviewPreparation.sellerPhone
      const sellerName = reviewPreparation.sellerName || 'Seller'
      const { session } = await createOfferSellerReviewSession({
        organisationId: listingOrganisationId,
        offerId: offerRow.canonicalOfferId,
        offer: canonicalOffer,
        listing: listingRecord,
        listingId: listingRecord.id,
        sellerLeadId: reviewPreparation.sellerLeadId,
        sellerContactId: reviewPreparation.sellerContactId,
        sellerEmail,
        sellerName,
        sellerPhone,
        deliveryMode: reviewPreparation.deliveryMode,
        agentId: getCanonicalOfferActor().id,
        agentReviewNotes: note,
        metadata: {
          source: 'listing_offer_review',
          listingId: listingRecord.id,
          sellerEmail,
          sellerName,
          sellerPhone,
        },
      }, {
        actor: getCanonicalOfferActor(),
      })
      createdReviewSession = session
      const reviewLink = session?.token && typeof window !== 'undefined'
        ? `${window.location.origin}/seller/offers/review/${encodeURIComponent(session.token)}`
        : ''
      if (reviewLink && typeof navigator !== 'undefined') {
        void navigator.clipboard?.writeText(reviewLink)
      }
      if (reviewPreparation.deliveryMode === SELLER_REVIEW_DELIVERY_MODE.EMAIL) {
        const emailResponse = await invokeEdgeFunction('send-email', {
          body: {
            type: 'seller_offer_review',
            to: sellerEmail,
            sellerName,
            propertyTitle: listingRecord?.listingTitle || listingRecord?.title || listingRecord?.propertyAddress || 'your property',
            buyerName: offerRow.buyerName || canonicalOffer?.conditions?.buyerName || 'Buyer',
            offerAmount: formatCurrency(offerRow.offerPrice || canonicalOffer?.offerAmount),
            reviewLink,
            expiresAt: session?.expiresAt || '',
            agentName: getCanonicalOfferActor().name,
            note,
          },
        })
        if (emailResponse?.error || emailResponse?.data?.error) {
          throw emailResponse.error || new Error(emailResponse.data.error)
        }
      }
      setOfferNotesDraftById((previous) => ({ ...previous, [offerRow.id]: '' }))
      setOfferActionMessage(
        reviewPreparation.deliveryMode === SELLER_REVIEW_DELIVERY_MODE.EMAIL
          ? reviewLink
            ? `Offer emailed to ${sellerEmail}. Seller link copied.`
            : `Offer emailed to ${sellerEmail}.`
          : reviewLink
            ? `Seller review prepared for ${reviewPreparation.deliveryModeLabel.toLowerCase()}. Review link copied for the agent handoff.`
            : `Seller review prepared for ${reviewPreparation.deliveryModeLabel.toLowerCase()}.`,
      )
      setOffersRefreshTick((value) => value + 1)
    } catch (error) {
      if (createdReviewSession?.id) {
        await updateCanonicalOfferStatus(offerRow.canonicalOfferId, 'agent_review', {
          organisationId: listingOrganisationId,
          actor: getCanonicalOfferActor(),
          patch: {
            conditions_json: {
              ...(canonicalOffer?.conditions || {}),
              latestAgentNote: error?.message || 'Seller email failed after review link creation.',
              agentActionHistory: [
                ...(Array.isArray(canonicalOffer?.conditions?.agentActionHistory) ? canonicalOffer.conditions.agentActionHistory : []),
                {
                  action: 'Seller email failed',
                  note: error?.message || 'Seller email failed after review link creation.',
                  at: new Date().toISOString(),
                  actorId: getCanonicalOfferActor().id,
                  actorName: getCanonicalOfferActor().name,
                },
              ],
            },
          },
        }).catch(() => null)
        setOffersRefreshTick((value) => value + 1)
      }
      setOfferActionError(error?.message || 'Unable to send this offer to seller review.')
    } finally {
      setCanonicalOfferActionId('')
    }
  }

  async function handleCanonicalListingOfferConversion(offerRow) {
    if (!listingOrganisationId || !offerRow?.canonicalOfferId || !listingRecord) return
    const canonicalOffer = canonicalListingOffers.find((offer) => String(offer.id) === String(offerRow.canonicalOfferId))
    const linkedLead = listingLeads.find((lead) =>
      String(lead?.leadId || lead?.id || '') === String(offerRow?.buyerLeadId || canonicalOffer?.buyerLeadId || ''),
    )
    const note = offerNotesDraftById?.[offerRow.id] || ''
    setOfferActionError('')
    setOfferActionMessage('')
    if (OFFER_WORKFLOW_RETIRED) {
      setOfferActionError(OFFER_WORKFLOW_RETIRED_MESSAGE)
      return
    }
    try {
      setCanonicalOfferActionId(`${offerRow.id}:convert`)
      const currentStatus = normalizeOfferWorkflowStatus(canonicalOffer?.status || offerRow.status)
      const kingstonsBuyerOtpReadiness = offerRow.kingstonsBuyerOtpReadiness || buildKingstonsBuyerOtpReadiness({
        documents: [
          canonicalOffer?.conditions?.kingstonsBuyerOtp,
          canonicalOffer?.conditions?.signedOtpDocument,
        ].filter(Boolean),
      })
      if (listingHasKingstonsSellerProcess && kingstonsBuyerOtpReadiness?.gate?.offerConversionReady !== true) {
        throw new Error(kingstonsBuyerOtpReadiness?.gate?.reason || 'Upload the manually signed OTP before converting this Kingston buyer offer.')
      }
      const acceptedOffer = [
          OFFER_WORKFLOW_STATUS.ACCEPTED,
          OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION,
        ].includes(currentStatus)
        ? canonicalOffer
        : await updateCanonicalOfferStatus(offerRow.canonicalOfferId, 'accepted', {
            organisationId: listingOrganisationId,
            actor: getCanonicalOfferActor(),
            patch: buildCanonicalListingOfferPatch(offerRow, 'Accepted for transaction conversion', note),
          })
      const conversionLead = {
        ...(linkedLead || {}),
        leadId: linkedLead?.leadId || acceptedOffer?.buyerLeadId || canonicalOffer?.buyerLeadId,
        contactId: linkedLead?.contactId || acceptedOffer?.buyerContactId || canonicalOffer?.buyerContactId,
        email: linkedLead?.email || acceptedOffer?.conditions?.buyerEmail || canonicalOffer?.conditions?.buyerEmail,
        phone: linkedLead?.phone || acceptedOffer?.conditions?.buyerPhone || canonicalOffer?.conditions?.buyerPhone,
        firstName: linkedLead?.firstName || acceptedOffer?.conditions?.buyerName || canonicalOffer?.conditions?.buyerName,
        budget: acceptedOffer?.offerAmount || canonicalOffer?.offerAmount,
        assignedAgentId: getCanonicalOfferActor().id,
        assignedAgentName: getCanonicalOfferActor().name,
        assignedAgentEmail: getCanonicalOfferActor().email,
      }
      const conversionRoutingProfile = resolveTransactionRoutingProfile({
        transaction: {
          financeType: normalizeText(
            acceptedOffer?.financeType ||
              acceptedOffer?.finance_type ||
              acceptedOffer?.conditions?.financeType ||
              canonicalOffer?.financeType ||
              canonicalOffer?.finance_type ||
              canonicalOffer?.conditions?.financeType ||
              linkedLead?.financeType ||
              linkedLead?.preferredFinanceType ||
              linkedLead?.finance_type,
          ),
          purchaserType: normalizeText(
            acceptedOffer?.conditions?.buyerType ||
              acceptedOffer?.conditions?.purchaserType ||
              canonicalOffer?.conditions?.buyerType ||
              canonicalOffer?.conditions?.purchaserType ||
              linkedLead?.buyerType ||
              linkedLead?.purchaserType ||
              'individual',
          ),
          buyerEntityType: normalizeText(
            acceptedOffer?.conditions?.buyerType ||
              acceptedOffer?.conditions?.purchaserType ||
              canonicalOffer?.conditions?.buyerType ||
              canonicalOffer?.conditions?.purchaserType ||
              linkedLead?.buyerType ||
              linkedLead?.purchaserType ||
              'individual',
          ),
          purchasePrice: acceptedOffer?.offerAmount || canonicalOffer?.offerAmount,
        },
        listing: listingRecord || {},
        offer: acceptedOffer || canonicalOffer,
        buyerLead: conversionLead,
        sellerOnboarding: listingRecord?.sellerOnboarding || listingRecord?.seller_onboarding,
      })
      const conversionPreflight = buildAcceptedOfferConversionPreflight({
        organisationId: listingOrganisationId,
        offer: acceptedOffer || canonicalOffer,
        lead: conversionLead,
        listing: listingRecord || {},
        actor: { id: getCanonicalOfferActor().id, email: getCanonicalOfferActor().email },
        routingProfile: conversionRoutingProfile,
        allowIncompleteRoutingFacts: true,
      })
      if (!conversionPreflight.canConvert) {
        const error = new Error(formatAcceptedOfferConversionPreflightMessage(conversionPreflight))
        error.code = 'ACCEPTED_OFFER_CONVERSION_PREFLIGHT_BLOCKED'
        error.details = conversionPreflight
        throw error
      }
      const createdTransaction = await createTransactionFromAcceptedCanonicalOffer({
        organisationId: listingOrganisationId,
        offerId: offerRow.canonicalOfferId,
        offer: acceptedOffer || canonicalOffer,
        lead: conversionLead,
        listing: listingRecord,
        actor: getCanonicalOfferActor(),
        payload: {
          listingId: listingRecord.id,
          creationMode: 'onboarding_capture',
          allowIncompleteRoutingFacts: true,
          buyerName: offerRow.buyerName,
          buyerEmail: linkedLead?.email || acceptedOffer?.conditions?.buyerEmail || canonicalOffer?.conditions?.buyerEmail,
          buyerPhone: linkedLead?.phone || acceptedOffer?.conditions?.buyerPhone || canonicalOffer?.conditions?.buyerPhone,
          clientIntakePreference: normalizeClientIntakePreference(
            acceptedOffer?.conditions?.clientIntakePreference ||
              acceptedOffer?.conditions?.deliveryMode ||
              canonicalOffer?.conditions?.clientIntakePreference ||
              canonicalOffer?.conditions?.deliveryMode ||
              linkedLead?.clientIntakePreference ||
              offerInviteDraft.clientIntakePreference,
          ),
        },
      })
      const transactionId = String(createdTransaction?.transactionId || createdTransaction?.transactionRow?.transaction?.id || '').trim()
      const reusedTransaction = Boolean(createdTransaction?.alreadyConverted || (createdTransaction?.existing && transactionId))
      let sellerPackPromotionError = ''
      let buyerOtpPromotionError = ''
      const intakePreference = normalizeClientIntakePreference(
        acceptedOffer?.conditions?.clientIntakePreference ||
          acceptedOffer?.conditions?.deliveryMode ||
          canonicalOffer?.conditions?.clientIntakePreference ||
          canonicalOffer?.conditions?.deliveryMode ||
          linkedLead?.clientIntakePreference ||
          offerInviteDraft.clientIntakePreference,
      )
      const intakeLabel = getClientIntakePreferenceLabel(intakePreference)
      if (transactionId) {
        await recordBuyerLeadActivity({
          organisationId: listingOrganisationId,
          leadId: acceptedOffer?.buyerLeadId || canonicalOffer?.buyerLeadId || linkedLead?.leadId,
          activityType: reusedTransaction ? 'Buyer Onboarding Prepared' : 'Transaction Created',
          activityNote: `${reusedTransaction ? 'Existing transaction reopened' : 'Transaction created'} for ${intakeLabel}. Confirm the preferred bond originator before sending buyer onboarding.`,
          outcome: 'Roleplayer Confirmation Required',
          actor: getCanonicalOfferActor(),
        }).catch(() => null)
      }
      if (transactionId && listingRecord?.id && listingHasKingstonsSellerProcess) {
        const handoffResult = await runKingstonsSellerPackTransactionHandoff({
          listingId: listingRecord.id,
          transactionId,
          source: KINGSTONS_SELLER_PACK_TRANSACTION_HANDOFF_SOURCE,
        })
        sellerPackPromotionError = handoffResult.error
        const buyerOtpHandoffResult = await runKingstonsBuyerOtpTransactionHandoff({
          listingId: listingRecord.id,
          transactionId,
          offer: { ...offerRow, kingstonsBuyerOtpReadiness },
          source: KINGSTONS_BUYER_OTP_TRANSACTION_HANDOFF_SOURCE,
        })
        buyerOtpPromotionError = buyerOtpHandoffResult.error
      }
      setOfferNotesDraftById((previous) => ({ ...previous, [offerRow.id]: '' }))
      setOfferActionMessage(
        listingHasKingstonsSellerProcess
          ? sellerPackPromotionError || buyerOtpPromotionError
            ? buyerOtpPromotionError
              ? 'Transaction ready. Signed OTP handoff needs attention before transaction document readiness.'
              : 'Transaction ready. Seller Pack document handoff needs attention before attorney handoff.'
            : 'Transaction ready. Seller Pack documents were queued for transaction handoff. Signed OTP was queued for transaction handoff. Confirm the preferred bond originator before sending buyer onboarding.'
          : 'Transaction ready. Confirm the preferred bond originator before sending buyer onboarding.',
      )
      setOffersRefreshTick((value) => value + 1)
      if (transactionId) {
        navigate(`/transactions/${transactionId}`, {
          state: { openBuyerOnboardingRoleplayers: true },
        })
      }
    } catch (error) {
      setOfferActionError(error?.message || 'Unable to create a transaction from this offer.')
    } finally {
      setCanonicalOfferActionId('')
    }
  }

  async function runKingstonsSellerPackTransactionHandoff({
    listingId = listingRecord?.id,
    transactionId = '',
    source = KINGSTONS_SELLER_PACK_TRANSACTION_HANDOFF_SOURCE,
  } = {}) {
    if (!listingHasKingstonsSellerProcess) return { skipped: true, reason: 'not_kingstons_listing', error: '' }
    if (!listingId || !transactionId || !isSupabaseConfigured) {
      return {
        skipped: true,
        reason: 'missing_live_transaction_context',
        error: 'Seller Pack document handoff could not be completed.',
      }
    }
    try {
      const queued = await markPrivateListingDocumentsPendingTransactionPromotion(listingId, {
        requirementKeys: SELLER_PACK_TRANSACTION_REQUIREMENT_KEYS,
        source,
      })
      const repair = await repairSellerDocumentTransactionContinuity({ listingId })
      return {
        skipped: false,
        error: '',
        source,
        listingId,
        transactionId,
        queued,
        repair,
      }
    } catch (promotionError) {
      console.warn('[AgentListingDetail] Seller Pack transaction continuity repair skipped.', promotionError)
      return {
        skipped: false,
        error: promotionError?.message || 'Seller Pack document handoff could not be completed.',
        source,
        listingId,
        transactionId,
      }
    }
  }

  async function runKingstonsBuyerOtpTransactionHandoff({
    listingId = listingRecord?.id,
    transactionId = '',
    offer = {},
    source = KINGSTONS_BUYER_OTP_TRANSACTION_HANDOFF_SOURCE,
  } = {}) {
    if (!listingHasKingstonsSellerProcess) return { skipped: true, reason: 'not_kingstons_listing', error: '' }
    if (!listingId || !transactionId || !isSupabaseConfigured) {
      return {
        skipped: true,
        reason: 'missing_live_transaction_context',
        error: 'Signed OTP handoff could not be completed.',
      }
    }

    const readiness = offer?.kingstonsBuyerOtpReadiness || buildKingstonsBuyerOtpReadiness({
      documents: [
        offer?.kingstonsBuyerOtp,
        offer?.signedOtpDocument,
        offer?.conditions?.kingstonsBuyerOtp,
        offer?.conditions?.signedOtpDocument,
      ].filter(Boolean),
    })
    if (readiness?.gate?.transactionHandoffReady !== true) {
      return {
        skipped: false,
        error: readiness?.gate?.reason || 'Signed OTP handoff could not be completed.',
        source,
        listingId,
        transactionId,
        readiness,
      }
    }

    const buyerOtpDocumentIds = [...new Set(
      (Array.isArray(readiness?.rows) ? readiness.rows : [])
        .flatMap((row) => [row?.documentId, row?.sourceDocumentId])
        .map((documentId) => normalizeText(documentId))
        .filter(Boolean),
    )]
    if (!buyerOtpDocumentIds.length) {
      return {
        skipped: false,
        error: 'Signed OTP handoff could not identify the accepted offer document.',
        source,
        listingId,
        transactionId,
        readiness,
      }
    }

    try {
      const queued = await markPrivateListingDocumentsPendingTransactionPromotion(listingId, {
        documentIds: buyerOtpDocumentIds,
        requirementKeys: [KINGSTONS_BUYER_OTP_REQUIREMENT.key],
        source,
      })
      if (!queued?.updatedCount) {
        return {
          skipped: false,
          error: 'Signed OTP handoff could not find the accepted offer document in the listing document store.',
          source,
          listingId,
          transactionId,
          documentIds: buyerOtpDocumentIds,
          queued,
        }
      }
      const repair = await repairSellerDocumentTransactionContinuity({ listingId })
      return {
        skipped: false,
        error: '',
        source,
        listingId,
        transactionId,
        documentIds: buyerOtpDocumentIds,
        queued,
        repair,
      }
    } catch (promotionError) {
      console.warn('[AgentListingDetail] Signed OTP transaction continuity repair skipped.', promotionError)
      return {
        skipped: false,
        error: promotionError?.message || 'Signed OTP handoff could not be completed.',
        source,
        listingId,
        transactionId,
        documentIds: buyerOtpDocumentIds,
      }
    }
  }

  async function handleStartAcceptedOfferOtpDocument(selection = {}) {
    const offer = acceptedOfferOtpStartOffer || {}
    const transactionId = normalizeText(offer.transactionId || offer.transaction_id)
    const offerId = normalizeText(offer.canonicalOfferId || offer.offerId || offer.id)
    const sourceMode = normalizeText(selection?.sourceMode || DOCUMENT_START_SOURCE_MODES.saved)
    setAcceptedOfferOtpStartOffer(null)
    setOfferActionError('')
    setOfferActionMessage('')

    if (listingKingstonsBuyerOtpDigitalDecision.blocked) {
      return
    }

    if (!transactionId) {
      setOfferActionError('Create the transaction before preparing the OTP.')
      return
    }

    if (sourceMode === DOCUMENT_START_SOURCE_MODES.onboarding) {
      try {
        setCanonicalOfferActionId(`${offer.id}:otp_onboarding`)
        const onboardingEmail = await invokeEdgeFunction('send-email', {
          body: {
            type: 'client_onboarding',
            transactionId,
            source: 'accepted_offer_otp_start',
            deliveryMode: normalizeClientIntakePreference(
              offer.conditionsJson?.clientIntakePreference ||
                offer.conditionsJson?.deliveryMode ||
                offer.conditions?.clientIntakePreference ||
                offer.conditions?.deliveryMode ||
                CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
            ),
          },
        })
        if (onboardingEmail?.error || onboardingEmail?.data?.error) {
          throw onboardingEmail.error || new Error(onboardingEmail.data.error)
        }
        setOfferActionMessage('Buyer onboarding was sent. Prepare the OTP once the details are back, or continue manually if needed.')
      } catch (error) {
        setOfferActionError(error?.message || 'Buyer onboarding could not be sent.')
      } finally {
        setCanonicalOfferActionId('')
      }
      return
    }

    const path = buildAcceptedOfferOtpWorkspacePath({
      transactionId,
      offerId,
      leadId: offer.buyerLeadId,
      listingId: listingRecord?.id,
      sourceMode,
      legalScenario: selection?.legalScenario,
      returnTo: `/agent/listings/${encodeURIComponent(String(listingRecord?.id || ''))}?tab=leads`,
    })
    if (!path) {
      setOfferActionError('Unable to open the OTP workspace for this accepted offer.')
      return
    }
    navigate(path)
  }

  function handleAcceptedOfferPrepareOtpClick(offer) {
    if (listingKingstonsBuyerOtpDigitalDecision.blocked) {
      setAcceptedOfferOtpStartOffer(null)
      setOfferActionMessage('')
      setOfferActionError('')
      return
    }
    setAcceptedOfferOtpStartOffer(offer)
  }

  const legacyOfferRows = useMemo(() => {
    void offersRefreshTick
    if (!listingRecord?.id) return []
    return getOffersForListing(listingRecord.id).map((record) => ({
      ...record,
      sourceSystem: 'legacy_listing_offer',
      buyerName: record?.buyer?.fullName || 'Buyer',
      offerPrice: Number(record?.offer?.offerAmount || 0) || 0,
      conditions: String(record?.offer?.specialConditions || record?.offer?.suspensiveConditions || '').trim(),
      supportingDocsUrl: String(record?.offer?.proofOfFundsUrl || '').trim(),
      offerDate: record?.submittedAt || '',
      expiryDate: record?.offer?.expiryDate || '',
      status: normalizeOfferWorkflowStatus(record?.status),
      financeType: String(record?.offer?.financeType || 'unknown').trim(),
      depositAmount: Number(record?.offer?.depositAmount || 0) || 0,
      submittedBy: record?.source || 'buyer_offer_link',
    }))
  }, [listingRecord?.id, offersRefreshTick])

  const canonicalOfferRows = useMemo(() => {
    return (Array.isArray(canonicalListingOffers) ? canonicalListingOffers : []).map((offer) => ({
      id: `canonical-${offer.id}`,
      canonicalOfferId: offer.id,
      sourceSystem: 'canonical_offer',
      buyerLeadId: offer.buyerLeadId,
      buyerContactId: offer.buyerContactId,
      buyerName: offer.conditions?.buyerName || offer.conditions?.fullName || 'Buyer',
      offerPrice: Number(offer.offerAmount || 0) || 0,
      conditions: String(offer.conditions?.specialConditions || offer.conditions?.suspensiveConditions || '').trim(),
      supportingDocsUrl: String(offer.conditions?.proofOfFundsUrl || '').trim(),
      offerDate: offer.submittedAt || offer.createdAt || '',
      expiryDate: offer.expiryDate || '',
      status: normalizeOfferWorkflowStatus(offer.status),
      financeType: String(offer.financeType || 'unknown').trim(),
      depositAmount: Number(offer.depositAmount || 0) || 0,
      submittedBy: 'canonical_offers',
      agentNotes: offer.conditions?.agentNotes || offer.conditions?.agentNoteToBuyer || '',
      viewingAppointmentId: offer.viewingAppointmentId,
      transactionId: offer.transactionId,
      sentToSellerAt: offer.sentToSellerAt,
      sellerViewedAt: offer.sellerViewedAt,
      sellerReviewSession: offer.sellerReviewSession,
      conversionCandidate: offer.conditions?.conversionCandidate || null,
      kingstonsBuyerOtp: offer.conditions?.kingstonsBuyerOtp || offer.conditions?.signedOtpDocument || null,
      conditionsJson: offer.conditions || {},
    }))
  }, [canonicalListingOffers])

  const offerRows = useMemo(() => {
    const canonicalLeadKeys = new Set(canonicalOfferRows.map((offer) => `${offer.buyerLeadId || ''}:${offer.offerPrice || 0}:${offer.status || ''}`))
    const nonDuplicatedLegacyRows = legacyOfferRows.filter((offer) => {
      const key = `${offer.buyerLeadId || ''}:${offer.offerPrice || 0}:${offer.status || ''}`
      return !offer.buyerLeadId || !canonicalLeadKeys.has(key)
    })
    return [...canonicalOfferRows, ...nonDuplicatedLegacyRows]
      .map((offer) => {
        if (!listingHasKingstonsSellerProcess) return offer
        const documents = (Array.isArray(listingRecord?.documents) ? listingRecord.documents : [])
          .filter((document) => documentMatchesKingstonsBuyerOtpOffer(document, offer))
        const linkedOfferOtp = offer.kingstonsBuyerOtp && typeof offer.kingstonsBuyerOtp === 'object'
          ? [offer.kingstonsBuyerOtp]
          : []
        return {
          ...offer,
          kingstonsBuyerOtpReadiness: buildKingstonsBuyerOtpReadiness({ documents: [...documents, ...linkedOfferOtp] }),
        }
      })
      .sort((left, right) => new Date(right.offerDate || 0) - new Date(left.offerDate || 0))
  }, [canonicalOfferRows, legacyOfferRows, listingHasKingstonsSellerProcess, listingRecord?.documents])

  const offerInviteRows = useMemo(() => {
    void offersRefreshTick
    if (!listingRecord?.id) return []
    return getOfferInvitesForListing(listingRecord.id)
  }, [listingRecord?.id, offersRefreshTick])

  const offerSummary = useMemo(() => {
    const statusCount = (status) => offerRows.filter((offer) => normalizeOfferWorkflowStatus(offer?.status) === status).length
    return {
      total: offerRows.length,
      submitted: statusCount(OFFER_WORKFLOW_STATUS.SUBMITTED),
      sellerReview: statusCount(OFFER_WORKFLOW_STATUS.SELLER_REVIEW),
      accepted: offerRows.filter((offer) => [OFFER_WORKFLOW_STATUS.ACCEPTED, OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION].includes(normalizeOfferWorkflowStatus(offer?.status))).length,
      countered: statusCount(OFFER_WORKFLOW_STATUS.COUNTERED),
      highest: offerRows.reduce((highest, offer) => {
        const value = Number(offer?.offerPrice || 0)
        return Number.isFinite(value) && value > highest ? value : highest
      }, 0),
    }
  }, [offerRows])

  const listingLeads = useMemo(() => {
    if (!listingRecord) return []
    return pipelineLeads.filter((lead) => isLeadLinkedToListing(lead, listingRecord))
  }, [listingRecord, pipelineLeads])

  const buyerOfferLeads = useMemo(
    () => getBuyerLeadOptions(pipelineLeads, listingRecord),
    [listingRecord, pipelineLeads],
  )

  const listingLeadRows = useMemo(() => {
    const leadMap = new Map()
    const addLead = (lead = {}, extras = {}) => {
      const leadId = getLeadRecordId(lead) || String(extras.leadId || '').trim()
      const contactId = getLeadContactId(lead) || String(extras.contactId || '').trim()
      const key = leadId || contactId || String(extras.fallbackKey || '').trim()
      if (!key) return
      const existing = leadMap.get(key) || {}
      leadMap.set(key, {
        ...existing,
        ...lead,
        ...extras,
        id: leadId || existing.id || key,
        leadId: leadId || existing.leadId || '',
        contactId: contactId || existing.contactId || '',
        name: lead?.name || extras.name || existing.name || lead?.buyerName || lead?.contactName || 'Unnamed lead',
        email: lead?.email || lead?.buyerEmail || extras.email || existing.email || '',
        phone: lead?.phone || lead?.buyerPhone || extras.phone || existing.phone || '',
        source: extras.source || lead?.source || existing.source || lead?.leadSource || lead?.lead_source || 'Manual',
        status: extras.status || lead?.journeyStage || lead?.stage || lead?.status || existing.status || 'new_lead',
        createdAt: extras.createdAt || getLeadCreatedAt(lead) || existing.createdAt || '',
      })
    }

    listingLeads.forEach((lead) => addLead(lead))
    interestedLeadRows.forEach((interest) => {
      addLead(interest.lead || {}, {
        leadId: interest.leadId,
        contactId: interest.contactId,
        source: interest.source || interest.lead?.source,
        status: interest.status,
        createdAt: interest.createdAt,
        interest,
        fallbackKey: interest.interestId,
      })
    })

    const leadIdFor = (row = {}) => String(row?.leadId || row?.buyerLeadId || row?.buyer_lead_id || row?.id || '').trim()
    const viewingsByLead = new Map()
    viewings.forEach((viewing) => {
      const leadId = String(viewing?.buyer_lead_id || viewing?.buyerLeadId || '').trim()
      if (!leadId) return
      const current = viewingsByLead.get(leadId) || []
      current.push(viewing)
      viewingsByLead.set(leadId, current)
    })

    const offersByLead = new Map()
    offerRows.forEach((offer) => {
      const leadId = leadIdFor(offer)
      if (!leadId) return
      const current = offersByLead.get(leadId) || []
      current.push(offer)
      offersByLead.set(leadId, current)
    })

    const sentByLead = new Map()
    sentPropertyRows.forEach((share) => {
      const leadId = String(share?.leadId || share?.lead_id || '').trim()
      if (!leadId) return
      const timestamp = firstDraftValue(share?.sentAt, share?.sent_at, share?.deliveredAt, share?.delivered_at, share?.createdAt, share?.created_at)
      const existing = sentByLead.get(leadId)
      if (!existing || new Date(timestamp || 0) > new Date(existing.timestamp || 0)) {
        sentByLead.set(leadId, {
          timestamp,
          by: share?.agentName || share?.agentId || 'Agent',
        })
      }
    })

    const timestampForViewing = (viewing = {}) => {
      const schedule = [viewing?.proposed_date, viewing?.proposed_time].filter(Boolean).join(' ')
      const timestamp = new Date(schedule || viewing?.updated_at || viewing?.created_at || 0).getTime()
      return Number.isFinite(timestamp) ? timestamp : 0
    }
    const timestampForOffer = (offer = {}) => {
      const timestamp = new Date(offer?.offerDate || offer?.submittedAt || offer?.updatedAt || offer?.updated_at || offer?.createdAt || offer?.created_at || 0).getTime()
      return Number.isFinite(timestamp) ? timestamp : 0
    }
    const relevantViewingFor = (rows = []) => {
      if (!rows.length) return null
      const upcomingStatuses = [VIEWING_STATUS.CONFIRMED, VIEWING_STATUS.PENDING_APPROVAL, VIEWING_STATUS.RESCHEDULE_REQUESTED, VIEWING_STATUS.VIEWING_REQUESTED]
      const upcoming = rows
        .filter((viewing) => upcomingStatuses.includes(String(viewing?.status || '').trim().toLowerCase()))
        .sort((left, right) => timestampForViewing(left) - timestampForViewing(right))
      if (upcoming.length) return upcoming[0]
      return [...rows].sort((left, right) => timestampForViewing(right) - timestampForViewing(left))[0] || null
    }

    return Array.from(leadMap.values())
      .map((lead) => {
        const leadId = getLeadRecordId(lead)
        const contact = sentByLead.get(leadId)
        const leadContactedAt = getLeadContactedAt(lead)
        const contactedAt = contact?.timestamp || leadContactedAt || ''
        const contactedBy = contact?.by || getLeadContactedBy(lead) || ''
        const viewingRows = viewingsByLead.get(leadId) || []
        const offerRowsForLead = offersByLead.get(leadId) || []
        const viewing = relevantViewingFor(viewingRows)
        const offer = [...offerRowsForLead].sort((left, right) => timestampForOffer(right) - timestampForOffer(left))[0] || null
        const statusSeed = offer
          ? 'offer_submitted'
          : viewing
            ? String(viewing.status || '').toLowerCase() === VIEWING_STATUS.COMPLETED ? 'viewed' : 'viewing_scheduled'
            : contactedAt
              ? 'contacted'
              : lead.status
        const status = lead.status && lead.status !== 'new_lead' ? lead.status : statusSeed
        return {
          ...lead,
          leadId,
          sourceLabel: normalizeLeadSourceLabel(lead.source),
          status,
          statusLabel: formatListingLeadStatusLabel(status),
          statusGroup: getListingLeadStatusGroup(status),
          contactedAt,
          contactedBy,
          viewing,
          viewingCount: viewingRows.length,
          offer,
          offerCount: offerRowsForLead.length,
          createdAt: lead.createdAt || getLeadCreatedAt(lead),
          searchText: [lead.name, lead.email, lead.phone, lead.source, status].map((value) => String(value || '').toLowerCase()).join(' '),
        }
      })
      .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
  }, [interestedLeadRows, listingLeads, offerRows, sentPropertyRows, viewings])

  const listingLeadSummary = useMemo(() => {
    const total = listingLeadRows.length
    const percent = (value) => total ? `${Math.round((value / total) * 100)}% of total` : '0% of total'
    const now = Date.now()
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    const newThisWeek = listingLeadRows.filter((lead) => {
      const timestamp = new Date(lead.createdAt || 0).getTime()
      return Number.isFinite(timestamp) && now - timestamp <= sevenDays
    }).length
    const contacted = listingLeadRows.filter((lead) => lead.contactedAt || ['contacted', 'viewing', 'offer', 'converted'].includes(lead.statusGroup)).length
    const viewingsBooked = listingLeadRows.filter((lead) => lead.viewingCount > 0).length
    const offers = listingLeadRows.filter((lead) => lead.offerCount > 0 || lead.statusGroup === 'offer' || lead.statusGroup === 'converted').length
    const converted = listingLeadRows.filter((lead) => lead.statusGroup === 'converted' || [OFFER_WORKFLOW_STATUS.ACCEPTED, OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION].includes(normalizeOfferWorkflowStatus(lead.offer?.status))).length
    return {
      total,
      newThisWeek,
      contacted,
      viewingsBooked,
      offers,
      converted,
      percent,
    }
  }, [listingLeadRows])

  const listingLeadSourceOptions = useMemo(() => {
    return ['all', ...Array.from(new Set(listingLeadRows.map((lead) => lead.sourceLabel).filter(Boolean))).sort()]
  }, [listingLeadRows])

  const filteredListingLeadRows = useMemo(() => {
    const query = listingLeadSearch.trim().toLowerCase()
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    return listingLeadRows.filter((lead) => {
      if (query && !lead.searchText.includes(query)) return false
      if (listingLeadStatusFilter !== 'all' && lead.statusGroup !== listingLeadStatusFilter) return false
      if (listingLeadSourceFilter !== 'all' && lead.sourceLabel !== listingLeadSourceFilter) return false
      if (listingLeadActivityFilter === 'has_viewing' && !lead.viewingCount) return false
      if (listingLeadActivityFilter === 'has_offer' && !lead.offerCount) return false
      if (listingLeadActivityFilter === 'needs_follow_up' && (lead.contactedAt || lead.statusGroup !== 'new')) return false
      if (listingLeadDateFilter !== 'all') {
        const created = new Date(lead.createdAt || 0).getTime()
        if (!Number.isFinite(created)) return false
        const range = listingLeadDateFilter === 'today' ? dayMs : listingLeadDateFilter === '7_days' ? 7 * dayMs : 30 * dayMs
        if (now - created > range) return false
      }
      return true
    })
  }, [listingLeadActivityFilter, listingLeadDateFilter, listingLeadRows, listingLeadSearch, listingLeadSourceFilter, listingLeadStatusFilter])

  const listingLeadPageSize = 10
  const listingLeadPageCount = Math.max(1, Math.ceil(filteredListingLeadRows.length / listingLeadPageSize))
  const visibleListingLeadRows = filteredListingLeadRows.slice((listingLeadPage - 1) * listingLeadPageSize, listingLeadPage * listingLeadPageSize)

  useEffect(() => {
    setListingLeadPage(1)
  }, [listingLeadActivityFilter, listingLeadDateFilter, listingLeadSearch, listingLeadSourceFilter, listingLeadStatusFilter])
  const selectedBuyerOfferLead = useMemo(
    () => buyerOfferLeads.find((lead) => String(lead?.id || '') === String(offerInviteDraft.buyerLeadId || '')) || null,
    [buyerOfferLeads, offerInviteDraft.buyerLeadId],
  )
  const selectedBuyerOfferEligibility = useMemo(
    () => selectedBuyerOfferLead
      ? assessBuyerOfferEligibility({
          organisationId: listingOrganisationId,
          listing: listingRecord,
          buyerLead: selectedBuyerOfferLead,
        })
      : null,
    [listingOrganisationId, listingRecord, selectedBuyerOfferLead],
  )

  const dynamicSellerRequirements = useMemo(() => {
    if (!listingRecord) return []
    const existingDynamic = Array.isArray(listingRecord?.documentRequirements) ? listingRecord.documentRequirements : []
    if (existingDynamic.length) return existingDynamic

    const profile = getSellerRequirementProfile(listingRecord)
    const generated = getRequiredSellerDocuments(profile)
    const legacyDocs = Array.isArray(listingRecord?.requiredDocuments) ? listingRecord.requiredDocuments : []
    const legacyMap = new Map(legacyDocs.map((doc) => [String(doc?.key || '').trim().toLowerCase(), doc]))
    return generated.map((row) => {
      const legacy = legacyMap.get(String(row?.requirement_key || '').trim().toLowerCase())
      return {
        ...row,
        key: row.requirement_key,
        label: row.requirement_name,
        status: legacy?.status || row.status || 'required',
        fileName: legacy?.fileName || '',
      }
    })
  }, [listingRecord])

  const sellerDocumentRequirementModel = useMemo(() => {
    if (!listingRecord) return null
    const profile = getSellerRequirementProfile({
      ...listingRecord,
      documentRequirements: dynamicSellerRequirements,
    })
    const rows = dynamicSellerRequirements.map((row) => ({
      ...row,
      key: row.requirement_key || row.key,
      label: row.requirement_name || row.label,
      group: row.requirement_group || row.group,
    }))
    const retiredRows = rows.filter((row) => (
      normalizeKey(row.status) === 'not_applicable' ||
      row.retired === true ||
      row.retiredBySellerProfileBuilder === true ||
      row.generated_from?.archived === true
    ))
    const activeRows = rows.filter((row) => !retiredRows.includes(row))
    const groups = LISTING_DOCUMENT_GROUP_CONFIG.map((group) => ({
      key: group.key,
      label: group.label,
      count: activeRows.filter((row) => getListingDocumentGroupingKey(row) === group.key).length,
    }))
    const branchOption = LISTING_SELLER_PROFILE_BRANCHES.find((branch) => branch.value === normalizeKey(profile?.sellerBranch || profile?.sellerType))
    return {
      sellerBranch: profile?.sellerBranch || profile?.sellerType || 'individual',
      branchLabel: branchOption?.label || formatStatusLabel(profile?.sellerBranch || profile?.sellerType || 'individual'),
      propertyStructureLabel: formatStatusLabel(profile?.propertyStructureType || profile?.propertyBranch || 'property'),
      lifecycleLabel: profile?.lifecycleLabel || formatStatusLabel(profile?.lifecycleStatus || ''),
      ownerCount: profile?.ownerCount || 1,
      total: activeRows.length,
      sellerVisible: activeRows.filter((row) => normalizeKey(row.visibility || row.document_visibility) !== 'internal').length,
      internal: activeRows.filter((row) => normalizeKey(row.visibility || row.document_visibility) === 'internal').length,
      retired: retiredRows.length,
      retiredRows,
      groups,
    }
  }, [dynamicSellerRequirements, listingRecord])

  const sellerReadinessSummary = useMemo(() => {
    if (!listingRecord) return null
    const legacyDocuments = Array.isArray(listingRecord?.requiredDocuments)
      ? listingRecord.requiredDocuments.map((doc) => ({
          requirement_key: doc?.key,
          document_type: doc?.key,
          status: doc?.status,
          document_name: doc?.label,
        }))
      : []

    return getListingReadinessSummary({
      ...listingRecord,
      documentRequirements: dynamicSellerRequirements,
      documents: Array.isArray(listingRecord?.documents) && listingRecord.documents.length ? listingRecord.documents : legacyDocuments,
    })
  }, [dynamicSellerRequirements, listingRecord])

  const buyerDocuments = useMemo(() => {
    const accepted = offerRows.find((offer) =>
      [OFFER_WORKFLOW_STATUS.ACCEPTED, OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION].includes(normalizeOfferWorkflowStatus(offer?.status)),
    )
    if (!accepted) return []
    return [
      { key: 'buyer_otp', label: 'Offer Documentation Pack', status: 'requested', fileName: '' },
      { key: 'buyer_finance', label: 'Finance / Proof of Funds', status: accepted.conditions?.toLowerCase().includes('cash') ? 'uploaded' : 'requested', fileName: '' },
    ]
  }, [offerRows])

  const metrics = useMemo(() => {
    const pendingOffers = offerRows.filter((offer) => {
      const status = normalizeOfferWorkflowStatus(offer?.status)
      return [
        OFFER_WORKFLOW_STATUS.SUBMITTED,
        OFFER_WORKFLOW_STATUS.AGENT_REVIEW,
        OFFER_WORKFLOW_STATUS.SELLER_REVIEW,
        OFFER_WORKFLOW_STATUS.BUYER_REVIEW_COUNTER,
      ].includes(status)
    }).length
    const activeOffers = offerRows.filter((offer) => {
      const status = normalizeOfferWorkflowStatus(offer?.status)
      return [
        OFFER_WORKFLOW_STATUS.SUBMITTED,
        OFFER_WORKFLOW_STATUS.AGENT_REVIEW,
        OFFER_WORKFLOW_STATUS.SELLER_REVIEW,
        OFFER_WORKFLOW_STATUS.BUYER_REVIEW_COUNTER,
        OFFER_WORKFLOW_STATUS.COUNTERED,
        OFFER_WORKFLOW_STATUS.ACCEPTED,
      ].includes(status)
    }).length
    const marketStartDate = getListingMarketStartDate(listingRecord, marketingDraft)
    const daysOnMarket = getDaysOnMarket(marketStartDate)
    const offerAverage = getOfferAverage(offerRows)
    const leadCount = listingLeads.length
    const viewingCount = viewings.filter((item) => [VIEWING_STATUS.CONFIRMED, VIEWING_STATUS.COMPLETED, VIEWING_STATUS.PENDING_APPROVAL, VIEWING_STATUS.RESCHEDULE_REQUESTED].includes(String(item?.status || '').trim().toLowerCase())).length
    const offerLeadCount = listingLeads.filter((lead) => getLeadStage(lead).includes('offer') || getLeadStage(lead).includes('negotiating')).length
    const acceptedCount = offerRows.filter((offer) =>
      [OFFER_WORKFLOW_STATUS.ACCEPTED, OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION].includes(normalizeOfferWorkflowStatus(offer?.status)),
    ).length
    const estimatedViews = leadCount * 6 + activeOffers * 8 + 12
    return {
      pendingOffers,
      activeOffers,
      daysOnMarket,
      marketStartDate,
      offerAverage,
      highestOffer: Math.max(0, ...offerRows.map((offer) => Number(offer?.offerPrice || 0))),
      leadCount,
      viewingCount,
      offerLeadCount,
      acceptedCount,
      estimatedViews,
    }
  }, [listingLeads, listingRecord, marketingDraft, offerRows, viewings])

  const sourceBreakdown = useMemo(() => {
    const counts = new Map([
      ['Property24', 0],
      ['Private Property', 0],
      ['Direct / Manual', 0],
    ])

    for (const lead of listingLeads) {
      const source = String(lead?.source || '').trim().toLowerCase()
      if (source === 'property24') {
        counts.set('Property24', counts.get('Property24') + 1)
      } else if (source === 'private property') {
        counts.set('Private Property', counts.get('Private Property') + 1)
      } else {
        counts.set('Direct / Manual', counts.get('Direct / Manual') + 1)
      }
    }

    const colors = {
      'Property24': '#1f4f78',
      'Private Property': '#2f8f6b',
      'Direct / Manual': '#c58b35',
    }
    const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0)
    return Array.from(counts.entries()).map(([label, value]) => ({
      label,
      value,
      color: colors[label],
      share: total ? Math.round((value / total) * 100) : 0,
    }))
  }, [listingLeads])

  const pricingInsight = useMemo(() => {
    const asking = Number(listingRecord?.askingPrice || 0)
    const averageOffer = Number(metrics.offerAverage || 0)
    if (!asking || !averageOffer) {
      return {
        varianceValue: 0,
        varianceLabel: 'No offer variance yet',
        askingFill: asking ? 100 : 0,
        offerFill: averageOffer ? 100 : 0,
      }
    }
    const variance = averageOffer - asking
    return {
      varianceValue: variance,
      varianceLabel: variance >= 0 ? 'Average offer above asking' : 'Average offer below asking',
      askingFill: 100,
      offerFill: Math.max(12, Math.min(100, (averageOffer / asking) * 100)),
    }
  }, [listingRecord?.askingPrice, metrics.offerAverage])

  const onboardingStatusLabel = getOnboardingStatusLabel(listingRecord?.sellerOnboarding?.status)
  const missingDocuments = useMemo(
    () =>
      (listingRecord?.requiredDocuments || []).filter((doc) => {
        const status = String(doc?.status || '').trim().toLowerCase()
        return status === 'requested' || status === 'missing' || status === 'pending'
      }).length,
    [listingRecord?.requiredDocuments],
  )
  const activityItems = useMemo(() => {
    const items = []
    if (listingRecord?.createdAt) {
      items.push({
        title: 'Listing created',
        timestamp: listingRecord.createdAt,
        copy: `${listingRecord.listingTitle} was captured and is now active in the agent workspace.`,
      })
    }
    for (const offer of offerRows.slice(0, 2)) {
      items.push({
        title: `Offer from ${offer.buyerName || 'buyer'}`,
        timestamp: offer.offerDate,
        copy: `${formatCurrency(offer.offerPrice)} • ${formatStatusLabel(offer.status)}`,
      })
    }
    for (const viewing of viewings.slice(0, 2)) {
      items.push({
        title: `Viewing ${formatViewingStatusLabel(viewing.status).toLowerCase()}`,
        timestamp: viewing.updated_at || viewing.created_at,
        copy: `${viewing.buyer_name || 'Buyer'} • ${viewing.proposed_date || 'Date pending'} ${viewing.proposed_time || ''}`.trim(),
      })
    }
    for (const document of (listingRecord?.requiredDocuments || []).slice(0, 2)) {
      items.push({
        title: `Document: ${document.label}`,
        timestamp: listingRecord?.createdAt,
        copy: `Current status: ${formatStatusLabel(document.status)}`,
      })
    }
    return items
      .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0))
      .slice(0, 5)
  }, [listingRecord?.createdAt, listingRecord?.listingTitle, listingRecord?.requiredDocuments, offerRows, viewings])

  const mandateWorkspace = useMemo(() => {
    const mandate = listingRecord?.mandate || {}
    const mandateDocument = (Array.isArray(listingRecord?.documents) ? listingRecord.documents : []).find((document) => {
      const searchable = [
        document?.document_type,
        document?.documentType,
        document?.category,
        document?.document_name,
        document?.documentName,
        document?.fileName,
        document?.name,
      ].map((value) => normalizeKey(value)).join(' ')
      const hasUrl = Boolean(document?.url || document?.fileUrl || document?.file_url || document?.signedUrl || document?.signed_url)
      return searchable.includes('mandate') && !searchable.includes('manual_mandate_evidence') && hasUrl
    }) || null
    const status = String(
      listingRecord?.mandateStatus ||
        mandate?.status ||
        (marketingDraft.mandateSignedDate || mandate?.signedAt || mandate?.signed ? 'signed' : '') ||
        (mandate?.sentAt ? 'sent' : '') ||
        'draft',
    ).trim().toLowerCase()
    const signedDate = firstDraftValue(marketingDraft.mandateSignedDate, mandate?.signedAt, listingRecord?.mandateSignedDate)
    const expiryDate = firstDraftValue(marketingDraft.expiryDate, listingRecord?.mandateEndDate, mandate?.endDate)
    const expiryTime = expiryDate ? new Date(expiryDate).getTime() : NaN
    const daysUntilExpiry = Number.isFinite(expiryTime)
      ? Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24))
      : null
    const signedUrl = String(
      mandate?.signedUrl ||
        mandate?.signedFileUrl ||
        mandate?.signedDocumentUrl ||
        listingRecord?.signedMandateUrl ||
        listingRecord?.mandateSignedUrl ||
        mandateDocument?.url ||
        mandateDocument?.fileUrl ||
        mandateDocument?.file_url ||
        mandateDocument?.signedUrl ||
        mandateDocument?.signed_url ||
        '',
    ).trim()
    const viewUrl = String(
      mandate?.url ||
        mandate?.documentUrl ||
        listingRecord?.mandateUrl ||
        mandateDocument?.url ||
        mandateDocument?.fileUrl ||
        mandateDocument?.file_url ||
        mandateDocument?.signedUrl ||
        mandateDocument?.signed_url ||
        listingRecord?.mandateSigningLink ||
        (listingRecord?.sellerOnboarding?.link ? `${listingRecord.sellerOnboarding.link}/mandate` : '') ||
        '',
    ).trim()
    return {
      status,
      label: formatStatusLabel(status),
      signedDate,
      expiryDate,
      daysUntilExpiry,
      lastUpdated: firstDraftValue(mandate?.updatedAt, listingRecord?.updatedAt, listingRecord?.createdAt),
      signedUrl,
      viewUrl,
      isSigned: ['signed', 'signed_uploaded', 'completed', 'fully_signed', 'uploaded_signed', 'mandate_signed'].includes(status) || Boolean(signedDate || signedUrl),
      isExpired: daysUntilExpiry !== null && daysUntilExpiry < 0,
    }
  }, [listingRecord, marketingDraft.expiryDate, marketingDraft.mandateSignedDate])

  const mandateContinuity = useMemo(() => {
    const mandatePacket = buildListingMandatePacketSummary(listingRecord, mandateWorkspace)
    const mandatePacketId = firstDraftValue(mandatePacket?.id, listingRecord?.mandatePacketId, listingRecord?.mandate_packet_id)
    const eventSources = [
      listingRecord?.activityEvents,
      listingRecord?.events,
      listingRecord?.activity,
      listingRecord?.activities,
      listingRecord?.privateListingActivity,
      listingRecord?.timeline,
    ]
    const activityEvents = eventSources.flatMap((source) => Array.isArray(source) ? source : [])
    if (mandateWorkspace.isSigned || mandateWorkspace.signedDate) {
      activityEvents.push({
        id: `mandate-continuity-${listingRecord?.id || listingRecord?.listingId || 'listing'}`,
        eventType: 'mandate_signed',
        visibility: 'client_visible',
        createdAt: mandateWorkspace.signedDate || listingRecord?.updatedAt || listingRecord?.createdAt,
        eventData: {
          title: 'Signed mandate recorded',
          description: 'Signed mandate continuity is visible from this listing workspace.',
          actionRoute: 'documents',
          audience: 'seller',
          visibility: 'client_visible',
        },
      })
    }
    return buildSellerMandateContinuityModel({
      lead: {
        leadId: firstDraftValue(listingRecord?.sellerLeadId, listingRecord?.seller_lead_id, listingRecord?.originatingCrmLeadId, listingRecord?.originating_crm_lead_id),
        mandatePacketId,
        mandateStatus: mandateWorkspace.status,
      },
      listing: {
        ...listingRecord,
        mandatePacketId,
        mandateStatus: mandateWorkspace.status,
      },
      documents: Array.isArray(listingRecord?.documents) ? listingRecord.documents : [],
      mandatePacket,
      activityEvents,
      portalContext: listingRecord?.clientPortalContext || listingRecord?.sellerPortalContext || listingRecord?.portalContext || {},
      sellerWorkspaceToken: firstDraftValue(
        listingRecord?.sellerOnboarding?.token,
        listingRecord?.sellerOnboardingToken,
        listingRecord?.seller_onboarding_token,
      ),
    })
  }, [listingRecord, mandateWorkspace])

  const sellerDocumentSource = useMemo(() => {
    if (!listingRecord) return null
    const mandatePacket = buildListingMandatePacketSummary(listingRecord, mandateWorkspace)

    return buildSellerDocumentSourceOfTruth({
      listing: {
        ...listingRecord,
        documentRequirements: dynamicSellerRequirements,
      },
      documents: Array.isArray(listingRecord?.documents) ? listingRecord.documents : [],
      formData: getListingSellerFormData(listingRecord),
      mandatePacket,
    })
  }, [dynamicSellerRequirements, listingRecord, mandateWorkspace])

  const sellerDocumentTrackerRows = useMemo(
    () => (sellerDocumentSource?.rows || [])
      .filter((row) => row?.required !== false && row?.applicable !== false)
      .map((row) => mapSellerDocumentSourceRowForListing(row)),
    [sellerDocumentSource],
  )

  const sellerDocumentExperience = useMemo(
    () => buildSellerDocumentExperienceModel({
      requirements: sellerDocumentTrackerRows,
      audience: 'agent',
    }),
    [sellerDocumentTrackerRows],
  )

  const sellerDocumentReviewSla = useMemo(
    () => buildSellerDocumentReviewSlaReport(
      sellerDocumentExperience.items.map((item) => ({
        ...item,
        ownerMissing: !String(listingRecord?.assignedAgentId || listingRecord?.agentId || listingRecord?.assigned_agent_id || '').trim(),
      })),
    ),
    [listingRecord?.agentId, listingRecord?.assignedAgentId, listingRecord?.assigned_agent_id, sellerDocumentExperience.items],
  )
  const sellerDocumentSlaById = useMemo(
    () => new Map(sellerDocumentReviewSla.rows.map((row) => [row.documentId, row])),
    [sellerDocumentReviewSla.rows],
  )
  const sellerDocumentExperienceItems = useMemo(
    () => sellerDocumentExperience.items.map((item) => ({
      ...item,
      reviewSla: sellerDocumentSlaById.get(String(item?.linkedDocument?.id || '')) || null,
    })),
    [sellerDocumentExperience.items, sellerDocumentSlaById],
  )
  const sellerPackTransactionRows = useMemo(
    () => SELLER_PACK_TRANSACTION_REQUIREMENT_KEYS.map((requirementKey) => {
      const document = sellerDocumentExperienceItems.find((item) =>
        documentMatchesSellerPackTransactionKey(item, requirementKey),
      ) || null
      const handoff = getSellerPackTransactionHandoffPresentation(document)
      return {
        key: requirementKey,
        label: SELLER_PACK_TRANSACTION_REQUIREMENT_LABELS[requirementKey] || requirementKey,
        document,
        handoff,
      }
    }),
    [sellerDocumentExperienceItems],
  )
  const sellerPackTransactionSummary = useMemo(() => {
    const promoted = sellerPackTransactionRows.filter((row) => row.handoff.status === 'promoted').length
    const queued = sellerPackTransactionRows.filter((row) => row.handoff.status === 'queued').length
    const attention = sellerPackTransactionRows.filter((row) => row.handoff.status === 'attention').length
    const missing = sellerPackTransactionRows.filter((row) => row.handoff.status === 'missing').length
    const uploadedOnly = sellerPackTransactionRows.filter((row) => row.handoff.status === 'uploaded').length
    const complete = sellerPackTransactionRows.length > 0 && promoted === sellerPackTransactionRows.length
    return {
      total: sellerPackTransactionRows.length,
      promoted,
      queued,
      attention,
      missing,
      uploadedOnly,
      complete,
      status: complete ? 'complete' : attention ? 'attention' : missing || uploadedOnly ? 'pending' : 'queued',
      label: complete ? 'Transaction-ready' : attention ? 'Needs attention' : missing || uploadedOnly ? 'Incomplete' : 'Queued',
    }
  }, [sellerPackTransactionRows])

  const propertyDocuments = useMemo(
    () => sellerDocumentExperienceItems.filter((doc) => getListingDocumentGroupingKey(doc) === 'property'),
    [sellerDocumentExperienceItems],
  )

  const sellerDocuments = useMemo(
    () => sellerDocumentExperienceItems.filter((doc) => getListingDocumentGroupingKey(doc) === 'fica'),
    [sellerDocumentExperienceItems],
  )

  const listingDocumentGroups = useMemo(
    () => groupListingDocumentsForDisplay(sellerDocumentExperienceItems),
    [sellerDocumentExperienceItems],
  )
  const activeListingDocumentGroup = useMemo(
    () => listingDocumentGroups.find((group) => group.key === activeListingDocumentTab) || listingDocumentGroups[0] || null,
    [activeListingDocumentTab, listingDocumentGroups],
  )
  useEffect(() => {
    if (!listingDocumentGroups.length) return
    const currentGroup = listingDocumentGroups.find((group) => group.key === activeListingDocumentTab)
    if (currentGroup?.documents?.length) return
    const firstPopulatedGroup = listingDocumentGroups.find((group) => group.documents?.length)
    if (firstPopulatedGroup && firstPopulatedGroup.key !== activeListingDocumentTab) {
      setActiveListingDocumentTab(firstPopulatedGroup.key)
    }
  }, [activeListingDocumentTab, listingDocumentGroups])

  const listingReadinessItems = useMemo(() => {
    return [
      { key: 'address', label: 'Address captured', complete: Boolean(marketingDraft.addressLine1.trim()) },
      { key: 'asking_price', label: 'Asking price captured', complete: Number(marketingDraft.price || listingRecord?.askingPrice || 0) > 0 },
      { key: 'description', label: 'Description completed', complete: Boolean(marketingDraft.description.trim()) },
      { key: 'photos', label: 'Photos uploaded', complete: marketingDraft.galleryImages.length > 0 },
      { key: 'cover', label: 'Cover image selected', complete: Boolean(marketingDraft.coverImageId || marketingDraft.galleryImages[0]?.id) },
      { key: 'features', label: 'Property features captured', complete: marketingDraft.selectedFeatures.length > 0 || marketingDraft.amenities.length > 0 },
      { key: 'mandate', label: 'Mandate signed', complete: mandateWorkspace.isSigned },
      { key: 'mandate_continuity', label: 'Mandate continuity verified', complete: mandateContinuity.ready },
      { key: 'documents', label: 'Seller documents approved', complete: sellerDocumentExperience.summary.ready },
      { key: 'external_links', label: 'External links added', complete: normalizeExternalListingLinks(marketingDraft.externalLinks).some((link) => link.url) },
    ]
  }, [listingRecord?.askingPrice, mandateContinuity.ready, mandateWorkspace.isSigned, marketingDraft, sellerDocumentExperience.summary.ready])

  const listingReadinessCompleted = listingReadinessItems.filter((item) => item.complete).length
  const listingReadinessPercent = listingReadinessItems.length
    ? Math.round((listingReadinessCompleted / listingReadinessItems.length) * 100)
    : 0
  const sellerFormData = useMemo(() => getListingSellerFormData(listingRecord), [listingRecord])
  const directListingOperationalSummary = useMemo(
    () => buildDirectListingOperationalSummary(listingRecord),
    [listingRecord],
  )
  const directListingPostCreateActions = directListingOperationalSummary.followUpActions || []
  const directListingOutstandingPostCreateActions = directListingPostCreateActions.filter((action) => !action.complete)
  const activeSellerSectionEditor = SELLER_PROFILE_SECTION_BY_KEY.get(sellerSectionEditorKey) || null
  const sellerProfileRequirementPreview = useMemo(
    () => listingRecord
      ? buildListingSellerProfileRequirementProjection(sellerProfileBuilderDraft, listingRecord, { draft: true })
      : null,
    [listingRecord, sellerProfileBuilderDraft],
  )

  const sellerProfile = useMemo(() => {
    const raw = (...values) => firstDraftValue(...values)
    const form = sellerFormData || {}
    const seller = listingRecord?.seller || {}
    const valueFor = (...keys) => raw(...keys.map((key) => form?.[key]))
    const field = (key, label, values = [], type = 'text') => {
      const rawValue = Array.isArray(values) ? raw(...values) : values
      return { key, label, rawValue, value: formatSellerProfileValue(rawValue, type) }
    }
    const section = (key, title, icon, rows) => ({ key, title, icon, rows })
    const sellerName = raw(
      resolveSellerNameFromListing(listingRecord),
      valueFor('sellerName', 'fullName'),
      [form.sellerFirstName || form.firstName, form.sellerSurname || form.lastName].filter(Boolean).join(' '),
      'Seller',
    )
    const sellerTypeRaw = raw(valueFor('sellerType', 'type', 'ownershipType'), seller.sellerType, seller.type, 'individual')
    const propertyAddress = raw(
      valueFor('propertyAddress', 'addressLine1'),
      marketingDraft.addressLine1,
      listingRecord?.addressLine1,
      listingRecord?.propertyAddress,
      listingRecord?.listingTitle,
    )
    const mandateType = raw(valueFor('mandateType'), listingRecord?.mandateType, listingRecord?.mandate?.type, 'sole')
    const askingPrice = raw(valueFor('askingPrice', 'price'), marketingDraft.price, listingRecord?.askingPrice)
    const popiConsent = raw(valueFor('popiConsent', 'privacyConsent'), seller.popiConsent, listingRecord?.popiConsent)
    const sections = [
      section('seller_details', 'Seller Details', UserRound, [
        field('fullName', 'Full name', [sellerName]),
        field('idNumber', 'ID / Registration number', [valueFor('idNumber', 'sellerIdNumber', 'companyRegistrationNumber', 'trustRegistrationNumber'), seller.idNumber, seller.companyNumber, seller.trustNumber]),
        field('sellerType', 'Seller type', [sellerTypeRaw]),
        field('maritalStatus', 'Marital status', [valueFor('maritalStatus'), seller.maritalStatus]),
      ]),
      section('contact_details', 'Contact Details', Link2, [
        field('email', 'Email', [resolveSellerEmailFromListing(listingRecord), valueFor('sellerEmail', 'email', 'contactEmail'), seller.email]),
        field('phone', 'Phone', [valueFor('sellerPhone', 'phone', 'contactNumber', 'mobile'), seller.phone]),
        field('alternativeContact', 'Alternative contact', [valueFor('alternativeContact', 'alternateContact', 'secondaryPhone', 'alternativePhone'), seller.alternativeContact]),
        field('preferredContactMethod', 'Preferred contact method', [valueFor('preferredContactMethod', 'contactPreference'), seller.preferredContactMethod]),
      ]),
      section('property_ownership', 'Property & Ownership', Home, [
        field('propertyAddress', 'Property address', [propertyAddress]),
        field('ownershipType', 'Ownership type', [valueFor('ownershipType', 'ownerType'), seller.ownershipType]),
        field('titleDeedNumber', 'Title deed number', [valueFor('titleDeedNumber', 'deedNumber', 'titleReference'), seller.titleDeedNumber]),
        field('bondHolder', 'Bond holder', [valueFor('bondHolder', 'bondBank', 'mortgageBank'), seller.bondHolder]),
        field('outstandingBond', 'Outstanding bond', [valueFor('outstandingBond', 'bondSettlementAmount'), seller.outstandingBond], 'currency'),
        field('coOwnerDetails', 'Co-owner details', [valueFor('coOwnerDetails', 'coOwners'), seller.coOwners]),
      ]),
      section('mandate_details', 'Mandate Details', FileText, [
        field('mandateType', 'Mandate type', [mandateType]),
        field('askingPrice', 'Asking price', [askingPrice], 'currency'),
        field('mandateStartDate', 'Mandate start date', [valueFor('mandateStartDate', 'startDate'), marketingDraft.listingDate, listingRecord?.mandateStartDate], 'date'),
        field('expiryDate', 'Expiry date', [valueFor('expiryDate', 'mandateEndDate'), mandateWorkspace.expiryDate], 'date'),
        field('commissionPreference', 'Commission preference', [
          valueFor(
            'commissionPreference',
            'commissionType',
            'commissionStructure',
            'commissionPercentage',
            'commissionPercent',
            'commission_percent',
            'mandateCommissionPercentage',
            'mandateCommissionPercent',
            'commissionAmount',
            'commission_amount',
            'mandateCommissionAmount',
          ),
          listingRecord?.commission?.percentage,
          listingRecord?.commission?.commission_percentage,
          listingRecord?.commission?.amount,
          listingRecord?.commission?.commission_amount,
        ]),
        field('mandateTerms', 'Mandate terms', [valueFor('mandateTerms', 'mandateCommissionTerms'), listingRecord?.commission?.mandateTerms, listingRecord?.commission?.mandate_terms]),
        field('popiConsent', 'POPI consent', [popiConsent]),
      ]),
      section('compliance', 'Compliance', ShieldCheck, [
        field('ficaStatus', 'FICA status', [valueFor('ficaStatus'), seller.ficaStatus]),
        field('taxNumber', 'Tax number', [valueFor('taxNumber', 'sellerTaxNumber'), seller.taxNumber]),
        field('popiConsent', 'POPI consent', [popiConsent]),
        field('electricalCertificate', 'Electrical certificate', [valueFor('electricalCertificate', 'electricalComplianceCertificate', 'cocElectrical'), seller.electricalCertificate]),
        field('plumbingCertificate', 'Plumbing certificate', [valueFor('plumbingCertificate', 'cocPlumbing'), seller.plumbingCertificate]),
        field('occupationCertificate', 'Occupation certificate', [valueFor('occupationCertificate', 'occupancyCertificate'), seller.occupationCertificate]),
        field('buildingPlans', 'Building plans', [valueFor('buildingPlans', 'approvedBuildingPlans'), seller.buildingPlans]),
      ]),
      section('notes', 'Notes / Special Conditions', Info, [
        field('sellingReason', 'Selling reason', [valueFor('sellingReason'), seller.sellingReason]),
        field('sellingTimeline', 'Selling timeline', [valueFor('sellingTimeline'), seller.sellingTimeline]),
        field('specialConditions', 'Special conditions', [valueFor('specialConditions', 'conditions'), seller.specialConditions]),
        field('notes', 'Notes', [valueFor('notes', 'sellerNotes'), seller.notes]),
      ]),
    ]
    const completionRows = sections.flatMap((item) => item.rows)
    const completed = completionRows.filter((row) => isSellerProfileFilled(row.rawValue)).length
    const completionPercent = completionRows.length ? Math.round((completed / completionRows.length) * 100) : 0
    const status = completionPercent >= 90 ? 'Complete' : completionPercent >= 60 ? 'In Progress' : 'Needs Attention'
    return {
      initials: getInitials(sellerName),
      name: formatSellerProfileValue(sellerName),
      type: `${formatSellerProfileValue(sellerTypeRaw)} Seller`,
      propertyAddress: formatSellerProfileValue(propertyAddress),
      mandateType: formatSellerProfileValue(mandateType),
      askingPrice: formatSellerProfileValue(askingPrice, 'currency'),
      status,
      completionPercent,
      sections,
    }
  }, [listingRecord, mandateWorkspace.expiryDate, marketingDraft.addressLine1, marketingDraft.listingDate, marketingDraft.price, sellerFormData])

  const nextBestAction = useMemo(
    () =>
      getNextBestAction({
        pendingOffers: metrics.pendingOffers,
        missingDocuments,
        onboardingStatus: onboardingStatusLabel,
        sellerProfileCompletion: sellerProfile.completionPercent,
      }),
    [metrics.pendingOffers, missingDocuments, onboardingStatusLabel, sellerProfile.completionPercent],
  )

  const commissionWorkspace = useMemo(() => {
    const commission = listingRecord?.commission || {}
    const percentage = Number(firstDraftValue(
      commission?.commission_percentage,
      commission?.percentage,
      sellerFormData?.commissionPercentage,
      sellerFormData?.commissionPercent,
      sellerFormData?.commission_percent,
      sellerFormData?.mandateCommissionPercentage,
      sellerFormData?.mandateCommissionPercent,
      0,
    )) || 0
    const amount = Number(firstDraftValue(
      commission?.commission_amount,
      commission?.amount,
      sellerFormData?.commissionAmount,
      sellerFormData?.commission_amount,
      sellerFormData?.mandateCommissionAmount,
      0,
    )) || 0
    const price = Number(marketingDraft.price || listingRecord?.askingPrice || 0) || 0
    const estimatedExVat = amount || (price && percentage ? (price * percentage) / 100 : 0)
    const vatHandling = String(firstDraftValue(commission?.vat, commission?.vat_handling, sellerFormData?.vatHandling, sellerFormData?.vatApplicable, '')).trim()
    const vatIncluded = vatHandling.toLowerCase().includes('incl') || vatHandling.toLowerCase() === 'yes'
    const estimatedInclVat = vatIncluded ? estimatedExVat : estimatedExVat ? estimatedExVat * 1.15 : 0
    const mandateTerms = firstDraftValue(commission?.mandate_terms, commission?.mandateTerms, sellerFormData?.mandateTerms, sellerFormData?.mandateCommissionTerms, sellerFormData?.specialConditions)
    const paymentResponsibility = firstDraftValue(commission?.payment_responsibility, commission?.paymentResponsibility, sellerFormData?.paymentResponsibility)
    const notes = firstDraftValue(commission?.commission_notes, commission?.notes, sellerFormData?.commissionNotes, sellerFormData?.notes, '')
    const lastUpdated = firstDraftValue(commission?.updated_at, commission?.updatedAt, listingRecord?.mandate?.updatedAt, listingRecord?.updatedAt)
    const hasData = Boolean(percentage || amount || vatHandling || mandateTerms || paymentResponsibility || notes)
    return {
      type: listingRecord?.mandateType || listingRecord?.mandate?.type || 'sole',
      percentage,
      amount,
      estimatedInclVat,
      hasData,
      estimatedExVat,
      vatHandling: vatHandling || 'Not captured',
      vatIncluded,
      split: firstDraftValue(commission?.commission_split, commission?.split, sellerFormData?.agencyCommissionStructureName, sellerFormData?.agency_commission_structure_name, sellerFormData?.commissionStructureName) || 'Not captured',
      coAgentSplit: commission?.co_agent_split || commission?.coAgentSplit || 'Not captured',
      referralSplit: commission?.referral_split || commission?.referralSplit || 'Not captured',
      mandateTerms: mandateTerms || '',
      paymentResponsibility: paymentResponsibility || '',
      notes,
      lastUpdatedSource: lastUpdated ? `Updated ${formatDate(lastUpdated)}` : 'No captured source',
    }
  }, [listingRecord, marketingDraft.price, sellerFormData])

  const listingMandateStartSummary = useMemo(() => {
    const sellerEmail = resolveSellerEmailFromListing(listingRecord)
    const sellerPhone = resolveSellerPhoneFromListing(listingRecord)
    const commissionValue = commissionWorkspace.amount
      ? formatCurrency(commissionWorkspace.amount)
      : commissionWorkspace.percentage
        ? formatPercentValue(commissionWorkspace.percentage)
        : commissionWorkspace.mandateTerms || ''
    return [
      {
        label: 'Listing',
        value: marketingDraft.headline || listingRecord?.listingTitle || listingRecord?.title || listingRecord?.listingCode || 'Current listing',
      },
      {
        label: 'Seller',
        value: resolveSellerNameFromListing(listingRecord) || sellerProfile.name || 'Seller not named',
      },
      {
        label: 'Contact',
        value: sellerEmail || sellerPhone || 'Missing contact',
      },
      {
        label: 'Commission',
        value: commissionValue || 'Not captured',
      },
    ]
  }, [
    commissionWorkspace.amount,
    commissionWorkspace.mandateTerms,
    commissionWorkspace.percentage,
    listingRecord,
    marketingDraft.headline,
    sellerProfile.name,
  ])
  const acceptedOfferOtpStartSummary = useMemo(() => {
    const offer = acceptedOfferOtpStartOffer || {}
    return [
      {
        label: 'Buyer',
        value: normalizeText(offer.buyerName || offer.conditionsJson?.buyerName || offer.conditions?.buyerName) || 'Buyer',
      },
      {
        label: 'Accepted offer',
        value: offer.offerPrice ? formatCurrency(offer.offerPrice) : 'Offer details',
      },
      {
        label: 'Property',
        value: marketingDraft.headline || listingRecord?.listingTitle || listingRecord?.title || 'Current listing',
      },
      {
        label: 'Transaction',
        value: normalizeText(offer.transactionId || offer.transaction_id) || 'Create transaction first',
      },
    ]
  }, [acceptedOfferOtpStartOffer, listingRecord, marketingDraft.headline])
  const listingMandateLegalScenario = useMemo(() => ({
    sellerEntityType:
      listingRecord?.sellerEntityType ||
      listingRecord?.seller_entity_type ||
      listingRecord?.sellerType ||
      listingRecord?.seller_type ||
      sellerProfile?.entityType ||
      sellerProfile?.sellerType,
    sellerMaritalRegime:
      listingRecord?.sellerMaritalRegime ||
      listingRecord?.seller_marital_regime ||
      listingRecord?.sellerMaritalStatus ||
      listingRecord?.seller_marital_status,
    propertyTitleType:
      listingRecord?.propertyTitleType ||
      listingRecord?.property_title_type ||
      listingRecord?.propertyStructureType ||
      listingRecord?.property_structure_type ||
      listingRecord?.propertyType ||
      listingRecord?.property_type,
  }), [listingRecord, sellerProfile])
  const acceptedOfferOtpLegalScenario = useMemo(() => {
    const offer = acceptedOfferOtpStartOffer || {}
    return {
      sellerEntityType: listingMandateLegalScenario.sellerEntityType,
      sellerMaritalRegime: listingMandateLegalScenario.sellerMaritalRegime,
      buyerEntityType:
        offer.buyerEntityType || offer.buyer_entity_type || offer.purchaserType || offer.purchaser_type ||
        offer.conditionsJson?.buyerEntityType || offer.conditions?.buyerEntityType,
      buyerMaritalRegime:
        offer.buyerMaritalRegime || offer.buyer_marital_regime || offer.buyerMaritalStatus || offer.buyer_marital_status ||
        offer.conditionsJson?.buyerMaritalRegime || offer.conditions?.buyerMaritalRegime,
      propertyTitleType: listingMandateLegalScenario.propertyTitleType,
      financeType:
        offer.financeType || offer.finance_type || offer.conditionsJson?.financeType || offer.conditions?.financeType,
    }
  }, [acceptedOfferOtpStartOffer, listingMandateLegalScenario])
  useEffect(() => {
    setCommissionDraft({
      percentage: commissionWorkspace.percentage ? String(commissionWorkspace.percentage) : '',
      amount: commissionWorkspace.amount ? String(commissionWorkspace.amount) : '',
      vatHandling: commissionWorkspace.vatHandling === 'Not captured' ? '' : commissionWorkspace.vatHandling,
      mandateTerms: commissionWorkspace.mandateTerms || '',
      paymentResponsibility: commissionWorkspace.paymentResponsibility || '',
      notes: commissionWorkspace.notes || '',
    })
  }, [
    commissionWorkspace.amount,
    commissionWorkspace.mandateTerms,
    commissionWorkspace.notes,
    commissionWorkspace.paymentResponsibility,
    commissionWorkspace.percentage,
    commissionWorkspace.vatHandling,
  ])

  const commissionDraftPreview = useMemo(() => {
    const percentage = Number(commissionDraft.percentage || 0) || 0
    const amount = Number(commissionDraft.amount || 0) || 0
    const price = Number(marketingDraft.price || listingRecord?.askingPrice || 0) || 0
    const estimatedExVat = amount || (price && percentage ? (price * percentage) / 100 : 0)
    const vatHandling = String(commissionDraft.vatHandling || '').trim().toLowerCase()
    const vatIncluded = vatHandling.includes('incl') || vatHandling === 'yes' || vatHandling === 'inclusive'
    return {
      estimatedExVat,
      estimatedInclVat: vatIncluded ? estimatedExVat : estimatedExVat ? estimatedExVat * 1.15 : 0,
    }
  }, [commissionDraft.amount, commissionDraft.percentage, commissionDraft.vatHandling, listingRecord?.askingPrice, marketingDraft.price])

  const mandateActivityItems = useMemo(() => {
    const items = []
    const add = (title, timestamp, copy, icon = FolderKanban) => {
      if (!timestamp) return
      items.push({ title, timestamp, copy, icon })
    }
    add('Listing workspace created', listingRecord?.createdAt, `${listingRecord?.listingTitle || 'Listing'} was created.`, Home)
    add('Seller portal sent', listingRecord?.sellerOnboarding?.sentAt || listingRecord?.sellerOnboarding?.createdAt, 'Seller onboarding portal link was issued.', ExternalLink)
    add('Seller completed onboarding', listingRecord?.sellerOnboarding?.submittedAt || listingRecord?.sellerOnboarding?.completedAt, 'Seller onboarding form was submitted.', CheckCircle2)
    ;(Array.isArray(listingRecord?.documents) ? listingRecord.documents : []).forEach((document) => {
      add(
        `Document uploaded: ${document?.document_name || document?.documentName || document?.fileName || document?.name || formatStatusLabel(document?.document_type || 'document')}`,
        document?.uploadedAt || document?.uploaded_at || document?.createdAt || document?.created_at,
        formatStatusLabel(document?.document_type || document?.category || 'Seller document'),
        FileText,
      )
    })
    add('Mandate generated', listingRecord?.mandate?.generatedAt || listingRecord?.mandate?.createdAt, 'Mandate PDF was generated for seller review.', FileText)
    add('Mandate signed', mandateWorkspace.signedDate, 'All required mandate signatures were completed.', CheckCircle2)
    add('Mandate viewed', listingRecord?.mandate?.viewedAt, 'Signed mandate was viewed from the workspace.', ExternalLink)
    add('Mandate downloaded', listingRecord?.mandate?.downloadedAt, 'Signed mandate was downloaded.', ExternalLink)
    const publishedAt = ['active', 'published', 'live'].includes(String(marketingDraft.listingStatus || listingRecord?.status || '').toLowerCase()) || marketingDraft.bridgeListingStatus === 'published'
      ? marketingDraft.listingDate || listingRecord?.updatedAt
      : ''
    add('Listing published', publishedAt, 'Listing publication status is active.', ExternalLink)
    add('Commission updated', commissionWorkspace.hasData ? listingRecord?.commission?.updated_at || listingRecord?.commission?.updatedAt || listingRecord?.updatedAt : '', 'Commission structure was captured or updated.', HandCoins)
    return items.sort((left, right) => new Date(left.timestamp || 0) - new Date(right.timestamp || 0))
  }, [commissionWorkspace.hasData, listingRecord, mandateWorkspace.signedDate, marketingDraft.bridgeListingStatus, marketingDraft.listingDate, marketingDraft.listingStatus])

  const coverImage = useMemo(() => {
    return marketingDraft.galleryImages.find((image) => String(image?.id) === String(marketingDraft.coverImageId)) || marketingDraft.galleryImages[0] || null
  }, [marketingDraft.coverImageId, marketingDraft.galleryImages])
  const arch9PublicListingUrl = useMemo(
    () => buildArch9PublicListingUrl(marketingDraft, listingRecord),
    [listingRecord, marketingDraft],
  )
  const arch9PublicationBlockers = useMemo(
    () => getArch9PublicationBlockers(marketingDraft, coverImage),
    [coverImage, marketingDraft],
  )
  const arch9CanPublish = arch9PublicationBlockers.length === 0
  const arch9IsPublished = normalizeKey(marketingDraft.publicationStatus) === 'published' && normalizeKey(marketingDraft.bridgeListingStatus) === 'published'
  const property24StatusKey = normalizeKey(marketingDraft.property24Status || listingRecord?.property24Status || listingRecord?.property24_status)
  const property24Reference = String(marketingDraft.property24Reference || listingRecord?.property24Reference || listingRecord?.property24_reference || '').trim()
  const property24Published = ['published', 'live', 'active'].includes(property24StatusKey)
  const property24PreviewCounts = getProperty24ReadinessCounts(property24Preview)
  const property24ReadinessIssues = getProperty24ReadinessIssues(property24Preview)
  const property24LeadImportCounts = getProperty24LeadImportCounts(property24LeadImport)
  const property24StatusCheckedAt = getProperty24StatusCheckedAt(property24StatusCheck)
  const property24HasReference = Boolean(property24Reference)
  const property24CanSubmit = property24Preview?.preview?.canSubmit ?? property24Preview?.report?.preview?.canSubmit ?? null
  const property24HasPreviewBlockers = property24PreviewCounts.dataBlockers > 0 || property24PreviewCounts.technicalBlockers > 0
  const property24SandboxAgentIdPending = hasProperty24SandboxAgentIdBlocker(property24Preview)
  const property24PublishDisabled = Boolean(property24Action) || property24CanSubmit !== true || property24HasPreviewBlockers
  const property24PrimaryActionLabel = property24HasReference ? 'Update Existing Listing' : 'Publish New Listing'
  const property24NextStep = property24SandboxAgentIdPending
    ? 'Sandbox payload can be reviewed. Real publishing stays blocked until Property24 returns a usable agent ID.'
    : property24HasPreviewBlockers
    ? 'Fix the preview blockers before sending this listing to Property24.'
    : property24CanSubmit === true && !property24HasReference
      ? 'Preview passed. This is ready for the first ExDev publish.'
      : property24HasReference
        ? 'This listing already has a Property24 reference. Future publishes update the same listing.'
        : 'Start with Preview. Arch9 will save the listing first, then check Property24 readiness.'
  const externalListingLinks = useMemo(
    () => normalizeExternalListingLinks(marketingDraft.externalLinks),
    [marketingDraft.externalLinks],
  )
  const privatePropertyStatusKey = normalizeKey(marketingDraft.privatePropertyStatus || listingRecord?.privatePropertyStatus)
  const privatePropertyHasChannel = Boolean(marketingDraft.privatePropertyListingUrl || marketingDraft.privatePropertyReference || (privatePropertyStatusKey && privatePropertyStatusKey !== 'not_published'))
  const privatePropertyLink = externalListingLinks.find((link) => normalizeKey(link.platform).includes('private')) || null
  const agencyWebsiteLink = externalListingLinks.find((link) => normalizeKey(link.platform).includes('agency')) || null
  const property24LastSyncedAt = firstDraftValue(
    property24StatusCheckedAt,
    listingRecord?.property24LastSyncedAt,
    listingRecord?.property24_last_synced_at,
    listingRecord?.property24UpdatedAt,
    listingRecord?.property24_updated_at,
    listingRecord?.updatedAt,
    listingRecord?.updated_at,
  )
  const marketingLastSyncedAt = firstDraftValue(
    property24LastSyncedAt,
    listingRecord?.publicationData?.updatedAt,
    listingRecord?.publicationData?.updated_at,
    listingRecord?.updatedAt,
    listingRecord?.updated_at,
  )
  const privatePropertyPortalUrl = marketingDraft.privatePropertyListingUrl || privatePropertyLink?.url || ''
  const privatePropertyPortalReference = marketingDraft.privatePropertyReference || privatePropertyLink?.reference || ''
  const privatePropertyPortalStatus = privatePropertyStatusKey || normalizeKey(privatePropertyLink?.status || 'not_published')
  const privatePropertyPortalLive = ['published', 'live', 'active'].includes(privatePropertyPortalStatus)
  const salesPortalReadinessSummaries = useMemo(() => [
    buildListingWorkspacePortalSummary({
      type: 'sales',
      portal: 'Property24',
      logoSrc: '/lead-sources/property24.png',
      published: property24Published,
      checked: property24CanSubmit !== null,
      missingFields: property24SandboxAgentIdPending ? [] : property24ReadinessIssues,
      setupBlockers: property24SandboxAgentIdPending ? ['Property24 agent ID still needs to be confirmed before live publishing.'] : [],
      reference: property24Reference,
      lastSynced: property24LastSyncedAt ? `Last synced: ${formatRelativeTime(property24LastSyncedAt)}` : '',
      detail: property24NextStep,
      actionLabel: 'Open syndication',
      actionTarget: 'property24',
    }),
    buildListingWorkspacePortalSummary({
      type: 'sales',
      portal: 'Private Property',
      logoSrc: '/lead-sources/private-property.jpeg',
      published: privatePropertyPortalLive,
      checked: privatePropertyHasChannel,
      missingFields: privatePropertyHasChannel ? [] : ['Private Property channel is not configured on this listing yet.'],
      reference: privatePropertyPortalReference,
      lastSynced: privatePropertyPortalUrl ? 'Managed as an external link' : '',
      detail: privatePropertyPortalLive
        ? 'Private Property is marked live for this listing.'
        : privatePropertyHasChannel
          ? 'Private Property channel details are saved. Confirm the portal status before go-live.'
          : 'Add the Private Property channel from the marketing console when this listing is ready.',
      actionLabel: 'Manage channel',
      actionTarget: 'private_property',
    }),
  ], [
    privatePropertyHasChannel,
    privatePropertyPortalLive,
    privatePropertyPortalReference,
    privatePropertyPortalUrl,
    property24CanSubmit,
    property24LastSyncedAt,
    property24NextStep,
    property24Published,
    property24ReadinessIssues,
    property24Reference,
    property24SandboxAgentIdPending,
  ])
  const salesPortalActionPlan = useMemo(
    () => buildListingWorkspacePortalActionPlan(salesPortalReadinessSummaries, { type: 'sales' }),
    [salesPortalReadinessSummaries],
  )
  const salesPortalPublishGate = useMemo(
    () => buildListingWorkspacePortalPublishGate(salesPortalReadinessSummaries, { type: 'sales' }),
    [salesPortalReadinessSummaries],
  )
  const salesPortalGoLiveProof = useMemo(
    () => buildListingWorkspacePortalGoLiveProof(salesPortalReadinessSummaries, { type: 'sales' }),
    [salesPortalReadinessSummaries],
  )
  const salesPortalChecklist = useMemo(
    () => buildListingWorkspacePortalChecklist(salesPortalReadinessSummaries, { type: 'sales' }),
    [salesPortalReadinessSummaries],
  )
  const salesPortalFixGuide = useMemo(
    () => buildListingWorkspacePortalFixGuide(salesPortalReadinessSummaries, { type: 'sales' }),
    [salesPortalReadinessSummaries],
  )
  const incompleteReadinessItems = listingReadinessItems.filter((item) => !item.complete)
  const marketingSellingPoints = normalizeListingFeatureSelections(
    marketingDraft.selectedFeatures,
    marketingDraft.amenities,
    marketingDraft.petFriendly ? 'Pet Friendly' : '',
    marketingDraft.fibreReady ? 'Fibre Ready' : '',
    marketingDraft.securityFeatures ? 'Security' : '',
  )
  const marketingMediaBadges = [
    { key: 'photos', label: `${marketingDraft.galleryImages.length} photo${marketingDraft.galleryImages.length === 1 ? '' : 's'}`, complete: marketingDraft.galleryImages.length > 0 },
    { key: 'cover', label: coverImage?.url ? 'Cover selected' : 'Cover missing', complete: Boolean(coverImage?.url) },
    { key: 'floorplan', label: marketingDraft.floorplans.length ? `${marketingDraft.floorplans.length} floor plan${marketingDraft.floorplans.length === 1 ? '' : 's'}` : 'Floor plan missing', complete: marketingDraft.floorplans.length > 0 },
    { key: 'video', label: marketingDraft.videoLink ? 'Video added' : 'Video not added', complete: Boolean(marketingDraft.videoLink) },
    { key: 'tour', label: marketingDraft.virtualTourLink ? 'Virtual tour added' : 'Virtual tour not added', complete: Boolean(marketingDraft.virtualTourLink) },
  ]

  useEffect(() => {
    setArch9LiveChecking(false)
  }, [arch9PublicListingUrl])

  const sectionStatuses = useMemo(() => {
    const basicComplete = Boolean(marketingDraft.headline.trim() && marketingDraft.propertyType && marketingDraft.suburb.trim() && marketingDraft.city.trim())
    const specsComplete = Boolean(marketingDraft.bedrooms || marketingDraft.bathrooms || marketingDraft.erfSize || marketingDraft.floorSize)
    const financialComplete = Boolean(marketingDraft.price && (marketingDraft.leviesNotApplicable || marketingDraft.levies) && (marketingDraft.ratesTaxesNotApplicable || marketingDraft.ratesTaxes))
    const featuresComplete = marketingDraft.selectedFeatures.length > 0
    const descriptionComplete = Boolean(marketingDraft.description.trim())
    const floorplansComplete = marketingDraft.floorplans.length > 0
    const galleryComplete = marketingDraft.galleryImages.length > 0 && Boolean(coverImage?.url)
    const portalComplete = Boolean(
      (marketingDraft.property24Status !== 'published' || marketingDraft.property24ListingUrl.trim() || marketingDraft.property24Reference.trim()) &&
      (marketingDraft.privatePropertyStatus !== 'published' || marketingDraft.privatePropertyListingUrl.trim() || marketingDraft.privatePropertyReference.trim()) &&
      (marketingDraft.property24Status !== 'not_published' || marketingDraft.privatePropertyStatus !== 'not_published' || marketingDraft.bridgeListingStatus !== 'not_published'),
    )
    return [
      { key: 'basic', label: 'Basic Information', complete: basicComplete },
      { key: 'specs', label: 'Property Specs', complete: specsComplete },
      { key: 'financial', label: 'Financial Details', complete: financialComplete },
      { key: 'features', label: 'Features & Amenities', complete: featuresComplete },
      { key: 'description', label: 'Description', complete: descriptionComplete },
      { key: 'portal', label: 'Portal Listings', complete: portalComplete },
      { key: 'floorplans', label: 'Floor Plans', complete: floorplansComplete },
      { key: 'gallery', label: 'Image Gallery', complete: galleryComplete },
    ]
  }, [coverImage?.url, marketingDraft])

  const sectionStatusByKey = useMemo(() => {
    return sectionStatuses.reduce((map, item) => ({ ...map, [item.key]: item }), {})
  }, [sectionStatuses])

  const galleryPreviewImages = useMemo(() => {
    return showFullGallery ? marketingDraft.galleryImages : marketingDraft.galleryImages.slice(0, 4)
  }, [marketingDraft.galleryImages, showFullGallery])

  const propertySummaryFacts = useMemo(() => [
    marketingDraft.propertyType || 'Property',
    marketingDraft.bedrooms ? `${marketingDraft.bedrooms} Beds` : '',
    marketingDraft.bathrooms ? `${marketingDraft.bathrooms} Baths` : '',
    marketingDraft.garages ? `${marketingDraft.garages} Garages` : '',
    marketingDraft.floorSize ? `${marketingDraft.floorSize} m² floor` : '',
    marketingDraft.erfSize ? `${marketingDraft.erfSize} m² erf` : '',
  ].filter(Boolean), [marketingDraft])

  const viewingGroups = useMemo(() => ({
    pending: viewings.filter((item) => [VIEWING_STATUS.PENDING_APPROVAL, VIEWING_STATUS.RESCHEDULE_REQUESTED, VIEWING_STATUS.VIEWING_REQUESTED].includes(String(item?.status || '').trim().toLowerCase())),
    confirmed: viewings.filter((item) => String(item?.status || '').trim().toLowerCase() === VIEWING_STATUS.CONFIRMED),
    completed: viewings.filter((item) => [VIEWING_STATUS.COMPLETED, VIEWING_STATUS.NO_SHOW, VIEWING_STATUS.CANCELLED, VIEWING_STATUS.DECLINED].includes(String(item?.status || '').trim().toLowerCase())),
  }), [viewings])

  const listingIdentity = useMemo(() => {
    const address = firstDraftValue(
      marketingDraft.addressLine1,
      sellerFormData?.propertyAddress,
      sellerFormData?.addressLine1,
      listingRecord?.addressLine1,
      listingRecord?.propertyAddress,
      listingRecord?.address,
      '',
    )
    const suburb = firstDraftValue(marketingDraft.suburb, listingRecord?.suburb, sellerFormData?.suburb)
    const city = firstDraftValue(marketingDraft.city, listingRecord?.city, sellerFormData?.city)
    const province = firstDraftValue(marketingDraft.province, listingRecord?.province, sellerFormData?.province)
    const location = [suburb || city, province || (suburb && city !== suburb ? city : '')].filter(Boolean).join(', ')
    const facts = [
      marketingDraft.propertyType || listingRecord?.propertyType || 'Property',
      'Private Listing',
      marketingDraft.bedrooms ? `${marketingDraft.bedrooms} Beds` : '',
      marketingDraft.bathrooms ? `${marketingDraft.bathrooms} Baths` : '',
      marketingDraft.garages ? `${marketingDraft.garages} Garages` : '',
      marketingDraft.floorSize ? `${marketingDraft.floorSize} m² floor` : '',
      marketingDraft.erfSize ? `${marketingDraft.erfSize} m² stand` : '',
    ].filter(Boolean)
    return {
      title: String(address || '').trim() || 'Address not captured',
      location: location || [suburb, city, province].filter(Boolean).join(', ') || 'Location pending',
      facts,
    }
  }, [listingRecord, marketingDraft, sellerFormData])

  const listingPerformance = useMemo(() => {
    const askingPrice = Number(marketingDraft.price || listingRecord?.askingPrice || 0) || 0
    const analytics = listingRecord?.analytics || listingRecord?.listingAnalytics || {}
    const overrides = getListingPerformanceOverrides(listingRecord)
    const portalViews = Number(analytics?.portalViews || analytics?.property24Views || analytics?.privatePropertyViews || 0)
    const bridgeViews = Number(analytics?.bridgeViews || analytics?.websiteViews || 0)
    const explicitViews = Number(analytics?.totalViews || analytics?.views || 0)
    const totalViews = explicitViews || portalViews + bridgeViews || 0
    const priorViews = Number(analytics?.previousPeriodViews || analytics?.previous30DayViews || analytics?.priorViews || 0)
    const viewChangePercent = priorViews ? ((totalViews - priorViews) / priorViews) * 100 : null
    const now = Date.now()
    const sevenDays = 1000 * 60 * 60 * 24 * 7
    const newThisWeek = listingLeads.filter((lead) => {
      const timestamp = new Date(lead?.createdAt || lead?.created_at || lead?.updatedAt || lead?.updated_at || 0).getTime()
      return Number.isFinite(timestamp) && now - timestamp <= sevenDays
    }).length
    const qualifiedLeads = listingLeads.filter((lead) => {
      const stage = getLeadStage(lead)
      return ['qualified', 'viewing', 'offer', 'negotiating', 'converted'].some((token) => stage.includes(token))
    }).length
    const convertedLeads = listingLeads.filter((lead) => {
      const stage = getLeadStage(lead)
      return stage.includes('converted') || stage.includes('sold') || stage.includes('transaction')
    }).length || metrics.acceptedCount
    const scheduledViewings = viewings.filter((item) => ![VIEWING_STATUS.CANCELLED, VIEWING_STATUS.DECLINED].includes(String(item?.status || '').trim().toLowerCase())).length
    const completedViewings = viewings.filter((item) => String(item?.status || '').trim().toLowerCase() === VIEWING_STATUS.COMPLETED).length
    const upcomingViewings = viewings.filter((item) => [VIEWING_STATUS.CONFIRMED, VIEWING_STATUS.PENDING_APPROVAL, VIEWING_STATUS.RESCHEDULE_REQUESTED, VIEWING_STATUS.VIEWING_REQUESTED].includes(String(item?.status || '').trim().toLowerCase())).length
    const noShows = viewings.filter((item) => String(item?.status || '').trim().toLowerCase() === VIEWING_STATUS.NO_SHOW).length
    const averageOffer = metrics.offerAverage || 0
    const highestOffer = metrics.highestOffer || offerSummary.highest || 0
    const offerToAskRatio = askingPrice && averageOffer ? (averageOffer / askingPrice) * 100 : askingPrice && highestOffer ? (highestOffer / askingPrice) * 100 : 0
    const areaAverageDays = Number(analytics?.areaAverageDaysOnMarket || listingRecord?.market?.areaAverageDaysOnMarket || listingRecord?.areaAverageDaysOnMarket || 0)
    const daysDelta = areaAverageDays ? ((areaAverageDays - metrics.daysOnMarket) / areaAverageDays) * 100 : 0
    const basePerformance = {
      totalViews,
      portalViews,
      bridgeViews,
      priorViews,
      viewChangePercent,
      leadCount: metrics.leadCount,
      newThisWeek,
      qualifiedLeads,
      convertedLeads,
      scheduledViewings,
      completedViewings,
      upcomingViewings,
      noShows,
      offerCount: offerRows.length,
      highestOffer,
      averageOffer,
      offerToAskRatio,
      daysOnMarket: metrics.daysOnMarket,
      marketStartDate: metrics.marketStartDate,
      areaAverageDays,
      daysPerformance: daysDelta,
      acceptedSales: metrics.acceptedCount,
      pendingOffers: metrics.pendingOffers,
    }
    return applyListingPerformanceOverrides(basePerformance, overrides)
  }, [listingLeads, listingRecord, marketingDraft.price, metrics, offerRows.length, offerSummary.highest, viewings])

  const listingConversionMetrics = useMemo(() => {
    const rate = (from, to) => (from ? (to / from) * 100 : 0)
    return [
      {
        label: 'Lead Conversion',
        value: rate(listingPerformance.totalViews, listingPerformance.leadCount),
        meta: 'Leads from views',
      },
      {
        label: 'Viewing Conversion',
        value: rate(listingPerformance.leadCount, listingPerformance.scheduledViewings),
        meta: 'Viewings from leads',
      },
      {
        label: 'Offer Conversion',
        value: rate(listingPerformance.scheduledViewings, listingPerformance.offerCount),
        meta: 'Offers from viewings',
      },
    ]
  }, [listingPerformance])

  const offerPriceOverview = useMemo(() => {
    const askingPrice = Number(marketingDraft.price || listingRecord?.askingPrice || 0) || 0
    const timestampFor = (offer) => {
      const timestamp = new Date(offer?.offerDate || offer?.submittedAt || offer?.updatedAt || offer?.updated_at || offer?.createdAt || offer?.created_at || 0).getTime()
      return Number.isFinite(timestamp) ? timestamp : 0
    }
    const latestOffer = [...offerRows].sort((left, right) => timestampFor(right) - timestampFor(left))[0] || null
    const latestOfferAmount = Number(latestOffer?.offerPrice || 0) || 0
    const highestOffer = listingPerformance.highestOffer || 0
    const averageOffer = listingPerformance.averageOffer || 0
    const comparisonBase = Math.max(askingPrice, highestOffer, averageOffer, latestOfferAmount, 1)
    const differenceToAsking = highestOffer && askingPrice ? highestOffer - askingPrice : 0
    return {
      askingPrice,
      highestOffer,
      latestOffer: latestOfferAmount,
      averageOffer,
      offerCount: listingPerformance.offerCount,
      differenceToAsking,
      askingFill: (askingPrice / comparisonBase) * 100,
      highestFill: (highestOffer / comparisonBase) * 100,
      averageFill: (averageOffer / comparisonBase) * 100,
      latestFill: (latestOfferAmount / comparisonBase) * 100,
    }
  }, [listingPerformance, listingRecord?.askingPrice, marketingDraft.price, offerRows])

  const overviewBuyerActivity = useMemo(() => {
    const timestampFor = (value) => {
      const timestamp = new Date(value || 0).getTime()
      return Number.isFinite(timestamp) ? timestamp : 0
    }
    const events = []
    listingLeads.forEach((lead) => {
      events.push({
        id: `lead-${lead?.id || lead?.leadId || events.length}`,
        buyerName: lead?.name || lead?.buyerName || lead?.contactName || 'Buyer lead',
        event: lead?.source ? `New ${formatStatusLabel(lead.source)} enquiry` : 'New lead received',
        source: lead?.source || '',
        timestamp: lead?.createdAt || lead?.created_at || lead?.updatedAt || lead?.updated_at,
      })
    })
    viewings.forEach((viewing) => {
      const status = String(viewing?.status || '').trim().toLowerCase()
      const statusLabel = status === VIEWING_STATUS.COMPLETED
        ? 'Viewing completed'
        : status === VIEWING_STATUS.CONFIRMED
          ? 'Viewing confirmed'
          : status === VIEWING_STATUS.RESCHEDULE_REQUESTED
            ? 'Viewing reschedule requested'
            : 'Requested viewing'
      events.push({
        id: `viewing-${viewing?.viewing_id || viewing?.id || events.length}`,
        buyerName: viewing?.buyer_name || viewing?.buyerName || 'Buyer',
        event: viewing?.feedback ? 'Feedback received' : statusLabel,
        source: '',
        timestamp: viewing?.updated_at || viewing?.updatedAt || viewing?.created_at || viewing?.createdAt || viewing?.proposed_date,
      })
    })
    offerRows.forEach((offer) => {
      events.push({
        id: `offer-${offer?.id || offer?.offerId || events.length}`,
        buyerName: offer?.buyerName || offer?.buyerLeadName || 'Buyer',
        event: 'Offer submitted',
        source: offer?.offerPrice ? formatMoneyValue(offer.offerPrice) : '',
        timestamp: offer?.offerDate || offer?.submittedAt || offer?.updatedAt || offer?.updated_at || offer?.createdAt || offer?.created_at,
      })
    })
    return events
      .filter((event) => timestampFor(event.timestamp))
      .sort((left, right) => timestampFor(right.timestamp) - timestampFor(left.timestamp))
      .slice(0, 5)
  }, [listingLeads, offerRows, viewings])

  const overviewUpcomingViewings = useMemo(() => {
    const timestampFor = (viewing) => {
      const scheduleValue = [viewing?.proposed_date, viewing?.proposed_time].filter(Boolean).join(' ')
      const timestamp = new Date(scheduleValue || viewing?.created_at || viewing?.createdAt || 0).getTime()
      return Number.isFinite(timestamp) ? timestamp : 0
    }
    const upcomingStatuses = [
      VIEWING_STATUS.CONFIRMED,
      VIEWING_STATUS.PENDING_APPROVAL,
      VIEWING_STATUS.RESCHEDULE_REQUESTED,
      VIEWING_STATUS.VIEWING_REQUESTED,
    ]
    return viewings
      .filter((viewing) => upcomingStatuses.includes(String(viewing?.status || '').trim().toLowerCase()))
      .map((viewing) => {
        const dateLabel = viewing?.proposed_date ? formatOverviewTimestamp([viewing.proposed_date, viewing.proposed_time].filter(Boolean).join(' ')) : 'Date pending'
        return {
          id: viewing?.viewing_id || viewing?.id || `${viewing?.buyer_name || 'buyer'}-${dateLabel}`,
          buyerName: viewing?.buyer_name || viewing?.buyerName || 'Buyer',
          status: viewing?.status || VIEWING_STATUS.VIEWING_REQUESTED,
          dateLabel,
          timestamp: timestampFor(viewing),
        }
      })
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(0, 4)
  }, [viewings])

  const sellerPortalLifecycleStatus = useMemo(
    () => resolveSellerPortalLifecycle({
      listing: listingRecord,
      accessState: sellerPortalAccessState,
      diagnostics: sellerPortalSecurityDiagnostics,
    }),
    [listingRecord, sellerPortalAccessState, sellerPortalSecurityDiagnostics],
  )
  const sellerPortalMandateEvidenceReady = useMemo(
    () => Boolean(isSellerPortalInviteReadyAfterSignedMandate(listingRecord, {
      mandateSigned: mandateWorkspace?.isSigned || mandateWorkspace?.signedDate,
    })),
    [listingRecord, mandateWorkspace?.isSigned, mandateWorkspace?.signedDate],
  )
  const sellerPortalPhysicalDocsReportedHeld = useMemo(
    () => Boolean((directListingOperationalSummary.declarations || []).find((row) =>
      row.key === 'mandate' && row.held === true,
    )),
    [directListingOperationalSummary.declarations],
  )

  const overviewSellerSnapshot = useMemo(() => {
    const lastOfferShare = offerRows.find((offer) => offer?.sentToSellerAt || normalizeOfferWorkflowStatus(offer?.status) === OFFER_WORKFLOW_STATUS.SELLER_REVIEW)
    const lastSellerContact = firstDraftValue(
      lastOfferShare?.sentToSellerAt,
      listingRecord?.sellerReport?.lastSentAt,
      listingRecord?.sellerOnboarding?.updatedAt,
      mandateWorkspace.signedDate,
      listingRecord?.updatedAt,
    )
    const ficaField = sellerProfile.sections
      .find((section) => section.key === 'compliance')?.rows
      .find((row) => row.key === 'ficaStatus')
    const ficaComplete = sellerDocuments.length
      ? sellerDocuments.every((document) => ['approved', 'complete', 'completed', 'uploaded', 'verified'].includes(normalizeKey(document.status)))
      : isSellerProfileFilled(ficaField?.rawValue)
    return {
      name: resolveSellerNameFromListing(listingRecord) || sellerProfile.name || 'Seller pending',
      portalStatus: getSellerPortalStatusLabel(sellerPortalLifecycleStatus),
      portalStatusKey: sellerPortalLifecycleStatus,
      ficaStatus: ficaComplete ? 'Complete' : ficaField?.value && ficaField.value !== 'Not captured' ? ficaField.value : 'Outstanding',
      ficaStatusKey: ficaComplete ? 'complete' : 'pending',
      mandateStatus: mandateWorkspace.isSigned ? 'Signed' : mandateWorkspace.label || 'Draft',
      mandateStatusKey: mandateWorkspace.isSigned ? 'signed' : mandateWorkspace.status,
      mandateExpiry: mandateWorkspace.expiryDate ? formatDate(mandateWorkspace.expiryDate) : 'Not captured',
      lastContact: lastSellerContact ? formatOverviewTimestamp(lastSellerContact) : 'No recent contact',
    }
  }, [listingRecord, mandateWorkspace, offerRows, sellerDocuments, sellerPortalLifecycleStatus, sellerProfile])

  const overviewMarketingSnapshot = useMemo(() => {
    const portalRows = [
      ['Property24', marketingDraft.property24Status, marketingDraft.property24ListingUrl || marketingDraft.property24Reference],
      ['Private Property', marketingDraft.privatePropertyStatus, marketingDraft.privatePropertyListingUrl || marketingDraft.privatePropertyReference],
      ['Arch9', marketingDraft.bridgeListingStatus || marketingDraft.publicationStatus, arch9PublicListingUrl || marketingDraft.bridgeListingPublicUrl],
    ]
      .filter(([, status, reference]) => normalizeKey(status) !== 'not_published' || reference)
      .map(([label, status, reference]) => ({
        label,
        value: normalizeKey(status) === 'not_published' && reference ? 'Linked' : formatStatusLabel(status || 'not_published'),
        status: normalizeKey(status) === 'published' || normalizeKey(status) === 'live' || normalizeKey(status) === 'active' ? 'published' : 'pending',
      }))
    return {
      portalRows,
      rows: [
        ...portalRows,
        { label: 'Photos', value: `${marketingDraft.galleryImages.length} uploaded`, status: marketingDraft.galleryImages.length ? 'complete' : 'pending' },
        { label: 'Description', value: marketingDraft.description.trim() ? 'Ready' : 'Needs improvement', status: marketingDraft.description.trim() ? 'complete' : 'pending' },
      ].slice(0, 5),
    }
  }, [arch9PublicListingUrl, marketingDraft])

  const overviewRecentActivity = useMemo(() => {
    return [...activityItems, ...mandateActivityItems]
      .filter((item) => item?.timestamp)
      .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0))
      .slice(0, 5)
  }, [activityItems, mandateActivityItems])

  const overviewPricePosition = useMemo(() => {
    const percentageDifference = offerPriceOverview.differenceToAsking && offerPriceOverview.askingPrice
      ? (offerPriceOverview.differenceToAsking / offerPriceOverview.askingPrice) * 100
      : 0
    return {
      ...offerPriceOverview,
      percentageDifference,
      differenceLabel: offerPriceOverview.offerCount && offerPriceOverview.askingPrice
        ? `${offerPriceOverview.differenceToAsking > 0 ? '+' : ''}${formatMoneyValue(offerPriceOverview.differenceToAsking)} (${formatSignedPercentValue(percentageDifference)})`
        : '—',
    }
  }, [offerPriceOverview])

  const sellerPortalActivationPreview = useMemo(
    () => buildSellerPortalInvitationPreview({
      activationSource: SELLER_PORTAL_ACTIVATION_SOURCES.existingListing,
      sellerName: [sellerPortalActivationDraft.firstName, sellerPortalActivationDraft.lastName].filter(Boolean).join(' ') || resolveSellerNameFromListing(listingRecord),
      propertyAddress: listingRecord?.propertyAddress || listingRecord?.formattedAddress || listingRecord?.listingTitle || listingRecord?.title || 'your property',
      agencyName: profile?.organisationName || profile?.companyName || profile?.agencyName || 'Arch9',
      agentName: listingActor.name || profile?.fullName || profile?.email || '',
    }),
    [listingActor.name, listingRecord, profile?.agencyName, profile?.companyName, profile?.email, profile?.fullName, profile?.organisationName, sellerPortalActivationDraft.firstName, sellerPortalActivationDraft.lastName],
  )

  function openSellerPortalActivationModal() {
    const canonicalFacts = listingRecord?.sellerCanonicalFacts || listingRecord?.seller_canonical_facts_json || {}
    const nameParts = resolveSellerNameFromListing(listingRecord).split(/\s+/).filter(Boolean)
    setSellerPortalActivationDraft({
      firstName: toCleanText(canonicalFacts.firstName || sellerFormData?.sellerFirstName || sellerFormData?.firstName || nameParts[0]),
      lastName: toCleanText(canonicalFacts.lastName || sellerFormData?.sellerSurname || sellerFormData?.lastName || nameParts.slice(1).join(' ')),
      email: resolveSellerEmailFromListing(listingRecord),
      phone: resolveSellerPhoneFromListing(listingRecord),
    })
    setSellerPortalActivationOpen(true)
    setDetailError('')
    setDetailMessage('')
  }

  function updateSellerPortalActivationDraft(key, value) {
    setSellerPortalActivationDraft((previous) => ({ ...previous, [key]: value }))
  }

  async function handleActivateSellerPortal(event) {
    event.preventDefault()
    if (!listingRecord?.id) return
    const firstName = toCleanText(sellerPortalActivationDraft.firstName)
    const lastName = toCleanText(sellerPortalActivationDraft.lastName)
    const email = toCleanText(sellerPortalActivationDraft.email).toLowerCase()
    const phone = toCleanText(sellerPortalActivationDraft.phone)
    if (!isValidEmail(email)) {
      setDetailError('Add a valid seller email before sending the Seller Portal invitation.')
      return
    }
    if (!isSupabaseConfigured || !isUuidLike(listingRecord.id)) {
      setDetailError('Seller Portal activation requires a Supabase-backed listing.')
      return
    }
    if (!sellerPortalMandateEvidenceReady) {
      setDetailError('Upload the signed mandate before activating the Seller Portal.')
      return
    }

    setSellerPortalActivationSending(true)
    setDetailError('')
    setDetailMessage('')
    try {
      const sellerCanonicalFacts = {
        ...(listingRecord?.sellerCanonicalFacts || listingRecord?.seller_canonical_facts_json || {}),
        firstName,
        lastName,
        sellerName: [firstName, lastName].filter(Boolean).join(' '),
        name: [firstName, lastName].filter(Boolean).join(' '),
        fullName: [firstName, lastName].filter(Boolean).join(' '),
        email,
        sellerEmail: email,
        phone,
        sellerPhone: phone,
        mobile: phone,
        sellerPortalActivationContext: {
          source: SELLER_PORTAL_ACTIVATION_SOURCES.existingListing,
          existingListingShortcut: true,
          mandateEvidenceRecorded: sellerPortalMandateEvidenceReady,
          directListingDeclarationMandateHeld: sellerPortalPhysicalDocsReportedHeld,
          capturedAt: new Date().toISOString(),
          capturedBy: profile?.id || profile?.email || '',
        },
      }
      const sellerCanonicalFactReadiness = {
        ...(listingRecord?.sellerCanonicalFactReadiness || listingRecord?.seller_canonical_fact_readiness_json || {}),
        sellerName: Boolean(sellerCanonicalFacts.fullName),
        sellerEmail: true,
        sellerPhone: Boolean(phone),
      }
      await updatePrivateListing(listingRecord.id, {
        sellerCanonicalFacts,
        sellerCanonicalFactReadiness,
        sellerCanonicalFactsUpdatedAt: new Date().toISOString(),
      }, { includeRequirementsAndDocuments: false }).catch(() => null)

      const result = await activateSellerPortalForListing({
        listingId: listingRecord.id,
        activationSource: SELLER_PORTAL_ACTIVATION_SOURCES.existingListing,
        sellerContactEmail: email,
        sellerContactPhone: phone,
        sellerFirstName: firstName,
        sellerSurname: lastName,
        performedBy: profile?.id || '',
        agentName: listingActor.name,
        agentEmail: listingActor.email || profile?.email || '',
        agentPhone: profile?.phone || profile?.mobile || '',
        organisationId: listingOrganisationId,
        agencyName: profile?.organisationName || profile?.companyName || profile?.agencyName || 'Arch9',
        propertyAddress: listingRecord?.propertyAddress || listingRecord?.formattedAddress || listingRecord?.listingTitle || listingRecord?.title || 'your property',
      })

      if (typeof navigator !== 'undefined' && result?.portalLink) {
        void navigator.clipboard?.writeText(result.portalLink)
      }
      setSellerPortalActivationOpen(false)
      setDetailMessage(`Seller Portal invitation sent to ${email}. Link copied.`)
      await loadListingData()
      const token = resolveSellerPortalTokenFromListing(listingRecord)
      if (token) {
        void getSellerPortalSecurityDiagnostics(token)
          .then((diagnostics) => setSellerPortalSecurityDiagnostics(diagnostics || null))
          .catch(() => null)
      }
    } catch (error) {
      setDetailError(error?.message || 'Unable to send the Seller Portal invitation.')
    } finally {
      setSellerPortalActivationSending(false)
    }
  }

  function handleEditSellerProfile() {
    const canonicalFacts = listingRecord?.sellerCanonicalFacts || listingRecord?.seller_canonical_facts_json || {}
    const nameParts = resolveSellerNameFromListing(listingRecord).split(/\s+/).filter(Boolean)
    setSellerContactDraft({
      firstName: toCleanText(canonicalFacts.firstName || sellerFormData?.sellerFirstName || sellerFormData?.firstName || nameParts[0]),
      lastName: toCleanText(canonicalFacts.lastName || sellerFormData?.sellerSurname || sellerFormData?.lastName || nameParts.slice(1).join(' ')),
      email: resolveSellerEmailFromListing(listingRecord),
      phone: resolveSellerPhoneFromListing(listingRecord),
    })
    setSellerContactEditorOpen(true)
    setDetailError('')
    setDetailMessage('Edit the seller contact below. Saving does not require a portal link.')
  }

  function openSellerProfileBuilder(message = '') {
    setSellerProfileBuilderDraft(createListingSellerProfileBuilderDraft(listingRecord || {}))
    setSellerProfileBuilderOpen(true)
    setSellerContactEditorOpen(false)
    setDetailError('')
    setDetailMessage(message)
  }

  function handleNextBestAction(action = {}) {
    const key = action?.key || ''
    if (key === 'complete_seller_facts') {
      openSellerWorkspaceSection('seller')
      openSellerProfileBuilder('Complete the seller profile from the listing workspace.')
      return
    }
    if (key === 'review_offers') {
      setActiveTab('offers')
      return
    }
    if (key === 'open_documents') {
      setActiveTab('documents')
      return
    }
    setActiveTab('pipeline')
  }

  function updateSellerProfileBuilderDraft(key, value) {
    setSellerProfileBuilderDraft((previous) => ({ ...previous, [key]: value }))
  }

  function addSellerProfileBuilderPerson(key, roleTitle) {
    setSellerProfileBuilderDraft((previous) => addListingSellerProfileDraftPerson(previous, key, roleTitle))
  }

  function updateSellerProfileBuilderPerson(key, index, field, value) {
    setSellerProfileBuilderDraft((previous) => updateListingSellerProfileDraftPerson(previous, key, index, field, value))
  }

  function removeSellerProfileBuilderPerson(key, index) {
    setSellerProfileBuilderDraft((previous) => removeListingSellerProfileDraftPerson(previous, key, index))
  }

  async function handleSaveSellerProfileBuilder(event) {
    event.preventDefault()
    if (!listingRecord?.id) return
    const validationErrors = validateListingSellerProfileBuilderDraft(sellerProfileBuilderDraft)
    if (validationErrors.length) {
      setDetailError(validationErrors[0])
      return
    }

    const now = new Date().toISOString()
    const existingFormData = getListingSellerFormData(listingRecord)
    const requirementProjection = buildListingSellerProfileRequirementProjection(sellerProfileBuilderDraft, listingRecord, {
      draft: true,
    })
    const { formPatch, canonicalSellerFacts } = requirementProjection
    const nextFormData = {
      ...existingFormData,
      ...formPatch,
      sellerProfileCapturedAt: now,
    }
    const fullName = toCleanText(formPatch.fullName || formPatch.sellerName || resolveSellerNameFromListing(listingRecord))
    const email = toCleanText(formPatch.email || formPatch.sellerEmail || resolveSellerEmailFromListing(listingRecord)).toLowerCase()
    const phone = toCleanText(formPatch.phone || formPatch.sellerPhone || resolveSellerPhoneFromListing(listingRecord))
    const currentFacts = listingRecord?.sellerCanonicalFacts || listingRecord?.seller_canonical_facts_json || {}
    const sellerCanonicalFacts = Object.keys(canonicalSellerFacts || {}).length
      ? canonicalSellerFacts
      : {
          ...currentFacts,
          ...formPatch,
        }
    const sellerCanonicalFactReadiness = {
      ...(listingRecord?.sellerCanonicalFactReadiness || listingRecord?.seller_canonical_fact_readiness_json || {}),
      sellerName: Boolean(fullName || formPatch.companyName || formPatch.trustName),
      sellerEmail: Boolean(email),
      sellerPhone: Boolean(phone),
      idNumber: Boolean(formPatch.idNumber || formPatch.sellerIdNumber || formPatch.companyRegistrationNumber || formPatch.trustRegistrationNumber),
      propertyAddress: Boolean(formPatch.propertyAddress || formPatch.addressLine1),
      ownerStructureType: Boolean(formPatch.ownerStructureType),
    }
    const listingPatch = {
      sellerName: fullName || formPatch.companyName || formPatch.trustName || listingRecord?.sellerName,
      sellerEmail: email,
      sellerPhone: phone,
      sellerType: formPatch.sellerType || listingRecord?.sellerType || 'individual',
      sellerCanonicalFacts,
      sellerCanonicalFactReadiness,
      sellerCanonicalFactsUpdatedAt: now,
      propertyAddress: formPatch.propertyAddress || listingRecord?.propertyAddress,
      addressLine1: formPatch.propertyAddress || listingRecord?.addressLine1,
      askingPrice: formPatch.askingPrice || listingRecord?.askingPrice,
      mandateType: formPatch.mandateType || listingRecord?.mandateType,
      mandateStartDate: formPatch.mandateStartDate || listingRecord?.mandateStartDate,
      expiryDate: formPatch.expiryDate || listingRecord?.expiryDate,
    }
    const nextOnboardingStatus = listingRecord?.sellerOnboardingStatus || listingRecord?.seller_onboarding_status || listingRecord?.sellerOnboarding?.status || 'in_progress'
    const normalizedOnboardingStatus = nextOnboardingStatus === 'not_started' ? 'in_progress' : nextOnboardingStatus
    const projectedDocumentRequirements = requirementProjection.allRequirementRows.map((requirement) => ({
      ...requirement,
      key: requirement.key || requirement.requirement_key,
      label: requirement.label || requirement.requirement_name,
      required: requirement.required ?? requirement.is_required !== false,
    }))
    const normalizeDocumentRequirements = (requirements = []) => (Array.isArray(requirements) ? requirements : [])
      .map((requirement) => ({
        ...requirement,
        key: requirement.key || requirement.requirement_key || requirement.document_type,
        label: requirement.label || requirement.requirement_name || requirement.document_name,
        required: requirement.required ?? requirement.is_required !== false,
      }))
      .filter((requirement) => requirement.key || requirement.label)
    const applySellerProfileSnapshot = ({ syncedListing = null, syncedRequirements = null } = {}) => {
      const remoteRequirements = normalizeDocumentRequirements(syncedRequirements)
      const remoteListingRequirements = normalizeDocumentRequirements(syncedListing?.documentRequirements)
      const documentRequirements = remoteRequirements.length
        ? remoteRequirements
        : remoteListingRequirements.length
          ? remoteListingRequirements
          : projectedDocumentRequirements
      return patchListing((row) => ({
        ...row,
        ...listingPatch,
        seller: {
          ...(row?.seller || {}),
          ...formPatch,
          name: listingPatch.sellerName,
          email,
          phone,
        },
        sellerOnboardingStatus: normalizedOnboardingStatus,
        sellerOnboarding: {
          ...(row?.sellerOnboarding || {}),
          status: normalizedOnboardingStatus,
          formData: nextFormData,
          form_data: nextFormData,
          updatedAt: now,
        },
        documentRequirements,
        requiredDocuments: documentRequirements.map((requirement) => ({
          key: requirement.key || requirement.requirement_key,
          label: requirement.label || requirement.requirement_name,
          status: requirement.status || 'required',
          fileName: requirement.fileName || requirement.file_name || '',
        })),
        updatedAt: now,
      }))
    }

    setSellerProfileBuilderSaving(true)
    setDetailError('')
    setDetailMessage('')
    try {
      applySellerProfileSnapshot()
      let remoteListingMissing = false
      if (isSupabaseConfigured && isUuidLike(listingRecord.id)) {
        try {
          const remoteListing = await updatePrivateListing(listingRecord.id, listingPatch, { includeRequirementsAndDocuments: false })
          const onboardingResult = await updatePrivateListingOnboardingFormData(listingRecord.id, nextFormData, {
            status: normalizedOnboardingStatus,
            sellerType: formPatch.sellerType || 'individual',
            ownershipStructure: formPatch.ownershipType || formPatch.ownerStructureType,
            maritalRegime: formPatch.maritalStatus || formPatch.maritalRegime,
            syncRequirements: true,
            requirementSyncReason: 'listing_seller_profile_capture',
          })
          applySellerProfileSnapshot({
            syncedListing: onboardingResult?.syncedListing || remoteListing,
            syncedRequirements: onboardingResult?.syncedRequirements,
          })
        } catch (remoteError) {
          if (!isRemoteListingMissingError(remoteError)) throw remoteError
          remoteListingMissing = true
          console.warn('[AgentListingDetail] seller profile saved locally because remote listing row is missing', remoteError)
        }
      }
      setSellerProfileBuilderOpen(false)
      setDetailMessage(remoteListingMissing
        ? 'Seller profile captured locally. Document requirements have been recalculated for this imported listing.'
        : 'Seller profile captured. Document requirements have been recalculated from the saved seller model.')
    } catch (error) {
      setDetailError(error?.message || 'Unable to save the seller profile.')
    } finally {
      setSellerProfileBuilderSaving(false)
    }
  }

  async function handleSaveSellerContact(event) {
    event.preventDefault()
    if (!listingRecord?.id) return
    const firstName = toCleanText(sellerContactDraft.firstName)
    const lastName = toCleanText(sellerContactDraft.lastName)
    const email = toCleanText(sellerContactDraft.email).toLowerCase()
    const phone = toCleanText(sellerContactDraft.phone)
    if (!isValidEmail(email) && !phone) {
      setDetailError('Add a valid seller email or phone number before saving.')
      return
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    const now = new Date().toISOString()
    const currentFacts = listingRecord?.sellerCanonicalFacts || listingRecord?.seller_canonical_facts_json || {}
    const sellerCanonicalFacts = {
      ...currentFacts,
      firstName,
      lastName,
      sellerName: fullName,
      name: fullName,
      fullName,
      email,
      sellerEmail: email,
      phone,
      sellerPhone: phone,
      mobile: phone,
    }
    const sellerCanonicalFactReadiness = {
      ...(listingRecord?.sellerCanonicalFactReadiness || listingRecord?.seller_canonical_fact_readiness_json || {}),
      sellerName: Boolean(fullName),
      sellerEmail: Boolean(email),
      sellerPhone: Boolean(phone),
    }

    setSellerContactSaving(true)
    setDetailError('')
    setDetailMessage('')
    try {
      if (isSupabaseConfigured && isUuidLike(listingRecord.id)) {
        const sellerOnboardingIntegrity = assessSellerOnboardingIntegrity({
          organisationId: listingOrganisationId,
          listing: listingRecord,
        })
        if (!sellerOnboardingIntegrity.ok) {
          throw new Error(sellerOnboardingIntegrity.message)
        }
        await updatePrivateListing(listingRecord.id, {
          sellerCanonicalFacts,
          sellerCanonicalFactReadiness,
          sellerCanonicalFactsUpdatedAt: now,
        }, { includeRequirementsAndDocuments: false })
        await updatePrivateListingOnboardingFormData(listingRecord.id, {
          sellerFirstName: firstName,
          firstName,
          sellerSurname: lastName,
          lastName,
          sellerName: fullName,
          fullName,
          sellerEmail: email,
          email,
          sellerPhone: phone,
          phone,
        }, {
          status: listingRecord?.sellerOnboardingStatus || listingRecord?.sellerOnboarding?.status || 'not_started',
          sellerType: listingRecord?.sellerType || 'individual',
          syncRequirements: false,
        })

        const sellerLeadId = toCleanText(listingRecord?.sellerLeadId || listingRecord?.originatingCrmLeadId)
        if (listingOrganisationId && sellerLeadId) {
          const workspace = await fetchAgencyCrmLeadWorkspace(listingOrganisationId, sellerLeadId)
          const contact = workspace?.contacts?.[0]
          if (contact?.contactId) {
            await updateAgencyCrmContactRecord(listingOrganisationId, contact.contactId, {
              firstName,
              lastName,
              email,
              phone,
              contactType: 'Seller',
            })
          }
        }
      }

      patchListing((row) => ({
        ...row,
        sellerName: fullName,
        sellerEmail: email,
        sellerPhone: phone,
        sellerCanonicalFacts,
        sellerCanonicalFactReadiness,
        seller: {
          ...(row?.seller || {}),
          name: fullName,
          email,
          phone,
        },
        sellerOnboarding: {
          ...(row?.sellerOnboarding || {}),
          formData: {
            ...((row?.sellerOnboarding?.formData && typeof row.sellerOnboarding.formData === 'object') ? row.sellerOnboarding.formData : {}),
            sellerFirstName: firstName,
            firstName,
            sellerSurname: lastName,
            lastName,
            sellerName: fullName,
            fullName,
            sellerEmail: email,
            email,
            sellerPhone: phone,
            phone,
          },
        },
        updatedAt: now,
      }))
      setSellerContactEditorOpen(false)
      setDetailMessage('Seller contact saved. You can now send the seller onboarding link.')
    } catch (error) {
      setDetailError(error?.message || 'Unable to save seller contact details.')
    } finally {
      setSellerContactSaving(false)
    }
  }

  function openSellerSectionEditor(section) {
    const sectionConfig = SELLER_PROFILE_SECTION_BY_KEY.get(section?.key)
    if (!sectionConfig) return
    const draft = sectionConfig.fields.reduce((accumulator, field) => {
      const row = section.rows.find((item) => item.key === field.key)
      accumulator[field.key] = row?.rawValue === undefined || row?.rawValue === null ? '' : String(row.rawValue)
      return accumulator
    }, {})
    setSellerSectionEditorKey(section.key)
    setSellerSectionDraft(draft)
    setDetailError('')
    setDetailMessage('')
  }

  function updateSellerSectionDraft(key, value) {
    setSellerSectionDraft((previous) => ({ ...previous, [key]: value }))
  }

  function resolveSellerProfileOwnershipModel(draft = {}) {
    const source = toCleanText(
      draft.sellerType ||
        draft.sellerLegalType ||
        draft.seller_legal_type ||
        draft.ownerStructureType ||
        draft.owner_structure_type ||
        draft.ownershipType ||
        draft.ownerType,
    )
    const key = normalizeKey(source)
    if (['company', 'close_corporation', 'cc', 'pty', 'pty_ltd', 'corporate'].includes(key)) {
      return { sellerType: 'company', sellerLegalType: 'company', ownerStructureType: 'company', ownershipType: 'company' }
    }
    if (key === 'trust') {
      return { sellerType: 'trust', sellerLegalType: 'trust', ownerStructureType: 'trust', ownershipType: 'trust' }
    }
    if (['multiple', 'multiple_owner', 'multiple_owners', 'multiple_individuals', 'joint', 'co_owners'].includes(key)) {
      return { sellerType: 'multiple_owners', sellerLegalType: 'multiple_owners', ownerStructureType: 'multiple_owners', ownershipType: 'multiple_owners' }
    }
    if (['deceased_estate', 'estate', 'deceased'].includes(key)) {
      return { sellerType: 'deceased_estate', sellerLegalType: 'deceased_estate', ownerStructureType: 'deceased_estate', ownershipType: 'deceased_estate' }
    }
    if (key === 'married') {
      return { sellerType: 'individual', sellerLegalType: 'individual', ownerStructureType: 'married', ownershipType: 'married' }
    }
    return { sellerType: 'individual', sellerLegalType: 'individual', ownerStructureType: 'individual', ownershipType: 'individual' }
  }

  function buildSellerProfileFormPatch(draft = {}) {
    const next = { ...draft }
    const fullName = toCleanText(next.fullName)
    if (fullName) {
      const nameParts = fullName.split(/\s+/).filter(Boolean)
      next.sellerName = fullName
      next.fullName = fullName
      next.sellerFirstName = nameParts[0] || ''
      next.firstName = nameParts[0] || ''
      next.sellerSurname = nameParts.slice(1).join(' ')
      next.lastName = nameParts.slice(1).join(' ')
    }
    if (next.sellerType !== undefined || next.ownershipType !== undefined || next.ownerType !== undefined || next.ownerStructureType !== undefined) {
      Object.assign(next, resolveSellerProfileOwnershipModel(next))
      next.seller_legal_type = next.sellerLegalType
      next.owner_structure_type = next.ownerStructureType
      next.owner_entity_type = ['company', 'trust'].includes(next.ownerStructureType)
        ? next.ownerStructureType
        : 'natural_person'
    }
    if (next.email !== undefined) {
      next.email = toCleanText(next.email).toLowerCase()
      next.sellerEmail = next.email
      next.contactEmail = next.email
    }
    if (next.phone !== undefined) {
      next.phone = toCleanText(next.phone)
      next.sellerPhone = next.phone
      next.mobile = next.phone
      next.contactNumber = next.phone
    }
    if (next.idNumber !== undefined) next.sellerIdNumber = toCleanText(next.idNumber)
    if (next.propertyAddress !== undefined) next.addressLine1 = toCleanText(next.propertyAddress)
    if (next.ownershipType !== undefined) next.ownerType = toCleanText(next.ownershipType)
    if (next.titleDeedNumber !== undefined) next.deedNumber = toCleanText(next.titleDeedNumber)
    if (next.bondHolder !== undefined) next.bondBank = toCleanText(next.bondHolder)
    if (next.outstandingBond !== undefined) next.bondSettlementAmount = toCleanText(next.outstandingBond)
    if (next.askingPrice !== undefined) next.price = toCleanText(next.askingPrice)
    if (next.mandateStartDate !== undefined) next.startDate = toCleanText(next.mandateStartDate)
    if (next.expiryDate !== undefined) next.mandateEndDate = toCleanText(next.expiryDate)
    if (next.commissionPreference !== undefined) next.commissionType = toCleanText(next.commissionPreference)
    if (next.notes !== undefined) next.sellerNotes = toCleanText(next.notes)
    return Object.entries(next).reduce((accumulator, [key, value]) => {
      accumulator[key] = typeof value === 'string' ? value.trim() : value
      return accumulator
    }, {})
  }

  async function handleSaveSellerSection(event) {
    event.preventDefault()
    if (!listingRecord?.id || !sellerSectionEditorKey) return
    const formPatch = buildSellerProfileFormPatch(sellerSectionDraft)
    if (formPatch.email && !isValidEmail(formPatch.email)) {
      setDetailError('Add a valid seller email address before saving.')
      return
    }

    const now = new Date().toISOString()
    const existingFormData = getListingSellerFormData(listingRecord)
    const nextFormData = { ...existingFormData, ...formPatch }
    const fullName = toCleanText(nextFormData.fullName || nextFormData.sellerName || resolveSellerNameFromListing(listingRecord))
    const email = toCleanText(nextFormData.email || nextFormData.sellerEmail || resolveSellerEmailFromListing(listingRecord)).toLowerCase()
    const phone = toCleanText(nextFormData.phone || nextFormData.sellerPhone || resolveSellerPhoneFromListing(listingRecord))
    const currentFacts = listingRecord?.sellerCanonicalFacts || listingRecord?.seller_canonical_facts_json || {}
    const sellerCanonicalFacts = {
      ...currentFacts,
      ...nextFormData,
      sellerName: fullName,
      fullName,
      name: fullName,
      email,
      sellerEmail: email,
      phone,
      sellerPhone: phone,
      mobile: phone,
    }
    const sellerCanonicalFactReadiness = {
      ...(listingRecord?.sellerCanonicalFactReadiness || listingRecord?.seller_canonical_fact_readiness_json || {}),
      sellerName: Boolean(fullName),
      sellerEmail: Boolean(email),
      sellerPhone: Boolean(phone),
      idNumber: Boolean(nextFormData.idNumber || nextFormData.sellerIdNumber),
      propertyAddress: Boolean(nextFormData.propertyAddress || nextFormData.addressLine1),
    }
    const listingPatch = {
      sellerName: fullName,
      sellerEmail: email,
      sellerPhone: phone,
      sellerType: nextFormData.sellerType || listingRecord?.sellerType || 'individual',
      sellerCanonicalFacts,
      sellerCanonicalFactReadiness,
      sellerCanonicalFactsUpdatedAt: now,
      propertyAddress: nextFormData.propertyAddress || listingRecord?.propertyAddress,
      addressLine1: nextFormData.propertyAddress || listingRecord?.addressLine1,
      askingPrice: nextFormData.askingPrice || listingRecord?.askingPrice,
      mandateType: nextFormData.mandateType || listingRecord?.mandateType,
      mandateStartDate: nextFormData.mandateStartDate || listingRecord?.mandateStartDate,
      expiryDate: nextFormData.expiryDate || listingRecord?.expiryDate,
    }

    setSellerSectionSaving(true)
    setDetailError('')
    setDetailMessage('')
    try {
      if (isSupabaseConfigured && isUuidLike(listingRecord.id)) {
        await updatePrivateListing(listingRecord.id, listingPatch, { includeRequirementsAndDocuments: false })
        await updatePrivateListingOnboardingFormData(listingRecord.id, nextFormData, {
          status: listingRecord?.sellerOnboardingStatus || listingRecord?.sellerOnboarding?.status || 'not_started',
          sellerType: nextFormData.sellerType || listingRecord?.sellerType || 'individual',
          ownershipStructure: nextFormData.ownerStructureType || nextFormData.ownershipType,
          maritalRegime: nextFormData.maritalStatus || nextFormData.maritalRegime,
          syncRequirements: true,
          requirementSyncReason: 'agent_seller_profile_edit',
        })
      }

      patchListing((row) => ({
        ...row,
        ...listingPatch,
        seller: {
          ...(row?.seller || {}),
          ...formPatch,
          name: fullName,
          email,
          phone,
        },
        sellerOnboarding: {
          ...(row?.sellerOnboarding || {}),
          formData: nextFormData,
          updatedAt: now,
        },
        updatedAt: now,
      }))
      setSellerSectionEditorKey('')
      setSellerSectionDraft({})
      setDetailMessage(`${SELLER_PROFILE_SECTION_BY_KEY.get(sellerSectionEditorKey)?.title || 'Seller details'} saved.`)
      if (isSupabaseConfigured && isUuidLike(listingRecord.id)) {
        await loadListingData()
      }
    } catch (error) {
      setDetailError(error?.message || 'Unable to save seller details.')
    } finally {
      setSellerSectionSaving(false)
    }
  }

  async function handleSellerDocumentUpload(doc, event) {
    const file = event.target.files?.[0]
    if (!file || !listingRecord?.id) return
    if (!isSupabaseConfigured || !isUuidLike(listingRecord.id)) {
      setDetailError('Document upload needs the shared listing record in Supabase so it can pull through for everyone.')
      event.target.value = ''
      return
    }

    const uploadKey = doc.key || doc.id || doc.label || file.name
    setSellerDocumentUploadKey(uploadKey)
    setDetailError('')
    setDetailMessage('')
    try {
      const uploadedDocument = await uploadPrivateListingDocument(listingRecord.id, file, {
        requirementId: doc.id || doc.requirementId || doc.requirement_id || '',
        requirementKey: doc.key || doc.requirementKey || doc.requirement_key || '',
        documentType: doc.key || doc.documentType || doc.document_type || 'seller_document',
        documentCategory: getListingDocumentGroupingKey(doc),
        documentName: file.name || doc.label || 'Seller document',
        visibility: 'seller_visible',
        status: 'uploaded',
      })
      patchListing((row) => ({
        ...row,
        documents: [
          ...(Array.isArray(row?.documents) ? row.documents : []),
          {
            ...uploadedDocument,
            id: uploadedDocument?.id || generateId('seller-document'),
            documentName: uploadedDocument?.document_name || uploadedDocument?.documentName || file.name,
            documentType: uploadedDocument?.document_type || uploadedDocument?.documentType || doc.key || 'seller_document',
            requirementId: uploadedDocument?.requirementId || uploadedDocument?.requirement_id || doc.id || doc.requirementId || '',
            requirement_id: uploadedDocument?.requirement_id || uploadedDocument?.requirementId || doc.id || doc.requirement_id || '',
            category: uploadedDocument?.category || getListingDocumentGroupingKey(doc),
            status: uploadedDocument?.status || 'uploaded',
            uploadedAt: uploadedDocument?.uploaded_at || uploadedDocument?.uploadedAt || new Date().toISOString(),
            url: uploadedDocument?.url || uploadedDocument?.fileUrl || uploadedDocument?.file_url || '',
          },
        ],
      }))
      setDetailMessage(`${file.name || 'Document'} uploaded to the seller document centre.`)
      await loadListingData()
    } catch (error) {
      setDetailError(error?.message || 'Unable to upload seller document.')
    } finally {
      setSellerDocumentUploadKey('')
      event.target.value = ''
    }
  }

  async function handleKingstonsBuyerOtpUpload(offer, event) {
    const file = event.target.files?.[0]
    if (!file || !listingRecord?.id) return
    if (!isSupabaseConfigured || !isUuidLike(listingRecord.id)) {
      setOfferActionError('Signed OTP upload needs the shared listing record in Supabase so it can pull through to the transaction later.')
      event.target.value = ''
      return
    }

    const offerReference = normalizeText(offer?.canonicalOfferId || offer?.offerId || offer?.offer_id || offer?.id)
    const buyerLeadId = normalizeText(offer?.buyerLeadId || offer?.buyer_lead_id)
    const buyerContactId = normalizeText(offer?.buyerContactId || offer?.buyer_contact_id)
    const buyerName = normalizeText(offer?.buyerName) || 'Buyer'
    const uploadKey = `kingstons-buyer-otp:${offerReference || buyerLeadId || file.name}`
    const documentName = `Signed OTP - ${buyerName}${offerReference ? ` - ${offerReference}` : ''}${buyerLeadId ? ` - ${buyerLeadId}` : ''}`

    setBuyerOtpUploadKey(uploadKey)
    setOfferActionError('')
    setOfferActionMessage('')
    try {
      const uploadedDocument = await uploadPrivateListingDocument(listingRecord.id, file, {
        requirementKey: KINGSTONS_BUYER_OTP_REQUIREMENT.key,
        documentType: KINGSTONS_BUYER_OTP_REQUIREMENT.key,
        documentCategory: 'buyer_offer',
        documentName,
        visibility: 'internal',
        status: 'uploaded',
      })
      const now = new Date().toISOString()
      const kingstonsBuyerOtpLink = buildKingstonsBuyerOtpOfferLink({
        offer: {
          ...offer,
          offerId: offerReference,
          buyerLeadId,
          buyerContactId,
          buyerName,
        },
        document: uploadedDocument,
        actor: getCanonicalOfferActor(),
        now,
      })
      if (offer?.canonicalOfferId && listingOrganisationId) {
        const canonicalOffer = canonicalListingOffers.find((item) => String(item.id) === String(offer.canonicalOfferId))
        const existingConditions = canonicalOffer?.conditions || offer?.conditionsJson || {}
        await updateCanonicalOfferStatus(offer.canonicalOfferId, normalizeOfferWorkflowStatus(canonicalOffer?.status || offer?.status), {
          organisationId: listingOrganisationId,
          actor: getCanonicalOfferActor(),
          patch: {
            conditions_json: {
              ...existingConditions,
              kingstonsBuyerOtp: kingstonsBuyerOtpLink,
              signedOtpDocument: kingstonsBuyerOtpLink,
              kingstonsBuyerOtpStatus: 'signed_otp_received',
              agentActionHistory: [
                ...(Array.isArray(existingConditions.agentActionHistory) ? existingConditions.agentActionHistory : []),
                {
                  action: 'Signed OTP uploaded',
                  note: `${file.name || 'Signed OTP'} linked to the buyer offer.`,
                  at: now,
                  actorId: getCanonicalOfferActor().id,
                  actorName: getCanonicalOfferActor().name,
                },
              ],
            },
          },
        })
      }
      patchListing((row) => ({
        ...row,
        documents: [
          ...(Array.isArray(row?.documents) ? row.documents : []),
          {
            ...uploadedDocument,
            ...kingstonsBuyerOtpLink,
            id: uploadedDocument?.id || generateId('signed-otp'),
            documentName: uploadedDocument?.document_name || uploadedDocument?.documentName || documentName,
            document_name: uploadedDocument?.document_name || uploadedDocument?.documentName || documentName,
            documentType: KINGSTONS_BUYER_OTP_REQUIREMENT.key,
            document_type: KINGSTONS_BUYER_OTP_REQUIREMENT.key,
            category: uploadedDocument?.category || 'buyer_offer',
            status: uploadedDocument?.status || 'uploaded',
            uploadedAt: uploadedDocument?.uploaded_at || uploadedDocument?.uploadedAt || now,
            uploaded_at: uploadedDocument?.uploaded_at || uploadedDocument?.uploadedAt || now,
            url: uploadedDocument?.url || uploadedDocument?.fileUrl || uploadedDocument?.file_url || '',
            file_url: uploadedDocument?.file_url || uploadedDocument?.fileUrl || uploadedDocument?.url || '',
            storage_path: uploadedDocument?.storage_path || '',
            offerId: offerReference,
            offer_id: offerReference,
            canonicalOfferId: normalizeText(offer?.canonicalOfferId),
            canonical_offer_id: normalizeText(offer?.canonicalOfferId),
            buyerLeadId,
            buyer_lead_id: buyerLeadId,
            buyerContactId,
            buyer_contact_id: buyerContactId,
          },
        ],
      }))
      setOfferActionMessage(`Signed OTP uploaded for ${buyerName}.`)
      setOffersRefreshTick((value) => value + 1)
      await loadListingData()
    } catch (error) {
      setOfferActionError(error?.message || 'Unable to upload the signed OTP.')
    } finally {
      setBuyerOtpUploadKey('')
      event.target.value = ''
    }
  }

  async function handleRepairSellerPackTransactionHandoff() {
    if (!listingRecord?.id) return
    if (!isSupabaseConfigured || !isUuidLike(listingRecord.id)) {
      setDetailError('Seller Pack transaction handoff repair needs the live listing record.')
      return
    }

    setSellerPackHandoffAction('repair')
    setDetailError('')
    setDetailMessage('')
    try {
      const queued = await markPrivateListingDocumentsPendingTransactionPromotion(listingRecord.id, {
        requirementKeys: SELLER_PACK_TRANSACTION_REQUIREMENT_KEYS,
        source: 'kingstons_seller_pack_phase4_manual_repair',
      })
      await repairSellerDocumentTransactionContinuity({ listingId: listingRecord.id })
      await loadListingData()
      setDetailMessage(
        queued?.updatedCount
          ? 'Seller Pack transaction handoff repaired. Check the handoff panel for promoted documents.'
          : 'Seller Pack transaction handoff checked. Upload any missing Seller Pack documents before attorney handoff.',
      )
    } catch (error) {
      setDetailError(error?.message || 'Unable to repair Seller Pack transaction handoff.')
    } finally {
      setSellerPackHandoffAction('')
    }
  }

  function openListingPerformanceEditor() {
    const draft = LISTING_PERFORMANCE_OVERRIDE_FIELDS.reduce((accumulator, field) => {
      accumulator[field.key] = listingPerformance[field.key] === undefined || listingPerformance[field.key] === null
        ? ''
        : String(listingPerformance[field.key])
      return accumulator
    }, {})
    setListingPerformanceDraft(draft)
    setListingPerformanceEditorOpen(true)
    setDetailError('')
    setDetailMessage('')
  }

  function updateListingPerformanceDraft(key, value) {
    setListingPerformanceDraft((previous) => ({ ...previous, [key]: value }))
  }

  async function handleSaveListingPerformance(event) {
    event.preventDefault()
    if (!listingRecord?.id) return
    const overrides = normalizeListingPerformanceOverrides(listingPerformanceDraft)
    const now = new Date().toISOString()
    const existingFormData = getListingSellerFormData(listingRecord)
    const nextFormData = {
      ...existingFormData,
      listingPerformanceOverrides: overrides,
      listingPerformance: overrides,
      listingPerformanceUpdatedAt: now,
    }

    setListingPerformanceSaving(true)
    setDetailError('')
    setDetailMessage('')
    try {
      if (isSupabaseConfigured && isUuidLike(listingRecord.id)) {
        await updatePrivateListingOnboardingFormData(listingRecord.id, nextFormData, {
          status: listingRecord?.sellerOnboardingStatus || listingRecord?.sellerOnboarding?.status || 'not_started',
          sellerType: nextFormData.sellerType || listingRecord?.sellerType || 'individual',
          syncRequirements: false,
        })
      }

      patchListing((row) => ({
        ...row,
        listingPerformanceOverrides: overrides,
        listingPerformance: overrides,
        sellerOnboarding: {
          ...(row?.sellerOnboarding || {}),
          formData: {
            ...(row?.sellerOnboarding?.formData || {}),
            ...nextFormData,
          },
          updatedAt: now,
        },
        updatedAt: now,
      }))
      setListingPerformanceEditorOpen(false)
      setListingPerformanceDraft({})
      setDetailMessage('Listing performance stats saved for the seller portal.')
      if (isSupabaseConfigured && isUuidLike(listingRecord.id)) {
        await loadListingData()
      }
    } catch (error) {
      setDetailError(error?.message || 'Unable to save listing performance stats.')
    } finally {
      setListingPerformanceSaving(false)
    }
  }

  function handleDownloadSellerProfilePdf() {
    const agencyName = String(profile?.organisationName || profile?.companyName || profile?.agencyName || 'Arch9').trim()
    const summary = [
      { label: 'Seller', value: sellerProfile.name },
      { label: 'Seller Type', value: sellerProfile.type },
      { label: 'Property Address', value: sellerProfile.propertyAddress },
      { label: 'Mandate Type', value: sellerProfile.mandateType },
      { label: 'Asking Price', value: sellerProfile.askingPrice },
      { label: 'Status', value: sellerProfile.status },
      { label: 'Profile Completion', value: `${sellerProfile.completionPercent}%` },
    ]
    const pdf = buildSellerProfilePdf({
      agencyName,
      generatedDate: formatLongDate(new Date()),
      summary,
      sections: sellerProfile.sections,
    })
    downloadBlob(pdf, `${sanitizeFileName(sellerProfile.name)}-seller-profile.pdf`)
    setDetailMessage('Seller profile PDF downloaded.')
  }

  function updateMarketingDraft(key, value) {
    marketingDraftDirtyRef.current = true
    setMarketingDraft((previous) => {
      if (key !== 'description') {
        const nextDraft = { ...previous, [key]: value }
        writeStoredMarketingDraft(listingId, nextDraft)
        return nextDraft
      }
      const previousDescription = String(previous.description || '').trim()
      const previousPreview = String(previous.listingPreviewDescription || '').trim()
      const shouldSyncPreview = !previousPreview || previousPreview === previousDescription
      const nextDraft = {
        ...previous,
        description: value,
        listingPreviewDescription: shouldSyncPreview ? value : previous.listingPreviewDescription,
      }
      writeStoredMarketingDraft(listingId, nextDraft)
      return nextDraft
    })
  }

  function updateCommissionDraft(key, value) {
    setCommissionDraft((previous) => ({ ...previous, [key]: value }))
  }

  async function saveCommissionDraft() {
    if (!listingRecord?.id) return
    setSavingCommission(true)
    setDetailMessage('')
    setDetailError('')
    const percentage = Number(commissionDraft.percentage || 0) || 0
    const amount = Number(commissionDraft.amount || 0) || 0
    const now = new Date().toISOString()
    const commissionPatch = {
      percentage,
      commission_percentage: percentage,
      amount,
      commission_amount: amount,
      vat: String(commissionDraft.vatHandling || '').trim(),
      vat_handling: String(commissionDraft.vatHandling || '').trim(),
      mandateTerms: String(commissionDraft.mandateTerms || '').trim(),
      mandate_terms: String(commissionDraft.mandateTerms || '').trim(),
      paymentResponsibility: String(commissionDraft.paymentResponsibility || '').trim(),
      payment_responsibility: String(commissionDraft.paymentResponsibility || '').trim(),
      notes: String(commissionDraft.notes || '').trim(),
      commission_notes: String(commissionDraft.notes || '').trim(),
      updatedAt: now,
      updated_at: now,
      updatedBy: String(profile?.id || profile?.email || 'agent').trim(),
      source: 'agent_workspace',
    }
    const formPatch = {
      commissionPercentage: percentage ? String(percentage) : '',
      commission_percent: percentage ? String(percentage) : '',
      mandateCommissionPercentage: percentage ? String(percentage) : '',
      commissionAmount: amount ? String(amount) : '',
      commission_amount: amount ? String(amount) : '',
      vatHandling: commissionPatch.vat,
      mandateTerms: commissionPatch.mandateTerms,
      paymentResponsibility: commissionPatch.paymentResponsibility,
      commissionNotes: commissionPatch.notes,
      commissionUpdatedAt: now,
      commissionUpdatedBy: commissionPatch.updatedBy,
    }
    const localListing = patchListing((row) => ({
      ...row,
      commission: {
        ...(row?.commission || {}),
        ...commissionPatch,
      },
      sellerOnboarding: {
        ...(row?.sellerOnboarding || {}),
        formData: {
          ...((row?.sellerOnboarding?.formData && typeof row.sellerOnboarding.formData === 'object') ? row.sellerOnboarding.formData : {}),
          ...formPatch,
        },
      },
      updatedAt: now,
    }))
    try {
      if (isSupabaseConfigured && localListing?.id) {
        const savedOnboarding = await updatePrivateListingOnboardingFormData(localListing.id, {
          ...((localListing?.sellerOnboarding?.formData && typeof localListing.sellerOnboarding.formData === 'object') ? localListing.sellerOnboarding.formData : {}),
          ...formPatch,
        })
        if (savedOnboarding?.form_data) {
          setPrivateListings((rows) => upsertListingRecord(rows, {
            ...localListing,
            sellerOnboarding: {
              ...(localListing?.sellerOnboarding || {}),
              status: savedOnboarding.status || localListing?.sellerOnboarding?.status,
              formData: savedOnboarding.form_data,
            },
          }))
        }
      }
      setDetailMessage('Commission details saved and synced across the seller profile.')
    } catch (error) {
      setDetailError(error?.message || 'Commission details saved locally, but Supabase could not be updated.')
    } finally {
      setSavingCommission(false)
    }
  }

  function updateViewingForm(key, value) {
    setViewingForm((previous) => ({ ...previous, [key]: value }))
  }

  function openShowDayCaptureModal() {
    setShowDayCaptureForm(createShowDayCaptureForm())
    setShowDayCaptureFeedback({ kind: '', message: '' })
    setDetailError('')
    setShowDayCaptureOpen(true)
  }

  function closeShowDayCaptureModal() {
    if (showDayCaptureSaving) return
    setShowDayCaptureOpen(false)
    setShowDayCaptureFeedback({ kind: '', message: '' })
  }

  async function submitShowDayCapture(event) {
    event.preventDefault()
    const form = showDayCaptureForm
    const isBulkCapture = form.mode === 'bulk'
    const hasBuyerIdentity = [form.name, form.phone, form.email].some((value) => toCleanText(value))
    if (!listingOrganisationId || !listingRecord?.id) {
      setShowDayCaptureFeedback({ kind: 'error', message: 'This listing needs a saved workspace record before capturing show-day leads.' })
      return
    }
    if (!isSupabaseConfigured) {
      setShowDayCaptureFeedback({ kind: 'error', message: 'Show-day lead capture requires the workspace database connection.' })
      return
    }
    if (!isBulkCapture && !hasBuyerIdentity) {
      setShowDayCaptureFeedback({ kind: 'error', message: 'Add at least a buyer name, phone, or email.' })
      return
    }
    if (!isBulkCapture && toCleanText(form.email) && !isValidEmail(form.email)) {
      setShowDayCaptureFeedback({ kind: 'error', message: 'Add a valid buyer email address or leave it blank.' })
      return
    }
    if (!toCleanText(form.showDayDate)) {
      setShowDayCaptureFeedback({ kind: 'error', message: 'Choose the show-day date.' })
      return
    }
    const sharedPayload = {
      organisationId: listingOrganisationId,
      listingId: listingRecord.id,
      showDayDate: form.showDayDate,
      showDayTime: form.showDayTime,
      outcome: form.outcome,
      notes: form.notes,
      nextStep: form.nextStep,
      followUpDueDate: form.followUpDueDate,
      location: [listingRecord.listingTitle, listingRecord.suburb, listingRecord.city].filter(Boolean).join(', '),
      assignedAgent: listingActor,
    }
    const bulkVisitors = isBulkCapture
      ? parseShowDayVisitorRows(form.bulkVisitorText, {
          outcome: form.outcome,
          nextStep: form.nextStep,
          followUpDueDate: form.followUpDueDate,
        })
      : []
    if (isBulkCapture && !bulkVisitors.length) {
      setShowDayCaptureFeedback({ kind: 'error', message: 'Paste at least one visitor with a name, phone, or email.' })
      return
    }

    setShowDayCaptureSaving(true)
    setShowDayCaptureFeedback({ kind: '', message: '' })
    setDetailError('')
    try {
      const result = isBulkCapture
        ? await captureShowDayLeadBatch({
            shared: sharedPayload,
            visitors: bulkVisitors,
          }, { actor: listingActor })
        : await captureShowDayLead({
            ...sharedPayload,
            name: form.name,
            phone: form.phone,
            email: form.email,
            buyerFeedback: form.buyerFeedback,
          }, { actor: listingActor })

      if (!result?.ok) {
        const successfulRows = Number(result?.processed || 0) + Number(result?.duplicates || 0)
        if (!isBulkCapture || !successfulRows) {
          throw new Error(result?.error || 'Unable to capture this show-day lead.')
        }
      }

      const buyerLabel = toCleanText(form.name) || toCleanText(form.phone) || toCleanText(form.email) || 'Show-day visitor'
      setShowDayCaptureOpen(false)
      setShowDayCaptureForm(createShowDayCaptureForm())
      setShowDayCaptureFeedback({ kind: '', message: '' })
      if (isBulkCapture) {
        const processed = Number(result.processed || 0)
        const duplicates = Number(result.duplicates || 0)
        const failed = Number(result.failed || 0)
        setDetailMessage(`${processed} visitor${processed === 1 ? '' : 's'} captured${duplicates ? `, ${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped` : ''}.`)
        if (failed) {
          setDetailError(`${failed} visitor${failed === 1 ? '' : 's'} could not be captured. ${result.error || ''}`.trim())
        }
      } else {
        setDetailMessage(
          result.status === 'duplicate'
            ? `${buyerLabel} was already captured for this show day.`
            : `${buyerLabel} captured from the show day. A follow-up task is ready on the buyer lead.`,
        )
      }
      await Promise.all([
        refreshInterestedLeads(),
        refreshListingViewings(),
      ])
      setOffersRefreshTick((value) => value + 1)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('itg:agency-crm-updated'))
      }
    } catch (error) {
      setShowDayCaptureFeedback({ kind: 'error', message: error?.message || 'Unable to capture this show-day lead.' })
    } finally {
      setShowDayCaptureSaving(false)
    }
  }

  async function submitViewingRequest(event) {
    event.preventDefault()
    if (!listingRecord || !viewingForm.buyerLeadId || !viewingForm.proposedDate || !viewingForm.proposedTime) return
    const lead = listingLeads.find((item) => String(item?.id || '') === String(viewingForm.buyerLeadId))
    const fallbackViewingPayload = {
      listingId: listingRecord.id,
      listingType: 'private_listing',
      listingTitle: listingRecord.listingTitle,
      buyerLeadId: lead?.id || '',
      buyerName: lead?.name || 'Buyer',
      createdBy: 'agent',
      createdByRole: 'agent',
      proposedDate: viewingForm.proposedDate,
      proposedTime: viewingForm.proposedTime,
      alternativeTimes: [viewingForm.alternativeTimeA, viewingForm.alternativeTimeB].filter(Boolean),
      notes: viewingForm.notes.trim(),
      location: [listingRecord.listingTitle, listingRecord.suburb, listingRecord.city].filter(Boolean).join(', '),
      agentName: 'Agent',
      sellerName: listingRecord?.seller?.name || 'Seller',
    }
    let createdInAppointments = false
    if (listingOrganisationId && isSupabaseConfigured) {
      try {
        const participantSeed = []
        const buyerEmail = String(lead?.email || lead?.buyerEmail || '').trim().toLowerCase()
        if (buyerEmail) {
          participantSeed.push({
            name: lead?.name || buyerEmail,
            email: buyerEmail,
            phone: lead?.phone || '',
            participantRole: 'Buyer',
            isRequired: true,
            rsvpStatus: 'Pending',
          })
        }
        const sellerEmail = String(listingRecord?.seller?.email || '').trim().toLowerCase()
        if (sellerEmail) {
          participantSeed.push({
            name: listingRecord?.seller?.name || sellerEmail,
            email: sellerEmail,
            phone: listingRecord?.seller?.phone || '',
            participantRole: 'Seller',
            isRequired: false,
            rsvpStatus: 'Pending',
          })
        }
        const currentAgent = {
          id: String(profile?.id || '').trim(),
          name: String(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email || 'Agent').trim(),
          email: String(profile?.email || '').trim().toLowerCase(),
        }
        await createAppointmentAsync(
          listingOrganisationId,
          {
            appointmentType: 'viewing',
            title: `Viewing: ${listingRecord.listingTitle || 'Listing'}`,
            date: viewingForm.proposedDate,
            startTime: viewingForm.proposedTime,
            timezone: 'Africa/Johannesburg',
            locationType: 'physical_address',
            location: fallbackViewingPayload.location,
            status: 'requested',
            leadId: lead?.leadId || lead?.id || null,
            contactId: lead?.contactId || null,
            listingId: listingRecord.id,
            relatedEntityType: lead?.leadId || lead?.id ? 'lead' : 'listing',
            relatedEntityId: lead?.leadId || lead?.id || null,
            notes: viewingForm.notes.trim(),
            participants: participantSeed,
            assignedAgent: currentAgent,
            sendInviteEmails: participantSeed.some((participant) => participant.email),
            attachCalendarInvite: true,
          },
          {
            actor: currentAgent,
          },
        )
        createdInAppointments = true
      } catch (error) {
        console.warn('[AgentListingDetail] appointment module viewing create failed', error)
        setDetailError(error?.message || 'Viewing could not be created in the canonical appointment system.')
      }
    }
    if (!createdInAppointments) {
      setDetailError('Viewing scheduling now requires the canonical appointment system. Please try again when the workspace database is available.')
      return
    }
    setViewingForm({
      buyerLeadId: '',
      proposedDate: '',
      proposedTime: '',
      alternativeTimeA: '',
      alternativeTimeB: '',
      notes: '',
    })
    setShowViewingForm(false)
    await refreshListingViewings()
  }

  function saveFeedback(viewingId) {
    const draft = feedbackDrafts[viewingId]
    if (!draft?.interestLevel) return
    saveViewingFeedback(viewingId, draft)
    setFeedbackDrafts((previous) => {
      const next = { ...previous }
      delete next[viewingId]
      return next
    })
  }

  function toggleFeature(feature) {
    marketingDraftDirtyRef.current = true
    setMarketingDraft((previous) => {
      const exists = previous.selectedFeatures.includes(feature)
      const nextDraft = {
        ...previous,
        selectedFeatures: exists
          ? previous.selectedFeatures.filter((item) => item !== feature)
          : [...previous.selectedFeatures, feature],
      }
      writeStoredMarketingDraft(listingId, nextDraft)
      return nextDraft
    })
  }

  function toggleAmenity(amenity) {
    marketingDraftDirtyRef.current = true
    setMarketingDraft((previous) => {
      const current = Array.isArray(previous.amenities) ? previous.amenities : []
      const exists = current.includes(amenity)
      const nextDraft = {
        ...previous,
        amenities: exists
          ? current.filter((item) => item !== amenity)
          : [...current, amenity],
      }
      writeStoredMarketingDraft(listingId, nextDraft)
      return nextDraft
    })
  }

  function updateExternalListingLink(linkId, key, value) {
    marketingDraftDirtyRef.current = true
    setMarketingDraft((previous) => {
      const nextDraft = {
        ...previous,
        externalLinks: normalizeExternalListingLinks(previous.externalLinks).map((link) => {
          if (String(link.id) !== String(linkId)) return link
          const nextLink = { ...link, [key]: value }
          if (key === 'status') {
            nextLink.visibleToSeller = isExternalLinkSellerVisible(value)
          }
          return nextLink
        }),
      }
      writeStoredMarketingDraft(listingId, nextDraft)
      return nextDraft
    })
  }

  function openExternalLinkPanel(link = null, platform = '') {
    const normalizedLink = link ? normalizeExternalListingLinks([link])[0] : null
    setExternalLinkDraft(normalizedLink || { ...createExternalLinkDraft(), platform: platform || createExternalLinkDraft().platform })
    setExternalLinkEditingId(normalizedLink?.id || '')
    setDetailError('')
    setExternalLinkPanelOpen(true)
  }

  function closeExternalLinkPanel() {
    setExternalLinkPanelOpen(false)
    setExternalLinkEditingId('')
    setExternalLinkDraft(createExternalLinkDraft())
  }

  async function submitExternalListingLink(event) {
    event.preventDefault()
    const url = String(externalLinkDraft.url || '').trim()
    if (!url) {
      setDetailError('Add a listing URL before saving the external link.')
      return
    }
    const nextLink = {
      id: externalLinkEditingId || generateId('external-link'),
      ...externalLinkDraft,
      url,
      visibleToSeller: isExternalLinkSellerVisible(externalLinkDraft.status),
    }
    setExternalLinkDraft(createExternalLinkDraft())
    await applyMarketingDraftAndPersist(
      (previous) => ({
        ...previous,
        externalLinks: externalLinkEditingId
          ? normalizeExternalListingLinks(previous.externalLinks).map((link) => (String(link.id) === String(externalLinkEditingId) ? nextLink : link))
          : normalizeExternalListingLinks([...(previous.externalLinks || []), nextLink]),
      }),
      { message: externalLinkEditingId ? 'External listing link updated.' : 'External listing link added.' },
    )
    setExternalLinkEditingId('')
    setExternalLinkPanelOpen(false)
  }

  async function addExternalListingLink(event) {
    await submitExternalListingLink(event)
  }

  async function removeExternalListingLink(linkId) {
    await applyMarketingDraftAndPersist(
      (previous) => ({
        ...previous,
        externalLinks: normalizeExternalListingLinks(previous.externalLinks).filter((link) => String(link.id) !== String(linkId)),
      }),
      { message: 'External listing link removed.' },
    )
  }

  async function applyMarketingDraftAndPersist(updater, { message = '', showSaving = false } = {}) {
    const nextDraft = typeof updater === 'function' ? updater(marketingDraft) : updater
    if (!nextDraft) return null
    marketingDraftDirtyRef.current = true
    writeStoredMarketingDraft(listingId, nextDraft)
    if (showSaving) setGallerySaving(true)
    setDetailMessage('')
    setDetailError('')
    setMarketingDraft(nextDraft)
    try {
      return await persistListingSnapshot(nextDraft, { message })
    } finally {
      if (showSaving) setGallerySaving(false)
    }
  }

  async function buildUploadedAsset(file, type, index = 0) {
    const fallbackId = generateId(type === 'floorplans' ? 'floorplan' : 'gallery')
    try {
      const asset = await uploadPrivateListingMediaAsset(file, { listingId: listingRecord?.id, type })
      return {
        id: asset.path || fallbackId,
        name: asset.fileName || file.name,
        label: type === 'floorplans' ? `Plan ${marketingDraft.floorplans.length + index + 1}` : '',
        url: asset.url || asset.signedUrl || asset.publicUrl || '',
        signedUrl: asset.signedUrl || '',
        publicUrl: asset.publicUrl || '',
        bucket: asset.bucket || '',
        path: asset.path || '',
        contentType: asset.contentType || file.type || '',
        size: asset.size || file.size || 0,
      }
    } catch (error) {
      console.warn('[AgentListingDetail] storage upload failed; falling back to local data url', error)
      return {
        id: fallbackId,
        name: file.name,
        label: type === 'floorplans' ? `Plan ${marketingDraft.floorplans.length + index + 1}` : '',
        url: await readAsDataUrl(file),
        contentType: file.type || '',
        size: file.size || 0,
        uploadWarning: error?.message || 'Storage upload failed.',
      }
    }
  }

  async function handleGalleryUpload(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setGallerySaving(true)
    setDetailMessage('')
    setDetailError('')
    try {
      const uploads = await Promise.all(files.map((file, index) => buildUploadedAsset(file, 'gallery', index)))
      const hadFallback = uploads.some((asset) => asset.uploadWarning)
      const nextDraft = {
        ...marketingDraft,
        galleryImages: [...marketingDraft.galleryImages, ...uploads],
        coverImageId: marketingDraft.coverImageId || uploads[0]?.id || '',
      }
      marketingDraftDirtyRef.current = true
      writeStoredMarketingDraft(listingId, nextDraft)
      setMarketingDraft(nextDraft)
      await persistListingSnapshot(nextDraft, {
        message: hadFallback ? 'Images saved locally. Storage upload needs attention.' : 'Images uploaded and saved.',
      })
      if (hadFallback) {
        setDetailError('One or more images could not be uploaded to Supabase Storage, so they were kept as local previews. Try uploading again after checking storage permissions.')
      }
    } finally {
      setGallerySaving(false)
      event.target.value = ''
    }
  }

  async function setCoverImage(imageId) {
    await applyMarketingDraftAndPersist(
      (previous) => ({ ...previous, coverImageId: imageId }),
      { message: 'Cover image saved.', showSaving: true },
    )
  }

  async function moveGalleryImage(imageId, direction) {
    await applyMarketingDraftAndPersist(
      (previous) => {
        const currentIndex = previous.galleryImages.findIndex((image) => String(image.id) === String(imageId))
        if (currentIndex < 0) return previous
        const nextIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1
        if (nextIndex < 0 || nextIndex >= previous.galleryImages.length) return previous
        const nextGallery = [...previous.galleryImages]
        const [item] = nextGallery.splice(currentIndex, 1)
        nextGallery.splice(nextIndex, 0, item)
        return { ...previous, galleryImages: nextGallery }
      },
      { message: 'Gallery order saved.', showSaving: true },
    )
  }

  async function removeGalleryImage(imageId) {
    await applyMarketingDraftAndPersist(
      (previous) => {
        const nextGallery = previous.galleryImages.filter((image) => String(image.id) !== String(imageId))
        return {
          ...previous,
          galleryImages: nextGallery,
          coverImageId:
            String(previous.coverImageId) === String(imageId)
              ? String(nextGallery[0]?.id || '')
              : previous.coverImageId,
        }
      },
      { message: 'Image removed from gallery.', showSaving: true },
    )
  }

  async function handleFloorplanUpload(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setGallerySaving(true)
    setDetailMessage('')
    setDetailError('')
    try {
      const uploads = await Promise.all(files.map((file, index) => buildUploadedAsset(file, 'floorplans', index)))
      const hadFallback = uploads.some((asset) => asset.uploadWarning)
      const nextDraft = { ...marketingDraft, floorplans: [...marketingDraft.floorplans, ...uploads] }
      marketingDraftDirtyRef.current = true
      writeStoredMarketingDraft(listingId, nextDraft)
      setMarketingDraft(nextDraft)
      await persistListingSnapshot(nextDraft, {
        message: hadFallback ? 'Floor plans saved locally. Storage upload needs attention.' : 'Floor plans uploaded and saved.',
      })
      if (hadFallback) {
        setDetailError('One or more floor plans could not be uploaded to Supabase Storage, so they were kept as local previews.')
      }
    } finally {
      setGallerySaving(false)
      event.target.value = ''
    }
  }

  function updateFloorplanLabel(id, label) {
    marketingDraftDirtyRef.current = true
    setMarketingDraft((previous) => {
      const nextDraft = {
        ...previous,
        floorplans: previous.floorplans.map((plan) => (String(plan.id) === String(id) ? { ...plan, label } : plan)),
      }
      writeStoredMarketingDraft(listingId, nextDraft)
      return nextDraft
    })
  }

  function removeFloorplan(id) {
    marketingDraftDirtyRef.current = true
    setMarketingDraft((previous) => {
      const nextDraft = {
        ...previous,
        floorplans: previous.floorplans.filter((plan) => String(plan.id) !== String(id)),
      }
      writeStoredMarketingDraft(listingId, nextDraft)
      return nextDraft
    })
  }

  async function handleDeleteListing() {
    const listingTitle = String(listingRecord?.listingTitle || 'this listing').trim()
    const confirmed = window.confirm(
      `Permanently delete "${listingTitle}"?\n\nThis removes the listing from Arch9, local fallback storage, seller workflow drafts, onboarding-linked listing records, documents, and activity. This cannot be undone.`,
    )
    if (!confirmed) return

    setDeletingListing(true)
    setDetailError('')
    setDetailMessage('')

    try {
      if (isSupabaseConfigured && isUuidLike(listingId)) {
        const remoteDelete = await deletePrivateListing(listingId, { organisationId: listingOrganisationId })
        if (!remoteDelete?.deleted) {
          throw new Error('Could not delete listing. Please try again.')
        }
      }
      deleteAgentPrivateListingCascade(listingRecord || listingId)
      window.dispatchEvent(new Event('itg:listings-updated'))
      navigate('/listings', {
        replace: true,
        state: { message: `"${listingTitle}" was permanently deleted.` },
      })
    } catch (error) {
      setDetailError(error?.message || 'Unable to delete this listing.')
    } finally {
      setDeletingListing(false)
    }
  }

  const sellerProfileBuilderBranch = sellerProfileBuilderDraft.branch || 'individual'
  const sellerProfileBuilderShowsCompany = ['company', 'foreign_company'].includes(sellerProfileBuilderBranch)
  const sellerProfileBuilderShowsTrust = ['trust', 'foreign_trust'].includes(sellerProfileBuilderBranch)
  const sellerProfileBuilderShowsForeign = sellerProfileBuilderBranch.startsWith('foreign_')
  const sellerProfileBuilderShowsMultipleOwners = sellerProfileBuilderBranch === 'multiple_owners'
  const sellerProfileBuilderShowsSpouse = sellerProfileBuilderBranch === 'married'

  function renderProperty24ManagePanel() {
    return (
      <Modal
        open={property24ManageOpen}
        onClose={() => setProperty24ManageOpen(false)}
        title="Manage Property24"
        subtitle="Use the existing Property24 publishing actions for this listing."
        className="max-w-5xl"
      >
        <div className="grid gap-5">
          <section className="grid gap-3 md:grid-cols-3">
            <InfoTile icon={Building2} label="Status" value={property24Published ? 'Live' : formatStatusLabel(property24StatusKey || 'not_published')} status={property24Published ? 'live' : property24StatusKey || 'pending'} />
            <InfoTile icon={Link2} label="Property24 reference" value={property24Reference || 'Not assigned'} />
            <InfoTile icon={RefreshCw} label="Last synced" value={formatRelativeTime(property24LastSyncedAt)} />
          </section>

          <section className="rounded-[18px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
            <p className="text-sm font-semibold text-[#142132]">Listing data status</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ['Price', Number(marketingDraft.price || listingRecord?.askingPrice || 0) > 0],
                ['Description', Boolean(marketingDraft.description.trim())],
                ['Photos', marketingDraft.galleryImages.length > 0],
                ['Features', marketingDraft.selectedFeatures.length > 0 || marketingDraft.amenities.length > 0],
                ['Agent', Boolean(listingActor.name || listingActor.email)],
              ].map(([label, complete]) => (
                <CompletionBadge key={label} complete={Boolean(complete)} label={`${label} ${complete ? 'ready' : 'missing'}`} />
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-[#607387]">{property24NextStep}</p>
          </section>

          <section className="grid gap-3 lg:grid-cols-4">
            <div className="rounded-[16px] border border-[#e1e9f2] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">1. Check</p>
              <Button type="button" size="sm" variant="secondary" className="mt-2 w-full justify-center" onClick={previewProperty24Listing} disabled={Boolean(property24Action)}>
                {property24Action === 'preview' ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
                Preview Readiness
              </Button>
            </div>
            <div className="rounded-[16px] border border-[#e1e9f2] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">2. Send</p>
              <Button type="button" size="sm" className="mt-2 w-full justify-center" onClick={publishProperty24Listing} disabled={property24PublishDisabled}>
                {property24Action === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {property24PrimaryActionLabel}
              </Button>
            </div>
            <div className="rounded-[16px] border border-[#e1e9f2] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">3. Status</p>
              <Field as="select" value={property24StatusUpdate} onChange={(event) => setProperty24StatusUpdate(event.target.value)} disabled={Boolean(property24Action)} className="mt-2 min-h-9 text-sm">
                {PROPERTY24_STATUS_UPDATE_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </Field>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button type="button" size="sm" variant="secondary" onClick={updateProperty24ListingStatus} disabled={Boolean(property24Action) || !property24HasReference}>
                  {property24Action === 'status-update' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Update Status
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={refreshProperty24ListingStatus} disabled={Boolean(property24Action) || !property24HasReference}>
                  {property24Action === 'status' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  Refresh Status
                </Button>
              </div>
              {!property24HasReference ? <p className="mt-2 text-xs leading-5 text-[#8a5b13]">Status actions unlock after Property24 returns a listing reference.</p> : null}
            </div>
            <div className="rounded-[16px] border border-[#e1e9f2] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">4. Leads</p>
              <div className="mt-2 grid gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => pullProperty24ListingLeads({ applyLeads: false })} disabled={Boolean(property24Action) || !property24HasReference}>
                  {property24Action === 'lead-preview' ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />}
                  Check Leads
                </Button>
                <Button type="button" size="sm" onClick={() => pullProperty24ListingLeads({ applyLeads: true })} disabled={Boolean(property24Action) || !property24HasReference}>
                  {property24Action === 'lead-import' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  Import Leads
                </Button>
              </div>
            </div>
          </section>

          {property24Preview ? (
            <section className="grid gap-3 md:grid-cols-4">
              <InfoTile label="Preview status" value={formatStatusLabel(property24Preview.status || 'preview')} />
              <InfoTile label="Data blockers" value={property24PreviewCounts.dataBlockers} status={property24PreviewCounts.dataBlockers ? 'missing' : 'complete'} />
              <InfoTile label="Images loaded" value={property24PreviewCounts.imagesLoaded} status={property24PreviewCounts.imagesLoaded ? 'complete' : 'pending'} />
              <InfoTile label="Image errors" value={property24PreviewCounts.imagesFailed} status={property24PreviewCounts.imagesFailed ? 'missing' : 'complete'} />
            </section>
          ) : null}

          {property24LeadImport ? (
            <section className="grid gap-3 md:grid-cols-5">
              <InfoTile label="Leads found" value={property24LeadImportCounts.received} />
              <InfoTile label="Imported" value={property24LeadImportCounts.imported} status="complete" />
              <InfoTile label="Already in Arch9" value={property24LeadImportCounts.alreadyImported} />
              <InfoTile label="Needs review" value={property24LeadImportCounts.needsReview} status={property24LeadImportCounts.needsReview ? 'missing' : 'complete'} />
              <InfoTile label="Failed" value={property24LeadImportCounts.failed} status={property24LeadImportCounts.failed ? 'missing' : 'complete'} />
            </section>
          ) : null}
        </div>
      </Modal>
    )
  }

  function renderExternalLinkPanel() {
    return (
      <Modal
        open={externalLinkPanelOpen}
        onClose={closeExternalLinkPanel}
        title={externalLinkEditingId ? 'Edit Channel' : 'Add Channel'}
        subtitle="Track a manually published listing using the existing external link fields."
        className="max-w-4xl"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={closeExternalLinkPanel}>Cancel</Button>
            <Button type="submit" form="external-listing-link-form">
              <Plus size={15} />
              {externalLinkEditingId ? 'Save Channel' : 'Add Channel'}
            </Button>
          </div>
        )}
      >
        <form id="external-listing-link-form" onSubmit={addExternalListingLink} className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Platform</span>
            <Field as="select" value={externalLinkDraft.platform} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, platform: event.target.value }))}>
              {EXTERNAL_LINK_PLATFORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Listing URL</span>
            <Field value={externalLinkDraft.url} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, url: event.target.value }))} placeholder="https://..." />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Status</span>
            <Field as="select" value={externalLinkDraft.status} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, status: event.target.value }))}>
              {EXTERNAL_LINK_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Published Date</span>
            <Field type="date" value={externalLinkDraft.publishedAt} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, publishedAt: event.target.value }))} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Last Checked</span>
            <Field type="date" value={externalLinkDraft.lastCheckedAt} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, lastCheckedAt: event.target.value }))} />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-semibold text-[#2d445e]">Notes</span>
            <Field as="textarea" rows={3} value={externalLinkDraft.notes} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Notes or publishing metadata" />
          </label>
        </form>
      </Modal>
    )
  }

  function renderMarketingConsole() {
    const privatePropertyUrl = marketingDraft.privatePropertyListingUrl || privatePropertyLink?.url || ''
    const privatePropertyReference = marketingDraft.privatePropertyReference || privatePropertyLink?.reference || ''
    const privatePropertyDistributionStatus = privatePropertyStatusKey || normalizeKey(privatePropertyLink?.status || 'not_published')
    const privatePropertyLive = ['published', 'live', 'active'].includes(privatePropertyDistributionStatus)
    const visibleExternalListingLinks = externalListingLinks.filter((link) => {
      const platformKey = normalizeKey(link.platform)
      return link.id !== agencyWebsiteLink?.id && link.id !== privatePropertyLink?.id && !platformKey.includes('private')
    })
    const property24IssueCount = property24SandboxAgentIdPending
      ? Math.max(1, property24ReadinessIssues.length)
      : property24ReadinessIssues.length
    const property24IssueDetail = property24ReadinessIssues[0] || (property24SandboxAgentIdPending ? 'Property24 agent ID needs confirmation' : '')
    const property24ChannelStatus = property24Action
      ? 'syncing'
      : property24Published
        ? 'live'
        : property24IssueCount || property24HasPreviewBlockers || property24SandboxAgentIdPending
          ? 'needs_attention'
          : 'not_published'
    const property24ChannelLabel = property24Action
      ? 'Syncing'
      : property24Published
        ? 'Live'
        : property24ChannelStatus === 'needs_attention'
          ? 'Needs attention'
          : 'Not published'
    const property24ContextTitle = property24IssueCount
      ? `${property24IssueCount} issue${property24IssueCount === 1 ? '' : 's'} preventing publication`
      : property24Published
        ? 'Published and up to date'
        : property24CanSubmit === true
          ? 'Ready to publish'
          : 'Run readiness check before publishing'
    const channelRows = [
      {
        key: 'property24',
        icon: Building2,
        logoSrc: '/lead-sources/property24.png',
        name: 'Property24',
        subtitle: "South Africa's property portal",
        reference: property24Reference ? `Ref: ${property24Reference}` : '',
        status: property24ChannelStatus,
        statusLabel: property24ChannelLabel,
        contextTitle: property24ContextTitle,
        contextDetail: property24IssueDetail,
        lastSynced: property24LastSyncedAt ? formatRelativeTime(property24LastSyncedAt) : '',
        primaryAction: property24Action ? (
          <Button type="button" size="sm" variant="secondary" disabled>
            <Loader2 size={15} className="animate-spin" />
            Syncing...
          </Button>
        ) : property24Published && marketingDraft.property24ListingUrl ? (
          <a href={marketingDraft.property24ListingUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:bg-[#f7fbff]">
            <Eye size={15} />
            View Live Listing
          </a>
        ) : property24ChannelStatus === 'needs_attention' || property24CanSubmit !== true ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => setProperty24ManageOpen(true)}>
            <CircleAlert size={15} />
            Review issues
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={publishProperty24Listing} disabled={property24PublishDisabled}>
            {property24Action === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Publish
          </Button>
        ),
        secondaryAction: property24Published || property24CanSubmit === true ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => setProperty24ManageOpen(true)} disabled={Boolean(property24Action)}>
            Manage
          </Button>
        ) : null,
        menuActions: [
          <button key="check" type="button" onClick={previewProperty24Listing} disabled={Boolean(property24Action)} className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm font-semibold text-[#243d56] transition hover:bg-[#f7fbff] disabled:cursor-not-allowed disabled:opacity-50">
            {property24Action === 'preview' ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
            Check readiness
          </button>,
          <button key="more" type="button" onClick={() => setProperty24ManageOpen(true)} className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm font-semibold text-[#243d56] transition hover:bg-[#f7fbff]">
            <SlidersHorizontal size={15} />
            More actions
          </button>,
        ],
      },
      {
        key: 'private_property',
        icon: Home,
        logoSrc: '/lead-sources/private-property.jpeg',
        name: 'Private Property',
        subtitle: 'Property portal',
        reference: privatePropertyReference ? `Ref: ${privatePropertyReference}` : '',
        status: privatePropertyLive ? 'live' : 'not_published',
        statusLabel: privatePropertyLive ? 'Live' : 'Not published',
        contextTitle: privatePropertyLive ? 'Published and up to date' : 'Ready to publish',
        contextDetail: privatePropertyUrl ? '' : 'Add the listing link or portal reference when available',
        lastSynced: privatePropertyUrl ? 'Managed externally' : '',
        primaryAction: privatePropertyLive && privatePropertyUrl ? (
          <a href={privatePropertyUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:bg-[#f7fbff]">
            <Eye size={15} />
            View Live Listing
          </a>
        ) : (
          <Button type="button" size="sm" onClick={() => openExternalLinkPanel(privatePropertyLink, 'Private Property')}>
            <Send size={15} />
            Publish
          </Button>
        ),
        secondaryAction: privatePropertyHasChannel ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => openExternalLinkPanel(privatePropertyLink, 'Private Property')}>
            Manage
          </Button>
        ) : null,
      },
      ...(agencyWebsiteLink ? [{
        key: 'agency_website',
        icon: Globe,
        name: 'Your Website',
        subtitle: 'Agency website',
        reference: '',
        status: isExternalLinkSellerVisible(agencyWebsiteLink.status) ? 'live' : 'not_published',
        statusLabel: isExternalLinkSellerVisible(agencyWebsiteLink.status) ? 'Live' : 'Not published',
        contextTitle: isExternalLinkSellerVisible(agencyWebsiteLink.status) ? 'Published and up to date' : 'Not published on website',
        contextDetail: agencyWebsiteLink.url || '',
        lastSynced: agencyWebsiteLink.lastCheckedAt ? formatDate(agencyWebsiteLink.lastCheckedAt) : 'Manual channel',
        primaryAction: agencyWebsiteLink.url ? (
          <a href={agencyWebsiteLink.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:bg-[#f7fbff]">
            <Eye size={15} />
            View Live Listing
          </a>
        ) : null,
        secondaryAction: (
          <Button type="button" size="sm" variant="secondary" onClick={() => openExternalLinkPanel(agencyWebsiteLink)}>
            Manage
          </Button>
        ),
      }] : []),
      ...visibleExternalListingLinks.map((link) => {
        const live = isExternalLinkSellerVisible(link.status)
        return {
          key: link.id,
          icon: ExternalLink,
          name: link.platform || 'Other Channel',
          subtitle: link.url || 'Manual publishing channel',
          reference: '',
          status: live ? 'live' : 'not_published',
          statusLabel: live ? 'Live' : 'Not published',
          contextTitle: live ? 'Published and up to date' : 'Ready to publish',
          contextDetail: link.notes || '',
          lastSynced: link.publishedAt ? formatDate(link.publishedAt) : link.lastCheckedAt ? formatDate(link.lastCheckedAt) : 'Manual channel',
          primaryAction: link.url ? (
            <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:bg-[#f7fbff]">
              <Eye size={15} />
              View Live Listing
            </a>
          ) : (
            <Button type="button" size="sm" variant="secondary" disabled>
              <Eye size={15} />
              View Live Listing
            </Button>
          ),
          secondaryAction: (
            <Button type="button" size="sm" variant="secondary" onClick={() => openExternalLinkPanel(link)}>
              Manage
            </Button>
          ),
          menuActions: [
            <button key="remove" type="button" onClick={() => removeExternalListingLink(link.id)} className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm font-semibold text-[#b42318] hover:bg-[#fff5f5]">
              <Trash2 size={15} />
              Remove
            </button>,
          ],
        }
      }),
    ]
    const marketingLiveChannelCount = channelRows.filter((channel) => normalizeKey(channel.status) === 'live').length
    const channelCountLabel = channelRows.length ? `${marketingLiveChannelCount} / ${channelRows.length}` : String(marketingLiveChannelCount)
    const remainingReadinessCount = incompleteReadinessItems.length

    return (
      <section className="space-y-5">
        <div className="flex flex-wrap justify-end gap-2">
          <a href={arch9PublicListingUrl || `${ARCH9_PUBLIC_SITE_ORIGIN}/buy`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-4 text-sm font-semibold text-[#2d445e] transition hover:border-[#b7c8db] hover:bg-[#f7fbff]">
            <Eye size={15} />
            Preview Listing
          </a>
          <Button type="button" onClick={() => saveMarketingDraft(marketingDraft, { successMessage: 'Marketing changes saved and synced.' })}>
            <Send size={15} />
            Publish Changes
          </Button>
        </div>
        <section className="overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
          <div className="grid sm:grid-cols-3">
            <MarketingSummaryItem icon={CheckCircle2} value={`${listingReadinessPercent}%`} label="Listing readiness" actionLabel="View checklist" onAction={() => setReadinessChecklistOpen(true)} tone={listingReadinessPercent >= 80 ? 'success' : 'attention'} />
            <MarketingSummaryItem icon={ExternalLink} value={channelCountLabel} label="Channels live" actionLabel="View channels" onAction={() => document.getElementById('listing-distribution-channels')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} tone={marketingLiveChannelCount ? 'success' : 'default'} />
            <MarketingSummaryItem icon={RefreshCw} value={formatRelativeTime(marketingLastSyncedAt)} label="Last synced" tone="default" />
          </div>
          {remainingReadinessCount ? (
            <div className="flex flex-col gap-2 border-t border-[#edf2f7] bg-[#fffaf0] px-4 py-3 text-sm text-[#8a5b13] sm:flex-row sm:items-center sm:justify-between">
              <p className="inline-flex min-w-0 items-center gap-2 font-semibold">
                <CircleAlert size={15} />
                Complete {remainingReadinessCount} remaining item{remainingReadinessCount === 1 ? '' : 's'} before publishing.
              </p>
              <button type="button" onClick={() => setReadinessChecklistOpen(true)} className="inline-flex min-h-8 w-fit items-center rounded-lg border border-[#f1dfb8] bg-white px-3 text-xs font-semibold text-[#8a5b13] transition hover:bg-[#fff8e8]">
                View readiness items
              </button>
            </div>
          ) : null}
        </section>

        <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.8fr)]">
          <article className="flex h-full flex-col rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#142132]">Listing Content</h3>
                <p className="mt-1 text-sm text-[#607387]">Marketing-facing copy buyers will see.</p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={openPropertyDetailsFromMarketing}>
                Edit property details
                <ChevronRight size={15} />
              </Button>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Headline</span>
                <Field value={marketingDraft.headline} onChange={(event) => updateMarketingDraft('headline', event.target.value)} placeholder="Modern family home in secure estate" />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Description</span>
                <Field as="textarea" rows={5} value={marketingDraft.description} onChange={(event) => updateMarketingDraft('description', event.target.value)} placeholder="Public-facing listing description." />
              </label>
              <div>
                <p className="text-sm font-semibold text-[#2d445e]">Selling Points</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {marketingSellingPoints.length ? marketingSellingPoints.slice(0, 10).map((point) => (
                    <span key={point} className="rounded-full border border-[#dbe6f2] bg-[#f8fbfd] px-3 py-1.5 text-xs font-semibold text-[#2d445e]">{point}</span>
                  )) : (
                    <span className="rounded-full border border-[#f1dfb8] bg-[#fff8e8] px-3 py-1.5 text-xs font-semibold text-[#8a641d]">No selling points selected</span>
                  )}
                  <details className="relative">
                    <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-full border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#1f4f78] [&::-webkit-details-marker]:hidden">
                      <Plus size={13} />
                      Add
                    </summary>
                    <div className="absolute left-0 z-30 mt-2 grid w-[280px] gap-3 rounded-[16px] border border-[#dbe6f2] bg-white p-3 shadow-[0_18px_34px_rgba(15,23,42,0.14)]">
                      <div className="flex flex-wrap gap-2">
                        {[...FEATURE_OPTIONS, ...AMENITY_OPTIONS].map((item) => {
                          const active = marketingDraft.selectedFeatures.includes(item) || marketingDraft.amenities.includes(item)
                          const toggle = FEATURE_OPTIONS.includes(item) ? toggleFeature : toggleAmenity
                          return (
                            <button key={item} type="button" onClick={() => toggle(item)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? 'border-[#1f4f78] bg-[#eef5fb] text-[#1f4f78]' : 'border-[#dbe6f2] bg-white text-[#47627c]'}`}>
                              {item}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#142132]">Media</h3>
                <p className="mt-1 text-sm text-[#607387]">Control what buyers see across your marketing channels.</p>
              </div>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:border-[#b7c8db] hover:bg-[#f7fbff]">
                <Pencil size={15} />
                Edit Media
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} disabled={gallerySaving} />
              </label>
            </div>
            <div className="mt-5 overflow-x-auto pb-2">
              <div className="flex min-w-max gap-3">
                {marketingDraft.galleryImages.length ? marketingDraft.galleryImages.map((image, index) => {
                  const isCover = String(image.id) === String(marketingDraft.coverImageId)
                  const tileClass = index === 0
                    ? 'w-[440px] max-w-[68vw]'
                    : 'w-[170px]'
                  return (
                    <div key={image.id} className={`shrink-0 overflow-hidden rounded-[14px] border bg-white ${tileClass} ${isCover ? 'border-[#1f4f78]' : 'border-[#dce6f2]'}`}>
                      <button type="button" onClick={() => setCoverImage(image.id)} disabled={isCover || gallerySaving} className="relative block h-[184px] w-full overflow-hidden bg-[#eef4fa] disabled:cursor-default">
                        {getImageBlock(image.url, image.name)}
                        {isCover ? <span className="absolute left-2 top-2 rounded-full bg-[#123955] px-2 py-1 text-[0.62rem] font-semibold text-white">Cover</span> : null}
                      </button>
                      <div className="flex h-11 items-center justify-between gap-2 border-t border-[#edf2f7] px-2">
                        <button type="button" onClick={() => setCoverImage(image.id)} disabled={isCover || gallerySaving} className="truncate rounded px-1.5 py-1 text-xs font-semibold text-[#1f4f78] disabled:text-[#9aa9b8]">Cover</button>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => moveGalleryImage(image.id, 'left')} disabled={index === 0 || gallerySaving} className="grid h-7 w-7 place-items-center rounded border border-[#dbe6f2] text-[#607387] disabled:opacity-40" aria-label={`Move ${image.name} left`}><ChevronLeft size={13} /></button>
                          <button type="button" onClick={() => moveGalleryImage(image.id, 'right')} disabled={index === marketingDraft.galleryImages.length - 1 || gallerySaving} className="grid h-7 w-7 place-items-center rounded border border-[#dbe6f2] text-[#607387] disabled:opacity-40" aria-label={`Move ${image.name} right`}><ChevronRight size={13} /></button>
                          <button type="button" onClick={() => removeGalleryImage(image.id)} disabled={gallerySaving} className="grid h-7 w-7 place-items-center rounded border border-[#f1c8c8] text-[#b42318] disabled:opacity-40" aria-label={`Remove ${image.name}`}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    </div>
                  )
                }) : (
                  <div className="grid h-[229px] w-[440px] max-w-[68vw] shrink-0 place-items-center rounded-[14px] border border-[#dce6f2] bg-[#eef4fa] text-sm font-semibold text-[#6b7d93]">No photos added</div>
                )}
                <label className="grid h-[229px] w-[150px] shrink-0 cursor-pointer place-items-center rounded-[14px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] text-center text-xs font-semibold text-[#5f7894] hover:bg-[#f7fbff]">
                  <span className="grid justify-items-center gap-1">
                    <ImagePlus size={18} />
                    Add Photos
                  </span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} disabled={gallerySaving} />
                </label>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {marketingMediaBadges.map((badge) => {
                const optional = ['floorplan', 'video', 'tour'].includes(badge.key)
                const badgeClass = badge.complete
                  ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
                  : optional
                    ? 'border-[#dbe6f2] bg-[#f8fbff] text-[#607387]'
                    : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'
                return (
                  <span key={badge.key} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${badgeClass}`}>
                    {badge.complete ? <CheckCircle2 size={12} /> : optional ? <span className="h-2 w-2 rounded-full border border-current" /> : <CircleAlert size={12} />}
                    {badge.label}
                  </span>
                )
              })}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Video Link</span>
                <Field value={marketingDraft.videoLink} onChange={(event) => updateMarketingDraft('videoLink', event.target.value)} placeholder="https://youtu.be/..." />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Virtual Tour Link</span>
                <Field value={marketingDraft.virtualTourLink} onChange={(event) => updateMarketingDraft('virtualTourLink', event.target.value)} placeholder="https://my.matterport.com/..." />
              </label>
              <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:border-[#b7c8db] hover:bg-[#f7fbff] md:col-span-2">
                <FileText size={15} />
                Upload Floor Plan
                <input type="file" accept=".pdf,image/*" multiple className="hidden" onChange={handleFloorplanUpload} disabled={gallerySaving} />
              </label>
              {marketingDraft.floorplans.length ? (
                <div className="grid gap-2 md:col-span-2">
                  {marketingDraft.floorplans.map((plan) => (
                    <div key={plan.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-2">
                      <span className="truncate text-sm font-semibold text-[#243d56]">{plan.label || plan.name}</span>
                      <button type="button" onClick={() => removeFloorplan(plan.id)} className="text-[#6b7d93] hover:text-[#142132]" aria-label={`Remove ${plan.label || plan.name}`}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        </section>

        <article id="listing-distribution-channels" className="overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
          <div className="flex flex-col gap-3 border-b border-[#edf2f7] p-5 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-[#142132]">Listing Channels</h3>
              <p className="mt-1 text-sm text-[#607387]">Manage where this property is advertised.</p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => openExternalLinkPanel()}>
              <Plus size={15} />
              Add Channel
            </Button>
          </div>

          {channelRows.map((channel) => (
            <DistributionChannel
              key={channel.key}
              icon={channel.icon}
              logoSrc={channel.logoSrc}
              name={channel.name}
              subtitle={channel.subtitle}
              reference={channel.reference}
              status={channel.status}
              statusLabel={channel.statusLabel}
              contextTitle={channel.contextTitle}
              contextDetail={channel.contextDetail}
              lastSynced={channel.lastSynced}
              primaryAction={channel.primaryAction}
              secondaryAction={channel.secondaryAction}
              menuActions={channel.menuActions || []}
            />
          ))}

          {!visibleExternalListingLinks.length ? (
            <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-[12px] border border-dashed border-[#c9d8e8] text-[#607387]"><Plus size={17} /></span>
                <div>
                  <p className="text-sm font-semibold text-[#142132]">Other Channels</p>
                  <p className="text-xs text-[#607387]">Add a manually published listing.</p>
                </div>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => openExternalLinkPanel()}>
                <Plus size={15} />
                Add Channel
              </Button>
            </div>
          ) : null}
        </article>

        <Modal
          open={readinessChecklistOpen}
          onClose={() => setReadinessChecklistOpen(false)}
          title="Listing Readiness"
          subtitle={`${listingReadinessCompleted} of ${listingReadinessItems.length} completed`}
          className="max-w-3xl"
        >
          <div className="h-2 overflow-hidden rounded-full bg-[#e5edf6]">
            <div className="h-full rounded-full bg-[#2f8f6b]" style={{ width: `${listingReadinessPercent}%` }} />
          </div>
          <div className="mt-5 grid gap-3">
            {listingReadinessItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e1e9f2] bg-[#fbfdff] px-3 py-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2 text-[#425970]">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.complete ? 'bg-[#ecfaf1] text-[#1f7d44]' : 'bg-[#fff8ec] text-[#9a5b13]'}`}>
                    {item.complete ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
                  </span>
                  <span className="truncate font-semibold">{item.label}</span>
                </span>
                <StatusPill status={item.complete ? 'complete' : 'missing'} label={item.complete ? 'Ready' : 'Needs attention'} />
              </div>
            ))}
          </div>
          {!mandateWorkspace.isSigned ? (
            <div className="mt-5 rounded-[16px] border border-[#f1dfb8] bg-[#fff8e8] p-4">
              <p className="text-sm font-semibold text-[#8a641d]">Mandate not signed</p>
              <p className="mt-1 text-sm leading-6 text-[#8a641d]">Capture or send the mandate before this becomes active agency stock.</p>
              <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => openSellerWorkspaceSection('seller')}>Open mandate workflow</Button>
            </div>
          ) : null}
        </Modal>

        {renderProperty24ManagePanel()}
        {renderExternalLinkPanel()}
      </section>
    )
  }

  if (loading || listingId.startsWith('development-')) {
    return (
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <p className="text-sm text-[#6b7d93]">{listingId.startsWith('development-') ? 'Redirecting to development workspace…' : 'Loading listing…'}</p>
      </section>
    )
  }

  if (!listingRecord) {
    return (
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <p className="text-sm text-[#6b7d93]">{detailError || 'Listing not found.'}</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/listings')}>
            Back to Listings
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <StartDocumentModal
        open={mandateStartOpen && !listingHasKingstonsSellerProcess}
        onClose={() => setMandateStartOpen(false)}
        entryPoint={DOCUMENT_START_ENTRY_POINTS.listingMandate}
        packetType={DOCUMENT_START_PACKET_TYPES.mandate}
        documentKind={DOCUMENT_START_DOCUMENT_KINDS.standard}
        initialSourceMode={DOCUMENT_START_SOURCE_MODES.saved}
        hasExistingContext={Boolean(listingRecord?.id)}
        hasClientContact={Boolean(resolveSellerEmailFromListing(listingRecord) || formatSouthAfricanWhatsAppNumber(resolveSellerPhoneFromListing(listingRecord)))}
        hasParentDocument
        contextSummary={listingMandateStartSummary}
        initialLegalScenario={listingMandateLegalScenario}
        title="Create Mandate"
        subtitle="Start from saved listing details, enter the missing fields manually, or send seller onboarding."
        busy={followUpActionId === 'generate_mandate' || followUpActionId === 'send_onboarding'}
        onContinue={(selection) => void handleStartListingMandateDocument(selection)}
      />
      <StartDocumentModal
        open={Boolean(acceptedOfferOtpStartOffer) && !listingKingstonsBuyerOtpDigitalDecision.blocked}
        onClose={() => setAcceptedOfferOtpStartOffer(null)}
        entryPoint={DOCUMENT_START_ENTRY_POINTS.acceptedOfferOtp}
        packetType={DOCUMENT_START_PACKET_TYPES.otp}
        documentKind={DOCUMENT_START_DOCUMENT_KINDS.standard}
        initialSourceMode={DOCUMENT_START_SOURCE_MODES.saved}
        hasExistingContext={Boolean(acceptedOfferOtpStartOffer?.transactionId || acceptedOfferOtpStartOffer?.transaction_id)}
        hasClientContact={Boolean(
          acceptedOfferOtpStartOffer?.buyerEmail ||
            acceptedOfferOtpStartOffer?.conditionsJson?.buyerEmail ||
            acceptedOfferOtpStartOffer?.conditions?.buyerEmail ||
            acceptedOfferOtpStartOffer?.buyerLeadId
        )}
        hasParentDocument
        contextSummary={acceptedOfferOtpStartSummary}
        initialLegalScenario={acceptedOfferOtpLegalScenario}
        title="Create OTP"
        subtitle="Start from the accepted offer and review the OTP before sending it for signature."
        busy={canonicalOfferActionId === `${acceptedOfferOtpStartOffer?.id}:otp_onboarding`}
        onContinue={(selection) => void handleStartAcceptedOfferOtpDocument(selection)}
      />
      {detailError ? (
        <div className="rounded-[14px] border border-[#f3d2cc] bg-[#fef3f2] px-4 py-3 text-sm font-medium text-[#b42318]">{detailError}</div>
      ) : null}
      {detailMessage ? (
        <div className="rounded-[14px] border border-[#d8eddf] bg-[#ecfaf1] px-4 py-3 text-sm font-medium text-[#1f7d44]">{detailMessage}</div>
      ) : null}
      <Modal
        open={sellerProfileBuilderOpen}
        onClose={sellerProfileBuilderSaving ? undefined : () => setSellerProfileBuilderOpen(false)}
        title="Complete Seller Profile"
        subtitle="Capture the seller ownership model and mandate facts for this listing."
        className="max-w-5xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setSellerProfileBuilderOpen(false)} disabled={sellerProfileBuilderSaving}>
              Cancel
            </Button>
            <Button type="submit" form="listing-seller-profile-builder-form" disabled={sellerProfileBuilderSaving}>
              {sellerProfileBuilderSaving ? 'Saving...' : 'Save Seller Profile'}
            </Button>
          </div>
        }
      >
        <form id="listing-seller-profile-builder-form" className="space-y-5" onSubmit={handleSaveSellerProfileBuilder}>
          <section className="grid gap-4 rounded-[18px] border border-[#dce6f2] bg-white p-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Seller model
              <Field as="select" value={sellerProfileBuilderDraft.branch || 'individual'} onChange={(event) => updateSellerProfileBuilderDraft('branch', event.target.value)}>
                {LISTING_SELLER_PROFILE_BRANCHES.map((branch) => (
                  <option key={branch.value} value={branch.value}>{branch.label}</option>
                ))}
              </Field>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Mandate type
              <Field as="select" value={sellerProfileBuilderDraft.mandateType || 'sole'} onChange={(event) => updateSellerProfileBuilderDraft('mandateType', event.target.value)}>
                <option value="sole">Sole</option>
                <option value="dual">Dual</option>
                <option value="tri">Tri</option>
                <option value="open">Open</option>
              </Field>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Contact first name
              <Field value={sellerProfileBuilderDraft.sellerFirstName || ''} onChange={(event) => updateSellerProfileBuilderDraft('sellerFirstName', event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Contact surname
              <Field value={sellerProfileBuilderDraft.sellerSurname || ''} onChange={(event) => updateSellerProfileBuilderDraft('sellerSurname', event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Email
              <Field type="email" value={sellerProfileBuilderDraft.email || ''} onChange={(event) => updateSellerProfileBuilderDraft('email', event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Phone
              <Field type="tel" value={sellerProfileBuilderDraft.phone || ''} onChange={(event) => updateSellerProfileBuilderDraft('phone', event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              ID / Passport
              <Field value={sellerProfileBuilderDraft.idNumber || ''} onChange={(event) => updateSellerProfileBuilderDraft('idNumber', event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Marital status
              <Field as="select" value={sellerProfileBuilderDraft.maritalStatus || ''} onChange={(event) => updateSellerProfileBuilderDraft('maritalStatus', event.target.value)}>
                <option value="">Not captured</option>
                <option value="single">Single</option>
                <option value="married_in_community">Married in community</option>
                <option value="married_out_of_community">Married out of community</option>
                <option value="divorced">Divorced</option>
                <option value="widowed">Widowed</option>
              </Field>
            </label>
            {sellerProfileBuilderShowsSpouse ? (
              <>
                <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                  Spouse full name
                  <Field value={sellerProfileBuilderDraft.spouseName || ''} onChange={(event) => updateSellerProfileBuilderDraft('spouseName', event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                  Spouse email
                  <Field type="email" value={sellerProfileBuilderDraft.spouseEmail || ''} onChange={(event) => updateSellerProfileBuilderDraft('spouseEmail', event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                  Spouse ID number
                  <Field value={sellerProfileBuilderDraft.spouseIdNumber || ''} onChange={(event) => updateSellerProfileBuilderDraft('spouseIdNumber', event.target.value)} />
                </label>
              </>
            ) : null}
          </section>

          {sellerProfileBuilderShowsMultipleOwners ? (
            <SellerProfilePeopleEditor
              title="Owners"
              roleTitle="Owner"
              rows={sellerProfileBuilderDraft.multipleOwners || []}
              onAdd={() => addSellerProfileBuilderPerson('multipleOwners', 'Owner')}
              onUpdate={(index, field, value) => updateSellerProfileBuilderPerson('multipleOwners', index, field, value)}
              onRemove={(index) => removeSellerProfileBuilderPerson('multipleOwners', index)}
            />
          ) : null}

          {sellerProfileBuilderShowsCompany ? (
            <section className="grid gap-4 rounded-[18px] border border-[#dce6f2] bg-white p-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Company / CC name
                <Field value={sellerProfileBuilderDraft.companyName || ''} onChange={(event) => updateSellerProfileBuilderDraft('companyName', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Registration number
                <Field value={sellerProfileBuilderDraft.companyRegistrationNumber || ''} onChange={(event) => updateSellerProfileBuilderDraft('companyRegistrationNumber', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e] sm:col-span-2">
                Registered address
                <Field value={sellerProfileBuilderDraft.companyRegisteredAddress || ''} onChange={(event) => updateSellerProfileBuilderDraft('companyRegisteredAddress', event.target.value)} />
              </label>
              <SellerProfilePeopleEditor
                title="Directors / Members"
                roleTitle="Director"
                rows={sellerProfileBuilderDraft.companyDirectors || []}
                onAdd={() => addSellerProfileBuilderPerson('companyDirectors', 'Director')}
                onUpdate={(index, field, value) => updateSellerProfileBuilderPerson('companyDirectors', index, field, value)}
                onRemove={(index) => removeSellerProfileBuilderPerson('companyDirectors', index)}
              />
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Authorised signatory
                <Field value={sellerProfileBuilderDraft.authorisedSignatoryName || ''} onChange={(event) => updateSellerProfileBuilderDraft('authorisedSignatoryName', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Signatory capacity
                <Field value={sellerProfileBuilderDraft.authorisedSignatoryCapacity || ''} onChange={(event) => updateSellerProfileBuilderDraft('authorisedSignatoryCapacity', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Signatory email
                <Field type="email" value={sellerProfileBuilderDraft.authorisedSignatoryEmail || ''} onChange={(event) => updateSellerProfileBuilderDraft('authorisedSignatoryEmail', event.target.value)} />
              </label>
            </section>
          ) : null}

          {sellerProfileBuilderShowsTrust ? (
            <section className="grid gap-4 rounded-[18px] border border-[#dce6f2] bg-white p-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Trust name
                <Field value={sellerProfileBuilderDraft.trustName || ''} onChange={(event) => updateSellerProfileBuilderDraft('trustName', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Trust registration number
                <Field value={sellerProfileBuilderDraft.trustRegistrationNumber || ''} onChange={(event) => updateSellerProfileBuilderDraft('trustRegistrationNumber', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e] sm:col-span-2">
                Registered address
                <Field value={sellerProfileBuilderDraft.trustRegisteredAddress || ''} onChange={(event) => updateSellerProfileBuilderDraft('trustRegisteredAddress', event.target.value)} />
              </label>
              <SellerProfilePeopleEditor
                title="Trustees"
                roleTitle="Trustee"
                rows={sellerProfileBuilderDraft.trustees || []}
                onAdd={() => addSellerProfileBuilderPerson('trustees', 'Trustee')}
                onUpdate={(index, field, value) => updateSellerProfileBuilderPerson('trustees', index, field, value)}
                onRemove={(index) => removeSellerProfileBuilderPerson('trustees', index)}
              />
              <SellerProfilePeopleEditor
                title="Beneficiaries"
                roleTitle="Beneficiary"
                rows={sellerProfileBuilderDraft.trustBeneficiaries || []}
                onAdd={() => addSellerProfileBuilderPerson('trustBeneficiaries', 'Beneficiary')}
                onUpdate={(index, field, value) => updateSellerProfileBuilderPerson('trustBeneficiaries', index, field, value)}
                onRemove={(index) => removeSellerProfileBuilderPerson('trustBeneficiaries', index)}
              />
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Authorised trustee
                <Field value={sellerProfileBuilderDraft.authorisedTrusteeName || ''} onChange={(event) => updateSellerProfileBuilderDraft('authorisedTrusteeName', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Trustee capacity
                <Field value={sellerProfileBuilderDraft.authorisedTrusteeCapacity || ''} onChange={(event) => updateSellerProfileBuilderDraft('authorisedTrusteeCapacity', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Trustee email
                <Field type="email" value={sellerProfileBuilderDraft.authorisedTrusteeEmail || ''} onChange={(event) => updateSellerProfileBuilderDraft('authorisedTrusteeEmail', event.target.value)} />
              </label>
            </section>
          ) : null}

          {sellerProfileBuilderShowsForeign ? (
            <section className="grid gap-4 rounded-[18px] border border-[#dce6f2] bg-white p-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Country / jurisdiction
                <Field value={sellerProfileBuilderDraft.foreignOwnerCountry || ''} onChange={(event) => updateSellerProfileBuilderDraft('foreignOwnerCountry', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Passport number
                <Field value={sellerProfileBuilderDraft.foreignPassportNumber || ''} onChange={(event) => updateSellerProfileBuilderDraft('foreignPassportNumber', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Foreign registration number
                <Field value={sellerProfileBuilderDraft.foreignRegistrationNumber || ''} onChange={(event) => updateSellerProfileBuilderDraft('foreignRegistrationNumber', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
                Residency / signing status
                <Field value={sellerProfileBuilderDraft.foreignResidencyStatus || ''} onChange={(event) => updateSellerProfileBuilderDraft('foreignResidencyStatus', event.target.value)} />
              </label>
            </section>
          ) : null}

          <section className="grid gap-4 rounded-[18px] border border-[#dce6f2] bg-white p-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e] sm:col-span-2">
              Property address
              <Field value={sellerProfileBuilderDraft.propertyAddress || ''} onChange={(event) => updateSellerProfileBuilderDraft('propertyAddress', event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Property title type
              <Field as="select" value={sellerProfileBuilderDraft.propertyStructureType || 'full_title'} onChange={(event) => updateSellerProfileBuilderDraft('propertyStructureType', event.target.value)}>
                <option value="full_title">Full title</option>
                <option value="sectional_title">Sectional title</option>
                <option value="estate">Estate</option>
                <option value="agricultural_holding">Agricultural holding</option>
              </Field>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Asking price
              <Field type="number" min="0" step="1000" value={sellerProfileBuilderDraft.askingPrice || ''} onChange={(event) => updateSellerProfileBuilderDraft('askingPrice', event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Rates and taxes
              <Field value={sellerProfileBuilderDraft.ratesTaxes || ''} onChange={(event) => updateSellerProfileBuilderDraft('ratesTaxes', event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Levies
              <Field value={sellerProfileBuilderDraft.levies || ''} onChange={(event) => updateSellerProfileBuilderDraft('levies', event.target.value)} disabled={Boolean(sellerProfileBuilderDraft.leviesNotApplicable)} />
            </label>
            <label className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#dbe6f2] bg-[#fbfdff] px-3 text-sm font-semibold text-[#2d445e]">
              <input
                type="checkbox"
                checked={Boolean(sellerProfileBuilderDraft.leviesNotApplicable)}
                onChange={(event) => updateSellerProfileBuilderDraft('leviesNotApplicable', event.target.checked)}
              />
              No levies
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Water billing
              <Field as="select" value={sellerProfileBuilderDraft.waterBillingType || 'municipal'} onChange={(event) => updateSellerProfileBuilderDraft('waterBillingType', event.target.value)}>
                <option value="municipal">Municipal</option>
                <option value="body_corporate">Body corporate</option>
                <option value="prepaid">Prepaid</option>
                <option value="not_applicable">Not applicable</option>
              </Field>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Mandate start date
              <Field type="date" value={sellerProfileBuilderDraft.mandateStartDate || ''} onChange={(event) => updateSellerProfileBuilderDraft('mandateStartDate', event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
              Mandate expiry date
              <Field type="date" value={sellerProfileBuilderDraft.expiryDate || ''} onChange={(event) => updateSellerProfileBuilderDraft('expiryDate', event.target.value)} />
            </label>
          </section>

          {sellerProfileRequirementPreview ? (
            <section data-testid="listing-seller-profile-requirement-preview" className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6f839a]">Document impact</p>
                  <h4 className="mt-1 text-sm font-semibold text-[#142132]">
                    {sellerProfileRequirementPreview.summary.total} requirements generated from this seller model
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-[#607387]">
                    {sellerProfileRequirementPreview.summary.sellerVisible} seller-visible, {sellerProfileRequirementPreview.summary.internal} internal
                    {sellerProfileRequirementPreview.summary.retired ? `, ${sellerProfileRequirementPreview.summary.retired} no longer applicable` : ''}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-[12px] border border-[#dbe6f2] bg-white px-3 py-2">
                    <p className="text-lg font-semibold text-[#142132]">{sellerProfileRequirementPreview.summary.required}</p>
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Required</p>
                  </div>
                  <div className="rounded-[12px] border border-[#dbe6f2] bg-white px-3 py-2">
                    <p className="text-lg font-semibold text-[#142132]">{sellerProfileRequirementPreview.summary.ownerCount}</p>
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Owners</p>
                  </div>
                  <div className="rounded-[12px] border border-[#dbe6f2] bg-white px-3 py-2">
                    <p className="text-lg font-semibold text-[#142132]">{sellerProfileRequirementPreview.summary.retired}</p>
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Retired</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {sellerProfileRequirementPreview.groups.filter((group) => group.rows.length).map((group) => (
                  <div key={group.key} className="rounded-[14px] border border-[#e1e9f2] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#243d56]">{group.label}</p>
                      <span className="rounded-full border border-[#dbe6f2] bg-[#fbfdff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#607387]">
                        {group.rows.length}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {group.rows.slice(0, 4).map((row) => (
                        <div key={row.requirement_key} className="flex items-start justify-between gap-3 text-xs leading-5">
                          <span className="font-semibold text-[#425970]">{row.requirement_name}</span>
                          <span className="shrink-0 text-[#7b8ca2]">{row.is_required === false ? 'Optional' : 'Required'}</span>
                        </div>
                      ))}
                      {group.rows.length > 4 ? (
                        <p className="text-xs font-semibold text-[#7b8ca2]">+{group.rows.length - 4} more</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {sellerProfileRequirementPreview.retiredRows?.length ? (
                <div data-testid="listing-seller-profile-retired-requirements-preview" className="mt-4 rounded-[14px] border border-[#f0ddbf] bg-[#fffaf1] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#6f4b16]">No longer applicable after save</p>
                      <p className="mt-1 text-xs leading-5 text-[#8a6a35]">
                        These requirements will be kept on the listing as retired records instead of disappearing from the document history.
                      </p>
                    </div>
                    <span className="rounded-full border border-[#efd9b0] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#8a6a35]">
                      {sellerProfileRequirementPreview.retiredRows.length}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {sellerProfileRequirementPreview.retiredRows.slice(0, 6).map((row) => (
                      <div key={row.requirement_key} className="flex items-start justify-between gap-3 rounded-[10px] border border-[#f0ddbf] bg-white px-3 py-2 text-xs leading-5">
                        <span className="font-semibold text-[#6f4b16]">{row.requirement_name}</span>
                        <span className="shrink-0 text-[#9a7a45]">Not applicable</span>
                      </div>
                    ))}
                  </div>
                  {sellerProfileRequirementPreview.retiredRows.length > 6 ? (
                    <p className="mt-2 text-xs font-semibold text-[#9a7a45]">+{sellerProfileRequirementPreview.retiredRows.length - 6} more retired requirements</p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </form>
      </Modal>
      <Modal
        open={Boolean(activeSellerSectionEditor)}
        onClose={sellerSectionSaving ? undefined : () => setSellerSectionEditorKey('')}
        title={activeSellerSectionEditor ? `Edit ${activeSellerSectionEditor.title}` : 'Edit Seller Details'}
        subtitle="Update the seller onboarding details on behalf of the seller."
        className="max-w-2xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setSellerSectionEditorKey('')} disabled={sellerSectionSaving}>
              Cancel
            </Button>
            <Button type="submit" form="seller-section-edit-form" disabled={sellerSectionSaving}>
              {sellerSectionSaving ? 'Saving...' : 'Save Details'}
            </Button>
          </div>
        }
      >
        {activeSellerSectionEditor ? (
          <form id="seller-section-edit-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSaveSellerSection}>
            {activeSellerSectionEditor.fields.map((field) => (
              <label key={field.key} className={`grid gap-1.5 ${field.as === 'textarea' ? 'sm:col-span-2' : ''}`}>
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6f839a]">{field.label}</span>
                <Field
                  as={field.as || 'input'}
                  type={field.type || 'text'}
                  value={sellerSectionDraft[field.key] || ''}
                  onChange={(event) => updateSellerSectionDraft(field.key, event.target.value)}
                >
                  {field.options ? (
                    <>
                      <option value="">Select</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>{formatStatusLabel(option)}</option>
                      ))}
                    </>
                  ) : null}
                </Field>
              </label>
            ))}
          </form>
        ) : null}
      </Modal>
      <Modal
        open={listingPerformanceEditorOpen}
        onClose={listingPerformanceSaving ? undefined : () => setListingPerformanceEditorOpen(false)}
        title="Edit Listing Performance"
        subtitle="Override the seller-facing listing stats shown on this overview and in the seller portal."
        className="max-w-3xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setListingPerformanceEditorOpen(false)} disabled={listingPerformanceSaving}>
              Cancel
            </Button>
            <Button type="submit" form="listing-performance-edit-form" disabled={listingPerformanceSaving}>
              {listingPerformanceSaving ? 'Saving...' : 'Save Stats'}
            </Button>
          </div>
        }
      >
        <form id="listing-performance-edit-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSaveListingPerformance}>
          {LISTING_PERFORMANCE_OVERRIDE_FIELDS.map((field) => (
            <label key={field.key} className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6f839a]">{field.label}</span>
              <Field
                type="number"
                min="0"
                step="1"
                value={listingPerformanceDraft[field.key] || ''}
                onChange={(event) => updateListingPerformanceDraft(field.key, event.target.value)}
              />
              <span className="text-xs leading-5 text-[#74879d]">{field.helper}</span>
            </label>
          ))}
        </form>
      </Modal>
      {activeTab !== 'seller' ? (
        <>
          <section className="overflow-hidden rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="h-[280px] w-full border-b border-[#e5edf6]">
              {getImageBlock(coverImage?.url || '', listingRecord.listingTitle)}
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate('/listings')}
                      className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.74rem] font-semibold text-[#35546c]"
                    >
                      <ArrowLeft size={13} />
                      Back
                    </button>
                    <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      Private Listing
                    </span>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(normalizeListingStatus(listingRecord))}`}>
                      {formatStatusLabel(normalizeListingStatus(listingRecord))}
                    </span>
                    <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      {formatStatusLabel(marketingDraft.listingStatus)}
                    </span>
                  </div>
                  <h2 className="mt-3 text-[1.4rem] font-semibold tracking-[-0.03em] text-[#142132]">{listingRecord.listingTitle}</h2>
                  <p className="mt-1 text-sm text-[#607387]">{[listingRecord.suburb, listingRecord.city].filter(Boolean).join(', ') || 'Location pending'}</p>
                  <p className="mt-3 text-[1.45rem] font-semibold text-[#1f4f78]">{formatCurrency(listingRecord.askingPrice)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {activeTab === 'property_details' && propertyDetailsReturnTarget === 'marketing' ? (
                    <Button type="button" variant="secondary" onClick={returnToMarketingConsole}>
                      <ArrowLeft size={15} />
                      Back to Marketing
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={handleDeleteListing} disabled={deletingListing}>
                    {deletingListing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    Delete Listing
                  </Button>
                  <Button variant="secondary" onClick={() => openDetailTab('property_details')}>
                    Edit Listing
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setOfferActionError(OFFER_WORKFLOW_RETIRED_MESSAGE)
                      setActiveTab('offers')
                      setShowSendOfferLinkForm(false)
                    }}
                  >
                    <Link2 size={15} />
                    Offer Workflow Retired
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section data-testid="sales-listing-shared-workspace-tabs" className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Listing Workspace</p>
                <p className="mt-1 text-sm text-[#607387]">Sales workspace for seller details, property data, marketing, media, syndication, and activity.</p>
              </div>
              <span className="inline-flex items-center self-start rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-4 py-2 text-[0.92rem] font-semibold text-[#5f748a]">
                Sales listing
              </span>
            </div>

            <ListingWorkspaceTabs
              className="mt-5 rounded-[8px] border border-[#dbe6f2] bg-[#fbfdff]"
              tabs={salesWorkspaceTabs}
              activeTab={activeSalesWorkspaceTab}
              onTabChange={openSalesListingWorkspaceTab}
              ariaLabel="Sales listing workspace sections"
            />
            <ListingWorkspacePortalActionPanel
              className="mt-4"
              plan={salesPortalActionPlan}
              onAction={handleSalesPortalReadinessAction}
              testId="sales-listing-portal-action-plan"
            />
            <ListingWorkspacePortalPublishGate
              className="mt-4"
              gate={salesPortalPublishGate}
              onAction={handleSalesPortalReadinessAction}
              testId="sales-listing-portal-publish-gate"
            />
            <ListingWorkspacePortalGoLiveProof
              className="mt-4"
              proof={salesPortalGoLiveProof}
              testId="sales-listing-portal-go-live-proof"
            />
            <ListingWorkspacePortalChecklist
              className="mt-4"
              items={salesPortalChecklist}
              testId="sales-listing-portal-checklist"
            />
            <ListingWorkspacePortalFixGuide
              className="mt-4"
              items={salesPortalFixGuide}
              onAction={handleSalesPortalFixGuideAction}
              testId="sales-listing-portal-fix-guide"
            />
            <ListingWorkspacePortalReadinessGrid
              className="mt-4"
              items={salesPortalReadinessSummaries}
              onAction={handleSalesPortalReadinessAction}
              testId="sales-listing-portal-readiness"
            />
          </section>
        </>
      ) : null}

      {activeTab === 'overview' ? (
        <section className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-[1.08rem] font-semibold text-[#142132]">{listingRecord.listingTitle}</p>
                <p className="mt-1 text-sm text-[#607387]">{[listingRecord.listingTitle, listingRecord.suburb, listingRecord.city].filter(Boolean).join(', ')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-3 py-1 text-[0.74rem] font-semibold text-[#35546c]">
                  {listingRecord.propertyType || 'House'}
                </span>
                <span className={`inline-flex rounded-full border px-3 py-1 text-[0.74rem] font-semibold ${statusClass(normalizeListingStatus(listingRecord))}`}>
                  {formatStatusLabel(normalizeListingStatus(listingRecord))}
                </span>
                <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-3 py-1 text-[0.74rem] font-semibold text-[#35546c]">
                  {marketingDraft.source || 'Direct / manual'}
                </span>
                <Button size="sm" onClick={() => { setActiveTab('pipeline'); setShowViewingForm(true) }}>
                  Request / Schedule Viewing
                </Button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Leads', value: metrics.leadCount, meta: 'Interested buyers' },
              { label: 'Viewings', value: metrics.viewingCount, meta: 'Scheduled / completed' },
              { label: 'Days on Market', value: metrics.daysOnMarket, meta: `Live since ${formatDate(listingRecord.createdAt)}` },
              { label: 'Offers', value: offerRows.length, meta: `${metrics.pendingOffers} active / pending` },
              { label: 'Highest Offer', value: metrics.highestOffer ? formatCurrency(metrics.highestOffer) : '—', meta: 'Top current offer' },
            ].map((card) => (
              <article key={card.label} className="flex h-full min-h-[132px] flex-col justify-between rounded-[20px] border border-[#dde4ee] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{card.label}</p>
                <p className="text-[1.45rem] font-semibold text-[#142132]">{card.value}</p>
                <p className="text-sm text-[#607387]">{card.meta}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-3">
            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[1rem] font-semibold text-[#142132]">Lead Source Breakdown</h3>
                  <p className="mt-1 text-sm text-[#607387]">Where current buyer interest is originating.</p>
                </div>
                <div className="relative h-[104px] w-[104px] shrink-0 rounded-full" style={buildDonutStyle(sourceBreakdown)}>
                  <div className="absolute inset-[18px] grid place-items-center rounded-full bg-white text-center">
                    <span className="text-lg font-semibold text-[#142132]">{metrics.leadCount}</span>
                    <span className="text-[0.68rem] uppercase tracking-[0.08em] text-[#7b8ca2]">leads</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {sourceBreakdown.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-medium text-[#22374d]">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-[#48627f]">{item.share}%</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <h3 className="text-[1rem] font-semibold text-[#142132]">Buyer Engagement</h3>
              <p className="mt-1 text-sm text-[#607387]">How interest is converting into real buyer movement.</p>
              <div className="mt-5 space-y-3">
                {[
                  { label: 'Leads', value: metrics.leadCount, fill: 100 },
                  { label: 'Viewings', value: metrics.viewingCount, fill: metrics.leadCount ? Math.max(12, (metrics.viewingCount / metrics.leadCount) * 100) : 0 },
                  { label: 'Offers', value: offerRows.length, fill: metrics.leadCount ? Math.max(12, (offerRows.length / metrics.leadCount) * 100) : 0 },
                ].map((step) => (
                  <div key={step.label} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[#22374d]">{step.label}</span>
                      <span className="text-sm font-semibold text-[#142132]">{step.value}</span>
                    </div>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#dbe6f2]">
                      <div className="h-full rounded-full bg-[#1f4f78]" style={{ width: `${Math.min(100, Math.max(0, step.fill))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <h3 className="text-[1rem] font-semibold text-[#142132]">Pricing Insight</h3>
              <p className="mt-1 text-sm text-[#607387]">Asking price versus current average buyer position.</p>
              <div className="mt-5 space-y-4">
                <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#22374d]">Asking Price</span>
                    <span className="text-sm font-semibold text-[#142132]">{formatCurrency(listingRecord.askingPrice)}</span>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#dbe6f2]">
                    <div className="h-full rounded-full bg-[#1f4f78]" style={{ width: `${pricingInsight.askingFill}%` }} />
                  </div>
                </div>
                <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#22374d]">Average Offer</span>
                    <span className="text-sm font-semibold text-[#142132]">{metrics.offerAverage ? formatCurrency(metrics.offerAverage) : '—'}</span>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#dbe6f2]">
                    <div className="h-full rounded-full bg-[#2f8f6b]" style={{ width: `${pricingInsight.offerFill}%` }} />
                  </div>
                </div>
                <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Variance</p>
                  <p className="mt-2 text-[1.2rem] font-semibold text-[#142132]">
                    {pricingInsight.varianceValue ? `${pricingInsight.varianceValue > 0 ? '+' : ''}${formatCurrency(pricingInsight.varianceValue)}` : '—'}
                  </p>
                  <p className="mt-1 text-sm text-[#607387]">{pricingInsight.varianceLabel}</p>
                </div>
              </div>
            </article>
          </section>

          <section className="grid items-stretch gap-5 xl:grid-cols-2">
            <section className="flex h-full flex-col rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Next Best Action</p>
                  <h3 className="mt-2 text-[1.02rem] font-semibold text-[#142132]">{nextBestAction.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#607387]">{nextBestAction.copy}</p>
                </div>
                <div className="rounded-[16px] border border-[#dce6f2] bg-[#f7fbff] p-3 text-[#1f4f78]">
                  <TrendingUp size={20} />
                </div>
              </div>
              <div className="mt-auto pt-5">
                <Button onClick={() => handleNextBestAction(nextBestAction)}>
                  {nextBestAction.buttonLabel || 'Open Workspace'}
                </Button>
              </div>
            </section>

            <section className="flex h-full flex-col rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[1rem] font-semibold text-[#142132]">Activity Feed</h3>
                  <p className="mt-1 text-sm text-[#607387]">Latest offers, uploads, and listing changes.</p>
                </div>
                <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-3 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                  {activityItems.length} updates
                </span>
              </div>
              <div className="mt-4 flex-1 space-y-3">
                {activityItems.map((item, index) => (
                  <article key={`${item.title}-${index}`} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#22374d]">{item.title}</p>
                        <p className="mt-1 text-sm text-[#607387]">{item.copy}</p>
                      </div>
                      <span className="text-[0.74rem] text-[#7b8ca2]">{formatDateTime(item.timestamp)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        </section>
      ) : null}

      {activeTab === 'property_details' ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0 space-y-5">
            <section className="overflow-hidden rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="relative h-[260px] border-b border-[#e5edf6] bg-[#eef4fa] lg:h-full lg:border-b-0 lg:border-r">
                  {getImageBlock(coverImage?.url || '', marketingDraft.headline || listingRecord.listingTitle)}
                  <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#142132] shadow-sm">
                    <Camera size={14} />
                    {marketingDraft.galleryImages.length || 0} image{marketingDraft.galleryImages.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="min-w-0 p-5 lg:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(marketingDraft.listingStatus)}`}>
                          {formatStatusLabel(marketingDraft.listingStatus)}
                        </span>
                        <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                          {marketingDraft.source || 'Seller Onboarding'}
                        </span>
                      </div>
                      <h3 className="mt-3 truncate text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">{marketingDraft.headline || listingRecord.listingTitle || 'Listing headline pending'}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[#607387]">
                        <MapPin size={14} />
                        {[marketingDraft.suburb, marketingDraft.city, marketingDraft.province].filter(Boolean).join(', ') || 'Location pending'}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => saveMarketingDraft()}>Save Property Details</Button>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {propertySummaryFacts.map((fact) => (
                      <span key={fact} className="inline-flex rounded-full border border-[#dbe6f2] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                        {fact}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-4 border-t border-[#e7edf5] pt-5 sm:grid-cols-2 xl:grid-cols-4">
                    <SnapshotRow label="Listing ID" value={marketingDraft.listingCode || listingRecord.listingReference || 'Pending'} />
                    <SnapshotRow label="Assigned Agent" value={listingRecord?.assignedAgentName || listingRecord?.assignedAgent || 'Agent pending'} />
                    <SnapshotRow label="Last Updated" value={formatDate(listingRecord?.updatedAt || listingRecord?.createdAt)} />
                    <SnapshotRow label="Source" value={marketingDraft.source || 'Seller Onboarding'} />
                  </div>
                </div>
              </div>
            </section>

            <HubCard icon={Home} title="Basic Information" copy="Core public listing fields pulled from seller onboarding and refined for publishing." complete={sectionStatusByKey.basic?.complete}>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-2 xl:col-span-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Headline</span>
                  <Field value={marketingDraft.headline} onChange={(event) => updateMarketingDraft('headline', event.target.value)} placeholder="House, Olympus" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Property Type</span>
                  <Field as="select" value={marketingDraft.propertyType} onChange={(event) => updateMarketingDraft('propertyType', event.target.value)}>
                    {PROPERTY_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Listing Status</span>
                  <Field as="select" value={marketingDraft.listingStatus} onChange={(event) => updateMarketingDraft('listingStatus', event.target.value)}>
                    {LISTING_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{formatStatusLabel(option)}</option>)}
                  </Field>
                </label>
                <label className="grid gap-2 xl:col-span-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Address</span>
                  <Field value={marketingDraft.addressLine1} onChange={(event) => updateMarketingDraft('addressLine1', event.target.value)} placeholder="Property address" />
                </label>
                {[
                  ['suburb', 'Suburb'],
                  ['city', 'City'],
                  ['province', 'Province'],
                  ['source', 'Listing Source'],
                  ['mandateSignedDate', 'Mandate Signed Date', 'date'],
                ].map(([key, label, type]) => (
                  <label key={key} className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">{label}</span>
                    <Field type={type || 'text'} value={type === 'date' ? formatDateInputValue(marketingDraft[key]) : marketingDraft[key]} onChange={(event) => updateMarketingDraft(key, event.target.value)} />
                  </label>
                ))}
              </div>
            </HubCard>

            <HubCard icon={Building2} title="Property Specs" copy="The key measurable details buyers and downstream portals compare first." complete={sectionStatusByKey.specs?.complete}>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['bedrooms', 'Bedrooms'],
                  ['bathrooms', 'Bathrooms'],
                  ['garages', 'Garages'],
                  ['coveredParking', 'Covered Parking'],
                  ['openParking', 'Open Parking'],
                  ['erfSize', 'Erf Size (m²)'],
                  ['floorSize', 'Floor Size (m²)'],
                ].map(([key, label]) => (
                  <label key={key} className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">{label}</span>
                    <Field type="number" min="0" value={marketingDraft[key]} onChange={(event) => updateMarketingDraft(key, event.target.value)} placeholder="0" />
                  </label>
                ))}
              </div>
            </HubCard>

            <HubCard icon={HandCoins} title="Price & Financial Details" copy="Structured pricing, recurring costs and offer positioning for portals and reporting." complete={sectionStatusByKey.financial?.complete}>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Asking Price</span>
                  <Field type="number" min="0" step="1000" value={marketingDraft.price} onChange={(event) => updateMarketingDraft('price', event.target.value)} placeholder="0" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Levies</span>
                  <Field type="number" min="0" step="100" value={marketingDraft.levies} onChange={(event) => updateMarketingDraft('levies', event.target.value)} placeholder="0" disabled={marketingDraft.leviesNotApplicable} />
                  <span className="inline-flex items-center gap-2 text-xs text-[#607387]">
                    <input type="checkbox" checked={marketingDraft.leviesNotApplicable} onChange={(event) => updateMarketingDraft('leviesNotApplicable', event.target.checked)} />
                    Not applicable
                  </span>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Rates & Taxes</span>
                  <Field type="number" min="0" step="100" value={marketingDraft.ratesTaxes} onChange={(event) => updateMarketingDraft('ratesTaxes', event.target.value)} placeholder="0" disabled={marketingDraft.ratesTaxesNotApplicable} />
                  <span className="inline-flex items-center gap-2 text-xs text-[#607387]">
                    <input type="checkbox" checked={marketingDraft.ratesTaxesNotApplicable} onChange={(event) => updateMarketingDraft('ratesTaxesNotApplicable', event.target.checked)} />
                    Not applicable
                  </span>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Sale Type</span>
                  <Field as="select" value={marketingDraft.saleType} onChange={(event) => updateMarketingDraft('saleType', event.target.value)}>
                    <option value="For Sale">For Sale</option>
                    <option value="Auction">Auction</option>
                    <option value="Tender">Tender</option>
                    <option value="POA">Price on Application</option>
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">VAT Applicable</span>
                  <Field as="select" value={marketingDraft.vatApplicable} onChange={(event) => updateMarketingDraft('vatApplicable', event.target.value)}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                    <option value="unknown">Unknown</option>
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Offers From</span>
                  <Field type="number" min="0" step="1000" value={marketingDraft.offersFrom} onChange={(event) => updateMarketingDraft('offersFrom', event.target.value)} placeholder="0" />
                </label>
              </div>
            </HubCard>

            <HubCard icon={CheckCircle2} title="Features & Amenities" copy="Public-facing feature chips for Arch9 Listings and external portal copy." complete={sectionStatusByKey.features?.complete}>
              <div className="mt-5 flex flex-wrap gap-2">
                {FEATURE_OPTIONS.map((feature) => {
                  const active = marketingDraft.selectedFeatures.includes(feature)
                  return (
                    <button
                      key={feature}
                      type="button"
                      onClick={() => toggleFeature(feature)}
                      className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                        active
                          ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_10px_18px_rgba(31,79,120,0.14)]'
                          : 'border-[#dbe6f2] bg-white text-[#47627c] hover:border-[#b7c8db] hover:bg-[#f7fbff]'
                      }`}
                    >
                      {feature}
                    </button>
                  )
                })}
              </div>
            </HubCard>

            <HubCard icon={FileText} title="Property Description" copy="Separate public listing copy from internal-only notes so publishing stays safe." complete={sectionStatusByKey.description?.complete}>
              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Full Description</span>
                  <Field as="textarea" rows={6} value={marketingDraft.description} onChange={(event) => updateMarketingDraft('description', event.target.value)} placeholder="Public-facing listing description." />
                  <span className="text-xs text-[#607387]">Public-facing field. This can feed Arch9 Listings and portal exports later.</span>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Short Description / Listing Preview Copy</span>
                  <Field as="textarea" rows={3} value={marketingDraft.listingPreviewDescription} onChange={(event) => updateMarketingDraft('listingPreviewDescription', event.target.value)} placeholder="Short preview copy for listing cards and snippets." />
                </label>
                <label className="grid gap-2 rounded-[16px] border border-[#f1d8bd] bg-[#fffaf4] p-3">
                  <span className="text-sm font-semibold text-[#7a4b16]">Internal Notes</span>
                  <Field as="textarea" rows={3} value={marketingDraft.notes} onChange={(event) => updateMarketingDraft('notes', event.target.value)} placeholder="Private agent notes, campaign angle, seller context." />
                  <span className="text-xs font-semibold text-[#9a5b13]">Internal-only. Do not publish this field to public listing sites.</span>
                </label>
              </div>
            </HubCard>

            <HubCard icon={FolderKanban} title="Floor Plans" copy="Optional plan files for the listing pack and future buyer-facing downloads." complete={sectionStatusByKey.floorplans?.complete}>
              <div className="mt-5 rounded-[16px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] p-3">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:border-[#b7c8db] hover:bg-[#f7fbff]">
                  <Upload size={16} />
                  Upload Floor Plans
                  <input type="file" accept=".pdf,image/*" multiple className="hidden" onChange={handleFloorplanUpload} disabled={gallerySaving} />
                </label>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {marketingDraft.floorplans.length ? (
                  marketingDraft.floorplans.map((plan) => (
                    <div key={plan.id} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#22374d]">{plan.name}</p>
                          <a href={plan.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                            <ExternalLink size={12} />
                            Open file
                          </a>
                        </div>
                        <button type="button" onClick={() => removeFloorplan(plan.id)} className="rounded-full border border-[#dbe6f2] p-1 text-[#6b7d93] hover:text-[#22374d]">
                          <X size={14} />
                        </button>
                      </div>
                      <label className="mt-3 grid gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Plan Label</span>
                        <Field value={plan.label || ''} onChange={(event) => updateFloorplanLabel(plan.id, event.target.value)} placeholder="Ground Floor" />
                      </label>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93]">
                    No floor plans uploaded yet.
                  </div>
                )}
              </div>
            </HubCard>
          </div>

          <aside className="min-w-0 space-y-5 xl:sticky xl:top-4 xl:self-start">
            <HubCard icon={ExternalLink} title="Portal Listings" copy="Track external portal references without turning this into a bulky admin form." complete={sectionStatusByKey.portal?.complete}>
              <div className="mt-5 space-y-4">
                {[
                  {
                    name: 'Property24',
                    prefix: 'property24',
                    urlKey: 'property24ListingUrl',
                    referenceKey: 'property24Reference',
                    statusKey: 'property24Status',
                    accent: 'text-[#d12c2c]',
                  },
                  {
                    name: 'Private Property',
                    prefix: 'privateProperty',
                    urlKey: 'privatePropertyListingUrl',
                    referenceKey: 'privatePropertyReference',
                    statusKey: 'privatePropertyStatus',
                    accent: 'text-[#2f8f6b]',
                  },
                ].map((portal) => (
                  <div key={portal.name} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className={`text-sm font-semibold ${portal.accent}`}>{portal.name}</p>
                      <Field as="select" value={marketingDraft[portal.statusKey]} onChange={(event) => updateMarketingDraft(portal.statusKey, event.target.value)} className="max-w-[150px]">
                        {PORTAL_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{formatStatusLabel(option)}</option>)}
                      </Field>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <Field value={marketingDraft[portal.referenceKey]} onChange={(event) => updateMarketingDraft(portal.referenceKey, event.target.value)} placeholder={`${portal.name} reference`} />
                      <Field value={marketingDraft[portal.urlKey]} onChange={(event) => updateMarketingDraft(portal.urlKey, event.target.value)} placeholder={`${portal.name} listing link`} />
                      {marketingDraft[portal.urlKey] ? (
                        <a href={marketingDraft[portal.urlKey]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                          Open listing
                          <ExternalLink size={12} />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </HubCard>

            <HubCard icon={Info} title="Listing Snapshot">
              <div className="mt-4">
                <SnapshotRow label="Asking Price" value={formatCurrency(marketingDraft.price)} />
                <SnapshotRow label="Property Type" value={marketingDraft.propertyType || '—'} />
                <SnapshotRow label="Erf Size" value={marketingDraft.erfSize ? `${marketingDraft.erfSize} m²` : '—'} />
                <SnapshotRow label="Floor Size" value={marketingDraft.floorSize ? `${marketingDraft.floorSize} m²` : '—'} />
                <SnapshotRow label="Bedrooms" value={marketingDraft.bedrooms || '—'} />
                <SnapshotRow label="Bathrooms" value={marketingDraft.bathrooms || '—'} />
                <SnapshotRow label="Garages" value={marketingDraft.garages || '—'} />
                <SnapshotRow label="Rates & Taxes" value={marketingDraft.ratesTaxesNotApplicable ? 'N/A' : formatMoneyValue(marketingDraft.ratesTaxes)} />
                <SnapshotRow label="Levy" value={marketingDraft.leviesNotApplicable ? 'N/A' : formatMoneyValue(marketingDraft.levies)} />
              </div>
            </HubCard>

            <HubCard icon={ImagePlus} title="Image Gallery" copy={`${marketingDraft.galleryImages.length || 0} images saved. ${coverImage?.url ? 'Cover image selected.' : 'Cover image pending.'}`} complete={sectionStatusByKey.gallery?.complete}>
              <div className="mt-4 overflow-hidden rounded-[18px] border border-[#dce6f2]">
                <div className="h-[150px] border-b border-[#e5edf6] bg-[#eef4fa]">{getImageBlock(coverImage?.url || '', marketingDraft.headline || listingRecord.listingTitle)}</div>
                <div className="p-3">
                  <div className="grid grid-cols-4 gap-2">
                    {galleryPreviewImages.length ? galleryPreviewImages.map((image) => (
                      <button key={image.id} type="button" onClick={() => setCoverImage(image.id)} className={`relative h-14 overflow-hidden rounded-[10px] border ${String(image.id) === String(marketingDraft.coverImageId) ? 'border-[#1f4f78]' : 'border-[#dce6f2]'}`}>
                        <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                      </button>
                    )) : (
                      <div className="col-span-4 rounded-[12px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-3 text-xs text-[#6b7d93]">No images uploaded yet.</div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${gallerySaving ? 'border-[#dbe6f2] bg-[#f5f8fb] text-[#9aa9ba]' : 'border-[#1f4f78] bg-[#1f4f78] text-white hover:bg-[#183f61]'}`}>
                      {gallerySaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      Upload Images
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} disabled={gallerySaving} />
                    </label>
                    {marketingDraft.galleryImages.length > 4 ? (
                      <button type="button" onClick={() => setShowFullGallery((value) => !value)} className="inline-flex h-9 items-center justify-center rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:bg-[#f7fbff]">
                        {showFullGallery ? 'Show Less' : 'View All Images'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </HubCard>

            <HubCard icon={CalendarDays} title="Important Dates">
              <div className="mt-4 grid gap-3">
                {[
                  ['mandateSignedDate', 'Mandate Signed Date'],
                  ['listingDate', 'Listing Date'],
                  ['expiryDate', 'Expiry Date'],
                ].map(([key, label]) => (
                  <label key={key} className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">{label}</span>
                    <Field type="date" value={formatDateInputValue(marketingDraft[key])} onChange={(event) => updateMarketingDraft(key, event.target.value)} />
                  </label>
                ))}
                <SnapshotRow label="Last Updated" value={formatDate(listingRecord?.updatedAt || listingRecord?.createdAt)} />
              </div>
            </HubCard>

            <HubCard icon={Plus} title="Quick Actions">
              <div className="mt-4 grid gap-2">
                {[
                  ['Preview Listing', marketingDraft.bridgeListingPublicUrl],
                  ['Share with Client', ''],
                  ['Duplicate Listing', ''],
                  ['Open Property24 Link', marketingDraft.property24ListingUrl],
                  ['Open Private Property Link', marketingDraft.privatePropertyListingUrl],
                  ['Publish to Arch9 Listings', ''],
                  ['View Public Listing', marketingDraft.bridgeListingPublicUrl],
                ].map(([label, href]) => (
                  href ? (
                    <a key={label} href={href} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-between rounded-lg border border-[#dbe6f2] bg-white px-3 text-sm font-semibold text-[#22374d] hover:bg-[#f7fbff]">
                      {label}
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <button key={label} type="button" disabled className="inline-flex h-10 items-center justify-between rounded-lg border border-[#e1e8f0] bg-[#f8fafc] px-3 text-sm font-semibold text-[#9aa9ba]" title="Coming soon">
                      {label}
                      <span className="text-[0.68rem] uppercase tracking-[0.08em]">Soon</span>
                    </button>
                  )
                ))}
              </div>
            </HubCard>
          </aside>
        </section>
      ) : null}

      {activeTab === 'property_details_legacy' ? (
        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-[1.08rem] font-semibold text-[#142132]">Property Details</h3>
                  <p className="mt-1 text-sm text-[#607387]">Structured listing data for stronger presentation, cleaner reporting, and better downstream conversion.</p>
                </div>
                <Button size="sm" onClick={() => saveMarketingDraft()}>Save Property Details</Button>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Listing ID</p>
                  <p className="mt-2 text-[1.02rem] font-semibold text-[#142132]">{marketingDraft.listingCode || 'Pending'}</p>
                  <p className="mt-1 text-sm text-[#607387]">System-generated and read-only for matching, reporting, and future portal integrations.</p>
                </div>
                <div className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Section Completion</p>
                  <div className="mt-3 space-y-2">
                    {sectionStatuses.map((section) => (
                      <div key={section.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2.5">
                        <span className="text-sm font-medium leading-5 text-[#22374d]">{section.label}</span>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[0.72rem] font-semibold ${section.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                          {section.complete ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
                          {section.complete ? 'Complete' : 'Missing'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-[#6f8197]">Each section updates as soon as required fields are completed and saved.</p>
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Basic Information</h4>
                  <p className="mt-1 text-sm text-[#607387]">Anchor the listing with clean headline, location, type, and live status.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'basic')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'basic')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Headline</span>
                  <Field value={marketingDraft.headline} onChange={(event) => updateMarketingDraft('headline', event.target.value)} placeholder="4 Bedroom Apartment - Midrand" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Property Type</span>
                  <Field as="select" value={marketingDraft.propertyType} onChange={(event) => updateMarketingDraft('propertyType', event.target.value)}>
                    {PROPERTY_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Listing Status</span>
                  <Field as="select" value={marketingDraft.listingStatus} onChange={(event) => updateMarketingDraft('listingStatus', event.target.value)}>
                    {LISTING_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>{formatStatusLabel(option)}</option>
                    ))}
                  </Field>
                </label>
                <div className="md:col-span-2">
                  <AddressAutocomplete
                    label="Address"
                    value={buildAddressAutocompleteValueFromDraft(marketingDraft)}
                    onChange={(nextAddress) => {
                      marketingDraftDirtyRef.current = true
                      setMarketingDraft((previous) => {
                        const nextDraft = mergeAddressIntoMarketingDraft(previous, nextAddress)
                        writeStoredMarketingDraft(listingId, nextDraft)
                        return nextDraft
                      })
                    }}
                    placeholder="12 Main Road Bedfordview"
                    description="Select the closest Google Places result, then adjust suburb or city below if needed."
                  />
                </div>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Suburb</span>
                  <Field value={marketingDraft.suburb} onChange={(event) => updateMarketingDraft('suburb', event.target.value)} placeholder="Sandton" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">City</span>
                  <Field value={marketingDraft.city} onChange={(event) => updateMarketingDraft('city', event.target.value)} placeholder="Johannesburg" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Province</span>
                  <Field value={marketingDraft.province} onChange={(event) => updateMarketingDraft('province', event.target.value)} placeholder="Gauteng" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Postal Code</span>
                  <Field value={marketingDraft.postalCode} onChange={(event) => updateMarketingDraft('postalCode', event.target.value)} placeholder="2007" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Listing Source</span>
                  <Field value={marketingDraft.source} onChange={(event) => updateMarketingDraft('source', event.target.value)} placeholder="Property24 / Arch9 Listings / Referral" />
                </label>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Property Specs</h4>
                  <p className="mt-1 text-sm text-[#607387]">Capture the core data points buyers compare first.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'specs')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'specs')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {[
                  ['bedrooms', 'Bedrooms'],
                  ['bathrooms', 'Bathrooms'],
                  ['garages', 'Garages'],
                  ['coveredParking', 'Covered Parking'],
                  ['openParking', 'Open Parking'],
                  ['erfSize', 'Erf Size (m²)'],
                  ['floorSize', 'Floor Size (m²)'],
                ].map(([key, label]) => (
                  <label key={key} className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">{label}</span>
                    <Field type="number" min="0" value={marketingDraft[key]} onChange={(event) => updateMarketingDraft(key, event.target.value)} placeholder="0" />
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Financial Details</h4>
                  <p className="mt-1 text-sm text-[#607387]">Price the property cleanly and keep recurring cost inputs structured for buyers.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'financial')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'financial')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Price</span>
                  <Field type="number" min="0" step="1000" value={marketingDraft.price} onChange={(event) => updateMarketingDraft('price', event.target.value)} placeholder="2450000" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Levies</span>
                  <Field type="number" min="0" step="100" value={marketingDraft.levies} onChange={(event) => updateMarketingDraft('levies', event.target.value)} placeholder="0" disabled={marketingDraft.leviesNotApplicable} />
                  <span className="inline-flex items-center gap-2 text-xs text-[#607387]">
                    <input type="checkbox" checked={marketingDraft.leviesNotApplicable} onChange={(event) => updateMarketingDraft('leviesNotApplicable', event.target.checked)} />
                    Not applicable
                  </span>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Rates & Taxes</span>
                  <Field type="number" min="0" step="100" value={marketingDraft.ratesTaxes} onChange={(event) => updateMarketingDraft('ratesTaxes', event.target.value)} placeholder="0" disabled={marketingDraft.ratesTaxesNotApplicable} />
                  <span className="inline-flex items-center gap-2 text-xs text-[#607387]">
                    <input type="checkbox" checked={marketingDraft.ratesTaxesNotApplicable} onChange={(event) => updateMarketingDraft('ratesTaxesNotApplicable', event.target.checked)} />
                    Not applicable
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Features & Amenities</h4>
                  <p className="mt-1 text-sm text-[#607387]">Use quick tags to keep feature capture fast and listing presentation consistent.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'features')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'features')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {FEATURE_OPTIONS.map((feature) => {
                  const active = marketingDraft.selectedFeatures.includes(feature)
                  return (
                    <button
                      key={feature}
                      type="button"
                      onClick={() => toggleFeature(feature)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        active
                          ? 'border-[#1f4f78] bg-[#2b5577] text-white shadow-[0_10px_18px_rgba(31,79,120,0.18)]'
                          : 'border-[#dbe6f2] bg-white text-[#47627c] hover:border-[#b7c8db]'
                      }`}
                    >
                      {feature}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Description</h4>
                  <p className="mt-1 text-sm text-[#607387]">What makes this property special? Capture the story clearly so the listing converts faster.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'description')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'description')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Full Description</span>
                  <Field as="textarea" rows={6} value={marketingDraft.description} onChange={(event) => updateMarketingDraft('description', event.target.value)} placeholder="Position the property clearly, highlight lifestyle, and give buyers a reason to book a viewing." />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Internal Notes</span>
                  <Field as="textarea" rows={3} value={marketingDraft.notes} onChange={(event) => updateMarketingDraft('notes', event.target.value)} placeholder="Campaign angle, positioning notes, or agent-only context." />
                </label>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Floor Plans</h4>
                  <p className="mt-1 text-sm text-[#607387]">Upload labelled plans so buyers and internal teams can work from the same property pack.</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'floorplans')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                  {sectionStatuses.find((item) => item.key === 'floorplans')?.complete ? 'Complete' : 'Missing info'}
                </span>
              </div>
              <div className="mt-5 rounded-[16px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] p-3">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:border-[#b7c8db] hover:bg-[#f7fbff]">
                  <Upload size={16} />
                  Upload Floor Plans
                  <input type="file" accept=".pdf,image/*" multiple className="hidden" onChange={handleFloorplanUpload} disabled={gallerySaving} />
                </label>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {marketingDraft.floorplans.length ? (
                  marketingDraft.floorplans.map((plan) => (
                    <div key={plan.id} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#22374d]">{plan.name}</p>
                          <a href={plan.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                            <ExternalLink size={12} />
                            Open file
                          </a>
                        </div>
                        <button type="button" onClick={() => removeFloorplan(plan.id)} className="rounded-full border border-[#dbe6f2] p-1 text-[#6b7d93] hover:text-[#22374d]">
                          <X size={14} />
                        </button>
                      </div>
                      <label className="mt-3 grid gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Plan Label</span>
                        <Field value={plan.label || ''} onChange={(event) => updateFloorplanLabel(plan.id, event.target.value)} placeholder="Ground Floor" />
                      </label>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93]">
                    No floor plans uploaded yet.
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-3">
                <div className="rounded-[14px] border border-[#dce6f2] bg-[#f7fbff] p-2 text-[#1f4f78]">
                  <MapPin size={18} />
                </div>
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Listing Snapshot</h4>
                  <p className="text-sm text-[#607387]">Quick read on how this property will present across the platform.</p>
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-[20px] border border-[#dce6f2]">
                <div className="h-[220px] border-b border-[#e5edf6]">{getImageBlock(coverImage?.url || '', marketingDraft.headline || listingRecord.listingTitle)}</div>
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(marketingDraft.listingStatus)}`}>
                      {formatStatusLabel(marketingDraft.listingStatus)}
                    </span>
                    <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      {marketingDraft.propertyType || 'Property type pending'}
                    </span>
                    <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      {marketingDraft.source || 'Source pending'}
                    </span>
                  </div>
                  <p className="text-[1rem] font-semibold text-[#142132]">{marketingDraft.headline || 'Headline pending'}</p>
                  <p className="text-sm text-[#607387]">{[marketingDraft.addressLine1, marketingDraft.suburb, marketingDraft.city, marketingDraft.province].filter(Boolean).join(', ') || 'Address not fully captured yet.'}</p>
                  <p className="text-[1rem] font-semibold text-[#1f4f78]">{formatCurrency(marketingDraft.price)}</p>
                  <p className="text-sm leading-6 text-[#607387]">{marketingDraft.description || 'No listing description captured yet.'}</p>
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1rem] font-semibold text-[#142132]">Image Gallery</h4>
                  <p className="mt-1 text-sm text-[#607387]">Bulk upload, select a cover image, and keep the listing gallery clean and consistent.</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {gallerySaving ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      <Loader2 size={12} className="animate-spin" />
                      Saving
                    </span>
                  ) : null}
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${sectionStatuses.find((item) => item.key === 'gallery')?.complete ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#f5dbb0] bg-[#fff8ec] text-[#9a5b13]'}`}>
                    {sectionStatuses.find((item) => item.key === 'gallery')?.complete ? 'Complete' : 'Missing info'}
                  </span>
                </div>
              </div>
              <div className="mt-5 rounded-[18px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#dbe6f2] bg-white text-[#1f4f78]">
                      <ImagePlus size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#22374d]">{marketingDraft.galleryImages.length ? `${marketingDraft.galleryImages.length} image${marketingDraft.galleryImages.length === 1 ? '' : 's'} saved` : 'No images saved yet'}</p>
                      <p className="text-xs text-[#7b8ca2]">Cover, order, and removals save automatically.</p>
                    </div>
                  </div>
                  <label className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${gallerySaving ? 'border-[#dbe6f2] bg-[#f5f8fb] text-[#9aa9ba]' : 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_8px_14px_rgba(31,79,120,0.16)] hover:bg-[#183f61]'}`}>
                    {gallerySaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Upload images
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} disabled={gallerySaving} />
                  </label>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {marketingDraft.galleryImages.length ? (
                  marketingDraft.galleryImages.map((image, index) => {
                    const active = String(image.id) === String(marketingDraft.coverImageId)
                    return (
                      <div key={image.id} className="overflow-hidden rounded-[16px] border border-[#dce6f2] bg-white">
                        <div className="relative h-[150px] border-b border-[#e5edf6] bg-[#eef4fa]">
                          <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                          {active ? (
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[0.68rem] font-semibold text-[#1f4f78] shadow-sm">
                              <Star size={11} fill="currentColor" />
                              Cover
                            </span>
                          ) : null}
                          <button type="button" onClick={() => removeGalleryImage(image.id)} disabled={gallerySaving} className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#dbe6f2] bg-white/95 text-[#6b7d93] shadow-sm hover:text-[#22374d] disabled:cursor-not-allowed disabled:opacity-60" aria-label={`Remove ${image.name}`}>
                            <X size={14} />
                          </button>
                        </div>
                        <div className="space-y-3 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#22374d]">{image.name}</p>
                              <p className="mt-1 text-xs text-[#7b8ca2]">{image.path ? 'Stored in Supabase' : 'Local preview'} - Image {index + 1}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <CompactActionButton active={active} onClick={() => setCoverImage(image.id)} disabled={gallerySaving || active}>
                              <Star size={13} fill={active ? 'currentColor' : 'none'} />
                              {active ? 'Cover' : 'Set cover'}
                            </CompactActionButton>
                            <CompactActionButton onClick={() => moveGalleryImage(image.id, 'left')} disabled={gallerySaving || index === 0} aria-label={`Move ${image.name} left`}>
                              <ChevronLeft size={14} />
                              Left
                            </CompactActionButton>
                            <CompactActionButton onClick={() => moveGalleryImage(image.id, 'right')} disabled={gallerySaving || index === marketingDraft.galleryImages.length - 1} aria-label={`Move ${image.name} right`}>
                              Right
                              <ChevronRight size={14} />
                            </CompactActionButton>
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93] sm:col-span-2">
                    No gallery images uploaded yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === 'pipeline' ? (
        <section className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[1.05rem] font-semibold text-[#142132]">Pipeline For This Listing</h3>
                <p className="mt-1 text-sm text-[#607387]">Lead movement from first interest to offer activity.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <MetricCard label="Leads" value={metrics.leadCount} meta="Initial interest" />
                <MetricCard label="Viewings" value={metrics.viewingCount} meta="Scheduled / held" />
                <MetricCard label="Offers" value={metrics.offerLeadCount || offerRows.length} meta="Negotiation stage" />
                <MetricCard label="Accepted" value={metrics.acceptedCount} meta="Converted to deal" />
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                { label: 'Leads', value: metrics.leadCount, fill: 100 },
                { label: 'Viewings', value: metrics.viewingCount, fill: metrics.leadCount ? Math.max(12, (metrics.viewingCount / metrics.leadCount) * 100) : 0 },
                { label: 'Offers', value: offerRows.length, fill: metrics.leadCount ? Math.max(12, (offerRows.length / metrics.leadCount) * 100) : 0 },
                { label: 'Accepted', value: metrics.acceptedCount, fill: offerRows.length ? Math.max(12, (metrics.acceptedCount / offerRows.length) * 100) : 0 },
              ].map((step, index) => (
                <article key={step.label} className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#22374d]">{step.label}</span>
                    <span className="text-[1rem] font-semibold text-[#142132]">{step.value}</span>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#dbe6f2]">
                    <div className="h-full rounded-full bg-[#1f4f78]" style={{ width: `${Math.min(100, Math.max(0, step.fill))}%` }} />
                  </div>
                  {index < 3 ? <p className="mt-3 text-xs text-[#6b7d93]">Progressing toward {['viewings', 'offers', 'accepted'][index]}</p> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-[1rem] font-semibold text-[#142132]">Suggested Leads</h3>
                <p className="mt-1 text-sm text-[#607387]">Automated requirement-to-listing suggestions. Accepting creates a canonical interested lead record.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex w-fit rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                  {suggestedLeadRows.length} suggested
                </span>
                <Button size="sm" type="button" variant="secondary" onClick={regenerateListingSuggestions} disabled={suggestionActionId === 'generate' || !listingOrganisationId || !listingRecord?.id}>
                  {suggestionActionId === 'generate' ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
                  Generate
                </Button>
              </div>
            </div>
            {suggestionActionMessage ? (
              <div className="mt-4 rounded-[14px] border border-[#d8eddf] bg-[#ecfaf1] px-3 py-2 text-sm text-[#1f7d44]">{suggestionActionMessage}</div>
            ) : null}
            {suggestedLeadsError ? (
              <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">{suggestedLeadsError}</div>
            ) : null}
            <div className="mt-4 space-y-3">
              {suggestedLeadsLoading ? (
                <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4 text-sm text-[#607387]">Loading suggested leads...</div>
              ) : null}
              {!suggestedLeadsLoading && suggestedLeadRows.length ? suggestedLeadRows.map((suggestion) => {
                const lead = suggestion.lead || {}
                const reasons = Array.isArray(suggestion.reasons) ? suggestion.reasons : []
                const status = String(suggestion.status || 'pending').replace(/_/g, ' ')
                return (
                  <article key={suggestion.suggestionId} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[#22374d]">{lead.name || 'Unnamed lead'}</p>
                          <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                            {Math.round(Number(suggestion.score || 0))}% match
                          </span>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(suggestion.status)}`}>
                            {status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[#607387]">{lead.email || 'Email pending'} • {lead.phone || 'Phone pending'}</p>
                        <p className="mt-1 text-xs text-[#6b7d93]">{suggestion.requirementSummary || 'Requirement summary pending'} • Generated {formatDate(suggestion.generatedAt)}</p>
                        {reasons.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {reasons.slice(0, 4).map((reason, index) => (
                              <span key={`${suggestion.suggestionId}-reason-${index}`} className="rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                                {typeof reason === 'string' ? reason : reason?.label || reason?.reason || 'Match reason'}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {suggestion.leadId ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/pipeline/leads/${suggestion.leadId}`)}>
                            Open Lead
                          </Button>
                        ) : null}
                        {suggestion.status === 'pending' ? (
                          <>
                            <Button size="sm" type="button" onClick={() => handleListingSuggestionAction('accept', suggestion)} disabled={suggestionActionId === suggestion.suggestionId}>
                              {suggestionActionId === suggestion.suggestionId ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                              Accept
                            </Button>
                            <Button size="sm" type="button" variant="secondary" onClick={() => handleListingSuggestionAction('reject', suggestion)} disabled={suggestionActionId === suggestion.suggestionId}>
                              Reject
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              }) : null}
              {!suggestedLeadsLoading && !suggestedLeadRows.length ? (
                <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93]">
                  No automated lead suggestions for this listing yet.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-[1.05rem] font-semibold text-[#142132]">Viewings</h3>
                <p className="mt-1 text-sm text-[#607387]">Appointment requests, confirmations, and post-viewing feedback linked to this listing.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={openShowDayCaptureModal}
                  disabled={!listingOrganisationId || !listingRecord?.id || !isSupabaseConfigured}
                  title={!isSupabaseConfigured ? 'Show-day capture requires the workspace database.' : undefined}
                >
                  <UserRound size={15} />
                  Capture Show Day Lead
                </Button>
                <Button onClick={() => setShowViewingForm((current) => !current)}>
                  <Plus size={15} />
                  {showViewingForm ? 'Hide Viewing Form' : 'Request / Schedule Viewing'}
                </Button>
              </div>
            </div>

            {showViewingForm ? (
              <form className="mt-5 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4" onSubmit={submitViewingRequest}>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <label className="grid gap-2 xl:col-span-3">
                    <span className="text-sm font-semibold text-[#2d445e]">Buyer Lead</span>
                    <Field as="select" value={viewingForm.buyerLeadId} onChange={(event) => updateViewingForm('buyerLeadId', event.target.value)}>
                      <option value="">Select buyer lead</option>
                      {listingLeads.map((lead) => (
                        <option key={lead.id} value={lead.id}>{lead.name}</option>
                      ))}
                    </Field>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Proposed Date</span>
                    <Field type="date" value={viewingForm.proposedDate} onChange={(event) => updateViewingForm('proposedDate', event.target.value)} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Proposed Time</span>
                    <Field type="time" value={viewingForm.proposedTime} onChange={(event) => updateViewingForm('proposedTime', event.target.value)} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Alternative Time 1</span>
                    <Field type="datetime-local" value={viewingForm.alternativeTimeA} onChange={(event) => updateViewingForm('alternativeTimeA', event.target.value)} />
                  </label>
                  <label className="grid gap-2 xl:col-span-3">
                    <span className="text-sm font-semibold text-[#2d445e]">Notes</span>
                    <Field as="textarea" rows={3} value={viewingForm.notes} onChange={(event) => updateViewingForm('notes', event.target.value)} placeholder="Access notes, parking, or preferred alternatives." />
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowViewingForm(false)}>Cancel</Button>
                  <Button type="submit">Create Viewing Request</Button>
                </div>
              </form>
            ) : null}

            <div className="mt-5 space-y-5">
              {[
                { key: 'pending', label: 'Pending', rows: viewingGroups.pending },
                { key: 'confirmed', label: 'Confirmed', rows: viewingGroups.confirmed },
                { key: 'completed', label: 'Completed', rows: viewingGroups.completed },
              ].map((group) => (
                <section key={group.key}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-[0.92rem] font-semibold text-[#22374d]">{group.label}</h4>
                    <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                      {group.rows.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {group.rows.length ? group.rows.map((viewing) => (
                      <article key={viewing.viewing_id} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-[#22374d]">{viewing.buyer_name || 'Buyer'}</p>
                            <p className="mt-1 text-sm text-[#607387]">{viewing.proposed_date || 'Date pending'} {viewing.proposed_time || ''}</p>
                            <p className="mt-1 text-xs text-[#6b7d93]">{viewing.notes || 'No notes captured yet.'}</p>
                          </div>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(viewing.status)}`}>
                            {formatViewingStatusLabel(viewing.status)}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          {(viewing.participants || []).map((participant) => (
                            <div key={participant.participant_id} className="rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2">
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{participant.role}</p>
                              <p className="mt-1 text-sm font-medium text-[#22374d]">{participant.name}</p>
                              <p className="mt-1 text-xs text-[#607387]">{formatViewingStatusLabel(participant.response_status)}</p>
                              {group.key !== 'completed' ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <button type="button" className="rounded-full border border-[#dce6f2] px-2 py-1 text-[0.68rem] font-semibold text-[#35546c]" onClick={() => updateViewingParticipantResponse(viewing.viewing_id, participant.role, VIEWING_RESPONSE_STATUS.ACCEPTED)}>
                                    Accept
                                  </button>
                                  <button type="button" className="rounded-full border border-[#dce6f2] px-2 py-1 text-[0.68rem] font-semibold text-[#35546c]" onClick={() => updateViewingParticipantResponse(viewing.viewing_id, participant.role, VIEWING_RESPONSE_STATUS.DECLINED)}>
                                    Decline
                                  </button>
                                  <button type="button" className="rounded-full border border-[#dce6f2] px-2 py-1 text-[0.68rem] font-semibold text-[#35546c]" onClick={() => rescheduleViewingRequest(viewing.viewing_id, { proposedByRole: participant.role, proposedDate: viewing.proposed_date, proposedTime: viewing.proposed_time, notes: `Reschedule requested by ${participant.role}.` })}>
                                    Propose New Time
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {String(viewing.status || '').toLowerCase() === VIEWING_STATUS.CONFIRMED ? (
                            <Button size="sm" type="button" onClick={() => completeViewingRequest(viewing.viewing_id)}>Mark Completed</Button>
                          ) : null}
                        </div>
                        {String(viewing.status || '').toLowerCase() === VIEWING_STATUS.COMPLETED ? (
                          <div className="mt-4 rounded-[14px] border border-[#dce6f2] bg-white p-3">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Feedback</p>
                            {viewing.feedback ? (
                              <div className="mt-2 text-sm text-[#607387]">
                                <p><span className="font-semibold text-[#22374d]">Interest:</span> {viewing.feedback.interest_level || '—'}</p>
                                <p className="mt-1"><span className="font-semibold text-[#22374d]">Next Action:</span> {viewing.feedback.next_action || '—'}</p>
                                <p className="mt-1">{viewing.feedback.feedback_notes || 'No notes captured.'}</p>
                              </div>
                            ) : (
                              <div className="mt-3 grid gap-3 md:grid-cols-3">
                                <Field as="select" value={feedbackDrafts[viewing.viewing_id]?.interestLevel || ''} onChange={(event) => setFeedbackDrafts((prev) => ({ ...prev, [viewing.viewing_id]: { ...(prev[viewing.viewing_id] || {}), interestLevel: event.target.value } }))}>
                                  <option value="">Interest Level</option>
                                  <option value="interested">Interested</option>
                                  <option value="not_interested">Not interested</option>
                                  <option value="second_viewing">Wants second viewing</option>
                                  <option value="ready_to_offer">Ready to offer</option>
                                  <option value="follow_up_later">Follow up later</option>
                                </Field>
                                <Field value={feedbackDrafts[viewing.viewing_id]?.nextAction || ''} onChange={(event) => setFeedbackDrafts((prev) => ({ ...prev, [viewing.viewing_id]: { ...(prev[viewing.viewing_id] || {}), nextAction: event.target.value } }))} placeholder="Next action" />
                                <Field value={feedbackDrafts[viewing.viewing_id]?.feedbackNotes || ''} onChange={(event) => setFeedbackDrafts((prev) => ({ ...prev, [viewing.viewing_id]: { ...(prev[viewing.viewing_id] || {}), feedbackNotes: event.target.value } }))} placeholder="Feedback notes" />
                                <div className="md:col-span-3">
                                  <Button size="sm" type="button" onClick={() => saveFeedback(viewing.viewing_id)}>Save Feedback</Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </article>
                    )) : (
                      <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93]">
                        No {group.label.toLowerCase()} viewings for this listing yet.
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-[1rem] font-semibold text-[#142132]">Interested Leads</h3>
                <p className="mt-1 text-sm text-[#607387]">Canonical lead-listing interest records linked to this listing.</p>
              </div>
              <span className="inline-flex w-fit rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                {interestedLeadRows.length} linked
              </span>
            </div>
            {interestedLeadsError ? (
              <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">{interestedLeadsError}</div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ['Total Enquiries', listingAnalyticsSummary.totalEnquiries],
                ['Matched Leads', listingAnalyticsSummary.matchedLeads],
                ['Sent To Leads', listingAnalyticsSummary.sentToLeads],
                ['Viewings', listingAnalyticsSummary.viewings],
                ['Offers', listingAnalyticsSummary.offers],
                ['Transactions', listingAnalyticsSummary.transactions],
              ].map(([label, value]) => (
                <article key={label} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</p>
                  <strong className="mt-2 block text-[1.35rem] font-semibold tracking-[-0.04em] text-[#142132]">{value}</strong>
                </article>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {interestedLeadsLoading ? (
                <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4 text-sm text-[#607387]">Loading interested leads...</div>
              ) : null}
              {!interestedLeadsLoading && interestedLeadRows.length ? interestedLeadRows.map((interest) => {
                const lead = interest.lead || {}
                return (
                  <article key={interest.interestId} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#22374d]">{lead.name || 'Unnamed lead'}</p>
                        <p className="mt-1 text-sm text-[#607387]">{lead.email || 'Email pending'} • {lead.phone || 'Phone pending'}</p>
                        <p className="mt-1 text-xs text-[#6b7d93]">Source: {interest.source || lead.source || 'Unknown'} • Created {formatDate(interest.createdAt)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                          {String(interest.status || 'interested').replace(/_/g, ' ')}
                        </span>
                        <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                          {lead.assignedAgent || 'Unassigned'}
                        </span>
                        {interest.leadId ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/pipeline/leads/${interest.leadId}`)}>
                            Open Lead
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              }) : null}
              {!interestedLeadsLoading && !interestedLeadRows.length ? (
                <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93]">
                  No canonical interested leads linked yet.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-[1rem] font-semibold text-[#142132]">Sent To Leads</h3>
                <p className="mt-1 text-sm text-[#607387]">Agent-approved property shares logged from lead communication events.</p>
              </div>
              <span className="inline-flex w-fit rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                {sentPropertyRows.length} sent
              </span>
            </div>
            {sentPropertiesError ? (
              <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">{sentPropertiesError}</div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ['Times Shared', listingAnalyticsSummary.deliveryTimesShared || sentPropertyRows.length],
                ['Unique Buyers', listingAnalyticsSummary.deliveryUniqueBuyers],
                ['Sent', listingAnalyticsSummary.deliverySent],
                ['Delivered', listingAnalyticsSummary.deliveryDelivered],
                ['Failed', listingAnalyticsSummary.deliveryFailed],
              ].map(([label, value]) => (
                <article key={label} className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-3">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</p>
                  <strong className="mt-2 block text-[1.1rem] font-semibold tracking-[-0.035em] text-[#142132]">{value || 0}</strong>
                </article>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {sentPropertiesLoading ? (
                <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4 text-sm text-[#607387]">Loading sent property history...</div>
              ) : null}
              {!sentPropertiesLoading && sentPropertyRows.length ? sentPropertyRows.map((share) => (
                <article key={share.shareId || share.communicationId} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#22374d]">{share.leadName || share.leadId || 'Lead details pending'}</p>
                      <p className="mt-1 text-sm text-[#607387]">{share.leadEmail || 'Email pending'} • {share.leadPhone || 'Phone pending'}</p>
                      <p className="mt-1 text-xs text-[#6b7d93]">Sent {formatDate(share.sentAt)} • Agent {share.agentId || 'Unknown'}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                        {share.channel || 'channel pending'}
                      </span>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(share.status)}`}>
                        {share.status || 'pending'}
                      </span>
                      {share.leadId ? (
                        <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/pipeline/leads/${share.leadId}`)}>
                          Open Lead
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              )) : null}
              {!sentPropertiesLoading && !sentPropertyRows.length ? (
                <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93]">
                  This listing has not been sent to any leads from Arch9 yet.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <h3 className="text-[1rem] font-semibold text-[#142132]">Lead Register</h3>
            <p className="mt-1 text-sm text-[#607387]">Buyers currently interested in this listing.</p>
            <div className="mt-4 space-y-3">
              {listingLeads.length ? (
                listingLeads.map((lead) => (
                  <article key={lead.id} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#22374d]">{lead.name}</p>
                        <p className="mt-1 text-sm text-[#607387]">{lead.email || 'Email pending'} • {lead.phone || 'Phone pending'}</p>
                        <p className="mt-1 text-xs text-[#6b7d93]">{lead.notes || 'No lead notes captured.'}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                          {lead.journeyStage || lead.status || 'Lead'}
                        </span>
                        <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                          {formatCurrency(lead.budget)}
                        </span>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93]">
                  No listing-specific leads yet. Pipeline signals will appear here once this property starts attracting buyer activity.
                </div>
              )}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === 'offers' ? (
        <section className="space-y-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-[1.05rem] font-semibold text-[#142132]">Offer Management</h3>
                <p className="mt-1 text-sm text-[#607387]">
                  Offer workflow is retired. Use buyer onboarding to capture purchase, finance, party, and OTP details.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setOfferActionError(OFFER_WORKFLOW_RETIRED_MESSAGE)
                  setShowSendOfferLinkForm(false)
                }}
              >
                <Link2 size={15} />
                Offer Workflow Retired
              </Button>
            </div>

            {offerActionError ? (
              <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">{offerActionError}</div>
            ) : null}
            {offerActionMessage ? (
              <div className="mt-4 rounded-[14px] border border-[#d8eddf] bg-[#ecfaf1] px-3 py-2 text-sm text-[#1f7d44]">{offerActionMessage}</div>
            ) : null}
            {canonicalOffersError ? (
              <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">{canonicalOffersError}</div>
            ) : null}

            {OFFER_WORKFLOW_RETIRED ? (
              <div className="mt-5 rounded-[16px] border border-[#f3d7a5] bg-[#fff8ed] px-4 py-3 text-sm text-[#8a5a16]">
                Buyer onboarding is now the intake path for OTP preparation. Historical offer rows remain visible for audit only.
              </div>
            ) : showSendOfferLinkForm ? (
              <form className="mt-5 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4" onSubmit={handleCreateOfferLink}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Buyer lead</span>
                    <Field as="select" value={offerInviteDraft.buyerLeadId} onChange={(event) => setOfferInviteDraft((prev) => ({ ...prev, buyerLeadId: event.target.value }))}>
                      <option value="">Select buyer lead</option>
                      {buyerOfferLeads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.name || 'Buyer'} • {lead.email || lead.phone || 'No contact'}
                        </option>
                      ))}
                    </Field>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Link expiry (days)</span>
                    <Field
                      type="number"
                      min="1"
                      max="30"
                      value={offerInviteDraft.expiresInDays}
                      onChange={(event) => setOfferInviteDraft((prev) => ({ ...prev, expiresInDays: Number(event.target.value || 7) }))}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Client intake mode</span>
                    <Field
                      as="select"
                      value={offerInviteDraft.clientIntakePreference}
                      onChange={(event) => setOfferInviteDraft((prev) => ({ ...prev, clientIntakePreference: event.target.value }))}
                    >
                      {CLIENT_INTAKE_PREFERENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Field>
                  </label>
                </div>
                {selectedBuyerOfferEligibility ? (
                  <div className={`mt-3 rounded-[12px] border px-3 py-2 text-sm ${
                    selectedBuyerOfferEligibility.eligible
                      ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
                      : 'border-[#f4d4d4] bg-[#fff5f5] text-[#b42318]'
                  }`}>
                    <p className="font-semibold">
                      {selectedBuyerOfferEligibility.eligible ? 'Buyer eligible to receive an offer' : 'Buyer needs attention before an offer can be created'}
                    </p>
                    {selectedBuyerOfferEligibility.blockers.map((item) => <p key={item.code} className="mt-1">{item.message}</p>)}
                    {selectedBuyerOfferEligibility.warnings.map((item) => <p key={item.code} className="mt-1 opacity-90">Note: {item.message}</p>)}
                  </div>
                ) : null}
                {normalizeClientIntakePreference(offerInviteDraft.clientIntakePreference) === CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED ? (
                  <div className="mt-3 grid gap-4 rounded-[14px] border border-[#d8e6f2] bg-white p-3 md:grid-cols-2">
                    <p className="md:col-span-2 text-sm font-semibold text-[#2d445e]">Capture the buyer’s offer now. This stays internal until you send it to the seller.</p>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Offer amount *</span>
                      <Field type="number" min="1" step="1000" value={offerInviteDraft.offerAmount} onChange={(event) => setOfferInviteDraft((prev) => ({ ...prev, offerAmount: event.target.value }))} placeholder="0" />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Deposit amount</span>
                      <Field type="number" min="0" step="1000" value={offerInviteDraft.depositAmount} onChange={(event) => setOfferInviteDraft((prev) => ({ ...prev, depositAmount: event.target.value }))} placeholder="0" />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Finance</span>
                      <Field as="select" value={offerInviteDraft.financeType} onChange={(event) => setOfferInviteDraft((prev) => ({ ...prev, financeType: event.target.value }))}>
                        <option value="cash">Cash</option>
                        <option value="bond">Bond</option>
                        <option value="hybrid">Hybrid</option>
                      </Field>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Special conditions</span>
                      <Field value={offerInviteDraft.specialConditions} onChange={(event) => setOfferInviteDraft((prev) => ({ ...prev, specialConditions: event.target.value }))} placeholder="Optional conditions" />
                    </label>
                  </div>
                ) : null}
                <p className="mt-3 text-sm text-[#6b7d93]">
                  {normalizeClientIntakePreference(offerInviteDraft.clientIntakePreference) === CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED
                    ? 'No buyer link will be sent. You will capture the offer above and then review it before sending it to the seller.'
                    : normalizeClientIntakePreference(offerInviteDraft.clientIntakePreference) === CLIENT_INTAKE_PREFERENCE.HARD_COPY
                      ? 'No buyer link will be sent. Arch9 will prepare an internal hard-copy handoff for the agent.'
                      : 'Delivery will use the buyer’s saved notification mode and be recorded in the notification outbox.'}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowSendOfferLinkForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={sendingOfferLink || Boolean(selectedBuyerOfferLead && !selectedBuyerOfferEligibility?.eligible)}>
                    {sendingOfferLink
                      ? 'Saving...'
                      : normalizeClientIntakePreference(offerInviteDraft.clientIntakePreference) === CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED
                        ? 'Capture Agent-Assisted Offer'
                        : normalizeClientIntakePreference(offerInviteDraft.clientIntakePreference) === CLIENT_INTAKE_PREFERENCE.HARD_COPY
                          ? 'Prepare Hard-Copy Handoff'
                          : 'Generate & Send Link'}
                  </Button>
                </div>
              </form>
            ) : null}

            <div className="mt-4 space-y-2">
              {canonicalOffersLoading ? (
                <div className="rounded-[14px] border border-[#d8e6f6] bg-[#f3f8fd] px-3 py-2 text-sm text-[#2c5a89]">
                  Loading canonical offers...
                </div>
              ) : null}
              {offerInviteRows.length ? offerInviteRows.slice(0, 4).map((invite) => (
                <article key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-[#22374d]">{invite.buyerLeadName || 'Buyer lead'}</p>
                    <p className="text-xs text-[#607387]">Status: {formatStatusLabel(invite.status)} • Expires {formatDate(invite.expiresAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyOfferLink(invite.token)}
                    className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-white px-3 py-1 text-xs font-semibold text-[#35546c]"
                  >
                    <Copy size={12} />
                    {copiedOfferToken === invite.token ? 'Copied' : 'Copy Link'}
                  </button>
                </article>
              )) : (
                <div className="rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-3 py-3 text-sm text-[#6b7d93]">
                  No secure offer links sent yet.
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-3">
              {offerRows.length ? (
                offerRows.map((offer) => {
                  const statusKey = normalizeOfferWorkflowStatus(offer.status)
                  const sellerReviewPreparation = offer.sourceSystem === 'canonical_offer' ? buildListingSellerReviewPreparation(offer) : null
                  const sellerReviewPreparationSummary = describeSellerReviewPreparation(sellerReviewPreparation)
                  const sellerReviewDeliveryMode = sellerReviewPreparation?.deliveryMode || SELLER_REVIEW_DELIVERY_MODE.EMAIL
                  const sellerReviewSession = offer.sellerReviewSession || {}
                  const sellerReviewToken = String(sellerReviewSession.token || offer.conditionsJson?.sellerReviewSessionToken || '').trim()
                  const sellerReviewLink = sellerReviewToken && typeof window !== 'undefined'
                    ? `${window.location.origin}/seller/offers/review/${encodeURIComponent(sellerReviewToken)}`
                    : ''
                  const sellerReviewRecipient = String(
                    offer.conditionsJson?.sellerReviewRecipientEmail ||
                      offer.conditionsJson?.sellerEmail ||
                      sellerReviewSession.metadata?.sellerEmail ||
                      '',
                  ).trim()
                  const sellerReviewSentAt = String(sellerReviewSession.sentAt || offer.sentToSellerAt || offer.conditionsJson?.sellerReviewSentAt || '').trim()
                  const sellerReviewViewedAt = String(sellerReviewSession.viewedAt || offer.sellerViewedAt || '').trim()
                  const hasSellerReview = Boolean(sellerReviewToken || sellerReviewSentAt || [
                    OFFER_WORKFLOW_STATUS.SELLER_REVIEW,
                    OFFER_WORKFLOW_STATUS.SELLER_VIEWED,
                  ].includes(statusKey))
                  const buyerOtpReadiness = offer.kingstonsBuyerOtpReadiness || null
                  const buyerOtpRow = buyerOtpReadiness?.rows?.[0] || null
                  const buyerOtpReady = buyerOtpReadiness?.gate?.offerConversionReady === true
                  const buyerOtpUploadControlKey = `kingstons-buyer-otp:${offer.canonicalOfferId || offer.offerId || offer.id || offer.buyerLeadId || ''}`
                  return (
                  <article key={offer.id} className="rounded-[18px] border border-[#dce6f2] bg-white p-4 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-[1rem] font-semibold text-[#22374d]">{offer.buyerName || 'Buyer pending'}</p>
                        <p className="mt-1 text-sm text-[#607387]">{formatCurrency(offer.offerPrice)} • {offer.conditions || 'Conditions not set'}</p>
                        <p className="mt-1 text-xs text-[#6b7d93]">
                          Offer date: {formatDate(offer.offerDate)} • Expiry: {formatDate(offer.expiryDate)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${
                            offer.sourceSystem === 'canonical_offer'
                              ? 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
                              : 'border-[#dbe6f2] bg-white text-[#35546c]'
                          }`}>
                            {offer.sourceSystem === 'canonical_offer' ? 'Canonical offer' : 'Legacy listing offer'}
                          </span>
                          {offer.viewingAppointmentId ? (
                            <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.7rem] font-semibold text-[#35546c]">
                              Viewing linked
                            </span>
                          ) : null}
                          {offer.conversionCandidate && [OFFER_WORKFLOW_STATUS.ACCEPTED, OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION].includes(statusKey) ? (
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${
                              offer.conversionCandidate.status === 'ready'
                                ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
                                : 'border-[#f5d6a8] bg-[#fff8ed] text-[#9a5b11]'
                            }`}>
                              {offer.conversionCandidate.status === 'converted'
                                ? 'Transaction linked'
                                : offer.conversionCandidate.status === 'ready'
                                  ? 'Conversion ready'
                                  : 'Conversion needs attention'}
                            </span>
                          ) : null}
                        </div>
                        {offer.supportingDocsUrl ? (
                          <a href={offer.supportingDocsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#1f4f78]">
                            <ExternalLink size={14} />
                            Open supporting docs
                          </a>
                        ) : null}
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(offer.status)}`}>
                        {formatStatusLabel(offer.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-[#607387]">{offer.agentNotes || 'No agent notes logged yet.'}</p>
                    {hasSellerReview ? (
                      <div className="mt-3 grid gap-2 rounded-[14px] border border-[#d8e6f6] bg-[#f6faff] p-3 text-sm text-[#35546c] md:grid-cols-[1fr_1fr_1fr_auto]">
                        <div>
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#7d91a8]">Seller review</p>
                          <p className="mt-1 font-semibold text-[#203a54]">{sellerReviewViewedAt ? 'Viewed by seller' : 'Sent to seller'}</p>
                        </div>
                        <div>
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#7d91a8]">Recipient</p>
                          <p className="mt-1 truncate font-semibold text-[#203a54]">{sellerReviewRecipient || 'Seller email pending'}</p>
                        </div>
                        <div>
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#7d91a8]">{sellerReviewViewedAt ? 'Viewed' : 'Sent'}</p>
                          <p className="mt-1 font-semibold text-[#203a54]">{formatDate(sellerReviewViewedAt || sellerReviewSentAt)}</p>
                        </div>
                        {sellerReviewLink ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => {
                            if (typeof navigator !== 'undefined') void navigator.clipboard?.writeText(sellerReviewLink)
                            setOfferActionMessage('Seller review link copied.')
                          }}>
                            Copy Seller Link
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <label className="mt-3 grid gap-1">
                      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Internal note</span>
                      <Field
                        value={offerNotesDraftById?.[offer.id] || ''}
                        onChange={(event) => setOfferNotesDraftById((previous) => ({ ...previous, [offer.id]: event.target.value }))}
                        placeholder="Optional note for this action"
                      />
                    </label>
                    {listingHasKingstonsSellerProcess ? (
                      <div data-testid="kingstons-buyer-otp-upload-card" className="mt-3 flex flex-col gap-3 rounded-[14px] border border-[#dbe6f2] bg-[#f8fbff] p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#607387]">Signed OTP</p>
                          <p className="mt-1 text-sm font-semibold text-[#243d56]">{buyerOtpRow?.statusLabel || 'Missing'}</p>
                          <p className="mt-1 text-xs leading-5 text-[#607387]">{buyerOtpReadiness?.gate?.reason || 'Upload the manually signed OTP.'}</p>
                        </div>
                        <label className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#1f4f78] transition ${buyerOtpUploadKey ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-[#b7c8db] hover:bg-[#f7fbff]'}`}>
                          {buyerOtpUploadKey === buyerOtpUploadControlKey ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                          {buyerOtpReady ? 'Replace OTP' : 'Upload OTP'}
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            className="hidden"
                            disabled={Boolean(buyerOtpUploadKey)}
                            onChange={(event) => void handleKingstonsBuyerOtpUpload(offer, event)}
                          />
                        </label>
                      </div>
                    ) : null}
                    {[
                      OFFER_WORKFLOW_STATUS.SUBMITTED,
                      OFFER_WORKFLOW_STATUS.AGENT_REVIEW,
                    ].includes(normalizeOfferWorkflowStatus(offer.status)) && offer.sourceSystem !== 'canonical_offer' && !OFFER_WORKFLOW_RETIRED ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" type="button" onClick={() => handleOfferAction(offer.id, 'forward_to_seller')}>Forward to Seller</Button>
                        <Button size="sm" variant="secondary" type="button" onClick={() => handleOfferAction(offer.id, 'request_clarification')}>Request Clarification</Button>
                        <Button size="sm" variant="secondary" type="button" onClick={() => handleOfferAction(offer.id, 'reject_invalid')}>Reject Invalid</Button>
                      </div>
                    ) : null}
                    {offer.sourceSystem === 'canonical_offer' && !OFFER_WORKFLOW_RETIRED ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {[
                          OFFER_WORKFLOW_STATUS.SUBMITTED,
                          OFFER_WORKFLOW_STATUS.DRAFT,
                          OFFER_WORKFLOW_STATUS.SENT_TO_BUYER,
                          OFFER_WORKFLOW_STATUS.BUYER_VIEWED,
                        ].includes(normalizeOfferWorkflowStatus(offer.status)) ? (
                          <Button
                            size="sm"
                            type="button"
                            variant="secondary"
                            disabled={canonicalOfferActionId === `${offer.id}:agent_review`}
                            onClick={() => void handleCanonicalListingOfferStatus(offer, 'agent_review', 'Agent review started')}
                          >
                            Start Agent Review
                          </Button>
                        ) : null}
                        {![
                          OFFER_WORKFLOW_STATUS.ACCEPTED,
                          OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION,
                          OFFER_WORKFLOW_STATUS.REJECTED,
                          OFFER_WORKFLOW_STATUS.WITHDRAWN,
                          OFFER_WORKFLOW_STATUS.EXPIRED,
                        ].includes(normalizeOfferWorkflowStatus(offer.status)) ? (
                          <>
                            <Field
                              as="select"
                              className="min-w-[150px]"
                              value={sellerReviewDeliveryMode}
                              onChange={(event) => setSellerReviewDeliveryModeByOfferId((previous) => ({ ...previous, [offer.id]: event.target.value }))}
                            >
                              {SELLER_REVIEW_DELIVERY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </Field>
                            <Button
                              size="sm"
                              type="button"
                              disabled={canonicalOfferActionId === `${offer.id}:sent_to_seller`}
                              onClick={() => void handleCanonicalListingOfferSendToSeller(offer)}
                            >
                              {[OFFER_WORKFLOW_STATUS.SELLER_REVIEW, OFFER_WORKFLOW_STATUS.SELLER_VIEWED].includes(statusKey) ? 'Resend to Seller' : 'Send Offer to Seller'}
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              variant="secondary"
                              disabled={canonicalOfferActionId === `${offer.id}:changes_requested`}
                              onClick={() => void handleCanonicalListingOfferStatus(offer, 'changes_requested', 'Buyer changes requested')}
                            >
                              Request Buyer Changes
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              variant="secondary"
                              className="border-[#f1d0ca] text-[#9f3a2f] hover:bg-[#fff6f4]"
                              disabled={canonicalOfferActionId === `${offer.id}:rejected`}
                              onClick={() => void handleCanonicalListingOfferStatus(offer, 'rejected', 'Offer rejected')}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {normalizeOfferWorkflowStatus(offer.status) === OFFER_WORKFLOW_STATUS.ACCEPTED || (
                          normalizeOfferWorkflowStatus(offer.status) === OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION && offer.transactionId
                        ) ? (
                          <Button
                            size="sm"
                            type="button"
                            disabled={canonicalOfferActionId === `${offer.id}:convert`}
                            onClick={() => void handleCanonicalListingOfferConversion(offer)}
                          >
                            {normalizeOfferWorkflowStatus(offer.status) === OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION
                              ? 'Confirm Originator & Send Onboarding'
                              : 'Create Transaction & Choose Originator'}
                          </Button>
                        ) : null}
                        {offer.buyerLeadId ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/pipeline/leads/${offer.buyerLeadId}`)}>Open Buyer Lead</Button>
                        ) : null}
                        {offer.transactionId ? (
                          <>
                            <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/transactions/${offer.transactionId}`)}>Open Transaction</Button>
                            {!listingKingstonsBuyerOtpDigitalDecision.blocked ? (
                              <Button size="sm" type="button" variant="secondary" onClick={() => handleAcceptedOfferPrepareOtpClick(offer)}>
                                Prepare OTP
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : OFFER_WORKFLOW_RETIRED ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {offer.buyerLeadId ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/pipeline/leads/${offer.buyerLeadId}`)}>Open Buyer Lead</Button>
                        ) : null}
                        {offer.transactionId ? (
                          <>
                            <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/transactions/${offer.transactionId}`)}>Open Transaction</Button>
                            {!listingKingstonsBuyerOtpDigitalDecision.blocked ? (
                              <Button size="sm" type="button" variant="secondary" onClick={() => handleAcceptedOfferPrepareOtpClick(offer)}>
                                Prepare OTP
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-[#9a5b11]">Use buyer onboarding for OTP intake.</span>
                        )}
                      </div>
                    ) : null}
                    {offer.sourceSystem === 'canonical_offer' && sellerReviewPreparationSummary.blockers.length ? (
                      <div className="mt-3 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">
                        {sellerReviewPreparationSummary.blockerText}
                      </div>
                    ) : null}
                    {offer.sourceSystem === 'canonical_offer' && !sellerReviewPreparationSummary.blockers.length && sellerReviewPreparationSummary.warnings.length ? (
                      <div className="mt-3 rounded-[14px] border border-[#f5d6a8] bg-[#fff8ed] px-3 py-2 text-sm text-[#9a5b11]">
                        {sellerReviewPreparationSummary.warningText}
                      </div>
                    ) : null}
                  </article>
                  )
                })
              ) : (
                <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93]">
                  No offers captured for this listing yet.
                </div>
              )}
            </div>

            <aside className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <h3 className="text-[1rem] font-semibold text-[#142132]">Offer Comparison</h3>
              <p className="mt-1 text-sm text-[#607387]">Fast read on current offer quality and seller options.</p>
              <div className="mt-4 space-y-3">
                <MetricCard label="Highest Offer" value={formatCurrency(offerSummary.highest)} meta="Top current buyer position" />
                <MetricCard label="Average Offer" value={offerRows.length ? formatCurrency(metrics.offerAverage) : '—'} meta="Mean offer level" />
                <MetricCard label="Submitted" value={offerSummary.submitted} meta="Awaiting internal review" />
                <MetricCard label="Seller Review" value={offerSummary.sellerReview} meta="Offers with seller" />
                <MetricCard label="Accepted" value={metrics.acceptedCount} meta="Converted or ready to convert" />
              </div>
            </aside>
          </section>
        </section>
      ) : null}

      {activeTab === 'seller' ? (
        <section className="mx-auto w-full max-w-[1600px] space-y-5 px-0">
          <section className="relative min-h-[240px] overflow-hidden rounded-[24px] border border-[#dde4ee] bg-[#123955] shadow-[0_14px_34px_rgba(15,23,42,0.08)] sm:min-h-[300px]">
            <div className="absolute inset-0">
              {getImageBlock(coverImage?.url || '', listingIdentity.title)}
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#081e32]/85 via-[#0d304b]/48 to-[#0d304b]/10" />
            <div className="relative flex min-h-[240px] items-end p-6 sm:min-h-[300px] sm:p-8">
              <div className="max-w-4xl">
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">{listingIdentity.title}</h1>
                <p className="mt-2 text-lg font-semibold text-white/90">{listingIdentity.location}</p>
                <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-sm font-semibold text-white/90">
                  {listingIdentity.facts.map((fact, index) => (
                    <span key={`${fact}-${index}`} className="inline-flex items-center gap-3">
                      {index > 0 ? <span className="h-1 w-1 rounded-full bg-white/65" /> : null}
                      {fact}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <nav className="rounded-[22px] border border-[#dde4ee] bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)]" aria-label="Seller mandate workspace tabs">
            <div className="overflow-x-auto">
              <div className="grid min-w-[880px] grid-cols-7 gap-1">
                {SELLER_WORKSPACE_TABS.map((tab) => {
                  const active = sellerWorkspaceTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      className={`min-h-[42px] rounded-[14px] px-4 text-sm font-semibold transition ${
                        active
                          ? 'bg-[#123955] text-white shadow-[0_10px_22px_rgba(18,57,85,0.16)]'
                          : 'text-[#5f7288] hover:bg-[#f7fbff] hover:text-[#263b4f]'
                      }`}
                      onClick={() => openSellerWorkspaceSection(tab.key)}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </nav>

          {sellerWorkspaceTab === 'overview' ? (
            <section className="space-y-5">
              <article className="rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-[#142132]">Performance</h2>
                    {listingPerformance.hasOverrides ? (
                      <p className="mt-1 text-xs font-semibold text-[#1f7d44]">Manual seller-facing stats are active.</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex min-h-9 items-center rounded-lg border border-[#dbe6f2] bg-[#f7fbff] px-3 text-xs font-semibold text-[#35546c]">
                      Last 30 days
                    </span>
                    <Button type="button" size="sm" variant="secondary" onClick={openListingPerformanceEditor}>
                      <Pencil size={14} />
                      Edit Stats
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    {
                      label: 'Views',
                      value: formatCompactNumber(listingPerformance.totalViews),
                      meta: listingPerformance.viewChangePercent !== null && listingPerformance.viewChangePercent !== undefined
                        ? `${formatSignedPercentValue(listingPerformance.viewChangePercent)} vs previous 30 days`
                        : listingPerformance.portalViews || listingPerformance.bridgeViews
                          ? `${formatCompactNumber(listingPerformance.portalViews)} portal / ${formatCompactNumber(listingPerformance.bridgeViews)} Arch9`
                          : 'Analytics not recorded',
                      icon: Eye,
                    },
                    { label: 'Leads', value: formatCompactNumber(listingPerformance.leadCount), meta: `${formatCompactNumber(listingPerformance.newThisWeek)} new this week`, icon: Users },
                    { label: 'Viewings', value: formatCompactNumber(listingPerformance.scheduledViewings), meta: `${formatCompactNumber(listingPerformance.upcomingViewings)} upcoming`, icon: CalendarDays },
                    { label: 'Offers', value: formatCompactNumber(listingPerformance.offerCount), meta: `${formatCompactNumber(listingPerformance.pendingOffers)} active`, icon: HandCoins },
                    {
                      label: 'Days on market',
                      value: formatCompactNumber(listingPerformance.daysOnMarket),
                      meta: listingPerformance.areaAverageDays
                        ? `Area avg. ${formatCompactNumber(listingPerformance.areaAverageDays)}`
                        : `Listed ${formatDate(listingPerformance.marketStartDate)}`,
                      icon: BarChart3,
                    },
                  ].map((card) => {
                    const Icon = card.icon
                    return (
                      <div key={card.label} className="flex h-full min-h-[112px] flex-col justify-between rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[0.72rem] font-semibold text-[#6f8198]">{card.label}</p>
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#eef5fb] text-[#1f4f78]">
                            <Icon size={15} />
                          </span>
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-[#10243a]">{card.value}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-[#607387]">{card.meta}</p>
                      </div>
                    )
                  })}
                </div>
              </article>

              <article className="rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-[#142132]">Buyer Interest Funnel</h2>
                  <Info size={15} className="text-[#7890aa]" />
                </div>
                <div className="mt-4 grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_24px_minmax(0,1fr)_24px_minmax(0,1fr)]">
                  {[
                    { label: 'Views', value: listingPerformance.totalViews, icon: Eye },
                    { label: 'Leads', value: listingPerformance.leadCount, icon: Users },
                    { label: 'Viewings', value: listingPerformance.scheduledViewings, icon: CalendarDays },
                    { label: 'Offers', value: listingPerformance.offerCount, icon: HandCoins },
                  ].map((stage, index) => {
                    const Icon = stage.icon
                    return (
                      <Fragment key={stage.label}>
                        <div className="flex min-h-[64px] items-center gap-3 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-4 py-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#eef5fb] text-[#1f4f78]">
                            <Icon size={15} />
                          </span>
                          <div>
                            <p className="text-lg font-semibold text-[#142132]">{formatCompactNumber(stage.value)}</p>
                            <p className="text-xs font-semibold text-[#6b7d93]">{stage.label}</p>
                          </div>
                        </div>
                        {index < 3 ? <ChevronRight className="hidden justify-self-center text-[#7890aa] lg:block" size={20} /> : null}
                      </Fragment>
                    )
                  })}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    { label: 'Enquiry rate', value: listingConversionMetrics[0]?.value || 0 },
                    { label: 'Viewing conversion', value: listingConversionMetrics[1]?.value || 0 },
                    { label: 'Offer conversion', value: listingConversionMetrics[2]?.value || 0 },
                  ].map((metric) => (
                    <div key={metric.label} className="flex min-h-[52px] items-center justify-between gap-3 border-t border-[#e7edf5] pt-3">
                      <span className="text-xs font-semibold text-[#6b7d93]">{metric.label}</span>
                      <span className="text-sm font-semibold text-[#142132]">{formatPercentValue(metric.value)}</span>
                    </div>
                  ))}
                </div>
              </article>

              <section className="grid items-stretch gap-5 xl:grid-cols-2">
                <article className="flex h-full flex-col rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-[#142132]">Latest Buyer Activity</h2>
                    <button type="button" onClick={() => openSellerWorkspaceSection('leads')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                      View all leads
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="mt-4 flex-1 space-y-3">
                    {overviewBuyerActivity.length ? overviewBuyerActivity.map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef5fb] text-[0.72rem] font-semibold text-[#1f4f78]">
                          {getInitials(item.buyerName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[#22374d]">{item.buyerName}</p>
                          <p className="truncate text-xs text-[#607387]">{item.event}{item.source ? ` · ${item.source}` : ''}</p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-[#7b8ca2]">{formatOverviewTimestamp(item.timestamp)}</span>
                      </div>
                    )) : (
                      <div className="rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-4 py-6 text-sm text-[#607387]">
                        No buyer leads yet.
                      </div>
                    )}
                  </div>
                  <Button type="button" size="sm" variant="secondary" className="mt-4" onClick={openShowDayCaptureModal}>
                    <Plus size={14} />
                    Add Lead
                  </Button>
                </article>

                <article className="flex h-full flex-col rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-[#142132]">Upcoming Viewings</h2>
                    <button type="button" onClick={() => setActiveTab('pipeline')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                      View all
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="mt-4 flex-1 divide-y divide-[#e7edf5]">
                    {overviewUpcomingViewings.length ? overviewUpcomingViewings.map((viewing) => (
                      <div key={viewing.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] sm:items-center">
                        <span className="text-sm font-semibold text-[#607387]">{viewing.dateLabel}</span>
                        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-[#22374d]">
                          <UserRound size={14} className="shrink-0 text-[#607387]" />
                          <span className="truncate">{viewing.buyerName}</span>
                        </span>
                        <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusClass(viewing.status)}`}>
                          {formatViewingStatusLabel(viewing.status)}
                        </span>
                      </div>
                    )) : (
                      <div className="rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-4 py-6 text-sm text-[#607387]">
                        No upcoming viewings.
                      </div>
                    )}
                  </div>
                  <Button type="button" size="sm" variant="secondary" className="mt-4" onClick={() => { setActiveTab('pipeline'); setShowViewingForm(true) }}>
                    <CalendarDays size={14} />
                    {overviewUpcomingViewings.length ? 'Open Viewing Planner' : 'Schedule Viewing'}
                  </Button>
                </article>
              </section>

              <section className="grid items-stretch gap-5 xl:grid-cols-3">
                <article className="flex h-full flex-col rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-[#142132]">Seller</h2>
                    <button type="button" onClick={() => openSellerWorkspaceSection('seller')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                      Open seller
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-[#142132]">{overviewSellerSnapshot.name}</p>
                  <div className="mt-3 space-y-2">
                    <OverviewStatusRow label="Seller Portal" value={overviewSellerSnapshot.portalStatus} status={overviewSellerSnapshot.portalStatusKey} />
                    <OverviewStatusRow label="Recovery" value={getSellerPortalRecoveryStatusLabel(sellerPortalAccessState)} />
                    <OverviewStatusRow label="FICA" value={overviewSellerSnapshot.ficaStatus} status={overviewSellerSnapshot.ficaStatusKey} />
                    <OverviewStatusRow label="Mandate" value={overviewSellerSnapshot.mandateStatus} status={overviewSellerSnapshot.mandateStatusKey} />
                    <OverviewStatusRow label="Mandate expiry" value={overviewSellerSnapshot.mandateExpiry} />
                    <OverviewStatusRow label="Last contact" value={overviewSellerSnapshot.lastContact} />
                  </div>
                  <div className="mt-4 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-[#142132]">Portal Security</h3>
                      <StatusPill
                        status={sellerPortalSecurityDiagnostics?.health || sellerPortalLifecycleStatus}
                        label={formatStatusLabel(sellerPortalSecurityDiagnostics?.health || sellerPortalLifecycleStatus || 'unavailable')}
                      />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs leading-5 text-[#607387]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-[#6b7d93]">Failures (24h)</span>
                        <span className="font-semibold text-[#142132]">
                          {Number(
                            sellerPortalSecurityDiagnostics?.authentication?.failedEvents24h ??
                              sellerPortalSecurityDiagnostics?.failedEvents24h ??
                              sellerPortalSecurityDiagnostics?.authentication?.failedLoginCount ??
                              0,
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-[#6b7d93]">Open alerts</span>
                        <span className="font-semibold text-[#142132]">
                          {`${sellerPortalSecurityDiagnostics?.openAlerts?.length || 0} open security alert${(sellerPortalSecurityDiagnostics?.openAlerts?.length || 0) === 1 ? '' : 's'}`}
                        </span>
                      </div>
                    </div>
                  </div>
                </article>

                <article className="flex h-full flex-col rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-[#142132]">Marketing</h2>
                    <button type="button" onClick={() => openSellerWorkspaceSection('marketing')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                      Open marketing
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {overviewMarketingSnapshot.rows.length ? overviewMarketingSnapshot.rows.map((row) => (
                      <div key={row.label} className="flex min-h-[34px] items-center justify-between gap-3 border-b border-[#edf2f7] py-1.5 last:border-b-0">
                        <span className="text-xs font-semibold text-[#6b7d93]">{row.label}</span>
                        <StatusPill status={row.status} label={row.value} />
                      </div>
                    )) : (
                      <div className="rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-4 py-6 text-sm text-[#607387]">
                        This listing has not been published to any marketing portals yet.
                      </div>
                    )}
                  </div>
                </article>

                <article className="flex h-full flex-col rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-[#142132]">Price Position</h2>
                    <button type="button" onClick={() => openSellerWorkspaceSection('marketing')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                      Edit pricing
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">
                    <CompactSnapshotRow label="Asking Price" value={overviewPricePosition.askingPrice ? formatMoneyValue(overviewPricePosition.askingPrice) : '—'} />
                    <CompactSnapshotRow label="Highest Offer" value={overviewPricePosition.highestOffer ? formatMoneyValue(overviewPricePosition.highestOffer) : '—'} />
                    <CompactSnapshotRow label="Average Offer" value={overviewPricePosition.averageOffer ? formatMoneyValue(overviewPricePosition.averageOffer) : '—'} />
                    <CompactSnapshotRow label="Difference" value={overviewPricePosition.differenceLabel} />
                  </div>
                  {!overviewPricePosition.offerCount ? (
                    <p className="mt-4 rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-4 py-3 text-sm text-[#607387]">
                      No offers received yet.
                    </p>
                  ) : null}
                </article>
              </section>

              <article className="rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[#142132]">Recent Activity</h2>
                  <button type="button" onClick={() => openSellerWorkspaceSection('activity')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]">
                    View all activity
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {overviewRecentActivity.length ? overviewRecentActivity.map((item, index) => {
                    const Icon = item.icon || FolderKanban
                    return (
                      <div key={`${item.title}-${index}`} className="flex min-h-[82px] items-start gap-3 rounded-[14px] border border-[#e1e9f2] bg-[#fbfdff] p-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#eef5fb] text-[#1f4f78]">
                          <Icon size={15} />
                        </span>
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-xs font-semibold text-[#22374d]">{item.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-[#607387]">{item.copy}</p>
                          <p className="mt-1 text-[0.68rem] font-semibold text-[#7b8ca2]">{formatOverviewTimestamp(item.timestamp)}</p>
                        </div>
                      </div>
                    )
                  }) : (
                    <div className="rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-4 py-6 text-sm text-[#607387] md:col-span-2 xl:col-span-5">
                      No recent listing activity.
                    </div>
                  )}
                </div>
              </article>
            </section>
          ) : null}

          {sellerWorkspaceTab === 'leads' ? (
            <section className="space-y-5">
              <article className="rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-[#142132]">Leads for this listing</h2>
                    <p className="mt-1 text-sm text-[#607387]">All enquiries and leads that came in through this property.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => setListingLeadFiltersOpen((current) => !current)}>
                      <SlidersHorizontal size={14} />
                      Filters
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={handleExportListingLeads} disabled={!filteredListingLeadRows.length}>
                      <Download size={14} />
                      Export
                    </Button>
                    <Button type="button" size="sm" onClick={openShowDayCaptureModal}>
                      <Plus size={14} />
                      Add Lead
                    </Button>
                  </div>
                </div>

                {(interestedLeadsError || canonicalOffersError) ? (
                  <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">
                    {interestedLeadsError || canonicalOffersError}
                  </div>
                ) : null}
                {(interestedLeadsLoading || canonicalOffersLoading) ? (
                  <div className="mt-4 rounded-[14px] border border-[#d8e6f6] bg-[#f3f8fd] px-3 py-2 text-sm font-semibold text-[#2c5a89]">
                    Loading listing leads...
                  </div>
                ) : null}

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                  {[
                    { label: 'Total leads', value: listingLeadSummary.total, meta: 'All time', icon: Users },
                    { label: 'New this week', value: listingLeadSummary.newThisWeek, meta: 'Last 7 days', icon: UserRound },
                    { label: 'Contacted', value: listingLeadSummary.contacted, meta: listingLeadSummary.percent(listingLeadSummary.contacted), icon: MessageSquare },
                    { label: 'Viewings booked', value: listingLeadSummary.viewingsBooked, meta: listingLeadSummary.percent(listingLeadSummary.viewingsBooked), icon: CalendarDays },
                    { label: 'Offers', value: listingLeadSummary.offers, meta: listingLeadSummary.percent(listingLeadSummary.offers), icon: HandCoins },
                    { label: 'Converted', value: listingLeadSummary.converted, meta: 'Leads to transaction', icon: CheckCircle2 },
                  ].map((card) => {
                    const Icon = card.icon
                    return (
                      <article key={card.label} className="flex min-h-[116px] flex-col justify-between rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                        <div className="flex items-start gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#eef5fb] text-[#1f4f78]">
                            <Icon size={16} />
                          </span>
                          <p className="pt-1 text-sm font-semibold text-[#607387]">{card.label}</p>
                        </div>
                        <p className="mt-4 text-2xl font-semibold text-[#10243a]">{formatCompactNumber(card.value)}</p>
                        <p className="mt-1 text-sm font-medium text-[#607387]">{card.meta}</p>
                      </article>
                    )
                  })}
                </div>

                <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <label className="relative block min-w-0 flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7b8ca2]" />
                    <Field
                      className="pl-9"
                      value={listingLeadSearch}
                      onChange={(event) => setListingLeadSearch(event.target.value)}
                      placeholder="Search lead, phone, or email"
                    />
                  </label>
                  <span className="text-sm font-semibold text-[#607387]">{filteredListingLeadRows.length} shown</span>
                </div>

                {listingLeadFiltersOpen ? (
                  <div className="mt-4 grid gap-3 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4 md:grid-cols-2 xl:grid-cols-4">
                    <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
                      Status
                      <Field as="select" value={listingLeadStatusFilter} onChange={(event) => setListingLeadStatusFilter(event.target.value)}>
                        <option value="all">All statuses</option>
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="viewing">Viewing</option>
                        <option value="offer">Offer</option>
                        <option value="converted">Converted</option>
                        <option value="lost">Lost</option>
                      </Field>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
                      Source
                      <Field as="select" value={listingLeadSourceFilter} onChange={(event) => setListingLeadSourceFilter(event.target.value)}>
                        {listingLeadSourceOptions.map((source) => (
                          <option key={source} value={source}>{source === 'all' ? 'All sources' : source}</option>
                        ))}
                      </Field>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
                      Activity
                      <Field as="select" value={listingLeadActivityFilter} onChange={(event) => setListingLeadActivityFilter(event.target.value)}>
                        <option value="all">All activity</option>
                        <option value="has_viewing">Has viewing</option>
                        <option value="has_offer">Has offer</option>
                        <option value="needs_follow_up">Needs follow-up</option>
                      </Field>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
                      Date
                      <Field as="select" value={listingLeadDateFilter} onChange={(event) => setListingLeadDateFilter(event.target.value)}>
                        <option value="all">All dates</option>
                        <option value="today">Today</option>
                        <option value="7_days">Last 7 days</option>
                        <option value="30_days">Last 30 days</option>
                      </Field>
                    </label>
                  </div>
                ) : null}
              </article>

              <article className="overflow-hidden rounded-[20px] border border-[#dde4ee] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
                {listingLeadRows.length ? (
                  <>
                    <div className="hidden overflow-x-auto lg:block">
                      <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
                        <thead className="bg-[#f8fbfd] text-[0.66rem] uppercase tracking-[0.1em] text-[#7b8ca2]">
                          <tr className="border-b border-[#e5edf6]">
                            <th className="w-[18%] px-5 py-3">Lead</th>
                            <th className="w-[12%] px-5 py-3">Source</th>
                            <th className="w-[13%] px-5 py-3">Status</th>
                            <th className="w-[13%] px-5 py-3">Contacted</th>
                            <th className="w-[14%] px-5 py-3">Viewing</th>
                            <th className="w-[12%] px-5 py-3">Offer</th>
                            <th className="w-[10%] px-5 py-3">Date added ↓</th>
                            <th className="w-[8%] px-5 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#edf2f7]">
                          {visibleListingLeadRows.length ? visibleListingLeadRows.map((lead) => (
                            <tr key={lead.leadId || lead.id} className="align-middle text-[#425970] transition hover:bg-[#fbfdff]">
                              <td className="px-5 py-4">
                                <button type="button" onClick={() => lead.leadId && navigate(`/pipeline/leads/${lead.leadId}`)} className="flex min-w-0 items-center gap-3 text-left" disabled={!lead.leadId}>
                                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef5fb] text-xs font-semibold text-[#1f4f78]">
                                    {getInitials(lead.name)}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate font-semibold text-[#243d56]">{lead.name}</span>
                                    <span className="mt-1 block truncate text-xs text-[#607387]">{lead.phone || lead.email || 'Contact pending'}</span>
                                  </span>
                                </button>
                              </td>
                              <td className="px-5 py-4">
                                <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.7rem] font-semibold text-[#35546c]">
                                  {lead.sourceLabel}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${statusClass(lead.statusGroup)}`}>
                                  {lead.statusLabel}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                {lead.contactedAt ? (
                                  <>
                                    <p className="font-semibold text-[#243d56]">{formatOverviewTimestamp(lead.contactedAt)}</p>
                                    <p className="mt-1 text-xs text-[#607387]">by {lead.contactedBy || 'Agent'}</p>
                                  </>
                                ) : <span className="text-[#9aa9b8]">—</span>}
                              </td>
                              <td className="px-5 py-4">
                                {lead.viewing ? (
                                  <>
                                    <p className="font-semibold text-[#243d56]">{formatDate(lead.viewing.proposed_date)}</p>
                                    <p className="mt-1 text-xs text-[#607387]">{lead.viewing.proposed_time || 'Time pending'}</p>
                                    <p className="mt-1 text-xs font-semibold text-[#1f7d44]">{formatViewingStatusLabel(lead.viewing.status)}</p>
                                  </>
                                ) : <span className="text-[#9aa9b8]">—</span>}
                              </td>
                              <td className="px-5 py-4">
                                {lead.offer ? (
                                  <>
                                    <p className="font-semibold text-[#142132]">{lead.offer.offerPrice ? formatMoneyValue(lead.offer.offerPrice) : '—'}</p>
                                    <p className="mt-1 text-xs text-[#607387]">{formatStatusLabel(lead.offer.status)}</p>
                                  </>
                                ) : <span className="text-[#9aa9b8]">—</span>}
                              </td>
                              <td className="px-5 py-4 font-semibold text-[#607387]">{formatOverviewTimestamp(lead.createdAt)}</td>
                              <td className="px-5 py-4">
                                <div className="flex justify-end gap-2">
                                  <button type="button" onClick={() => handleContactListingLead(lead)} className="grid h-9 w-9 place-items-center rounded-xl border border-[#dbe6f2] bg-white text-[#1f4f78] transition hover:border-[#b7c8db] hover:bg-[#f7fbff]" aria-label={`Contact ${lead.name}`} title="Contact lead">
                                    <MessageSquare size={15} />
                                  </button>
                                  <details className="group relative">
                                    <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-xl border border-[#dbe6f2] bg-white text-[#1f4f78] transition hover:border-[#b7c8db] hover:bg-[#f7fbff] [&::-webkit-details-marker]:hidden" aria-label={`Lead actions for ${lead.name}`} title="Actions">
                                      <MoreVertical size={15} />
                                    </summary>
                                    <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-[14px] border border-[#dbe6f2] bg-white p-1.5 shadow-[0_16px_30px_rgba(15,23,42,0.14)]">
                                      <button type="button" onClick={() => lead.leadId && navigate(`/pipeline/leads/${lead.leadId}`)} disabled={!lead.leadId} className="flex min-h-9 w-full items-center rounded-[10px] px-3 text-left text-xs font-semibold text-[#243d56] hover:bg-[#f7fbff] disabled:opacity-50">
                                        Open lead
                                      </button>
                                      <button type="button" onClick={() => { setActiveTab('pipeline'); setShowViewingForm(true) }} className="flex min-h-9 w-full items-center rounded-[10px] px-3 text-left text-xs font-semibold text-[#243d56] hover:bg-[#f7fbff]">
                                        Schedule viewing
                                      </button>
                                      <button type="button" onClick={() => setActiveTab('offers')} className="flex min-h-9 w-full items-center rounded-[10px] px-3 text-left text-xs font-semibold text-[#243d56] hover:bg-[#f7fbff]">
                                        Open offers
                                      </button>
                                    </div>
                                  </details>
                                </div>
                              </td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={8} className="px-5 py-10 text-center text-sm text-[#607387]">No leads match the current filters.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="grid gap-3 p-4 lg:hidden">
                      {visibleListingLeadRows.length ? visibleListingLeadRows.map((lead) => (
                        <article key={lead.leadId || lead.id} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eef5fb] text-xs font-semibold text-[#1f4f78]">{getInitials(lead.name)}</span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#22374d]">{lead.name}</p>
                                <p className="mt-1 truncate text-xs text-[#607387]">{lead.phone || lead.email || 'Contact pending'}</p>
                              </div>
                            </div>
                            <button type="button" onClick={() => handleContactListingLead(lead)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#dbe6f2] bg-white text-[#1f4f78]">
                              <MessageSquare size={15} />
                            </button>
                          </div>
                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <CompactSnapshotRow label="Source" value={lead.sourceLabel} />
                            <CompactSnapshotRow label="Status" value={lead.statusLabel} />
                            <CompactSnapshotRow label="Contacted" value={lead.contactedAt ? formatOverviewTimestamp(lead.contactedAt) : '—'} />
                            <CompactSnapshotRow label="Viewing" value={lead.viewing ? `${formatDate(lead.viewing.proposed_date)} ${formatViewingStatusLabel(lead.viewing.status)}` : '—'} />
                            <CompactSnapshotRow label="Offer" value={lead.offer?.offerPrice ? formatMoneyValue(lead.offer.offerPrice) : '—'} />
                            <CompactSnapshotRow label="Date added" value={formatOverviewTimestamp(lead.createdAt)} />
                          </div>
                        </article>
                      )) : (
                        <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#607387]">No leads match the current filters.</div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 border-t border-[#e5edf6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-[#607387]">
                        Showing {filteredListingLeadRows.length ? ((listingLeadPage - 1) * listingLeadPageSize) + 1 : 0} to {Math.min(listingLeadPage * listingLeadPageSize, filteredListingLeadRows.length)} of {filteredListingLeadRows.length} leads
                      </p>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setListingLeadPage((page) => Math.max(1, page - 1))} disabled={listingLeadPage <= 1} className="grid h-9 w-9 place-items-center rounded-lg border border-[#dbe6f2] bg-white text-[#1f4f78] disabled:opacity-40">
                          <ChevronLeft size={15} />
                        </button>
                        <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-[#b8d8cc] bg-[#f2fbf7] px-3 text-sm font-semibold text-[#1f7d44]">{listingLeadPage}</span>
                        <span className="text-sm font-semibold text-[#7b8ca2]">of {listingLeadPageCount}</span>
                        <button type="button" onClick={() => setListingLeadPage((page) => Math.min(listingLeadPageCount, page + 1))} disabled={listingLeadPage >= listingLeadPageCount} className="grid h-9 w-9 place-items-center rounded-lg border border-[#dbe6f2] bg-white text-[#1f4f78] disabled:opacity-40">
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="px-5 py-12 text-center">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-[16px] bg-[#eef5fb] text-[#1f4f78]">
                      <Users size={20} />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-[#142132]">No leads yet</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#607387]">Buyer enquiries for this listing will appear here as they come in.</p>
                    <Button type="button" className="mt-5" onClick={openShowDayCaptureModal}>
                      <Plus size={14} />
                      Add Lead
                    </Button>
                  </div>
                )}
              </article>
            </section>
          ) : null}

          {sellerWorkspaceTab === 'seller' ? (() => {
            const getSection = (key) => sellerProfile.sections.find((section) => section.key === key) || { rows: [] }
            const getRow = (sectionKey, rowKey) => getSection(sectionKey).rows.find((row) => row.key === rowKey) || null
            const rowValue = (sectionKey, rowKey) => presentSellerWorkspaceValue(getRow(sectionKey, rowKey)?.value)
            const rowHasValue = (sectionKey, rowKey) => isSellerProfileFilled(getRow(sectionKey, rowKey)?.rawValue)
            const completedDocumentCount = sellerDocumentExperienceItems.filter(isListingDocumentComplete).length
            const documentTotalCount = sellerDocumentExperienceItems.length
            const signedMandateUrl = mandateWorkspace.signedUrl || (mandateWorkspace.isSigned ? mandateWorkspace.viewUrl : '')
            const findDocumentComplete = (pattern) =>
              sellerDocumentExperienceItems.some((document) => pattern.test([
                document?.key,
                document?.label,
                document?.sourceLabel,
                document?.status,
              ].map((value) => String(value || '').toLowerCase()).join(' ')) && isListingDocumentComplete(document))
            const onboardingItems = [
              {
                label: 'Seller details',
                complete: rowHasValue('seller_details', 'fullName') && rowHasValue('seller_details', 'sellerType'),
              },
              {
                label: 'Contact details',
                complete: rowHasValue('contact_details', 'email') || rowHasValue('contact_details', 'phone'),
              },
              {
                label: 'Property ownership',
                complete: rowHasValue('property_ownership', 'propertyAddress') || rowHasValue('property_ownership', 'ownershipType'),
              },
              {
                label: 'FICA information',
                complete: overviewSellerSnapshot.ficaStatusKey === 'complete' || findDocumentComplete(/fica|identity|proof of residential address|proof of address/),
              },
              {
                label: 'Property disclosure',
                complete: findDocumentComplete(/disclosure|defects|condition/),
              },
              {
                label: 'Supporting documents',
                complete: completedDocumentCount > 0,
              },
              {
                label: 'POPI consent',
                complete: rowHasValue('mandate_details', 'popiConsent'),
              },
            ]
            const onboardingCompleteCount = onboardingItems.filter((item) => item.complete).length
            const sellerInformationGroups = [
              {
                title: 'Personal',
                rows: [
                  ['Full name', rowValue('seller_details', 'fullName')],
                  ['ID / Registration', rowValue('seller_details', 'idNumber')],
                  ['Seller type', rowValue('seller_details', 'sellerType')],
                  ['Marital status', rowValue('seller_details', 'maritalStatus')],
                ],
              },
              {
                title: 'Contact',
                rows: [
                  ['Email', rowValue('contact_details', 'email')],
                  ['Mobile', rowValue('contact_details', 'phone')],
                  ['Alternative contact', rowValue('contact_details', 'alternativeContact')],
                  ['Preferred contact', rowValue('contact_details', 'preferredContactMethod')],
                ],
              },
              {
                title: 'Property & Ownership',
                rows: [
                  ['Property address', rowValue('property_ownership', 'propertyAddress')],
                  ['Ownership type', rowValue('property_ownership', 'ownershipType')],
                  ['Title deed number', rowValue('property_ownership', 'titleDeedNumber')],
                  ['Bond holder', rowValue('property_ownership', 'bondHolder')],
                  ['Outstanding bond', rowValue('property_ownership', 'outstandingBond')],
                  ['Co-owner details', rowValue('property_ownership', 'coOwnerDetails')],
                ],
              },
            ]
            const mandateRows = [
              ['Mandate type', rowValue('mandate_details', 'mandateType')],
              ['Asking price', rowValue('mandate_details', 'askingPrice')],
              ['Start date', rowValue('mandate_details', 'mandateStartDate')],
              ['Expiry date', rowValue('mandate_details', 'expiryDate')],
              ['Commission', rowValue('mandate_details', 'commissionPreference')],
              ['Mandate terms', rowValue('mandate_details', 'mandateTerms')],
              ['POPI consent', rowValue('mandate_details', 'popiConsent')],
            ]
            const notesRows = [
              ['Reason for selling', rowValue('notes', 'sellingReason')],
              ['Selling timeline', rowValue('notes', 'sellingTimeline')],
              ['Special conditions', rowValue('notes', 'specialConditions')],
              ['Agent notes', rowValue('notes', 'notes')],
            ]
            const visibleDocumentRows = sellerDocumentExperienceItems.slice(0, 7)
            const statusDotClass = (complete, required = true) => {
              if (complete) return 'bg-[#1f9d61]'
              return required ? 'bg-[#f29f33]' : 'bg-[#aebdca]'
            }
            return (
              <section className="space-y-5">
                <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] bg-[#073f30] text-xl font-semibold text-white shadow-[0_14px_28px_rgba(7,63,48,0.18)]">
                        {sellerProfile.initials}
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => navigate('/listings')}
                          className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[#5f7894] hover:text-[#1f4f78]"
                        >
                          <ArrowLeft size={13} />
                          Back to Listings
                        </button>
                        <h2 className="break-words text-2xl font-semibold tracking-[-0.03em] text-[#142132]">{presentSellerWorkspaceValue(sellerProfile.name, 'Seller not provided')}</h2>
                        <p className="mt-1 text-sm font-semibold text-[#607387]">{presentSellerWorkspaceValue(sellerProfile.type)}</p>
                        <p className="mt-2 break-words text-sm leading-5 text-[#425970]">{presentSellerWorkspaceValue(sellerProfile.propertyAddress)}</p>
                      </div>
                    </div>
                    <div className="grid min-w-0 gap-5 sm:grid-cols-3 xl:min-w-[620px]">
                      {[
                        { label: 'Mandate type', value: sellerProfile.mandateType },
                        { label: 'Asking price', value: sellerProfile.askingPrice },
                        { label: 'Seller onboarding', value: `${sellerProfile.completionPercent}% complete` },
                      ].map((item) => (
                        <div key={item.label} className="min-w-0 border-t border-[#e5edf6] pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8294aa]">{item.label}</p>
                          <p className="mt-1 break-words text-base font-semibold leading-6 text-[#142132]">{presentSellerWorkspaceValue(item.value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="h-2.5 overflow-hidden rounded-full bg-[#e5edf6]">
                        <div className="h-full rounded-full bg-[#168452]" style={{ width: `${sellerProfile.completionPercent}%` }} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button size="sm" onClick={() => openSellerProfileBuilder('Complete the seller profile from the listing workspace.')}>
                        <UserRound size={15} />
                        Continue Seller Onboarding
                      </Button>
                      <Button size="sm" onClick={openSellerPortalActivationModal} disabled={sellerPortalActivationSending || resendingSellerPortalLink || sellerPortalAccessState?.linkActive === false}>
                        <Link2 size={15} />
                        {sellerPortalActivationSending ? 'Sending...' : 'Send Portal Link'}
                      </Button>
                      <details className="group relative">
                        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] transition hover:border-[#b7c8db] hover:bg-[#f7fbff] [&::-webkit-details-marker]:hidden">
                          <MoreVertical size={15} />
                          Actions
                        </summary>
                        <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-[16px] border border-[#dbe6f2] bg-white p-1.5 shadow-[0_18px_34px_rgba(15,23,42,0.14)]">
                          <button
                            type="button"
                            onClick={handleEditSellerProfile}
                            className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm font-semibold text-[#243d56] transition hover:bg-[#f7fbff]"
                          >
                            <Pencil size={15} />
                            Edit contact
                          </button>
                          <button
                            type="button"
                            onClick={handleDownloadSellerProfilePdf}
                            className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm font-semibold text-[#243d56] transition hover:bg-[#f7fbff]"
                          >
                            <Download size={15} />
                            Download PDF
                          </button>
                          <div className="my-1 h-px bg-[#eef3f8]" />
                          <button
                            type="button"
                            onClick={() => void handleResetSellerPortalPasswordAndResend()}
                            disabled={resettingSellerPortalPassword || resendingSellerPortalLink || sellerPortalAccessState?.linkActive === false || !resolveSellerPortalTokenFromListing(listingRecord)}
                            className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm font-semibold text-[#243d56] transition hover:bg-[#f7fbff] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ShieldCheck size={15} />
                            {resettingSellerPortalPassword ? 'Resetting...' : 'Reset portal password'}
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>
                </article>

                {sellerContactEditorOpen ? (
                  <form className="rounded-[24px] border border-[#bcd5ea] bg-[#f7fbff] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.045)]" onSubmit={handleSaveSellerContact}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-[#142132]">Seller contact details</h3>
                        <p className="mt-1 text-sm text-[#607387]">Save contact details before onboarding. A seller email or phone number is required to send the link.</p>
                      </div>
                      <span className="rounded-full border border-[#cfe0ee] bg-white px-3 py-1 text-xs font-semibold text-[#35546c]">No portal link required</span>
                    </div>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
                        Contact first name
                        <Field
                          value={sellerContactDraft.firstName}
                          onChange={(event) => setSellerContactDraft((previous) => ({ ...previous, firstName: event.target.value }))}
                          placeholder="Jane"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
                        Contact surname
                        <Field
                          value={sellerContactDraft.lastName}
                          onChange={(event) => setSellerContactDraft((previous) => ({ ...previous, lastName: event.target.value }))}
                          placeholder="Smith"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
                        Email address
                        <Field
                          type="email"
                          value={sellerContactDraft.email}
                          onChange={(event) => setSellerContactDraft((previous) => ({ ...previous, email: event.target.value }))}
                          placeholder="seller@example.com"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
                        Mobile or phone
                        <Field
                          type="tel"
                          value={sellerContactDraft.phone}
                          onChange={(event) => setSellerContactDraft((previous) => ({ ...previous, phone: event.target.value }))}
                          placeholder="082 000 0000"
                        />
                      </label>
                    </div>
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => setSellerContactEditorOpen(false)} disabled={sellerContactSaving}>
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={sellerContactSaving}>
                        {sellerContactSaving ? 'Saving...' : 'Save Seller Contact'}
                      </Button>
                    </div>
                  </form>
                ) : null}

                <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]">
                  <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#ecfaf1] text-[#1f7d44]">
                          <UserRound size={18} />
                        </span>
                        <h3 className="min-w-0 break-words text-base font-semibold text-[#142132]">Seller Information</h3>
                      </div>
                      <Button type="button" size="sm" variant="secondary" onClick={() => openSellerProfileBuilder('Update seller information from the listing workspace.')}>
                        <Pencil size={14} />
                        Edit
                      </Button>
                    </div>
                    <div className="mt-5 space-y-5">
                      {sellerInformationGroups.map((group) => (
                        <div key={group.title}>
                          <h4 className="text-xs font-semibold text-[#243d56]">{group.title}</h4>
                          <div className="mt-2 divide-y divide-[#edf2f7]">
                            {group.rows.map(([label, value]) => (
                              <div key={`${group.title}-${label}`} className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] gap-3 py-2">
                                <span className="text-xs font-semibold text-[#6b7d93]">{label}</span>
                                <span className="break-words text-right text-sm font-semibold leading-5 text-[#243d56]">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#ecfaf1] text-[#1f7d44]">
                          <FileText size={18} />
                        </span>
                        <h3 className="min-w-0 break-words text-base font-semibold text-[#142132]">Mandate</h3>
                      </div>
                      <Button type="button" size="sm" variant="secondary" onClick={() => openSellerSectionEditor(getSection('mandate_details'))}>
                        <Pencil size={14} />
                        Edit
                      </Button>
                    </div>
                    <div className="mt-5 divide-y divide-[#edf2f7]">
                      {mandateRows.map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] gap-3 py-2">
                          <span className="text-xs font-semibold text-[#6b7d93]">{label}</span>
                          <span className="break-words text-right text-sm font-semibold leading-5 text-[#243d56]">{value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 border-t border-[#edf2f7] pt-4">
                      <p className="text-xs font-semibold text-[#243d56]">Mandate document</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] px-3 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[12px] ${mandateWorkspace.isSigned ? 'bg-[#ecfaf1] text-[#1f7d44]' : 'bg-[#f8fbff] text-[#7b8ca2]'}`}>
                            <FileText size={16} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#243d56]">{mandateWorkspace.isSigned ? 'Signed mandate' : 'Signed mandate not uploaded'}</p>
                            <p className="mt-0.5 text-xs text-[#607387]">{mandateWorkspace.signedDate ? `Signed ${formatDate(mandateWorkspace.signedDate)}` : 'Upload hard-copy evidence when available'}</p>
                          </div>
                        </div>
                        {signedMandateUrl ? (
                          <button
                            type="button"
                            onClick={() => window.open(signedMandateUrl, '_blank', 'noopener,noreferrer')}
                            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#1f4f78] transition hover:border-[#b7c8db] hover:bg-[#f7fbff]"
                          >
                            <ExternalLink size={14} />
                            Open
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openSellerWorkspaceSection('documents')}
                            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#1f4f78] transition hover:border-[#b7c8db] hover:bg-[#f7fbff]"
                          >
                            <Upload size={14} />
                            Upload
                          </button>
                        )}
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#ecfaf1] text-[#1f7d44]">
                        <ShieldCheck size={18} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="break-words text-base font-semibold text-[#142132]">Seller Onboarding</h3>
                        <p className="mt-1 text-sm font-semibold text-[#243d56]">{onboardingCompleteCount} of {onboardingItems.length} completed</p>
                      </div>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e5edf6]">
                      <div className="h-full rounded-full bg-[#168452]" style={{ width: `${Math.round((onboardingCompleteCount / onboardingItems.length) * 100)}%` }} />
                    </div>
                    <div className="mt-5 space-y-3">
                      {onboardingItems.map((item) => (
                        <div key={item.label} className="flex items-center gap-3">
                          {item.complete ? (
                            <CheckCircle2 size={16} className="shrink-0 text-[#1f9d61]" />
                          ) : (
                            <span className="h-4 w-4 shrink-0 rounded-full border border-[#c7d5e3]" />
                          )}
                          <span className="text-sm font-semibold text-[#425970]">{item.label}</span>
                        </div>
                      ))}
                    </div>
                    <Button type="button" size="sm" className="mt-6 w-full justify-center" onClick={() => openSellerProfileBuilder('Continue the seller onboarding from the listing workspace.')}>
                      Continue Onboarding
                    </Button>
                  </article>
                </section>

                <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
                  <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#ecfaf1] text-[#1f7d44]">
                          <ShieldCheck size={18} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="break-words text-base font-semibold text-[#142132]">Documents & Compliance</h3>
                          <p className="mt-1 text-sm font-semibold text-[#607387]">{completedDocumentCount} of {documentTotalCount} complete</p>
                        </div>
                      </div>
                      <StatusPill status={documentTotalCount && completedDocumentCount === documentTotalCount ? 'complete' : completedDocumentCount ? 'in_progress' : 'pending'} label={documentTotalCount ? `${Math.round((completedDocumentCount / documentTotalCount) * 100)}%` : 'No docs'} />
                    </div>
                    <div className="mt-5 divide-y divide-[#edf2f7]">
                      {visibleDocumentRows.length ? visibleDocumentRows.map((document) => {
                        const complete = isListingDocumentComplete(document)
                        return (
                          <div key={document.key || document.id || document.label} className="flex items-center justify-between gap-3 py-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(complete, document.required !== false)}`} />
                              <span className="min-w-0 break-words text-sm font-semibold leading-5 text-[#243d56]">{document.label}</span>
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-[#607387]">{complete ? 'Complete' : document.required === false ? 'Not provided' : 'Outstanding'}</span>
                          </div>
                        )
                      }) : (
                        <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#607387]">
                          No seller documents have been requested yet.
                        </div>
                      )}
                    </div>
                    <Button type="button" size="sm" variant="secondary" className="mt-5" onClick={() => openSellerWorkspaceSection('documents')}>
                      <Upload size={14} />
                      Upload Documents
                    </Button>
                  </article>

                  <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#ecfaf1] text-[#1f7d44]">
                          <Info size={18} />
                        </span>
                        <h3 className="min-w-0 break-words text-base font-semibold text-[#142132]">Notes & Special Conditions</h3>
                      </div>
                      <Button type="button" size="sm" variant="secondary" onClick={() => openSellerSectionEditor(getSection('notes'))}>
                        <Pencil size={14} />
                        Edit
                      </Button>
                    </div>
                    <div className="mt-5 divide-y divide-[#edf2f7]">
                      {notesRows.map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)] gap-3 py-3">
                          <span className="text-xs font-semibold text-[#6b7d93]">{label}</span>
                          <span className="break-words text-sm font-semibold leading-5 text-[#243d56]">{value}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                </section>
              </section>
            )
          })() : null}

          {sellerWorkspaceTab === 'marketing' ? renderMarketingConsole() : null}

          {sellerWorkspaceTab === 'documents' ? (
            <section className="space-y-5">
              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[#142132]">Seller Document Centre</h3>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-[#607387]">
                      Documents are grouped the same way the seller sees them in the portal, so FICA, property records, sale documents, and requests are easy to review.
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-[#dbe6f2] bg-[#f8fbfd] px-3 py-1.5 text-xs font-semibold text-[#607387]">
                    {sellerDocumentTrackerRows.length} total
                  </span>
                </div>
                <div className="mt-5 overflow-x-auto">
                  <nav className="inline-flex min-w-full gap-2 rounded-[18px] border border-[#e2eaf3] bg-[#f8fbff] p-2" aria-label="Listing document categories">
                    {listingDocumentGroups.map((group) => {
                      const isActive = activeListingDocumentGroup?.key === group.key
                      const completeCount = group.documents.filter(isListingDocumentComplete).length
                      return (
                        <button
                          key={group.key}
                          type="button"
                          onClick={() => setActiveListingDocumentTab(group.key)}
                          className={`inline-flex min-h-[44px] min-w-[180px] items-center justify-center rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
                            isActive
                              ? 'border border-[#d1deeb] bg-white text-[#142132] shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
                              : 'border border-transparent text-[#5f7086] hover:border-[#d8e4ef] hover:bg-white hover:text-[#142132]'
                          }`}
                        >
                          <span className="truncate">{group.label}</span>
                          <span className="ml-2 inline-flex min-w-[32px] items-center justify-center rounded-full border border-[#dce6f0] bg-white px-1.5 py-0.5 text-[0.68rem] font-semibold text-[#5f7086]">
                            {completeCount}/{group.documents.length}
                          </span>
                        </button>
                      )
                    })}
                  </nav>
                </div>
              </article>

              {activeListingDocumentGroup ? (() => {
                const group = activeListingDocumentGroup
                const GroupIcon = group.icon
                const completeCount = group.documents.filter(isListingDocumentComplete).length
                return (
                  <article key={group.key} className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[15px] border ${group.toneClasses}`}>
                          <GroupIcon size={19} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-[#142132]">{group.label}</h3>
                          <p className="mt-1 text-sm leading-6 text-[#607387]">{group.description}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-[#dbe6f2] bg-[#f8fbfd] px-3 py-1.5 text-xs font-semibold text-[#607387]">
                        {completeCount} of {group.documents.length} complete
                      </span>
                    </div>

                    {group.documents.length ? (
                      <div className="mt-5 grid gap-3 lg:grid-cols-2">
                        {group.documents.map((doc) => (
                          <div key={doc.key} className="rounded-[18px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="break-words text-sm font-semibold leading-5 text-[#243d56]">{doc.label}</p>
                                <p className="mt-1 text-xs leading-5 text-[#74879d]">
                                  {doc.required ? 'Required seller document' : 'Optional seller document'}
                                </p>
                              </div>
                              <StatusPill status={doc.status} label={doc.statusLabel || formatStatusLabel(doc.status)} />
                            </div>
                            <div className="mt-4 grid gap-2 text-xs leading-5 text-[#607387] sm:grid-cols-2">
                              <p>
                                <span className="font-semibold text-[#425970]">Source:</span>{' '}
                                {doc.sourceLabel || (doc.uploaded ? 'Seller portal / linked document' : 'Requirement checklist')}
                              </p>
                              <p>
                                <span className="font-semibold text-[#425970]">Uploaded:</span>{' '}
                                {doc.uploadedOn ? formatDate(doc.uploadedOn) : 'Not uploaded'}
                              </p>
                              {doc.fileName ? (
                                <p className="min-w-0 sm:col-span-2">
                                  <span className="font-semibold text-[#425970]">File:</span>{' '}
                                  <span className="break-words">{doc.fileName}</span>
                                </p>
                              ) : null}
                            </div>
                            {doc.reviewSla ? (() => {
                              const sla = getSellerDocumentSlaPresentation(doc.reviewSla)
                              return sla ? (
                                <div className={`mt-3 rounded-[12px] border px-3 py-2 text-xs font-semibold ${sla.classes}`} role={doc.reviewSla.blocking ? 'alert' : 'status'}>
                                  {sla.label}{doc.reviewSla.reviewDueAt ? ` · Due ${formatDate(doc.reviewSla.reviewDueAt)}` : ''}
                                </div>
                              ) : null
                            })() : null}
                            <div className="mt-4 flex flex-wrap justify-end gap-2">
                              <label className={`inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#1f4f78] transition ${sellerDocumentUploadKey ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-[#b7c8db] hover:bg-[#f7fbff]'}`}>
                                {sellerDocumentUploadKey === (doc.key || doc.id || doc.label) ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                {doc.uploaded ? 'Replace' : 'Upload'}
                                <input
                                  type="file"
                                  className="hidden"
                                  disabled={Boolean(sellerDocumentUploadKey)}
                                  onChange={(event) => void handleSellerDocumentUpload(doc, event)}
                                />
                              </label>
                              {doc.url || doc.filePath || doc.generatedHtml || (doc.packetId && doc.packetVersionId) ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSellerDocument(doc)}
                                  disabled={openingSellerDocumentKey === doc.key}
                                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#1f4f78] transition hover:border-[#b7c8db] hover:bg-[#f7fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {openingSellerDocumentKey === doc.key ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                                  Download
                                </button>
                              ) : (
                                <span className="inline-flex min-h-9 items-center rounded-lg border border-dashed border-[#dbe6f2] px-3 text-xs font-semibold text-[#9aa9b8]">
                                  Awaiting upload
                                </span>
                              )}
                            </div>
                            <SellerDocumentReviewActions
                              item={doc}
                              busyAction={sellerDocumentWorkflowAction}
                              onReview={handleSellerDocumentReview}
                              onReminder={handleSellerDocumentReminder}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-5 rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-5 text-sm leading-6 text-[#607387]">
                        No documents in this group yet.
                      </div>
                    )}
                  </article>
                )
              })() : null}
            </section>
          ) : null}

          {sellerWorkspaceTab === 'commission' ? (
            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-[#142132]">Commission Details</h3>
                  <p className="mt-1 text-sm text-[#607387]">Edit the canonical mandate commercial terms used by the seller profile and document workflows.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill status={commissionWorkspace.hasData ? 'done' : 'pending'} label={commissionWorkspace.hasData ? 'Captured' : 'Not captured'} />
                  <Button size="sm" onClick={() => void saveCommissionDraft()} disabled={savingCommission}>
                    <FileText size={15} />
                    {savingCommission ? 'Saving...' : 'Save Commission Details'}
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Commission Percentage</span>
                  <Field
                    type="number"
                    min="0"
                    step="0.01"
                    value={commissionDraft.percentage}
                    onChange={(event) => updateCommissionDraft('percentage', event.target.value)}
                    placeholder="5"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Commission Amount</span>
                  <Field
                    type="number"
                    min="0"
                    step="1000"
                    value={commissionDraft.amount}
                    onChange={(event) => updateCommissionDraft('amount', event.target.value)}
                    placeholder={commissionWorkspace.estimatedExVat ? String(Math.round(commissionWorkspace.estimatedExVat)) : '0'}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">VAT Handling</span>
                  <Field as="select" value={commissionDraft.vatHandling} onChange={(event) => updateCommissionDraft('vatHandling', event.target.value)}>
                    <option value="">Not captured</option>
                    <option value="no">No VAT</option>
                    <option value="exclusive">VAT Exclusive</option>
                    <option value="inclusive">VAT Inclusive</option>
                  </Field>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Mandate Terms</span>
                  <Field
                    value={commissionDraft.mandateTerms}
                    onChange={(event) => updateCommissionDraft('mandateTerms', event.target.value)}
                    placeholder="Sole mandate, payable on registration"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Payment Responsibility</span>
                  <Field as="select" value={commissionDraft.paymentResponsibility} onChange={(event) => updateCommissionDraft('paymentResponsibility', event.target.value)}>
                    <option value="">Not captured</option>
                    <option value="seller">Seller</option>
                    <option value="buyer">Buyer</option>
                    <option value="split">Split</option>
                    <option value="agency">Agency</option>
                  </Field>
                </label>
                <FieldDisplay label="Last Updated Source" value={commissionWorkspace.lastUpdatedSource} />
              </div>

              <label className="mt-5 grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Notes or Special Conditions</span>
                <Field
                  as="textarea"
                  rows={5}
                  value={commissionDraft.notes}
                  onChange={(event) => updateCommissionDraft('notes', event.target.value)}
                  placeholder="Capture any commission notes, exclusions, or special mandate conditions."
                />
              </label>

              <div className="mt-5 grid gap-3 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4 md:grid-cols-3">
                <FieldDisplay label="Estimated Ex VAT" value={commissionDraftPreview.estimatedExVat ? formatMoneyValue(commissionDraftPreview.estimatedExVat) : 'Not captured'} />
                <FieldDisplay label="Estimated Incl VAT" value={commissionDraftPreview.estimatedInclVat ? formatMoneyValue(commissionDraftPreview.estimatedInclVat) : 'Not captured'} />
                <FieldDisplay label="Sync Target" value="Seller profile, mandate data, and seller portal source fields" />
              </div>
            </article>
          ) : null}

          {sellerWorkspaceTab === 'activity' ? (
            <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
              <div className="space-y-3">
                {mandateActivityItems.length ? mandateActivityItems.map((item) => {
                  const Icon = item.icon || FolderKanban
                  return (
                    <div key={`${item.title}-${item.timestamp}`} className="flex gap-3 rounded-[16px] border border-[#e5edf6] bg-[#fbfdff] px-4 py-3">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[11px] bg-[#eaf3fb] text-[#1f4f78]">
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#243d56]">{item.title}</p>
                        <p className="mt-0.5 text-sm text-[#607387]">{item.copy}</p>
                        <p className="mt-1 text-xs text-[#91a2b5]">{formatDate(item.timestamp)}</p>
                      </div>
                    </div>
                  )
                }) : (
                  <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93]">
                    No activity has been recorded for this mandate workspace yet.
                  </div>
                )}
              </div>
            </article>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <section className="space-y-5">
          {sellerDocumentRequirementModel ? (
            <section data-testid="listing-seller-document-model-summary" className="rounded-[24px] border border-[#dbe6f2] bg-[#f7fbff] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b7d93]">Seller requirement model</p>
                  <h3 className="mt-1 text-base font-semibold text-[#142132]">{sellerDocumentRequirementModel.branchLabel}</h3>
                  <p className="mt-1 text-sm leading-6 text-[#607387]">
                    {sellerDocumentRequirementModel.total} active seller requirements for {sellerDocumentRequirementModel.propertyStructureLabel}.
                    {' '}{sellerDocumentRequirementModel.sellerVisible} seller-visible and {sellerDocumentRequirementModel.internal} internal.
                    {sellerDocumentRequirementModel.retired ? ` ${sellerDocumentRequirementModel.retired} retired requirement${sellerDocumentRequirementModel.retired === 1 ? '' : 's'} kept for history.` : ''}
                  </p>
                </div>
                <Button type="button" size="sm" onClick={() => openSellerProfileBuilder('Update the seller model and preview the document impact before saving.')}>
                  <UserRound size={15} />
                  Update Seller Model
                </Button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {sellerDocumentRequirementModel.groups.map((group) => (
                  <div key={group.key} className="rounded-[16px] border border-[#dce6f2] bg-white px-4 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{group.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-[#142132]">{group.count}</p>
                  </div>
                ))}
              </div>
              {sellerDocumentRequirementModel.retiredRows.length ? (
                <div data-testid="listing-seller-retired-requirements" className="mt-5 rounded-[16px] border border-[#f0ddbf] bg-[#fffaf1] p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#6f4b16]">Retired requirements</p>
                      <p className="mt-1 text-xs leading-5 text-[#8a6a35]">
                        Kept as not applicable because the saved seller model changed.
                      </p>
                    </div>
                    <span className="w-fit rounded-full border border-[#efd9b0] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#8a6a35]">
                      {sellerDocumentRequirementModel.retiredRows.length}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {sellerDocumentRequirementModel.retiredRows.slice(0, 6).map((row) => (
                      <div key={row.requirement_key || row.key} className="flex items-start justify-between gap-3 rounded-[10px] border border-[#f0ddbf] bg-white px-3 py-2 text-xs leading-5">
                        <span className="font-semibold text-[#6f4b16]">{row.requirement_name || row.label}</span>
                        <span className="shrink-0 text-[#9a7a45]">Not applicable</span>
                      </div>
                    ))}
                  </div>
                  {sellerDocumentRequirementModel.retiredRows.length > 6 ? (
                    <p className="mt-2 text-xs font-semibold text-[#9a7a45]">+{sellerDocumentRequirementModel.retiredRows.length - 6} more retired requirements</p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {sellerReadinessSummary ? (
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <h3 className="text-[1rem] font-semibold text-[#142132]">Seller Requirement Summary</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
                <MetricCard label="Approved" value={`${sellerDocumentExperience.summary.assurancePercent}%`} meta={`${sellerDocumentExperience.summary.approved}/${sellerDocumentExperience.summary.total} assured`} />
                <MetricCard label="Received" value={`${sellerDocumentExperience.summary.collectionPercent}%`} meta="Includes review queue" />
                <MetricCard label="Seller action" value={sellerDocumentExperience.summary.actionRequired} meta={`${sellerDocumentExperience.summary.overdue} overdue`} />
                <MetricCard label="Review queue" value={sellerDocumentExperience.summary.reviewRequired} meta="Approve or reject" />
                <MetricCard label="Rejected" value={sellerDocumentExperience.summary.rejected} meta="Correction required" />
                <MetricCard label="Handoff issues" value={sellerDocumentExperience.summary.handoffBlocked + sellerDocumentExperience.summary.handoffPending} meta={`${sellerDocumentExperience.summary.handoffReady} transfer-ready`} />
                <MetricCard label="Review SLA" value={sellerDocumentReviewSla.summary.blockingCount + sellerDocumentReviewSla.summary.attentionCount} meta={`${sellerDocumentReviewSla.summary.criticalCount} critical · ${sellerDocumentReviewSla.summary.breachedCount} breached`} />
              </div>
              {sellerDocumentReviewSla.gate.status !== 'pass' ? (
                <div className={`mt-4 rounded-[14px] border px-4 py-3 ${sellerDocumentReviewSla.gate.status === 'blocked' ? 'border-[#f0c8c4] bg-[#fff7f6] text-[#963d35]' : 'border-[#f3d9b0] bg-[#fff9ee] text-[#8f5c18]'}`} role="alert">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em]">Review SLA {sellerDocumentReviewSla.gate.status}</p>
                  <p className="mt-1 text-sm">{sellerDocumentReviewSla.gate.reason}</p>
                </div>
              ) : null}
              {sellerDocumentExperience.nextAction?.message ? (
                <div className="mt-4 rounded-[14px] border border-[#d9e5f0] bg-[#f7fbff] px-4 py-3" role="status">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#47637d]">Next document action{sellerDocumentExperience.nextAction.stageLabel ? ` · ${sellerDocumentExperience.nextAction.stageLabel}` : ''}</p>
                  <p className="mt-1 text-sm font-semibold text-[#243d56]">{sellerDocumentExperience.nextAction.title}</p>
                  <p className="mt-1 text-sm text-[#607387]">{sellerDocumentExperience.nextAction.message}</p>
                </div>
              ) : null}
              {sellerReadinessSummary.blockedBy?.length ? (
                <div className="mt-4 rounded-[14px] border border-[#f3d9b0] bg-[#fff9ee] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8f5c18]">Readiness Blockers</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-[#8f5c18]">
                    {sellerReadinessSummary.blockedBy.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[1rem] font-semibold text-[#142132]">Seller Pack Transaction Handoff</h3>
                  <StatusPill status={sellerPackTransactionSummary.status} label={sellerPackTransactionSummary.label} />
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[#607387]">
                  Tracks whether the signed mandate, signed disclosure / defects form, and signed FICA declaration are complete on the listing and ready for the transaction document stream.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => void handleRepairSellerPackTransactionHandoff()}
                disabled={sellerPackHandoffAction === 'repair' || !isSupabaseConfigured}
                className="inline-flex items-center gap-2"
              >
                {sellerPackHandoffAction === 'repair' ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                Repair Handoff
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {sellerPackTransactionRows.map((row) => (
                <div key={row.key} className={`rounded-[16px] border px-4 py-3 ${row.handoff.classes}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">{row.label}</p>
                      <p className="mt-1 text-xs leading-5 opacity-90">{row.handoff.description}</p>
                    </div>
                    <span className="inline-flex shrink-0 rounded-full border border-current/20 bg-white/55 px-2.5 py-1 text-[0.68rem] font-semibold">
                      {row.handoff.label}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs leading-5 opacity-90">
                    <p>
                      <span className="font-semibold">Listing upload:</span>{' '}
                      {row.document?.uploaded ? 'Uploaded' : 'Missing'}
                    </p>
                    <p>
                      <span className="font-semibold">Transaction copy:</span>{' '}
                      {row.document?.promotedDocumentId || row.document?.promoted_document_id ? 'Linked' : 'Not linked yet'}
                    </p>
                    {row.document?.promotionAttemptedAt || row.document?.promotion_attempted_at ? (
                      <p>
                        <span className="font-semibold">Last attempt:</span>{' '}
                        {formatDate(row.document.promotionAttemptedAt || row.document.promotion_attempted_at)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <MetricCard label="Promoted" value={sellerPackTransactionSummary.promoted} meta={`${sellerPackTransactionSummary.total} required`} />
              <MetricCard label="Queued" value={sellerPackTransactionSummary.queued} meta="Waiting for repair" />
              <MetricCard label="Attention" value={sellerPackTransactionSummary.attention} meta="Needs operator check" />
              <MetricCard label="Missing" value={sellerPackTransactionSummary.missing + sellerPackTransactionSummary.uploadedOnly} meta="Upload or queue required" />
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-3">
          {[
            { title: 'Property Documents', icon: Building2, rows: propertyDocuments },
            { title: 'Seller Documents', icon: ShieldCheck, rows: sellerDocuments },
            { title: 'Buyer Documents', icon: FileText, rows: buyerDocuments },
          ].map((group) => (
            <section key={group.title} className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-3">
                <div className="rounded-[14px] border border-[#dce6f2] bg-[#f7fbff] p-2 text-[#1f4f78]">
                  <group.icon size={18} />
                </div>
                <div>
                  <h3 className="text-[1rem] font-semibold text-[#142132]">{group.title}</h3>
                  <p className="text-sm text-[#607387]">{group.rows.length} item{group.rows.length === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {group.rows.length ? (
                  group.rows.map((doc) => (
                    <article key={doc.key || doc.requirement_key} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#22374d]">{doc.label || doc.requirement_name}</p>
                          <p className="mt-1 text-xs text-[#6b7d93]">{doc.fileName || 'No file linked yet'}</p>
                          {doc.requirement_description ? (
                            <p className="mt-1 text-xs text-[#6b7d93]">{doc.requirement_description}</p>
                          ) : null}
                          {doc.message ? <p className="mt-1 text-xs font-medium text-[#47637d]">{doc.message}</p> : null}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {doc.stageLabel ? <span className="rounded-full border border-[#dbe5ef] bg-white px-2 py-0.5 text-[0.68rem] font-semibold text-[#607387]">{doc.stageLabel}</span> : null}
                            {doc.overdue ? <span className="rounded-full border border-[#f3c2c2] bg-[#fff1f1] px-2 py-0.5 text-[0.68rem] font-semibold text-[#b42318]">Overdue</span> : null}
                            {doc.handoff?.applicable ? <span className="rounded-full border border-[#dbe5ef] bg-white px-2 py-0.5 text-[0.68rem] font-semibold text-[#607387]">{doc.handoff.label}</span> : null}
                          </div>
                        </div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(doc.status)}`}>
                          {doc.statusLabel || formatStatusLabel(doc.status)}
                        </span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-4 text-sm text-[#6b7d93]">
                    No documents in this group yet.
                  </div>
                )}
              </div>
            </section>
          ))}
          </section>
        </section>
      ) : null}

      {activeTab === 'role_players' ? (
        <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <h3 className="text-[1.05rem] font-semibold text-[#142132]">Assign Deal Role Players</h3>
            <p className="mt-1 text-sm text-[#607387]">Choose the downstream attorney and preferred bond originator for when this listing converts into a live transaction.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Attorney</span>
                <Field as="select" value={rolePlayersDraft.attorney} onChange={(event) => setRolePlayersDraft((prev) => ({ ...prev, attorney: event.target.value }))}>
                  {ATTORNEY_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Field>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#2d445e]">Preferred Bond Originator</span>
                <Field as="select" value={rolePlayersDraft.bondOriginator} onChange={(event) => setRolePlayersDraft((prev) => ({ ...prev, bondOriginator: event.target.value }))}>
                  {BOND_ORIGINATOR_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Field>
              </label>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={saveRolePlayers}>Save Role Players</Button>
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <h3 className="text-[1rem] font-semibold text-[#142132]">Current Assignment State</h3>
            <div className="mt-4 space-y-3">
              <article className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-[14px] border border-[#dce6f2] bg-white p-2 text-[#1f4f78]"><FolderKanban size={18} /></div>
                  <div>
                    <p className="text-sm font-semibold text-[#22374d]">{rolePlayersDraft.attorney}</p>
                    <p className="text-sm text-[#607387]">Transfer / legal delivery</p>
                  </div>
                </div>
              </article>
              <article className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-[14px] border border-[#dce6f2] bg-white p-2 text-[#1f4f78]"><HandCoins size={18} /></div>
                  <div>
                    <p className="text-sm font-semibold text-[#22374d]">{rolePlayersDraft.bondOriginator}</p>
                    <p className="text-sm text-[#607387]">Finance workflow partner</p>
                  </div>
                </div>
              </article>
              <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4 text-sm leading-6 text-[#607387]">
                When this listing progresses to a formal deal, these role players become the default participants for transaction workflow access.
              </div>
            </div>
          </section>
        </section>
      ) : null}

      <Modal
        open={sellerPortalActivationOpen}
        onClose={() => !sellerPortalActivationSending && setSellerPortalActivationOpen(false)}
        title="Activate Seller Portal"
        subtitle="Confirm the seller contact and email preview before sending the secure activation invitation."
        footer={(
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setSellerPortalActivationOpen(false)} disabled={sellerPortalActivationSending}>
              Cancel
            </Button>
            <Button type="submit" form="seller-portal-activation-form" disabled={sellerPortalActivationSending || !sellerPortalMandateEvidenceReady}>
              {sellerPortalActivationSending ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        )}
      >
        <form id="seller-portal-activation-form" className="space-y-5" onSubmit={handleActivateSellerPortal}>
          <section className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
              Seller first name
              <Field value={sellerPortalActivationDraft.firstName} onChange={(event) => updateSellerPortalActivationDraft('firstName', event.target.value)} placeholder="Jane" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
              Seller surname
              <Field value={sellerPortalActivationDraft.lastName} onChange={(event) => updateSellerPortalActivationDraft('lastName', event.target.value)} placeholder="Smith" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
              Seller email
              <Field type="email" value={sellerPortalActivationDraft.email} onChange={(event) => updateSellerPortalActivationDraft('email', event.target.value)} placeholder="seller@example.com" required />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
              Seller mobile
              <Field type="tel" value={sellerPortalActivationDraft.phone} onChange={(event) => updateSellerPortalActivationDraft('phone', event.target.value)} placeholder="082 000 0000" />
            </label>
          </section>

          <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
            <h4 className="text-sm font-semibold text-[#142132]">Invitation context</h4>
            <div className="mt-3 grid gap-x-5 md:grid-cols-2">
              <CompactSnapshotRow label="Property" value={listingRecord?.propertyAddress || listingRecord?.formattedAddress || listingRecord?.listingTitle || 'Property pending'} />
              <CompactSnapshotRow label="Agency" value={profile?.organisationName || profile?.companyName || profile?.agencyName || 'Arch9'} />
              <CompactSnapshotRow label="Assigned agent" value={listingActor.name || 'Agent pending'} />
              <CompactSnapshotRow label="Listing status" value={formatStatusLabel(listingRecord?.listingStatus || listingRecord?.status || 'unknown')} />
              <CompactSnapshotRow label="Mandate evidence" value={sellerPortalMandateEvidenceReady ? 'Signed mandate uploaded' : 'Upload required'} />
            </div>
          </section>

          {!sellerPortalMandateEvidenceReady ? (
            <div className="rounded-[18px] border border-[#f2dfbd] bg-[#fff9ec] p-4 text-sm font-semibold leading-6 text-[#7a5a17]">
              Upload the signed mandate to this listing before sending the Seller Portal invitation.
            </div>
          ) : null}

          <section className="rounded-[18px] border border-[#dbe6f2] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b7d93]">Email preview</p>
            <h4 className="mt-2 text-sm font-semibold text-[#142132]">{sellerPortalActivationPreview.subject}</h4>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#425970]">{sellerPortalActivationPreview.body}</p>
          </section>
        </form>
      </Modal>

      <ShowDayLeadCaptureModal
        open={showDayCaptureOpen}
        form={showDayCaptureForm}
        setForm={setShowDayCaptureForm}
        listingTitle={listingRecord?.listingTitle || ''}
        saving={showDayCaptureSaving}
        feedback={showDayCaptureFeedback}
        onClose={closeShowDayCaptureModal}
        onSubmit={submitShowDayCapture}
      />
    </section>
  )
}

export default AgentListingDetail
