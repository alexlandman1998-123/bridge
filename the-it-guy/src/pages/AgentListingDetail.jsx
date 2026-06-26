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
  HandCoins,
  Home,
  ImagePlus,
  Info,
  Eye,
  Loader2,
  MapPin,
  Plus,
  Copy,
  Link2,
  ShieldCheck,
  Star,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import AddressAutocomplete from '../components/location/AddressAutocomplete'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import { useWorkspace } from '../context/WorkspaceContext'
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
  buildSellerOnboardingLink,
  buildSellerClientPortalLink,
  deleteAgentPrivateListingCascade,
  generateId,
  generateSellerOnboardingToken,
  readAgentPrivateListings,
  writeAgentPrivateListings,
} from '../lib/agentListingStorage'
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
import {
  getPrivateListing,
  createPrivateListingDocumentDownloadUrl,
  deletePrivateListing,
  getSellerPortalAccessState,
  resetSellerPortalPassword,
  sendSellerOnboarding,
  syncPrivateListingDistributionData,
  updatePrivateListing,
  updatePrivateListingOnboardingFormData,
  uploadPrivateListingDocument,
  uploadPrivateListingMediaAsset,
} from '../services/privateListingService'
import { listListingLeadInterests } from '../services/leadListingInterestService'
import { listListingPropertyShares } from '../services/leadPropertySharingService'
import { listCommunicationDeliveries } from '../services/communicationDeliveryService'
import { buildListingWorkspaceAnalyticsSummary } from '../services/leadAnalyticsService'
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

const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'property_details', label: 'Property Details' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'offers', label: 'Offers' },
  { key: 'seller', label: 'Seller / Mandate' },
  { key: 'documents', label: 'Documents' },
  { key: 'role_players', label: 'Role Players' },
]

const SELLER_ONBOARDING_EMAIL_TYPES = new Set([
  'seller_onboarding',
  'seller_onboarding_link',
  'seller_onboarding_link_seller',
  'seller_portal_link',
  'seller_portal_link_seller',
  'seller_onboarding_submitted',
  'seller_onboarding_submitted_agent',
])

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
  { key: 'offers', label: 'Offers' },
  { key: 'seller', label: 'Seller' },
  { key: 'listing', label: 'Listing' },
  { key: 'documents', label: 'Documents' },
  { key: 'commission', label: 'Commission' },
  { key: 'activity', label: 'Activity' },
]

function getSellerWorkspaceTabFromSearch(search = '') {
  const requestedTab = new URLSearchParams(String(search || '')).get('tab')
  return SELLER_WORKSPACE_TABS.some((tab) => tab.key === requestedTab) ? requestedTab : ''
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || '').trim())
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
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
const FEATURE_OPTIONS = ['Solar', 'Backup Water', 'Pool', 'Pet Friendly', 'Security', 'Garden', 'Fibre', 'Study', 'Staff Quarters', 'Entertainment Area']
const LISTING_TYPE_OPTIONS = ['Sale', 'Rental']
const PUBLICATION_STATUS_OPTIONS = ['Draft', 'Ready', 'Published', 'Archived']
const AMENITY_OPTIONS = ['Security Estate', 'Clubhouse', 'Kids Play Area', 'Walking Trails', 'Built-in Braai', 'Solar System', 'Staff Accommodation', 'Open Plan Living']
const EXTERNAL_LINK_PLATFORM_OPTIONS = ['Property24', 'Private Property', 'Agency Website', 'Facebook Marketplace', 'Instagram', 'Gumtree', 'Other']
const EXTERNAL_LINK_STATUS_OPTIONS = ['Draft', 'Live', 'Removed', 'Expired']
const PORTAL_STATUS_OPTIONS = ['not_published', 'draft', 'published', 'paused', 'removed']
const ARCH9_PUBLIC_SITE_ORIGIN = 'https://www.arch9.co.za'
const ARCH9_PUBLIC_LISTINGS_API_PATH = '/api/public/listings'

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
  const nextRows = rows.map((row) => {
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
    amenities: Array.isArray(draft.amenities) ? draft.amenities : [],
    petFriendly: Boolean(draft.petFriendly),
    fibreReady: Boolean(draft.fibreReady),
    securityFeatures: String(draft.securityFeatures || '').trim(),
    propertyNotes: String(draft.description || '').trim(),
    listingPreviewDescription: String(draft.listingPreviewDescription || '').trim(),
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
  const base = [
    draft.headline || listing.listingTitle || listing.title,
    draft.suburb || listing.suburb,
    draft.province || listing.province,
  ]
    .map(normalizePublicListingSlugPart)
    .filter(Boolean)
    .join('-')

  const id = String(listing.id || '').trim()
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

function arch9LiveCheckClass(status = '') {
  if (status === 'live') return 'border-[#d8eddf] bg-[#f2fbf5] text-[#1f7d44]'
  if (status === 'checking') return 'border-[#cfe0f4] bg-[#f5f9ff] text-[#1f4f78]'
  if (status === 'paused') return 'border-[#dbe6f2] bg-white text-[#607387]'
  if (['not_found', 'missing_url', 'error'].includes(status)) return 'border-[#f2dfbf] bg-[#fff8ea] text-[#8a5b16]'
  return 'border-[#dbe6f2] bg-white text-[#607387]'
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

function toCleanText(value) {
  return String(value || '').trim()
}

function isValidEmail(value) {
  const text = toCleanText(value)
  if (!text) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
}

function getListingSellerFormData(listing = {}) {
  return listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
    ? listing.sellerOnboarding.formData
    : {}
}

function resolveSellerEmailFromListing(listing = {}) {
  const formData = getListingSellerFormData(listing)
  return toCleanText(
    formData.sellerEmail ||
      formData.email ||
      formData.contactEmail ||
      listing?.sellerEmail ||
      listing?.seller_email ||
      listing?.seller?.email,
  ).toLowerCase()
}

function resolveSellerPhoneFromListing(listing = {}) {
  const formData = getListingSellerFormData(listing)
  return toCleanText(
    formData.sellerPhone ||
      formData.phone ||
      formData.contactNumber ||
      formData.mobile ||
      listing?.sellerPhone ||
      listing?.seller_phone ||
      listing?.seller?.phone,
  )
}

function resolveSellerNameFromListing(listing = {}) {
  const formData = getListingSellerFormData(listing)
  return toCleanText(
    [formData.sellerFirstName || formData.firstName, formData.sellerSurname || formData.lastName].filter(Boolean).join(' ') ||
      formData.sellerName ||
      formData.fullName ||
      listing?.sellerName ||
      listing?.seller_name ||
      listing?.seller?.name,
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

function formatStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Requested'
  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getDeliveryActivityDate(delivery = {}) {
  return firstDraftValue(
    delivery.deliveredAt,
    delivery.delivered_at,
    delivery.sentAt,
    delivery.sent_at,
    delivery.failedAt,
    delivery.failed_at,
    delivery.preparedAt,
    delivery.prepared_at,
    delivery.createdAt,
    delivery.created_at,
  )
}

function isSellerOnboardingEmailDelivery(delivery = {}) {
  const type = normalizeKey(delivery.communicationType || delivery.communication_type || delivery.type)
  return SELLER_ONBOARDING_EMAIL_TYPES.has(type)
}

function buildSellerOnboardingEmailDiagnostics(deliveries = []) {
  const rows = (Array.isArray(deliveries) ? deliveries : [])
    .filter(isSellerOnboardingEmailDelivery)
    .sort((left, right) => new Date(getDeliveryActivityDate(right) || 0) - new Date(getDeliveryActivityDate(left) || 0))

  const failed = rows.filter((row) => normalizeKey(row.status) === 'failed')
  const sent = rows.filter((row) => ['sent', 'delivered'].includes(normalizeKey(row.status)))
  const prepared = rows.filter((row) => ['prepared', 'queued'].includes(normalizeKey(row.status)))
  const latest = rows[0] || null
  const latestFailure = failed[0] || null

  return {
    rows,
    recentRows: rows.slice(0, 4),
    total: rows.length,
    sent: sent.length,
    failed: failed.length,
    prepared: prepared.length,
    latest,
    latestFailure,
    latestStatus: latest ? formatStatusLabel(latest.status) : 'No delivery logged',
    latestAt: latest ? getDeliveryActivityDate(latest) : '',
    latestFailureMessage: latestFailure?.errorMessage || latestFailure?.error_message || '',
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
      <div className="absolute bottom-4 left-4 rounded-full border border-white/35 bg-white/20 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white">
        Property image
      </div>
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

function StatusPill({ status = '', label = '' }) {
  const normalized = String(status || label || '').trim().toLowerCase()
  const done = ['done', 'complete', 'completed', 'uploaded', 'signed', 'published', 'active'].includes(normalized)
  const pending = ['pending', 'in_progress', 'in progress', 'under_review', 'sent'].includes(normalized)
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
  const pages = [[]]
  let y = 790
  const addLine = (text, { x = 48, size = 10, bold = false, gap = 15, maxChars = 86 } = {}) => {
    const lines = wrapPdfText(text, maxChars)
    for (const line of lines) {
      if (y < 54) {
        pages.push([])
        y = 790
      }
      pages[pages.length - 1].push({ text: line, x, y, size, bold })
      y -= gap
    }
  }
  const addSpace = (amount = 10) => {
    y -= amount
    if (y < 54) {
      pages.push([])
      y = 790
    }
  }

  addLine(agencyName, { size: 11, bold: true, gap: 18 })
  addLine('Seller Profile', { size: 22, bold: true, gap: 28 })
  addLine(`Generated ${generatedDate || formatLongDate(new Date())}`, { size: 9, gap: 18 })
  addSpace(8)
  summary.forEach((row) => addLine(`${row.label}: ${row.value}`, { size: 10, gap: 14 }))
  addSpace(16)

  sections.forEach((section) => {
    addLine(section.title, { size: 14, bold: true, gap: 20 })
    section.rows.forEach((row) => addLine(`${row.label}: ${row.value}`, { size: 10, gap: 14 }))
    addSpace(12)
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
    const stream = pageLines.map((line) => (
      `BT /${line.bold ? 'F2' : 'F1'} ${line.size} Tf 1 0 0 1 ${line.x} ${line.y} Tm (${escapePdfText(line.text)}) Tj ET`
    )).join('\n')
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

function getOfferAverage(offers = []) {
  const prices = offers.map((offer) => Number(offer?.offerPrice || 0)).filter((value) => Number.isFinite(value) && value > 0)
  if (!prices.length) return 0
  return prices.reduce((sum, value) => sum + value, 0) / prices.length
}

function getLeadStage(lead) {
  return String(lead?.journeyStage || lead?.status || '').trim().toLowerCase()
}

function getNextBestAction({ pendingOffers, missingDocuments, onboardingStatus }) {
  if (pendingOffers > 0) {
    return {
      title: `${pendingOffers} offer${pendingOffers === 1 ? '' : 's'} pending review`,
      copy: 'Review, compare, and decide whether to accept, reject, or counter before momentum drops.',
    }
  }
  if (missingDocuments > 0) {
    return {
      title: `${missingDocuments} seller document${missingDocuments === 1 ? '' : 's'} still missing`,
      copy: 'Push FICA and property compliance completion so the listing can move cleanly into offer-to-deal progression.',
    }
  }
  if (onboardingStatus !== 'Completed') {
    return {
      title: 'Seller onboarding still in progress',
      copy: 'Use the onboarding link and mandate review workflow to close outstanding seller steps.',
    }
  }
  return {
    title: 'Listing is in a healthy operating state',
    copy: 'Focus on buyer follow-up, keeping viewings moving, and converting interest into signed offers.',
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

  const selectedFeatures = Array.isArray(propertyDetails?.selectedFeatures)
    ? propertyDetails.selectedFeatures
    : Array.isArray(onboardingFormData.features)
      ? onboardingFormData.features
      : String(marketing?.features || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
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
    description: String(firstDraftValue(propertyDetails?.description, marketing?.description, onboardingFormData.propertyNotes)).trim(),
    listingPreviewDescription: String(firstDraftValue(propertyDetails?.listingPreviewDescription, onboardingFormData.listingPreviewDescription)).trim(),
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
  const listingId = decodeURIComponent(String(encodedListingId || ''))

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
  const [arch9LiveCheck, setArch9LiveCheck] = useState({ status: 'idle', message: '' })
  const [openingSellerDocumentKey, setOpeningSellerDocumentKey] = useState('')
  const [resendingSellerPortalLink, setResendingSellerPortalLink] = useState(false)
  const [resettingSellerPortalPassword, setResettingSellerPortalPassword] = useState(false)
  const [sellerPortalAccessState, setSellerPortalAccessState] = useState(null)
  const [sellerPortalAccessLoading, setSellerPortalAccessLoading] = useState(false)
  const [followUpActionId, setFollowUpActionId] = useState('')
  const [showFullGallery, setShowFullGallery] = useState(false)
  const [offerNotesDraftById, setOfferNotesDraftById] = useState({})
  const [sellerReviewDeliveryModeByOfferId, setSellerReviewDeliveryModeByOfferId] = useState({})
  const [marketingDraft, setMarketingDraft] = useState(() => buildPropertyDraft(null))
  const [externalLinkDraft, setExternalLinkDraft] = useState(() => createExternalLinkDraft())
  const [sellerWorkspaceTab, setSellerWorkspaceTab] = useState(() => getSellerWorkspaceTabFromSearch(typeof window !== 'undefined' ? window.location.search : '') || 'overview')
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
  const [sentPropertiesLoading, setSentPropertiesLoading] = useState(false)
  const [sentPropertiesError, setSentPropertiesError] = useState('')
  const [interestedLeadsLoading, setInterestedLeadsLoading] = useState(false)
  const [interestedLeadsError, setInterestedLeadsError] = useState('')
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
  const [feedbackDrafts, setFeedbackDrafts] = useState({})

  useEffect(() => {
    if (!listingId.startsWith('development-')) return
    const developmentId = listingId.replace('development-', '')
    navigate(`/developments/${developmentId}`, { replace: true })
  }, [listingId, navigate])

  useEffect(() => {
    const requestedTab = getSellerWorkspaceTabFromSearch(location.search)
    if (!requestedTab) return
    setActiveTab('seller')
    setSellerWorkspaceTab(requestedTab)
  }, [location.search])

  const loadListingData = useCallback(async () => {
    setLoading(true)
    setDetailError('')
    const runtimeListings = readAgentPrivateListings()
    setPipelineLeads(readPipelineLeads())

    let nextListings = runtimeListings
    if (isSupabaseConfigured && listingId && !listingId.startsWith('development-')) {
      try {
        const dbListing = await getPrivateListing(listingId)
        if (dbListing?.id) {
          nextListings = upsertListingRecord(runtimeListings, dbListing)
        }
      } catch (error) {
        console.error('[AgentListingDetail] Supabase listing load failed', error)
        setDetailError(error?.message || 'Unable to load this listing from Supabase.')
      }
    }

    setPrivateListings(nextListings)
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
    return privateListings.find((item) => String(item.id) === listingId) || null
  }, [listingId, privateListings])

  const listingOrganisationId = useMemo(
    () => String(listingRecord?.organisationId || listingRecord?.organisation_id || activeOrganisationId || '').trim(),
    [activeOrganisationId, listingRecord?.organisationId, listingRecord?.organisation_id],
  )

  useEffect(() => {
    const token = resolveSellerPortalTokenFromListing(listingRecord)
    if (!token || !isSupabaseConfigured) {
      setSellerPortalAccessState(null)
      setSellerPortalAccessLoading(false)
      return
    }

    let cancelled = false
    setSellerPortalAccessLoading(true)
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

  useEffect(() => {
    if (!listingRecord) return
    setMarketingDraft(buildPropertyDraft(listingRecord))
    setRolePlayersDraft({
      attorney: String(listingRecord?.rolePlayers?.attorney || 'Arch9 Conveyancing').trim(),
      bondOriginator: String(listingRecord?.rolePlayers?.bondOriginator || 'Arch9 Finance').trim(),
    })
  }, [listingRecord])

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

  function patchListing(updater) {
    if (!listingRecord) return null
    let updatedListing = null
    const nextRows = privateListings.map((item) => {
      if (String(item.id) !== String(listingRecord.id)) return item
      updatedListing = updater({ ...item })
      return updatedListing
    })
    setPrivateListings(nextRows)
    writeAgentPrivateListings(nextRows)
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
        listingPreviewDescription: nextDraft.listingPreviewDescription.trim(),
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
    const draft = draftOverride || marketingDraft
    setDetailMessage('')
    setDetailError('')
    const normalizedExternalLinks = normalizeExternalListingLinks(draft.externalLinks)
    const property24ExternalLink = normalizedExternalLinks.find((link) => String(link.platform || '').trim().toLowerCase().includes('property24')) || null
    const privatePropertyExternalLink = normalizedExternalLinks.find((link) => String(link.platform || '').trim().toLowerCase().includes('private')) || null
    const updatedListing = await persistListingSnapshot(draft, { persistCoreFields: true })
    if (!updatedListing?.id || !isSupabaseConfigured) {
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
        listingPreviewDescription: draft.listingPreviewDescription.trim(),
        internalListingNotes: draft.notes.trim(),
      }
      if (options.listingVisibility) listingPatch.listingVisibility = options.listingVisibility
      const savedListing = await updatePrivateListing(updatedListing.id, listingPatch)
      if (savedListing?.id) {
        setPrivateListings((rows) => upsertListingRecord(rows, mergeListingRecord(updatedListing, savedListing)))
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
      })
      if (distributionSync?.skipped) {
        console.warn('[AgentListingDetail] listing distribution sync skipped', distributionSync.reason)
      }
      await upsertAreaFromAddress(buildAddressAutocompleteValueFromDraft(draft), { incrementListingCount: false })
      setDetailMessage(options.successMessage || 'Listing details saved.')
      return { ok: true, listing: savedListing || updatedListing }
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
      setArch9LiveCheck(nextCheck)
      return nextCheck
    }

    setArch9LiveChecking(true)
    if (!options.silent) setArch9LiveCheck({ status: 'checking', message: 'Checking the public catalogue...' })
    try {
      const response = await fetch(`${ARCH9_PUBLIC_LISTINGS_API_PATH}?slug=${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null)
      if (response.ok && payload?.listing?.slug) {
        const nextCheck = { status: 'live', message: 'Confirmed live on Arch9 Buy.' }
        setArch9LiveCheck(nextCheck)
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
      setArch9LiveCheck(nextCheck)
      return nextCheck
    } catch (error) {
      const nextCheck = {
        status: 'error',
        message: error?.message || 'The public catalogue could not be checked from this browser.',
      }
      setArch9LiveCheck(nextCheck)
      return nextCheck
    } finally {
      setArch9LiveChecking(false)
    }
  }

  async function publishToArch9Buy() {
    const blockers = getArch9PublicationBlockers(marketingDraft, coverImage)
    if (blockers.length) {
      setDetailMessage('')
      setDetailError(`Before publishing to Arch9 Buy: ${blockers.join(' ')}`)
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
        successMessage: 'Listing published to Arch9 Buy.',
      })
      if (saveResult?.ok && !saveResult.localOnly) {
        const liveResult = await verifyArch9PublicListing(publicUrl, { silent: true })
        if (liveResult.status === 'live') {
          setDetailError('')
          setDetailMessage('Listing published and confirmed live on Arch9 Buy.')
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
        successMessage: 'Listing removed from Arch9 Buy.',
      })
      if (saveResult?.ok) {
        setArch9LiveCheck({ status: 'paused', message: 'Publication paused. The public link should no longer resolve once cache refreshes.' })
      }
    } finally {
      setPublicationSaving(false)
    }
  }

  async function copyArch9PublicListingUrl() {
    if (!arch9PublicListingUrl) return
    try {
      await navigator.clipboard.writeText(arch9PublicListingUrl)
      setDetailError('')
      setDetailMessage('Arch9 Buy link copied.')
    } catch {
      setDetailMessage('')
      setDetailError('Unable to copy the Arch9 Buy link from this browser.')
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
    const selectedLead = listingLeads.find((lead) => String(lead?.id || '') === String(offerInviteDraft.buyerLeadId || ''))
    if (!selectedLead) {
      setOfferActionError('Select a buyer lead before generating an offer link.')
      return
    }

    try {
      setSendingOfferLink(true)
      const canonicalOffer = await createCanonicalOffer({
        organisationId: listingOrganisationId,
        buyerLeadId: selectedLead.leadId || selectedLead.id,
        buyerContactId: selectedLead.contactId,
        listingId: listingRecord.id,
        agentId: profile?.id || listingRecord?.agentId,
        status: 'draft',
        conditionsJson: {
          clientIntakePreference: normalizeClientIntakePreference(
            offerInviteDraft.clientIntakePreference || selectedLead?.clientIntakePreference,
          ),
        },
      }, {
        actor: {
          id: profile?.id || listingRecord?.agentId || '',
          name: String(profile?.fullName || listingRecord?.assignedAgentName || listingRecord?.assignedAgent || 'Agent').trim(),
          email: String(profile?.email || listingRecord?.assignedAgentEmail || '').trim(),
        },
      })
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

      const buyerName = String(selectedLead?.name || 'Buyer').trim()
      const propertyLabel = String(listingRecord?.listingTitle || listingRecord?.propertyAddress || 'property').trim()
      if (String(selectedLead?.email || '').trim()) {
        try {
          await invokeEdgeFunction('send-email', {
            body: {
              type: 'buyer_offer_link',
              to: String(selectedLead.email || '').trim(),
              buyerName,
              propertyTitle: propertyLabel,
              offerLink: link,
              expiresAt: invite?.expiresAt || '',
            },
          })
        } catch (error) {
          console.error('[Offers] buyer offer email notification failed', error)
        }
      }

      if (String(selectedLead?.phone || '').trim()) {
        try {
          await sendWhatsAppNotification({
            to: formatSouthAfricanWhatsAppNumber(selectedLead.phone),
            role: 'buyer',
            message: `Hi ${buyerName},\n\nYour viewing for ${propertyLabel} is complete.\n\nSubmit your secure offer here:\n${link}\n\nThis link expires on ${formatDate(invite?.expiresAt)}.\n\n- Arch9`,
          })
        } catch (error) {
          console.error('[Offers] buyer offer WhatsApp notification failed', error)
        }
      }

      setOfferActionMessage('Secure offer link generated and sent to the buyer.')
      setShowSendOfferLinkForm(false)
      setOfferInviteDraft({
        buyerLeadId: '',
        expiresInDays: 7,
        clientIntakePreference: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
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
      const onboardingQuery = await supabase
        .from('private_listing_seller_onboarding')
        .select('token, status, form_data, updated_at')
        .eq('private_listing_id', listingRecord.id)
        .maybeSingle()

      if (onboardingQuery.error && String(onboardingQuery.error?.code || '') !== '42P01') {
        throw onboardingQuery.error
      }

      onboardingRow = onboardingQuery.data || null
      const formData = onboardingRow?.form_data && typeof onboardingRow.form_data === 'object' ? onboardingRow.form_data : {}
      token = token || toCleanText(onboardingRow?.token)
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

    const portalLink = buildSellerClientPortalLink(token)
    if (!portalLink) throw new Error('Seller client portal link could not be built from the saved token.')

    if (onboardingRow) {
      const existingFormData = onboardingRow.form_data && typeof onboardingRow.form_data === 'object' ? onboardingRow.form_data : {}
      setPrivateListings((rows) => upsertListingRecord(rows, {
        ...listingRecord,
        sellerOnboarding: {
          ...(listingRecord?.sellerOnboarding || {}),
          token,
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
      const { portalLink, sellerEmail, sellerName } = await resolveSellerClientPortalInviteContext()
      const agent = getCanonicalOfferActor()
      const emailResponse = await invokeEdgeFunction('send-email', {
        body: {
          type: 'seller_portal_link',
          emailKind: 'portal_documents',
          to: sellerEmail,
          organisationId: listingOrganisationId,
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
    const pendingWindow = typeof window !== 'undefined' ? window.open('', '_blank') : null
    if (pendingWindow) pendingWindow.opener = null
    try {
      const filePath = String(doc.filePath || '').trim()
      const fallbackUrl = String(doc.url || '').trim()
      const downloadUrl = filePath
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

  function openSellerWorkspaceSection(tab, message = '') {
    setActiveTab('seller')
    setSellerWorkspaceTab(tab)
    navigate(`${location.pathname}?tab=${encodeURIComponent(tab)}`, { replace: true })
    setDetailError('')
    if (message) setDetailMessage(message)
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
    }
  }

  async function handleSendSellerOnboardingFollowUp() {
    if (!listingRecord?.id) return
    setDetailError('')
    setDetailMessage('')
    const sellerEmail = resolveSellerEmailFromListing(listingRecord)
    const sellerPhone = resolveSellerPhoneFromListing(listingRecord)
    const hasSellerContact = isValidEmail(sellerEmail) || Boolean(formatSouthAfricanWhatsAppNumber(sellerPhone))
    const existingOnboardingLink = String(listingRecord?.sellerOnboarding?.link || '').trim()
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
        if (isValidEmail(sellerEmail)) {
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
                agentName: agentDisplayName,
              },
            })
            if (emailResponse?.error || emailResponse?.data?.error) {
              deliveryWarning = ' Email delivery needs attention.'
            }
          } catch (error) {
            console.warn('[AgentListingDetail] seller onboarding email failed', error)
            deliveryWarning = ' Email delivery needs attention.'
          }
        }
        const normalizedSellerPhone = formatSouthAfricanWhatsAppNumber(sellerPhone)
        if (normalizedSellerPhone) {
          try {
            const whatsappResult = await sendWhatsAppNotification({
              to: normalizedSellerPhone,
              role: 'seller',
              message: `Hi ${sellerDisplayName},\n\nYour agent has started your seller onboarding for ${propertyLabel}.\n\nPlease complete your onboarding here:\n${onboardingLink}\n\nAgent: ${agentDisplayName}\n\n- Arch9`,
            })
            if (!whatsappResult?.ok) deliveryWarning = `${deliveryWarning} WhatsApp delivery needs attention.`
          } catch (error) {
            console.warn('[AgentListingDetail] seller onboarding WhatsApp failed', error)
            deliveryWarning = `${deliveryWarning} WhatsApp delivery needs attention.`
          }
        }
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

  async function handleGenerateMandateFollowUp() {
    if (!listingRecord?.id) return
    setDetailError('')
    setDetailMessage('')
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
      setDetailMessage('Mandate marked ready for generation. Complete seller facts and commission before sending it out.')
    } catch (error) {
      setDetailError(error?.message || 'Unable to prepare the mandate.')
    } finally {
      setFollowUpActionId('')
    }
  }

  async function handleSignedMandateUpload(event) {
    const file = event?.target?.files?.[0] || null
    if (event?.target) event.target.value = ''
    if (!file || !listingRecord?.id) return
    setDetailError('')
    setDetailMessage('')
    try {
      setFollowUpActionId('upload_signed_mandate')
      const signedAt = new Date().toISOString()
      const uploadedDocument = isSupabaseConfigured && isUuidLike(listingRecord.id)
        ? await uploadPrivateListingDocument(listingRecord.id, file, {
            documentType: 'signed_mandate',
            documentCategory: 'Mandate',
            documentName: file.name || 'Signed Mandate',
            visibility: 'internal',
            status: 'uploaded',
          })
        : {
            id: generateId('signed-mandate'),
            document_name: file.name || 'Signed Mandate',
            document_type: 'signed_mandate',
            category: 'Mandate',
            status: 'uploaded',
            uploaded_at: signedAt,
            url: await readAsDataUrl(file),
          }
      const documentUrl = uploadedDocument?.url || uploadedDocument?.fileUrl || uploadedDocument?.file_url || ''
      const documentRow = {
        ...uploadedDocument,
        id: uploadedDocument?.id || generateId('signed-mandate'),
        documentName: uploadedDocument?.document_name || uploadedDocument?.documentName || file.name || 'Signed Mandate',
        documentType: uploadedDocument?.document_type || uploadedDocument?.documentType || 'signed_mandate',
        category: uploadedDocument?.category || 'Mandate',
        status: uploadedDocument?.status || 'uploaded',
        uploadedAt: uploadedDocument?.uploaded_at || uploadedDocument?.uploadedAt || signedAt,
        url: documentUrl,
      }
      const localListing = patchListing((row) => ({
        ...row,
        mandateStatus: 'signed',
        mandateSignedDate: signedAt.slice(0, 10),
        signedMandateUrl: documentUrl || row?.signedMandateUrl || '',
        mandate: {
          ...(row?.mandate || {}),
          status: 'signed',
          signedAt,
          signedUrl: documentUrl || row?.mandate?.signedUrl || '',
          updatedAt: signedAt,
        },
        documents: [
          documentRow,
          ...(Array.isArray(row?.documents)
            ? row.documents.filter((document) => normalizeKey(document?.document_type || document?.documentType || document?.documentName || document?.document_name || document?.name) !== 'signed_mandate')
            : []),
        ],
        sellerOnboarding: {
          ...(row?.sellerOnboarding || {}),
          formData: {
            ...((row?.sellerOnboarding?.formData && typeof row.sellerOnboarding.formData === 'object') ? row.sellerOnboarding.formData : {}),
            mandateSignedDate: signedAt.slice(0, 10),
            signedMandateUrl: documentUrl,
          },
        },
        updatedAt: signedAt,
      }))
      setMarketingDraft((previous) => ({ ...previous, mandateSignedDate: signedAt.slice(0, 10) }))
      if (isSupabaseConfigured && isUuidLike(listingRecord.id)) {
        const savedListing = await updatePrivateListing(listingRecord.id, {
          mandateStatus: 'signed',
          listingStatus: normalizeKey(listingRecord?.listingStatus || listingRecord?.status) === 'active' ? 'active' : 'mandate_signed',
        })
        if (savedListing?.id) {
          setPrivateListings((rows) => upsertListingRecord(rows, mergeListingRecord(localListing, savedListing)))
        }
      }
      setDetailMessage('Signed mandate uploaded and linked to this listing.')
    } catch (error) {
      setDetailError(error?.message || 'Unable to upload the signed mandate.')
    } finally {
      setFollowUpActionId('')
    }
  }

  function handleFollowUpAction(action) {
    if (action.key === 'send_onboarding') {
      void handleSendSellerOnboardingFollowUp()
      return
    }
    if (action.key === 'generate_mandate') {
      if (action.complete) {
        openSellerWorkspaceSection('documents', 'Review mandate documents and upload the signed mandate when it is ready.')
        return
      }
      void handleGenerateMandateFollowUp()
      return
    }
    if (action.key === 'add_seller_contact') {
      openSellerWorkspaceSection('seller', 'Add the seller name, email, and phone in the seller workspace.')
      return
    }
    if (action.key === 'complete_seller_facts') {
      if (listingRecord?.sellerOnboarding?.link) {
        window.open(listingRecord.sellerOnboarding.link, '_blank', 'noopener,noreferrer')
      } else {
        openSellerWorkspaceSection('seller', 'Capture the remaining seller facts here, or send onboarding to let the seller complete them.')
      }
      return
    }
    if (action.key === 'add_commission') {
      openSellerWorkspaceSection('commission', 'Capture commission terms so the mandate and seller profile are complete.')
    }
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
    try {
      setCanonicalOfferActionId(`${offerRow.id}:convert`)
      const currentStatus = normalizeOfferWorkflowStatus(canonicalOffer?.status || offerRow.status)
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
      const createdTransaction = await createTransactionFromAcceptedCanonicalOffer({
        organisationId: listingOrganisationId,
        offerId: offerRow.canonicalOfferId,
        offer: acceptedOffer || canonicalOffer,
        lead: {
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
        },
        listing: listingRecord,
        actor: getCanonicalOfferActor(),
        payload: {
          listingId: listingRecord.id,
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
      const intakePreference = normalizeClientIntakePreference(
        acceptedOffer?.conditions?.clientIntakePreference ||
          acceptedOffer?.conditions?.deliveryMode ||
          canonicalOffer?.conditions?.clientIntakePreference ||
          canonicalOffer?.conditions?.deliveryMode ||
          linkedLead?.clientIntakePreference ||
          offerInviteDraft.clientIntakePreference,
      )
      const intakeLabel = getClientIntakePreferenceLabel(intakePreference)
      let onboardingSendWarning = ''
      let manualHandoff = false
      if (transactionId && isSupabaseConfigured) {
        const onboardingEmail = await invokeEdgeFunction('send-email', {
          body: {
            type: 'client_onboarding',
            transactionId,
            source: 'accepted_offer_conversion',
            deliveryMode: intakePreference,
          },
        })
        manualHandoff = onboardingEmail?.data?.manualHandoff === true
        const onboardingEmailError = onboardingEmail?.error || onboardingEmail?.data?.error
        if (onboardingEmailError) {
          onboardingSendWarning = typeof onboardingEmailError === 'string'
            ? onboardingEmailError
            : onboardingEmailError?.message || 'Buyer onboarding email could not be sent.'
        }
      }
      if (transactionId) {
        await recordBuyerLeadActivity({
          organisationId: listingOrganisationId,
          leadId: acceptedOffer?.buyerLeadId || canonicalOffer?.buyerLeadId || linkedLead?.leadId,
          activityType: reusedTransaction ? 'Buyer Onboarding Resent' : 'Buyer Onboarding Sent',
          activityNote: onboardingSendWarning
            ? `${manualHandoff ? `${intakeLabel} onboarding prepared` : 'Buyer onboarding delivery attempted'} for transaction ${transactionId}, but delivery needs attention: ${onboardingSendWarning}`
            : manualHandoff
              ? `${reusedTransaction ? 'Manual onboarding pack reopened' : 'Manual onboarding pack prepared'} for transaction ${transactionId} via ${intakeLabel}.`
              : `${reusedTransaction ? 'Buyer onboarding resent' : 'Buyer onboarding sent'} for transaction ${transactionId}.`,
          outcome: onboardingSendWarning ? 'Delivery Warning' : 'Sent',
          actor: getCanonicalOfferActor(),
        }).catch(() => null)
      }
      setOfferNotesDraftById((previous) => ({ ...previous, [offerRow.id]: '' }))
      setOfferActionMessage(onboardingSendWarning
        ? `${reusedTransaction ? 'Buyer onboarding resend attempted' : 'Transaction created from accepted canonical offer'}. ${onboardingSendWarning}`
        : reusedTransaction
          ? 'Buyer onboarding was resent for the existing transaction.'
          : 'Transaction created from accepted canonical offer and buyer onboarding was sent.')
      setOffersRefreshTick((value) => value + 1)
    } catch (error) {
      setOfferActionError(error?.message || 'Unable to create a transaction from this offer.')
    } finally {
      setCanonicalOfferActionId('')
    }
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
      .sort((left, right) => new Date(right.offerDate || 0) - new Date(left.offerDate || 0))
  }, [canonicalOfferRows, legacyOfferRows])

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
    return pipelineLeads.filter((lead) => {
      return String(lead?.unitId || '') === String(listingRecord.id) || String(lead?.unitNumber || '') === String(listingRecord.listingTitle || '')
    })
  }, [listingRecord, pipelineLeads])

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

  const propertyDocuments = useMemo(
    () => dynamicSellerRequirements.filter((doc) => ['property', 'compliance', 'financial', 'occupancy'].includes(String(doc?.requirement_group || '').trim().toLowerCase())),
    [dynamicSellerRequirements],
  )

  const sellerDocuments = useMemo(
    () => dynamicSellerRequirements.filter((doc) => ['seller_identity', 'fica', 'marital', 'company', 'trust', 'deceased_estate', 'mandate'].includes(String(doc?.requirement_group || '').trim().toLowerCase())),
    [dynamicSellerRequirements],
  )

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
    const daysOnMarket = getDaysOnMarket(listingRecord?.createdAt)
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
      offerAverage,
      highestOffer: Math.max(0, ...offerRows.map((offer) => Number(offer?.offerPrice || 0))),
      leadCount,
      viewingCount,
      offerLeadCount,
      acceptedCount,
      estimatedViews,
    }
  }, [listingLeads, listingRecord?.createdAt, offerRows, viewings])

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
  const nextBestAction = useMemo(
    () =>
      getNextBestAction({
        pendingOffers: metrics.pendingOffers,
        missingDocuments,
        onboardingStatus: onboardingStatusLabel,
      }),
    [metrics.pendingOffers, missingDocuments, onboardingStatusLabel],
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
      return searchable.includes('mandate') && hasUrl
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
      isSigned: ['signed', 'completed', 'fully_signed', 'uploaded_signed', 'mandate_signed'].includes(status) || Boolean(signedDate || signedUrl),
      isExpired: daysUntilExpiry !== null && daysUntilExpiry < 0,
    }
  }, [listingRecord, marketingDraft.expiryDate, marketingDraft.mandateSignedDate])

  const sellerDocumentTrackerRows = useMemo(() => {
    const sourceRequirements = Array.isArray(dynamicSellerRequirements) ? dynamicSellerRequirements : []
    const linkedRequirementUploads = sourceRequirements.flatMap((requirement) =>
      [requirement?.uploadedDocument, requirement?.uploaded_document].filter(Boolean),
    )
    const uploadedDocuments = [
      ...(Array.isArray(listingRecord?.documents) ? listingRecord.documents : []),
      ...linkedRequirementUploads,
    ]
    const suggested = [
      { key: 'id_document', label: 'ID Document / Passport', match: /id_document|identity_documents|identity|seller_id|id document|passport/i },
      { key: 'proof_of_address', label: 'Proof of Address', match: /proof_of_address|proof of address|residential_address|residence|address/i },
      { key: 'title_deed_copy', label: 'Title Deed / Reference', match: /title_deed_copy|title_deed|title deed|deed/i },
      { key: 'rates_account', label: 'Rates Account', match: /rates_account|rates account|rates/i },
      { key: 'property_condition_disclosure', label: 'Property Condition Disclosure', match: /property_condition_disclosure|condition disclosure|disclosure|defects/i },
      { key: 'solar_compliance_documents', label: 'Solar Compliance Documents', match: /solar_compliance_documents|solar compliance|solar/i, defaultRequired: false },
      { key: 'signed_mandate', label: 'Signed Mandate', match: /signed_mandate|mandate_signature|mandate/i },
    ]
    return suggested.map((item) => {
      const requirement = sourceRequirements.find((row) =>
        item.match.test(`${row?.key || ''} ${row?.requirement_key || ''} ${row?.label || ''} ${row?.requirement_name || ''} ${row?.document_type || ''} ${row?.category || ''}`),
      )
      const requirementId = String(requirement?.id || requirement?.requirement_id || '').trim()
      const requirementKey = normalizeKey(requirement?.key || requirement?.requirement_key || item.key)
      const upload = uploadedDocuments.find((document) => {
        const documentRequirementId = String(document?.requirement_id || document?.requirementId || '').trim()
        if (requirementId && documentRequirementId && requirementId === documentRequirementId) return true
        const searchable = normalizeKey([
          document?.document_type,
          document?.documentType,
          document?.category,
          document?.document_name,
          document?.documentName,
          document?.fileName,
          document?.name,
          document?.requirement_key,
          document?.requirementKey,
        ].filter(Boolean).join(' '))
        return item.match.test(searchable) || (requirementKey && searchable.includes(requirementKey))
      }) || (requirement && (
        requirement?.uploadedDocument ||
        requirement?.uploaded_document ||
        requirement?.filePath ||
        requirement?.file_path ||
        requirement?.fileUrl ||
        requirement?.file_url ||
        requirement?.url ||
        requirement?.uploadedAt ||
        requirement?.uploaded_at ||
        ['uploaded', 'under_review', 'approved', 'completed', 'verified'].includes(String(requirement?.status || '').trim().toLowerCase())
      )
        ? {
            ...requirement,
            status: requirement.status || 'uploaded',
            uploadedAt: requirement.uploadedAt || requirement.uploaded_at || requirement.updated_at || listingRecord?.updatedAt || '',
            document_name: requirement.fileName || requirement.file_name || requirement.requirement_name || requirement.label,
            storage_path: requirement.filePath || requirement.file_path || '',
            url: requirement.url || requirement.fileUrl || requirement.file_url || '',
          }
        : null) || (item.key === 'signed_mandate' && mandateWorkspace.isSigned
        ? {
            status: 'signed',
            uploadedAt: mandateWorkspace.signedDate || listingRecord?.updatedAt || listingRecord?.createdAt || '',
            document_name: 'Signed mandate',
            url: mandateWorkspace.signedUrl || mandateWorkspace.viewUrl || '',
          }
        : null)
      const status = String(upload?.status || requirement?.status || '').trim().toLowerCase()
      const hasUpload = Boolean(
        upload?.storage_path ||
          upload?.file_path ||
          upload?.fileUrl ||
          upload?.file_url ||
          upload?.url ||
          upload?.signedUrl ||
          upload?.uploaded_at ||
          upload?.uploadedAt,
      )
      const required = requirement ? requirement.is_required !== false : item.defaultRequired !== false
      return {
        ...item,
        required,
        uploaded: hasUpload,
        status: hasUpload ? (status || 'uploaded') : status || 'missing',
        uploadedOn: upload?.uploadedAt || upload?.uploaded_at || upload?.createdAt || upload?.created_at || '',
        fileName: upload?.document_name || upload?.fileName || upload?.file_name || requirement?.fileName || requirement?.file_name || '',
        filePath: upload?.storage_path || upload?.file_path || upload?.storagePath || upload?.path || '',
        url: upload?.url || upload?.fileUrl || upload?.file_url || upload?.signedUrl || '',
      }
    })
  }, [dynamicSellerRequirements, listingRecord?.createdAt, listingRecord?.documents, listingRecord?.updatedAt, mandateWorkspace.isSigned, mandateWorkspace.signedDate, mandateWorkspace.signedUrl, mandateWorkspace.viewUrl])

  const listingReadinessItems = useMemo(() => {
    const requiredSellerDocuments = sellerDocumentTrackerRows.filter((doc) => doc.required)
    const sellerDocumentsComplete = requiredSellerDocuments.length
      ? requiredSellerDocuments.every((doc) => doc.uploaded || ['uploaded', 'complete', 'completed', 'approved', 'verified'].includes(String(doc.status || '').toLowerCase()))
      : false
    return [
      { key: 'address', label: 'Address captured', complete: Boolean(marketingDraft.addressLine1.trim()) },
      { key: 'asking_price', label: 'Asking price captured', complete: Number(marketingDraft.price || listingRecord?.askingPrice || 0) > 0 },
      { key: 'description', label: 'Description completed', complete: Boolean(marketingDraft.description.trim()) },
      { key: 'photos', label: 'Photos uploaded', complete: marketingDraft.galleryImages.length > 0 },
      { key: 'cover', label: 'Cover image selected', complete: Boolean(marketingDraft.coverImageId || marketingDraft.galleryImages[0]?.id) },
      { key: 'features', label: 'Property features captured', complete: marketingDraft.selectedFeatures.length > 0 || marketingDraft.amenities.length > 0 },
      { key: 'mandate', label: 'Mandate signed', complete: mandateWorkspace.isSigned },
      { key: 'documents', label: 'Seller documents complete', complete: sellerDocumentsComplete },
      { key: 'external_links', label: 'External links added', complete: normalizeExternalListingLinks(marketingDraft.externalLinks).some((link) => link.url) },
    ]
  }, [listingRecord?.askingPrice, mandateWorkspace.isSigned, marketingDraft, sellerDocumentTrackerRows])

  const listingReadinessCompleted = listingReadinessItems.filter((item) => item.complete).length
  const listingReadinessPercent = listingReadinessItems.length
    ? Math.round((listingReadinessCompleted / listingReadinessItems.length) * 100)
    : 0
  const sellerFormData = useMemo(() => getListingSellerFormData(listingRecord), [listingRecord])

  const sellerProfile = useMemo(() => {
    const raw = (...values) => firstDraftValue(...values)
    const form = sellerFormData || {}
    const seller = listingRecord?.seller || {}
    const valueFor = (...keys) => raw(...keys.map((key) => form?.[key]))
    const field = (label, values = [], type = 'text') => {
      const rawValue = Array.isArray(values) ? raw(...values) : values
      return { label, rawValue, value: formatSellerProfileValue(rawValue, type) }
    }
    const section = (title, icon, rows) => ({ title, icon, rows })
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
      section('Seller Details', UserRound, [
        field('Full name', [sellerName]),
        field('ID / Registration number', [valueFor('idNumber', 'sellerIdNumber', 'companyRegistrationNumber', 'trustRegistrationNumber'), seller.idNumber, seller.companyNumber, seller.trustNumber]),
        field('Seller type', [sellerTypeRaw]),
        field('Marital status', [valueFor('maritalStatus'), seller.maritalStatus]),
      ]),
      section('Contact Details', Link2, [
        field('Email', [resolveSellerEmailFromListing(listingRecord), valueFor('sellerEmail', 'email', 'contactEmail'), seller.email]),
        field('Phone', [valueFor('sellerPhone', 'phone', 'contactNumber', 'mobile'), seller.phone]),
        field('Alternative contact', [valueFor('alternativeContact', 'alternateContact', 'secondaryPhone', 'alternativePhone'), seller.alternativeContact]),
        field('Preferred contact method', [valueFor('preferredContactMethod', 'contactPreference'), seller.preferredContactMethod]),
      ]),
      section('Property & Ownership', Home, [
        field('Property address', [propertyAddress]),
        field('Ownership type', [valueFor('ownershipType', 'ownerType'), seller.ownershipType]),
        field('Title deed number', [valueFor('titleDeedNumber', 'deedNumber', 'titleReference'), seller.titleDeedNumber]),
        field('Bond holder', [valueFor('bondHolder', 'bondBank', 'mortgageBank'), seller.bondHolder]),
        field('Outstanding bond', [valueFor('outstandingBond', 'bondSettlementAmount'), seller.outstandingBond], 'currency'),
        field('Co-owner details', [valueFor('coOwnerDetails', 'coOwners'), seller.coOwners]),
      ]),
      section('Mandate Details', FileText, [
        field('Mandate type', [mandateType]),
        field('Asking price', [askingPrice], 'currency'),
        field('Mandate start date', [valueFor('mandateStartDate', 'startDate'), marketingDraft.listingDate, listingRecord?.mandateStartDate], 'date'),
        field('Expiry date', [valueFor('expiryDate', 'mandateEndDate'), mandateWorkspace.expiryDate], 'date'),
        field('Commission preference', [
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
        field('Mandate terms', [valueFor('mandateTerms', 'mandateCommissionTerms'), listingRecord?.commission?.mandateTerms, listingRecord?.commission?.mandate_terms]),
        field('POPI consent', [popiConsent]),
      ]),
      section('Compliance', ShieldCheck, [
        field('FICA status', [valueFor('ficaStatus'), seller.ficaStatus]),
        field('Tax number', [valueFor('taxNumber', 'sellerTaxNumber'), seller.taxNumber]),
        field('POPI consent', [popiConsent]),
        field('Electrical certificate', [valueFor('electricalCertificate', 'electricalComplianceCertificate', 'cocElectrical'), seller.electricalCertificate]),
        field('Plumbing certificate', [valueFor('plumbingCertificate', 'cocPlumbing'), seller.plumbingCertificate]),
        field('Occupation certificate', [valueFor('occupationCertificate', 'occupancyCertificate'), seller.occupationCertificate]),
        field('Building plans', [valueFor('buildingPlans', 'approvedBuildingPlans'), seller.buildingPlans]),
      ]),
      section('Notes / Special Conditions', Info, [
        field('Selling reason', [valueFor('sellingReason'), seller.sellingReason]),
        field('Selling timeline', [valueFor('sellingTimeline'), seller.sellingTimeline]),
        field('Special conditions', [valueFor('specialConditions', 'conditions'), seller.specialConditions]),
        field('Notes', [valueFor('notes', 'sellerNotes'), seller.notes]),
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

  const keyInformationItems = useMemo(() => {
    const listingStatus = String(marketingDraft.listingStatus || listingRecord?.status || '').toLowerCase()
    const bridgeStatus = String(marketingDraft.bridgeListingStatus || listingRecord?.bridgeListingStatus || '').toLowerCase()
    const published = ['active', 'published', 'live'].includes(listingStatus) || bridgeStatus === 'published'
    return [
      { icon: MapPin, label: 'Location', value: [marketingDraft.suburb, marketingDraft.city].filter(Boolean).join(', ') || 'Location pending' },
      { icon: TrendingUp, label: 'Pipeline Value', value: formatCurrency(marketingDraft.price || listingRecord?.askingPrice) },
      { icon: Home, label: 'Property Type', value: marketingDraft.propertyType || listingRecord?.propertyType || 'Not captured' },
      { icon: UserRound, label: 'Assigned Agent', value: listingRecord?.assignedAgentName || listingRecord?.assignedAgent || listingRecord?.assignedAgentEmail || 'Unassigned' },
      { icon: ExternalLink, label: 'Listing Published', value: published ? 'Published' : 'Not published', status: published ? 'done' : 'pending' },
      { icon: HandCoins, label: 'Price Approved', value: Number(marketingDraft.price || listingRecord?.askingPrice || 0) ? 'Price captured' : 'No price', status: Number(marketingDraft.price || listingRecord?.askingPrice || 0) ? 'done' : 'missing' },
      { icon: Camera, label: 'Photos Uploaded', value: `${marketingDraft.galleryImages.length} photo${marketingDraft.galleryImages.length === 1 ? '' : 's'}`, status: marketingDraft.galleryImages.length ? 'done' : 'missing' },
      { icon: FileText, label: 'Description Complete', value: marketingDraft.description.trim() ? 'Description ready' : 'Description missing', status: marketingDraft.description.trim() ? 'done' : 'missing' },
    ]
  }, [listingRecord, marketingDraft])

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

  const followUpActions = useMemo(() => {
    const sellerEmail = resolveSellerEmailFromListing(listingRecord)
    const sellerPhone = resolveSellerPhoneFromListing(listingRecord)
    const sellerName = resolveSellerNameFromListing(listingRecord)
    const hasSellerName = Boolean(sellerName)
    const hasSellerContact = isValidEmail(sellerEmail) || Boolean(formatSouthAfricanWhatsAppNumber(sellerPhone))
    const onboarding = listingRecord?.sellerOnboarding || {}
    const onboardingStatus = normalizeKey(onboarding?.status || listingRecord?.sellerOnboardingStatus || listingRecord?.seller_onboarding_status)
    const onboardingReady = Boolean(
      onboarding?.token ||
        onboarding?.link ||
        ['sent', 'viewed', 'in_progress', 'submitted', 'under_review', 'completed'].includes(onboardingStatus),
    )
    const mandateStatus = normalizeKey(mandateWorkspace.status)
    const mandatePrepared = mandateWorkspace.isSigned || ['ready', 'generated', 'sent', 'viewed'].includes(mandateStatus)
    const sellerFactsComplete = sellerProfile.completionPercent >= 80
    return [
      {
        key: 'send_onboarding',
        title: 'Send seller onboarding',
        copy: onboardingReady
          ? 'A seller onboarding link already exists for this listing.'
          : hasSellerContact
            ? 'Create the seller portal link and send it to the captured seller contact.'
            : 'Capture an email or phone first, then send the seller portal link.',
        complete: onboardingReady,
        statusLabel: hasSellerContact ? 'Ready' : 'Missing contact',
        icon: Link2,
        buttonIcon: Link2,
        buttonLabel: onboardingReady ? (hasSellerContact ? 'Resend Link' : 'Copy Link') : hasSellerContact ? 'Create & Send Link' : 'Add Contact',
        loadingLabel: 'Creating link...',
      },
      {
        key: 'generate_mandate',
        title: 'Generate mandate',
        copy: mandatePrepared
          ? 'Mandate preparation has started for this listing.'
          : 'Mark the mandate ready so the listing can move from Quick Add into the mandate workflow.',
        complete: mandatePrepared,
        statusLabel: 'Needs prep',
        icon: FileText,
        buttonIcon: FileText,
        buttonLabel: mandatePrepared ? 'Review Mandate' : 'Mark Ready',
        loadingLabel: 'Preparing...',
      },
      {
        key: 'upload_signed_mandate',
        title: 'Upload signed mandate',
        copy: mandateWorkspace.isSigned
          ? 'A signed mandate is already linked to this listing.'
          : 'Attach the signed PDF or image when the seller has signed outside the portal.',
        complete: mandateWorkspace.isSigned,
        statusLabel: 'Required for active',
        icon: Upload,
        buttonLabel: mandateWorkspace.isSigned ? 'Replace File' : 'Upload Signed File',
        upload: true,
      },
      {
        key: 'add_seller_contact',
        title: 'Add seller contact',
        copy: hasSellerName && hasSellerContact
          ? 'Seller name and contact details are captured.'
          : 'Capture seller name, surname, email, or phone without forcing the full onboarding journey.',
        complete: hasSellerName && hasSellerContact,
        statusLabel: 'Quick capture',
        icon: UserRound,
        buttonIcon: UserRound,
        buttonLabel: hasSellerName && hasSellerContact ? 'Review Seller' : 'Add Seller',
      },
      {
        key: 'complete_seller_facts',
        title: 'Complete seller facts',
        copy: sellerFactsComplete
          ? 'Seller facts are complete enough for mandate and readiness checks.'
          : 'Finish ownership, compliance, and mandate facts in the seller profile or portal.',
        complete: sellerFactsComplete,
        statusLabel: `${sellerProfile.completionPercent}% complete`,
        icon: ShieldCheck,
        buttonIcon: listingRecord?.sellerOnboarding?.link ? ExternalLink : ShieldCheck,
        buttonLabel: listingRecord?.sellerOnboarding?.link ? 'Open Portal' : 'Open Seller',
      },
      {
        key: 'add_commission',
        title: 'Add commission',
        copy: commissionWorkspace.hasData
          ? 'Commission terms are available for the mandate workspace.'
          : 'Capture commission percentage, amount, VAT handling, and payment responsibility.',
        complete: commissionWorkspace.hasData,
        statusLabel: 'Commercial terms',
        icon: HandCoins,
        buttonIcon: HandCoins,
        buttonLabel: commissionWorkspace.hasData ? 'Review Commission' : 'Add Commission',
      },
    ]
  }, [commissionWorkspace.hasData, listingRecord, mandateWorkspace.isSigned, mandateWorkspace.status, sellerProfile.completionPercent])
  const completedFollowUpCount = followUpActions.filter((action) => action.complete).length
  const listingFollowUpsComplete = !followUpActions.length || followUpActions.every((action) => action.complete)
  const shouldShowListingFollowUps = sellerWorkspaceTab === 'overview' && !listingFollowUpsComplete

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

  useEffect(() => {
    setArch9LiveCheck({ status: 'idle', message: '' })
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
    const portalViews = Number(analytics?.portalViews || analytics?.property24Views || analytics?.privatePropertyViews || 0)
    const bridgeViews = Number(analytics?.bridgeViews || analytics?.websiteViews || 0)
    const explicitViews = Number(analytics?.totalViews || analytics?.views || 0)
    const totalViews = explicitViews || portalViews + bridgeViews || metrics.estimatedViews
    const resolvedPortalViews = portalViews || Math.max(0, Math.round(totalViews * 0.72))
    const resolvedBridgeViews = bridgeViews || Math.max(0, totalViews - resolvedPortalViews)
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
    const resolvedAreaAverage = areaAverageDays || Math.max(metrics.daysOnMarket + 15, 30)
    const daysDelta = resolvedAreaAverage ? ((resolvedAreaAverage - metrics.daysOnMarket) / resolvedAreaAverage) * 100 : 0
    return {
      totalViews,
      portalViews: resolvedPortalViews,
      bridgeViews: resolvedBridgeViews,
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
      areaAverageDays: resolvedAreaAverage,
      daysPerformance: daysDelta,
      acceptedSales: metrics.acceptedCount,
    }
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

  const listingIntelligenceActivity = useMemo(() => {
    const items = []
    const add = (title, timestamp, copy, icon = FolderKanban) => {
      if (!timestamp) return
      items.push({ title, timestamp, copy, icon })
    }
    add('Seller signed mandate', mandateWorkspace.signedDate, 'Mandate completed and listing authority recorded.', CheckCircle2)
    add('Property published', marketingDraft.listingDate || (['active', 'published', 'live'].includes(String(marketingDraft.listingStatus || listingRecord?.status || '').toLowerCase()) ? listingRecord?.updatedAt : ''), 'Listing moved into live marketing.', ExternalLink)
    if (marketingDraft.galleryImages.length) {
      add('Photos uploaded', marketingDraft.galleryImages[0]?.uploadedAt || marketingDraft.galleryImages[0]?.createdAt || listingRecord?.updatedAt, `${marketingDraft.galleryImages.length} photo${marketingDraft.galleryImages.length === 1 ? '' : 's'} available.`, Camera)
    }
    for (const viewing of viewings.slice(0, 4)) {
      add('Viewing booked', viewing?.created_at || viewing?.updated_at || viewing?.proposed_date, `${viewing?.buyer_name || 'Buyer'} • ${formatViewingStatusLabel(viewing?.status)}`, CalendarDays)
    }
    for (const offer of offerRows.slice(0, 4)) {
      add(
        normalizeOfferWorkflowStatus(offer?.status) === OFFER_WORKFLOW_STATUS.ACCEPTED ? 'Offer accepted' : 'Offer received',
        offer?.offerDate,
        `${offer?.buyerName || 'Buyer'} • ${formatCurrency(offer?.offerPrice)}`,
        HandCoins,
      )
    }
    add('Seller portal link sent', listingRecord?.sellerOnboarding?.sentAt || listingRecord?.sellerOnboarding?.createdAt, 'Seller reporting portal is available.', ExternalLink)
    return items.sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0)).slice(0, 8)
  }, [listingRecord, mandateWorkspace.signedDate, marketingDraft, offerRows, viewings])

  const sellerCommunicationMetrics = useMemo(() => {
    const lastOfferShare = offerRows.find((offer) => offer?.sentToSellerAt || normalizeOfferWorkflowStatus(offer?.status) === OFFER_WORKFLOW_STATUS.SELLER_REVIEW)
    const portalViewedAt = firstDraftValue(
      listingRecord?.sellerOnboarding?.lastViewedAt,
      listingRecord?.sellerOnboarding?.viewedAt,
      listingRecord?.sellerOnboarding?.portalViewedAt,
      listingRecord?.sellerOnboarding?.submittedAt,
    )
    const lastUpdate = firstDraftValue(
      lastOfferShare?.sentToSellerAt,
      listingRecord?.sellerReport?.lastSentAt,
      listingRecord?.sellerOnboarding?.updatedAt,
      mandateWorkspace.signedDate,
      listingRecord?.updatedAt,
    )
    const unreadMessages = Number(
      listingRecord?.sellerMessages?.unreadCount ||
        listingRecord?.sellerCommunication?.unreadCount ||
        listingRecord?.unreadSellerMessages ||
        0,
    ) || 0
    const uploadedDocuments = sellerDocumentTrackerRows.filter((document) => document.uploaded).length ||
      (Array.isArray(listingRecord?.documents) ? listingRecord.documents.length : 0)
    return {
      lastUpdate,
      portalViewedAt,
      lastLogin: firstDraftValue(
        listingRecord?.sellerOnboarding?.lastLoginAt,
        listingRecord?.sellerOnboarding?.last_login_at,
        listingRecord?.sellerOnboarding?.lastAccessedAt,
        portalViewedAt,
      ),
      unreadMessages,
      uploadedDocuments,
      offersShared: offerRows.filter((offer) => offer?.sentToSellerAt || [OFFER_WORKFLOW_STATUS.SELLER_REVIEW, OFFER_WORKFLOW_STATUS.SELLER_VIEWED, OFFER_WORKFLOW_STATUS.ACCEPTED].includes(normalizeOfferWorkflowStatus(offer?.status))).length,
      viewingsShared: viewings.filter((item) => [VIEWING_STATUS.CONFIRMED, VIEWING_STATUS.COMPLETED].includes(String(item?.status || '').trim().toLowerCase())).length,
      reportsSent: Number(listingRecord?.sellerReport?.sentCount || listingRecord?.sellerReportsSent || 0) || 0,
    }
  }, [listingRecord, mandateWorkspace.signedDate, offerRows, sellerDocumentTrackerRows, viewings])

  const sellerPortalPasswordStatus = useMemo(() => {
    if (!resolveSellerPortalTokenFromListing(listingRecord)) return 'No portal link'
    if (sellerPortalAccessLoading) return 'Checking...'
    if (!sellerPortalAccessState?.valid) return 'Unknown'
    if (sellerPortalAccessState?.passwordSet) return 'Password set'
    return 'Password not set'
  }, [listingRecord, sellerPortalAccessLoading, sellerPortalAccessState])

  const sellerOnboardingEmailDiagnostics = useMemo(
    () => buildSellerOnboardingEmailDiagnostics(communicationDeliveryRows),
    [communicationDeliveryRows],
  )

  function handleEditSellerProfile() {
    const portalLink = String(listingRecord?.sellerOnboarding?.link || listingRecord?.sellerOnboarding?.clientPortalLink || '').trim()
    if (portalLink && typeof window !== 'undefined') {
      window.open(portalLink, '_blank', 'noopener,noreferrer')
      return
    }
    setDetailMessage('No seller portal link is linked yet. Send the seller portal link first, then edit the seller profile from the onboarding record.')
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
    setMarketingDraft((previous) => ({ ...previous, [key]: value }))
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
    setMarketingDraft((previous) => {
      const exists = previous.selectedFeatures.includes(feature)
      return {
        ...previous,
        selectedFeatures: exists
          ? previous.selectedFeatures.filter((item) => item !== feature)
          : [...previous.selectedFeatures, feature],
      }
    })
  }

  function toggleAmenity(amenity) {
    setMarketingDraft((previous) => {
      const current = Array.isArray(previous.amenities) ? previous.amenities : []
      const exists = current.includes(amenity)
      return {
        ...previous,
        amenities: exists
          ? current.filter((item) => item !== amenity)
          : [...current, amenity],
      }
    })
  }

  function updateExternalListingLink(linkId, key, value) {
    setMarketingDraft((previous) => ({
      ...previous,
      externalLinks: normalizeExternalListingLinks(previous.externalLinks).map((link) => {
        if (String(link.id) !== String(linkId)) return link
        const nextLink = { ...link, [key]: value }
        if (key === 'status') {
          nextLink.visibleToSeller = isExternalLinkSellerVisible(value)
        }
        return nextLink
      }),
    }))
  }

  async function addExternalListingLink(event) {
    event.preventDefault()
    const url = String(externalLinkDraft.url || '').trim()
    if (!url) {
      setDetailError('Add a listing URL before saving the external link.')
      return
    }
    const nextLink = {
      id: generateId('external-link'),
      ...externalLinkDraft,
      url,
      visibleToSeller: isExternalLinkSellerVisible(externalLinkDraft.status),
    }
    setExternalLinkDraft(createExternalLinkDraft())
    await applyMarketingDraftAndPersist(
      (previous) => ({
        ...previous,
        externalLinks: normalizeExternalListingLinks([...(previous.externalLinks || []), nextLink]),
      }),
      { message: 'External listing link added.' },
    )
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
    setMarketingDraft((previous) => ({
      ...previous,
      floorplans: previous.floorplans.map((plan) => (String(plan.id) === String(id) ? { ...plan, label } : plan)),
    }))
  }

  function removeFloorplan(id) {
    setMarketingDraft((previous) => ({
      ...previous,
      floorplans: previous.floorplans.filter((plan) => String(plan.id) !== String(id)),
    }))
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
      {detailError ? (
        <div className="rounded-[14px] border border-[#f3d2cc] bg-[#fef3f2] px-4 py-3 text-sm font-medium text-[#b42318]">{detailError}</div>
      ) : null}
      {detailMessage ? (
        <div className="rounded-[14px] border border-[#d8eddf] bg-[#ecfaf1] px-4 py-3 text-sm font-medium text-[#1f7d44]">{detailMessage}</div>
      ) : null}
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
                  <Button variant="secondary" onClick={handleDeleteListing} disabled={deletingListing}>
                    {deletingListing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    Delete Listing
                  </Button>
                  <Button variant="secondary" onClick={() => setActiveTab('property_details')}>
                    Edit Listing
                  </Button>
                  <Button
                    onClick={() => {
                      setActiveTab('offers')
                      setShowSendOfferLinkForm(true)
                    }}
                  >
                    <Link2 size={15} />
                    Send Offer Link
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Listing Workspace</p>
                <p className="mt-1 text-sm text-[#607387]">Manage this property across seller onboarding, buyer interest, offers, and deal preparation.</p>
              </div>
              <span className="inline-flex items-center self-start rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-4 py-2 text-[0.92rem] font-semibold text-[#5f748a]">
                {DETAIL_TABS.length} sections
              </span>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {DETAIL_TABS.map((tab) => {
                const active = tab.key === activeTab
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`min-h-[56px] rounded-[16px] border px-2.5 py-2.5 text-center transition xl:px-2 ${
                      active
                        ? 'border-[#1f4f78] bg-[#2b5577] text-white shadow-[0_18px_32px_rgba(31,79,120,0.24)]'
                        : 'border-[#dbe6f2] bg-white text-[#47627c] hover:border-[#b7c8db] hover:shadow-[0_10px_20px_rgba(15,23,42,0.06)]'
                    }`}
                  >
                    <span className={`block text-[0.78rem] font-semibold leading-tight tracking-[-0.01em] xl:text-[0.74rem] ${active ? 'text-white' : 'text-[#47627c]'}`}>
                      {tab.label}
                    </span>
                  </button>
                )
              })}
            </div>
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
                <Button onClick={() => setActiveTab(metrics.pendingOffers > 0 ? 'offers' : missingDocuments > 0 ? 'documents' : 'pipeline')}>
                  {metrics.pendingOffers > 0 ? 'Review Offers' : missingDocuments > 0 ? 'Open Documents' : 'Open Pipeline'}
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
                    <Button size="sm" onClick={saveMarketingDraft}>Save Property Details</Button>
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
                <Button size="sm" onClick={saveMarketingDraft}>Save Property Details</Button>
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
                    onChange={(nextAddress) => setMarketingDraft((previous) => mergeAddressIntoMarketingDraft(previous, nextAddress))}
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
              <Button onClick={() => setShowViewingForm((current) => !current)}>
                <Plus size={15} />
                {showViewingForm ? 'Hide Viewing Form' : 'Request / Schedule Viewing'}
              </Button>
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
                <p className="mt-1 text-sm text-[#607387]">Send secure buyer offer links, review submissions, and route valid offers to seller review.</p>
              </div>
              <Button onClick={() => setShowSendOfferLinkForm((current) => !current)}>
                <Link2 size={15} />
                {showSendOfferLinkForm ? 'Hide Offer Link Setup' : 'Send Offer Link'}
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

            {showSendOfferLinkForm ? (
              <form className="mt-5 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4" onSubmit={handleCreateOfferLink}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Buyer lead</span>
                    <Field as="select" value={offerInviteDraft.buyerLeadId} onChange={(event) => setOfferInviteDraft((prev) => ({ ...prev, buyerLeadId: event.target.value }))}>
                      <option value="">Select buyer lead</option>
                      {listingLeads.map((lead) => (
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
                <p className="mt-3 text-sm text-[#6b7d93]">
                  Keep this aligned with how the buyer wants to work: portal, agent-assisted capture, or a hard-copy pack.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowSendOfferLinkForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={sendingOfferLink}>{sendingOfferLink ? 'Sending...' : 'Generate & Send Link'}</Button>
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
                    {[
                      OFFER_WORKFLOW_STATUS.SUBMITTED,
                      OFFER_WORKFLOW_STATUS.AGENT_REVIEW,
                    ].includes(normalizeOfferWorkflowStatus(offer.status)) && offer.sourceSystem !== 'canonical_offer' ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" type="button" onClick={() => handleOfferAction(offer.id, 'forward_to_seller')}>Forward to Seller</Button>
                        <Button size="sm" variant="secondary" type="button" onClick={() => handleOfferAction(offer.id, 'request_clarification')}>Request Clarification</Button>
                        <Button size="sm" variant="secondary" type="button" onClick={() => handleOfferAction(offer.id, 'reject_invalid')}>Reject Invalid</Button>
                      </div>
                    ) : null}
                    {offer.sourceSystem === 'canonical_offer' ? (
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
                              ? 'Resend Buyer Onboarding'
                              : 'Create Transaction & Send Onboarding'}
                          </Button>
                        ) : null}
                        {offer.buyerLeadId ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/pipeline/leads/${offer.buyerLeadId}`)}>Open Buyer Lead</Button>
                        ) : null}
                        {offer.transactionId ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/transactions/${offer.transactionId}`)}>Open Transaction</Button>
                        ) : null}
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

          {shouldShowListingFollowUps ? (
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#142132]">Listing Follow-Ups</h2>
                <p className="mt-1 text-sm text-[#607387]">Complete a Quick Add listing here without restarting seller onboarding.</p>
              </div>
              <StatusPill
                status={listingFollowUpsComplete ? 'done' : 'pending'}
                label={`${completedFollowUpCount}/${followUpActions.length} complete`}
              />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {followUpActions.map((action) => (
                <FollowUpActionCard
                  key={action.key}
                  action={action}
                  loading={followUpActionId === action.key}
                  onAction={handleFollowUpAction}
                  onUpload={action.key === 'upload_signed_mandate' ? handleSignedMandateUpload : undefined}
                />
              ))}
            </div>
            </section>
          ) : null}

          {sellerWorkspaceTab === 'overview' ? (
            <section className="space-y-6">
              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-[#142132]">Listing Performance</h2>
                    <p className="mt-1 text-sm text-[#607387]">A focused read on buyer attention, conversion, and market movement.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/listings')}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#5f7894] hover:text-[#1f4f78]"
                  >
                    <ArrowLeft size={13} />
                    Back
                  </button>
                </div>

                <div className="mt-5 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    { label: 'Views', value: formatCompactNumber(listingPerformance.totalViews), meta: `${formatCompactNumber(listingPerformance.portalViews)} portal / ${formatCompactNumber(listingPerformance.bridgeViews)} Arch9`, icon: Eye },
                    { label: 'Leads', value: formatCompactNumber(listingPerformance.leadCount), meta: `${formatCompactNumber(listingPerformance.newThisWeek)} new this week`, icon: Users },
                    { label: 'Viewings', value: formatCompactNumber(listingPerformance.scheduledViewings), meta: `${formatCompactNumber(listingPerformance.completedViewings)} completed`, icon: CalendarDays },
                    { label: 'Offers', value: formatCompactNumber(listingPerformance.offerCount), meta: `${formatCompactNumber(metrics.pendingOffers)} active / pending`, icon: HandCoins },
                    { label: 'Days Mkt', value: formatCompactNumber(listingPerformance.daysOnMarket), meta: `${formatCompactNumber(listingPerformance.areaAverageDays)} day area avg`, icon: BarChart3 },
                  ].map((card) => {
                    const Icon = card.icon
                    return (
                      <div key={card.label} className="flex h-full min-h-[128px] flex-col justify-between rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{card.label}</p>
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[11px] bg-[#eef5fb] text-[#1f4f78]">
                            <Icon size={15} />
                          </span>
                        </div>
                        <p className="mt-4 text-2xl font-semibold text-[#10243a]">{card.value}</p>
                        <p className="mt-2 text-sm leading-5 text-[#607387]">{card.meta}</p>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-5 grid items-stretch gap-3 md:grid-cols-3">
                  {listingConversionMetrics.map((metric) => (
                    <div key={metric.label} className="flex min-h-[86px] items-center justify-between gap-4 rounded-[16px] border border-[#e5edf6] bg-white px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-[#243d56]">{metric.label}</p>
                        <p className="mt-1 text-xs font-medium text-[#607387]">{metric.meta}</p>
                      </div>
                      <p className="shrink-0 text-xl font-semibold text-[#1f4f78]">{formatPercentValue(metric.value)}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <h3 className="text-base font-semibold text-[#142132]">Key Information</h3>
                <div className="mt-5 grid gap-x-7 md:grid-cols-2 xl:grid-cols-4">
                  {keyInformationItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <div key={item.label} className="flex min-h-[82px] items-start gap-3 border-b border-[#e7edf5] py-3">
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[11px] bg-[#eef5fb] text-[#1f4f78]">
                          <Icon size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{item.label}</p>
                            {item.status ? <StatusPill status={item.status} /> : null}
                          </div>
                          <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#243d56]">{item.value || 'Not captured'}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </article>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[#142132]">Offer vs Asking Price</h3>
                    <p className="mt-1 text-sm text-[#607387]">Offer quality against the seller's current asking position.</p>
                  </div>
                  <StatusPill status={offerPriceOverview.offerCount ? 'done' : 'pending'} label={`${formatCompactNumber(offerPriceOverview.offerCount)} offer${offerPriceOverview.offerCount === 1 ? '' : 's'}`} />
                </div>

                <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
                  <div className="space-y-4">
                    {[
                      { label: 'Asking Price', value: formatCurrency(offerPriceOverview.askingPrice), fill: offerPriceOverview.askingFill, color: '#1f4f78' },
                      { label: 'Highest Offer', value: offerPriceOverview.highestOffer ? formatMoneyValue(offerPriceOverview.highestOffer) : '—', fill: offerPriceOverview.highestFill, color: '#2f8f6b' },
                      { label: 'Latest Offer', value: offerPriceOverview.latestOffer ? formatMoneyValue(offerPriceOverview.latestOffer) : '—', fill: offerPriceOverview.latestFill, color: '#1769d1' },
                      { label: 'Average Offer', value: offerPriceOverview.averageOffer ? formatMoneyValue(offerPriceOverview.averageOffer) : '—', fill: offerPriceOverview.averageFill, color: '#c58b35' },
                    ].map((row) => (
                      <div key={row.label}>
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="font-semibold text-[#425970]">{row.label}</span>
                          <span className="text-right font-semibold text-[#142132]">{row.value}</span>
                        </div>
                        <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#e8eef5]">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, row.fill))}%`, backgroundColor: row.color }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    {[
                      { label: 'Highest Offer', value: offerPriceOverview.highestOffer ? formatMoneyValue(offerPriceOverview.highestOffer) : '—' },
                      { label: 'Latest Offer', value: offerPriceOverview.latestOffer ? formatMoneyValue(offerPriceOverview.latestOffer) : '—' },
                      { label: 'Average Offer', value: offerPriceOverview.averageOffer ? formatMoneyValue(offerPriceOverview.averageOffer) : '—' },
                      {
                        label: 'Difference to Asking',
                        value: offerPriceOverview.offerCount && offerPriceOverview.askingPrice
                          ? `${offerPriceOverview.differenceToAsking > 0 ? '+' : ''}${formatMoneyValue(offerPriceOverview.differenceToAsking)}`
                          : '—',
                      },
                      { label: 'Offer Count', value: formatCompactNumber(offerPriceOverview.offerCount) },
                    ].map((item) => (
                      <div key={item.label} className="flex min-h-[62px] items-center justify-between gap-4 border-b border-[#e7edf5] py-2.5 last:border-b-0">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{item.label}</span>
                        <span className="text-right text-sm font-semibold text-[#142132]">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>

              <section className="grid items-stretch gap-6 min-[1100px]:grid-cols-2">
                <article className="flex h-full flex-col rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                  <h3 className="text-base font-semibold text-[#142132]">Seller Communication</h3>
                  <div className="mt-5 grid gap-x-6 sm:grid-cols-2">
                    <CompactSnapshotRow label="Portal Viewed" value={sellerCommunicationMetrics.portalViewedAt ? formatDate(sellerCommunicationMetrics.portalViewedAt) : 'Not viewed'} />
                    <CompactSnapshotRow label="Last Login" value={sellerCommunicationMetrics.lastLogin ? formatDate(sellerCommunicationMetrics.lastLogin) : 'No login yet'} />
                    <CompactSnapshotRow label="Portal Password" value={sellerPortalPasswordStatus} />
                    <CompactSnapshotRow label="Unread Messages" value={formatCompactNumber(sellerCommunicationMetrics.unreadMessages)} />
                    <CompactSnapshotRow label="Documents Uploaded" value={formatCompactNumber(sellerCommunicationMetrics.uploadedDocuments)} />
                  </div>
                  <div className="mt-5 border-t border-[#e7edf5] pt-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-[#22374d]">Seller Onboarding Email Diagnostics</h4>
                        <p className="mt-1 text-xs text-[#6b7d93]">
                          Latest status: {sellerOnboardingEmailDiagnostics.latestStatus}
                          {sellerOnboardingEmailDiagnostics.latestAt ? ` • ${formatDateTime(sellerOnboardingEmailDiagnostics.latestAt)}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#35546c]">
                          {sellerOnboardingEmailDiagnostics.total} logged
                        </span>
                        <span className="inline-flex rounded-full border border-[#d8eddf] bg-[#ecfaf1] px-2.5 py-1 text-[0.68rem] font-semibold text-[#1f7d44]">
                          {sellerOnboardingEmailDiagnostics.sent} sent
                        </span>
                        {sellerOnboardingEmailDiagnostics.failed ? (
                          <span className="inline-flex rounded-full border border-[#f6d7d7] bg-[#fff5f5] px-2.5 py-1 text-[0.68rem] font-semibold text-[#b42318]">
                            {sellerOnboardingEmailDiagnostics.failed} failed
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {sellerOnboardingEmailDiagnostics.latestFailureMessage ? (
                      <p className="mt-3 rounded-[12px] border border-[#f6d7d7] bg-[#fff5f5] px-3 py-2 text-xs font-medium text-[#b42318]">
                        Latest failure: {sellerOnboardingEmailDiagnostics.latestFailureMessage}
                      </p>
                    ) : null}
                    <div className="mt-3 space-y-2">
                      {sentPropertiesLoading ? (
                        <p className="text-xs text-[#607387]">Loading seller email diagnostics...</p>
                      ) : null}
                      {!sentPropertiesLoading && sellerOnboardingEmailDiagnostics.recentRows.length ? sellerOnboardingEmailDiagnostics.recentRows.map((delivery) => (
                        <div key={delivery.id || `${delivery.communicationType}-${delivery.recipient}-${getDeliveryActivityDate(delivery)}`} className="flex flex-col gap-2 border-b border-[#edf2f7] pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[#2d445e]">{formatStatusLabel(delivery.communicationType || delivery.communication_type)}</p>
                            <p className="mt-0.5 truncate text-xs text-[#6b7d93]">
                              {delivery.recipient || 'Recipient pending'} {delivery.subject ? `• ${delivery.subject}` : ''}
                            </p>
                            {delivery.errorMessage || delivery.error_message ? (
                              <p className="mt-0.5 truncate text-xs text-[#b42318]">{delivery.errorMessage || delivery.error_message}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusClass(delivery.status)}`}>
                              {formatStatusLabel(delivery.status)}
                            </span>
                            <span className="text-[0.68rem] font-semibold text-[#7b8ca2]">{formatDateTime(getDeliveryActivityDate(delivery))}</span>
                          </div>
                        </div>
                      )) : null}
                      {!sentPropertiesLoading && !sellerOnboardingEmailDiagnostics.recentRows.length ? (
                        <p className="text-xs text-[#607387]">No seller onboarding email delivery rows have been logged for this listing yet.</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-auto grid gap-2 pt-5 sm:grid-cols-3">
                    {listingRecord?.sellerOnboarding?.link ? (
                      <a href={listingRecord.sellerOnboarding.link} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 py-2 text-sm font-semibold text-[#1f4f78]">
                        Open Seller Portal
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <Button size="sm" variant="secondary" disabled>Open Seller Portal</Button>
                    )}
                    <Button size="sm" onClick={() => void handleResendSellerClientPortalLink()} disabled={resendingSellerPortalLink}>
                      {resendingSellerPortalLink ? 'Sending...' : 'Resend Seller Link'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void handleResetSellerPortalPasswordAndResend()} disabled={resettingSellerPortalPassword || resendingSellerPortalLink || !resolveSellerPortalTokenFromListing(listingRecord)}>
                      {resettingSellerPortalPassword ? 'Resetting...' : 'Reset Password'}
                    </Button>
                  </div>
                </article>

                <article className="flex h-full flex-col rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                  <h3 className="text-base font-semibold text-[#142132]">Recent Activity</h3>
                  <div className="mt-4 space-y-3">
                    {listingIntelligenceActivity.length ? listingIntelligenceActivity.map((item) => {
                      const Icon = item.icon || FolderKanban
                      return (
                        <div key={`${item.title}-${item.timestamp}`} className="flex items-center gap-3 border-b border-[#e7edf5] pb-3 last:border-b-0 last:pb-0">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[11px] bg-[#eef5fb] text-[#1769d1]"><Icon size={15} /></span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#243d56]">{item.title}</p>
                            <p className="truncate text-xs text-[#607387]">{item.copy}</p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-[#7b8ca2]">{formatDate(item.timestamp)}</span>
                        </div>
                      )
                    }) : (
                      <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#607387]">
                        No listing activity has been recorded yet.
                      </div>
                    )}
                  </div>
                </article>
              </section>
            </section>
          ) : null}

          {sellerWorkspaceTab === 'offers' ? (
            <section className="space-y-5">
              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-[#142132]">Offers</h2>
                    <p className="mt-1 text-sm text-[#607387]">All offers made on this listing across the platform, buyer offer links, and seller review flow.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setActiveTab('offers')}>
                      Open Full Offer Workspace
                    </Button>
                    <Button size="sm" onClick={() => {
                      setActiveTab('offers')
                      setShowSendOfferLinkForm(true)
                    }}>
                      <Link2 size={15} />
                      Send Offer Link
                    </Button>
                  </div>
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

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <MetricCard label="Total Offers" value={offerSummary.total} meta="Canonical + legacy rows" />
                  <MetricCard label="Highest Offer" value={offerSummary.highest ? formatCurrency(offerSummary.highest) : '—'} meta="Top buyer position" />
                  <MetricCard label="Submitted" value={offerSummary.submitted} meta="Awaiting review" />
                  <MetricCard label="Seller Review" value={offerSummary.sellerReview} meta="Sent to seller" />
                  <MetricCard label="Accepted" value={offerSummary.accepted} meta="Ready to convert" />
                </div>
              </article>

              <article className="overflow-hidden rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <div className="flex flex-col gap-3 border-b border-[#e5edf6] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[#142132]">Offer Table</h3>
                    <p className="mt-1 text-sm text-[#607387]">Review buyer offer values, status, finance route, review links, and conversion readiness.</p>
                  </div>
                  {canonicalOffersLoading ? (
                    <span className="rounded-full border border-[#d8e6f6] bg-[#f3f8fd] px-3 py-1 text-xs font-semibold text-[#2c5a89]">Loading canonical offers</span>
                  ) : (
                    <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-3 py-1 text-xs font-semibold text-[#35546c]">{offerRows.length} offer rows</span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1180px] table-fixed text-left text-sm">
                    <thead className="bg-[#f8fbfd] text-[0.66rem] uppercase tracking-[0.1em] text-[#7b8ca2]">
                      <tr className="border-b border-[#e5edf6]">
                        <th className="w-[16%] px-5 py-3">Buyer</th>
                        <th className="w-[12%] px-5 py-3">Offer</th>
                        <th className="w-[12%] px-5 py-3">Status</th>
                        <th className="w-[12%] px-5 py-3">Source</th>
                        <th className="w-[12%] px-5 py-3">Submitted</th>
                        <th className="w-[12%] px-5 py-3">Finance</th>
                        <th className="w-[14%] px-5 py-3">Conditions</th>
                        <th className="w-[10%] px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2f7]">
                      {offerRows.length ? offerRows.map((offer) => {
                        const statusKey = normalizeOfferWorkflowStatus(offer.status)
                        const sellerReviewPreparation = offer.sourceSystem === 'canonical_offer' ? buildListingSellerReviewPreparation(offer) : null
                        const sellerReviewPreparationSummary = describeSellerReviewPreparation(sellerReviewPreparation)
                        const sellerReviewDeliveryMode = sellerReviewPreparation?.deliveryMode || SELLER_REVIEW_DELIVERY_MODE.EMAIL
                        const sellerReviewSession = offer.sellerReviewSession || {}
                        const sellerReviewToken = String(sellerReviewSession.token || offer.conditionsJson?.sellerReviewSessionToken || '').trim()
                        const sellerReviewLink = sellerReviewToken && typeof window !== 'undefined'
                          ? `${window.location.origin}/seller/offers/review/${encodeURIComponent(sellerReviewToken)}`
                          : ''
                        const canSendToSeller = offer.sourceSystem === 'canonical_offer' && ![
                          OFFER_WORKFLOW_STATUS.ACCEPTED,
                          OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION,
                          OFFER_WORKFLOW_STATUS.REJECTED,
                          OFFER_WORKFLOW_STATUS.WITHDRAWN,
                          OFFER_WORKFLOW_STATUS.EXPIRED,
                        ].includes(statusKey)
                        const canConvert = offer.sourceSystem === 'canonical_offer' && (
                          statusKey === OFFER_WORKFLOW_STATUS.ACCEPTED ||
                          (statusKey === OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION && offer.transactionId)
                        )
                        return (
                          <tr key={offer.id} className="align-top text-[#425970] transition hover:bg-[#fbfdff]">
                            <td className="px-5 py-4">
                              <p className="truncate font-semibold text-[#243d56]" title={offer.buyerName || 'Buyer pending'}>{offer.buyerName || 'Buyer pending'}</p>
                              {offer.buyerLeadId ? (
                                <button type="button" onClick={() => navigate(`/pipeline/leads/${offer.buyerLeadId}`)} className="mt-1 text-xs font-semibold text-[#1f4f78] hover:text-[#163d5f]">
                                  Open buyer lead
                                </button>
                              ) : (
                                <p className="mt-1 text-xs text-[#74879d]">No buyer lead linked</p>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <p className="font-semibold text-[#142132]">{offer.offerPrice ? formatCurrency(offer.offerPrice) : '—'}</p>
                              {offer.depositAmount ? <p className="mt-1 text-xs text-[#74879d]">Deposit {formatCurrency(offer.depositAmount)}</p> : null}
                            </td>
                            <td className="px-5 py-4">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(offer.status)}`}>
                                {formatStatusLabel(offer.status)}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${
                                offer.sourceSystem === 'canonical_offer'
                                  ? 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
                                  : 'border-[#dbe6f2] bg-white text-[#35546c]'
                              }`}>
                                {offer.sourceSystem === 'canonical_offer' ? 'Platform offer' : 'Legacy listing offer'}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <p>{formatDate(offer.offerDate)}</p>
                              <p className="mt-1 text-xs text-[#74879d]">Expires {formatDate(offer.expiryDate)}</p>
                            </td>
                            <td className="px-5 py-4 capitalize">{offer.financeType || 'Unknown'}</td>
                            <td className="px-5 py-4">
                              <p className="line-clamp-2 text-sm text-[#607387]" title={offer.conditions || ''}>{offer.conditions || 'No conditions captured'}</p>
                              {sellerReviewLink ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (typeof navigator !== 'undefined') void navigator.clipboard?.writeText(sellerReviewLink)
                                    setOfferActionMessage('Seller review link copied.')
                                  }}
                                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78]"
                                >
                                  <Copy size={12} />
                                  Copy seller link
                                </button>
                              ) : null}
                              {sellerReviewPreparationSummary.blockers.length ? (
                                <p className="mt-2 text-xs font-semibold text-[#b42318]">{sellerReviewPreparationSummary.blockerText}</p>
                              ) : null}
                              {!sellerReviewPreparationSummary.blockers.length && sellerReviewPreparationSummary.warnings.length ? (
                                <p className="mt-2 text-xs font-semibold text-[#9a5b11]">{sellerReviewPreparationSummary.warningText}</p>
                              ) : null}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-col items-end gap-2">
                                {canSendToSeller ? (
                                  <>
                                    <Field
                                      as="select"
                                      className="w-full min-w-[150px]"
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
                                  </>
                                ) : null}
                                {canConvert ? (
                                  <Button
                                    size="sm"
                                    type="button"
                                    variant="secondary"
                                    disabled={canonicalOfferActionId === `${offer.id}:convert`}
                                    onClick={() => void handleCanonicalListingOfferConversion(offer)}
                                  >
                                    Convert
                                  </Button>
                                ) : null}
                                {offer.transactionId ? (
                                  <Button size="sm" type="button" variant="secondary" onClick={() => navigate(`/transactions/${offer.transactionId}`)}>
                                    Transaction
                                  </Button>
                                ) : null}
                                {!canSendToSeller && !canConvert && !offer.transactionId ? (
                                  <span className="text-xs text-[#9aa9b8]">—</span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )
                      }) : (
                        <tr>
                          <td colSpan={8} className="px-5 py-10 text-center text-sm text-[#607387]">
                            No offers captured for this listing yet. Send an offer link or wait for buyer submissions to appear here.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[#142132]">Secure Offer Links</h3>
                    <p className="mt-1 text-sm text-[#607387]">Recently generated buyer offer links for this listing.</p>
                  </div>
                  <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-3 py-1 text-xs font-semibold text-[#35546c]">{offerInviteRows.length} links</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {offerInviteRows.length ? offerInviteRows.slice(0, 6).map((invite) => (
                    <article key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-[#22374d]">{invite.buyerLeadName || 'Buyer lead'}</p>
                        <p className="mt-1 text-xs text-[#607387]">Status: {formatStatusLabel(invite.status)} • Expires {formatDate(invite.expiresAt)}</p>
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
                    <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93] md:col-span-2">
                      No secure offer links have been generated for this listing yet.
                    </div>
                  )}
                </div>
              </article>
            </section>
          ) : null}

          {sellerWorkspaceTab === 'seller' ? (
            <section className="space-y-6">
              <div className="flex flex-col gap-4 rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)] lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate('/listings')}
                    className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#5f7894] hover:text-[#1f4f78]"
                  >
                    <ArrowLeft size={13} />
                    Back to Listings
                  </button>
                  <h2 className="mt-3 text-2xl font-semibold text-[#142132]">Seller Profile</h2>
                </div>
                <div className="grid gap-2 sm:grid-cols-4 lg:flex lg:flex-wrap lg:justify-end">
                  <Button size="sm" variant="secondary" onClick={handleEditSellerProfile}>
                    <FileText size={15} />
                    Edit Seller
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleDownloadSellerProfilePdf}>
                    <FileText size={15} />
                    Download PDF
                  </Button>
                  <Button size="sm" onClick={() => void handleResendSellerClientPortalLink()} disabled={resendingSellerPortalLink}>
                    <Link2 size={15} />
                    {resendingSellerPortalLink ? 'Sending...' : 'Send Seller Portal Link'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void handleResetSellerPortalPasswordAndResend()} disabled={resettingSellerPortalPassword || resendingSellerPortalLink || !resolveSellerPortalTokenFromListing(listingRecord)}>
                    <ShieldCheck size={15} />
                    {resettingSellerPortalPassword ? 'Resetting...' : 'Reset Portal Password'}
                  </Button>
                </div>
              </div>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px] bg-[#10243a] text-xl font-semibold text-white">
                      {sellerProfile.initials}
                    </div>
                    <div className="min-w-0">
                      <h3 className="break-words text-2xl font-semibold text-[#142132]">{sellerProfile.name}</h3>
                      <p className="mt-1 text-sm font-semibold text-[#607387]">{sellerProfile.type}</p>
                      <p className="mt-2 break-words text-sm leading-5 text-[#425970]">{sellerProfile.propertyAddress}</p>
                    </div>
                  </div>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: 'Mandate type', value: sellerProfile.mandateType },
                      { label: 'Asking price', value: sellerProfile.askingPrice },
                      { label: 'Seller status', value: sellerProfile.status },
                      { label: 'Profile complete', value: `${sellerProfile.completionPercent}%` },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 rounded-[16px] border border-[#e5edf6] bg-[#fbfdff] px-4 py-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{item.label}</p>
                        <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#243d56]">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
                    <span>Profile completion</span>
                    <span>{sellerProfile.completionPercent}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5edf6]">
                    <div className="h-full rounded-full bg-[#2f8f6b]" style={{ width: `${sellerProfile.completionPercent}%` }} />
                  </div>
                </div>
              </article>

              <section className="grid items-stretch gap-5 md:grid-cols-2 min-[1320px]:grid-cols-3">
                {sellerProfile.sections.map((section) => {
                  const Icon = section.icon || Info
                  return (
                    <article key={section.title} className="flex h-full min-h-[280px] flex-col rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                      <div className="flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#eef5fb] text-[#1f4f78]">
                          <Icon size={18} />
                        </span>
                        <h3 className="min-w-0 break-words text-base font-semibold text-[#142132]">{section.title}</h3>
                      </div>
                      <div className="mt-5 grid gap-0">
                        {section.rows.map((row) => (
                          <div key={`${section.title}-${row.label}`} className="grid gap-1 border-b border-[#e7edf5] py-3 last:border-b-0">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">{row.label}</p>
                            <p className="break-words text-sm font-semibold leading-5 text-[#243d56]">{row.value}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  )
                })}
              </section>
            </section>
          ) : null}

          {sellerWorkspaceTab === 'listing' ? (
            <section className="space-y-5">
              <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-[#142132]">Listing Site Data</h3>
                      <p className="mt-1 text-sm text-[#607387]">Canonical data for the future Arch9 listing site.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" asChild>
                        <a href={arch9PublicListingUrl || `${ARCH9_PUBLIC_SITE_ORIGIN}/buy`} target="_blank" rel="noreferrer">
                          <Eye size={15} />
                          Preview Listing
                        </a>
                      </Button>
                      <Button size="sm" variant="secondary" onClick={copyArch9PublicListingUrl} disabled={!arch9PublicListingUrl}>
                        <Copy size={15} />
                        Copy Link
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => verifyArch9PublicListing()} disabled={!arch9PublicListingUrl || arch9LiveChecking}>
                        {arch9LiveChecking ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        Check Live
                      </Button>
                      {arch9IsPublished ? (
                        <Button size="sm" variant="secondary" onClick={pauseArch9BuyPublication} disabled={publicationSaving}>
                          {publicationSaving ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
                          Pause Arch9 Buy
                        </Button>
                      ) : (
                        <Button size="sm" onClick={publishToArch9Buy} disabled={publicationSaving || !arch9CanPublish}>
                          {publicationSaving ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
                          Publish to Arch9 Buy
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => saveMarketingDraft()}>
                        <FileText size={15} />
                        Save Listing Data
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="grid gap-2 xl:col-span-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Listing Title</span>
                      <Field value={marketingDraft.headline} onChange={(event) => updateMarketingDraft('headline', event.target.value)} placeholder="Modern family home in secure estate" />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Listing Status</span>
                      <Field as="select" value={marketingDraft.publicationStatus} onChange={(event) => updateMarketingDraft('publicationStatus', event.target.value)}>
                        {PUBLICATION_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                    <div className="md:col-span-2">
                      <AddressAutocomplete
                        label="Property Address"
                        value={buildAddressAutocompleteValueFromDraft(marketingDraft)}
                        onChange={(nextAddress) => setMarketingDraft((previous) => mergeAddressIntoMarketingDraft(previous, nextAddress))}
                        placeholder="12 Main Road Bedfordview"
                        description="Used for future listing search, area pages, maps, analytics, and recommendations."
                      />
                    </div>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Suburb</span>
                      <Field value={marketingDraft.suburb} onChange={(event) => updateMarketingDraft('suburb', event.target.value)} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">City</span>
                      <Field value={marketingDraft.city} onChange={(event) => updateMarketingDraft('city', event.target.value)} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Province</span>
                      <Field value={marketingDraft.province} onChange={(event) => updateMarketingDraft('province', event.target.value)} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Postal Code</span>
                      <Field value={marketingDraft.postalCode} onChange={(event) => updateMarketingDraft('postalCode', event.target.value)} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Property Type</span>
                      <Field as="select" value={marketingDraft.propertyType} onChange={(event) => updateMarketingDraft('propertyType', event.target.value)}>
                        {PROPERTY_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Listing Type</span>
                      <Field as="select" value={marketingDraft.listingType} onChange={(event) => updateMarketingDraft('listingType', event.target.value)}>
                        {LISTING_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Asking Price</span>
                      <Field type="number" min="0" step="1000" value={marketingDraft.price} onChange={(event) => updateMarketingDraft('price', event.target.value)} />
                    </label>
                    {[
                      ['bedrooms', 'Bedrooms'],
                      ['bathrooms', 'Bathrooms'],
                      ['garages', 'Garages'],
                      ['parkingBays', 'Parking Bays'],
                      ['floorSize', 'Floor Size (m²)'],
                      ['erfSize', 'Erf / Stand Size (m²)'],
                      ['ratesTaxes', 'Rates and Taxes'],
                      ['levies', 'Levies'],
                    ].map(([key, label]) => (
                      <label key={key} className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">{label}</span>
                        <Field type={['ratesTaxes', 'levies'].includes(key) ? 'text' : 'number'} min="0" value={marketingDraft[key]} onChange={(event) => updateMarketingDraft(key, event.target.value)} />
                      </label>
                    ))}
                    <label className="grid gap-2 xl:col-span-3">
                      <span className="text-sm font-semibold text-[#2d445e]">Description</span>
                      <Field as="textarea" rows={5} value={marketingDraft.description} onChange={(event) => updateMarketingDraft('description', event.target.value)} placeholder="Public-facing listing description." />
                    </label>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="text-sm font-semibold text-[#2d445e]">Key Features</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {FEATURE_OPTIONS.map((feature) => {
                          const active = marketingDraft.selectedFeatures.includes(feature)
                          return (
                            <button
                              key={feature}
                              type="button"
                              onClick={() => toggleFeature(feature)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-[#1f4f78] bg-[#eef5fb] text-[#1f4f78]' : 'border-[#dbe6f2] bg-white text-[#47627c] hover:bg-[#f7fbff]'}`}
                            >
                              {feature}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#2d445e]">Amenities</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {AMENITY_OPTIONS.map((amenity) => {
                          const active = marketingDraft.amenities.includes(amenity)
                          return (
                            <button
                              key={amenity}
                              type="button"
                              onClick={() => toggleAmenity(amenity)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-[#1f4f78] bg-[#eef5fb] text-[#1f4f78]' : 'border-[#dbe6f2] bg-white text-[#47627c] hover:bg-[#f7fbff]'}`}
                            >
                              {amenity}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <label className="inline-flex items-center gap-2 rounded-[14px] border border-[#dbe6f2] bg-[#fbfdff] px-3 py-3 text-sm font-semibold text-[#2d445e]">
                      <input type="checkbox" checked={marketingDraft.petFriendly} onChange={(event) => updateMarketingDraft('petFriendly', event.target.checked)} />
                      Pet friendly
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-[14px] border border-[#dbe6f2] bg-[#fbfdff] px-3 py-3 text-sm font-semibold text-[#2d445e]">
                      <input type="checkbox" checked={marketingDraft.fibreReady} onChange={(event) => updateMarketingDraft('fibreReady', event.target.checked)} />
                      Fibre ready
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Security Features</span>
                      <Field value={marketingDraft.securityFeatures} onChange={(event) => updateMarketingDraft('securityFeatures', event.target.value)} placeholder="Alarm, beams, estate access" />
                    </label>
                  </div>

                  <div className={`mt-5 flex flex-wrap items-center gap-2 rounded-[16px] border p-3 text-sm font-semibold ${
                    mandateWorkspace.isSigned
                      ? 'border-[#d8eddf] bg-[#f2fbf5] text-[#1f7d44]'
                      : 'border-[#f2dfbf] bg-[#fff8ea] text-[#8a5b16]'
                  }`}>
                    {mandateWorkspace.isSigned ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
                    <span>
                      {mandateWorkspace.isSigned
                        ? 'Mandate signed. This is tracked as active agency stock; external portal links can be added when available.'
                        : 'Mandate not signed yet. Capture or send the mandate before this becomes active agency stock.'}
                    </span>
                  </div>
                </article>

                <aside className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                  <h3 className="text-base font-semibold text-[#142132]">Listing Readiness</h3>
                  <p className="mt-1 text-sm text-[#607387]">{listingReadinessCompleted} of {listingReadinessItems.length} completed</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e5edf6]">
                    <div className="h-full rounded-full bg-[#2f8f6b]" style={{ width: `${listingReadinessPercent}%` }} />
                  </div>
                  <div className="mt-5 space-y-3">
                    {listingReadinessItems.map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="inline-flex min-w-0 items-center gap-2 text-[#425970]">
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${item.complete ? 'bg-[#ecfaf1] text-[#1f7d44]' : 'bg-[#f4f7fb] text-[#8aa0b6]'}`}>
                            {item.complete ? <CheckCircle2 size={13} /> : <span className="h-2 w-2 rounded-full bg-current" />}
                          </span>
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.complete ? <CheckCircle2 size={15} className="shrink-0 text-[#1f7d44]" /> : <CircleAlert size={15} className="shrink-0 text-[#9a5b13]" />}
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-[#142132]">Arch9 Buy</h4>
                        <p className="mt-1 text-xs leading-5 text-[#607387]">
                          {arch9IsPublished ? 'Live on the public property catalogue.' : 'Ready listings can be published to www.arch9.co.za/buy.'}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
                        arch9IsPublished
                          ? 'border-[#d8eddf] bg-[#f2fbf5] text-[#1f7d44]'
                          : 'border-[#dbe6f2] bg-white text-[#607387]'
                      }`}>
                        {arch9IsPublished ? 'Published' : 'Not live'}
                      </span>
                    </div>
                    {arch9PublicListingUrl ? (
                      <div className="mt-3 flex min-w-0 items-center gap-2 rounded-[12px] border border-[#e1e9f2] bg-white px-3 py-2 text-xs text-[#425970]">
                        <Link2 size={14} className="shrink-0 text-[#7b8ca2]" />
                        <span className="truncate">{arch9PublicListingUrl}</span>
                      </div>
                    ) : null}
                    {arch9LiveCheck.message ? (
                      <div className={`mt-3 flex items-start gap-2 rounded-[12px] border px-3 py-2 text-xs font-semibold leading-5 ${arch9LiveCheckClass(arch9LiveCheck.status)}`}>
                        {arch9LiveChecking || arch9LiveCheck.status === 'checking' ? (
                          <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" />
                        ) : arch9LiveCheck.status === 'live' ? (
                          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                        ) : (
                          <CircleAlert size={14} className="mt-0.5 shrink-0" />
                        )}
                        <span>{arch9LiveCheck.message}</span>
                      </div>
                    ) : null}
                    {arch9PublicationBlockers.length ? (
                      <div className="mt-4 space-y-2">
                        {arch9PublicationBlockers.map((blocker) => (
                          <div key={blocker} className="flex items-start gap-2 text-xs leading-5 text-[#7a5a1b]">
                            <CircleAlert size={14} className="mt-0.5 shrink-0" />
                            <span>{blocker}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#1f7d44]">
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                        <span>Meets the public listing requirements.</span>
                      </div>
                    )}
                  </div>
                </aside>
              </section>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[#142132]">Listing Media</h3>
                    <p className="mt-1 text-sm text-[#607387]">Images, floor plans, video, and tour assets for the listing site.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:border-[#b7c8db] hover:bg-[#f7fbff]">
                      <Upload size={15} />
                      Upload Images
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} disabled={gallerySaving} />
                    </label>
                    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:border-[#b7c8db] hover:bg-[#f7fbff]">
                      <FileText size={15} />
                      Upload Floor Plan
                      <input type="file" accept=".pdf,image/*" multiple className="hidden" onChange={handleFloorplanUpload} disabled={gallerySaving} />
                    </label>
                  </div>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
                  <div>
                    <p className="text-sm font-semibold text-[#2d445e]">Main Cover Image</p>
                    <div className="mt-2 h-44 overflow-hidden rounded-[18px] border border-[#dce6f2] bg-[#eef4fa]">
                      {coverImage ? getImageBlock(coverImage.url, coverImage.name) : (
                        <div className="grid h-full place-items-center text-sm font-semibold text-[#6b7d93]">
                          No cover image
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#2d445e]">Gallery Images ({marketingDraft.galleryImages.length})</p>
                    <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                      {marketingDraft.galleryImages.map((image, index) => {
                        const isCover = String(image.id) === String(marketingDraft.coverImageId)
                        return (
                          <div key={image.id} className="group overflow-hidden rounded-[16px] border border-[#dce6f2] bg-white">
                            <div className="relative h-28 bg-[#eef4fa]">
                              {getImageBlock(image.url, image.name)}
                              {isCover ? <span className="absolute left-2 top-2 rounded-full bg-[#123955] px-2 py-1 text-[0.65rem] font-semibold text-white">Cover</span> : null}
                              <button type="button" onClick={() => removeGalleryImage(image.id)} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-[#6b7d93] shadow-sm hover:text-[#142132]">
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <div className="flex items-center justify-between gap-2 p-2">
                              <button type="button" onClick={() => setCoverImage(image.id)} disabled={isCover || gallerySaving} className="text-xs font-semibold text-[#1f4f78] disabled:text-[#9aa9b8]">Set cover</button>
                              <div className="flex gap-1">
                                <button type="button" onClick={() => moveGalleryImage(image.id, 'left')} disabled={index === 0 || gallerySaving} className="rounded border border-[#dbe6f2] p-1 text-[#607387] disabled:opacity-40"><ChevronLeft size={14} /></button>
                                <button type="button" onClick={() => moveGalleryImage(image.id, 'right')} disabled={index === marketingDraft.galleryImages.length - 1 || gallerySaving} className="rounded border border-[#dbe6f2] p-1 text-[#607387] disabled:opacity-40"><ChevronRight size={14} /></button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      <label className="grid min-h-[150px] cursor-pointer place-items-center rounded-[16px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] text-center text-sm font-semibold text-[#5f7894] hover:bg-[#f7fbff]">
                        <span className="grid gap-2 justify-items-center">
                          <ImagePlus size={20} />
                          Add More
                        </span>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} disabled={gallerySaving} />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm font-semibold text-[#2d445e]">Floor Plan</p>
                    <div className="mt-2 space-y-2">
                      {marketingDraft.floorplans.length ? marketingDraft.floorplans.map((plan) => (
                        <div key={plan.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-2">
                          <span className="truncate text-sm font-semibold text-[#243d56]">{plan.label || plan.name}</span>
                          <button type="button" onClick={() => removeFloorplan(plan.id)} className="text-[#6b7d93] hover:text-[#142132]"><Trash2 size={15} /></button>
                        </div>
                      )) : <p className="rounded-[14px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-3 py-2 text-sm text-[#607387]">No floor plan uploaded.</p>}
                    </div>
                  </div>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Video Link</span>
                    <Field value={marketingDraft.videoLink} onChange={(event) => updateMarketingDraft('videoLink', event.target.value)} placeholder="https://youtu.be/..." />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Virtual Tour Link</span>
                    <Field value={marketingDraft.virtualTourLink} onChange={(event) => updateMarketingDraft('virtualTourLink', event.target.value)} placeholder="https://my.matterport.com/..." />
                  </label>
                </div>
              </article>

              <article className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[#142132]">External Listing Links</h3>
                    <p className="mt-1 text-sm text-[#607387]">Track where the property has been published. Live links are visible to the seller.</p>
                  </div>
                  <Button size="sm" onClick={saveMarketingDraft}>Save Link Changes</Button>
                </div>

                <form onSubmit={addExternalListingLink} className="mt-5 grid min-w-0 gap-3 rounded-[18px] border border-[#e1e9f2] bg-[#fbfdff] p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[minmax(150px,0.9fr)_minmax(220px,1.4fr)_minmax(130px,0.8fr)_minmax(140px,0.8fr)_minmax(140px,0.8fr)_minmax(160px,1fr)]">
                  <Field as="select" value={externalLinkDraft.platform} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, platform: event.target.value }))}>
                    {EXTERNAL_LINK_PLATFORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Field>
                  <Field value={externalLinkDraft.url} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, url: event.target.value }))} placeholder="https://..." />
                  <Field as="select" value={externalLinkDraft.status} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, status: event.target.value }))}>
                    {EXTERNAL_LINK_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Field>
                  <Field type="date" value={externalLinkDraft.publishedAt} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, publishedAt: event.target.value }))} />
                  <Field type="date" value={externalLinkDraft.lastCheckedAt} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, lastCheckedAt: event.target.value }))} />
                  <Field value={externalLinkDraft.notes} onChange={(event) => setExternalLinkDraft((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Notes" />
                  <div className="flex justify-end sm:col-span-2 xl:col-span-3 2xl:col-span-6">
                    <Button type="submit" size="sm">
                      <Plus size={15} />
                      Add Listing Link
                    </Button>
                  </div>
                </form>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="text-[0.66rem] uppercase tracking-[0.1em] text-[#7b8ca2]">
                      <tr className="border-b border-[#e5edf6]">
                        <th className="px-3 py-3">Platform</th>
                        <th className="px-3 py-3">Listing URL</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Published</th>
                        <th className="px-3 py-3">Last Checked</th>
                        <th className="px-3 py-3">Visible</th>
                        <th className="px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2f7]">
                      {normalizeExternalListingLinks(marketingDraft.externalLinks).map((link) => (
                        <tr key={link.id} className="align-top">
                          <td className="px-3 py-3">
                            <Field as="select" value={link.platform} onChange={(event) => updateExternalListingLink(link.id, 'platform', event.target.value)}>
                              {EXTERNAL_LINK_PLATFORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                            </Field>
                          </td>
                          <td className="px-3 py-3"><Field value={link.url} onChange={(event) => updateExternalListingLink(link.id, 'url', event.target.value)} /></td>
                          <td className="px-3 py-3">
                            <Field as="select" value={link.status} onChange={(event) => updateExternalListingLink(link.id, 'status', event.target.value)}>
                              {EXTERNAL_LINK_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                            </Field>
                          </td>
                          <td className="px-3 py-3"><Field type="date" value={link.publishedAt} onChange={(event) => updateExternalListingLink(link.id, 'publishedAt', event.target.value)} /></td>
                          <td className="px-3 py-3"><Field type="date" value={link.lastCheckedAt} onChange={(event) => updateExternalListingLink(link.id, 'lastCheckedAt', event.target.value)} /></td>
                          <td className="px-3 py-3"><StatusPill status={link.visibleToSeller ? 'done' : 'pending'} label={link.visibleToSeller ? 'Seller' : 'Internal'} /></td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-2">
                              {link.url ? (
                                <a href={link.url} target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-lg border border-[#dbe6f2] text-[#1f4f78]" aria-label={`Open ${link.platform}`}>
                                  <ExternalLink size={15} />
                                </a>
                              ) : null}
                              <button type="button" onClick={() => removeExternalListingLink(link.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#f1c8c8] text-[#b42318]" aria-label={`Remove ${link.platform}`}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!normalizeExternalListingLinks(marketingDraft.externalLinks).length ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-sm text-[#607387]">No external listing links captured yet.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          ) : null}

          {sellerWorkspaceTab === 'documents' ? (
            <article className="overflow-hidden rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed text-left text-sm">
                  <thead className="bg-[#f8fbfd] text-[0.66rem] uppercase tracking-[0.1em] text-[#7b8ca2]">
                    <tr className="border-b border-[#e5edf6]">
                      <th className="w-[34%] px-5 py-3">Document</th>
                      <th className="w-[18%] px-5 py-3">Source</th>
                      <th className="w-[16%] px-5 py-3">Status</th>
                      <th className="w-[18%] px-5 py-3">Uploaded On</th>
                      <th className="w-[14%] px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2f7]">
                    {sellerDocumentTrackerRows.map((doc) => (
                      <tr key={doc.key} className="text-[#425970] transition hover:bg-[#fbfdff]">
                        <td className="px-5 py-4">
                          <p className="truncate font-semibold text-[#243d56]" title={doc.label}>{doc.label}</p>
                          <p className="mt-1 text-xs text-[#74879d]">{doc.required ? 'Required seller document' : 'Optional seller document'}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-[#607387]">{doc.uploaded ? 'Seller portal / linked document' : 'Requirement checklist'}</td>
                        <td className="px-5 py-4"><StatusPill status={doc.uploaded ? 'uploaded' : 'missing'} label={doc.uploaded ? 'Uploaded' : 'Missing'} /></td>
                        <td className="px-5 py-4">{doc.uploadedOn ? formatDate(doc.uploadedOn) : '—'}</td>
                        <td className="px-5 py-4 text-right">
                          {doc.url || doc.filePath ? (
                            <button
                              type="button"
                              onClick={() => handleOpenSellerDocument(doc)}
                              disabled={openingSellerDocumentKey === doc.key}
                              className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f4f78] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {openingSellerDocumentKey === doc.key ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                              Download
                            </button>
                          ) : (
                            <span className="text-xs text-[#9aa9b8]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
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
          {sellerReadinessSummary ? (
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <h3 className="text-[1rem] font-semibold text-[#142132]">Seller Requirement Summary</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <MetricCard label="Completion" value={`${sellerReadinessSummary.requirementCompletionPct}%`} meta="Dynamic seller requirement progress" />
                <MetricCard label="Missing" value={sellerReadinessSummary.missingRequirementsCount} meta="Outstanding requirement count" />
                <MetricCard label="Mandate Ready" value={sellerReadinessSummary.mandateReady ? 'Yes' : 'No'} meta="Based on onboarding + mandate inputs" />
                <MetricCard label="Active Ready" value={sellerReadinessSummary.activeReady ? 'Yes' : 'No'} meta="Ready for activation checks" />
              </div>
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
                        </div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClass(doc.status)}`}>
                          {formatStatusLabel(doc.status)}
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
    </section>
  )
}

export default AgentListingDetail
