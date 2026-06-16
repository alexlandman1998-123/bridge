import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  Clock3,
  CreditCard,
  Building2,
  ExternalLink,
  FileText,
  Home,
  Mail,
  MapPin,
  MessageSquarePlus,
  MoreVertical,
  Banknote,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Tag,
  Target,
  Trash2,
  UserRound,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppointmentDashboardSection from '../components/appointments/dashboard/AppointmentDashboardSection'
import LoadingSkeleton from '../components/LoadingSkeleton'
import Modal from '../components/ui/Modal'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  createAgencyCrmLeadActivity,
  createAgencyCrmLeadRecord,
  createAgencyCrmLeadTask,
  deleteAgencyCrmLeadRecord,
  ensureAgencyCrmLeadRecordPersisted,
  updateAgencyCrmLeadRecord,
} from '../lib/agencyCrmRepository'
import { buildSellerClientPortalLink } from '../lib/agentListingStorage'
import { createAppointmentAsync, updateAppointmentAsync } from '../lib/agencyPipelineService'
import {
  createCanonicalOffer,
  createOfferPortalSession,
  createTransactionFromAcceptedCanonicalOffer,
  getOfferLifecycleSummary,
  updateCanonicalOfferStatus,
  upsertAppointmentViewedListings,
} from '../lib/buyerLifecycleService'
import { cancelTransactionLifecycle } from '../lib/api'
import {
  getDocumentStatusLabel,
  getDocumentStatusTone,
  normalizeDocumentStatus,
} from '../lib/clientPortalDocumentStatus'
import { normalizeLeadCategory as normalizeCanonicalLeadCategory } from '../lib/leadCategory'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import {
  fetchAgentLeadWorkspace,
  filterAgentLeadRows,
  getLeadFilterOptions,
  listAgentLeadWorkspaceRows,
} from '../services/agentLeadWorkspaceService'
import {
  dismissLeadListingInterest,
  listSearchablePrivateListings,
  markLeadListingInterestSent,
  markLeadListingInterestViewed,
  scheduleViewingFromLeadListingInterest,
  updateLeadListingInterestNotes,
  updateLeadListingInterestStatus,
  upsertLeadListingInterest,
} from '../services/leadListingInterestService'
import {
  createPrivateListing,
  createPrivateListingActivity,
  sendSellerOnboarding,
  updatePrivateListingOnboardingFormData,
} from '../services/privateListingService'
import {
  createBlankPropertyAddress,
  formatPropertyAddress,
  normalizePropertyAddress,
} from '../lib/sellerPropertyAddress'
import { listOrganisationCommissionStructures } from '../lib/settingsApi'
import {
  activateLeadRequirement,
  archiveLeadRequirement,
  buildRequirementFromLeadFallback,
  buildRequirementSummary,
  createLeadRequirement,
  LEAD_REQUIREMENT_FINANCE_STATUSES,
  LEAD_REQUIREMENT_INTENT_TYPES,
  LEAD_REQUIREMENT_STATUSES,
  LEAD_REQUIREMENT_TIMELINES,
  LEAD_REQUIREMENT_URGENCIES,
  pauseLeadRequirement,
  setPrimaryLeadRequirement,
  updateLeadRequirement,
} from '../services/leadRequirementService'
import {
  addMatchesToLead,
  findListingsForRequirement,
} from '../services/leadMatchingService'
import {
  assignLeadToAgent,
  assignLeadToQueue,
  autoAssignLead,
  canManageLeadAssignment,
  LEAD_ASSIGNMENT_QUEUES,
  markLeadFirstContacted,
} from '../services/leadAssignmentService'
import {
  filterCommunicationTimeline,
  LEAD_COMMUNICATION_DIRECTIONS,
  LEAD_COMMUNICATION_TYPES,
  logCall,
  logEmail,
  logMeeting,
  logNote,
  logWhatsApp,
} from '../services/leadCommunicationService'
import {
  createLeadSavedSearch,
  disableLeadSavedSearch,
  enableLeadSavedSearch,
  previewPropertyMessage,
  sendListingToLead,
  updateLeadSavedSearch,
} from '../services/leadPropertySharingService'
import {
  buildDefaultLeadCommunicationPreferences,
  normalizeLeadCommunicationPreferences,
} from '../services/communicationDeliveryService'
import { listLeadCommunicationTemplates } from '../services/leadCommunicationTemplateService'
import { buildLeadWorkspaceAnalyticsSummary } from '../services/leadAnalyticsService'
import { buildSellerJourney } from '../services/sellerJourneyService'
import { buildSellerReadinessSummary } from '../services/sellerReadinessService'
import { getSellerRequiredDocuments } from '../services/sellerDocumentRequirementsService'
import {
  buildSellerRequirementProfile,
} from '../lib/sellerDocumentRequirementEngine'
import {
  acceptRecommendation,
  completeRecommendation,
  convertRecommendationToTask,
  dismissRecommendation as dismissLeadRecommendation,
} from '../services/leadRecommendationService'
import {
  acceptSuggestion,
  generateSuggestionsForLead,
  rejectSuggestion,
} from '../services/leadSuggestionService'

const pageShell = 'mx-auto flex w-full min-w-0 max-w-[1760px] flex-col gap-5'
const leadListShell = 'mx-auto flex w-full min-w-0 max-w-[1760px] flex-col gap-5'
const panelClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm'
const buyerWorkspaceCardClass = `${panelClass} card`
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LEAD_APPOINTMENT_TYPES = [
  { value: 'viewing', label: 'Viewing' },
  { value: 'buyer_consultation', label: 'Buyer Consultation' },
  { value: 'otp_signing', label: 'OTP Signing' },
  { value: 'other', label: 'Other Appointment' },
]
const SELLER_APPOINTMENT_TYPES = [
  { value: 'seller_consultation', label: 'Seller Consultation' },
  { value: 'other', label: 'Seller Appointment' },
  { value: 'mandate_signing', label: 'Mandate Signing' },
  { value: 'client_meeting', label: 'Client Meeting' },
]
const VIEWING_OUTCOME_OPTIONS = [
  'Interested',
  'Needs second viewing',
  'Offer discussed',
  'Not interested',
]
const VIEWING_NEXT_STEP_OPTIONS = [
  'Send offer link',
  'Schedule second viewing',
  'Follow up with buyer',
  'Close out property',
]
const LEAD_CATEGORY_FILTERS = [
  { key: 'buyer', label: 'Buyer Leads' },
  { key: 'seller', label: 'Seller Leads' },
  { key: 'other', label: 'Other' },
  { key: 'archived', label: 'Archived' },
]
const LEAD_SOURCE_PILL_STYLES = {
  property24: { tone: 'blue', label: 'Property24' },
  privateProperty: { tone: 'green', label: 'Private Property' },
  website: { tone: 'violet', label: 'Website' },
  whatsapp: { tone: 'emerald', label: 'WhatsApp' },
  call: { tone: 'red', label: 'Call' },
  referral: { tone: 'amber', label: 'Referral' },
  walkIn: { tone: 'slate', label: 'Walk-in' },
  unknown: { tone: 'slate', label: 'Unknown' },
}
const LEAD_SOURCE_PILL_FALLBACK = LEAD_SOURCE_PILL_STYLES.unknown
const LEAD_SOURCE_PILL_ORDER = ['property24', 'privateProperty', 'whatsapp', 'call', 'website', 'referral', 'walkIn', 'unknown']
const LEAD_SOURCE_OPTIONS = [
  'Property24',
  'Private Property',
  'Website',
  'Referral',
  'Walk-In',
  'WhatsApp',
  'Facebook',
  'Google',
  'Signboard',
  'Canvassing',
  'Manual Entry',
  'Other / Unknown',
]
const EMPTY_LEAD_CREATE_FORM = {
  name: '',
  phone: '',
  email: '',
  source: 'Manual Entry',
  budget: '',
  areaInterest: '',
  propertyInterest: '',
  sellerPropertyAddress: '',
  estimatedValue: '',
  assignedAgent: '',
  notes: '',
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function splitName(fullName = '') {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  }
}

function normalizeLeadSourceOption(value = '') {
  const normalized = normalizeText(value)
  return LEAD_SOURCE_OPTIONS.includes(normalized) ? normalized : LEAD_SOURCE_OPTIONS[LEAD_SOURCE_OPTIONS.length - 1]
}

function normalizeLeadSourceForPill(value = '') {
  const source = normalizeText(value).toLowerCase()
  if (!source) return 'unknown'
  if (source.includes('property24')) return 'property24'
  if (source.includes('private') && source.includes('property')) return 'privateProperty'
  if (source.includes('whatsapp')) return 'whatsapp'
  if (source === 'call' || source.includes('phone')) return 'call'
  if (source.includes('website')) return 'website'
  if (source.includes('referral')) return 'referral'
  if (source.includes('walk in') || source.includes('walk-in')) return 'walkIn'
  if (source.includes('other') || source.includes('unknown')) return 'unknown'
  if (source.includes('manual')) return 'unknown'
  return 'unknown'
}

function readDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(value, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(value, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  const diffMs = Date.now() - date.getTime()
  const future = diffMs < 0
  const absMs = Math.abs(diffMs)
  const minutes = Math.round(absMs / 60_000)
  if (minutes < 1) return future ? 'Soon' : 'Just now'
  if (minutes < 60) return future ? `in ${minutes} min` : `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return future ? `in ${hours} hour${hours === 1 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 14) return future ? `in ${days} day${days === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(value)
}

function formatCurrency(value) {
  const number = Number(value || 0)
  if (!number) return '—'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(number)
}

function formatDuration(seconds) {
  const total = Number(seconds || 0)
  if (!total) return ''
  const minutes = Math.round(total / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function parseListInput(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  return normalizeText(value).split(/[,;\n]/).map(normalizeText).filter(Boolean)
}

function listToInput(value) {
  return Array.isArray(value) ? value.join(', ') : normalizeText(value)
}

function formatList(value) {
  const items = parseListInput(value)
  return items.length ? items.join(', ') : '—'
}

function isEnquiryActivity(activity = {}) {
  const haystack = `${activity.activityType || activity.activity_type || ''} ${activity.activityNote || activity.activity_note || ''}`.toLowerCase()
  return haystack.includes('enquiry') || haystack.includes('inquiry')
}

function getLeadSourceInfo(row = {}) {
  const enquiryActivities = (Array.isArray(row.activities) ? row.activities : []).filter(isEnquiryActivity)
  const firstActivity = enquiryActivities[enquiryActivities.length - 1] || null
  const latestActivity = enquiryActivities[0] || null
  const sourceFromType = (activity) => normalizeText(activity?.activityType || activity?.activity_type).replace(/enquiry received/i, '').trim()
  const explicitSource = normalizeText(row.source || row.leadSource || row.lead_source)
  const source = explicitSource && !['unknown', 'other'].includes(explicitSource.toLowerCase())
    ? explicitSource
    : normalizeText(row.canvassingProspectId || row.canvassing_prospect_id) || /canvassing prospect id:/i.test(normalizeText(row.notes))
      ? 'Canvassing'
      : explicitSource || 'Unknown'
  return {
    leadSource: source,
    originalSource: sourceFromType(firstActivity) || source,
    firstSource: sourceFromType(firstActivity) || source,
    latestSource: sourceFromType(latestActivity) || source,
    enquiryActivities,
  }
}

function makeRequirementDraft(requirement = null, lead = null) {
  const source = requirement || buildRequirementFromLeadFallback(lead || {})
  return {
    title: source.title || '',
    intentType: source.intentType || 'buy',
    propertyCategory: source.propertyCategory || '',
    propertyTypes: listToInput(source.propertyTypes),
    areas: listToInput(source.areas),
    suburbs: listToInput(source.suburbs),
    city: source.city || '',
    province: source.province || '',
    budgetMin: source.budgetMin ?? '',
    budgetMax: source.budgetMax ?? '',
    bedroomsMin: source.bedroomsMin ?? '',
    bathroomsMin: source.bathroomsMin ?? '',
    garagesMin: source.garagesMin ?? '',
    parkingMin: source.parkingMin ?? '',
    erfSizeMin: source.erfSizeMin ?? '',
    floorSizeMin: source.floorSizeMin ?? '',
    mustHaves: listToInput(source.mustHaves),
    niceToHaves: listToInput(source.niceToHaves),
    dealBreakers: listToInput(source.dealBreakers),
    financeStatus: source.financeStatus || 'unknown',
    financeType: source.financeType || '',
    preApproved: source.preApproved === null || source.preApproved === undefined ? '' : String(Boolean(source.preApproved)),
    depositAvailable: source.depositAvailable === null || source.depositAvailable === undefined ? '' : String(Boolean(source.depositAvailable)),
    timeline: source.timeline || '',
    urgency: source.urgency || '',
    communicationPreference: source.communicationPreference || '',
    consentToReceiveMatches: Boolean(source.consentToReceiveMatches),
    notes: source.notes || '',
    status: source.status || 'active',
    isPrimary: Boolean(source.isPrimary),
  }
}

function draftToRequirementPayload(draft = {}, lead = {}, organisationId = '', actor = {}) {
  return {
    organisationId,
    lead,
    leadId: lead.leadId,
    contactId: lead.contactId,
    title: draft.title,
    intentType: draft.intentType || 'buy',
    propertyCategory: draft.propertyCategory,
    propertyTypes: parseListInput(draft.propertyTypes),
    areas: parseListInput(draft.areas),
    suburbs: parseListInput(draft.suburbs),
    city: draft.city,
    province: draft.province,
    budgetMin: draft.budgetMin,
    budgetMax: draft.budgetMax,
    bedroomsMin: draft.bedroomsMin,
    bathroomsMin: draft.bathroomsMin,
    garagesMin: draft.garagesMin,
    parkingMin: draft.parkingMin,
    erfSizeMin: draft.erfSizeMin,
    floorSizeMin: draft.floorSizeMin,
    mustHaves: parseListInput(draft.mustHaves),
    niceToHaves: parseListInput(draft.niceToHaves),
    dealBreakers: parseListInput(draft.dealBreakers),
    financeStatus: draft.financeStatus || 'unknown',
    financeType: draft.financeType,
    preApproved: draft.preApproved,
    depositAvailable: draft.depositAvailable,
    timeline: draft.timeline,
    urgency: draft.urgency,
    communicationPreference: draft.communicationPreference,
    consentToReceiveMatches: draft.consentToReceiveMatches,
    notes: draft.notes,
    status: draft.status || 'active',
    isPrimary: draft.isPrimary,
    createdBy: actor?.id,
  }
}

function makeSavedSearchDraft(savedSearch = null, requirement = null) {
  return {
    savedSearchId: savedSearch?.savedSearchId || '',
    searchName: savedSearch?.searchName || (requirement ? buildRequirementSummary(requirement) : ''),
    requirementId: savedSearch?.requirementId || requirement?.requirementId || '',
    active: savedSearch ? Boolean(savedSearch.active) : true,
    consentGiven: savedSearch ? Boolean(savedSearch.consentGiven) : Boolean(requirement?.consentToReceiveMatches),
    emailEnabled: savedSearch ? Boolean(savedSearch.emailEnabled) : true,
    whatsappEnabled: savedSearch ? Boolean(savedSearch.whatsappEnabled) : false,
    frequency: savedSearch?.frequency || 'manual_only',
  }
}

function savedSearchPayloadFromDraft(draft = {}, lead = {}, organisationId = '') {
  return {
    organisationId,
    lead,
    leadId: lead.leadId,
    requirementId: draft.requirementId,
    searchName: draft.searchName || 'Saved Search',
    active: draft.active,
    consentGiven: draft.consentGiven,
    emailEnabled: draft.emailEnabled,
    whatsappEnabled: draft.whatsappEnabled,
    frequency: draft.frequency || 'manual_only',
  }
}

function getOrganisationId(workspaceContext = {}) {
  return normalizeText(workspaceContext.currentWorkspace?.id || workspaceContext.workspace?.id)
}

function getActor(profile = {}) {
  return {
    id: normalizeText(profile?.id || profile?.user_id || profile?.userId || profile?.email),
    userId: normalizeText(profile?.userId || profile?.user_id || profile?.id || profile?.email),
    email: normalizeText(profile?.email).toLowerCase(),
    name: normalizeText(profile?.fullName || profile?.full_name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')),
    fullName: normalizeText(profile?.fullName || profile?.full_name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')),
    role: normalizeText(profile?.role || profile?.workspaceRole || profile?.workspace_role || profile?.organisationRole || profile?.organisation_role),
    workspaceRole: normalizeText(profile?.workspaceRole || profile?.workspace_role || profile?.organisationRole || profile?.organisation_role || profile?.role),
  }
}

function StatusPill({ children, tone = 'slate', className = '' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-rose-50 text-rose-700',
    violet: 'bg-violet-50 text-violet-700',
  }
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${tones[tone] || tones.slate} ${className}`.trim()}>{children}</span>
}

function getStageTone(stage = '') {
  const normalized = stage.toLowerCase()
  if (normalized.includes('lost')) return 'red'
  if (normalized.includes('converted') || normalized.includes('accepted') || normalized.includes('registered')) return 'green'
  if (normalized.includes('offer') || normalized.includes('viewing') || normalized.includes('appointment')) return 'amber'
  if (normalized.includes('new') || normalized.includes('contacted') || normalized.includes('qualified')) return 'blue'
  return 'slate'
}

function getSlaTone(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'escalated' || normalized === 'overdue') return 'red'
  if (normalized === 'due_soon') return 'amber'
  if (normalized === 'contacted' || normalized === 'on_track') return 'green'
  if (normalized === 'awaiting_assignment') return 'blue'
  return 'slate'
}

function formatSlaStatus(status = '') {
  return normalizeText(status).replace(/_/g, ' ') || 'Unknown'
}

function normalizeLeadCategory(row = {}) {
  const raw = normalizeText(row.leadCategory || row.lead_category || row.leadDirection || row.lead_direction || row.type).toLowerCase()
  if (raw.includes('seller') || raw.includes('vendor') || raw.includes('landlord')) return 'seller'
  if (raw.includes('buyer') || raw.includes('purchaser')) return 'buyer'
  return 'other'
}

function isArchivedLead(row = {}) {
  const lifecycle = `${row.stage || ''} ${row.status || ''} ${row.lifecycleStatus || row.lifecycle_status || ''}`.toLowerCase()
  return lifecycle.includes('archived')
}

function isUuidLike(value = '') {
  return UUID_PATTERN.test(normalizeText(value))
}

function getLeadDisplayReference(row = {}) {
  const explicitReference = normalizeText(
    row.displayReference ||
      row.display_reference ||
      row.referenceNumber ||
      row.reference_number ||
      row.reference ||
      row.leadReference ||
      row.lead_reference ||
      row.transactionReference ||
      row.transaction_reference,
  )
  if (!explicitReference || isUuidLike(explicitReference)) return ''
  return explicitReference
}

function getOwnerName(row = {}) {
  const owner = normalizeText(row.assignedAgentName || row.assigned_agent_name || row.assignedAgent || row.assigned_agent || row.assignedAgentEmail || row.assigned_agent_email)
  if (!owner || isUuidLike(owner)) return 'Unassigned'
  if (owner.includes('@')) return owner.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  return owner
}

function getLeadContextSummary(row = {}) {
  const category = normalizeLeadCategory(row)
  if (category === 'seller') {
    return normalizeText(
      row.sellerPropertyAddress ||
      row.seller_property_address ||
      row.propertyAddress ||
      row.property_address ||
      row.listings?.[0]?.title ||
      row.listings?.[0]?.address,
    ) || 'Property Not Linked'
  }
  if (category === 'buyer') {
    return normalizeText(row.requirementSummary) ||
      normalizeText(row.propertyInterest || row.property_interest) ||
      normalizeText(row.areaInterest || row.area_interest) ||
      ''
  }
  return normalizeText(row.propertyInterest || row.property_interest || row.areaInterest || row.area_interest)
}

function titleCaseLabel(value = '') {
  const text = normalizeText(value)
  if (!text) return '—'
  if (text.includes('@')) return text
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bId\b/g, 'ID')
    .replace(/\bPopi\b/g, 'POPI')
}

function formatCleanValue(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.map(titleCaseLabel).join(', ') : fallback
  return titleCaseLabel(value)
}

function getSellerAppointmentDefaultTitle(appointmentType = 'seller_consultation', contactName = '', leadName = '') {
  const personName = contactName || leadName || 'Seller'
  if (appointmentType === 'seller_consultation') return `Seller Consultation - ${personName}`
  if (appointmentType === 'mandate_signing') return `Mandate Signing - ${personName}`
  if (appointmentType === 'client_meeting') return `Client Meeting - ${personName}`
  return `Seller appointment - ${personName}`
}

function readFirstValue(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key]
    if (Array.isArray(value) ? value.length : normalizeText(value)) return value
  }
  return ''
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function firstFilledValue(...values) {
  for (const value of values) {
    if (Array.isArray(value) ? value.length : normalizeText(value)) return value
  }
  return ''
}

function normalizeCommissionTermType(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (['fixed', 'amount', 'flat', 'flat_fee'].includes(normalized)) return 'fixed'
  return 'percentage'
}

function readSellerOnboardingFormData(listing = {}, row = {}) {
  const records = [row, listing]
  const merged = {}

  const unwrapCandidate = (candidate) => {
    if (!isPlainObject(candidate)) return null
    if (isPlainObject(candidate?.formData)) return candidate.formData
    if (isPlainObject(candidate?.form_data)) return candidate.form_data
    return candidate
  }

  for (const record of records) {
    if (!record || typeof record !== 'object') continue

    const onboarding = record?.sellerOnboarding ||
      record?.seller_onboarding ||
      record?.sellerOnboardingRecord ||
      record?.seller_onboarding_record ||
      {}
    const canonicalFacts = record?.sellerCanonicalFacts ||
      record?.seller_canonical_facts_json ||
      onboarding?.canonicalFacts ||
      onboarding?.canonical_facts_json ||
      {}
    const canonicalProperty = isPlainObject(canonicalFacts?.property) ? canonicalFacts.property : {}
    const canonicalTransaction = isPlainObject(canonicalFacts?.transaction) ? canonicalFacts.transaction : {}
    const canonicalSeller = isPlainObject(canonicalFacts?.seller) ? canonicalFacts.seller : {}
    const propertyDetails = isPlainObject(record?.propertyDetails)
      ? record.propertyDetails
      : isPlainObject(record?.property_details)
        ? record.property_details
        : {}
    const marketing = isPlainObject(record?.marketing) ? record.marketing : {}

    const candidates = [
      record?.onboardingDataSnapshot,
      record?.sellerOnboardingFormData,
      record?.seller_onboarding_form_data,
      record?.onboardingFormData,
      record?.onboarding_form_data,
      onboarding?.formData,
      onboarding?.form_data,
      onboarding,
      {
        sellerFirstName: canonicalSeller.first_name,
        sellerSurname: canonicalSeller.surname,
        email: canonicalSeller.email,
        phone: canonicalSeller.phone,
        propertyAddress: canonicalProperty.address,
        propertyAddressLine1: canonicalProperty.address_line_1,
        suburb: canonicalProperty.suburb,
        city: canonicalProperty.city,
        province: canonicalProperty.province,
        postalCode: canonicalProperty.postal_code,
        propertyType: canonicalProperty.property_type,
        bedrooms: canonicalProperty.bedrooms,
        bathrooms: canonicalProperty.bathrooms,
        erfSize: canonicalProperty.erf_size,
        floorSize: canonicalProperty.floor_size,
        askingPrice: canonicalTransaction.asking_price,
        mandateType: canonicalTransaction.mandate_type,
      },
      {
        propertyAddress: propertyDetails.propertyAddress || propertyDetails.address || propertyDetails.formattedAddress,
        propertyAddressLine1: propertyDetails.addressLine1 || propertyDetails.address_line_1,
        propertyAddressLine2: propertyDetails.addressLine2 || propertyDetails.address_line_2,
        suburb: propertyDetails.suburb,
        city: propertyDetails.city,
        province: propertyDetails.province,
        postalCode: propertyDetails.postalCode || propertyDetails.postal_code,
        propertyType: propertyDetails.propertyType || propertyDetails.property_type,
        bedrooms: propertyDetails.bedrooms,
        bathrooms: propertyDetails.bathrooms,
        garages: propertyDetails.garages,
        erfSize: propertyDetails.erfSize || propertyDetails.erf_size,
        floorSize: propertyDetails.floorSize || propertyDetails.floor_size,
        askingPrice: propertyDetails.price || propertyDetails.askingPrice || propertyDetails.asking_price,
        levies: propertyDetails.levies,
        ratesTaxes: propertyDetails.ratesTaxes || propertyDetails.rates_taxes,
        saleType: propertyDetails.saleType || propertyDetails.sale_type,
        features: propertyDetails.selectedFeatures || propertyDetails.features || marketing.selectedFeatures,
        propertyNotes: propertyDetails.description || propertyDetails.notes || marketing.description,
        listingPreviewDescription: propertyDetails.listingPreviewDescription || marketing.listingPreviewDescription,
      },
    ]

    for (const candidate of candidates) {
      const unwrapped = unwrapCandidate(candidate)
      if (!isPlainObject(unwrapped)) continue
      const cloned = clonePlainObject(unwrapped)
      for (const [key, value] of Object.entries(cloned)) {
        if (!key || value === undefined || value === null) continue
        if (typeof value === 'string' && !value.trim() && hasValue(merged[key])) continue
        if (Array.isArray(value) && !value.length && hasValue(merged[key])) continue
        merged[key] = value
      }
    }
  }

  return merged
}

function getSellerCommissionWorkspace(row = {}, listing = {}) {
  const formData = readSellerOnboardingFormData(listing || row)
  const commission = listing?.commission && typeof listing.commission === 'object' ? listing.commission : {}
  const commissionType = normalizeCommissionTermType(firstFilledValue(
    commission.commission_structure,
    commission.commissionStructure,
    commission.commission_type,
    commission.commissionType,
    formData.commissionStructure,
    formData.commissionType,
    row.commissionStructure,
    row.commissionType,
    'percentage',
  ))
  const percentage = toFiniteNumber(firstFilledValue(
    commission.commission_percentage,
    commission.percentage,
    formData.commissionPercentage,
    formData.commissionPercent,
    formData.commission_percent,
    formData.mandateCommissionPercentage,
    formData.mandateCommissionPercent,
    row.commissionPercentage,
    row.commissionPercent,
    row.mandateCommissionPercentage,
    row.mandateCommissionPercent,
  ))
  const amount = toFiniteNumber(firstFilledValue(
    commission.commission_amount,
    commission.amount,
    formData.commissionAmount,
    formData.commission_amount,
    formData.mandateCommissionAmount,
    row.commissionAmount,
    row.mandateCommissionAmount,
  ))
  const price = toFiniteNumber(firstFilledValue(
    listing?.askingPrice,
    listing?.asking_price,
    listing?.estimatedValue,
    listing?.estimated_value,
    row.estimatedValue,
    row.estimated_value,
    row.budget,
  ))
  const estimatedExVat = amount || (price && percentage ? (price * percentage) / 100 : 0)
  const vatHandling = normalizeText(firstFilledValue(
    commission.vat,
    commission.vat_handling,
    commission.vatHandling,
    formData.vatHandling,
    formData.vatApplicable,
    row.vatHandling,
  ))
  const vatIncluded = ['yes', 'inclusive'].includes(vatHandling.toLowerCase()) || vatHandling.toLowerCase().includes('incl')
  const agencyStructureId = normalizeText(firstFilledValue(
    commission.agency_commission_structure_id,
    commission.agencyCommissionStructureId,
    commission.commission_structure_id,
    commission.commissionStructureId,
    formData.agencyCommissionStructureId,
    formData.commissionStructureId,
    row.agencyCommissionStructureId,
    row.commissionStructureId,
  ))
  const agencyStructureName = normalizeText(firstFilledValue(
    commission.agency_commission_structure_name,
    commission.agencyCommissionStructureName,
    commission.commission_structure_name,
    commission.commissionStructureName,
    formData.agencyCommissionStructureName,
    formData.commissionStructureName,
    row.agencyCommissionStructureName,
    row.commissionStructureName,
  ))
  const mandateTerms = normalizeText(firstFilledValue(
    commission.mandate_terms,
    commission.mandateTerms,
    formData.mandateTerms,
    formData.specialConditions,
    row.mandateTerms,
  ))
  const paymentResponsibility = normalizeText(firstFilledValue(
    commission.payment_responsibility,
    commission.paymentResponsibility,
    formData.paymentResponsibility,
    row.paymentResponsibility,
  ))
  const notes = normalizeText(firstFilledValue(
    commission.commission_notes,
    commission.notes,
    formData.commissionNotes,
    row.commissionNotes,
  ))
  const lastUpdated = firstFilledValue(
    commission.updated_at,
    commission.updatedAt,
    formData.commissionUpdatedAt,
    row.commissionUpdatedAt,
  )
  return {
    commissionType,
    percentage,
    amount,
    estimatedExVat,
    estimatedInclVat: vatIncluded ? estimatedExVat : estimatedExVat ? estimatedExVat * 1.15 : 0,
    vatHandling,
    vatIncluded,
    agencyStructureId,
    agencyStructureName,
    mandateTerms,
    paymentResponsibility,
    notes,
    lastUpdated,
    hasData: Boolean(percentage || amount || vatHandling || agencyStructureId || agencyStructureName || mandateTerms || paymentResponsibility || notes),
  }
}

function buildSellerCommissionDraft(summary = {}) {
  return {
    commissionType: summary.commissionType || 'percentage',
    percentage: summary.percentage ? String(summary.percentage) : '',
    amount: summary.amount ? String(summary.amount) : '',
    vatHandling: summary.vatHandling || '',
    agencyStructureId: summary.agencyStructureId || '',
    agencyStructureName: summary.agencyStructureName || '',
    mandateTerms: summary.mandateTerms || '',
    paymentResponsibility: summary.paymentResponsibility || '',
    notes: summary.notes || '',
  }
}

function buildSellerCommissionFormPatch(draft = {}, actor = {}) {
  const commissionType = normalizeCommissionTermType(draft.commissionType)
  const percentage = toFiniteNumber(draft.percentage)
  const amount = toFiniteNumber(draft.amount)
  const vatHandling = normalizeText(draft.vatHandling)
  const agencyStructureId = normalizeText(draft.agencyStructureId)
  const agencyStructureName = normalizeText(draft.agencyStructureName)
  const mandateTerms = normalizeText(draft.mandateTerms)
  const paymentResponsibility = normalizeText(draft.paymentResponsibility)
  const notes = normalizeText(draft.notes)
  const updatedAt = new Date().toISOString()
  const updatedBy = normalizeText(actor?.id || actor?.userId || actor?.email || actor?.name || 'agent')
  return {
    commissionStructure: commissionType,
    commissionType,
    commissionPercentage: percentage ? String(percentage) : '',
    commissionPercent: percentage ? String(percentage) : '',
    commission_percent: percentage ? String(percentage) : '',
    mandateCommissionPercentage: percentage ? String(percentage) : '',
    mandateCommissionPercent: percentage ? String(percentage) : '',
    commissionAmount: amount ? String(amount) : '',
    commission_amount: amount ? String(amount) : '',
    mandateCommissionAmount: amount ? String(amount) : '',
    vatHandling,
    agencyCommissionStructureId: agencyStructureId,
    agency_commission_structure_id: agencyStructureId,
    agencyCommissionStructureName: agencyStructureName,
    agency_commission_structure_name: agencyStructureName,
    commissionStructureId: agencyStructureId,
    commissionStructureName: agencyStructureName,
    mandateTerms,
    paymentResponsibility,
    commissionNotes: notes,
    commissionUpdatedAt: updatedAt,
    commissionUpdatedBy: updatedBy,
    commissionSource: 'seller_lead_workspace',
  }
}

function getBuyerPrimaryRequirement(row = {}) {
  return row.primaryRequirement || (Array.isArray(row.requirements) ? row.requirements.find((item) => item.isPrimary || item.is_primary) || row.requirements[0] : null) || {}
}

function getBuyerBudgetLabel(row = {}, requirement = getBuyerPrimaryRequirement(row)) {
  const min = toFiniteNumber(requirement.budgetMin ?? requirement.budget_min)
  const max = toFiniteNumber(requirement.budgetMax ?? requirement.budget_max)
  const legacy = toFiniteNumber(row.budget)
  if (min && max) return `${formatCurrency(min)} - ${formatCurrency(max)}`
  if (max || legacy) return formatCurrency(max || legacy)
  if (min) return `From ${formatCurrency(min)}`
  return '—'
}

function getBuyerAreaLabel(row = {}, requirement = getBuyerPrimaryRequirement(row)) {
  const requirementAreas = [
    ...parseListInput(requirement.areas),
    ...parseListInput(requirement.suburbs),
    normalizeText(requirement.city),
  ].filter(Boolean)
  if (requirementAreas.length) return requirementAreas.slice(0, 4).map(titleCaseLabel).join(', ')
  return formatCleanValue(readFirstValue(row, ['areaInterest', 'area_interest', 'suburb', 'city']))
}

function getBuyerPropertyTypeLabel(row = {}, requirement = getBuyerPrimaryRequirement(row)) {
  const types = parseListInput(requirement.propertyTypes || requirement.property_types)
  return formatCleanValue(types[0] || requirement.propertyCategory || requirement.property_category || row.propertyInterest || row.property_interest)
}

function getBuyerBedroomLabel(row = {}, requirement = getBuyerPrimaryRequirement(row)) {
  const beds = toFiniteNumber(requirement.bedroomsMin ?? requirement.bedrooms_min ?? row.bedrooms)
  return beds ? `${beds}+` : '—'
}

function getBuyerBathroomLabel(row = {}, requirement = getBuyerPrimaryRequirement(row)) {
  const baths = toFiniteNumber(requirement.bathroomsMin ?? requirement.bathrooms_min ?? row.bathrooms)
  return baths ? `${baths}+` : '—'
}

function getBuyerTimelineLabel(requirement = {}) {
  return formatCleanValue(requirement.timeline || requirement.moveInTimeline || requirement.move_in_timeline)
}

function getBuyerPreQualifiedLabel(requirement = {}) {
  if (requirement.preApproved !== null && requirement.preApproved !== undefined) return requirement.preApproved ? 'Pre-approved' : 'Not pre-approved'
  if (requirement.pre_approved !== null && requirement.pre_approved !== undefined) return requirement.pre_approved ? 'Pre-approved' : 'Not pre-approved'
  return formatCleanValue(requirement.financeStatus || requirement.finance_status)
}

function getBuyerLeadScore(row = {}, analytics = {}) {
  const requirement = getBuyerPrimaryRequirement(row)
  let score = 45
  if (getBuyerBudgetLabel(row, requirement) !== '—') score += 10
  if (getBuyerAreaLabel(row, requirement) !== '—') score += 10
  if (getBuyerPropertyTypeLabel(row, requirement) !== '—') score += 8
  if (getBuyerTimelineLabel(requirement) !== '—') score += 8
  if (getBuyerPreQualifiedLabel(requirement).toLowerCase().includes('pre-approved')) score += 12
  if (toFiniteNumber(analytics.touchpoints)) score += 4
  if (toFiniteNumber(analytics.viewings)) score += 6
  return Math.min(100, score)
}

function getIntentLabel(score = 0) {
  if (score >= 80) return 'High Intent'
  if (score >= 65) return 'Warm'
  if (score >= 50) return 'Nurture'
  return 'Needs Qualification'
}

function getBuyerLastActivity(row = {}) {
  const candidates = [
    row.latestActivity,
    ...(Array.isArray(row.communicationTimeline) ? row.communicationTimeline : []),
    ...(Array.isArray(row.tasks) ? row.tasks : []),
  ]
    .map((item) => ({
      item,
      date: getLatestActivityDate(item) || item?.occurredAt || item?.dueDate || item?.createdAt || item?.updatedAt,
    }))
    .filter(({ date }) => date && !Number.isNaN(new Date(date).getTime()))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
  return candidates[0] || null
}

function getBuyerDocumentCollections(row = {}) {
  return [
    row.documents,
    row.buyerDocuments,
    row.buyer_documents,
    row.canonicalDocuments,
    row.canonical_documents,
    row.documentRequirements,
    row.document_requirements,
  ].flatMap((collection) => (Array.isArray(collection) ? collection : []))
}

function getBuyerDocumentReadiness(row = {}) {
  const documents = getBuyerDocumentCollections(row)
  const isComplete = (document) => {
    const status = normalizeText(document?.status || document?.reviewStatus || document?.review_status || document?.documentStatus || document?.document_status).toLowerCase()
    return ['approved', 'uploaded', 'complete', 'completed', 'verified', 'received'].some((token) => status.includes(token)) || Boolean(document?.uploadedAt || document?.uploaded_at || document?.fileUrl || document?.file_url)
  }
  const labelFor = (document) => normalizeText(document?.label || document?.name || document?.title || document?.requirementLabel || document?.requirement_label || document?.type || document?.documentType || document?.document_type)
  if (!documents.length) {
    return {
      percent: 0,
      label: 'Documents Not Started',
      tone: 'amber',
      complete: 0,
      total: 4,
      missing: ['ID document', 'Proof of address', 'Finance documents'],
    }
  }
  const complete = documents.filter(isComplete).length
  const total = documents.length
  const percent = Math.round((complete / Math.max(total, 1)) * 100)
  const missing = documents.filter((document) => !isComplete(document)).map(labelFor).filter(Boolean).slice(0, 3)
  return {
    percent,
    label: percent >= 90 ? 'Documents Ready' : percent >= 50 ? 'Documents In Progress' : 'Documents Needed',
    tone: percent >= 90 ? 'green' : percent >= 50 ? 'blue' : 'amber',
    complete,
    total,
    missing,
  }
}

function getBuyerFinanceReadiness(row = {}) {
  const requirement = getBuyerPrimaryRequirement(row)
  const financeStatus = normalizeText(
    requirement.financeStatus ||
      requirement.finance_status ||
      row.financeStatus ||
      row.finance_status ||
      row.bondApplicationStatus ||
      row.bond_application_status,
  ).toLowerCase()
  const financeType = normalizeText(requirement.financeType || requirement.finance_type || row.financeType || row.finance_type).toLowerCase()
  const preApproved = requirement.preApproved === true || requirement.pre_approved === true || ['pre_approved', 'pre-approved', 'approved'].some((token) => financeStatus.includes(token))
  const cash = financeStatus.includes('cash') || financeType.includes('cash')
  const bondApplications = [
    ...(Array.isArray(row.bondApplications) ? row.bondApplications : []),
    ...(Array.isArray(row.bond_applications) ? row.bond_applications : []),
    ...(Array.isArray(row.financeApplications) ? row.financeApplications : []),
  ]
  const needsFinance = ['bond', 'finance', 'mortgage', 'preapproval', 'pre-approval'].some((token) => `${financeStatus} ${financeType}`.includes(token))
  if (cash) {
    return { score: 100, label: 'Cash Buyer', tone: 'green', helper: 'No bond application required.', missing: [] }
  }
  if (preApproved) {
    return { score: 90, label: 'Finance Ready', tone: 'green', helper: getBuyerPreQualifiedLabel(requirement), missing: [] }
  }
  if (bondApplications.length) {
    return { score: 70, label: 'Bond In Progress', tone: 'blue', helper: `${bondApplications.length} application${bondApplications.length === 1 ? '' : 's'} linked.`, missing: [] }
  }
  if (needsFinance) {
    return { score: 45, label: 'Finance Required', tone: 'amber', helper: 'Confirm pre-approval and document pack.', missing: ['Pre-approval', 'Finance documents'] }
  }
  return { score: 35, label: 'Finance Unknown', tone: 'amber', helper: 'Confirm whether this buyer is cash, bond, or hybrid.', missing: ['Finance position'] }
}

function getBuyerPropertyReadiness(row = {}) {
  const requirement = getBuyerPrimaryRequirement(row)
  const propertyOptions = getLeadAppointmentPropertyOptions(row)
  const listingInterests = Array.isArray(row.listingInterests) ? row.listingInterests : []
  const suggestions = Array.isArray(row.suggestions) ? row.suggestions : []
  const appointments = Array.isArray(row.appointments) ? row.appointments : []
  const offers = Array.isArray(row.offers) ? row.offers : []
  const hasRequirement = getBuyerBudgetLabel(row, requirement) !== '—' || getBuyerAreaLabel(row, requirement) !== '—'
  let score = hasRequirement ? 45 : 15
  if (propertyOptions.length || listingInterests.length || suggestions.length) score += 25
  if (appointments.some(isViewingAppointment)) score += 20
  if (offers.length) score += 10
  const percent = Math.min(100, score)
  return {
    percent,
    label: offers.length ? 'Offer Context Ready' : propertyOptions.length ? 'Properties Linked' : hasRequirement ? 'Requirement Captured' : 'Requirement Needed',
    tone: percent >= 80 ? 'green' : percent >= 55 ? 'blue' : 'amber',
    propertyCount: propertyOptions.length || listingInterests.length || suggestions.length,
    requirement,
  }
}

function getBuyerWorkspaceCommand(row = {}) {
  const deal = getBuyerDealSnapshot(row)
  const steps = getBuyerOutreachSteps(row)
  const finance = getBuyerFinanceReadiness(row)
  const documents = getBuyerDocumentReadiness(row)
  const property = getBuyerPropertyReadiness(row)
  const nextStep = steps.find((step) => !step.done)
  const viewingCompleted = Boolean(
    deal.latestViewing &&
      (String(deal.latestViewing.status || '').toLowerCase() === 'completed' || deal.latestViewing.completedAt || deal.latestViewing.completed_at),
  )

  if (deal.latestTransaction) {
    if (deal.transactionStateLabel === 'Deal fell through') {
      return {
        title: 'Deal fell through',
        copy: deal.transactionStateHelper,
        actionLabel: 'Open Offers',
        actionId: 'offers',
        tone: 'amber',
        blockers: ['Restart or close out'],
        snapshot: deal,
      }
    }
    if (deal.transactionStateLabel === 'Onboarding needs attention') {
      return {
        title: 'Buyer onboarding needs attention',
        copy: deal.transactionStateHelper,
        actionLabel: 'Open Offers',
        actionId: 'offers',
        tone: 'amber',
        blockers: ['Buyer onboarding'],
        snapshot: deal,
      }
    }
    if (deal.transactionStateLabel === 'Signed OTP outstanding') {
      return {
        title: 'Signed OTP is the blocker',
        copy: deal.transactionStateHelper,
        actionLabel: 'Open Transaction',
        actionId: 'convert',
        tone: 'amber',
        blockers: ['Signed OTP'],
        snapshot: deal,
      }
    }
    if (deal.transactionStateLabel === 'Buyer onboarding pending' || deal.transactionStateLabel === 'Buyer onboarding sent' || deal.transactionStateLabel === 'Onboarding complete') {
      return {
        title: deal.transactionStateLabel,
        copy: deal.transactionStateHelper,
        actionLabel: deal.transactionStateLabel === 'Buyer onboarding pending' ? 'Open Offers' : 'Open Transaction',
        actionId: deal.transactionStateLabel === 'Buyer onboarding pending' ? 'offers' : 'convert',
        tone: deal.transactionStateTone,
        blockers: deal.transactionStateLabel === 'Buyer onboarding pending' ? ['Buyer onboarding'] : deal.transactionStateLabel === 'Buyer onboarding sent' ? ['Buyer response'] : ['Prepare OTP'],
        snapshot: deal,
      }
    }
    return {
      title: deal.transactionStateLabel,
      copy: deal.transactionStateHelper,
      actionLabel: 'Open Transaction',
      actionId: 'convert',
      tone: deal.transactionStateTone,
      blockers: deal.transactionStateLabel === 'Signed OTP received' ? [] : ['Transaction follow-up'],
      snapshot: deal,
    }
  }

  if (deal.acceptedOffer) {
    return {
      title: 'Accepted offer is ready for conversion',
      copy: deal.transactionStateHelper,
      actionLabel: 'Open Offers',
      actionId: 'offers',
      tone: 'amber',
      blockers: ['Transaction workspace'],
      snapshot: deal,
    }
  }

  if (deal.latestOffer) {
    if (['Buyer withdrew offer', 'Offer expired', 'Offer rejected'].includes(deal.offerStateLabel)) {
      return {
        title: deal.offerStateLabel,
        copy: deal.offerStateHelper,
        actionLabel: 'Open Offers',
        actionId: 'offers',
        tone: 'amber',
        blockers: ['Restart or close out'],
        snapshot: deal,
      }
    }
    if (deal.offerStateLabel === 'Offer link failed' || deal.offerStateLabel === 'Seller review failed') {
      return {
        title: deal.offerStateLabel,
        copy: deal.offerStateHelper,
        actionLabel: 'Open Offers',
        actionId: 'offers',
        tone: 'amber',
        blockers: ['Delivery retry'],
        snapshot: deal,
      }
    }
    if (deal.offerStateLabel === 'Agent review required') {
      return {
        title: 'Buyer offer needs seller routing',
        copy: deal.offerStateHelper,
        actionLabel: 'Open Offers',
        actionId: 'offers',
        tone: 'blue',
        blockers: ['Seller review'],
        snapshot: deal,
      }
    }
    if (deal.offerStateLabel === 'Offer link sent' || deal.offerStateLabel === 'Buyer reviewing offer') {
      return {
        title: deal.offerStateLabel,
        copy: deal.offerStateHelper,
        actionLabel: 'Open Offers',
        actionId: 'offers',
        tone: deal.offerStateTone,
        blockers: ['Buyer response'],
        snapshot: deal,
      }
    }
    if (deal.offerStateLabel === 'Seller review sent' || deal.offerStateLabel === 'Seller reviewing offer') {
      return {
        title: deal.offerStateLabel,
        copy: deal.offerStateHelper,
        actionLabel: 'Open Offers',
        actionId: 'offers',
        tone: deal.offerStateTone,
        blockers: ['Seller decision'],
        snapshot: deal,
      }
    }
    if (deal.offerStateLabel === 'Counter-offer in play') {
      return {
        title: 'Counter-offer needs buyer feedback',
        copy: deal.offerStateHelper,
        actionLabel: 'Open Offers',
        actionId: 'offers',
        tone: 'amber',
        blockers: ['Buyer response'],
        snapshot: deal,
      }
    }
  }

  if (viewingCompleted) {
    return {
      title: 'Viewing is done, lock the next move',
      copy: 'Capture the actual outcome now: send the offer link, book the second viewing, or close out the property cleanly.',
      actionLabel: 'Open Offers',
      actionId: 'offers',
      tone: 'blue',
      blockers: ['Viewing outcome'],
      snapshot: deal,
    }
  }

  if (finance.score < 60) {
    return {
      title: 'Finance position needs confirmation',
      copy: finance.helper,
      actionLabel: 'Review Requirements',
      actionId: 'property_match',
      tone: 'amber',
      blockers: finance.missing,
      snapshot: deal,
    }
  }
  if (documents.percent < 50 && finance.score < 90) {
    return {
      title: 'Document pack is not ready',
      copy: 'Finance and transaction readiness depend on the buyer document pack.',
      actionLabel: 'Review Tasks',
      actionId: 'tasks',
      tone: 'amber',
      blockers: documents.missing,
      snapshot: deal,
    }
  }
  if (property.percent < 55) {
    return {
      title: 'No strong property path yet',
      copy: 'Capture requirements or send matching properties before pushing toward an offer.',
      actionLabel: 'Match Properties',
      actionId: 'property_match',
      tone: 'blue',
      blockers: ['Property requirement', 'Matched listings'],
      snapshot: deal,
    }
  }
  if (nextStep) {
    const actionMap = {
      reached_out: ['Contact buyer', 'timeline'],
      viewing_scheduled: ['Schedule Viewing', 'appointments'],
      viewing_completed: ['Review Viewing', 'appointments'],
      offer_made: ['Open Offers', 'offers'],
      transaction_created: ['Convert Lead', 'convert'],
    }
    const [actionLabel, actionId] = actionMap[nextStep.key] || ['Review Timeline', 'timeline']
    return {
      title: nextStep.label,
      copy: nextStep.hint,
      actionLabel,
      actionId,
      tone: 'blue',
      blockers: [],
      snapshot: deal,
    }
  }
  return {
    title: 'Buyer journey is transaction-ready',
    copy: 'The buyer has enough journey signal to review transaction handoff.',
    actionLabel: deal.latestTransaction ? 'Open Transaction' : 'Open Offers',
    actionId: deal.latestTransaction ? 'convert' : 'offers',
    tone: 'green',
    blockers: [],
    snapshot: deal,
  }
}

function getWhatsAppHref(phone = '') {
  const digits = normalizeText(phone).replace(/\D/g, '')
  if (!digits) return ''
  const normalized = digits.startsWith('0') ? `27${digits.slice(1)}` : digits
  return `https://wa.me/${normalized}`
}

function getLatestActivityDate(activity = {}) {
  return activity?.activityDate || activity?.activity_date || activity?.occurredAt || activity?.occurred_at || activity?.createdAt || activity?.created_at || ''
}

function getLatestActivityTitle(row = {}) {
  return normalizeText(row.latestActivity?.activityType || row.latestActivity?.activity_type) || 'No activity'
}

function EmptyState({ title, copy, actionLabel = '', onAction }) {
  return (
    <div className="empty-state bg-slate-50 px-5 py-10">
      <div className="mx-auto grid max-w-xl justify-items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
          <Search size={18} />
        </span>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-500">{copy}</p>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="mt-2 inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-slate-900">{value || '—'}</dd>
    </div>
  )
}

function deliveryTone(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'delivered' || normalized === 'sent') return 'green'
  if (normalized === 'failed') return 'red'
  if (normalized === 'queued' || normalized === 'prepared' || normalized === 'pending') return 'amber'
  return 'slate'
}

function CompactMetric({ label, value, icon }) {
  return (
    <div className="flex min-h-14 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
      {icon ? createElement(icon, { size: 15, className: 'shrink-0 text-slate-400' }) : null}
      <strong className="text-lg font-semibold tracking-[-0.03em] text-slate-950">{value}</strong>
      <span className="truncate text-sm font-semibold text-slate-600">{label}</span>
    </div>
  )
}

function BuyerKpiCard({ label, value, helper, icon }) {
  return (
    <article className="flex min-h-[112px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</span>
        {icon ? createElement(icon, { size: 16, className: 'text-slate-400' }) : null}
      </div>
      <div>
        <strong className="block break-words text-xl font-semibold tracking-[-0.04em] text-slate-950">{value || '—'}</strong>
        {helper ? <span className="mt-1 block text-sm font-semibold text-slate-500">{helper}</span> : null}
      </div>
    </article>
  )
}

function BuyerInfoRow({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2.5">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{value || '—'}</dd>
    </div>
  )
}

function BuyerActionItem({ icon, title, description, buttonLabel, onClick, href }) {
  const content = (
    <>
      {icon ? createElement(icon, { size: 16 }) : null}
      {buttonLabel}
    </>
  )
  return (
    <article className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon ? createElement(icon, { size: 17, className: 'text-slate-500' }) : null}
          <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
        </div>
        <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
      </div>
      {href ? (
        <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">
          {content}
        </a>
      ) : (
        <button type="button" onClick={onClick} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">
          {content}
        </button>
      )}
    </article>
  )
}

function BuyerSnapshotCard({ row, requirement, onEdit }) {
  return (
    <section className={buyerWorkspaceCardClass}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Buyer Snapshot</h2>
          <p className="mt-1 text-sm text-slate-500">Core search criteria for this buyer.</p>
        </div>
        <button type="button" onClick={onEdit} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Edit
        </button>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <BuyerInfoRow label="Budget" value={getBuyerBudgetLabel(row, requirement)} />
        <BuyerInfoRow label="Property Type" value={getBuyerPropertyTypeLabel(row, requirement)} />
        <BuyerInfoRow label="Bedrooms" value={getBuyerBedroomLabel(row, requirement)} />
        <BuyerInfoRow label="Bathrooms" value={getBuyerBathroomLabel(row, requirement)} />
        <BuyerInfoRow label="Areas" value={getBuyerAreaLabel(row, requirement)} />
      </dl>
    </section>
  )
}

function BuyerLeadStatusCard({ row, sourceInfo, lastActivity }) {
  const nextTask = row.nextTask || (Array.isArray(row.tasks) ? row.tasks.find((task) => String(task.status || '').toLowerCase() !== 'completed') : null)
  return (
    <section className={buyerWorkspaceCardClass}>
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Lead Status</h2>
        <p className="mt-1 text-sm text-slate-500">Ownership, source, and follow-up state.</p>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <BuyerInfoRow label="Stage" value={formatCleanValue(row.stage || row.status)} />
        <BuyerInfoRow label="Source" value={formatCleanValue(sourceInfo?.leadSource || row.source)} />
        <BuyerInfoRow label="Assigned Agent" value={getOwnerName(row)} />
        <BuyerInfoRow label="Last Contact" value={lastActivity?.date ? formatDateTime(lastActivity.date) : '—'} />
        <BuyerInfoRow label="Next Follow-up" value={nextTask?.dueDate || nextTask?.due_date ? formatDate(nextTask.dueDate || nextTask.due_date) : '—'} />
      </dl>
      <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Enquiry History</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <BuyerInfoRow label="Original Source" value={formatCleanValue(sourceInfo?.originalSource || sourceInfo?.firstSource || row.source)} />
          <BuyerInfoRow label="Latest Source" value={formatCleanValue(sourceInfo?.latestSource || row.source)} />
        </dl>
      </div>
    </section>
  )
}

function BuyerActivityOverviewCard({ row, workspace = {} }) {
  const propertyShares = workspace.propertyShares || row.propertyShares || []
  const listingInterests = workspace.listingInterests || row.listingInterests || []
  const appointments = row.appointments || []
  const offers = row.offers || []
  const transactions = row.transactions || []
  const listingsSent = propertyShares.length || listingInterests.filter((item) => item.sentAt || ['sent', 'viewed', 'viewing_scheduled'].includes(String(item.status || '').toLowerCase())).length
  const listingsViewed = listingInterests.filter((item) => item.viewedAt || String(item.status || '').toLowerCase() === 'viewed').length
  const viewingsBooked = appointments.filter((item) => {
    const haystack = `${item.title || ''} ${item.appointmentType || item.appointment_type || ''}`.toLowerCase()
    return haystack.includes('view') || haystack.includes('show')
  }).length || row.appointmentCount || appointments.length
  const transactionsCreated = transactions.length || (row.convertedTransactionId ? 1 : 0)
  const metrics = [
    { label: 'Listings Sent', value: listingsSent },
    { label: 'Listings Viewed', value: listingsViewed },
    { label: 'Viewings Booked', value: viewingsBooked },
    { label: 'Offers Made', value: offers.length || row.offerCount || 0 },
    { label: 'Transactions Created', value: transactionsCreated },
  ]
  return (
    <section className={buyerWorkspaceCardClass}>
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Activity Overview</h2>
        <p className="mt-1 text-sm text-slate-500">Buyer engagement at a glance.</p>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {metrics.map((metric) => (
          <BuyerInfoRow key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </dl>
    </section>
  )
}

function BuyerOverviewRecentActivityCard({ row, timeline = [], onViewAll }) {
  const items = [
    ...(Array.isArray(timeline) ? timeline : []),
    ...(Array.isArray(row.activities) ? row.activities : []),
  ]
    .map((item) => ({
      ...item,
      sortDate: getLatestActivityDate(item) || item.occurredAt || item.createdAt || item.updatedAt,
    }))
    .filter((item) => item.sortDate && !Number.isNaN(new Date(item.sortDate).getTime()))
    .sort((left, right) => new Date(right.sortDate).getTime() - new Date(left.sortDate).getTime())
    .slice(0, 5)

  return (
    <section className={buyerWorkspaceCardClass}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Recent Activity</h2>
          <p className="mt-1 text-sm text-slate-500">Latest lead events and communication.</p>
        </div>
        <button type="button" onClick={onViewAll} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">View all</button>
      </div>
      <div className="mt-5 grid gap-3">
        {items.length ? items.map((item) => (
          <article key={item.id || item.activityId || item.activity_id || `${item.sortDate}-${item.title || item.activityType || item.kind}`} className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-950">{formatCleanValue(item.title || item.activityType || item.activity_type || item.communicationType || item.kind)}</h4>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{item.summary || item.message || item.subject || item.activityNote || item.activity_note || 'Activity logged.'}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-slate-500">{formatRelativeTime(item.sortDate)}</span>
            </div>
          </article>
        )) : <EmptyState title="No recent activity" copy="Lead events, notes, calls, messages, and viewings will appear here." />}
      </div>
    </section>
  )
}

function BuyerTasksDueCard({ tasks = [], onAddTask }) {
  const dueTasks = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => String(task.status || '').toLowerCase() !== 'completed')
    .sort((left, right) => new Date(left.dueDate || left.due_date || 0).getTime() - new Date(right.dueDate || right.due_date || 0).getTime())
    .slice(0, 5)

  return (
    <section className={buyerWorkspaceCardClass}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Tasks Due</h2>
          <p className="mt-1 text-sm text-slate-500">Open follow-up tasks for this lead.</p>
        </div>
        <button type="button" onClick={onAddTask} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
          <Plus size={15} />
          Add Task
        </button>
      </div>
      <div className="mt-5">
        {dueTasks.length ? <TaskList items={dueTasks} /> : <EmptyState title="No tasks due" copy="Open follow-up tasks will appear here once created." actionLabel="Add Task" onAction={onAddTask} />}
      </div>
    </section>
  )
}

function BuyerPerformanceCard({ analytics, row }) {
  const metrics = [
    { label: 'Touchpoints', value: analytics?.touchpoints || 0 },
    { label: 'Viewings', value: analytics?.viewings || row.appointmentCount || 0 },
    { label: 'Offers', value: analytics?.offers || row.offerCount || 0 },
    { label: 'Transactions', value: row.transactionCount || (row.convertedTransactionId ? 1 : 0) },
  ]
  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Performance</h2>
          <p className="mt-1 text-sm text-slate-500">Last 30 days where activity data is available.</p>
        </div>
        <StatusPill>Last 30 days</StatusPill>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl bg-slate-50 p-4">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{metric.label}</span>
            <strong className="mt-2 block text-2xl font-semibold tracking-[-0.04em] text-slate-950">{metric.value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function BuyerNextActionsCard({ row, onViewTasks, onSendMatches, onScheduleViewing, onCreateOffer }) {
  const whatsappHref = getWhatsAppHref(row.phone)
  const actions = [
    {
      icon: Phone,
      title: 'Call buyer',
      description: 'Confirm budget, timing, finance position, and decision-makers.',
      buttonLabel: 'Call',
      href: row.phone ? `tel:${row.phone}` : '',
      onClick: onViewTasks,
    },
    {
      icon: Home,
      title: 'Send matching properties',
      description: 'Review matches and share the strongest listings with this buyer.',
      buttonLabel: 'Send matches',
      onClick: onSendMatches,
    },
    {
      icon: CalendarDays,
      title: 'Schedule viewing',
      description: 'Move from interest to a confirmed viewing appointment.',
      buttonLabel: 'Schedule',
      onClick: onScheduleViewing,
    },
    {
      icon: FileText,
      title: 'Create offer',
      description: 'Use the offers workspace when the buyer is ready to submit.',
      buttonLabel: 'Create offer',
      onClick: onCreateOffer,
    },
  ]
  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Next Actions</h2>
          <p className="mt-1 text-sm text-slate-500">Recommended agent actions for this buyer.</p>
        </div>
        {whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
            <MessageSquarePlus size={15} />
            WhatsApp
          </a>
        ) : null}
      </div>
      <div className="mt-5 grid gap-3">
        {actions.map((action) => <BuyerActionItem key={action.title} {...action} />)}
      </div>
      <button type="button" onClick={onViewTasks} className="mt-4 text-sm font-semibold text-blue-700 hover:text-blue-800">View all tasks</button>
    </section>
  )
}

function BuyerRecentActivityCard({ timeline = [], onViewAll }) {
  const meaningful = (Array.isArray(timeline) ? timeline : [])
    .filter((item) => {
      const haystack = `${item.title || ''} ${item.communicationType || ''} ${item.kind || ''}`.toLowerCase()
      return ['call', 'email', 'whatsapp', 'viewing', 'appointment'].some((token) => haystack.includes(token))
    })
    .slice(0, 4)

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Recent Activity</h2>
          <p className="mt-1 text-sm text-slate-500">Meaningful buyer communication and appointment activity.</p>
        </div>
        <button type="button" onClick={onViewAll} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">View all</button>
      </div>
      <div className="mt-5 grid gap-3">
        {meaningful.length ? meaningful.map((item) => (
          <article key={item.id || `${item.title}-${item.occurredAt}`} className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-950">{formatCleanValue(item.title || item.communicationType || item.kind)}</h4>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{item.summary || item.message || item.subject || 'Activity logged.'}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-slate-500">{formatRelativeTime(item.occurredAt || item.createdAt)}</span>
            </div>
          </article>
        )) : <EmptyState title="No meaningful activity yet" copy="Calls, emails, WhatsApp messages, and viewings will appear here once logged." />}
      </div>
    </section>
  )
}

function getTodayInputValue() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

function getFutureInputValue(days = 7) {
  const now = new Date()
  now.setDate(now.getDate() + Number(days || 0))
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

function getLeadContactSnapshot(lead = {}) {
  const safeLead = lead || {}
  const contact = safeLead.contact || {}
  return {
    name: normalizeText(safeLead.name || contact.fullName || contact.name),
    email: normalizeText(safeLead.email || contact.email),
    phone: normalizeText(safeLead.phone || contact.phone || contact.mobile),
    contactId: normalizeText(safeLead.contactId || safeLead.contact_id || contact.contactId || contact.id),
  }
}

function getLeadPrimaryListingId(lead = {}) {
  const safeLead = lead || {}
  return normalizeText(
    safeLead.listingId ||
    safeLead.listing_id ||
    safeLead.privateListingId ||
    safeLead.private_listing_id ||
    safeLead.listingInterests?.[0]?.listingId ||
    safeLead.listingInterests?.[0]?.listing_id ||
    safeLead.listings?.[0]?.id ||
    safeLead.listings?.[0]?.listingId ||
    safeLead.listings?.[0]?.listing_id,
  )
}

function getLeadAppointmentPropertyOptions(lead = {}) {
  const safeLead = lead || {}
  const options = []
  const addOption = (listing = {}, source = '', meta = {}) => {
    const listingId = normalizeText(listing?.id || listing?.listingId || listing?.listing_id || meta.listingId)
    if (!listingId || options.some((option) => option.id === listingId)) return
    const title = normalizeText(listing?.title || listing?.listingTitle || listing?.propertyAddress || listing?.address) || 'Linked property'
    const location = [listing?.address, listing?.suburb, listing?.city].map(normalizeText).filter(Boolean).join(', ')
    options.push({
      id: listingId,
      label: title,
      description: location || normalizeText(source) || 'Property details pending',
      price: listing?.price || listing?.askingPrice || listing?.asking_price || null,
      source,
      isOriginalEnquiry: Boolean(meta.isOriginalEnquiry),
      sellerName: normalizeText(listing?.seller?.name || listing?.sellerName || listing?.seller_name || listing?.ownerName || listing?.owner_name),
      sellerEmail: normalizeText(listing?.seller?.email || listing?.sellerEmail || listing?.seller_email || listing?.ownerEmail || listing?.owner_email).toLowerCase(),
      sellerPhone: normalizeText(listing?.seller?.phone || listing?.sellerPhone || listing?.seller_phone || listing?.ownerPhone || listing?.owner_phone),
    })
  }

  for (const interest of Array.isArray(safeLead.listingInterests) ? safeLead.listingInterests : []) {
    if (!interest) continue
    addOption(interest.listing || {}, interest.isOriginalEnquiry ? 'Enquiry property' : interest.source || 'Shortlist', {
      listingId: interest.listingId || interest.listing_id,
      isOriginalEnquiry: interest.isOriginalEnquiry,
    })
  }
  for (const suggestion of Array.isArray(safeLead.suggestions) ? safeLead.suggestions : []) {
    if (!suggestion) continue
    if (String(suggestion.status || '').toLowerCase() !== 'accepted') continue
    addOption(suggestion.listing || {}, 'Accepted suggestion', { listingId: suggestion.listingId || suggestion.listing_id })
  }
  for (const listing of Array.isArray(safeLead.listings) ? safeLead.listings : []) {
    addOption(listing, 'Linked listing')
  }
  const fallbackListingId = getLeadPrimaryListingId(safeLead)
  if (fallbackListingId) {
    addOption({ id: fallbackListingId, title: 'Listing attached to lead' }, 'Lead listing id')
  }

  return options.sort((left, right) => {
    if (left.isOriginalEnquiry !== right.isOriginalEnquiry) return left.isOriginalEnquiry ? -1 : 1
    return left.label.localeCompare(right.label)
  })
}

function isViewingAppointment(item = {}) {
  const safeItem = item || {}
  const haystack = `${safeItem.title || ''} ${safeItem.appointmentType || safeItem.appointment_type || ''} ${safeItem.appointmentTypeLabel || ''}`.toLowerCase()
  return haystack.includes('viewing')
}

function getAppointmentDateLabel(item = {}) {
  const safeItem = item || {}
  const explicit = safeItem.dateTime || safeItem.date_time || safeItem.startsAt || safeItem.starts_at
  if (explicit) return formatDateTime(explicit)
  const date = normalizeText(safeItem.date || safeItem.appointmentDate || safeItem.appointment_date)
  const startTime = normalizeText(safeItem.startTime || safeItem.start_time || safeItem.appointmentTime || safeItem.appointment_time)
  if (date && startTime) return formatDateTime(`${date}T${startTime}`)
  return date ? formatDate(date) : 'Date to be confirmed'
}

function getAppointmentId(item = {}) {
  const safeItem = item || {}
  return normalizeText(safeItem.appointmentId || safeItem.appointment_id || safeItem.id)
}

function getAppointmentListingId(item = {}) {
  const safeItem = item || {}
  return normalizeText(safeItem.listingId || safeItem.listing_id)
}

function getAppointmentDateInputValue(item = {}) {
  const safeItem = item || {}
  const explicit = normalizeText(safeItem.dateTime || safeItem.date_time || safeItem.startsAt || safeItem.starts_at)
  if (explicit) return explicit.slice(0, 10)
  return normalizeText(safeItem.date || safeItem.appointmentDate || safeItem.appointment_date) || getTodayInputValue()
}

function getAppointmentTimeInputValue(item = {}) {
  const safeItem = item || {}
  const explicit = normalizeText(safeItem.dateTime || safeItem.date_time || safeItem.startsAt || safeItem.starts_at)
  if (explicit.includes('T')) return explicit.split('T')[1]?.slice(0, 5) || ''
  return normalizeText(safeItem.startTime || safeItem.start_time || safeItem.appointmentTime || safeItem.appointment_time)
}

function getAppointmentStatusTone(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'completed' || normalized === 'confirmed') return 'green'
  if (normalized === 'no_show' || normalized.includes('cancel') || normalized.includes('declin')) return 'red'
  if (normalized.includes('request') || normalized.includes('reschedule') || normalized.includes('alternative')) return 'amber'
  return 'slate'
}

function isAppointmentClosed(item = {}) {
  const safeItem = item || {}
  const normalized = normalizeText(safeItem.status).toLowerCase()
  return ['completed', 'no_show', 'cancelled', 'declined'].includes(normalized) || normalized.includes('cancel') || normalized.includes('declin')
}

function getAppointmentOutcomeDraft(item = {}, propertyOptions = []) {
  const listingId = getAppointmentListingId(item) || propertyOptions[0]?.id || ''
  return {
    listingId,
    outcome: normalizeText(item.outcomeSummary || item.outcome_summary) || 'Interested',
    buyerFeedback: normalizeText(item.clientFeedback || item.client_feedback),
    agentNotes: normalizeText(item.agentNotes || item.agent_notes || item.notes),
    nextStep: normalizeText(item.nextStep || item.next_step) || 'Send offer link',
    rescheduleDate: getAppointmentDateInputValue(item),
    rescheduleTime: getAppointmentTimeInputValue(item),
  }
}

function getLeadContactFallback(lead = {}) {
  const safeLead = lead || {}
  const contact = getLeadContactSnapshot(safeLead)
  const nameParts = splitName(contact.name || safeLead.name || safeLead.buyerName || '')
  return {
    contactId: contact.contactId || safeLead.contactId || safeLead.contact_id || '',
    firstName: safeLead.firstName || safeLead.first_name || nameParts.firstName || 'Buyer',
    lastName: safeLead.lastName || safeLead.last_name || nameParts.lastName,
    email: contact.email || safeLead.email || '',
    phone: contact.phone || safeLead.phone || '',
    contactType: safeLead.leadCategory || safeLead.lead_category || 'Buyer Lead',
  }
}

function getOfferStatusTone(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized.includes('accepted') || normalized.includes('converted')) return 'green'
  if (normalized.includes('rejected') || normalized.includes('withdrawn') || normalized.includes('expired')) return 'red'
  if (normalized.includes('submitted') || normalized.includes('seller') || normalized.includes('review')) return 'amber'
  if (normalized.includes('sent') || normalized.includes('draft')) return 'blue'
  return 'slate'
}

function getOfferId(offer = {}) {
  const safeOffer = offer || {}
  return normalizeText(safeOffer.id || safeOffer.offerId || safeOffer.offer_id)
}

function getOfferListingId(offer = {}) {
  const safeOffer = offer || {}
  return normalizeText(safeOffer.listingId || safeOffer.listing_id)
}

function getOfferTransactionId(offer = {}) {
  const safeOffer = offer || {}
  return normalizeText(safeOffer.transactionId || safeOffer.transaction_id)
}

function getOfferAmount(offer = {}) {
  const safeOffer = offer || {}
  return safeOffer.amount || safeOffer.offerAmount || safeOffer.offer_amount
}

function getOfferStatus(offer = {}) {
  const safeOffer = offer || {}
  return normalizeText(safeOffer.status).toLowerCase()
}

function getOfferLifecycleState(offer = {}) {
  const summary = getOfferLifecycleSummary(offer || {})
  return {
    ...summary,
    label: formatCleanValue(summary.effectiveStatus || summary.status || 'draft'),
  }
}

function isOfferAcceptedForConversion(offer = {}) {
  const status = getOfferStatus(offer)
  return status === 'accepted' || status === 'converted_to_transaction' || Boolean(getOfferTransactionId(offer))
}

function isOfferConvertedToTransaction(offer = {}) {
  return getOfferStatus(offer) === 'converted_to_transaction' || Boolean(getOfferTransactionId(offer))
}

function getAcceptedOfferForConversion(offers = []) {
  return (Array.isArray(offers) ? offers : [])
    .filter(isOfferAcceptedForConversion)
    .sort((left, right) => {
      if (isOfferConvertedToTransaction(left) !== isOfferConvertedToTransaction(right)) {
        return isOfferConvertedToTransaction(left) ? 1 : -1
      }
      return new Date(right.acceptedAt || right.accepted_at || right.updatedAt || right.updated_at || 0) -
        new Date(left.acceptedAt || left.accepted_at || left.updatedAt || left.updated_at || 0)
    })[0] || null
}

function getLeadLinkedTransactionId(lead = {}) {
  const safeLead = lead || {}
  const transactions = (Array.isArray(safeLead.transactions) ? safeLead.transactions : []).filter(Boolean)
  return normalizeText(
    safeLead.convertedTransactionId ||
      safeLead.converted_transaction_id ||
      safeLead.transactionId ||
      safeLead.transaction_id ||
      transactions[0]?.id ||
      transactions[0]?.transactionId ||
      transactions[0]?.transaction_id,
  )
}

function getLeadHandoffState(lead = {}) {
  const safeLead = lead || {}
  const transactionId = getLeadLinkedTransactionId(safeLead)
  const activities = (Array.isArray(safeLead.activities) ? safeLead.activities : []).filter(Boolean)
  const timeline = (Array.isArray(safeLead.communicationTimeline) ? safeLead.communicationTimeline : []).filter(Boolean)
  const activityHaystack = [...activities, ...timeline]
    .map((item) => `${item.activityType || item.activity_type || item.title || ''} ${item.activityNote || item.activity_note || item.summary || ''}`)
    .join(' ')
    .toLowerCase()
  const openTasks = (Array.isArray(safeLead.tasks) ? safeLead.tasks : [])
    .filter(Boolean)
    .filter((task) => !['completed', 'cancelled', 'done'].includes(normalizeText(task.status).toLowerCase()))
  const hasOpenTaskLike = (needle = '') => openTasks.some((task) => normalizeText(task.title).toLowerCase().includes(needle))
  return {
    transactionId,
    buyerOnboardingSent: activityHaystack.includes('buyer onboarding sent') || activityHaystack.includes('client onboarding'),
    financeTaskReady: hasOpenTaskLike('finance') || hasOpenTaskLike('bond'),
    ficaTaskReady: hasOpenTaskLike('fica') || hasOpenTaskLike('document'),
    conveyancerTaskReady: hasOpenTaskLike('conveyancer') || hasOpenTaskLike('handover'),
  }
}

function getLatestViewingAppointment(row = {}) {
  return (Array.isArray(row?.appointments) ? row.appointments : [])
    .filter(Boolean)
    .filter(isViewingAppointment)
    .sort((left, right) => {
      const leftTime = new Date(left.completedAt || left.completed_at || left.dateTime || left.date_time || left.updatedAt || left.updated_at || left.createdAt || left.created_at || 0).getTime()
      const rightTime = new Date(right.completedAt || right.completed_at || right.dateTime || right.date_time || right.updatedAt || right.updated_at || right.createdAt || right.created_at || 0).getTime()
      return rightTime - leftTime
    })[0] || null
}

function getLatestOffer(row = {}) {
  return (Array.isArray(row?.offers) ? row.offers : [])
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = new Date(left.acceptedAt || left.accepted_at || left.updatedAt || left.updated_at || left.submittedAt || left.submitted_at || left.createdAt || left.created_at || 0).getTime()
      const rightTime = new Date(right.acceptedAt || right.accepted_at || right.updatedAt || right.updated_at || right.submittedAt || right.submitted_at || right.createdAt || right.created_at || 0).getTime()
      return rightTime - leftTime
    })[0] || null
}

function sortOffersNewestFirst(offers = []) {
  return (Array.isArray(offers) ? offers : [])
    .filter(Boolean)
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.acceptedAt || left.accepted_at || left.updatedAt || left.updated_at || left.submittedAt || left.submitted_at || left.createdAt || left.created_at || 0).getTime()
      const rightTime = new Date(right.acceptedAt || right.accepted_at || right.updatedAt || right.updated_at || right.submittedAt || right.submitted_at || right.createdAt || right.created_at || 0).getTime()
      return rightTime - leftTime
    })
}

function getLatestTransaction(row = {}) {
  const transaction = (Array.isArray(row?.transactions) ? row.transactions : [])
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = new Date(left.updatedAt || left.updated_at || left.createdAt || left.created_at || 0).getTime()
      const rightTime = new Date(right.updatedAt || right.updated_at || right.createdAt || right.created_at || 0).getTime()
      return rightTime - leftTime
    })[0] || null
  if (transaction) return transaction
  const fallbackId = getLeadLinkedTransactionId(row)
  return fallbackId ? { id: fallbackId, status: 'Linked' } : null
}

function normalizeClientIntakePreference(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (['hard_copy', 'hardcopy', 'paper', 'printed'].includes(normalized)) return 'hard_copy'
  if (['agent_assisted', 'assisted', 'manual', 'agent'].includes(normalized)) return 'agent_assisted'
  return normalized ? 'digital_portal' : ''
}

function formatClientIntakePreference(value = '') {
  const normalized = normalizeClientIntakePreference(value)
  if (normalized === 'hard_copy') return 'Hard copy'
  if (normalized === 'agent_assisted') return 'Agent assisted'
  if (normalized === 'digital_portal') return 'Digital portal'
  return 'Not set'
}

function buildLeadCanonicalOfferActionPatch(offer = {}, actor = null, actionLabel = '', note = '', extraConditions = {}) {
  const safeOffer = offer || {}
  const trimmedNote = normalizeText(note)
  const existingConditions = safeOffer.conditions || safeOffer.conditionsJson || safeOffer.conditions_json || {}
  return {
    conditions_json: {
      ...existingConditions,
      ...extraConditions,
      agentActionHistory: [
        ...(Array.isArray(existingConditions.agentActionHistory) ? existingConditions.agentActionHistory : []),
        {
          action: actionLabel || 'status_update',
          note: trimmedNote,
          at: new Date().toISOString(),
          actorId: actor?.id || actor?.userId || '',
          actorName: actor?.fullName || actor?.name || actor?.email || 'Agent',
        },
      ],
      latestAgentNote: trimmedNote || existingConditions.latestAgentNote || '',
    },
  }
}

function getLeadOfferEdgeWarnings(lead = {}, selectedOffer = null) {
  const warnings = []
  const safeOffers = sortOffersNewestFirst(lead?.offers || [])
  const selectedOfferId = getOfferId(selectedOffer)
  const byListing = new Map()
  const acceptedOffers = []

  for (const offer of safeOffers) {
    const listingId = getOfferListingId(offer)
    const lifecycle = getOfferLifecycleState(offer)
    if (listingId && !lifecycle.terminal) {
      const current = byListing.get(listingId) || []
      current.push(offer)
      byListing.set(listingId, current)
    }
    if (lifecycle.acceptedOrConverted) acceptedOffers.push(offer)
  }

  for (const [listingId, offers] of byListing.entries()) {
    if (offers.length < 2) continue
    const touchesSelected = !selectedOfferId || offers.some((offer) => getOfferId(offer) === selectedOfferId)
    if (!touchesSelected) continue
    warnings.push({
      tone: 'amber',
      text: `${offers.length} open offer records exist on ${listingId}. Keep one live negotiation path and close the others cleanly.`,
    })
  }

  if (acceptedOffers.length > 1) {
    warnings.push({
      tone: 'red',
      text: `${acceptedOffers.length} offers are marked accepted or converted for this lead. Check that only one real deal is still active.`,
    })
  }

  const latestTransaction = getLatestTransaction(lead)
  const transactionLifecycleState = normalizeText(latestTransaction?.lifecycleState || latestTransaction?.lifecycle_state).toLowerCase()
  if (latestTransaction && transactionLifecycleState === 'cancelled') {
    warnings.push({
      tone: 'red',
      text: 'The linked transaction has been cancelled. Keep the history, then decide whether negotiations restart or the lead should be closed out.',
    })
  }

  const selectedLifecycle = selectedOffer ? getOfferLifecycleState(selectedOffer) : null
  if (selectedLifecycle?.effectiveStatus === 'expired') {
    warnings.push({
      tone: 'amber',
      text: 'This offer has expired. Send a fresh offer link if the buyer still wants to proceed.',
    })
  }
  if (selectedLifecycle?.effectiveStatus === 'withdrawn') {
    warnings.push({
      tone: 'amber',
      text: 'The buyer withdrew this offer. Restart with a new offer only if they explicitly come back in.',
    })
  }
  if (selectedLifecycle?.acceptedOrConverted && !getOfferTransactionId(selectedOffer) && transactionLifecycleState !== 'cancelled') {
    warnings.push({
      tone: 'blue',
      text: 'This offer is accepted but not visibly linked to a transaction yet. Reuse the conversion panel below rather than creating parallel records.',
    })
  }

  return warnings
}

function getLeadClientIntakePreference(row = {}) {
  const acceptedOffer = getAcceptedOfferForConversion(row?.offers || [])
  const latestOffer = acceptedOffer || getLatestOffer(row)
  const latestTransaction = getLatestTransaction(row)
  return normalizeClientIntakePreference(
    latestTransaction?.clientIntakePreference ||
      latestTransaction?.client_intake_preference ||
      latestOffer?.clientIntakePreference ||
      latestOffer?.client_intake_preference ||
      latestOffer?.conditions?.clientIntakePreference ||
      latestOffer?.conditions?.client_intake_preference ||
      latestOffer?.conditionsJson?.clientIntakePreference ||
      latestOffer?.conditions_json?.clientIntakePreference,
  )
}

function getLatestDeliveryByType(row = {}, types = []) {
  const expected = new Set((Array.isArray(types) ? types : [types]).map((item) => normalizeText(item).toLowerCase()).filter(Boolean))
  if (!expected.size) return null
  return (Array.isArray(row?.communicationDeliveries) ? row.communicationDeliveries : [])
    .filter(Boolean)
    .filter((delivery) => expected.has(normalizeText(delivery.communicationType || delivery.communication_type).toLowerCase()))
    .sort((left, right) => {
      const leftTime = new Date(left.openedAt || left.opened_at || left.deliveredAt || left.delivered_at || left.sentAt || left.sent_at || left.failedAt || left.failed_at || left.preparedAt || left.prepared_at || left.createdAt || left.created_at || 0).getTime()
      const rightTime = new Date(right.openedAt || right.opened_at || right.deliveredAt || right.delivered_at || right.sentAt || right.sent_at || right.failedAt || right.failed_at || right.preparedAt || right.prepared_at || right.createdAt || right.created_at || 0).getTime()
      return rightTime - leftTime
    })[0] || null
}

function getBuyerDealSnapshot(row = {}) {
  const latestViewing = getLatestViewingAppointment(row)
  const latestOffer = getLatestOffer(row)
  const acceptedOffer = getAcceptedOfferForConversion(row?.offers || [])
  const latestTransaction = getLatestTransaction(row)
  const handoff = getLeadHandoffState(row)
  const intakePreference = getLeadClientIntakePreference(row)
  const offerLinkDelivery = getLatestDeliveryByType(row, ['buyer_offer_link'])
  const sellerReviewDelivery = getLatestDeliveryByType(row, ['seller_offer_review'])
  const onboardingDelivery = getLatestDeliveryByType(row, ['client_onboarding'])
  const offerLifecycle = latestOffer ? getOfferLifecycleState(latestOffer) : null
  const offerStatus = offerLifecycle?.effectiveStatus || getOfferStatus(latestOffer)
  const transactionId = getLeadLinkedTransactionId(row)
  const onboardingStatus = normalizeText(latestTransaction?.onboardingStatus || latestTransaction?.onboarding_status).toLowerCase()
  const mainStage = normalizeText(latestTransaction?.currentMainStage || latestTransaction?.current_main_stage).toLowerCase()
  const transactionLifecycleState = normalizeText(latestTransaction?.lifecycleState || latestTransaction?.lifecycle_state).toLowerCase()

  let offerStateLabel = latestOffer ? formatCleanValue(latestOffer.status || 'Draft') : 'No offer yet'
  let offerStateHelper = latestOffer
    ? `Latest update ${formatRelativeTime(latestOffer.acceptedAt || latestOffer.accepted_at || latestOffer.updatedAt || latestOffer.updated_at || latestOffer.createdAt || latestOffer.created_at, 'recently')}.`
    : 'Complete a viewing and capture the next move before pushing the deal.'
  let offerStateTone = latestOffer ? getOfferStatusTone(offerLifecycle?.effectiveStatus || latestOffer.status) : 'slate'

  if (offerLinkDelivery?.status === 'failed') {
    offerStateLabel = 'Offer link failed'
    offerStateHelper = offerLinkDelivery.errorMessage || 'The buyer did not receive the offer link.'
    offerStateTone = 'red'
  } else if (!latestOffer && latestViewing && (String(latestViewing.status || '').toLowerCase() === 'completed' || latestViewing.completedAt || latestViewing.completed_at)) {
    offerStateLabel = 'Viewing done, offer next step pending'
    offerStateHelper = 'Either send the offer link, book another viewing, or close this property out.'
    offerStateTone = 'amber'
  } else if (offerStatus === 'sent_to_buyer' || offerStatus === 'draft') {
    if (offerLinkDelivery?.openedAt || offerLinkDelivery?.opened_at) {
      offerStateLabel = 'Buyer reviewing offer'
      offerStateHelper = `Buyer opened the offer link ${formatRelativeTime(offerLinkDelivery.openedAt || offerLinkDelivery.opened_at, 'recently')}.`
      offerStateTone = 'blue'
    } else if (offerLinkDelivery?.sentAt || offerLinkDelivery?.sent_at || offerLinkDelivery?.preparedAt || offerLinkDelivery?.prepared_at) {
      offerStateLabel = 'Offer link sent'
      offerStateHelper = 'Waiting for the buyer to open or submit the offer.'
      offerStateTone = 'amber'
    }
  } else if (offerStatus.includes('submitted') || offerStatus.includes('review')) {
    if (sellerReviewDelivery?.status === 'failed') {
      offerStateLabel = 'Seller review failed'
      offerStateHelper = sellerReviewDelivery.errorMessage || 'The seller review pack needs to be resent or handled manually.'
      offerStateTone = 'red'
    } else if (sellerReviewDelivery?.openedAt || sellerReviewDelivery?.opened_at) {
      offerStateLabel = 'Seller reviewing offer'
      offerStateHelper = `Seller opened the review ${formatRelativeTime(sellerReviewDelivery.openedAt || sellerReviewDelivery.opened_at, 'recently')}.`
      offerStateTone = 'amber'
    } else if (sellerReviewDelivery?.sentAt || sellerReviewDelivery?.sent_at || sellerReviewDelivery?.preparedAt || sellerReviewDelivery?.prepared_at) {
      offerStateLabel = 'Seller review sent'
      offerStateHelper = 'Waiting for the seller to open and decide.'
      offerStateTone = 'amber'
    } else {
      offerStateLabel = 'Agent review required'
      offerStateHelper = 'Buyer submitted the offer, but it still needs to go to the seller.'
      offerStateTone = 'blue'
    }
  } else if (offerStatus.includes('counter')) {
    offerStateLabel = 'Counter-offer in play'
    offerStateHelper = 'Review the seller counter terms and decide how to take them back to the buyer.'
    offerStateTone = 'amber'
  } else if (offerStatus === 'withdrawn') {
    offerStateLabel = 'Buyer withdrew offer'
    offerStateHelper = 'Only restart this deal if the buyer clearly re-engages. A fresh offer link is usually cleaner than reusing the old one.'
    offerStateTone = 'red'
  } else if (offerStatus === 'expired') {
    offerStateLabel = 'Offer expired'
    offerStateHelper = 'The secure offer window has lapsed. Send a new offer link if negotiations are still alive.'
    offerStateTone = 'red'
  } else if (offerStatus === 'rejected') {
    offerStateLabel = 'Offer rejected'
    offerStateHelper = 'This offer is closed. Restart with new terms only if the seller and buyer want to reopen the discussion.'
    offerStateTone = 'red'
  } else if (acceptedOffer) {
    offerStateLabel = transactionId ? 'Accepted offer linked' : 'Accepted offer ready'
    offerStateHelper = transactionId
      ? 'This accepted offer is already tied to a transaction workspace.'
      : 'Seller has accepted. The next move is to create the transaction workspace.'
    offerStateTone = transactionId ? 'green' : 'amber'
  }

  let transactionStateLabel = latestTransaction ? formatCleanValue(latestTransaction.status || latestTransaction.currentMainStage || 'Transaction linked') : 'No transaction yet'
  let transactionStateHelper = latestTransaction
    ? 'Open the transaction workspace to continue the deal.'
    : acceptedOffer
      ? 'Create the transaction from the accepted offer.'
      : 'A transaction appears only after a real accepted offer.'
  let transactionStateTone = latestTransaction ? 'blue' : acceptedOffer ? 'amber' : 'slate'

  if (latestTransaction) {
    if (transactionLifecycleState === 'cancelled') {
      transactionStateLabel = 'Deal fell through'
      transactionStateHelper = latestTransaction?.cancelledAt || latestTransaction?.cancelled_at
        ? `Transaction cancelled ${formatRelativeTime(latestTransaction.cancelledAt || latestTransaction.cancelled_at, 'recently')}. Decide whether to restart negotiations or close the lead.`
        : 'The transaction has been cancelled. Decide whether negotiations restart or the lead should be closed.'
      transactionStateTone = 'red'
    } else if (onboardingStatus.includes('signed_otp_received')) {
      transactionStateLabel = 'Signed OTP received'
      transactionStateHelper = 'Finance and attorney handoff can now continue from the transaction.'
      transactionStateTone = 'green'
    } else if (onboardingStatus.includes('awaiting_signed_otp')) {
      transactionStateLabel = 'Signed OTP outstanding'
      transactionStateHelper = intakePreference === 'hard_copy'
        ? 'Prepare the hard-copy OTP pack, collect signatures, and upload the signed OTP.'
        : intakePreference === 'agent_assisted'
          ? 'Assist the client through OTP signing and upload the signed OTP once completed.'
          : 'Release or resend the OTP for signature, then follow up until the signed OTP is back.'
      transactionStateTone = 'amber'
    } else if (onboardingStatus.includes('completed')) {
      transactionStateLabel = 'Onboarding complete'
      transactionStateHelper = 'Prepare the OTP and move the buyer into signing.'
      transactionStateTone = 'blue'
    } else if (onboardingDelivery?.status === 'failed') {
      transactionStateLabel = 'Onboarding needs attention'
      transactionStateHelper = onboardingDelivery.errorMessage || 'Buyer onboarding did not send cleanly.'
      transactionStateTone = 'red'
    } else if (handoff.buyerOnboardingSent || onboardingDelivery?.sentAt || onboardingDelivery?.sent_at || onboardingDelivery?.preparedAt || onboardingDelivery?.prepared_at) {
      transactionStateLabel = 'Buyer onboarding sent'
      transactionStateHelper = intakePreference === 'hard_copy'
        ? 'Use the onboarding pack offline, then return with the signed paperwork.'
        : intakePreference === 'agent_assisted'
          ? 'Help the buyer finish onboarding and keep the transaction in OTP prep.'
          : 'Waiting for the buyer to complete onboarding before OTP.'
      transactionStateTone = 'amber'
    } else if (mainStage === 'otp') {
      transactionStateLabel = 'OTP stage active'
      transactionStateHelper = 'The transaction is in OTP and still needs the buyer-side paperwork to move.'
      transactionStateTone = 'amber'
    } else {
      transactionStateLabel = 'Buyer onboarding pending'
      transactionStateHelper = intakePreference === 'hard_copy'
        ? 'Prepare the offline onboarding pack and capture documents manually.'
        : intakePreference === 'agent_assisted'
          ? 'Open the transaction and start assisted onboarding with the buyer.'
          : 'Send or reopen buyer onboarding from the transaction workspace.'
      transactionStateTone = 'amber'
    }
  }

  return {
    latestViewing,
    latestOffer,
    acceptedOffer,
    latestTransaction,
    transactionId,
    intakePreference,
    intakeLabel: formatClientIntakePreference(intakePreference),
    offerStateLabel,
    offerStateHelper,
    offerStateTone,
    transactionStateLabel,
    transactionStateHelper,
    transactionStateTone,
  }
}

function getLeadOfferPropertyContexts(lead = {}) {
  const safeLead = lead || {}
  const propertyOptions = getLeadAppointmentPropertyOptions(safeLead).filter(Boolean)
  const optionById = new Map(propertyOptions.map((option) => [option.id, option]))
  const contexts = []
  const seen = new Set()
  const addContext = (context = {}) => {
    const listingId = normalizeText(context.listingId)
    if (!listingId) return
    const appointmentId = normalizeText(context.appointmentId)
    const key = context.key || `${appointmentId || 'property'}:${listingId}`
    if (seen.has(key)) return
    seen.add(key)
    const option = optionById.get(listingId) || {}
    const appointmentStatus = normalizeText(context.appointmentStatus).toLowerCase()
    const completed = appointmentStatus === 'completed' || Boolean(context.completedAt)
    const confirmed = appointmentStatus === 'confirmed'
    contexts.push({
      key,
      listingId,
      appointmentId,
      label: context.label || option.label || 'Selected property',
      description: context.description || option.description || 'Property details pending',
      price: context.price || option.price || null,
      appointmentLabel: context.appointmentLabel || '',
      appointmentStatus: context.appointmentStatus || '',
      source: context.source || option.source || 'Linked property',
      completed,
      confirmed,
      readiness: completed ? 'best' : confirmed ? 'ready' : appointmentId ? 'scheduled' : 'manual',
      readinessLabel: completed ? 'Completed viewing' : confirmed ? 'Confirmed viewing' : appointmentId ? 'Viewing scheduled' : 'No viewing linked',
      priority: completed ? 0 : confirmed ? 1 : appointmentId ? 2 : 3,
    })
  }

  for (const appointment of Array.isArray(safeLead.appointments) ? safeLead.appointments : []) {
    if (!appointment) continue
    if (!isViewingAppointment(appointment)) continue
    const listingId = getAppointmentListingId(appointment)
    if (!listingId) continue
    const option = optionById.get(listingId) || {}
    addContext({
      key: `${getAppointmentId(appointment)}:${listingId}`,
      listingId,
      appointmentId: getAppointmentId(appointment),
      label: option.label || appointment.location || 'Viewed property',
      description: option.description || appointment.location || getAppointmentDateLabel(appointment),
      price: option.price,
      appointmentLabel: getAppointmentDateLabel(appointment),
      appointmentStatus: appointment.status || '',
      completedAt: appointment.completedAt || appointment.completed_at,
      source: 'Viewing',
    })
  }

  for (const option of propertyOptions) {
    addContext({
      key: `property:${option.id}`,
      listingId: option.id,
      label: option.label,
      description: option.description,
      price: option.price,
      source: option.isOriginalEnquiry ? 'Enquiry property' : option.source,
    })
  }

  return contexts.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority
    return left.label.localeCompare(right.label)
  })
}

function getAppointmentParticipantRoleSet(item = {}) {
  return new Set((Array.isArray(item.participants) ? item.participants : [])
    .map((participant) => normalizeText(participant.participantRole || participant.role).toLowerCase())
    .filter(Boolean))
}

function getAppointmentIntegrityBadges(item = {}) {
  const roles = getAppointmentParticipantRoleSet(item)
  const hasCalendarTime = Boolean(item.dateTime || item.date_time || ((item.date || item.appointmentDate || item.appointment_date) && (item.startTime || item.start_time || item.appointmentTime || item.appointment_time)))
  const hasInviteSignal = Boolean(item.notificationsQueued || item.invitationSentAt || item.invitation_sent_at || (Array.isArray(item.participants) && item.participants.some((participant) => participant.invitationSentAt || participant.invitation_sent_at || participant.lastInvitationSentAt || participant.last_invitation_sent_at)))
  return [
    { label: 'Calendar', done: hasCalendarTime, tone: hasCalendarTime ? 'green' : 'amber' },
    { label: 'Lead', done: Boolean(item.leadId || item.lead_id), tone: item.leadId || item.lead_id ? 'green' : 'amber' },
    { label: 'Property', done: Boolean(item.listingId || item.listing_id), tone: item.listingId || item.listing_id ? 'green' : 'amber' },
    { label: 'Buyer', done: roles.has('buyer') || Boolean(item.contactId || item.contact_id), tone: roles.has('buyer') || item.contactId || item.contact_id ? 'green' : 'amber' },
    { label: 'Agent', done: roles.has('agent') || Boolean(item.assignedAgentId || item.agentId || item.agent_id), tone: roles.has('agent') || item.assignedAgentId || item.agentId || item.agent_id ? 'green' : 'amber' },
    { label: 'Invite', done: hasInviteSignal, tone: hasInviteSignal ? 'green' : 'slate' },
  ]
}

function buildAppointmentCreateMessage(result = {}, draft = {}, isViewing = false) {
  const calendarMessage = result?.appointmentId || result?.appointment_id
    ? 'Appointment saved to the shared calendar source.'
    : 'Appointment created; calendar id is pending.'
  const workflowMessage = isViewing
    ? `${draft.listingIds?.length > 1 ? `${draft.listingIds.length} viewing properties were linked.` : 'Viewing lifecycle and lead timeline update were requested.'}`
    : 'Lead timeline update was requested.'
  const sellerFirstMessage = isViewing && draft.appointmentStatus === 'requested'
    ? draft.sellerRequestCount > 0
      ? `Seller availability request${draft.sellerRequestCount === 1 ? '' : 's'} queued first; buyer approval stays pending until seller acceptance.`
      : 'Seller contacts were not available, so the viewing request was saved internally for follow-up.'
    : ''
  const inviteMessage = sellerFirstMessage || (draft.sendInviteEmails
    ? result?.notificationsQueued
      ? 'Buyer invite and reminders were queued.'
      : 'Invite sending was requested, but the notification queue did not report as queued.'
    : 'Buyer invite was skipped by agent choice.')
  return [calendarMessage, workflowMessage, inviteMessage].join(' ')
}

function getBuyerOutreachSteps(row = {}) {
  const safeRow = row || {}
  const ownershipStatus = normalizeText(safeRow.ownershipStatus || safeRow.ownership_status).toLowerCase()
  const appointments = (Array.isArray(safeRow.appointments) ? safeRow.appointments : []).filter(Boolean)
  const viewings = appointments.filter(isViewingAppointment)
  const scheduledViewings = viewings.filter((item) => !['cancelled', 'completed', 'no_show'].includes(String(item.status || '').toLowerCase()))
  const completedViewings = viewings.filter((item) => String(item.status || '').toLowerCase() === 'completed' || item.completedAt || item.completed_at)
  const timeline = (Array.isArray(safeRow.communicationTimeline) ? safeRow.communicationTimeline : []).filter(Boolean)
  const outreachLogged = Boolean(safeRow.firstContactedAt || safeRow.first_contacted_at || ownershipStatus === 'contacted' || timeline.some((item) => {
    const haystack = `${item.activityType || item.activity_type || ''} ${item.communicationType || item.communication_type || ''} ${item.title || ''}`.toLowerCase()
    return ['call', 'email', 'whatsapp', 'meeting', 'outreach', 'contacted'].some((token) => haystack.includes(token))
  }))
  const offers = (Array.isArray(safeRow.offers) ? safeRow.offers : []).filter(Boolean)
  const transactions = (Array.isArray(safeRow.transactions) ? safeRow.transactions : []).filter(Boolean)

  return [
    { key: 'captured', label: 'Lead captured', done: true, meta: formatDate(safeRow.createdAt || safeRow.created_at, 'Captured'), hint: 'Created automatically when the enquiry lands.' },
    { key: 'reached_out', label: 'Reached out', done: outreachLogged, meta: outreachLogged ? 'Logged' : 'Pending', hint: 'Mark first contact after calling, emailing, or messaging.' },
    { key: 'viewing_scheduled', label: 'Viewing scheduled', done: viewings.length > 0, meta: scheduledViewings.length ? `${scheduledViewings.length} scheduled` : 'None yet', hint: 'Add one or more viewing appointments for this buyer.' },
    { key: 'viewing_completed', label: 'Viewing completed', done: completedViewings.length > 0, meta: completedViewings.length ? `${completedViewings.length} completed` : 'Pending', hint: 'Complete a viewing appointment after it happens.' },
    { key: 'offer_made', label: 'Offer made', done: offers.length > 0, meta: offers.length ? `${offers.length} offer${offers.length === 1 ? '' : 's'}` : 'No offer', hint: 'Create or link an offer when the buyer is ready.' },
    { key: 'transaction_created', label: 'Transaction created', done: Boolean(safeRow.convertedTransactionId || safeRow.converted_transaction_id || transactions.length), meta: transactions.length ? `${transactions.length} transaction${transactions.length === 1 ? '' : 's'}` : 'Not created', hint: 'Convert the lead once there is a real transaction.' },
  ]
}

function BuyerOutreachProgress({ row, onLogOutreach, onMarkReachedOut, onAddViewing, onOpenAppointments, onOpenOffers, onConvert }) {
  const steps = getBuyerOutreachSteps(row)
  const [workingKey, setWorkingKey] = useState('')
  const [error, setError] = useState('')
  const completedCount = steps.filter((step) => step.done).length
  const progress = Math.round((completedCount / Math.max(steps.length, 1)) * 100)
  const actions = {
    reached_out: { label: 'Mark reached out', handler: onMarkReachedOut },
    viewing_scheduled: { label: 'Add viewing', handler: onAddViewing },
    viewing_completed: { label: 'Open appointments', handler: onOpenAppointments || onAddViewing },
    offer_made: { label: 'Open offers', handler: onOpenOffers },
    transaction_created: { label: 'Convert lead', handler: onConvert },
  }
  const nextStep = steps.find((step) => !step.done)
  const nextAction = nextStep ? actions[nextStep.key] : { label: 'Review timeline', handler: onLogOutreach }

  async function runStageAction(step) {
    const action = actions[step.key]
    if (!action?.handler) return
    try {
      setWorkingKey(step.key)
      setError('')
      await action.handler()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update outreach progress.')
    } finally {
      setWorkingKey('')
    }
  }

  async function runPrimaryAction() {
    if (!nextStep) {
      onLogOutreach?.()
      return
    }
    await runStageAction(nextStep)
  }

  return (
    <section className={`${panelClass} lead-outreach-progress card`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Lead Outreach Progress</h2>
          <p className="mt-1 text-sm text-slate-500">
            Next step: <span className="font-semibold text-slate-700">{nextStep?.label || 'Keep nurturing this lead'}</span>. Each stage shows how the agent moves it forward.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onLogOutreach} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Log outreach
          </button>
          <button type="button" onClick={runPrimaryAction} disabled={Boolean(workingKey)} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {workingKey ? 'Updating...' : nextAction.label}
          </button>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      <div className="lead-progress-grid mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {steps.map((step) => (
          <div key={step.key} className={`lead-progress-step rounded-2xl border p-3 ${step.done ? 'border-blue-100 bg-blue-50/40' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step.done ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 ring-1 ring-slate-200'}`}>
                <CheckCircle2 size={14} />
              </span>
              <div className="min-w-0">
                <p className="lead-progress-step-label text-sm font-semibold leading-5 text-slate-950">{step.label}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{step.meta}</p>
              </div>
            </div>
            <p className="lead-progress-step-hint mt-3 text-xs leading-5 text-slate-500">{step.hint}</p>
            {!step.done && actions[step.key]?.handler ? (
              <button type="button" onClick={() => runStageAction(step)} disabled={Boolean(workingKey)} className="lead-progress-step-action mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">
                {workingKey === step.key ? 'Updating...' : actions[step.key].label}
              </button>
            ) : (
              <span className="lead-progress-step-action mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-xl bg-white px-3 text-xs font-semibold text-slate-500 ring-1 ring-slate-100">
                {step.done ? 'Complete' : 'Awaiting previous step'}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function BuyerHeaderStatusBlock({ icon, label, value, tone = 'slate', helper = '' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        {icon ? createElement(icon, { size: 14, className: 'shrink-0' }) : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${tone === 'green' ? 'bg-emerald-500' : tone === 'blue' ? 'bg-blue-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'red' ? 'bg-rose-500' : 'bg-slate-300'}`} />
        <strong className="truncate text-sm font-semibold text-slate-950">{value || '—'}</strong>
      </div>
      {helper ? <p className="mt-1 truncate text-xs font-semibold text-slate-500">{helper}</p> : null}
    </div>
  )
}

function BuyerLeadHeader({ row, sourceInfo, leadScore, lastActivity, onOpenTimeline, onDelete, onRunCommand }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const command = getBuyerWorkspaceCommand(row)
  const deal = command.snapshot || getBuyerDealSnapshot(row)
  const finance = getBuyerFinanceReadiness(row)
  const documents = getBuyerDocumentReadiness(row)
  const property = getBuyerPropertyReadiness(row)
  const stageLabel = formatCleanValue(row.stage || row.status)
  const transactionValue = deal.latestTransaction ? deal.transactionStateLabel : 'Not Created'
  const transactionTone = deal.latestTransaction ? deal.transactionStateTone : 'slate'
  const runPrimaryAction = () => onRunCommand?.(command.actionId || 'overview')
  return (
    <header className={`${panelClass} overflow-visible bg-gradient-to-br from-white via-white to-slate-50 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]`}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,1fr)_220px] xl:items-start">
        <div className="flex min-w-0 gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-slate-950 text-xl font-semibold text-white shadow-[0_18px_34px_rgba(15,23,42,0.18)]">
            {getInitials(row.name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="blue">Buyer Journey</StatusPill>
              <StatusPill tone={getStageTone(row.stage)}>{stageLabel}</StatusPill>
              <StatusPill tone={leadScore >= 80 ? 'green' : 'amber'}>{getIntentLabel(leadScore)}</StatusPill>
              <StatusPill>{formatDate(row.createdAt || row.created_at, 'No created date')}</StatusPill>
            </div>
            <h1 className="mt-3 break-words text-3xl font-semibold tracking-[-0.045em] text-slate-950">{row.name}</h1>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5"><Phone size={15} />{row.phone || 'No phone'}</span>
              <span className="inline-flex items-center gap-1.5"><Mail size={15} />{row.email || 'No email'}</span>
              <span className="inline-flex items-center gap-1.5"><Tag size={15} />{formatCleanValue(sourceInfo?.leadSource || row.source)}</span>
            </div>
            {lastActivity?.date ? <p className="mt-2 text-sm font-medium text-slate-500">Last activity {formatRelativeTime(lastActivity.date)} · {formatDateTime(lastActivity.date)}</p> : null}
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <BuyerHeaderStatusBlock icon={UserRound} label="Assigned Agent" value={getOwnerName(row)} tone={getOwnerName(row) === 'Unassigned' ? 'amber' : 'green'} />
          <BuyerHeaderStatusBlock icon={Clock3} label="Current Stage" value={stageLabel} tone={getStageTone(row.stage || row.status)} />
          <BuyerHeaderStatusBlock icon={CreditCard} label="Finance" value={finance.label} tone={finance.tone} helper={`${finance.score}% ready`} />
          <BuyerHeaderStatusBlock icon={Target} label="Property Match" value={property.label} tone={property.tone} helper={`${property.percent}% fit`} />
          <BuyerHeaderStatusBlock icon={FileText} label="Documents" value={documents.label} tone={documents.tone} helper={`${documents.complete}/${documents.total} complete`} />
          <BuyerHeaderStatusBlock icon={Home} label="Transaction" value={transactionValue} tone={transactionTone} helper={deal.intakePreference ? deal.intakeLabel : ''} />
        </div>

        <div className="flex flex-col gap-2 xl:items-stretch">
          <button type="button" onClick={runPrimaryAction} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)] hover:bg-slate-800">
            {command.actionLabel}
            <ExternalLink size={15} />
          </button>
          <button type="button" onClick={onOpenTimeline} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Clock3 size={15} />
            Activity
          </button>
          <div className="relative">
            <button type="button" onClick={() => setMoreOpen((open) => !open)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" aria-haspopup="menu" aria-expanded={moreOpen}>
              <MoreVertical size={15} />
              More
            </button>
            {moreOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-700 shadow-xl" role="menu">
                <button type="button" onClick={() => { setMoreOpen(false); onOpenTimeline?.() }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50" role="menuitem">
                  <Clock3 size={15} />
                  View timeline
                </button>
                <button type="button" onClick={() => { setMoreOpen(false); onDelete?.() }} className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-red-600 hover:bg-red-50" role="menuitem">
                  <Trash2 size={15} />
                  Delete lead
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}

function BuyerCommandMetric({ icon, label, value, tone = 'slate', helper = '' }) {
  const toneClass = tone === 'green'
    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
    : tone === 'blue'
      ? 'border-blue-100 bg-blue-50 text-blue-700'
      : tone === 'amber'
        ? 'border-amber-100 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-slate-50 text-slate-700'
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] opacity-80">
        {icon ? createElement(icon, { size: 15 }) : null}
        {label}
      </div>
      <strong className="mt-3 block text-2xl font-semibold tracking-[-0.045em] text-slate-950">{value}</strong>
      {helper ? <p className="mt-1 text-sm font-semibold text-slate-600">{helper}</p> : null}
    </div>
  )
}

function BuyerJourneyCommandRow({ row, onNavigate, onConvert }) {
  const command = getBuyerWorkspaceCommand(row)
  const deal = command.snapshot || getBuyerDealSnapshot(row)
  const missing = command.blockers?.length ? command.blockers : ['No major blocker visible']
  const toneClass = command.tone === 'green'
    ? 'border-emerald-100 bg-emerald-50/70'
    : command.tone === 'blue'
      ? 'border-blue-100 bg-blue-50/70'
      : 'border-amber-100 bg-amber-50/70'
  const runCommand = () => {
    if (command.actionId === 'convert') onConvert?.()
    else onNavigate?.(command.actionId || 'overview')
  }
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)_minmax(280px,0.75fr)]">
      <article className={`rounded-2xl border p-5 shadow-sm ${toneClass}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <AlertTriangle size={15} className={command.tone === 'green' ? 'text-emerald-600' : command.tone === 'blue' ? 'text-blue-600' : 'text-amber-600'} />
              Next Best Action
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-slate-950">{command.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{command.copy}</p>
          </div>
          <button type="button" onClick={runCommand} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
            {command.actionLabel}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {missing.map((item) => (
            <span key={item} className="inline-flex min-h-8 items-center rounded-full bg-white/80 px-3 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{item}</span>
          ))}
        </div>
      </article>

      <article className={`${panelClass} p-5`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Deal Path</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.035em] text-slate-950">Viewing and offer state</h2>
          </div>
          <StatusPill tone={deal.offerStateTone}>{deal.offerStateLabel}</StatusPill>
        </div>
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
            <dt className="font-semibold text-slate-500">Latest viewing</dt>
            <dd className="truncate text-right font-semibold text-slate-950">{deal.latestViewing ? getAppointmentDateLabel(deal.latestViewing) : 'No viewing logged'}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
            <dt className="font-semibold text-slate-500">Latest offer</dt>
            <dd className="truncate text-right font-semibold text-slate-950">{deal.latestOffer ? formatCurrency(getOfferAmount(deal.latestOffer)) : 'No offer yet'}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Current offer state</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">{deal.offerStateLabel}</dd>
            <p className="mt-1 text-xs leading-5 text-slate-500">{deal.offerStateHelper}</p>
          </div>
        </dl>
      </article>

      <article className={`${panelClass} overflow-hidden p-5`}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          <Home size={15} />
          Transaction
        </p>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">{deal.transactionStateLabel}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{deal.transactionStateHelper}</p>
          </div>
          <StatusPill tone={deal.transactionStateTone}>{deal.latestTransaction ? 'Linked' : 'Pending'}</StatusPill>
        </div>
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
            <dt className="font-semibold text-slate-500">Client mode</dt>
            <dd className="truncate text-right font-semibold text-slate-950">{deal.intakeLabel}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
            <dt className="font-semibold text-slate-500">Transaction link</dt>
            <dd className="truncate text-right font-semibold text-slate-950">{deal.transactionId || 'Not created'}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Practical note</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">
              {deal.intakePreference === 'hard_copy'
                ? 'Paper-led client path'
                : deal.intakePreference === 'agent_assisted'
                  ? 'Agent-assisted client path'
                  : 'Digital client path'}
            </dd>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {deal.intakePreference === 'hard_copy'
                ? 'Keep the workflow moving even when signatures and onboarding happen offline.'
                : deal.intakePreference === 'agent_assisted'
                  ? 'The agent can step in and capture the process without forcing the buyer through self-service.'
                  : 'The portal flow is available end to end when the buyer is comfortable using it.'}
            </p>
          </div>
        </dl>
      </article>
    </section>
  )
}

function BuyerLeadOverview({ row, workspace = {}, sourceInfo, onNavigate }) {
  const requirement = getBuyerPrimaryRequirement(row)
  const lastActivity = getBuyerLastActivity(row)
  return (
    <div className="section-stack">
      <section className="card-grid buyer-overview-grid">
        <BuyerSnapshotCard row={row} requirement={requirement} onEdit={() => onNavigate('property_match')} />
        <BuyerLeadStatusCard row={row} sourceInfo={sourceInfo} lastActivity={lastActivity} />
        <BuyerActivityOverviewCard row={row} workspace={workspace} />
      </section>

      <section className="card-grid buyer-overview-lower-grid">
        <BuyerOverviewRecentActivityCard row={row} timeline={workspace.timeline || row.communicationTimeline || []} onViewAll={() => onNavigate('timeline')} />
        <BuyerTasksDueCard tasks={row.tasks || []} onAddTask={() => onNavigate('tasks')} />
      </section>
    </div>
  )
}

function LeadIdentityBlock({ row, onOpen }) {
  return (
    <button type="button" onClick={onOpen} className="group min-w-0 text-left">
      <span className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
          {getLeadInitials(row.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-950 group-hover:text-blue-700">{row.name}</span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500">
            <span className="truncate">{row.phone || 'No phone'}</span>
            {row.email ? <span className="max-w-[180px] truncate">{row.email}</span> : null}
          </span>
        </span>
      </span>
    </button>
  )
}

function getLeadInitials(name = '') {
  const normalized = normalizeText(name)
  if (!normalized) return '—'
  const parts = normalized.split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function LeadSourcePill({ source = '' }) {
  const sourceKey = normalizeLeadSourceForPill(source)
  const sourceStyle = LEAD_SOURCE_PILL_STYLES[sourceKey] || LEAD_SOURCE_PILL_FALLBACK
  return <StatusPill tone={sourceStyle.tone}>{sourceStyle.label}</StatusPill>
}

function LeadTypeTabs({ activeCategory = 'buyer', rows = [], onChange }) {
  const counts = rows.reduce((accumulator, row) => {
    if (isArchivedLead(row)) {
      accumulator.archived += 1
    } else {
      const category = normalizeLeadCategory(row)
      accumulator[category] = (accumulator[category] || 0) + 1
      accumulator.active += 1
    }
    return accumulator
  }, { active: 0, buyer: 0, seller: 0, other: 0, archived: 0 })

  return (
    <div className="overflow-x-auto">
      <div className="flex min-h-11 items-center gap-2 border-b border-slate-200 pb-2" role="tablist" aria-label="Lead category tabs">
        {LEAD_CATEGORY_FILTERS.map((option) => {
          const active = activeCategory === option.key
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange((previous) => ({ ...previous, category: option.key }))}
              className={`relative inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${active ? 'text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {option.label}
              <span className={`inline-flex min-h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs ${active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                {option.key === 'archived' ? counts.archived : (option.key === 'other' ? counts.other : counts[option.key] || 0)}
              </span>
              {active ? <span className="absolute inset-x-2 -bottom-2 h-0.5 rounded-full bg-blue-500" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RowActionMenu({ row, onOpen }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onOpen} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700">
        Open <ExternalLink size={13} />
      </button>
      <details className="relative">
        <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" aria-label={`More actions for ${row.name}`}>
          <MoreVertical size={16} />
        </summary>
        <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-lg">
          {['Assign', 'Reassign', 'Archive', 'Convert'].map((label) => (
            <button key={label} type="button" onClick={onOpen} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">{label}</button>
          ))}
        </div>
      </details>
    </div>
  )
}

function getLeadTableColumns(category = 'buyer') {
  if (category === 'seller') {
    return [
      { key: 'lead', label: 'Lead' },
      { key: 'source', label: 'Source' },
      { key: 'address', label: 'Address' },
      { key: 'stage', label: 'Stage' },
      { key: 'owner', label: 'Owner' },
      { key: 'activity', label: 'Last Activity' },
      { key: 'action', label: 'Action' },
    ]
  }
  return [
    { key: 'lead', label: 'Lead' },
    { key: 'type', label: 'Type' },
    { key: 'source', label: 'Source' },
    { key: 'property', label: 'Property Enquired On' },
    { key: 'stage', label: 'Stage' },
    { key: 'owner', label: 'Owner' },
    { key: 'activity', label: 'Last Activity' },
    { key: 'action', label: 'Action' },
  ]
}

function getLeadTableTypeLabel(category = 'buyer') {
  if (category === 'seller') return 'Seller'
  if (category === 'other') return 'Other'
  return 'Buyer'
}

function getBuyerPropertyEnquiry(row = {}) {
  const title = normalizeText(row.enquiredPropertyTitle)
  const address = normalizeText(row.enquiredPropertyAddress)
  const price = row.enquiredPropertyPrice
  const hasData = title || address || normalizeText(price)
  if (!hasData) {
    return { title: 'No property linked', address: '—', price: '—' }
  }
  const formattedPrice = price === null || price === undefined || price === '' ? '—' : formatCurrency(price)
  return {
    title,
    address: address || '—',
    price: formattedPrice,
  }
}

function getSellerAddress(row = {}) {
  const firstLine = normalizeText(
    row.sellerPropertyAddress ||
    row.seller_property_address ||
    row.propertyAddress ||
    row.address ||
    row.addressLine1 ||
    '',
  )
  const secondLine = normalizeText(row.areaInterest || row.area_interest || row.suburb || row.city || '')
  const lines = [firstLine].filter(Boolean)
  if (secondLine && !firstLine.toLowerCase().includes(secondLine.toLowerCase())) {
    lines.push(secondLine)
  }
  if (!lines.length) {
    return { first: 'Address Pending', second: '—' }
  }
  return { first: lines[0], second: lines[1] || '—' }
}

function EmptyLeadResults({ onCreate, onImport, onAdjustFilters }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">No leads found</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">Create your first buyer or seller lead to start managing the pipeline.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" onClick={() => onCreate('buyer')} className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Create Buyer Lead</button>
        <button type="button" onClick={() => onCreate('seller')} className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Create Seller Lead</button>
        <button type="button" onClick={onImport} className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Import Leads</button>
        <button type="button" onClick={onAdjustFilters} className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Adjust Filters</button>
      </div>
    </div>
  )
}

function getCreateLeadButtonLabel(category = 'all') {
  if (category === 'buyer') return 'Create Buyer Lead'
  if (category === 'seller') return 'Create Seller Lead'
  if (category === 'other') return 'Create Other Lead'
  return 'Create Lead'
}

function CreateLeadDropdown({ activeCategory = 'all', onCreate, onImport, className = '', buttonClassName = '' }) {
  const [open, setOpen] = useState(false)
  const defaultCategory = ['buyer', 'seller', 'other'].includes(activeCategory) ? activeCategory : ''
  const buttonLabel = getCreateLeadButtonLabel(activeCategory)
  const createOptions = [
    { category: 'buyer', label: 'Buyer Lead', helper: 'Buyer enquiry with budget and area context' },
    { category: 'seller', label: 'Seller Lead', helper: 'Seller enquiry with property and value context' },
    { category: 'other', label: 'Other Lead', helper: 'Basic lead capture for uncategorised work' },
  ]

  function choose(category) {
    setOpen(false)
    onCreate(category)
  }

  return (
    <div className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={() => defaultCategory ? choose(defaultCategory) : setOpen((previous) => !previous)}
        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 ${buttonClassName}`.trim()}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus size={15} />
        {buttonLabel}
        {!defaultCategory ? <ChevronDown size={14} /> : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-72 rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-xl" role="menu">
          {createOptions.map((option) => (
            <button
              key={option.category}
              type="button"
              role="menuitem"
              onClick={() => choose(option.category)}
              className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
            >
              <span className="block text-sm font-semibold text-slate-950">{option.label}</span>
              <span className="mt-0.5 block text-xs font-medium text-slate-500">{option.helper}</span>
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onImport() }} className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-slate-50">
            <span className="block text-sm font-semibold text-slate-950">Import Leads</span>
            <span className="mt-0.5 block text-xs font-medium text-slate-500">Review imported and manually ingested leads</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

function LeadCreateModal({ open, category = 'buyer', form, setForm, saving, error, onClose, onSubmit }) {
  const normalizedCategory = normalizeCanonicalLeadCategory(category, 'other')
  const isBuyer = normalizedCategory === 'buyer'
  const isSeller = normalizedCategory === 'seller'
  const isOther = normalizedCategory === 'other'
  const title = `Create ${isBuyer ? 'Buyer' : isSeller ? 'Seller' : 'Other'} Lead`
  const subtitle = isBuyer
    ? 'Capture buyer contact and search context. Requirements can be refined in the buyer workspace.'
    : isSeller
      ? 'Capture seller contact and property context without buyer requirement fields.'
      : 'Capture a basic lead for follow-up and routing.'

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Cancel</button>
      <button type="submit" form="lead-create-form" disabled={saving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
        <Plus size={15} />
        {saving ? 'Creating...' : title}
      </button>
    </div>
  )

  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title={title} subtitle={subtitle} className="max-w-2xl" footer={footer}>
      <form id="lead-create-form" className="grid gap-4" onSubmit={onSubmit}>
        {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
            Name
            <input value={form.name} onChange={(event) => update('name', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-300" placeholder="Client name" autoFocus />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
            Source
            <select value={form.source} onChange={(event) => update('source', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900">
              {LEAD_SOURCE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
            Phone
            <input value={form.phone} onChange={(event) => update('phone', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-300" placeholder="+27 ..." />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
            Email
            <input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-300" placeholder="client@example.com" />
          </label>
          {isBuyer ? (
            <>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
                Budget
                <input value={form.budget} onChange={(event) => update('budget', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-300" placeholder="2500000" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
                Area interest
                <input value={form.areaInterest} onChange={(event) => update('areaInterest', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-300" placeholder="Suburb, area, city" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-600 md:col-span-2">
                Property interest
                <input value={form.propertyInterest} onChange={(event) => update('propertyInterest', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-300" placeholder="3-bed home, townhouse, investment unit..." />
              </label>
            </>
          ) : null}
          {isSeller ? (
            <>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
                Seller property address
                <input value={form.sellerPropertyAddress} onChange={(event) => update('sellerPropertyAddress', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-300" placeholder="116 Ridge Road" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
                Estimated value
                <input value={form.estimatedValue} onChange={(event) => update('estimatedValue', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-300" placeholder="3200000" />
              </label>
            </>
          ) : null}
          <label className={`grid gap-1.5 text-sm font-semibold text-slate-600 ${isOther ? '' : 'md:col-span-2'}`}>
            Assigned agent
            <input value={form.assignedAgent} onChange={(event) => update('assignedAgent', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-300" placeholder="Agent name" />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
          Notes
          <textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} className="min-h-24 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-300" placeholder={isOther ? 'Basic context and routing notes' : 'Helpful context'} />
        </label>
      </form>
    </Modal>
  )
}

function RequirementForm({ organisationId, lead, actor, requirement = null, onCancel, onSaved }) {
  const [draft, setDraft] = useState(() => makeRequirementDraft(requirement, lead))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateField(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      const payload = draftToRequirementPayload(draft, lead, organisationId, actor)
      if (requirement?.requirementId) {
        await updateLeadRequirement({ requirementId: requirement.requirementId, updates: payload }, { actor })
      } else {
        await createLeadRequirement(payload, { actor })
      }
      await onSaved()
      onCancel()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save requirement.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input value={draft.title} onChange={(event) => updateField('title', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Title" />
        <select value={draft.intentType} onChange={(event) => updateField('intentType', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          {LEAD_REQUIREMENT_INTENT_TYPES.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
        </select>
        <input value={draft.propertyCategory} onChange={(event) => updateField('propertyCategory', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Property category" />
        <input value={draft.propertyTypes} onChange={(event) => updateField('propertyTypes', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Property types" />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input value={draft.areas} onChange={(event) => updateField('areas', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Areas" />
        <input value={draft.suburbs} onChange={(event) => updateField('suburbs', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Suburbs" />
        <input value={draft.city} onChange={(event) => updateField('city', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="City" />
        <input value={draft.province} onChange={(event) => updateField('province', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Province" />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input value={draft.budgetMin} onChange={(event) => updateField('budgetMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Budget min" />
        <input value={draft.budgetMax} onChange={(event) => updateField('budgetMax', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Budget max" />
        <input value={draft.bedroomsMin} onChange={(event) => updateField('bedroomsMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Bedrooms min" />
        <input value={draft.bathroomsMin} onChange={(event) => updateField('bathroomsMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Bathrooms min" />
        <input value={draft.garagesMin} onChange={(event) => updateField('garagesMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Garages min" />
        <input value={draft.parkingMin} onChange={(event) => updateField('parkingMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Parking min" />
        <input value={draft.erfSizeMin} onChange={(event) => updateField('erfSizeMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Erf size min" />
        <input value={draft.floorSizeMin} onChange={(event) => updateField('floorSizeMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Floor size min" />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <input value={draft.mustHaves} onChange={(event) => updateField('mustHaves', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Must-haves" />
        <input value={draft.niceToHaves} onChange={(event) => updateField('niceToHaves', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Nice-to-haves" />
        <input value={draft.dealBreakers} onChange={(event) => updateField('dealBreakers', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Deal-breakers" />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select value={draft.financeStatus} onChange={(event) => updateField('financeStatus', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          {LEAD_REQUIREMENT_FINANCE_STATUSES.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
        </select>
        <input value={draft.financeType} onChange={(event) => updateField('financeType', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Finance type" />
        <select value={draft.preApproved} onChange={(event) => updateField('preApproved', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Pre-approved unknown</option>
          <option value="true">Pre-approved</option>
          <option value="false">Not pre-approved</option>
        </select>
        <select value={draft.depositAvailable} onChange={(event) => updateField('depositAvailable', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Deposit unknown</option>
          <option value="true">Deposit available</option>
          <option value="false">No deposit captured</option>
        </select>
        <select value={draft.timeline} onChange={(event) => updateField('timeline', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Timeline unknown</option>
          {LEAD_REQUIREMENT_TIMELINES.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={draft.urgency} onChange={(event) => updateField('urgency', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Urgency unknown</option>
          {LEAD_REQUIREMENT_URGENCIES.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <input value={draft.communicationPreference} onChange={(event) => updateField('communicationPreference', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Communication preference" />
        <select value={draft.status} onChange={(event) => updateField('status', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          {LEAD_REQUIREMENT_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
        <textarea value={draft.notes} onChange={(event) => updateField('notes', event.target.value)} className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Notes" />
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.consentToReceiveMatches} onChange={(event) => updateField('consentToReceiveMatches', event.target.checked)} />
          Consent to matches
        </label>
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.isPrimary} onChange={(event) => updateField('isPrimary', event.target.checked)} />
          Primary
        </label>
      </div>

      {error ? <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Cancel</button>
        <button type="submit" disabled={saving} className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? 'Saving...' : 'Save Requirement'}</button>
      </div>
    </form>
  )
}

function MatchReasonList({ reasons = [] }) {
  const visibleReasons = Array.isArray(reasons) ? reasons.slice(0, 5) : []
  if (!visibleReasons.length) return <p className="text-xs text-slate-500">No scoring reasons available.</p>
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {visibleReasons.map((reason, index) => {
        const type = reason?.type || 'match'
        const text = typeof reason === 'string' ? reason : reason?.text
        const tone = type === 'match'
          ? 'bg-emerald-50 text-emerald-700'
          : type === 'missing'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-rose-50 text-rose-700'
        return <span key={`match-reason-${index}`} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{text}</span>
      })}
    </div>
  )
}

function RequirementMatchPanel({ organisationId, lead, requirement, actor, onSaved }) {
  const [loading, setLoading] = useState(true)
  const [matches, setMatches] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadMatches = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const result = await findListingsForRequirement({ organisationId, requirementId: requirement.requirementId })
      setMatches(result.matches || [])
    } catch (loadError) {
      setMatches([])
      setError(loadError?.message || 'Unable to find matches.')
    } finally {
      setLoading(false)
    }
  }, [organisationId, requirement.requirementId])

  useEffect(() => {
    void loadMatches()
  }, [loadMatches])

  function toggleListing(listingId) {
    setSelectedIds((previous) => previous.includes(listingId)
      ? previous.filter((id) => id !== listingId)
      : [...previous, listingId])
  }

  async function addSelected() {
    try {
      setSaving(true)
      setError('')
      const saved = await addMatchesToLead(
        {
          organisationId,
          leadId: lead.leadId,
          requirementId: requirement.requirementId,
          listingIds: selectedIds,
        },
        { actor },
      )
      setMessage(`${saved.length} listing${saved.length === 1 ? '' : 's'} added to Interested Listings.`)
      setSelectedIds([])
      await onSaved()
      await loadMatches()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to add selected matches.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-950">Matching Listings</h4>
          <p className="mt-1 text-sm text-slate-500">Deterministic scoring from existing private listings. Agents choose what gets linked.</p>
        </div>
        <button type="button" onClick={addSelected} disabled={saving || !selectedIds.length} className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
          {saving ? 'Adding...' : `Add Selected (${selectedIds.length})`}
        </button>
      </div>
      {message ? <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading ? <LoadingSkeleton lines={5} className="mt-4 rounded-2xl border border-slate-200 bg-white" /> : null}
      {!loading ? (
        <div className="mt-4 grid gap-3">
          {matches.length ? matches.map((match) => {
            const selected = selectedIds.includes(match.id)
            const hasMissingData = match.matchReasons?.some((reason) => reason?.type === 'missing')
            return (
              <article key={match.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${selected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                <div className="grid gap-4 lg:grid-cols-[auto_120px_1fr_auto] lg:items-start">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={selected} onChange={() => toggleListing(match.id)} />
                    Select
                  </label>
                  <div className="flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-slate-400">
                    {match.imageUrl ? <img src={match.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={22} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h5 className="truncate text-sm font-semibold text-slate-950">{match.title || 'Untitled listing'}</h5>
                      {match.alreadyLinked ? <StatusPill tone="amber">Already linked</StatusPill> : null}
                      {hasMissingData ? <StatusPill tone="amber">Missing data</StatusPill> : null}
                      <StatusPill>{match.status || 'Status unknown'}</StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{[match.address, match.suburb, match.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                    <p className="mt-2 text-sm font-semibold text-blue-700">{formatCurrency(match.price)}</p>
                    <ListingSpecs listing={match} />
                    <MatchReasonList reasons={match.matchReasons} />
                    {match.id ? <Link to={`/agent/listings/${match.id}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">Open listing <ExternalLink size={13} /></Link> : null}
                  </div>
                  <div className="rounded-2xl bg-slate-900 px-4 py-3 text-center text-white">
                    <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-300">Score</span>
                    <strong className="mt-1 block text-2xl font-semibold">{match.matchScore}</strong>
                  </div>
                </div>
              </article>
            )
          }) : <EmptyState title="No listing matches found" copy="Create or activate listings with price, location, and property details before matching this requirement." />}
        </div>
      ) : null}
    </section>
  )
}

function RequirementCard({ requirement, lead, organisationId, actor, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [showMatches, setShowMatches] = useState(false)
  const [working, setWorking] = useState('')
  const summary = buildRequirementSummary(requirement)

  async function runAction(action) {
    try {
      setWorking(action)
      if (action === 'primary') await setPrimaryLeadRequirement({ leadId: lead.leadId, requirementId: requirement.requirementId }, { actor })
      if (action === 'pause') await pauseLeadRequirement({ requirementId: requirement.requirementId }, { actor })
      if (action === 'archive') await archiveLeadRequirement({ requirementId: requirement.requirementId }, { actor })
      if (action === 'activate') await activateLeadRequirement({ requirementId: requirement.requirementId }, { actor })
      await onSaved()
    } finally {
      setWorking('')
    }
  }

  if (editing) {
    return <RequirementForm organisationId={organisationId} lead={lead} actor={actor} requirement={requirement} onCancel={() => setEditing(false)} onSaved={onSaved} />
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">{requirement.title || summary}</h3>
            {requirement.isPrimary ? <StatusPill tone="green">Primary</StatusPill> : null}
            <StatusPill tone={requirement.status === 'active' ? 'blue' : 'slate'}>{requirement.status}</StatusPill>
            <StatusPill>{requirement.intentType}</StatusPill>
          </div>
          <p className="mt-2 text-sm font-semibold text-blue-700">{summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!requirement.isPrimary && requirement.status !== 'archived' ? <button type="button" onClick={() => runAction('primary')} disabled={Boolean(working)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Set Primary</button> : null}
          {requirement.status === 'active' ? <button type="button" onClick={() => runAction('pause')} disabled={Boolean(working)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Pause</button> : <button type="button" onClick={() => runAction('activate')} disabled={Boolean(working)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Activate</button>}
          {requirement.status !== 'archived' ? <button type="button" onClick={() => runAction('archive')} disabled={Boolean(working)} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700">Archive</button> : null}
          {requirement.status === 'active' ? <button type="button" onClick={() => setShowMatches((value) => !value)} className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">Find Matches</button> : null}
          <button type="button" onClick={() => setEditing(true)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Edit</button>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Property Types" value={formatList(requirement.propertyTypes)} />
        <Field label="Areas" value={formatList(requirement.areas)} />
        <Field label="Suburbs" value={formatList(requirement.suburbs)} />
        <Field label="Budget" value={requirement.budgetMin || requirement.budgetMax ? `${requirement.budgetMin ? formatCurrency(requirement.budgetMin) : 'No min'} - ${requirement.budgetMax ? formatCurrency(requirement.budgetMax) : 'No max'}` : '—'} />
        <Field label="Bedrooms Min" value={requirement.bedroomsMin} />
        <Field label="Bathrooms Min" value={requirement.bathroomsMin} />
        <Field label="Must-Haves" value={formatList(requirement.mustHaves)} />
        <Field label="Finance" value={requirement.financeStatus} />
        <Field label="Timeline" value={requirement.timeline} />
        <Field label="Urgency" value={requirement.urgency} />
        <Field label="Consent" value={requirement.consentToReceiveMatches ? 'Yes' : 'No'} />
        <Field label="Updated" value={formatDateTime(requirement.updatedAt)} />
      </dl>
      {requirement.notes ? <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{requirement.notes}</p> : null}
      {showMatches ? (
        <RequirementMatchPanel
          organisationId={organisationId}
          lead={lead}
          requirement={requirement}
          actor={actor}
          onSaved={onSaved}
        />
      ) : null}
    </article>
  )
}

function LeadRequirementsPanel({ organisationId, lead, requirements = [], actor, onSaved, title = 'Requirements', description = 'Structured lead intent for manual matching later. Existing loose lead fields are preserved as fallback context.' }) {
  const [showForm, setShowForm] = useState(false)
  const [creatingFromLegacy, setCreatingFromLegacy] = useState(false)
  const hasLegacy = Boolean(lead.budget || lead.areaInterest || lead.area_interest || lead.propertyInterest || lead.property_interest)

  async function createFromLegacy() {
    try {
      setCreatingFromLegacy(true)
      await createLeadRequirement(buildRequirementFromLeadFallback({ ...lead, organisationId }), { actor })
      await onSaved()
    } finally {
      setCreatingFromLegacy(false)
    }
  }

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
          <Plus size={15} />
          {showForm ? 'Close' : 'Add Requirement'}
        </button>
      </div>

      {showForm ? (
        <div className="mt-5">
          <RequirementForm organisationId={organisationId} lead={lead} actor={actor} onCancel={() => setShowForm(false)} onSaved={onSaved} />
        </div>
      ) : null}

      {!requirements.length && hasLegacy ? (
        <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-amber-950">Legacy lead details</h3>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Budget" value={lead.budget ? formatCurrency(lead.budget) : '—'} />
                <Field label="Area Interest" value={lead.areaInterest || lead.area_interest} />
                <Field label="Property Interest" value={lead.propertyInterest || lead.property_interest} />
              </dl>
            </div>
            <button type="button" onClick={createFromLegacy} disabled={creatingFromLegacy} className="min-h-10 rounded-xl bg-amber-900 px-4 text-sm font-semibold text-white disabled:bg-amber-300">
              {creatingFromLegacy ? 'Creating...' : 'Create structured requirement from existing lead details'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4">
        {requirements.length ? requirements.map((requirement) => (
          <RequirementCard
            key={requirement.requirementId}
            requirement={requirement}
            lead={lead}
            organisationId={organisationId}
            actor={actor}
            onSaved={onSaved}
          />
        )) : <EmptyState title="No structured requirements yet" copy="Capture what this lead is looking for before manual matching is introduced." />}
      </div>
    </section>
  )
}

function ListingSpecs({ listing }) {
  const specs = [
    listing?.bedrooms ? `${listing.bedrooms} bed` : '',
    listing?.bathrooms ? `${listing.bathrooms} bath` : '',
    listing?.garages ? `${listing.garages} garage` : '',
    listing?.coveredParking || listing?.openParking ? `${Number(listing.coveredParking || 0) + Number(listing.openParking || 0)} parking` : '',
  ].filter(Boolean)
  return specs.length ? <p className="mt-1 text-xs text-slate-500">{specs.join(' • ')}</p> : null
}

function InterestStatusActions({ interest, onAction }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onAction('sent', interest)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Mark Sent</button>
      <button type="button" onClick={() => onAction('viewed', interest)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Mark Viewed</button>
      <button type="button" onClick={() => onAction('viewing_scheduled', interest)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Viewing Scheduled</button>
      <button type="button" onClick={() => onAction('dismissed', interest)} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Dismiss</button>
    </div>
  )
}

function AddListingToLeadPanel({
  organisationId,
  lead,
  requirements = [],
  actor,
  onSaved,
  title = 'Add Listing',
  description = 'Search current private listings and link one to this lead.',
  buttonLabel = 'Add Listing',
  source = 'manual',
  status = 'interested',
  isOriginalEnquiry = false,
  isAgentSelected = true,
}) {
  const [open, setOpen] = useState(false)
  const primaryRequirement = requirements.find((requirement) => requirement.isPrimary) || requirements[0] || null
  const [filters, setFilters] = useState({ search: '', status: 'all', minPrice: '', maxPrice: '', requirementId: primaryRequirement?.requirementId || '' })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')

  const searchListings = useCallback(async () => {
    if (!open) return
    try {
      setLoading(true)
      setError('')
      const result = await listSearchablePrivateListings({ organisationId, ...filters })
      setRows(result.slice(0, 30))
    } catch (loadError) {
      setRows([])
      setError(loadError?.message || 'Unable to search listings.')
    } finally {
      setLoading(false)
    }
  }, [filters, open, organisationId])

  useEffect(() => {
    void searchListings()
  }, [searchListings])

  async function addListing(listing) {
    try {
      setSavingId(listing.id)
      setError('')
      await upsertLeadListingInterest(
        {
          organisationId,
          lead,
          contactId: lead.contactId,
          listing,
          requirementId: filters.requirementId,
          source,
          status,
          isOriginalEnquiry,
          isAgentSelected,
          createdBy: actor?.id,
        },
        { actor },
      )
      await onSaved()
      setOpen(false)
    } catch (saveError) {
      setError(saveError?.message || 'Unable to link this listing to the lead.')
    } finally {
      setSavingId('')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
          <Plus size={15} />
          {open ? 'Close' : buttonLabel}
        </button>
      </div>
      {open ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_150px_140px_140px]">
            <input value={filters.search} onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Search address, title, suburb" />
            <select value={filters.status} onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="seller_lead">Seller lead</option>
              <option value="under_offer">Under offer</option>
              <option value="sold">Sold</option>
            </select>
            <input value={filters.minPrice} onChange={(event) => setFilters((previous) => ({ ...previous, minPrice: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Min price" />
            <input value={filters.maxPrice} onChange={(event) => setFilters((previous) => ({ ...previous, maxPrice: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Max price" />
          </div>
          {requirements.length ? (
            <select value={filters.requirementId} onChange={(event) => setFilters((previous) => ({ ...previous, requirementId: event.target.value }))} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="">No requirement link</option>
              {requirements.map((requirement) => <option key={requirement.requirementId} value={requirement.requirementId}>{buildRequirementSummary(requirement)}</option>)}
            </select>
          ) : null}
          {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {loading ? <LoadingSkeleton lines={4} className="rounded-2xl border border-slate-200 bg-white" /> : null}
            {!loading && rows.length ? rows.map((listing) => (
              <article key={listing.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
                    {listing.imageUrl ? <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={20} />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{listing.title}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                    <p className="mt-1 text-sm font-semibold text-blue-700">{formatCurrency(listing.price)}</p>
                    <ListingSpecs listing={listing} />
                  </div>
                </div>
                <button type="button" onClick={() => addListing(listing)} disabled={savingId === listing.id} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">
                  {savingId === listing.id ? 'Adding...' : 'Link'}
                </button>
              </article>
            )) : null}
            {!loading && !rows.length ? <EmptyState title="No listings found" copy="Try a broader address, suburb, price, or status filter." /> : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function SavedSearchesPanel({ organisationId, lead, requirements = [], savedSearches = [], propertyShares = [], actor, onSaved }) {
  const primaryRequirement = requirements.find((requirement) => requirement.isPrimary) || requirements[0] || null
  const [draft, setDraft] = useState(() => makeSavedSearchDraft(null, primaryRequirement))
  const [editingId, setEditingId] = useState('')
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const requirementById = useMemo(() => new Map(requirements.map((requirement) => [requirement.requirementId, requirement])), [requirements])

  useEffect(() => {
    if (!editingId) setDraft(makeSavedSearchDraft(null, primaryRequirement))
  }, [editingId, primaryRequirement])

  function updateDraft(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  async function saveDraft(event) {
    event.preventDefault()
    try {
      setWorkingId(editingId || 'create')
      setError('')
      setMessage('')
      if (editingId) {
        await updateLeadSavedSearch({ savedSearchId: editingId, updates: draft }, { actor })
        setMessage('Saved search updated.')
      } else {
        await createLeadSavedSearch(savedSearchPayloadFromDraft(draft, lead, organisationId), { actor })
        setMessage('Saved search created.')
      }
      setEditingId('')
      await onSaved()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save this saved search.')
    } finally {
      setWorkingId('')
    }
  }

  async function toggleSavedSearch(savedSearch, active) {
    try {
      setWorkingId(savedSearch.savedSearchId)
      setError('')
      if (active) await enableLeadSavedSearch({ savedSearchId: savedSearch.savedSearchId }, { actor })
      else await disableLeadSavedSearch({ savedSearchId: savedSearch.savedSearchId }, { actor })
      await onSaved()
    } catch (toggleError) {
      setError(toggleError?.message || 'Unable to update saved search.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Saved Searches</h2>
          <p className="mt-1 text-sm text-slate-500">Buyer opt-in preferences for ongoing property updates. Agents still approve every send.</p>
        </div>
        <StatusPill tone="blue">{savedSearches.length} saved</StatusPill>
      </div>
      {message ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <form className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4" onSubmit={saveDraft}>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1.2fr_150px]">
          <input value={draft.searchName} onChange={(event) => updateDraft('searchName', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Search name" />
          <select value={draft.requirementId} onChange={(event) => {
            const requirement = requirementById.get(event.target.value)
            setDraft((previous) => ({
              ...previous,
              requirementId: event.target.value,
              searchName: previous.searchName || (requirement ? buildRequirementSummary(requirement) : ''),
              consentGiven: previous.consentGiven || Boolean(requirement?.consentToReceiveMatches),
            }))
          }} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="">No requirement link</option>
            {requirements.map((requirement) => <option key={requirement.requirementId} value={requirement.requirementId}>{buildRequirementSummary(requirement)}</option>)}
          </select>
          <select value={draft.frequency} onChange={(event) => updateDraft('frequency', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="manual_only">Manual only</option>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.active} onChange={(event) => updateDraft('active', event.target.checked)} /> Active</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.consentGiven} onChange={(event) => updateDraft('consentGiven', event.target.checked)} /> Consent recorded</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.emailEnabled} onChange={(event) => updateDraft('emailEnabled', event.target.checked)} /> Email</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.whatsappEnabled} onChange={(event) => updateDraft('whatsappEnabled', event.target.checked)} /> WhatsApp</label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={Boolean(workingId)} className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">{editingId ? 'Update Search' : 'Add Saved Search'}</button>
          {editingId ? <button type="button" onClick={() => { setEditingId(''); setDraft(makeSavedSearchDraft(null, primaryRequirement)) }} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button> : null}
        </div>
      </form>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {savedSearches.length ? savedSearches.map((savedSearch) => {
          const channelLabel = savedSearch.whatsappEnabled ? 'WhatsApp' : 'Email'
          return (
          <article key={savedSearch.savedSearchId} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{savedSearch.searchName}</p>
                <p className="mt-1 text-xs text-slate-500">Frequency: {savedSearch.frequency.replace(/_/g, ' ')} · Channel: {channelLabel} · Consent Status: {savedSearch.consentGiven ? 'Recorded' : 'Missing'}</p>
                <p className="mt-1 text-xs text-slate-500">Last sent {formatDateTime(savedSearch.lastSentAt)}</p>
                {savedSearch.requirementId ? <p className="mt-1 text-xs text-slate-500">Requirement: {buildRequirementSummary(requirementById.get(savedSearch.requirementId))}</p> : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusPill tone={savedSearch.active ? 'green' : 'slate'}>{savedSearch.active ? 'Active' : 'Paused'}</StatusPill>
                <StatusPill tone={savedSearch.consentGiven ? 'green' : 'amber'}>{savedSearch.consentGiven ? 'Consent' : 'No consent'}</StatusPill>
                <StatusPill tone={savedSearch.emailEnabled || savedSearch.whatsappEnabled ? 'blue' : 'red'}>{channelLabel}</StatusPill>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setEditingId(savedSearch.savedSearchId); setDraft(makeSavedSearchDraft(savedSearch, requirementById.get(savedSearch.requirementId))) }} className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">Edit</button>
              <button type="button" onClick={() => toggleSavedSearch(savedSearch, !savedSearch.active)} disabled={workingId === savedSearch.savedSearchId} className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">{savedSearch.active ? 'Pause' : 'Enable'}</button>
            </div>
          </article>
          )
        }) : <EmptyState title="No saved searches yet" copy="Create a saved search when the buyer has opted into property updates." />}
      </div>

      <section className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-950">Sent Properties</h3>
          <StatusPill>{propertyShares.length} sent</StatusPill>
        </div>
        <div className="mt-3 grid gap-3">
          {propertyShares.length ? propertyShares.map((share) => (
            <article key={share.shareId || share.communicationId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{share.subject || 'Property update'}</p>
                  <p className="mt-1 text-xs text-slate-500">{share.listings?.map((listing) => listing.title).filter(Boolean).join(', ') || 'Listing details pending'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill>{share.channel || share.communicationType}</StatusPill>
                  <StatusPill tone={deliveryTone(share.deliveryStatus || share.status)}>{share.deliveryStatus || share.status || 'pending'}</StatusPill>
                  <StatusPill>{formatDateTime(share.sentAt || share.occurredAt)}</StatusPill>
                </div>
              </div>
            </article>
          )) : <EmptyState title="No properties sent yet" copy="Agent-approved property shares will appear here and in the communication timeline." />}
        </div>
      </section>
    </section>
  )
}

function PropertyShareDialog({ draft, organisationId = '', lead, requirements = [], savedSearches = [], actor, onClose, onSaved }) {
  const [channel, setChannel] = useState(draft?.channel || 'email')
  const [templateType, setTemplateType] = useState('property_match')
  const [note, setNote] = useState('')
  const [savedSearchId, setSavedSearchId] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const templates = useMemo(() => listLeadCommunicationTemplates(), [])
  const listing = draft?.listing || null
  const requirement = useMemo(() => {
    const id = draft?.requirementId || draft?.suggestion?.requirementId || ''
    return requirements.find((item) => item.requirementId === id) || requirements.find((item) => item.isPrimary) || requirements[0] || null
  }, [draft, requirements])
  const savedSearch = useMemo(() => savedSearches.find((item) => item.savedSearchId === savedSearchId) || savedSearches.find((item) => item.requirementId && item.requirementId === requirement?.requirementId) || null, [requirement?.requirementId, savedSearchId, savedSearches])
  const preview = useMemo(() => previewPropertyMessage({
    lead,
    listing,
    requirement,
    savedSearch,
    channel,
    templateType,
    note,
  }), [channel, lead, listing, note, requirement, savedSearch, templateType])

  if (!draft || !listing) return null

  async function sendShare() {
    try {
      setWorking(true)
      setError('')
      setMessage('')
      const result = await sendListingToLead({
        organisationId: organisationId || lead.organisationId || lead.organisation_id,
        lead,
        leadId: lead.leadId,
        contactId: lead.contactId,
        listing,
        requirement,
        requirementId: requirement?.requirementId,
        savedSearch,
        savedSearchId: savedSearch?.savedSearchId,
        interestId: draft.interestId,
        suggestionId: draft.suggestionId,
        recommendationId: draft.recommendationId,
        channel,
        templateType,
        note,
      }, { actor })
      if (!result.ok) {
        setError(result.warning || 'Unable to send this property update.')
        return
      }
      if (draft.recommendationId) await completeRecommendation({ recommendationId: draft.recommendationId }, { actor }).catch(() => null)
      setMessage(result.status === 'sent' ? 'Property update sent and logged.' : 'Property update prepared and logged as pending.')
      await onSaved()
    } catch (sendError) {
      setError(sendError?.message || 'Unable to send this property update.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section className="max-h-[calc(100dvh-32px)] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Send To Buyer</h2>
            <p className="mt-1 text-sm text-slate-500">Preview the property update before Bridge sends or prepares the outbound payload.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">Close</button>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">{listing.title || 'Listing details unavailable'}</p>
          <p className="mt-1 text-sm text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'} · {formatCurrency(listing.price)}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold text-slate-600">
            Channel
            <select value={channel} onChange={(event) => setChannel(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-600">
            Template
            <select value={templateType} onChange={(event) => setTemplateType(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              {templates.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-600 sm:col-span-2">
            Saved Search
            <select value={savedSearchId} onChange={(event) => setSavedSearchId(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="">Use requirement consent</option>
              {savedSearches.map((item) => <option key={item.savedSearchId} value={item.savedSearchId}>{item.searchName}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-600 sm:col-span-2">
            Optional note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Add a short agent note." />
          </label>
        </div>
        {!preview.consent.ok ? <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">{preview.consent.warning}</p> : null}
        {!preview.recipient ? <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">No {channel === 'whatsapp' ? 'phone number' : 'email address'} is available for this lead.</p> : null}
        {message ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Message Preview</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{preview.subject}</p>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{preview.message}</pre>
        </section>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button>
          <button type="button" onClick={sendShare} disabled={working || !preview.consent.ok || !preview.recipient} className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
            {working ? 'Sending...' : 'Send'}
          </button>
        </div>
      </section>
    </div>
  )
}

function LeadListingInterestsPanel({ organisationId, lead, interests = [], requirements = [], actor, onSaved, onShare, title = 'Interested Listings', description = 'Canonical lead-to-listing relationships. No matching or transaction creation happens here.' }) {
  const [noteDrafts, setNoteDrafts] = useState({})
  const [scheduleDrafts, setScheduleDrafts] = useState({})
  const [workingId, setWorkingId] = useState('')
  const [error, setError] = useState('')
  const requirementById = useMemo(() => new Map(requirements.map((requirement) => [requirement.requirementId, requirement])), [requirements])
  const originalInterests = useMemo(() => interests.filter((interest) => interest.isOriginalEnquiry), [interests])

  async function handleAction(action, interest) {
    try {
      setWorkingId(interest.interestId)
      setError('')
      if (action === 'sent') await markLeadListingInterestSent({ interestId: interest.interestId }, { actor })
      else if (action === 'viewed') await markLeadListingInterestViewed({ interestId: interest.interestId }, { actor })
      else if (action === 'dismissed') await dismissLeadListingInterest({ interestId: interest.interestId, reason: noteDrafts[interest.interestId] || 'Dismissed by agent.' }, { actor })
      else await updateLeadListingInterestStatus({ interestId: interest.interestId, status: action }, { actor })
      await onSaved()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update listing interest.')
    } finally {
      setWorkingId('')
    }
  }

  async function saveNote(interest) {
    try {
      setWorkingId(interest.interestId)
      setError('')
      await updateLeadListingInterestNotes({ interestId: interest.interestId, notes: noteDrafts[interest.interestId] ?? interest.notes ?? '' }, { actor })
      await onSaved()
    } catch (noteError) {
      setError(noteError?.message || 'Unable to save note.')
    } finally {
      setWorkingId('')
    }
  }

  async function scheduleViewing(interest) {
    const draft = scheduleDrafts[interest.interestId] || {}
    if (!draft.date || !draft.time) {
      setError('Choose a viewing date and time first.')
      return
    }
    try {
      setWorkingId(interest.interestId)
      setError('')
      await scheduleViewingFromLeadListingInterest({
        organisationId,
        interest,
        date: draft.date,
        time: draft.time,
        notes: draft.notes || interest.notes || '',
        actor,
      })
      await onSaved()
    } catch (scheduleError) {
      setError(scheduleError?.message || 'Unable to schedule viewing.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <StatusPill>{interests.length} linked</StatusPill>
      </div>
      <div className="mt-5">
        <AddListingToLeadPanel organisationId={organisationId} lead={lead} requirements={requirements} actor={actor} onSaved={onSaved} />
      </div>
      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {originalInterests.length ? (
        <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Original Enquiry Listing</h3>
              <p className="mt-1 text-sm text-slate-500">Listings the lead enquired about before any manual matching.</p>
            </div>
            <StatusPill tone="blue">{originalInterests.length} original</StatusPill>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {originalInterests.map((interest) => {
              const listing = interest.listing || {}
              return (
                <article key={`original-${interest.interestId}`} className="rounded-2xl border border-blue-100 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{listing.title || 'Listing details unavailable'}</p>
                      <p className="mt-1 text-xs text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                      <p className="mt-1 text-xs font-semibold text-blue-700">{interest.source}</p>
                    </div>
                    <StatusPill tone="blue">Original Enquiry</StatusPill>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}
      <div className="mt-5 grid gap-4">
        {interests.length ? interests.map((interest) => {
          const listing = interest.listing || {}
          const draft = scheduleDrafts[interest.interestId] || {}
          const requirement = requirementById.get(interest.requirementId) || null
          return (
            <article key={interest.interestId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
                <div className="flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-slate-400">
                  {listing.imageUrl ? <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={24} />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-950">{listing.title || 'Listing details unavailable'}</h3>
                      <p className="mt-1 text-sm text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                      <p className="mt-2 text-sm font-semibold text-blue-700">{formatCurrency(listing.price)}</p>
                      <ListingSpecs listing={listing} />
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <StatusPill tone={getStageTone(interest.status)}>{interest.status.replace(/_/g, ' ')}</StatusPill>
                      <StatusPill>{interest.source}</StatusPill>
                      {interest.isOriginalEnquiry ? <StatusPill tone="blue">Original enquiry</StatusPill> : null}
                      {interest.isAgentSelected ? <StatusPill tone="blue">Agent selected</StatusPill> : null}
                      {requirement ? <StatusPill tone="blue">Requirement linked</StatusPill> : null}
                      {interest.matchScore !== null && interest.matchScore !== undefined ? <StatusPill tone="green">{interest.matchScore}% match</StatusPill> : null}
                    </div>
                  </div>
                  {requirement ? <p className="mt-2 text-xs font-semibold text-slate-500">Requirement: {buildRequirementSummary(requirement)}</p> : null}
                  {interest.matchReasons?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {interest.matchReasons.map((reason, index) => (
                        <span key={`${interest.interestId}-reason-${index}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{typeof reason === 'string' ? reason : reason?.text || JSON.stringify(reason)}</span>
                      ))}
                    </div>
                  ) : null}
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Created" value={formatDate(interest.createdAt)} />
                    <Field label="Updated" value={formatDateTime(interest.updatedAt)} />
                    <Field label="Sent" value={formatDateTime(interest.sentAt)} />
                    <Field label="Viewed" value={formatDateTime(interest.viewedAt)} />
                  </dl>
                  <div className="mt-4">
                    <InterestStatusActions interest={interest} onAction={handleAction} />
                  </div>
                  <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto]">
                    <input
                      value={noteDrafts[interest.interestId] ?? interest.notes ?? ''}
                      onChange={(event) => setNoteDrafts((previous) => ({ ...previous, [interest.interestId]: event.target.value }))}
                      className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300"
                      placeholder="Add note"
                    />
                    <button type="button" onClick={() => saveNote(interest)} disabled={workingId === interest.interestId} className="rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Save Note</button>
                  </div>
                  <div className="mt-3 grid gap-2 lg:grid-cols-[150px_130px_1fr_auto]">
                    <input type="date" value={draft.date || ''} onChange={(event) => setScheduleDrafts((previous) => ({ ...previous, [interest.interestId]: { ...draft, date: event.target.value } }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" />
                    <input type="time" value={draft.time || ''} onChange={(event) => setScheduleDrafts((previous) => ({ ...previous, [interest.interestId]: { ...draft, time: event.target.value } }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" />
                    <input value={draft.notes || ''} onChange={(event) => setScheduleDrafts((previous) => ({ ...previous, [interest.interestId]: { ...draft, notes: event.target.value } }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Viewing notes" />
                    <button type="button" onClick={() => scheduleViewing(interest)} disabled={workingId === interest.interestId} className="rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Schedule</button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => onShare?.({ listing, requirementId: interest.requirementId, interestId: interest.interestId })} className="inline-flex min-h-10 items-center rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700">
                      Send To Buyer
                    </button>
                    {listing.id ? <Link to={`/agent/listings/${listing.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700">Open listing <ExternalLink size={13} /></Link> : null}
                    {interest.offers?.length ? <span className="text-sm font-semibold text-slate-600">{interest.offers.length} existing offer{interest.offers.length === 1 ? '' : 's'} linked</span> : <span className="text-sm text-slate-500">No existing offer linked</span>}
                  </div>
                </div>
              </div>
            </article>
          )
        }) : <EmptyState title="No interested listings yet" copy="Use Add Listing to create the first canonical lead-listing relationship." />}
      </div>
    </section>
  )
}

function SuggestionReasonList({ reasons = [] }) {
  const visibleReasons = Array.isArray(reasons) ? reasons.slice(0, 5) : []
  if (!visibleReasons.length) return <p className="text-xs text-slate-500">No suggestion reasons stored.</p>
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {visibleReasons.map((reason, index) => {
        const text = typeof reason === 'string' ? reason : reason?.text || JSON.stringify(reason)
        const type = typeof reason === 'string' ? 'match' : reason?.type || 'match'
        const tone = type === 'match'
          ? 'bg-emerald-50 text-emerald-700'
          : type === 'missing'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-rose-50 text-rose-700'
        return <span key={`suggestion-reason-${index}`} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{text}</span>
      })}
    </div>
  )
}

function LeadSuggestionsPanel({ organisationId, lead, suggestions = [], actor, onSaved, onShare, title = 'Suggestions', description = 'Automated listing recommendations. Agents must accept before a relationship becomes an interested listing.' }) {
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const pendingSuggestions = suggestions.filter((suggestion) => suggestion.status === 'pending')

  async function runAction(action, suggestion) {
    try {
      setWorkingId(suggestion.suggestionId)
      setError('')
      setMessage('')
      if (action === 'accept') {
        await acceptSuggestion({ suggestionId: suggestion.suggestionId }, { actor })
        setMessage('Suggestion accepted and added to Interested Listings.')
      } else {
        await rejectSuggestion({ suggestionId: suggestion.suggestionId, reason: 'Rejected by agent from Lead Workspace.' }, { actor })
        setMessage('Suggestion rejected.')
      }
      await onSaved()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update suggestion.')
    } finally {
      setWorkingId('')
    }
  }

  async function regenerate() {
    try {
      setWorkingId('generate')
      setError('')
      setMessage('')
      const generated = await generateSuggestionsForLead({ organisationId, leadId: lead.leadId, force: true })
      setMessage(`${generated.length} suggestion${generated.length === 1 ? '' : 's'} generated.`)
      await onSaved()
    } catch (generationError) {
      setError(generationError?.message || 'Unable to generate suggestions.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="blue">{pendingSuggestions.length} pending</StatusPill>
          <button type="button" onClick={regenerate} disabled={workingId === 'generate'} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
            {workingId === 'generate' ? 'Generating...' : 'Regenerate'}
          </button>
        </div>
      </div>
      {message ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-5 grid gap-4">
        {suggestions.length ? suggestions.map((suggestion) => {
          const listing = suggestion.listing || {}
          const isPending = suggestion.status === 'pending'
          return (
            <article key={suggestion.suggestionId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[120px_1fr_auto]">
                <div className="flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-slate-400">
                  {listing.imageUrl ? <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={22} />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-slate-950">{listing.title || 'Listing details unavailable'}</h3>
                    <StatusPill tone={suggestion.status === 'accepted' ? 'green' : suggestion.status === 'rejected' ? 'red' : 'blue'}>{suggestion.status}</StatusPill>
                    <StatusPill tone="green">{suggestion.score ?? 0}% score</StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                  <p className="mt-2 text-sm font-semibold text-blue-700">{formatCurrency(listing.price)}</p>
                  <ListingSpecs listing={listing} />
                  <p className="mt-2 text-xs font-semibold text-slate-500">Requirement: {suggestion.requirementSummary || 'Requirement summary unavailable'}</p>
                  <SuggestionReasonList reasons={suggestion.reasons} />
                  <p className="mt-3 text-xs font-semibold text-slate-500">Generated {formatDateTime(suggestion.generatedAt)}</p>
                </div>
                <div className="flex flex-col gap-2 lg:items-end">
                  {listing.id ? <Link to={`/agent/listings/${listing.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">Open Listing <ExternalLink size={13} /></Link> : null}
                  {isPending ? (
                    <>
                      <button type="button" onClick={() => runAction('accept', suggestion)} disabled={workingId === suggestion.suggestionId} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Accept</button>
                      <button type="button" onClick={() => runAction('reject', suggestion)} disabled={workingId === suggestion.suggestionId} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 px-3 text-sm font-semibold text-rose-700 disabled:opacity-60">Reject</button>
                    </>
                  ) : null}
                  {listing.id ? (
                    <button type="button" onClick={() => onShare?.({ listing, requirementId: suggestion.requirementId, suggestionId: suggestion.suggestionId })} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700">
                      Send To Buyer
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        }) : (
          <EmptyState title="No suggestions yet" copy="Suggestions are generated automatically when requirements or listings are created or updated. You can regenerate them manually here." />
        )}
      </div>
    </section>
  )
}

function getOriginalEnquiryInterests(interests = []) {
  return (Array.isArray(interests) ? interests : []).filter((interest) => interest.isOriginalEnquiry)
}

function getFallbackLeadListing(lead = {}) {
  const listingId = normalizeText(lead.listingId || lead.listing_id || lead.privateListingId || lead.private_listing_id)
  if (!listingId) return null
  const listing = (Array.isArray(lead.listings) ? lead.listings : []).find((item) => {
    const id = normalizeText(item?.id || item?.listingId || item?.listing_id)
    return id === listingId
  })
  return listing || { id: listingId, title: 'Listing attached to lead', source: lead.source }
}

function PropertyMatchWorkflowPanel({ lead, interests = [], requirements = [], suggestions = [] }) {
  const originalInterests = getOriginalEnquiryInterests(interests)
  const fallbackListing = getFallbackLeadListing(lead)
  const hasEnquiryProperty = Boolean(originalInterests.length || fallbackListing)
  const pendingSuggestions = suggestions.filter((suggestion) => suggestion.status === 'pending')
  const steps = [
    {
      label: 'Enquiry Property',
      value: hasEnquiryProperty ? `${originalInterests.length || 1} linked` : 'None linked',
      copy: hasEnquiryProperty ? 'Start with the property the buyer actually asked about.' : 'This lead is requirement-led unless an enquiry listing is linked.',
    },
    {
      label: 'Search Brief',
      value: requirements.length ? `${requirements.length} structured` : 'Lead details only',
      copy: requirements.length ? 'Use the structured brief for matching and saved searches.' : 'Create a structured brief from the lead details before broad matching.',
    },
    {
      label: 'Smart Suggestions',
      value: `${pendingSuggestions.length} pending`,
      copy: 'Review alternatives, accept the good ones, then send or schedule viewings.',
    },
  ]

  return (
    <section className={`${panelClass} card property-match-flow`}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Property Match Flow</h2>
          <p className="mt-1 text-sm text-slate-500">Work from the original enquiry first, then use the buyer brief to suggest alternatives.</p>
        </div>
        <StatusPill tone={hasEnquiryProperty ? 'blue' : 'amber'}>{hasEnquiryProperty ? 'Property-led' : 'Requirement-led'}</StatusPill>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Step {index + 1}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950">{step.label}</h3>
              <StatusPill tone={index === 0 && !hasEnquiryProperty ? 'amber' : 'blue'}>{step.value}</StatusPill>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">{step.copy}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function EnquiryPropertyPanel({ organisationId, lead, interests = [], requirements = [], actor, onSaved, onShare }) {
  const originalInterests = getOriginalEnquiryInterests(interests)
  const fallbackListing = getFallbackLeadListing(lead)
  const hasEnquiryProperty = Boolean(originalInterests.length || fallbackListing)

  return (
    <section className={`${panelClass} card`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Enquiry Property</h2>
          <p className="mt-1 text-sm text-slate-500">The listing that brought this buyer in. Link it here before reviewing alternatives.</p>
        </div>
        <StatusPill tone={hasEnquiryProperty ? 'blue' : 'amber'}>{hasEnquiryProperty ? 'Linked' : 'No property'}</StatusPill>
      </div>

      <div className="mt-5">
        <AddListingToLeadPanel
          organisationId={organisationId}
          lead={lead}
          requirements={requirements}
          actor={actor}
          onSaved={onSaved}
          title="Link Enquired Listing"
          description="If this lead came from Property24, Private Property, WhatsApp, or a website listing, attach that exact property here."
          buttonLabel="Add Enquired Listing"
          source="enquiry"
          status="interested"
          isOriginalEnquiry
          isAgentSelected={false}
        />
      </div>

      <div className="mt-5 grid gap-3">
        {originalInterests.length ? originalInterests.map((interest) => {
          const listing = interest.listing || {}
          return (
            <article key={interest.interestId} className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="grid gap-4 lg:grid-cols-[150px_1fr_auto]">
                <div className="flex h-32 items-center justify-center overflow-hidden rounded-2xl bg-white text-slate-400">
                  {listing.imageUrl ? <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={24} />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-slate-950">{listing.title || 'Listing details unavailable'}</h3>
                    <StatusPill tone="blue">Original enquiry</StatusPill>
                    <StatusPill>{interest.source || lead.source || 'Unknown source'}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                  <p className="mt-2 text-sm font-semibold text-blue-700">{formatCurrency(listing.price)}</p>
                  <ListingSpecs listing={listing} />
                  <p className="mt-3 text-sm text-slate-600">Use this as the anchor property, then compare alternatives in Smart Suggestions below.</p>
                </div>
                <div className="flex flex-col gap-2 lg:items-end">
                  {listing.id ? <Link to={`/agent/listings/${listing.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">Open Listing <ExternalLink size={13} /></Link> : null}
                  {listing.id ? (
                    <button type="button" onClick={() => onShare?.({ listing, requirementId: interest.requirementId, interestId: interest.interestId })} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-100 bg-white px-3 text-sm font-semibold text-blue-700">
                      Send To Buyer
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        }) : fallbackListing ? (
          <article className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">{fallbackListing.title || 'Listing attached to lead'}</h3>
                <p className="mt-1 text-sm text-slate-500">A listing id exists on the lead, but it has not been turned into an enquiry relationship yet.</p>
              </div>
              <StatusPill tone="amber">Needs linking</StatusPill>
            </div>
          </article>
        ) : (
          <EmptyState
            title="No enquiry property linked"
            copy="That is fine for a pure buyer-registration lead. Build the Search Brief, then generate Smart Suggestions from the buyer criteria."
          />
        )}
      </div>
    </section>
  )
}

function AgentLeadList() {
  const workspaceContext = useWorkspace()
  const navigate = useNavigate()
  const organisationId = getOrganisationId(workspaceContext)
  const actor = useMemo(() => getActor({
    ...(workspaceContext.profile || {}),
    ...(workspaceContext.currentMembership || {}),
    workspaceRole: workspaceContext.currentMembership?.workspace_role || workspaceContext.currentMembership?.organisation_role || workspaceContext.currentMembership?.role || workspaceContext.profile?.role,
  }), [workspaceContext.currentMembership, workspaceContext.profile])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [assignmentMetrics, setAssignmentMetrics] = useState({ unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })
  const [filters, setFilters] = useState({ search: '', category: 'buyer', stage: 'all', source: 'all', agent: 'all', dateAdded: '' })
  const [createCategory, setCreateCategory] = useState('')
  const [createForm, setCreateForm] = useState(EMPTY_LEAD_CREATE_FORM)
  const [creatingLead, setCreatingLead] = useState(false)
  const [createError, setCreateError] = useState('')

  const loadRows = useCallback(async () => {
    if (!organisationId) {
      setRows([])
      setAssignmentMetrics({ unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })
      setLoading(false)
      setError('Select an agency workspace before loading leads.')
      return
    }
    try {
      setLoading(true)
      setError('')
      const result = await listAgentLeadWorkspaceRows({ organisationId, actor })
      setRows(result.rows)
      setAssignmentMetrics(result.assignmentMetrics || { unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })
    } catch (loadError) {
      setRows([])
      setAssignmentMetrics({ unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })
      setError(loadError?.message || 'Unable to load leads right now.')
    } finally {
      setLoading(false)
    }
  }, [actor, organisationId])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const options = useMemo(() => getLeadFilterOptions(rows), [rows])
  const visibleRows = useMemo(() => {
    const filtered = filterAgentLeadRows(rows, filters)
    if (filters.category === 'archived') return filtered.filter(isArchivedLead)
    const activeRows = filtered.filter((row) => !isArchivedLead(row))
    if (!filters.category || filters.category === 'all') return activeRows
    return activeRows.filter((row) => normalizeLeadCategory(row) === filters.category)
  }, [rows, filters])
  const leadTableColumns = useMemo(() => getLeadTableColumns(filters.category === 'seller' ? 'seller' : 'buyer'), [filters.category])

  function openCreateLead(category = 'buyer') {
    const normalizedCategory = normalizeCanonicalLeadCategory(category, 'other')
    setCreateCategory(normalizedCategory)
    setCreateError('')
    setCreateForm({
      ...EMPTY_LEAD_CREATE_FORM,
      source: normalizedCategory === 'seller' ? 'Canvassing' : 'Manual Entry',
      assignedAgent: actor.name || '',
    })
  }

  function closeCreateLead() {
    if (creatingLead) return
    setCreateCategory('')
    setCreateError('')
    setCreateForm(EMPTY_LEAD_CREATE_FORM)
  }

  async function submitCreateLead(event) {
    event.preventDefault()
    if (!organisationId) {
      setCreateError('Select an agency workspace before creating a lead.')
      return
    }
    if (!normalizeText(createForm.name)) {
      setCreateError('Add a name before creating this lead.')
      return
    }
    if (createForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(createForm.email))) {
      setCreateError('Add a valid email address or leave it blank.')
      return
    }

    const category = normalizeCanonicalLeadCategory(createCategory, 'other')
    const nameParts = splitName(createForm.name)
    const assignedAgentName = normalizeText(createForm.assignedAgent)
    const assignedAgent = {
      id: actor.id,
      userId: actor.userId || actor.id,
      name: assignedAgentName || actor.name,
      fullName: assignedAgentName || actor.fullName || actor.name,
      email: actor.email,
    }
    const sellerStage = 'Contacted'

    try {
      setCreatingLead(true)
      setCreateError('')
      const createdLead = await createAgencyCrmLeadRecord(
        organisationId,
        {
          assignedAgent,
          assignedUserId: normalizeText(actor.userId || actor.id),
          createdBy: normalizeText(actor.userId || actor.id),
          contact: {
            firstName: nameParts.firstName || 'Lead',
            lastName: nameParts.lastName,
            phone: normalizeText(createForm.phone),
            email: normalizeText(createForm.email).toLowerCase(),
            contactType: category,
            notes: normalizeText(createForm.notes),
          },
          lead: {
            leadCategory: category,
            leadDirection: 'Inbound',
            leadSource: normalizeLeadSourceOption(createForm.source),
            stage: category === 'seller' ? sellerStage : 'New Lead',
            status: category === 'seller' ? sellerStage : 'New Lead',
            priority: 'Medium',
            budget: category === 'buyer' ? Number(createForm.budget || 0) || 0 : 0,
            areaInterest: category === 'buyer' ? normalizeText(createForm.areaInterest) : '',
            propertyInterest: category === 'buyer' ? normalizeText(createForm.propertyInterest) : '',
            sellerPropertyAddress: category === 'seller' ? normalizeText(createForm.sellerPropertyAddress) : '',
            estimatedValue: category === 'seller' ? Number(createForm.estimatedValue || 0) || 0 : 0,
            notes: normalizeText(createForm.notes),
          },
        },
        { actor },
      )
      await loadRows()
      setCreateCategory('')
      setCreateError('')
      setCreateForm(EMPTY_LEAD_CREATE_FORM)
      if (createdLead?.leadId) navigate(`/pipeline/leads/${createdLead.leadId}`)
    } catch (createLeadError) {
      setCreateError(createLeadError?.message || 'Unable to create this lead right now.')
    } finally {
      setCreatingLead(false)
    }
  }

  return (
    <main className={leadListShell}>
      <header className="flex flex-col gap-3">
        <h1 className="sr-only">Leads</h1>
        <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <CreateLeadDropdown
            activeCategory={filters.category}
            onCreate={openCreateLead}
            onImport={() => navigate('/pipeline/enquiries')}
            className="w-full"
            buttonClassName="w-full"
          />
          <button type="button" onClick={() => navigate('/pipeline/enquiries')} className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            Import
          </button>
          <button type="button" onClick={loadRows} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </header>

      <section className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        <CompactMetric label="Unassigned" value={assignmentMetrics.unassigned || 0} icon={UserRound} />
        <CompactMetric label="Assigned" value={assignmentMetrics.assigned || 0} icon={Tag} />
        <CompactMetric label="Overdue" value={assignmentMetrics.overdue || 0} icon={Clock3} />
        <CompactMetric label="Escalated" value={assignmentMetrics.escalated || 0} icon={CheckCircle2} />
      </section>

      <section className={`${panelClass} p-4`}>
        <div className="grid gap-3">
          <LeadTypeTabs activeCategory={filters.category} rows={rows} onChange={setFilters} />
        </div>
        <div className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(130px,1fr))]">
          <label className="relative block md:col-span-2 lg:col-span-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300"
              placeholder="Search by name, phone, email..."
            />
          </label>
          <select value={filters.stage} onChange={(event) => setFilters((previous) => ({ ...previous, stage: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            <option value="all">All stages</option>
            {options.stages.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={filters.source} onChange={(event) => setFilters((previous) => ({ ...previous, source: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            <option value="all">All sources</option>
            {options.sources.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={filters.agent} onChange={(event) => setFilters((previous) => ({ ...previous, agent: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            <option value="all">All agents</option>
            {options.agents.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <input type="date" value={filters.dateAdded} onChange={(event) => setFilters((previous) => ({ ...previous, dateAdded: event.target.value }))} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700" aria-label="Date added" />
        </div>
      </section>

      {loading ? <LoadingSkeleton lines={10} className={panelClass} /> : null}
      {error && !loading ? <EmptyState title="Leads could not be loaded" copy={error} /> : null}
      {!loading && !error ? (
        <section className={`${panelClass} relative overflow-hidden`}>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-400">
                <tr>
                  {leadTableColumns.map((column) => (
                    <th key={column.key} className="px-4 py-2.5 font-semibold">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => {
                  const activeCategory = filters.category === 'seller' ? 'seller' : 'buyer'
                  const latestDate = getLatestActivityDate(row.latestActivity)
                  const openRow = () => navigate(`/pipeline/leads/${row.leadId}`)
                  const buyerProperty = getBuyerPropertyEnquiry(row)
                  const sellerAddress = getSellerAddress(row)
                  return (
                    <tr key={row.leadId} className="align-middle hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <LeadIdentityBlock row={row} onOpen={openRow} />
                      </td>
                      {activeCategory === 'seller' ? null : (
                        <>
                          <td className="px-4 py-3"><StatusPill tone="blue" className="h-6">{getLeadTableTypeLabel(filters.category)}</StatusPill></td>
                          <td className="px-4 py-3"><LeadSourcePill source={row.source} /></td>
                        </>
                      )}
                      {activeCategory === 'seller' ? (
                        <>
                          <td className="px-4 py-3"><LeadSourcePill source={row.source} /></td>
                          <td className="px-4 py-3">
                            <p className="truncate text-sm font-semibold text-slate-900">{sellerAddress.first}</p>
                            <p className="mt-1 text-xs text-slate-500">{sellerAddress.second}</p>
                          </td>
                        </>
                      ) : (
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">{buyerProperty.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{buyerProperty.address}</p>
                          <p className="mt-1 text-xs text-slate-500">{buyerProperty.price !== '—' ? buyerProperty.price : null}</p>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <StatusPill tone={getStageTone(row.stage)}>{row.stage}</StatusPill>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block truncate text-sm font-semibold text-slate-900">{getOwnerName(row)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block truncate text-sm font-semibold text-slate-800">{getLatestActivityTitle(row)}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{formatRelativeTime(latestDate, 'No activity yet')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <RowActionMenu row={row} onOpen={openRow} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 lg:hidden">
            {visibleRows.map((row) => {
              const activeCategory = filters.category === 'seller' ? 'seller' : 'buyer'
              const latestDate = getLatestActivityDate(row.latestActivity)
              const sellerAddress = getSellerAddress(row)
              const buyerProperty = getBuyerPropertyEnquiry(row)
              const openRow = () => navigate(`/pipeline/leads/${row.leadId}`)
              return (
                <article key={`card-${row.leadId}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <LeadIdentityBlock row={row} onOpen={openRow} />
                    <StatusPill tone={getStageTone(row.stage)}>{row.stage}</StatusPill>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-100 p-2.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Type</p>
                      <p className="mt-1">
                        {activeCategory === 'seller' ? 'Seller' : getLeadTableTypeLabel(filters.category)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Source</p>
                      <p className="mt-1">
                        <LeadSourcePill source={row.source} />
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Address</p>
                      {activeCategory === 'seller' ? (
                        <>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{sellerAddress.first}</p>
                          <p className="text-xs text-slate-500">{sellerAddress.second}</p>
                        </>
                      ) : (
                        <>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{buyerProperty.title}</p>
                          <p className="text-xs text-slate-500">{buyerProperty.address}</p>
                          <p className="text-xs text-slate-500">{buyerProperty.price !== '—' ? buyerProperty.price : null}</p>
                        </>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Owner</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{getOwnerName(row)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Latest Activity</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{getLatestActivityTitle(row)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatRelativeTime(latestDate, 'No activity yet')}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <RowActionMenu row={row} onOpen={openRow} />
                  </div>
                </article>
              )
            })}
          </div>
          {!visibleRows.length ? (
            <div className="p-5">
                <EmptyLeadResults
                  onCreate={openCreateLead}
                  onImport={() => navigate('/pipeline/enquiries')}
                  onAdjustFilters={() => setFilters({ search: '', category: filters.category || 'buyer', stage: 'all', source: 'all', agent: 'all', dateAdded: '' })}
                />
              </div>
            ) : null}
        </section>
      ) : null}
      <LeadCreateModal
        open={Boolean(createCategory)}
        category={createCategory}
        form={createForm}
        setForm={setCreateForm}
        saving={creatingLead}
        error={createError}
        onClose={closeCreateLead}
        onSubmit={submitCreateLead}
      />
    </main>
  )
}

function TaskForm({ organisationId, leadId, actor, onSaved }) {
  const [draft, setDraft] = useState({ title: '', dueDate: '' })
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!normalizeText(draft.title)) return
    try {
      setSaving(true)
      await createAgencyCrmLeadTask(organisationId, leadId, { title: draft.title, dueDate: draft.dueDate || null, status: 'Pending', priority: 'Medium' }, { actor })
      setDraft({ title: '', dueDate: '' })
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-[1fr_170px_auto]">
      <input value={draft.title} onChange={(event) => setDraft((previous) => ({ ...previous, title: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300" placeholder="New follow-up task" />
      <input type="date" value={draft.dueDate} onChange={(event) => setDraft((previous) => ({ ...previous, dueDate: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300" />
      <button type="submit" disabled={saving || !normalizeText(draft.title)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
        <Plus size={15} />
        Add Task
      </button>
    </form>
  )
}

function TimelineList({ items = [] }) {
  if (!items.length) return <EmptyState title="No activity yet" copy="Calls, notes, WhatsApps, emails, and system lead events will appear here when they are logged." />
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.activityId || item.activity_id || `${item.activityType}-${item.activityDate}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <strong className="text-sm text-slate-950">{item.activityType || item.activity_type || 'Activity'}</strong>
            <span className="text-xs font-semibold text-slate-500">{formatDateTime(item.activityDate || item.activity_date || item.createdAt || item.created_at)}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.activityNote || item.activity_note || item.outcome || 'No note captured.'}</p>
        </article>
      ))}
    </div>
  )
}

function CommunicationQuickLogForm({ organisationId, lead, actor, onSaved }) {
  const [type, setType] = useState('call')
  const [draft, setDraft] = useState({
    direction: 'outbound',
    subject: '',
    summary: '',
    message: '',
    durationMinutes: '',
    outcome: '',
    followUpRequired: false,
    nextAction: '',
    occurredAt: '',
    hasAttachments: false,
    isPrivate: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft((previous) => ({
      ...previous,
      direction: type === 'note' ? 'internal' : type === 'system' ? 'system' : previous.direction === 'internal' ? 'outbound' : previous.direction,
      subject: type === 'call' || type === 'whatsapp' || type === 'note' ? '' : previous.subject,
    }))
  }, [type])

  function update(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (!normalizeText(draft.summary) && !normalizeText(draft.message) && !normalizeText(draft.subject)) return
    const payload = {
      organisationId,
      leadId: lead.leadId,
      contactId: lead.contactId,
      agentId: actor?.id,
      direction: draft.direction,
      subject: draft.subject,
      summary: draft.summary,
      message: draft.message,
      durationMinutes: draft.durationMinutes,
      outcome: draft.outcome,
      followUpRequired: draft.followUpRequired,
      nextAction: draft.nextAction,
      occurredAt: draft.occurredAt || new Date().toISOString(),
      hasAttachments: draft.hasAttachments,
      isPrivate: draft.isPrivate,
      source: 'manual',
    }
    const handlers = {
      call: logCall,
      email: logEmail,
      whatsapp: logWhatsApp,
      meeting: logMeeting,
      note: logNote,
    }
    try {
      setSaving(true)
      setError('')
      await (handlers[type] || logNote)(payload, { actor })
      setDraft({
        direction: type === 'note' ? 'internal' : 'outbound',
        subject: '',
        summary: '',
        message: '',
        durationMinutes: '',
        outcome: '',
        followUpRequired: false,
        nextAction: '',
        occurredAt: '',
        hasAttachments: false,
        isPrivate: false,
      })
      await onSaved()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to log communication.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Quick Logging</h3>
          <p className="mt-1 text-sm text-slate-500">Manual logs only. This does not send emails, WhatsApps, SMSes, or alerts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ['call', 'Log Call'],
            ['email', 'Log Email'],
            ['whatsapp', 'Log WhatsApp'],
            ['note', 'Add Note'],
            ['meeting', 'Log Meeting'],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setType(key)} className={`min-h-9 rounded-xl px-3 text-xs font-semibold ${type === key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select value={draft.direction} onChange={(event) => update('direction', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" disabled={type === 'note'}>
          {LEAD_COMMUNICATION_DIRECTIONS.filter((option) => type === 'note' ? option === 'internal' : option !== 'system').map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <input type="datetime-local" value={draft.occurredAt} onChange={(event) => update('occurredAt', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="Occurred at" />
        {type === 'call' ? <input value={draft.durationMinutes} onChange={(event) => update('durationMinutes', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Duration minutes" /> : null}
        {type === 'call' ? (
          <select value={draft.outcome} onChange={(event) => update('outcome', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="">Outcome</option>
            {['No Answer', 'Interested', 'Not Interested', 'Call Back Later', 'Viewing Booked', 'Offer Discussed'].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : null}
        {(type === 'email' || type === 'meeting') ? <input value={draft.subject} onChange={(event) => update('subject', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Subject" /> : null}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <textarea value={draft.summary} onChange={(event) => update('summary', event.target.value)} className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Summary" />
        <textarea value={draft.message} onChange={(event) => update('message', event.target.value)} className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder={type === 'whatsapp' ? 'Message snippet' : 'Detail or notes'} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
        <input value={draft.nextAction} onChange={(event) => update('nextAction', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Next action" />
        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.followUpRequired} onChange={(event) => update('followUpRequired', event.target.checked)} />
          Follow-up required
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.hasAttachments} onChange={(event) => update('hasAttachments', event.target.checked)} />
          Attachment
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.isPrivate} onChange={(event) => update('isPrivate', event.target.checked)} />
          Private note
        </label>
      </div>

      {error ? <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={saving || (!normalizeText(draft.summary) && !normalizeText(draft.message) && !normalizeText(draft.subject))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
          <MessageSquarePlus size={15} />
          {saving ? 'Logging...' : `Save ${type === 'note' ? 'Note' : type.replace(/^\w/, (letter) => letter.toUpperCase())}`}
        </button>
      </div>
    </form>
  )
}

function CommunicationTimelineCard({ item }) {
  const duration = formatDuration(item.metadata?.durationSeconds)
  const detailLines = [
    item.subject ? `Subject: ${item.subject}` : '',
    item.summary || item.message,
    item.metadata?.outcome ? `Outcome: ${item.metadata.outcome}` : '',
    item.metadata?.nextAction ? `Next action: ${item.metadata.nextAction}` : '',
  ].filter(Boolean)

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm text-slate-950">{item.title}</strong>
            <StatusPill>{item.communicationType}</StatusPill>
            <StatusPill tone={item.direction === 'inbound' ? 'blue' : item.direction === 'outbound' ? 'green' : 'slate'}>{item.direction}</StatusPill>
            {item.metadata?.isPrivate ? <StatusPill tone="amber">Private</StatusPill> : null}
            {duration ? <StatusPill tone="blue">{duration}</StatusPill> : null}
          </div>
          {detailLines.length ? (
            <div className="mt-3 space-y-1">
              {detailLines.map((line, index) => <p key={`${item.id}-line-${index}`} className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{line}</p>)}
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">No detail captured.</p>}
        </div>
        <span className="shrink-0 text-xs font-semibold text-slate-500">{formatDateTime(item.occurredAt)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
        {item.status ? <span>Status: {item.status}</span> : null}
        {item.source ? <span>Source: {item.source}</span> : null}
        {item.agentId ? <span>Agent: {item.agentId}</span> : null}
        {item.kind !== 'communication' ? <span>From {item.kind}</span> : null}
      </div>
    </article>
  )
}

function CommunicationTimelinePanel({ organisationId, lead, actor, timeline = [], onSaved }) {
  const [filters, setFilters] = useState({ search: '', type: 'all', direction: 'all', agentId: '', dateFrom: '', dateTo: '' })
  const visibleItems = useMemo(() => filterCommunicationTimeline(timeline, filters), [filters, timeline])

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Timeline</h2>
          <p className="mt-1 text-sm text-slate-500">Calls, emails, WhatsApps, notes, tasks, assignment history, enquiries, appointments, offers, and transaction links in date order.</p>
        </div>
        <StatusPill>{visibleItems.length} visible</StatusPill>
      </div>

      <div className="mt-5">
        <CommunicationQuickLogForm organisationId={organisationId} lead={lead} actor={actor} onSaved={onSaved} />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1.3fr)_repeat(5,minmax(130px,1fr))]">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={filters.search} onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-300" placeholder="Search timeline" />
        </label>
        <select value={filters.type} onChange={(event) => setFilters((previous) => ({ ...previous, type: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All types</option>
          {LEAD_COMMUNICATION_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
          {['activity', 'assignment', 'task', 'appointment', 'offer', 'transaction'].map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={filters.direction} onChange={(event) => setFilters((previous) => ({ ...previous, direction: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All directions</option>
          {LEAD_COMMUNICATION_DIRECTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <input value={filters.agentId} onChange={(event) => setFilters((previous) => ({ ...previous, agentId: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Agent id" />
        <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((previous) => ({ ...previous, dateFrom: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="Timeline from" />
        <input type="date" value={filters.dateTo} onChange={(event) => setFilters((previous) => ({ ...previous, dateTo: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="Timeline to" />
      </div>

      <div className="mt-5 space-y-3">
        {visibleItems.length ? visibleItems.map((item) => <CommunicationTimelineCard key={item.id} item={item} />) : (
          <EmptyState title="No timeline events match these filters" copy="Clear the search or log the first call, email, WhatsApp, meeting, or note." />
        )}
      </div>
    </section>
  )
}

function TaskList({ items = [] }) {
  if (!items.length) return <EmptyState title="No tasks linked" copy="Open and completed follow-ups linked to this lead will appear here." />
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <div key={item.taskId || item.task_id || item.title} className="grid gap-3 py-3 sm:grid-cols-[1fr_130px_120px]">
          <div>
            <p className="text-sm font-semibold text-slate-950">{item.title || 'Follow-up'}</p>
            <p className="mt-1 text-xs text-slate-500">{item.description || 'No description'}</p>
          </div>
          <span className="text-sm font-medium text-slate-600">{formatDate(item.dueDate || item.due_date)}</span>
          <StatusPill tone={String(item.status || '').toLowerCase() === 'completed' ? 'green' : 'amber'}>{item.status || 'Pending'}</StatusPill>
        </div>
      ))}
    </div>
  )
}

function getRecommendationTone(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'urgent' || normalized === 'overdue') return 'red'
  if (normalized === 'high' || normalized === 'pending') return 'amber'
  if (normalized === 'completed' || normalized === 'accepted') return 'green'
  if (normalized === 'dismissed' || normalized === 'expired') return 'slate'
  return 'blue'
}

function getRecommendationAgeLabel(recommendation = {}) {
  const createdAt = recommendation.createdAt || recommendation.created_at
  if (!createdAt) return 'Age unknown'
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return 'Age unknown'
  const days = Math.floor((Date.now() - created.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day old'
  return `${days} days old`
}

function LeadRecommendationsPanel({ recommendations = [], actor, onSaved, onShare, title = 'Recommendations', description = 'Recommended next actions generated from lead events, inactivity, suggestions, viewings, offers, and communication history.' }) {
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function runRecommendationAction(action, recommendation) {
    try {
      setWorkingId(`${recommendation.recommendationId}:${action}`)
      setMessage('')
      setError('')
      if (action === 'accept') {
        await acceptRecommendation({ recommendationId: recommendation.recommendationId }, { actor })
        setMessage('Recommendation accepted.')
      } else if (action === 'dismiss') {
        await dismissLeadRecommendation({ recommendationId: recommendation.recommendationId, reason: 'Dismissed from Lead Workspace.' }, { actor })
        setMessage('Recommendation dismissed.')
      } else if (action === 'complete') {
        await completeRecommendation({ recommendationId: recommendation.recommendationId }, { actor })
        setMessage('Recommendation completed.')
      } else if (action === 'task') {
        await convertRecommendationToTask({ recommendationId: recommendation.recommendationId }, { actor })
        setMessage('Recommendation converted to a task.')
      }
      await onSaved()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update recommendation.')
    } finally {
      setWorkingId('')
    }
  }

  const pendingCount = recommendations.filter((item) => ['pending', 'accepted'].includes(String(item.status || '').toLowerCase())).length

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <StatusPill tone="amber">{pendingCount} active</StatusPill>
      </div>
      {message ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-5 grid gap-3">
        {recommendations.length ? recommendations.map((recommendation) => {
          const active = ['pending', 'accepted'].includes(String(recommendation.status || '').toLowerCase())
          return (
            <article key={recommendation.recommendationId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-950">{recommendation.title || 'Recommended action'}</h3>
                    <StatusPill tone={getRecommendationTone(recommendation.priority)}>{recommendation.priority || 'medium'}</StatusPill>
                    <StatusPill tone={getRecommendationTone(recommendation.status)}>{recommendation.status || 'pending'}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{recommendation.description || 'No description captured.'}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">Due {formatDate(recommendation.dueDate || recommendation.due_date)}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">{recommendation.sourceEvent || recommendation.source_event || 'manual'}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">{getRecommendationAgeLabel(recommendation)}</span>
                    {recommendation.taskId ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Task linked</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {active ? (
                    <>
                      {recommendation.status === 'pending' ? (
                        <button type="button" onClick={() => runRecommendationAction('accept', recommendation)} disabled={workingId.startsWith(recommendation.recommendationId)} className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Accept</button>
                      ) : null}
                      <button type="button" onClick={() => runRecommendationAction('task', recommendation)} disabled={workingId.startsWith(recommendation.recommendationId) || Boolean(recommendation.taskId)} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 disabled:opacity-60">Convert To Task</button>
                      {String(recommendation.recommendationType || recommendation.recommendation_type) === 'send_property' ? (
                        <button type="button" onClick={() => onShare?.(recommendation)} disabled={workingId.startsWith(recommendation.recommendationId)} className="inline-flex min-h-10 items-center rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700 disabled:opacity-60">Send Property</button>
                      ) : null}
                      <button type="button" onClick={() => runRecommendationAction('complete', recommendation)} disabled={workingId.startsWith(recommendation.recommendationId)} className="inline-flex min-h-10 items-center rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 disabled:opacity-60">Complete</button>
                      <button type="button" onClick={() => runRecommendationAction('dismiss', recommendation)} disabled={workingId.startsWith(recommendation.recommendationId)} className="inline-flex min-h-10 items-center rounded-xl border border-rose-100 bg-rose-50 px-3 text-sm font-semibold text-rose-700 disabled:opacity-60">Dismiss</button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          )
        }) : (
          <EmptyState title="No recommendations yet" copy="Bridge will create recommended actions from lead events, suggestions, viewings, offers, communication logs, and inactivity checks." />
        )}
      </div>
    </section>
  )
}

function BuyerPropertyMatchPanel({ organisationId, row, workspace = {}, actor, onSaved, onShare }) {
  const requirements = workspace.requirements || row.requirements || []
  const listingInterests = workspace.listingInterests || row.listingInterests || []
  const suggestions = workspace.suggestions || row.suggestions || []
  return (
    <div className="section-stack">
      <PropertyMatchWorkflowPanel
        lead={row}
        interests={listingInterests}
        requirements={requirements}
        suggestions={suggestions}
      />
      <EnquiryPropertyPanel
        organisationId={organisationId}
        lead={row}
        interests={listingInterests}
        requirements={requirements}
        actor={actor}
        onSaved={onSaved}
        onShare={onShare}
      />
      <LeadRequirementsPanel
        organisationId={organisationId}
        lead={row}
        requirements={requirements}
        actor={actor}
        onSaved={onSaved}
        title="Search Brief"
        description="Structured buyer criteria used for matching when there is no enquiry property, or for finding alternatives to the enquiry property."
      />
      <LeadSuggestionsPanel
        organisationId={organisationId}
        lead={row}
        suggestions={suggestions}
        actor={actor}
        onSaved={onSaved}
        onShare={onShare}
        title="Smart Suggestions"
        description="Alternative matches generated from the search brief and lead context. Accept a suggestion to move it into the buyer shortlist."
      />
      <LeadListingInterestsPanel
        organisationId={organisationId}
        lead={row}
        interests={listingInterests}
        requirements={requirements}
        actor={actor}
        onSaved={onSaved}
        onShare={onShare}
        title="Shortlist / Interested Listings"
        description="All linked listings with operational controls: accepted suggestions, manual matches, enquiry listings, sent status, notes, and viewing scheduling."
      />
    </div>
  )
}

function AppointmentList({ items = [], organisationId, lead, actor, onSaved }) {
  const propertyOptions = useMemo(() => getLeadAppointmentPropertyOptions(lead), [lead])
  const [drafts, setDrafts] = useState({})
  const [workingId, setWorkingId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function getDraft(item) {
    const appointmentId = getAppointmentId(item)
    return drafts[appointmentId] || getAppointmentOutcomeDraft(item, propertyOptions)
  }

  function updateDraft(appointmentId, patch) {
    setDrafts((previous) => ({
      ...previous,
      [appointmentId]: {
        ...(previous[appointmentId] || {}),
        ...patch,
      },
    }))
  }

  async function saveAppointmentOutcome(item, nextStatus = '') {
    const appointmentId = getAppointmentId(item)
    const draft = getDraft(item)
    const isViewing = isViewingAppointment(item)
    const listingId = normalizeText(draft.listingId || getAppointmentListingId(item))
    if (!organisationId || !appointmentId) {
      setError('This appointment needs to be saved before it can be updated.')
      return
    }
    if (isViewing && nextStatus === 'completed' && !listingId) {
      setError('Choose the property viewed before marking this viewing complete.')
      return
    }

    try {
      setWorkingId(`${appointmentId}:${nextStatus || 'feedback'}`)
      setError('')
      setMessage('')
      const selectedProperty = propertyOptions.find((option) => option.id === listingId)
      const outcomeSummary = nextStatus === 'no_show'
        ? 'Buyer no-show'
        : normalizeText(draft.outcome) || (nextStatus === 'completed' ? 'Viewing completed' : 'Viewing feedback captured')
      await updateAppointmentAsync(organisationId, appointmentId, {
        ...(nextStatus ? { status: nextStatus } : {}),
        listingId: listingId || null,
        outcomeSummary,
        clientFeedback: draft.buyerFeedback,
        agentNotes: draft.agentNotes,
        nextStep: draft.nextStep,
        ...(nextStatus === 'completed' ? { completedAt: new Date().toISOString() } : {}),
      }, { actor })

      if (isViewing && listingId && nextStatus === 'completed') {
        await upsertAppointmentViewedListings({
          organisationId,
          appointmentId,
          leadId: lead?.leadId,
          agentId: actor?.id || actor?.userId,
          replaceExisting: true,
          viewedListings: [
            {
              listingId,
              outcome: normalizeText(draft.outcome) || 'Interested',
              buyerFeedback: draft.buyerFeedback,
              agentNotes: draft.agentNotes,
              viewedAt: new Date().toISOString(),
              metadata: {
                source: 'lead_workspace_viewing_outcome',
                nextStep: draft.nextStep,
                listingLabel: selectedProperty?.label || '',
              },
            },
          ],
        }).catch(() => [])
      }

      if (nextStatus === 'completed') setMessage('Viewing completed. The lead progress and viewed property history were updated.')
      else if (nextStatus === 'no_show') setMessage('Appointment marked as no-show.')
      else setMessage('Viewing feedback saved.')
      await onSaved?.()
    } catch (updateError) {
      setError(updateError?.message || 'Unable to update this appointment.')
    } finally {
      setWorkingId('')
    }
  }

  async function rescheduleAppointment(item) {
    const appointmentId = getAppointmentId(item)
    const draft = getDraft(item)
    if (!organisationId || !appointmentId) {
      setError('This appointment needs to be saved before it can be rescheduled.')
      return
    }
    if (!normalizeText(draft.rescheduleDate) || !normalizeText(draft.rescheduleTime)) {
      setError('Choose the new date and start time before rescheduling.')
      return
    }

    try {
      setWorkingId(`${appointmentId}:reschedule`)
      setError('')
      setMessage('')
      await updateAppointmentAsync(organisationId, appointmentId, {
        date: draft.rescheduleDate,
        startTime: draft.rescheduleTime,
        status: 'requested',
        nextStep: 'Await buyer confirmation',
        attachCalendarInvite: true,
      }, { actor })
      setMessage('Appointment rescheduled and buyer confirmation was requested.')
      await onSaved?.()
    } catch (updateError) {
      setError(updateError?.message || 'Unable to reschedule this appointment.')
    } finally {
      setWorkingId('')
    }
  }

  if (!items.length) return <EmptyState title="No appointments linked" copy="Lead, contact, listing, and converted transaction appointments will appear here when related by existing ids." />
  return (
    <div className="grid gap-4">
      {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((item, index) => {
        const appointmentId = getAppointmentId(item)
        const integrityBadges = getAppointmentIntegrityBadges(item)
        const draft = getDraft(item)
        const isViewing = isViewingAppointment(item)
        const isClosed = isAppointmentClosed(item)
        const status = normalizeText(item.status) || 'scheduled'
        const itemKey = appointmentId || `${item.title || 'appointment'}-${index}`
        return (
          <article key={itemKey} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{item.title || item.appointmentType || item.appointment_type || 'Appointment'}</p>
                <p className="mt-1 text-xs text-slate-500">{getAppointmentDateLabel(item)}</p>
              </div>
              <StatusPill tone={getAppointmentStatusTone(status)}>{status}</StatusPill>
            </div>
            <p className="mt-3 text-sm text-slate-600">{item.location || item.locationAddress || item.location_address || 'No location captured'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {integrityBadges.map((badge) => (
                <StatusPill key={badge.label} tone={badge.tone}>{badge.label}</StatusPill>
              ))}
            </div>
            {isViewing ? (
              <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Viewed property
                    <select value={draft.listingId} onChange={(event) => updateDraft(appointmentId, { listingId: event.target.value })} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-800 outline-none focus:border-blue-300">
                      <option value="">{propertyOptions.length ? 'Choose property' : 'No linked properties yet'}</option>
                      {propertyOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {[option.isOriginalEnquiry ? 'Enquiry' : option.source, option.label].filter(Boolean).join(' - ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Interest level
                    <select value={draft.outcome} onChange={(event) => updateDraft(appointmentId, { outcome: event.target.value })} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-800 outline-none focus:border-blue-300">
                      {VIEWING_OUTCOME_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Buyer feedback
                  <textarea value={draft.buyerFeedback} onChange={(event) => updateDraft(appointmentId, { buyerFeedback: event.target.value })} rows={2} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800 outline-none focus:border-blue-300" placeholder="What did the buyer like or dislike?" />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Agent notes
                    <textarea value={draft.agentNotes} onChange={(event) => updateDraft(appointmentId, { agentNotes: event.target.value })} rows={2} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800 outline-none focus:border-blue-300" placeholder="Internal notes for follow-up" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Next step
                    <select value={draft.nextStep} onChange={(event) => updateDraft(appointmentId, { nextStep: event.target.value })} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-800 outline-none focus:border-blue-300">
                      {VIEWING_NEXT_STEP_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <input type="date" value={draft.rescheduleDate} onChange={(event) => updateDraft(appointmentId, { rescheduleDate: event.target.value })} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" />
                  <input type="time" value={draft.rescheduleTime} onChange={(event) => updateDraft(appointmentId, { rescheduleTime: event.target.value })} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" />
                  <button type="button" disabled={!appointmentId || isClosed || workingId === `${appointmentId}:reschedule`} onClick={() => rescheduleAppointment(item)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                    <RefreshCw size={15} />
                    Reschedule
                  </button>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" disabled={!appointmentId || workingId === `${appointmentId}:feedback`} onClick={() => saveAppointmentOutcome(item)} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                    Save Feedback
                  </button>
                  <button type="button" disabled={!appointmentId || isClosed || workingId === `${appointmentId}:no_show`} onClick={() => saveAppointmentOutcome(item, 'no_show')} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 px-3 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
                    No-show
                  </button>
                  <button type="button" disabled={!appointmentId || isClosed || workingId === `${appointmentId}:completed`} onClick={() => saveAppointmentOutcome(item, 'completed')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                    <CheckCircle2 size={15} />
                    Mark Complete
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        )
      })}
      </div>
    </div>
  )
}

function LeadAppointmentForm({ organisationId, lead, actor, onSaved }) {
  const contact = getLeadContactSnapshot(lead)
  const propertyOptions = useMemo(() => getLeadAppointmentPropertyOptions(lead), [lead])
  const [draft, setDraft] = useState({
    appointmentType: 'viewing',
    title: `Viewing - ${contact.name || 'Buyer'}`,
    listingIds: propertyOptions[0]?.id ? [propertyOptions[0].id] : [],
    appointmentStatus: 'requested',
    sendSellerRequests: true,
    sendInviteEmails: false,
    date: getTodayInputValue(),
    startTime: '',
    location: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const isViewing = draft.appointmentType === 'viewing'
  const selectedListingIds = Array.isArray(draft.listingIds) ? draft.listingIds.filter(Boolean) : []
  const selectedProperties = propertyOptions.filter((option) => selectedListingIds.includes(option.id))
  const selectedProperty = selectedProperties[0] || null
  const sellerParticipants = selectedProperties
    .map((property) => ({
      propertyId: property.id,
      name: property.sellerName || `${property.label} seller`,
      email: property.sellerEmail,
      phone: property.sellerPhone,
      participantRole: 'Seller',
      rsvpStatus: 'Pending',
    }))
    .filter((participant, index, list) => participant.email && list.findIndex((item) => item.email === participant.email) === index)
  const sellerFirstWorkflow = isViewing && draft.appointmentStatus === 'requested'

  useEffect(() => {
    setDraft((previous) => ({
      ...previous,
      title: previous.title || `Viewing - ${contact.name || 'Buyer'}`,
    }))
  }, [contact.name])

  useEffect(() => {
    setDraft((previous) => {
      const validIds = (Array.isArray(previous.listingIds) ? previous.listingIds : []).filter((id) => propertyOptions.some((option) => option.id === id))
      if (validIds.length || !propertyOptions[0]?.id) return { ...previous, listingIds: validIds }
      return { ...previous, listingIds: [propertyOptions[0].id] }
    })
  }, [propertyOptions])

  function toggleListingSelection(listingId = '') {
    const normalizedListingId = normalizeText(listingId)
    if (!normalizedListingId) return
    setDraft((previous) => {
      const currentIds = Array.isArray(previous.listingIds) ? previous.listingIds : []
      const listingIds = currentIds.includes(normalizedListingId)
        ? currentIds.filter((id) => id !== normalizedListingId)
        : [...currentIds, normalizedListingId]
      return { ...previous, listingIds }
    })
  }

  async function submit(event) {
    event.preventDefault()
    if (!organisationId || !lead?.leadId) {
      setError('This lead needs to be loaded before an appointment can be created.')
      return
    }
    if (!normalizeText(draft.date) || !normalizeText(draft.startTime)) {
      setError('Choose a date and start time for the appointment.')
      return
    }
    if (isViewing && !selectedListingIds.length) {
      setError('Choose at least one property for this viewing request.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      const buyerParticipant = {
        name: contact.name || lead.name || 'Buyer',
        email: contact.email,
        phone: contact.phone,
        contactId: contact.contactId || null,
        participantRole: 'Buyer',
        rsvpStatus: 'Pending',
      }
      const shouldNotifySellerRequests = sellerFirstWorkflow && draft.sendSellerRequests && sellerParticipants.length > 0
      const participantRows = shouldNotifySellerRequests ? sellerParticipants : [buyerParticipant]
      const selectedPropertySummary = selectedProperties
        .map((property) => [property.label, property.price ? formatCurrency(property.price) : ''].filter(Boolean).join(' - '))
        .join('; ')
      const workflowNote = sellerFirstWorkflow
        ? `Seller-first viewing request for ${selectedProperties.length || 1} propert${selectedProperties.length === 1 ? 'y' : 'ies'}. Buyer approval should be requested after seller acceptance.`
        : ''
      const notes = [draft.notes, selectedPropertySummary ? `Selected properties: ${selectedPropertySummary}` : '', workflowNote].map(normalizeText).filter(Boolean).join('\n')
      const defaultViewingTitle = `Viewing - ${contact.name || 'Buyer'}`
      const resolvedTitle = isViewing && selectedProperties.length > 1 && normalizeText(draft.title) === defaultViewingTitle
        ? `Viewing route - ${contact.name || 'Buyer'}`
        : normalizeText(draft.title)
      const result = await createAppointmentAsync(organisationId, {
        appointmentType: draft.appointmentType,
        title: resolvedTitle || `${isViewing && selectedProperties.length > 1 ? 'Viewing route' : formatCleanValue(draft.appointmentType)} - ${contact.name || 'Buyer'}`,
        date: draft.date,
        startTime: draft.startTime,
        location: normalizeText(draft.location) || selectedProperty?.description || '',
        locationType: normalizeText(draft.location || selectedProperty?.description) ? 'physical_address' : 'to_be_confirmed',
        notes,
        status: draft.appointmentStatus,
        leadId: lead.leadId,
        contactId: contact.contactId || null,
        listingId: normalizeText(selectedProperty?.id) || null,
        listingLabel: selectedProperties.length > 1 ? `${selectedProperties.length} selected properties` : selectedProperty?.label || '',
        relatedEntityType: 'lead',
        relatedEntityId: lead.leadId,
        assignedAgent: actor,
        participants: participantRows,
        instructions: sellerFirstWorkflow
          ? 'Request seller availability first. Send buyer confirmation only once sellers accept the viewing window.'
          : '',
        sendInviteEmails: sellerFirstWorkflow ? shouldNotifySellerRequests : draft.sendInviteEmails,
        attachCalendarInvite: sellerFirstWorkflow ? shouldNotifySellerRequests : draft.sendInviteEmails,
      }, { actor })
      const appointmentId = getAppointmentId(result)
      if (appointmentId && isViewing && selectedListingIds.length) {
        await upsertAppointmentViewedListings({
          organisationId,
          appointmentId,
          leadId: lead.leadId,
          agentId: actor?.id || actor?.userId,
          viewedListings: selectedListingIds,
          replaceExisting: true,
        })
      }
      setMessage(buildAppointmentCreateMessage(result, {
        ...draft,
        listingIds: selectedListingIds,
        sellerRequestCount: shouldNotifySellerRequests ? sellerParticipants.length : 0,
      }, isViewing))
      setDraft({
        appointmentType: 'viewing',
        title: `Viewing - ${contact.name || 'Buyer'}`,
        listingIds: propertyOptions[0]?.id ? [propertyOptions[0].id] : [],
        appointmentStatus: 'requested',
        sendSellerRequests: true,
        sendInviteEmails: false,
        date: getTodayInputValue(),
        startTime: '',
        location: '',
        notes: '',
      })
      await onSaved()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to create this appointment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Prefilled for {contact.name || lead.name || 'this lead'}</p>
          <p className="mt-1 text-sm text-slate-500">{contact.phone || 'No phone'} · {contact.email || 'No email'}</p>
        </div>
        <StatusPill tone="blue">Lead linked</StatusPill>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Type
          <select value={draft.appointmentType} onChange={(event) => setDraft((previous) => ({ ...previous, appointmentType: event.target.value, title: previous.title || `${formatCleanValue(event.target.value)} - ${contact.name || 'Buyer'}` }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300">
            {LEAD_APPOINTMENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Title
          <input value={draft.title} onChange={(event) => setDraft((previous) => ({ ...previous, title: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Viewing appointment" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Date
          <input type="date" value={draft.date} onChange={(event) => setDraft((previous) => ({ ...previous, date: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Start time
          <input type="time" value={draft.startTime} onChange={(event) => setDraft((previous) => ({ ...previous, startTime: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" />
        </label>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        <div className="grid gap-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Viewing properties</p>
              <p className="text-xs font-medium text-slate-400">
                {isViewing ? 'Select one or more properties. Seller availability is requested first, then the buyer confirms.' : 'Optional property context for this appointment.'}
              </p>
            </div>
            <StatusPill tone={selectedListingIds.length ? 'blue' : 'slate'}>{selectedListingIds.length || 0} selected</StatusPill>
          </div>
          {propertyOptions.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {propertyOptions.map((option) => {
                const selected = selectedListingIds.includes(option.id)
                return (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => toggleListingSelection(option.id)}
                    className={`min-h-[126px] rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md ${selected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${selected ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        {selected ? <CheckCircle2 size={18} /> : <Home size={18} />}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${option.isOriginalEnquiry ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {option.isOriginalEnquiry ? 'Enquiry' : option.source || 'Listing'}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-1 text-sm font-semibold text-slate-950">{option.label}</p>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-500">{option.description}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold">
                      <span className="text-blue-700">{option.price ? formatCurrency(option.price) : 'Price pending'}</span>
                      <span className={option.sellerEmail ? 'text-emerald-600' : 'text-amber-600'}>{option.sellerEmail ? 'Seller contact ready' : 'Seller contact missing'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Link the enquiry property or a shortlisted listing in Property Match before booking a viewing.
            </div>
          )}
        </div>
        <div className="grid content-start gap-3">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Appointment status
            <select value={draft.appointmentStatus} onChange={(event) => setDraft((previous) => ({ ...previous, appointmentStatus: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300">
              <option value="requested">Seller availability requested</option>
              <option value="confirmed">Confirmed viewing</option>
            </select>
          </label>
          {sellerFirstWorkflow ? (
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={draft.sendSellerRequests} onChange={(event) => setDraft((previous) => ({ ...previous, sendSellerRequests: event.target.checked }))} />
              Send seller requests first
            </label>
          ) : (
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={draft.sendInviteEmails} onChange={(event) => setDraft((previous) => ({ ...previous, sendInviteEmails: event.target.checked }))} />
              Send invite to buyer
            </label>
          )}
        </div>
      </div>
      <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800 lg:grid-cols-3">
        <div className="flex items-start gap-2">
          <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">1</span>
          <span>Request availability from each selected property seller.</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">2</span>
          <span>Sellers accept or propose a new viewing window.</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">3</span>
          <span>Send the consolidated viewing plan to the buyer for approval.</span>
        </div>
        {!sellerParticipants.length && sellerFirstWorkflow && selectedListingIds.length ? (
          <p className="lg:col-span-3 text-amber-700">No selected properties have seller email details yet, so this will be saved for manual seller follow-up.</p>
        ) : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <input value={draft.location} onChange={(event) => setDraft((previous) => ({ ...previous, location: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Location or property address" />
        <input value={draft.notes} onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Internal notes" />
        <button type="submit" disabled={saving || !normalizeText(draft.date) || !normalizeText(draft.startTime) || (isViewing && !selectedListingIds.length)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          <Plus size={15} />
          {sellerFirstWorkflow ? 'Request Seller Availability' : 'Add Appointment'}
        </button>
      </div>
      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
      {message ? <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
    </form>
  )
}

function LeadAppointmentsPanel({ organisationId, lead, actor, onSaved }) {
  const navigate = useNavigate()
  return (
    <section className={buyerWorkspaceCardClass}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Appointments</h2>
          <p className="mt-1 text-sm text-slate-500">Create appointments directly for this lead with buyer details already linked.</p>
        </div>
      </div>
      <div className="mt-5">
        <AppointmentDashboardSection
          module="lead"
          organisationId={organisationId}
          appointmentRows={lead?.appointments || []}
          userId={actor?.id || ''}
          userEmail={actor?.email || ''}
          leadId={lead?.leadId || ''}
          onViewCalendar={() => navigate('/pipeline/calendar')}
          onOpenCalendar={() => navigate('/pipeline/calendar')}
          onManageAppointment={() => navigate('/pipeline/calendar')}
          onOpenAppointment={() => navigate('/pipeline/calendar')}
          onScheduleAppointment={() => navigate('/pipeline/calendar')}
          refreshKey={`${lead?.leadId || ''}:${(lead?.appointments || []).length}`}
        />
      </div>
      <LeadAppointmentForm organisationId={organisationId} lead={lead} actor={actor} onSaved={onSaved} />
      <div className="mt-5">
        <AppointmentList items={lead.appointments} organisationId={organisationId} lead={lead} actor={actor} onSaved={onSaved} />
      </div>
    </section>
  )
}

function SellerAppointmentForm({ organisationId, lead, listing = null, actor, onSaved }) {
  const contact = getLeadContactSnapshot(lead)
  const listingId = getSellerListingId(lead, listing)
  const property = getSellerPropertySummary(lead, listing)
  const defaultJourneyAppointmentTitle = getSellerAppointmentDefaultTitle('seller_consultation', contact.name, lead?.name)
  const [draft, setDraft] = useState({
    appointmentType: 'seller_consultation',
    title: defaultJourneyAppointmentTitle,
    appointmentStatus: 'confirmed',
    sendInviteEmails: false,
    date: getTodayInputValue(),
    startTime: '',
    location: property.address !== 'Property address pending' ? property.address : '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setDraft((previous) => ({
      ...previous,
      title: previous.title || getSellerAppointmentDefaultTitle(previous.appointmentType, contact.name, lead?.name),
    }))
  }, [contact.name, lead?.name])

  async function submit(event) {
    event.preventDefault()
    if (!organisationId || !lead?.leadId) {
      setError('This seller lead needs to be loaded before an appointment can be created.')
      return
    }
    if (!normalizeText(draft.date) || !normalizeText(draft.startTime)) {
      setError('Choose a date and start time for the appointment.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      const journeyAppointment = draft.appointmentType === 'seller_consultation'
      const linkedWorkflow = journeyAppointment ? 'seller_listing' : 'seller_lead_add_on'
      const linkedWorkflowStage = journeyAppointment ? 'seller_consultation' : 'optional_appointment'
      const appointmentInstructions = journeyAppointment
        ? 'Seller consultation appointment for this lead.'
        : 'Supplemental seller appointment for this lead.'
      const sellerParticipant = {
        name: contact.name || lead.name || 'Seller',
        email: contact.email,
        phone: contact.phone,
        contactId: contact.contactId || null,
        participantRole: 'Seller',
        rsvpStatus: 'Pending',
      }
      const result = await createAppointmentAsync(organisationId, {
        appointmentType: draft.appointmentType,
        title: normalizeText(draft.title) || getSellerAppointmentDefaultTitle(draft.appointmentType, contact.name, lead.name),
        customTypeLabel: draft.appointmentType === 'other' ? 'Seller Appointment' : '',
        date: draft.date,
        startTime: draft.startTime,
        location: normalizeText(draft.location),
        locationType: normalizeText(draft.location) ? 'physical_address' : 'to_be_confirmed',
        notes: normalizeText(draft.notes),
        status: draft.appointmentStatus,
        leadId: lead.leadId,
        contactId: contact.contactId || null,
        listingId: listingId || null,
        listingLabel: property.address,
        relatedEntityType: 'lead',
        relatedEntityId: lead.leadId,
        linkedWorkflow,
        linkedWorkflowStage,
        visibility: draft.sendInviteEmails ? 'client_visible' : 'shared_role_players',
        assignedAgent: actor,
        participants: [sellerParticipant].filter((participant) => participant.email || participant.phone || participant.name),
        instructions: appointmentInstructions,
        sendInviteEmails: draft.sendInviteEmails,
        attachCalendarInvite: draft.sendInviteEmails,
      }, { actor })
      setMessage(buildAppointmentCreateMessage(result, {
        ...draft,
        appointmentStatus: draft.appointmentStatus,
      }, false))
      setDraft({
        appointmentType: 'seller_consultation',
        title: getSellerAppointmentDefaultTitle('seller_consultation', contact.name, lead.name),
        appointmentStatus: 'confirmed',
        sendInviteEmails: false,
        date: getTodayInputValue(),
        startTime: '',
        location: property.address !== 'Property address pending' ? property.address : '',
        notes: '',
      })
      await onSaved?.()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to create this appointment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Seller appointment</p>
          <p className="mt-1 text-sm text-slate-500">
            {draft.appointmentType === 'seller_consultation'
              ? `Linked to this seller lead${listingId ? ' and listing' : ''}; use this for seller consultations when needed.`
              : `Linked to this seller lead${listingId ? ' and listing' : ''}; supplemental appointment types stay outside the main seller journey.`}
          </p>
        </div>
        <StatusPill tone={draft.appointmentType === 'seller_consultation' ? 'green' : 'blue'}>
          {draft.appointmentType === 'seller_consultation' ? 'Primary appointment' : 'Add-on'}
        </StatusPill>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Type
          <select
            value={draft.appointmentType}
            onChange={(event) => setDraft((previous) => {
              const nextType = event.target.value
              const defaultTitle = getSellerAppointmentDefaultTitle(nextType, contact.name, lead?.name)
              const currentDefault = getSellerAppointmentDefaultTitle(previous.appointmentType, contact.name, lead?.name)
              return {
                ...previous,
                appointmentType: nextType,
                title: !normalizeText(previous.title) || normalizeText(previous.title) === normalizeText(currentDefault)
                  ? defaultTitle
                  : previous.title,
              }
            })}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
          >
            {SELLER_APPOINTMENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Title
          <input value={draft.title} onChange={(event) => setDraft((previous) => ({ ...previous, title: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Seller appointment" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Date
          <input type="date" value={draft.date} onChange={(event) => setDraft((previous) => ({ ...previous, date: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Start time
          <input type="time" value={draft.startTime} onChange={(event) => setDraft((previous) => ({ ...previous, startTime: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_220px]">
        <input value={draft.location} onChange={(event) => setDraft((previous) => ({ ...previous, location: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Location or property address" />
        <input value={draft.notes} onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Internal notes" />
        <select value={draft.appointmentStatus} onChange={(event) => setDraft((previous) => ({ ...previous, appointmentStatus: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300">
          <option value="confirmed">Confirmed</option>
          <option value="requested">Requested</option>
        </select>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.sendInviteEmails} onChange={(event) => setDraft((previous) => ({ ...previous, sendInviteEmails: event.target.checked }))} />
          Send invite to seller
        </label>
        <button type="submit" disabled={saving || !normalizeText(draft.date) || !normalizeText(draft.startTime)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          <CalendarDays size={15} />
          {saving ? 'Saving...' : 'Schedule Appointment'}
        </button>
      </div>
      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
      {message ? <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
    </form>
  )
}

function SellerAppointmentsTab({ organisationId, lead, listing = null, actor, onSaved, openComposerSignal = 0 }) {
  const navigate = useNavigate()
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false)

  const handleAppointmentSaved = useCallback(async () => {
    setAppointmentModalOpen(false)
    await onSaved?.()
  }, [onSaved])

  useEffect(() => {
    if (openComposerSignal > 0) {
      setAppointmentModalOpen(true)
    }
  }, [openComposerSignal])

  return (
    <SellerWorkspaceCard title="Appointments" action={<StatusPill tone={(lead?.appointments || []).length ? 'blue' : 'slate'}>{(lead?.appointments || []).length} linked</StatusPill>}>
      <div className="grid gap-5">
        <AppointmentDashboardSection
          module="lead"
          organisationId={organisationId}
          appointmentRows={lead?.appointments || []}
          userId={actor?.id || ''}
          userEmail={actor?.email || ''}
          leadId={lead?.leadId || ''}
          listingId={getSellerListingId(lead, listing)}
          onViewCalendar={() => navigate('/pipeline/calendar')}
          onOpenCalendar={() => navigate('/pipeline/calendar')}
          onManageAppointment={() => navigate('/pipeline/calendar')}
          onOpenAppointment={() => navigate('/pipeline/calendar')}
          onScheduleAppointment={() => setAppointmentModalOpen(true)}
          emptyActionLabel="Create Appointment"
          refreshKey={`${lead?.leadId || ''}:${(lead?.appointments || []).length}`}
        />
        <Modal
          open={appointmentModalOpen}
          onClose={() => setAppointmentModalOpen(false)}
          title="Create Appointment"
          subtitle="Create a seller appointment without leaving the lead workspace."
          className="max-w-2xl"
        >
          <SellerAppointmentForm organisationId={organisationId} lead={lead} listing={listing} actor={actor} onSaved={handleAppointmentSaved} />
        </Modal>
        <SellerAppointmentForm organisationId={organisationId} lead={lead} listing={listing} actor={actor} onSaved={onSaved} />
        <AppointmentList items={lead.appointments} organisationId={organisationId} lead={lead} actor={actor} onSaved={onSaved} />
      </div>
    </SellerWorkspaceCard>
  )
}

function LeadOfferReadinessPanel({ organisationId, lead, actor, onSaved }) {
  const contact = getLeadContactSnapshot(lead)
  const contexts = useMemo(() => getLeadOfferPropertyContexts(lead), [lead])
  const bestContext = contexts[0] || null
  const [draft, setDraft] = useState({
    contextKey: bestContext?.key || '',
    expiryDate: getFutureInputValue(7),
    note: '',
    emailBuyer: true,
  })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [lastLink, setLastLink] = useState('')
  const selectedContext = contexts.find((context) => context.key === draft.contextKey) || bestContext

  useEffect(() => {
    setDraft((previous) => {
      if (contexts.some((context) => context.key === previous.contextKey)) return previous
      return { ...previous, contextKey: contexts[0]?.key || '' }
    })
  }, [contexts])

  async function sendBuyerOfferLinkEmail(link = '', context = {}) {
    const recipientEmail = normalizeText(contact.email || lead.email).toLowerCase()
    if (!draft.emailBuyer || !recipientEmail || !link) {
      return {
        attempted: false,
        sent: false,
        reason: !draft.emailBuyer ? 'disabled' : recipientEmail ? 'missing_link' : 'missing_email',
      }
    }

    try {
      const emailResponse = await invokeEdgeFunction('send-email', {
        body: {
          type: 'buyer_offer_link',
          to: recipientEmail,
          buyerName: contact.name || lead.name || 'Buyer',
          propertyTitle: context.label || 'selected property',
          propertyCount: 1,
          offerLink: link,
          expiresAt: draft.expiryDate,
          agentName: actor?.fullName || actor?.name || actor?.email || '',
          note: draft.note,
        },
      })
      if (emailResponse?.error || emailResponse?.data?.error) {
        throw emailResponse.error || new Error(emailResponse.data.error)
      }
      return { attempted: true, sent: true }
    } catch (emailError) {
      return { attempted: true, sent: false, error: emailError }
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (!organisationId || !lead?.leadId) {
      setError('This lead needs to be loaded before an offer link can be sent.')
      return
    }
    if (!selectedContext?.listingId) {
      setError('Choose the property this offer link is for.')
      return
    }

    try {
      setSending(true)
      setError('')
      setMessage('')
      setLastLink('')

      const persisted = await ensureAgencyCrmLeadRecordPersisted(
        organisationId,
        lead,
        getLeadContactFallback(lead),
        { actor },
      )
      const buyerLeadId = normalizeText(persisted?.leadId || lead.leadId)
      const buyerContactId = normalizeText(persisted?.contactId || contact.contactId)
      const appointmentId = normalizeText(selectedContext.appointmentId)
      const canUsePostViewingPortal = Boolean(
        appointmentId &&
          UUID_PATTERN.test(organisationId) &&
          UUID_PATTERN.test(buyerLeadId) &&
          UUID_PATTERN.test(selectedContext.listingId) &&
          UUID_PATTERN.test(appointmentId),
      )
      let offerLink = ''
      let activityType = 'Offer Link Sent'
      let createdLabel = 'Offer link created'

      if (canUsePostViewingPortal) {
        await upsertAppointmentViewedListings({
          organisationId,
          appointmentId,
          leadId: buyerLeadId,
          agentId: actor?.id || actor?.userId,
          viewedListings: [
            {
              listingId: selectedContext.listingId,
              outcome: selectedContext.completed ? 'Interested' : 'Offer requested',
              buyerFeedback: '',
              agentNotes: draft.note,
              viewedAt: new Date().toISOString(),
              metadata: {
                source: 'lead_workspace_offer_link',
                readiness: selectedContext.readiness,
              },
            },
          ],
        }).catch(() => [])
        const session = await createOfferPortalSession({
          organisationId,
          buyerLeadId,
          buyerContactId,
          appointmentId,
          agentId: actor?.id || actor?.userId,
          expiresAt: draft.expiryDate,
          metadata: {
            source: 'lead_workspace_offers_tab',
            selectedListingId: selectedContext.listingId,
            propertyLabel: selectedContext.label,
            readiness: selectedContext.readiness,
            agentNoteToBuyer: draft.note,
          },
        }, { actor })
        offerLink = session?.token && typeof window !== 'undefined'
          ? `${window.location.origin}/offers/session/${encodeURIComponent(session.token)}`
          : ''
        activityType = 'Post-Viewing Offer Portal Sent'
        createdLabel = 'Post-viewing offer portal created'
        await updateAppointmentAsync(organisationId, appointmentId, {
          nextStep: 'Post-viewing offer portal sent',
        }, { actor }).catch(() => null)
      } else {
        const offer = await createCanonicalOffer({
          organisationId,
          buyerLeadId,
          buyerContactId,
          listingId: selectedContext.listingId,
          agentId: actor?.id || actor?.userId,
          viewingAppointmentId: UUID_PATTERN.test(appointmentId) ? appointmentId : null,
          status: 'sent_to_buyer',
          expiryDate: draft.expiryDate,
          conditionsJson: {
            source: 'lead_workspace_offers_tab',
            propertyLabel: selectedContext.label,
            readiness: selectedContext.readiness,
            buyerName: contact.name || lead.name || 'Buyer',
            buyerEmail: contact.email || lead.email || '',
            buyerPhone: contact.phone || lead.phone || '',
            agentName: actor?.fullName || actor?.name || actor?.email || '',
            agentEmail: normalizeText(actor?.email || '').toLowerCase(),
            agentReviewUrl: typeof window !== 'undefined'
              ? `${window.location.origin}/pipeline/leads/${encodeURIComponent(buyerLeadId)}`
              : '',
            agentNoteToBuyer: draft.note,
            offerWithoutCompletedViewing: !selectedContext.completed,
          },
        }, { actor })
        const offerToken = normalizeText(offer?.offerToken || offer?.offer_token || offer?.id)
        offerLink = offerToken && typeof window !== 'undefined'
          ? `${window.location.origin}/offers/${encodeURIComponent(offerToken)}`
          : ''
        createdLabel = selectedContext.completed ? 'Offer link created' : 'Offer link created without a completed viewing'
      }

      await createAgencyCrmLeadActivity(
        organisationId,
        buyerLeadId,
        {
          activityType,
          activityNote: [
            `${createdLabel} for ${selectedContext.label || 'selected property'}.`,
            selectedContext.readinessLabel ? `Context: ${selectedContext.readinessLabel}.` : '',
            offerLink ? `Link: ${offerLink}` : '',
            draft.note ? `Note: ${draft.note}` : '',
          ].filter(Boolean).join(' '),
          outcome: 'Offer Draft',
          activityDate: new Date().toISOString(),
        },
        { actor },
      ).catch(() => null)

      if (offerLink && typeof navigator !== 'undefined') {
        void navigator.clipboard?.writeText(offerLink)
      }
      const emailResult = await sendBuyerOfferLinkEmail(offerLink, selectedContext)
      setLastLink(offerLink)
      setMessage(
        offerLink
          ? emailResult.sent
            ? `${createdLabel} and emailed to the buyer. Link copied as backup.`
            : emailResult.attempted
              ? `${createdLabel} and copied, but the buyer email could not be sent.`
              : `${createdLabel} and copied. Add a buyer email or enable email sending to send it directly.`
          : `${createdLabel}.`,
      )
      if (emailResult.error) setError(emailResult.error?.message || 'Offer link created, but email sending failed.')
      await onSaved?.()
    } catch (sendError) {
      setError(sendError?.message || 'Unable to create this offer link.')
    } finally {
      setSending(false)
    }
  }

  if (!contexts.length) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Offer Readiness</h3>
            <p className="mt-1 text-sm text-slate-500">Link an enquiry property, shortlist, or viewing before sending an offer link.</p>
          </div>
          <StatusPill tone="amber">Property required</StatusPill>
        </div>
      </section>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Offer Readiness</h3>
          <p className="mt-1 text-sm text-slate-500">Best practice is to send the offer link from a completed property viewing. Use a linked property only when the buyer is ready without another viewing.</p>
        </div>
        <StatusPill tone={selectedContext?.completed ? 'green' : selectedContext?.appointmentId ? 'amber' : 'blue'}>
          {selectedContext?.readinessLabel || 'Property selected'}
        </StatusPill>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_180px_180px]">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Property / viewing context
          <select value={draft.contextKey} onChange={(event) => setDraft((previous) => ({ ...previous, contextKey: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300">
            {contexts.map((context) => (
              <option key={context.key} value={context.key}>
                {[context.readinessLabel, context.label, context.price ? formatCurrency(context.price) : ''].filter(Boolean).join(' - ')}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Link expiry
          <input type="date" value={draft.expiryDate} onChange={(event) => setDraft((previous) => ({ ...previous, expiryDate: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" />
        </label>
        <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.emailBuyer} onChange={(event) => setDraft((previous) => ({ ...previous, emailBuyer: event.target.checked }))} />
          Email buyer
        </label>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
        <input value={draft.note} onChange={(event) => setDraft((previous) => ({ ...previous, note: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Optional note for the buyer or timeline" />
        <button type="submit" disabled={sending || !selectedContext?.listingId} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          <Mail size={15} />
          {sending ? 'Creating...' : 'Send Offer Link'}
        </button>
      </div>
      {!contact.email && draft.emailBuyer ? (
        <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">This buyer has no email, so the link will be created and copied but not emailed.</p>
      ) : null}
      {selectedContext && !selectedContext.completed ? (
        <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">This property has not got a completed viewing outcome yet. You can still proceed when the buyer is ready, but the completed-viewing portal is the preferred path.</p>
      ) : null}
      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      {message ? <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {lastLink ? (
        <a href={lastLink} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
          Open generated offer link <ExternalLink size={13} />
        </a>
      ) : null}
    </form>
  )
}

function LeadOfferTransactionConversionPanel({ organisationId, lead, actor, onSaved }) {
  const offers = Array.isArray(lead?.offers) ? lead.offers : []
  const transactions = Array.isArray(lead?.transactions) ? lead.transactions : []
  const acceptedOffer = getAcceptedOfferForConversion(offers)
  const acceptedOfferId = getOfferId(acceptedOffer)
  const deal = getBuyerDealSnapshot(lead)
  const existingTransactionId = normalizeText(
    getOfferTransactionId(acceptedOffer) ||
      lead?.convertedTransactionId ||
      lead?.converted_transaction_id ||
      transactions[0]?.id ||
      transactions[0]?.transactionId ||
      transactions[0]?.transaction_id,
  )
  const propertyContexts = useMemo(() => getLeadOfferPropertyContexts(lead), [lead])
  const propertyById = new Map(propertyContexts.map((context) => [context.listingId, context]))
  const acceptedListing = acceptedOffer ? propertyById.get(getOfferListingId(acceptedOffer)) : null
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [createdTransactionId, setCreatedTransactionId] = useState(existingTransactionId)

  useEffect(() => {
    setCreatedTransactionId(existingTransactionId)
  }, [existingTransactionId])

  async function sendBuyerOnboarding(transactionId = '') {
    const scopedTransactionId = normalizeText(transactionId)
    if (!scopedTransactionId) return { attempted: false, sent: false, reason: 'missing_transaction' }
    try {
      const onboardingEmail = await invokeEdgeFunction('send-email', {
        body: {
          type: 'client_onboarding',
          transactionId: scopedTransactionId,
          source: 'buyer_lead_offer_conversion',
        },
      })
      if (onboardingEmail?.error || onboardingEmail?.data?.error) {
        throw onboardingEmail.error || new Error(onboardingEmail.data.error)
      }
      return { attempted: true, sent: true }
    } catch (sendError) {
      return { attempted: true, sent: false, error: sendError }
    }
  }

  async function convertAcceptedOffer() {
    if (!organisationId || !lead?.leadId || !acceptedOfferId || !acceptedOffer) {
      setError('An accepted offer is required before a transaction can be created.')
      return
    }
    if (!isOfferAcceptedForConversion(acceptedOffer)) {
      setError('Only an accepted offer can be converted to a transaction.')
      return
    }

    try {
      setConverting(true)
      setError('')
      setMessage('')

      const contact = getLeadContactSnapshot(lead)
      const listingId = getOfferListingId(acceptedOffer)
      const result = await createTransactionFromAcceptedCanonicalOffer({
        organisationId,
        offerId: acceptedOfferId,
        offer: acceptedOffer,
        lead: {
          ...lead,
          email: contact.email || lead.email,
          phone: contact.phone || lead.phone,
          firstName: getLeadContactFallback(lead).firstName,
          lastName: getLeadContactFallback(lead).lastName,
        },
        listing: listingId
          ? {
              id: listingId,
              organisationId,
              listingTitle: acceptedListing?.label || lead.propertyInterest || 'Listing',
              propertyAddress: acceptedListing?.description || lead.areaInterest || '',
            }
          : null,
        actor,
        payload: {
          listingId,
          buyerName: contact.name || lead.name,
          buyerEmail: contact.email || lead.email,
          buyerPhone: contact.phone || lead.phone,
          source: 'buyer_lead_workspace_phase_5',
        },
      })
      const transactionId = normalizeText(result?.transactionId || result?.transactionRow?.transaction?.id)
      const reused = Boolean(result?.alreadyConverted || result?.existing)
      const onboarding = await sendBuyerOnboarding(transactionId)

      await createAgencyCrmLeadActivity(
        organisationId,
        lead.leadId,
        {
          activityType: reused ? 'Transaction Reused' : 'Transaction Created',
          activityNote: [
            `${reused ? 'Existing transaction reused' : 'Transaction created'} from accepted offer ${acceptedOfferId}.`,
            transactionId ? `Transaction: ${transactionId}.` : '',
            onboarding.sent ? 'Buyer onboarding email sent.' : onboarding.attempted ? 'Buyer onboarding email needs attention.' : '',
          ].filter(Boolean).join(' '),
          outcome: transactionId ? 'Transaction Created' : 'Conversion Requested',
          activityDate: new Date().toISOString(),
        },
        { actor },
      ).catch(() => null)

      setCreatedTransactionId(transactionId)
      setMessage(
        transactionId
          ? onboarding.sent
            ? `${reused ? 'Existing transaction reused' : 'Transaction created'} and buyer onboarding was sent.`
            : onboarding.attempted
              ? `${reused ? 'Existing transaction reused' : 'Transaction created'}, but buyer onboarding email could not be sent.`
              : `${reused ? 'Existing transaction reused' : 'Transaction created'}.`
          : 'Transaction conversion was requested.',
      )
      if (onboarding.error) setError(onboarding.error?.message || 'Transaction created, but onboarding email failed.')
      await onSaved?.()
    } catch (conversionError) {
      setError(conversionError?.message || 'Unable to create a transaction from this accepted offer.')
    } finally {
      setConverting(false)
    }
  }

  if (!offers.length && !existingTransactionId) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Transaction Conversion</h3>
            <p className="mt-1 text-sm text-slate-500">Send an offer link first. Once the seller accepts an offer, Bridge can create the transaction from that accepted offer.</p>
          </div>
          <StatusPill tone="slate">Waiting for offer</StatusPill>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Transaction Conversion</h3>
          <p className="mt-1 text-sm text-slate-500">
            Accepted offers should land in one transaction workspace. Once it exists, keep working from that transaction instead of creating another one.
          </p>
        </div>
        <StatusPill tone={createdTransactionId ? 'green' : acceptedOffer ? 'amber' : 'blue'}>
          {createdTransactionId ? 'Transaction linked' : acceptedOffer ? 'Accepted offer ready' : 'Seller acceptance required'}
        </StatusPill>
      </div>
      {acceptedOffer ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr_auto]">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Accepted Offer</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(getOfferAmount(acceptedOffer))}</p>
            <p className="mt-1 text-xs text-slate-500">{acceptedListing?.label || getOfferListingId(acceptedOffer) || 'Property pending'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Current State</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{deal.transactionStateLabel}</p>
            <p className="mt-1 text-xs text-slate-500">{deal.transactionStateHelper}</p>
          </div>
          {createdTransactionId ? (
            <Link to={`/transactions/${createdTransactionId}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">
              Open Transaction <ExternalLink size={13} />
            </Link>
          ) : (
            <button type="button" disabled={converting || !acceptedOfferId} onClick={convertAcceptedOffer} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
              <CheckCircle2 size={15} />
              {converting ? 'Creating...' : 'Create Transaction'}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          No accepted offer yet. Keep the offer in review until the seller accepts, then convert once into the transaction workspace.
        </div>
      )}
      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      {message ? <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
    </section>
  )
}

function LeadOfferEdgeCasesPanel({ organisationId, lead, actor, onSaved }) {
  const offers = useMemo(() => sortOffersNewestFirst(lead?.offers || []), [lead?.offers])
  const [selectedOfferId, setSelectedOfferId] = useState(getOfferId(offers[0]))
  const [note, setNote] = useState('')
  const [workingAction, setWorkingAction] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const propertyContexts = useMemo(() => getLeadOfferPropertyContexts(lead), [lead])
  const propertyById = useMemo(() => new Map(propertyContexts.map((context) => [context.listingId, context])), [propertyContexts])

  useEffect(() => {
    if (!offers.length) {
      setSelectedOfferId('')
      return
    }
    if (offers.some((offer) => getOfferId(offer) === selectedOfferId)) return
    setSelectedOfferId(getOfferId(offers[0]))
  }, [offers, selectedOfferId])

  const selectedOffer = offers.find((offer) => getOfferId(offer) === selectedOfferId) || offers[0] || null
  const selectedLifecycle = selectedOffer ? getOfferLifecycleState(selectedOffer) : null
  const selectedListing = selectedOffer ? propertyById.get(getOfferListingId(selectedOffer)) : null
  const selectedTransactionId = normalizeText(getOfferTransactionId(selectedOffer) || getLeadLinkedTransactionId(lead))
  const latestTransaction = getLatestTransaction(lead)
  const transactionLifecycleState = normalizeText(latestTransaction?.lifecycleState || latestTransaction?.lifecycle_state).toLowerCase()
  const warnings = useMemo(() => getLeadOfferEdgeWarnings(lead, selectedOffer), [lead, selectedOffer])

  async function runOfferStatusUpdate(nextStatus, actionLabel, extraConditions = {}) {
    if (!organisationId || !selectedOfferId || !selectedOffer) {
      setError('Choose an offer first.')
      return
    }
    try {
      setWorkingAction(nextStatus)
      setError('')
      setMessage('')
      await updateCanonicalOfferStatus(selectedOfferId, nextStatus, {
        organisationId,
        actor,
        patch: buildLeadCanonicalOfferActionPatch(selectedOffer, actor, actionLabel, note, extraConditions),
      })
      setMessage(`Offer moved to ${formatCleanValue(nextStatus)}.`)
      setNote('')
      await onSaved?.()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update this offer right now.')
    } finally {
      setWorkingAction('')
    }
  }

  async function markDealFellThrough() {
    const transactionId = normalizeText(latestTransaction?.id || latestTransaction?.transactionId || latestTransaction?.transaction_id || selectedTransactionId)
    const reason = normalizeText(note) || (typeof window !== 'undefined'
      ? window.prompt('Reason for cancelling this transaction?')
      : '')
    if (!transactionId) {
      setError('There is no linked transaction to cancel.')
      return
    }
    if (!reason) {
      setError('Add a practical reason before cancelling the transaction.')
      return
    }
    try {
      setWorkingAction('cancel_transaction')
      setError('')
      setMessage('')
      await cancelTransactionLifecycle({
        transactionId,
        reason,
      })
      setMessage('Transaction marked as cancelled. The lead can now be restarted or closed cleanly.')
      setNote('')
      await onSaved?.()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to cancel this transaction.')
    } finally {
      setWorkingAction('')
    }
  }

  if (!offers.length && !latestTransaction) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Edge Cases & Overrides</h3>
            <p className="mt-1 text-sm text-slate-500">Manual corrections appear here once there is an offer or linked transaction to work with.</p>
          </div>
          <StatusPill tone="slate">Waiting for offer</StatusPill>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Edge Cases & Overrides</h3>
          <p className="mt-1 text-sm text-slate-500">Handle the practical exceptions here: manual seller decisions, buyer withdrawals, expired offers, and deals that fall through after acceptance.</p>
        </div>
        <StatusPill tone={transactionLifecycleState === 'cancelled' ? 'red' : selectedLifecycle?.acceptedOrConverted ? 'green' : selectedLifecycle?.activeNegotiation ? 'amber' : 'blue'}>
          {transactionLifecycleState === 'cancelled'
            ? 'Deal fell through'
            : selectedLifecycle?.label || (latestTransaction ? 'Transaction linked' : 'Manual controls')}
        </StatusPill>
      </div>

      {offers.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_1fr]">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Offer record
            <select value={selectedOfferId} onChange={(event) => setSelectedOfferId(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300">
              {offers.map((offer) => (
                <option key={getOfferId(offer)} value={getOfferId(offer)}>
                  {[formatCleanValue(getOfferLifecycleState(offer).effectiveStatus || offer.status || 'draft'), formatCurrency(getOfferAmount(offer)), selectedOffer && getOfferId(selectedOffer) === getOfferId(offer) ? selectedListing?.label : propertyById.get(getOfferListingId(offer))?.label || getOfferListingId(offer)].filter(Boolean).join(' - ')}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Selected Context</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{selectedListing?.label || getOfferListingId(selectedOffer) || 'Property pending'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedLifecycle?.blockedReason || 'Use the least-destructive manual correction that matches what happened in the real world.'}
            </p>
          </div>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="mt-4 space-y-2">
          {warnings.map((warning) => (
            <div key={warning.text} className={`rounded-xl border px-3 py-2 text-sm ${warning.tone === 'red' ? 'border-rose-200 bg-rose-50 text-rose-700' : warning.tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              {warning.text}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr_auto]">
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
          placeholder="Agent note / reason for the manual update"
        />
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Linked transaction</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{selectedTransactionId || 'Not linked'}</p>
        </div>
        {selectedTransactionId ? (
          <Link to={`/transactions/${selectedTransactionId}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">
            Open Transaction <ExternalLink size={13} />
          </Link>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!selectedOffer || selectedLifecycle?.acceptedOrConverted || workingAction === 'accepted'}
          onClick={() => runOfferStatusUpdate('accepted', 'Accepted outside system', {
            acceptedOutsideSystem: true,
            acceptedOutsideSystemAt: new Date().toISOString(),
            acceptedOutsideSystemBy: actor?.fullName || actor?.name || actor?.email || 'Agent',
          })}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle2 size={15} />
          {workingAction === 'accepted' ? 'Saving...' : 'Mark Accepted (Offline)'}
        </button>
        <button
          type="button"
          disabled={!selectedOffer || selectedLifecycle?.acceptedOrConverted || selectedLifecycle?.terminal || workingAction === 'rejected'}
          onClick={() => runOfferStatusUpdate('rejected', 'Rejected outside system')}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AlertTriangle size={15} />
          {workingAction === 'rejected' ? 'Saving...' : 'Mark Rejected'}
        </button>
        <button
          type="button"
          disabled={!selectedOffer || !selectedLifecycle?.buyerCanWithdraw || workingAction === 'withdrawn'}
          onClick={() => runOfferStatusUpdate('withdrawn', 'Buyer withdrew offer')}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Archive size={15} />
          {workingAction === 'withdrawn' ? 'Saving...' : 'Mark Withdrawn'}
        </button>
        <button
          type="button"
          disabled={!selectedOffer || selectedLifecycle?.acceptedOrConverted || selectedLifecycle?.terminal || workingAction === 'expired'}
          onClick={() => runOfferStatusUpdate('expired', 'Offer expired manually')}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-3 text-sm font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Clock3 size={15} />
          {workingAction === 'expired' ? 'Saving...' : 'Mark Expired'}
        </button>
        {latestTransaction && transactionLifecycleState !== 'cancelled' ? (
          <button
            type="button"
            disabled={workingAction === 'cancel_transaction'}
            onClick={markDealFellThrough}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Archive size={15} />
            {workingAction === 'cancel_transaction' ? 'Cancelling...' : 'Mark Deal Fell Through'}
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      {message ? <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
    </section>
  )
}

function LeadTransactionHandoffPanel({ organisationId, lead, actor, onSaved }) {
  const handoff = useMemo(() => getLeadHandoffState(lead), [lead])
  const transactionId = handoff.transactionId
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const checklist = [
    {
      key: 'buyer_onboarding',
      label: 'Buyer onboarding',
      done: handoff.buyerOnboardingSent,
      helper: 'Send or resend the buyer onboarding email from the linked transaction.',
    },
    {
      key: 'fica_documents',
      label: 'FICA and documents',
      done: handoff.ficaTaskReady,
      helper: 'Track buyer identity, FICA, proof of funds, and supporting documents.',
    },
    {
      key: 'finance_readiness',
      label: 'Finance readiness',
      done: handoff.financeTaskReady,
      helper: 'Track bond/cash readiness and follow-up with the buyer.',
    },
    {
      key: 'conveyancer_handoff',
      label: 'Conveyancer handoff',
      done: handoff.conveyancerTaskReady,
      helper: 'Confirm transaction handover and next operational owner.',
    },
  ]

  async function resendBuyerOnboarding() {
    if (!transactionId) {
      setError('Create or link the transaction before sending buyer onboarding.')
      return
    }
    try {
      setWorking('buyer_onboarding')
      setError('')
      setMessage('')
      const onboardingEmail = await invokeEdgeFunction('send-email', {
        body: {
          type: 'client_onboarding',
          transactionId,
          source: 'buyer_lead_handoff',
        },
      })
      if (onboardingEmail?.error || onboardingEmail?.data?.error) {
        throw onboardingEmail.error || new Error(onboardingEmail.data.error)
      }
      await createAgencyCrmLeadActivity(
        organisationId,
        lead.leadId,
        {
          activityType: 'Buyer Onboarding Sent',
          activityNote: `Buyer onboarding sent for transaction ${transactionId} from the lead handoff checklist.`,
          outcome: 'Sent',
          activityDate: new Date().toISOString(),
        },
        { actor },
      ).catch(() => null)
      setMessage('Buyer onboarding email sent.')
      await onSaved?.()
    } catch (sendError) {
      setError(sendError?.message || 'Unable to send buyer onboarding right now.')
    } finally {
      setWorking('')
    }
  }

  async function createHandoffTasks() {
    if (!organisationId || !lead?.leadId || !transactionId) {
      setError('Create or link the transaction before creating handoff tasks.')
      return
    }
    const taskSeeds = [
      {
        key: 'fica_documents',
        title: 'Collect buyer FICA and transaction documents',
        description: `Linked transaction: ${transactionId}`,
        dueDate: getFutureInputValue(1),
        skip: handoff.ficaTaskReady,
      },
      {
        key: 'finance_readiness',
        title: 'Confirm buyer finance readiness',
        description: `Linked transaction: ${transactionId}`,
        dueDate: getFutureInputValue(2),
        skip: handoff.financeTaskReady,
      },
      {
        key: 'conveyancer_handoff',
        title: 'Confirm conveyancer handoff',
        description: `Linked transaction: ${transactionId}`,
        dueDate: getFutureInputValue(3),
        skip: handoff.conveyancerTaskReady,
      },
    ].filter((task) => !task.skip)

    if (!taskSeeds.length) {
      setMessage('Handoff tasks are already open.')
      return
    }

    try {
      setWorking('handoff_tasks')
      setError('')
      setMessage('')
      for (const task of taskSeeds) {
        await createAgencyCrmLeadTask(
          organisationId,
          lead.leadId,
          {
            title: task.title,
            description: task.description,
            dueDate: task.dueDate,
            status: 'Pending',
            priority: 'High',
          },
          { actor },
        )
      }
      await createAgencyCrmLeadActivity(
        organisationId,
        lead.leadId,
        {
          activityType: 'Transaction Handoff Prepared',
          activityNote: `${taskSeeds.length} post-conversion handoff task${taskSeeds.length === 1 ? '' : 's'} created for transaction ${transactionId}.`,
          outcome: 'Tasks Created',
          activityDate: new Date().toISOString(),
        },
        { actor },
      ).catch(() => null)
      setMessage(`${taskSeeds.length} handoff task${taskSeeds.length === 1 ? '' : 's'} created.`)
      await onSaved?.()
    } catch (taskError) {
      setError(taskError?.message || 'Unable to create handoff tasks.')
    } finally {
      setWorking('')
    }
  }

  if (!transactionId) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Post-Conversion Handoff</h3>
            <p className="mt-1 text-sm text-slate-500">This checklist unlocks once a transaction has been created from the accepted offer.</p>
          </div>
          <StatusPill tone="slate">Waiting for transaction</StatusPill>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Post-Conversion Handoff</h3>
          <p className="mt-1 text-sm text-slate-500">Keep the buyer lead useful after conversion by preparing onboarding, finance, documents, and conveyancer follow-up.</p>
        </div>
        <Link to={`/transactions/${transactionId}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          Open Transaction <ExternalLink size={13} />
        </Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checklist.map((item) => (
          <div key={item.key} className={`flex min-h-[138px] flex-col justify-between rounded-2xl border p-3 ${item.done ? 'border-emerald-100 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
            <div>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${item.done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {item.done ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
              </div>
              <p className={`mt-3 text-sm font-semibold ${item.done ? 'text-emerald-800' : 'text-slate-950'}`}>{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.helper}</p>
            </div>
            <StatusPill tone={item.done ? 'green' : 'amber'}>{item.done ? 'Ready' : 'Needs action'}</StatusPill>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={working === 'buyer_onboarding'} onClick={resendBuyerOnboarding} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Mail size={15} />
          {handoff.buyerOnboardingSent ? 'Resend Onboarding' : 'Send Onboarding'}
        </button>
        <button type="button" disabled={working === 'handoff_tasks'} onClick={createHandoffTasks} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          <Plus size={15} />
          Create Handoff Tasks
        </button>
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      {message ? <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
    </section>
  )
}

function OfferTransactionList({ offers = [], transactions = [], convertedTransactionId = '' }) {
  const safeOffers = (Array.isArray(offers) ? offers : []).filter(Boolean)
  const safeTransactions = (Array.isArray(transactions) ? transactions : []).filter(Boolean)
  const safeConvertedTransactionId = normalizeText(convertedTransactionId)
  if (!safeOffers.length && !safeTransactions.length && !safeConvertedTransactionId) {
    return <EmptyState title="No offers or transaction link" copy="Submitted offers and converted transactions will appear here from the existing offer and transaction fields." />
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-950">Offers</h3>
        <div className="space-y-3">
          {safeOffers.length ? safeOffers.map((offer, index) => (
            <article key={getOfferId(offer) || `${getOfferListingId(offer) || 'offer'}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {(() => {
                const lifecycle = getOfferLifecycleState(offer)
                return (
                  <>
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-slate-950">{formatCurrency(getOfferAmount(offer))}</strong>
                <StatusPill tone={getOfferStatusTone(lifecycle.effectiveStatus || offer.status)}>{lifecycle.label}</StatusPill>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-600">
                {getOfferTransactionId(offer)
                  ? 'Already linked to a transaction.'
                  : lifecycle.activeNegotiation
                    ? 'Offer is still inside live review.'
                    : lifecycle.buyerCanResubmit
                      ? 'Buyer can still revise or resubmit from this path.'
                      : 'Offer workflow is paused or closed.'}
              </p>
              <p className="mt-2 text-xs text-slate-500">Updated {formatDateTime(offer.updatedAt || offer.updated_at || offer.createdAt || offer.created_at)}</p>
                  </>
                )
              })()}
            </article>
          )) : <p className="text-sm text-slate-500">No offers linked.</p>}
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-950">Transactions</h3>
        <div className="space-y-3">
          {safeTransactions.length ? safeTransactions.map((transaction, index) => {
            const transactionId = normalizeText(transaction.id || transaction.transactionId || transaction.transaction_id)
            const transactionLifecycleState = normalizeText(transaction.lifecycleState || transaction.lifecycle_state).toLowerCase()
            return (
            <article key={transactionId || `transaction-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-slate-950">Transaction</strong>
                <StatusPill tone={transactionLifecycleState === 'cancelled' ? 'red' : normalizeText(transaction.onboardingStatus || transaction.onboarding_status).toLowerCase().includes('signed_otp_received') ? 'green' : 'blue'}>
                  {transactionLifecycleState === 'cancelled' ? 'Cancelled' : transaction.currentMainStage || transaction.current_main_stage || transaction.status || 'Linked'}
                </StatusPill>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-600">
                {transactionLifecycleState === 'cancelled'
                  ? `Deal fell through${transaction.cancelledAt || transaction.cancelled_at ? ` on ${formatDateTime(transaction.cancelledAt || transaction.cancelled_at)}` : ''}.`
                  : normalizeText(transaction.onboardingStatus || transaction.onboarding_status || transaction.status || 'linked')}
              </p>
              {transactionId ? (
                <Link to={`/transactions/${transactionId}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                  Open transaction <ExternalLink size={13} />
                </Link>
              ) : null}
            </article>
            )
          }) : safeConvertedTransactionId ? (
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <strong className="text-sm text-slate-950">Converted transaction</strong>
              <Link to={`/transactions/${safeConvertedTransactionId}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                Open transaction <ExternalLink size={13} />
              </Link>
            </article>
          ) : <p className="text-sm text-slate-500">No transaction linked.</p>}
        </div>
      </section>
    </div>
  )
}

function formatSellerJourneyValue(item = {}) {
  if (item.type === 'currency') return formatCurrency(item.value)
  return [item.value || '—', item.suffix].filter(Boolean).join(' ')
}

function SellerJourneyPanel({ journey = null }) {
  if (!journey) return <EmptyState title="Seller journey unavailable" copy="This seller lead could not be mapped to the existing seller journey service." />
  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Listing Journey</h2>
          <p className="mt-1 text-sm text-slate-500">Seller leads progress toward a listing, not buyer matching.</p>
        </div>
        <StatusPill tone={journey.listingLive ? 'green' : journey.listingCreated ? 'amber' : 'blue'}>{journey.status?.summary || journey.stage?.label || 'Contacted'}</StatusPill>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {(journey.kpis || []).map((item) => (
          <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{item.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{formatSellerJourneyValue(item)}</p>
          </div>
        ))}
      </div>
      <ol className="mt-5 grid gap-2 lg:grid-cols-6">
        {(journey.steps || []).map((step) => (
          <li key={step.key} className={`rounded-xl border p-3 ${step.current ? 'border-blue-200 bg-blue-50' : step.completed ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
            <p className={`text-sm font-semibold ${step.current ? 'text-blue-800' : step.completed ? 'text-emerald-800' : 'text-slate-500'}`}>{step.label}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{step.status || step.state}</p>
          </li>
        ))}
      </ol>
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-950">Listing Status</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          {(journey.listingJourney || []).map((step) => (
            <div key={step.key} className={`rounded-xl px-3 py-2 text-xs font-semibold ${step.current ? 'bg-blue-50 text-blue-700' : step.completed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
              {step.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SellerReadinessPanel({ readiness = null }) {
  if (!readiness) return <EmptyState title="Seller readiness unavailable" copy="No seller readiness summary could be generated for this lead." />
  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Readiness</h2>
          <p className="mt-1 text-sm text-slate-500">What must happen before this seller can become a live listing.</p>
        </div>
        <StatusPill tone={readiness.readiness === 'completed' ? 'green' : readiness.readiness === 'blocked' ? 'red' : 'amber'}>{readiness.readinessLabel}</StatusPill>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(readiness.kpis || []).map((item) => (
          <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{item.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{formatSellerJourneyValue(item)}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Next Action</h3>
          <p className="mt-2 text-base font-semibold text-slate-900">{readiness.nextAction?.label || 'Review seller journey'}</p>
          {readiness.nextAction?.reason ? <p className="mt-1 text-sm text-slate-500">{readiness.nextAction.reason}</p> : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Blockers</h3>
          <div className="mt-2 space-y-2">
            {readiness.blockers?.length ? readiness.blockers.map((blocker) => (
              <p key={blocker.id || blocker.label} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700">{blocker.label}</p>
            )) : <p className="text-sm text-slate-500">No blockers recorded.</p>}
          </div>
        </div>
      </div>
    </section>
  )
}

function SellerDocumentsPanel({ journey = null }) {
  const documents = journey?.documents || []
  return (
    <section className={`${panelClass} p-5`}>
      <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Documents</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {documents.length ? documents.map((document) => (
          <article key={document.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{document.label}</p>
              <StatusPill tone={document.status === 'Approved' || document.status === 'Uploaded' ? 'green' : 'amber'}>{document.status}</StatusPill>
            </div>
            {document.url ? <a href={document.url} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">Open document <ExternalLink size={13} /></a> : null}
          </article>
        )) : <EmptyState title="No seller documents" copy="Seller document requirements will appear from the existing seller journey." />}
      </div>
    </section>
  )
}

function getSellerOnboardingStatus(row = {}, listing = null, journey = null) {
  const statuses = [
    row?.sellerOnboardingStatus,
    row?.seller_onboarding_status,
    row?.sellerOnboarding?.status,
    listing?.sellerOnboarding?.status,
    listing?.sellerOnboardingStatus,
    listing?.seller_onboarding_status,
    row?.stage,
    row?.status,
    row?.currentStage,
    row?.current_stage,
    listing?.listingStatus,
    listing?.listing_status,
    listing?.status,
    listing?.lifecycleStatus,
    listing?.lifecycle_status,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean)

  const submittedStatus = statuses.find((status) => sellerOnboardingIsSubmitted(status))
  if (submittedStatus) return submittedStatus

  if (journey?.onboardingSubmitted) return 'completed'

  const hasCompletionTimestamp = Boolean(
    row?.sellerOnboarding?.submittedAt ||
      row?.sellerOnboarding?.completedAt ||
      row?.sellerOnboardingSubmittedAt ||
      row?.sellerOnboardingCompletedAt ||
      row?.seller_onboarding_submitted_at ||
      row?.seller_onboarding_completed_at ||
      listing?.sellerOnboarding?.submittedAt ||
      listing?.sellerOnboarding?.completedAt ||
      listing?.sellerOnboardingSubmittedAt ||
      listing?.sellerOnboardingCompletedAt ||
      listing?.seller_onboarding_submitted_at ||
      listing?.seller_onboarding_completed_at,
  )
  if (hasCompletionTimestamp) return 'completed'

  if (journey?.onboardingSent) return 'sent'

  const sentStatus = statuses.find((status) => sellerOnboardingHasStarted(status))
  if (sentStatus) return sentStatus

  if (getSellerOnboardingToken(row, listing)) return 'sent'

  return statuses[0] || ''
}

function getSellerOnboardingToken(row = {}, listing = null) {
  return normalizeText(
    row?.sellerOnboardingToken ||
      row?.seller_onboarding_token ||
      row?.sellerOnboarding?.token ||
      listing?.sellerOnboarding?.token ||
      listing?.sellerOnboardingToken ||
      listing?.seller_onboarding_token,
  )
}

function getSellerPortalLink(row = {}, listing = null) {
  const token = getSellerOnboardingToken(row, listing)
  const portalLink = buildSellerClientPortalLink(token)
  if (portalLink) return portalLink

  const directLink = normalizeText(
    row?.sellerOnboardingLink ||
      row?.seller_onboarding_link ||
      row?.sellerOnboarding?.link ||
      listing?.sellerOnboarding?.link ||
      listing?.sellerOnboardingLink ||
      listing?.seller_onboarding_link,
  )
  if (directLink.includes('/client/')) return directLink
  const onboardingToken = directLink.match(/\/seller\/onboarding\/([^/?#]+)/i)?.[1]
  if (onboardingToken) return buildSellerClientPortalLink(decodeURIComponent(onboardingToken))
  if (directLink) return directLink
  return ''
}

function sellerOnboardingIsSubmitted(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  return ['submitted', 'completed', 'complete', 'under_review', 'onboarding_completed', 'seller_onboarding_completed', 'seller_onboarding_submitted'].includes(normalized)
}

function sellerOnboardingHasStarted(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  return sellerOnboardingIsSubmitted(normalized) || ['sent', 'in_progress', 'started', 'opened', 'active', 'available', 'onboarding_sent', 'seller_onboarding_sent'].includes(normalized)
}

function sellerOnboardingActionLabel(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (sellerOnboardingIsSubmitted(normalized)) return 'Seller Onboarding Submitted'
  if (['sent', 'in_progress', 'started'].includes(normalized)) return 'Resend Seller Onboarding'
  return 'Send Seller Onboarding'
}

function getSellerOnboardingActionMeta(status = '', row = {}, listing = null, journey = null) {
  const normalized = normalizeText(status).toLowerCase()
  const hasToken = Boolean(getSellerOnboardingToken(row, listing))
  if (sellerOnboardingIsSubmitted(normalized)) {
    return {
      label: 'Onboarding Submitted',
      tone: 'success',
      disabled: true,
      icon: CheckCircle2,
      help: 'Seller details have been submitted.',
    }
  }
  if (hasToken || sellerOnboardingHasStarted(normalized) || journey?.onboardingSent) {
    return {
      label: hasToken ? 'Resend Onboarding Link' : 'Refresh Onboarding Link',
      tone: 'sent',
      disabled: false,
      icon: Mail,
      help: hasToken ? 'Send the current seller portal link again.' : 'Refresh the seller onboarding link for this lead.',
    }
  }
  return {
    label: 'Send Onboarding Link',
    tone: 'default',
    disabled: false,
    icon: Mail,
    help: 'Send the seller intake link.',
  }
}

function getSellerListingId(row = {}, listing = null) {
  return normalizeText(listing?.id || listing?.listingId || listing?.listing_id || row?.listingId || row?.listing_id || row?.privateListingId || row?.private_listing_id)
}

function getSellerListingMeta(row = {}, listing = null, journey = null) {
  const listingId = getSellerListingId(row, listing)
  const hasListing = Boolean(journey?.listingCreated || listingId)
  if (journey?.listingLive) return { label: 'Live', tone: 'green', actionLabel: 'Open Listing', hasListing }
  if (hasListing) return { label: 'Draft', tone: 'amber', actionLabel: 'Open Listing', hasListing }
  return { label: 'Not Created', tone: 'slate', actionLabel: 'Create Listing', hasListing: false }
}

function getSellerMandateStatus(row = {}, listing = null, journey = null) {
  return normalizeText(
    journey?.mandateStatus ||
      row?.mandateStatus ||
      row?.mandate_status ||
      listing?.mandateStatus ||
      listing?.mandate_status,
  ).toLowerCase() || 'not_started'
}

function sellerMandateHasRecord(row = {}, listing = null, journey = null) {
  const status = getSellerMandateStatus(row, listing, journey)
  return Boolean(
    (status && status !== 'not_started') ||
      row?.mandatePacketId ||
      row?.mandate_packet_id ||
      listing?.mandatePacketId ||
      listing?.mandate_packet_id ||
      listing?.mandatePacket?.id,
  )
}

function getSellerMandateMeta(row = {}, listing = null, journey = null) {
  const status = getSellerMandateStatus(row, listing, journey)
  const hasRecord = sellerMandateHasRecord(row, listing, journey)
  if (status === 'signed' || status === 'completed' || status === 'fully_signed') {
    return { label: 'Signed', actionLabel: 'View Signed Mandate', tone: 'green', hasRecord: true, mode: 'signed' }
  }
  if (hasRecord) {
    return { label: formatSellerJourneyValue({ value: status }).replace(/_/g, ' ') || 'Generated', actionLabel: 'View Mandate', tone: 'blue', hasRecord: true, mode: 'view' }
  }
  return { label: 'Not Generated', actionLabel: 'Generate Mandate', tone: 'slate', hasRecord: false, mode: 'generate' }
}

function getSellerPropertySummary(row = {}, listing = null) {
  const formData = readSellerOnboardingFormData(listing || {}, row || {})
  const propertyDetails = isPlainObject(listing?.propertyDetails)
    ? listing.propertyDetails
    : isPlainObject(row?.propertyDetails)
      ? row.propertyDetails
      : {}
  const address = normalizeText(
    formData?.propertyAddress ||
      formData?.propertyAddressLine1 ||
      propertyDetails?.propertyAddress ||
      propertyDetails?.address ||
      propertyDetails?.addressLine1 ||
      listing?.propertyAddress ||
      listing?.property_address ||
      listing?.address ||
      listing?.addressLine1 ||
      listing?.address_line_1 ||
      row?.sellerPropertyAddress ||
      row?.seller_property_address ||
      row?.propertyInterest ||
      row?.property_interest ||
      row?.areaInterest ||
      row?.area_interest,
  )
  const suburb = normalizeText(formData?.suburb || propertyDetails?.suburb || listing?.suburb || row?.suburb || row?.areaInterest || row?.area_interest)
  const city = normalizeText(formData?.city || propertyDetails?.city || listing?.city || row?.city)
  const lowerAddress = address.toLowerCase()
  const addressParts = [address]
  if (suburb && !lowerAddress.includes(suburb.toLowerCase())) addressParts.push(suburb)
  if (city && !lowerAddress.includes(city.toLowerCase())) addressParts.push(city)
  return {
    address: addressParts.filter(Boolean).join(', ') || 'Property address pending',
    propertyType: normalizeText(formData?.propertyType || propertyDetails?.propertyType || propertyDetails?.property_type || listing?.propertyType || listing?.property_type || row?.propertyType || row?.property_type) || 'Property type pending',
    estimatedValue: Number(formData?.askingPrice || propertyDetails?.price || propertyDetails?.askingPrice || propertyDetails?.asking_price || listing?.estimatedValue || listing?.estimated_value || listing?.askingPrice || listing?.asking_price || row?.estimatedValue || row?.estimated_value || row?.budget || 0) || 0,
    bedrooms: normalizeText(formData?.bedrooms || propertyDetails?.bedrooms || listing?.bedrooms || listing?.propertyDetails?.bedrooms || row?.bedrooms),
    bathrooms: normalizeText(formData?.bathrooms || propertyDetails?.bathrooms || listing?.bathrooms || listing?.propertyDetails?.bathrooms || row?.bathrooms),
    erfSize: normalizeText(formData?.erfSize || propertyDetails?.erfSize || propertyDetails?.erf_size || listing?.erfSize || listing?.erf_size || listing?.propertyDetails?.erfSize || row?.erfSize || row?.erf_size),
    description: normalizeText(formData?.propertyDescription || formData?.propertyNotes || formData?.description || propertyDetails?.description || propertyDetails?.notes || listing?.marketing?.description || listing?.description || listing?.propertyDescription || listing?.property_description || row?.notes),
  }
}

function getSellerListingImageUrl(listing = null) {
  const gallery = [
    ...(Array.isArray(listing?.galleryImages) ? listing.galleryImages : []),
    ...(Array.isArray(listing?.gallery_images) ? listing.gallery_images : []),
    ...(Array.isArray(listing?.images) ? listing.images : []),
    ...(Array.isArray(listing?.photos) ? listing.photos : []),
    ...(Array.isArray(listing?.media) ? listing.media : []),
  ]
  const media = gallery.find((item) => normalizeText(item?.url || item?.imageUrl || item?.src || item))
  return normalizeText(
    listing?.coverImage?.url ||
      listing?.cover_image?.url ||
      listing?.imageUrl ||
      listing?.image_url ||
      listing?.thumbnailUrl ||
      listing?.thumbnail_url ||
      media?.url ||
      media?.imageUrl ||
      media?.src ||
      media,
  )
}

function getSellerLeadAge(journey = null) {
  return Math.max(0, Number(journey?.kpis?.find((item) => item.key === 'lead_age')?.value || 0))
}

function getSellerTimelineItems(timeline = [], limit = 5) {
  return (Array.isArray(timeline) ? timeline : []).slice(0, limit).map((item, index) => {
    const title = normalizeText(item.title || item.activityType || item.activity_type || item.type) || 'Lead Updated'
    const description = normalizeText(item.description || item.activityNote || item.activity_note || item.outcome) || 'Seller workflow activity'
    const timestamp = item.timestamp || item.activityDate || item.activity_date || item.createdAt || item.created_at
    return {
      key: item.id || item.activityId || `${title}-${timestamp}-${index}`,
      title,
      description,
      timestamp,
      actor: normalizeText(item.actorName || item.agentName || item.agent?.name || item.createdByName || item.created_by_name) || 'Bridge',
    }
  })
}

function getSellerActivityTimestamp(item = {}) {
  return item.timestamp || item.activityDate || item.activity_date || item.createdAt || item.created_at || item.updatedAt || item.updated_at || ''
}

function getSellerActivityActor(item = {}) {
  return normalizeText(
    item.actorName ||
      item.agentName ||
      item.agent?.name ||
      item.createdByName ||
      item.created_by_name ||
      item.createdBy ||
      item.created_by,
  ) || 'Bridge'
}

function getInitials(value = '') {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'BR'
}

function getSellerActivityCategory(item = {}) {
  const source = normalizeText([
    item.title,
    item.activityType,
    item.activity_type,
    item.type,
    item.description,
    item.activityNote,
    item.activity_note,
    item.outcome,
  ].filter(Boolean).join(' ')).toLowerCase()
  if (/call|email|whatsapp|sms|message|note|contact|communication|phone/.test(source)) return 'communication'
  if (/document|upload|proof|rates|title deed|id |fica|mandate pdf|photo|image/.test(source)) return 'documents'
  if (/mandate|signature|signing|signed/.test(source)) return 'mandate'
  if (/appointment|valuation|viewing|consultation|meeting|calendar/.test(source)) return 'appointments'
  return 'system'
}

function getSellerActivityTone(item = {}) {
  const source = normalizeText([
    item.title,
    item.activityType,
    item.activity_type,
    item.type,
    item.description,
    item.activityNote,
    item.activity_note,
    item.outcome,
    item.status,
  ].filter(Boolean).join(' ')).toLowerCase()
  if (/failed|failure|declined|rejected|cancelled|canceled|lost|error/.test(source)) return 'risk'
  if (/missing|outstanding|overdue|expir|pending|no activity|required/.test(source)) return 'attention'
  if (/signed|submitted|completed|complete|published|live|approved|accepted|uploaded/.test(source)) return 'success'
  return 'workflow'
}

function getSellerActivityIcon(category = 'system', tone = 'workflow') {
  if (tone === 'success') return CheckCircle2
  if (category === 'communication') return Mail
  if (category === 'documents' || category === 'mandate') return FileText
  if (category === 'appointments') return CalendarDays
  if (category === 'system') return Home
  return Clock3
}

function normalizeSellerActivityEvent(item = {}, index = 0) {
  const title = normalizeText(item.title || item.activityType || item.activity_type || item.type) || 'Lead Updated'
  const description = normalizeText(item.description || item.activityNote || item.activity_note || item.outcome) || 'Seller workflow activity'
  const timestamp = getSellerActivityTimestamp(item)
  const category = getSellerActivityCategory({ ...item, title, description })
  const tone = getSellerActivityTone({ ...item, title, description })
  const actor = getSellerActivityActor(item)
  return {
    raw: item,
    key: item.id || item.activityId || item.activity_id || `${title}-${timestamp || 'undated'}-${index}`,
    title,
    description,
    timestamp,
    actor,
    category,
    tone,
    sourceType: normalizeText(item.activityType || item.activity_type || item.type || category),
  }
}

function dedupeSellerActivityEvents(events = []) {
  const windowMs = 10 * 60 * 1000
  const grouped = new Map()
  for (const event of events) {
    const date = readDate(event.timestamp)
    const bucket = date ? Math.floor(date.getTime() / windowMs) : 'undated'
    const key = [
      normalizeText(event.title).toLowerCase(),
      normalizeText(event.description).toLowerCase(),
      normalizeText(event.actor).toLowerCase(),
      event.category,
      bucket,
    ].join('|')
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, { ...event, count: 1, originals: [event] })
      continue
    }
    const existingDate = readDate(existing.timestamp)
    const nextDate = readDate(event.timestamp)
    const preferred = nextDate && (!existingDate || nextDate.getTime() > existingDate.getTime()) ? event : existing
    grouped.set(key, {
      ...preferred,
      count: existing.count + 1,
      originals: [...existing.originals, event],
    })
  }
  return Array.from(grouped.values())
}

function getSellerMilestones({ row = {}, listing = null, journey = null } = {}) {
  const mandateStatus = getSellerMandateStatus(row, listing, journey)
  const onboardingSubmitted = sellerOnboardingIsSubmitted(getSellerOnboardingStatus(row, listing, journey))
  const hasMandate = sellerMandateHasRecord(row, listing, journey)
  return [
    {
      key: 'lead_created',
      label: 'Lead Created',
      complete: true,
      date: row.createdAt || row.created_at,
    },
    {
      key: 'onboarding_submitted',
      label: 'Seller Onboarding Submitted',
      complete: onboardingSubmitted,
      date: listing?.sellerOnboarding?.submittedAt || listing?.sellerOnboarding?.completedAt || listing?.seller_onboarding?.submitted_at || row.sellerOnboardingSubmittedAt || row.seller_onboarding_submitted_at,
    },
    {
      key: 'mandate_generated',
      label: 'Mandate Generated',
      complete: hasMandate,
      date: row.mandateSentAt || row.mandate_sent_at || listing?.mandate?.updatedAt || listing?.updatedAt || listing?.updated_at,
    },
    {
      key: 'mandate_signed',
      label: 'Mandate Signed',
      complete: ['signed', 'completed', 'fully_signed'].includes(mandateStatus),
      date: row.mandateSignedAt || row.mandate_signed_at || listing?.mandateSignedAt || listing?.mandate_signed_at || listing?.mandate?.signedAt,
    },
    {
      key: 'listing_created',
      label: 'Listing Created',
      complete: Boolean(journey?.listingCreated),
      date: listing?.createdAt || listing?.created_at || row.listingCreatedAt || row.listing_created_at,
    },
    {
      key: 'listing_live',
      label: 'Listing Live',
      complete: Boolean(journey?.listingLive),
      date: listing?.publishedAt || listing?.published_at || listing?.activatedAt || listing?.activated_at,
    },
  ]
}

function buildSellerTimelineSummary({ row = {}, listing = null, journey = null, readiness = null } = {}) {
  const documents = journey?.documents || []
  const incompleteDocuments = documents.filter((document) => getSellerDocumentCompletion([document]).percent < 100)
  const onboardingStatus = getSellerOnboardingStatus(row, listing, journey)
  const mandateMeta = getSellerMandateMeta(row, listing, journey)
  const leadStatus = journey?.listingLive
    ? 'Listing is live.'
    : journey?.listingCreated
      ? 'Listing draft has been created.'
      : mandateMeta.mode === 'signed'
        ? 'Mandate has been signed.'
        : mandateMeta.hasRecord
          ? 'Mandate has been generated.'
          : sellerOnboardingIsSubmitted(onboardingStatus)
            ? 'Seller onboarding completed.'
            : sellerOnboardingHasStarted(onboardingStatus) || getSellerOnboardingToken(row, listing)
              ? 'Seller onboarding has been sent.'
              : 'Seller lead is active.'
  const next = incompleteDocuments.length
    ? `Waiting for ${incompleteDocuments.slice(0, 2).map((item) => item.label).join(' and ')} before publication.`
    : readiness?.nextAction?.label
      ? readiness.nextAction.label
      : journey?.listingLive
        ? 'Monitor listing activity and offers.'
        : 'Review the next seller workflow step.'
  return { leadStatus, next }
}

function getSellerActivityInsights(events = [], readiness = null) {
  const now = new Date()
  const last7Days = events.filter((event) => {
    const date = readDate(event.timestamp)
    if (!date) return false
    return now.getTime() - date.getTime() <= 7 * 86_400_000
  }).length
  return {
    total: events.length,
    last7Days,
    documents: events.filter((event) => event.category === 'documents').length,
    appointments: events.filter((event) => event.category === 'appointments').length,
    pendingActions: readiness?.blockers?.length || events.filter((event) => event.tone === 'attention' || event.tone === 'risk').length,
  }
}

function getSellerNextBestActionMeta({ row = {}, listing = null, journey = null, readiness = null, onboardingStatus = '' } = {}) {
  const blocker = readiness?.blockers?.find((item) => item.severity === 'blocked') || readiness?.blockers?.[0] || readiness?.nextAction?.blocker || null
  const nextAction = readiness?.nextAction || journey?.nextRecommendedAction || null
  const onboardingSent = Boolean(journey?.onboardingSent) || sellerOnboardingHasStarted(onboardingStatus) || Boolean(getSellerOnboardingToken(row, listing))
  if (!sellerOnboardingIsSubmitted(onboardingStatus) && !onboardingSent) {
    return {
      title: 'Seller onboarding pending',
      copy: 'The seller still needs their portal intake link before the listing pack can move forward.',
      missing: ['Seller onboarding link'],
      actionLabel: 'Send Onboarding Link',
      actionId: 'send_onboarding',
      tone: 'amber',
    }
  }
  if (blocker) {
    return {
      title: blocker.category === 'listing_live' ? 'Listing cannot go live' : blocker.label,
      copy: blocker.category === 'listing_live' ? 'Required to go live:' : 'Blocking this acquisition:',
      missing: readiness?.blockers?.filter((item) => item.category === blocker.category).map((item) => item.label).slice(0, 4) || [blocker.label],
      actionLabel: nextAction?.label || 'Resolve Blocker',
      actionId: nextAction?.id || blocker.actionId || 'review',
      tone: blocker.severity === 'action_required' ? 'blue' : 'amber',
    }
  }
  if (journey?.listingLive) {
    return {
      title: 'Listing is live',
      copy: 'This seller acquisition has converted into an active listing.',
      missing: [],
      actionLabel: 'Open Listing',
      actionId: 'open_listing',
      tone: 'green',
    }
  }
  return {
    title: 'Ready for the next step',
    copy: 'No major blockers are visible from the current seller journey data.',
    missing: [],
    actionLabel: nextAction?.label || 'Open Listing',
    actionId: nextAction?.id || 'open_listing',
    tone: 'green',
  }
}

function getSellerJourneyStepDate(row = {}, listing = null, journey = null, step = {}) {
  if (!step.completed && !step.current) return ''
  if (step.key === 'contacted') return row?.firstContactedAt || row?.first_contacted_at || row?.createdAt || row?.created_at
  if (step.key === 'seller_onboarding_sent') {
    return listing?.sellerOnboarding?.sentAt ||
      listing?.sellerOnboarding?.sent_at ||
      listing?.sellerOnboarding?.createdAt ||
      listing?.sellerOnboarding?.created_at ||
      row?.updatedAt ||
      row?.updated_at
  }
  if (step.key === 'seller_onboarding_submitted') {
    return listing?.sellerOnboarding?.submittedAt ||
      listing?.sellerOnboarding?.submitted_at ||
      listing?.sellerOnboarding?.completedAt ||
      listing?.sellerOnboarding?.completed_at ||
      row?.updatedAt ||
      row?.updated_at
  }
  if (step.key === 'mandate_sent') {
    return journey?.mandatePacketStatus?.sentAt ||
      journey?.mandatePacketStatus?.sent_at ||
      row?.mandateSentAt ||
      row?.mandate_sent_at ||
      listing?.updatedAt ||
      listing?.updated_at
  }
  if (step.key === 'mandate_signed') {
    return journey?.mandatePacketStatus?.signedAt ||
      journey?.mandatePacketStatus?.signed_at ||
      row?.mandateSignedAt ||
      row?.mandate_signed_at ||
      listing?.updatedAt ||
      listing?.updated_at
  }
  if (step.key === 'listing_created') return listing?.createdAt || listing?.created_at || row?.listingCreatedAt || row?.listing_created_at || listing?.updatedAt || listing?.updated_at
  if (step.key === 'listing_live') return listing?.publishedAt || listing?.published_at || listing?.activatedAt || listing?.activated_at || listing?.updatedAt || listing?.updated_at
  if (step.key === 'documents_submitted') {
    const documents = Array.isArray(journey?.documents) ? journey.documents : []
    const timestamps = documents
      .map((document) => document?.original?.document?.uploaded_at || document?.original?.document?.uploadedAt || document?.original?.uploaded_at || document?.original?.uploadedAt)
      .filter(Boolean)
      .sort()
    return timestamps[timestamps.length - 1] || listing?.updatedAt || listing?.updated_at
  }
  return journey?.currentStageStartedAt || row?.updatedAt || row?.updated_at
}

function buildSellerOnboardingEmailPayload({ row = {}, listing = null, onboarding = {}, organisationId = '', actor = {}, workspaceName = '', emailKind = 'onboarding', portalLink = '' } = {}) {
  const propertyTitle = normalizeText(
    row?.sellerPropertyAddress ||
      row?.seller_property_address ||
      listing?.propertyAddress ||
      listing?.address ||
      listing?.addressLine1 ||
      listing?.title ||
      listing?.propertyTitle ||
      row?.propertyInterest ||
      row?.property_interest ||
      row?.areaInterest ||
      row?.area_interest ||
      'your property',
  )
  const normalizedEmailKind = normalizeText(emailKind) || 'onboarding'
  const normalizedPortalLink = normalizeText(portalLink || onboarding?.portalLink || onboarding?.clientPortalLink)
  const normalizedOnboardingLink = normalizeText(onboarding?.link)
  return {
    type: normalizedEmailKind === 'portal_documents' ? 'seller_portal_link' : 'seller_onboarding_link',
    emailKind: normalizedEmailKind,
    to: normalizeText(row.email || row.contact?.email).toLowerCase(),
    organisationId: normalizeText(organisationId),
    sellerName: normalizeText(row.name || row.contact?.name || 'Seller'),
    propertyTitle,
    propertyType: normalizeText(row?.propertyType || row?.property_type || listing?.propertyType || listing?.property_type),
    onboardingLink: normalizedEmailKind === 'portal_documents' ? normalizedPortalLink : normalizedOnboardingLink,
    portalLink: normalizedPortalLink,
    transactionReference: getLeadDisplayReference(row),
    agentName: normalizeText(row.assignedAgentName || actor.fullName || actor.name || actor.email),
    organisationName: normalizeText(workspaceName),
    supportEmail: normalizeText(actor.email),
  }
}

function SellerActionsPanel({
  journey = null,
  readiness = null,
  onboardingStatus = '',
  sendingOnboarding = false,
  sellerActionError = '',
  sellerActionMessage = '',
  onSendSellerOnboarding,
  onGenerateMandate,
  onOpenListing,
  onOpenTimeline,
}) {
  const actions = readiness?.actions?.length ? readiness.actions : journey?.actions || []
  const onboardingSubmitted = sellerOnboardingIsSubmitted(onboardingStatus)
  const mandateDisabled = !onboardingSubmitted
  const mandateReason = mandateDisabled
    ? 'Seller onboarding must be submitted before generating a mandate.'
    : 'Open the mandate workspace to generate, edit, or send the mandate.'
  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Seller Actions</h2>
          <p className="mt-1 text-sm text-slate-500">Seller onboarding must be submitted before a mandate can be generated.</p>
        </div>
        <StatusPill tone={onboardingSubmitted ? 'green' : onboardingStatus === 'sent' ? 'amber' : 'slate'}>{normalizeText(onboardingStatus) || 'not started'}</StatusPill>
      </div>
      {sellerActionError ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{sellerActionError}</p> : null}
      {sellerActionMessage ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{sellerActionMessage}</p> : null}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          disabled={sendingOnboarding}
          onClick={() => onSendSellerOnboarding?.()}
          className="rounded-2xl border border-slate-900 bg-slate-900 p-4 text-left text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="block text-sm font-semibold">{sendingOnboarding ? 'Sending Seller Onboarding...' : sellerOnboardingActionLabel(onboardingStatus)}</span>
          <span className="mt-1 block text-xs font-medium text-slate-200">Create or reuse the seller listing intake and send the onboarding link.</span>
        </button>
        <button
          type="button"
          disabled={mandateDisabled}
          onClick={() => onGenerateMandate?.()}
          className={`rounded-2xl border p-4 text-left ${mandateDisabled ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-blue-200 bg-blue-50 text-blue-800'} disabled:cursor-not-allowed`}
        >
          <span className="block text-sm font-semibold">Generate Mandate</span>
          <span className={`mt-1 block text-xs font-medium ${mandateDisabled ? 'text-slate-400' : 'text-blue-700'}`}>{mandateReason}</span>
        </button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {actions.length ? actions.map((action) => {
          const canOpenListing = ['create_listing', 'open_listing', 'complete_listing', 'activate_listing'].includes(action.id)
          const canOpenTimeline = action.id === 'open_timeline' || action.id === 'contact_seller'
          return (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                if (canOpenListing) onOpenListing?.()
                else if (canOpenTimeline) onOpenTimeline?.()
              }}
              className={`rounded-2xl border p-4 text-left ${action.primary ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="block text-sm font-semibold">{action.label}</span>
              <span className={`mt-1 block text-xs font-medium ${action.primary ? 'text-slate-200' : 'text-slate-500'}`}>{action.reason || (action.primary ? 'Recommended next step' : 'Seller workflow action')}</span>
            </button>
          )
        }) : <EmptyState title="No seller actions" copy="Seller actions will appear when the journey service can derive the next step." />}
      </div>
    </section>
  )
}

function getSellerDocumentCompletion(documents = []) {
  const rows = Array.isArray(documents) ? documents : []
  const applicableRequiredRows = rows.filter((document) => document?.required !== false && document?.applicable !== false)
  if (!applicableRequiredRows.length) return { complete: 0, total: 0, percent: 0 }
  const complete = applicableRequiredRows.filter((document) => {
    const status = normalizeDocumentStatus(document.status || document.documentStatus || document.document_status)
    return status === 'approved' || status === 'completed'
  }).length
  return {
    complete,
    total: applicableRequiredRows.length,
    percent: Math.round((complete / applicableRequiredRows.length) * 100),
  }
}

function getSellerDocumentDisplayStatus(document = {}) {
  return getDocumentStatusLabel(document.status || document.documentStatus || document.document_status)
}

const SELLER_DOCUMENT_CENTER_TABS = [
  { key: 'property', label: 'Property Documents' },
  { key: 'fica', label: 'FICA Documents' },
  { key: 'additional', label: 'Additional Requests' },
]

function getSellerDocumentCategoryLabel(category = '') {
  const normalized = normalizeText(category).toLowerCase()
  if (normalized === 'property') return 'Property'
  if (normalized === 'fica') return 'FICA'
  if (normalized === 'additional') return 'Additional'
  return 'Document'
}

function getSellerDocumentCategoryTone(category = '') {
  const normalized = normalizeText(category).toLowerCase()
  if (normalized === 'property') return 'bg-blue-50 text-blue-700'
  if (normalized === 'fica') return 'bg-emerald-50 text-emerald-700'
  if (normalized === 'additional') return 'bg-violet-50 text-violet-700'
  return 'bg-slate-100 text-slate-700'
}

function getSellerDocumentFilterBucket(document = {}) {
  const status = normalizeDocumentStatus(document.status || document.documentStatus || document.document_status)
  if (status === 'approved' || status === 'completed') return 'approved'
  if (status === 'rejected') return 'rejected'
  if (status === 'under_review') return 'under_review'
  if (status === 'uploaded') return 'uploaded'
  return 'outstanding'
}

function getSellerDocumentStatusSummary(documents = []) {
  const rows = (Array.isArray(documents) ? documents : []).filter((document) => document?.required !== false && document?.applicable !== false)
  return rows.reduce((summary, document) => {
    const bucket = getSellerDocumentFilterBucket(document)
    summary.total += 1
    if (bucket === 'approved') summary.approved += 1
    else if (bucket === 'uploaded') summary.uploaded += 1
    else if (bucket === 'under_review') summary.underReview += 1
    else if (bucket === 'rejected') summary.rejected += 1
    else summary.outstanding += 1
    return summary
  }, {
    total: 0,
    outstanding: 0,
    uploaded: 0,
    underReview: 0,
    approved: 0,
    rejected: 0,
  })
}

function getSellerDocumentCountForTab(documents = [], tabKey = 'all') {
  const rows = (Array.isArray(documents) ? documents : []).filter((document) => document?.required !== false && document?.applicable !== false)
  return rows.filter((document) => normalizeText(document.category).toLowerCase() === tabKey).length
}

function getSellerDocumentCategoryFromRequirement(requirement = {}) {
  const group = normalizeText(requirement?.requirement_group || requirement?.group || requirement?.category).toLowerCase()
  if (group === 'property' || group === 'occupancy' || group === 'financial') return 'property'
  if (['seller_identity', 'marital', 'fica', 'compliance', 'property_compliance', 'company', 'trust', 'deceased_estate', 'power_of_attorney'].includes(group)) return 'fica'
  return 'additional'
}

function getSellerRequirementDocumentKey(requirement = {}) {
  return normalizeText(
    requirement?.requirement_key ||
      requirement?.requirementKey ||
      requirement?.key ||
      requirement?.canonical_requirement_instance_id ||
      requirement?.id ||
      requirement?.requirement_name ||
      requirement?.label,
  ).toLowerCase()
}

function findSellerUploadedDocumentForRequirement(requirement = {}, documents = []) {
  const requirementId = normalizeText(requirement?.id)
  const canonicalRequirementId = normalizeText(requirement?.canonical_requirement_instance_id || requirement?.canonicalRequirementInstanceId)
  const requirementKey = getSellerRequirementDocumentKey(requirement)
  return (Array.isArray(documents) ? documents : []).find((document) => {
    const documentRequirementId = normalizeText(document?.requirement_id || document?.requirementId)
    const documentCanonicalId = normalizeText(document?.canonical_requirement_instance_id || document?.canonicalRequirementInstanceId)
    const documentType = normalizeText(document?.document_type || document?.documentType || document?.category).toLowerCase()
    const documentName = normalizeText(document?.document_name || document?.documentName || document?.fileName || document?.file_name).toLowerCase()
    return (
      (requirementId && documentRequirementId === requirementId) ||
      (canonicalRequirementId && documentCanonicalId === canonicalRequirementId) ||
      (requirementKey && (documentType === requirementKey || documentName.includes(requirementKey.replace(/_/g, ' '))))
    )
  }) || null
}

function buildSellerDocumentRowsFromListing(listing = null, row = {}) {
  const requirements = Array.isArray(listing?.documentRequirements)
    ? listing.documentRequirements
    : Array.isArray(row?.documentRequirements)
      ? row.documentRequirements
      : []
  const documents = Array.isArray(listing?.documents)
    ? listing.documents
    : Array.isArray(row?.documents)
      ? row.documents
      : []

  return requirements.map((requirement) => {
    const uploadedDocument = findSellerUploadedDocumentForRequirement(requirement, documents)
    const label = normalizeText(requirement?.requirement_name || requirement?.requirementName || requirement?.label || requirement?.name || requirement?.requirement_key || requirement?.key)
    const uploadedUrl = normalizeText(uploadedDocument?.url || uploadedDocument?.fileUrl || uploadedDocument?.file_url || uploadedDocument?.signedUrl || uploadedDocument?.signed_url)
    const uploadedName = normalizeText(uploadedDocument?.fileName || uploadedDocument?.file_name || uploadedDocument?.document_name || uploadedDocument?.documentName)
    return {
      id: normalizeText(requirement?.id || requirement?.canonical_requirement_instance_id || requirement?.requirement_key || label),
      key: getSellerRequirementDocumentKey(requirement),
      title: label,
      label,
      description: normalizeText(requirement?.requirement_description || requirement?.description),
      whyNeeded: normalizeText(requirement?.whyNeeded || requirement?.why_needed),
      category: getSellerDocumentCategoryFromRequirement(requirement),
      status: uploadedDocument ? normalizeText(uploadedDocument?.status || 'uploaded') || 'uploaded' : normalizeText(requirement?.status || 'required') || 'required',
      required: requirement?.is_required !== false,
      applicable: requirement?.applicable !== false,
      url: uploadedUrl,
      uploadedFileName: uploadedName,
      uploadedAt: uploadedDocument?.uploadedAt || uploadedDocument?.uploaded_at || uploadedDocument?.createdAt || uploadedDocument?.created_at || null,
      uploadedBy: uploadedDocument?.uploadedBy || uploadedDocument?.uploaded_by || '',
      original: {
        requirement,
        document: uploadedDocument,
      },
    }
  }).filter((document) => document.id || document.key || document.label)
}

function mergeSellerDocumentRows(primaryRows = [], fallbackRows = []) {
  const merged = new Map()
  for (const document of [...fallbackRows, ...primaryRows]) {
    const key = normalizeText(document?.key || document?.id || document?.title || document?.label).toLowerCase()
    if (!key) continue
    const previous = merged.get(key)
    if (!previous) {
      merged.set(key, document)
      continue
    }
    const previousHasUrl = Boolean(previous.url || previous.documentUrl || previous.document_url)
    const nextHasUrl = Boolean(document.url || document.documentUrl || document.document_url)
    merged.set(key, {
      ...previous,
      ...document,
      url: nextHasUrl ? (document.url || document.documentUrl || document.document_url) : previous.url,
      uploadedFileName: document.uploadedFileName || previous.uploadedFileName,
      uploadedAt: document.uploadedAt || previous.uploadedAt,
      status: nextHasUrl && !previousHasUrl ? document.status : (document.status || previous.status),
    })
  }
  return Array.from(merged.values())
}

function SellerWorkspaceCard({ title, action, children, className = '', id = '', density = 'regular' }) {
  const densityClasses = density === 'compact'
    ? 'p-4 min-h-[200px]'
    : 'p-5 min-h-[220px]'
  return (
    <section id={id || undefined} className={`${panelClass} flex h-full flex-col ${densityClasses} ${className}`}>
      <div className="flex min-h-8 items-start justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">{title}</h2>
        {action}
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

function SellerInfoRow({ label, value }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-semibold text-slate-900">{value || '—'}</dd>
    </div>
  )
}

function SellerAvatar({ name = '' }) {
  const initials = normalizeText(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'SL'
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-lg font-semibold text-white">
      {initials}
    </div>
  )
}

function SellerLeadStatusChips({ row, journey, readiness, listing = null, onAction }) {
  const listingMeta = getSellerListingMeta(row, listing, journey)
  const mandateMeta = getSellerMandateMeta(row, listing, journey)
  const chips = [
    { label: 'Assigned Agent', value: getOwnerName(row) || 'Unassigned', tone: getOwnerName(row) === 'Unassigned' ? 'slate' : 'blue', actionId: 'assign_agent' },
    { label: 'Current Stage', value: journey?.stage?.label || row.stage || 'Contacted', tone: 'blue', actionId: 'open_journey' },
    { label: 'Readiness', value: readiness?.readinessLabel || 'Review', tone: readiness?.missingItems?.length ? 'amber' : 'green', actionId: 'open_readiness' },
    { label: 'Listing', value: listingMeta.label, tone: listingMeta.tone, actionId: listingMeta.hasListing ? 'open_listing' : 'create_listing' },
    { label: 'Mandate', value: mandateMeta.label, tone: mandateMeta.tone, actionId: mandateMeta.hasRecord ? 'view_mandate' : 'generate_mandate' },
  ]

  const toneClasses = {
    green: 'border-emerald-100 bg-emerald-50/80 text-emerald-800',
    amber: 'border-amber-100 bg-amber-50/80 text-amber-800',
    blue: 'border-blue-100 bg-blue-50/80 text-blue-800',
    slate: 'border-slate-200 bg-slate-50/90 text-slate-700',
  }

  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-5" role="list" aria-label="Seller lead status shortcuts">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={() => onAction?.(chip.actionId)}
          className={`min-w-0 rounded-2xl border px-3 py-2 text-left shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)] focus:outline-none focus:ring-2 focus:ring-blue-200 ${toneClasses[chip.tone] || toneClasses.slate}`}
          title={`Open ${chip.label.toLowerCase()} action`}
        >
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">{chip.label}</span>
          <span className="mt-1 block truncate text-sm font-semibold capitalize">{chip.value || 'Not Set'}</span>
        </button>
      ))}
    </div>
  )
}

function SellerLeadActions({
  row,
  journey,
  listing = null,
  onboardingStatus = '',
  sendingOnboarding = false,
  sendingPortalLink = false,
  onSendSellerOnboarding,
  onResendSellerPortalLink,
  onGenerateMandate,
  onOpenListing,
  onOpenAppointments,
  onCopySellerPortalLink,
  onCopyListingLink,
  onMarkAsLost,
  onArchiveLead,
  onStatusAction,
}) {
  const listingMeta = getSellerListingMeta(row, listing, journey)
  const mandateMeta = getSellerMandateMeta(row, listing, journey)
  const onboardingMeta = getSellerOnboardingActionMeta(onboardingStatus, row, listing, journey)
  const OnboardingIcon = onboardingMeta.icon || Mail
  const mandateRequiresOnboarding = !mandateMeta.hasRecord && !sellerOnboardingIsSubmitted(onboardingStatus)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const menuButtonClass = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'

  useEffect(() => {
    if (!menuOpen) return undefined

    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
  }, [])

  const closeMenuAndRun = useCallback((callback) => {
    closeMenu()
    callback?.()
  }, [closeMenu])

  return (
    <div className="flex items-center justify-start lg:justify-end">
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)] hover:bg-slate-800"
          aria-label="Seller actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          Actions
          <ChevronDown size={16} className={menuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
        {menuOpen ? (
        <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl" role="menu">
          <button type="button" onClick={() => closeMenuAndRun(onOpenListing)} className={menuButtonClass} role="menuitem">
            <Home size={15} />
            {listingMeta.actionLabel}
          </button>
          <button
            type="button"
            onClick={() => closeMenuAndRun(onSendSellerOnboarding)}
            disabled={sendingOnboarding || onboardingMeta.disabled}
            title={onboardingMeta.help}
            className={menuButtonClass}
            role="menuitem"
          >
            <OnboardingIcon size={15} />
            {sendingOnboarding ? 'Sending...' : onboardingMeta.label}
          </button>
          <button type="button" onClick={() => closeMenuAndRun(onResendSellerPortalLink)} disabled={sendingPortalLink} className={menuButtonClass} role="menuitem">
            <RefreshCw size={15} />
            {sendingPortalLink ? 'Resending...' : 'Resend Seller Portal Link'}
          </button>
          <button
            type="button"
            onClick={() => closeMenuAndRun(onGenerateMandate)}
            disabled={mandateRequiresOnboarding}
            title={mandateRequiresOnboarding ? 'Seller onboarding must be submitted before generating a mandate.' : mandateMeta.actionLabel}
            className={menuButtonClass}
            role="menuitem"
          >
            <FileText size={15} />
            {mandateMeta.actionLabel}
          </button>
          <button type="button" onClick={() => closeMenuAndRun(onOpenAppointments)} className={menuButtonClass} role="menuitem">
            <CalendarDays size={15} />
            Schedule Appointment
          </button>
          <div className="my-1 h-px bg-slate-100" />
          <button type="button" onClick={() => closeMenuAndRun(() => onStatusAction?.('edit_seller'))} className={menuButtonClass} role="menuitem">Edit seller details</button>
          <button type="button" onClick={() => closeMenuAndRun(() => onStatusAction?.('assign_agent'))} className={menuButtonClass} role="menuitem">Assign agent</button>
          {onboardingMeta.disabled ? (
            <button type="button" onClick={() => closeMenuAndRun(onSendSellerOnboarding)} disabled={sendingOnboarding} className={menuButtonClass} role="menuitem">
              Resend Onboarding Link
            </button>
          ) : null}
          <button type="button" onClick={() => closeMenuAndRun(onCopySellerPortalLink)} className={menuButtonClass} role="menuitem">Copy seller portal link</button>
          <button type="button" onClick={() => closeMenuAndRun(onCopyListingLink)} className={menuButtonClass} role="menuitem">Copy listing link</button>
          <div className="my-1 h-px bg-slate-100" />
          <button type="button" onClick={() => closeMenuAndRun(onMarkAsLost)} className={`${menuButtonClass} text-rose-600 hover:bg-rose-50`} role="menuitem">Mark as lost</button>
          <button type="button" onClick={() => closeMenuAndRun(onArchiveLead)} className={`${menuButtonClass} text-rose-600 hover:bg-rose-50`} role="menuitem">Archive lead</button>
        </div>
        ) : null}
      </div>
    </div>
  )
}

function SellerLeadHeader({
  row,
  journey,
  readiness,
  listing = null,
  onboardingStatus = '',
  sendingOnboarding = false,
  sendingPortalLink = false,
  onSendSellerOnboarding,
  onResendSellerPortalLink,
  onGenerateMandate,
  onOpenListing,
  onOpenAppointments,
  onCopySellerPortalLink,
  onCopyListingLink,
  onMarkAsLost,
  onArchiveLead,
  onStatusAction,
}) {
  const headerSource = getLeadSourceInfo(row).leadSource
  return (
    <header className={`${panelClass} overflow-visible border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.07)]`}>
      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.35fr)]">
        <div className="flex min-w-0 gap-4">
          <SellerAvatar name={row.name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Seller Lead</p>
              <StatusPill tone="green">Seller Lead</StatusPill>
            </div>
            <h1 className="mt-2 truncate text-3xl font-semibold tracking-[-0.045em] text-slate-950">{row.name || 'Unnamed seller'}</h1>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-slate-500">
              <span className="inline-flex min-w-0 items-center gap-1.5"><Phone size={14} />{row.phone || 'No phone'}</span>
              <span className="inline-flex min-w-0 items-center gap-1.5"><Mail size={14} /><span className="max-w-[280px] truncate">{row.email || 'No email'}</span></span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill>{headerSource || 'Unknown source'}</StatusPill>
              <StatusPill>{row.status || row.stage || 'Active'}</StatusPill>
              <StatusPill>{formatDate(row.createdAt, 'No created date')}</StatusPill>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <SellerLeadStatusChips row={row} journey={journey} readiness={readiness} listing={listing} onAction={onStatusAction} />
          <SellerLeadActions
            key={row?.leadId || 'seller-lead-actions'}
            row={row}
            journey={journey}
            listing={listing}
            onboardingStatus={onboardingStatus}
            sendingOnboarding={sendingOnboarding}
            sendingPortalLink={sendingPortalLink}
            onSendSellerOnboarding={onSendSellerOnboarding}
            onResendSellerPortalLink={onResendSellerPortalLink}
            onGenerateMandate={onGenerateMandate}
            onOpenListing={onOpenListing}
            onOpenAppointments={onOpenAppointments}
            onCopySellerPortalLink={onCopySellerPortalLink}
            onCopyListingLink={onCopyListingLink}
            onMarkAsLost={onMarkAsLost}
            onArchiveLead={onArchiveLead}
            onStatusAction={onStatusAction}
          />
        </div>
      </div>
    </header>
  )
}

function SellerJourneyRail({ journey = null, row = {}, listing = null }) {
  if (!journey) return <EmptyState title="Seller journey unavailable" copy="This seller lead could not be mapped to the existing seller journey service." />
  const stepCount = Math.max(Array.isArray(journey.steps) ? journey.steps.length : 0, 1)
  return (
    <section id="seller-journey" className={`${panelClass} scroll-mt-6 flex h-full min-h-[220px] flex-col p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">Seller Journey</h2>
          <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-slate-950">{journey.status?.summary || journey.stage?.label || 'Contacted'}</p>
        </div>
        <StatusPill tone={journey.listingLive ? 'green' : journey.listingCreated ? 'amber' : 'blue'}>{journey.stage?.status || journey.status?.status || 'Active'}</StatusPill>
      </div>
      <ol
        className="mt-7 grid min-w-0 grid-cols-2 gap-x-4 gap-y-6 px-1 sm:grid-cols-3 sm:px-2 lg:grid-cols-4 lg:px-3 xl:gap-x-3 xl:[grid-template-columns:repeat(var(--seller-step-count),minmax(0,1fr))]"
        style={{ '--seller-step-count': stepCount }}
      >
        {(journey.steps || []).map((step, index, steps) => {
          const date = getSellerJourneyStepDate(row, listing, journey, step)
          const isLast = index === steps.length - 1
          return (
            <li key={step.key} className="relative min-w-0">
              {!isLast ? <span className={`absolute left-[calc(50%+1.5rem)] top-5 hidden h-px w-[calc(100%-3rem)] xl:block ${step.completed ? 'bg-emerald-300' : 'bg-slate-200'}`} /> : null}
              <div className="relative flex min-h-[124px] min-w-0 flex-col items-center gap-3 text-center">
                <span className={`z-10 flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold shadow-sm ${step.current ? 'border-blue-600 bg-blue-600 text-white ring-4 ring-blue-100' : step.completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-300'}`}>
                  {step.completed || step.current ? <CheckCircle2 size={16} /> : <FileText size={14} />}
                </span>
                <div className="min-w-0 max-w-full">
                  <p className={`mx-auto min-h-[2.5rem] max-w-[11rem] break-words text-sm font-semibold leading-5 xl:max-w-[8.5rem] ${step.current ? 'text-blue-700' : step.completed ? 'text-slate-950' : 'text-slate-500'}`}>{step.label}</p>
                  <p className="mt-1 mx-auto min-h-[2rem] max-w-[11rem] break-words text-xs font-semibold leading-4 text-slate-500 xl:max-w-[8.5rem]">{date ? formatDate(date) : step.upcoming ? 'Upcoming' : step.status || step.state}</p>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function ListingReadinessCircle({ percent = 0 }) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0))
  return (
    <div
      className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(#16a34a ${safePercent * 3.6}deg, #e2e8f0 0deg)` }}
      aria-label={`Listing readiness ${safePercent}%`}
    >
      <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-white shadow-inner">
        <strong className="text-3xl font-semibold tracking-[-0.045em] text-slate-950">{safePercent}%</strong>
      </div>
    </div>
  )
}

function SellerNextBestActionCard({ row, listing, journey, readiness, onboardingStatus, onAction }) {
  const meta = getSellerNextBestActionMeta({ row, listing, journey, readiness, onboardingStatus })
  const toneClass = meta.tone === 'green'
    ? 'border-emerald-100 bg-emerald-50/70'
    : meta.tone === 'blue'
      ? 'border-blue-100 bg-blue-50/70'
      : 'border-amber-100 bg-amber-50/70'
  return (
    <section className={`${panelClass} min-h-[190px] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] ${toneClass}`}>
      <div className="flex h-full flex-col justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-600"><Tag size={16} /></span>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Next Best Action</p>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.045em] text-slate-950">{meta.title}</h2>
          <p className="mt-2 text-sm font-medium text-slate-600">{meta.copy}</p>
          {meta.missing.length ? (
            <ul className="mt-3 space-y-1">
              {meta.missing.map((item) => <li key={item} className="text-sm font-semibold text-slate-800">- {item}</li>)}
            </ul>
          ) : null}
        </div>
        <button type="button" onClick={() => onAction?.(meta.actionId)} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] hover:bg-slate-800 sm:w-fit">
          {meta.actionLabel}
        </button>
      </div>
    </section>
  )
}

function SellerReadinessScoreCard({ readiness = null, journey = null }) {
  const listingReadiness = readiness?.listingReadiness || {}
  const missing = listingReadiness.incompleteItems?.map((item) => item.blocker || item.label) || readiness?.blockers?.map((item) => item.label) || []
  const percent = journey?.listingLive ? 100 : listingReadiness.percent || 0
  const readyLabel = percent >= 90 ? 'Ready To Publish' : percent >= 60 ? 'Almost Ready' : 'Needs Attention'
  return (
    <section className={`${panelClass} min-h-[190px] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Listing Readiness Score</p>
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
        <ListingReadinessCircle percent={percent} />
        <div className="min-w-0">
          <h2 className={`text-xl font-semibold tracking-[-0.035em] ${percent >= 80 ? 'text-emerald-700' : 'text-slate-950'}`}>{readyLabel}</h2>
          <p className="mt-2 text-sm font-medium text-slate-500">{percent >= 90 ? 'This listing is close to publication.' : 'Resolve the missing items to move this property live.'}</p>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Missing</p>
            {missing.length ? (
              <ul className="mt-2 space-y-1">
                {missing.slice(0, 4).map((item) => <li key={item} className="text-sm font-semibold text-slate-700">- {item}</li>)}
              </ul>
            ) : <p className="mt-2 text-sm font-semibold text-emerald-700">No readiness blockers</p>}
          </div>
        </div>
      </div>
    </section>
  )
}

function SellerPropertyPreviewCard({ row, listing }) {
  const property = getSellerPropertySummary(row, listing)
  const imageUrl = getSellerListingImageUrl(listing)
  return (
    <section className={`${panelClass} min-h-[190px] overflow-hidden shadow-[0_18px_45px_rgba(15,23,42,0.06)]`}>
      <div className="flex h-36 items-center justify-center bg-slate-100 text-slate-400">
        {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={30} />}
      </div>
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Property Preview</p>
        <h2 className="mt-2 line-clamp-2 text-lg font-semibold tracking-[-0.035em] text-slate-950">{property.address}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill>{property.propertyType}</StatusPill>
          <StatusPill>{property.estimatedValue ? formatCurrency(property.estimatedValue) : 'Value pending'}</StatusPill>
        </div>
      </div>
    </section>
  )
}

function SellerAcquisitionActionRow({ row, listing, journey, readiness, onboardingStatus, onAction }) {
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <SellerNextBestActionCard row={row} listing={listing} journey={journey} readiness={readiness} onboardingStatus={onboardingStatus} onAction={onAction} />
      <SellerReadinessScoreCard readiness={readiness} journey={journey} />
      <SellerPropertyPreviewCard row={row} listing={listing} />
    </section>
  )
}

function SellerWorkspaceTabs({ activeTab, onTabChange }) {
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'seller', label: 'Seller' },
    { key: 'property', label: 'Property' },
    { key: 'mandate', label: 'Mandate' },
    { key: 'appointments', label: 'Appointments' },
    { key: 'documents', label: 'Documents' },
    { key: 'activity', label: 'Activity' },
  ]
  return (
    <nav className={`${panelClass} sticky top-0 z-10 grid grid-cols-2 gap-2 p-2 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:grid-cols-3 lg:grid-cols-7`} aria-label="Seller workspace tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={`flex min-h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${activeTab === tab.key ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

function SellerOverviewTab({ row, sourceInfo, journey, timeline, organisationId, actor, onSaved, onTabChange }) {
  return (
    <div className="grid items-stretch gap-5 xl:grid-cols-2 xl:auto-rows-[minmax(320px,auto)]">
      <SellerWorkspaceCard title="Lead Summary" density="compact">
        <dl className="flex flex-1 flex-col">
          <SellerInfoRow label="Source" value={sourceInfo?.leadSource || row.source} />
          <SellerInfoRow label="Estimated Value" value={formatCurrency(row.estimatedValue || row.estimated_value)} />
          <SellerInfoRow label="Property" value={getLeadContextSummary(row)} />
          <SellerInfoRow label="Lead Age" value={`${getSellerLeadAge(journey)} days`} />
          <SellerInfoRow label="Created" value={formatDate(row.createdAt)} />
          <SellerInfoRow label="Last Contact" value={formatDateTime(getLatestActivityDate(row.latestActivity), 'None yet')} />
        </dl>
      </SellerWorkspaceCard>
      <SellerDocumentsSummaryCard journey={journey} />
      <SellerWorkspaceCard
        title="Recent Activity"
        density="compact"
        className="h-[320px] overflow-hidden"
        action={<button type="button" onClick={() => onTabChange('activity')} className="text-xs font-semibold text-blue-700">View All</button>}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <SellerTimelineList timeline={timeline} limit={12} compact />
        </div>
      </SellerWorkspaceCard>
      <SellerOwnershipSummaryCard organisationId={organisationId} lead={row} actor={actor} onSaved={onSaved} />
    </div>
  )
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clonePlainObject(value) {
  if (!isPlainObject(value)) return {}
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return {}
  }
}

function humanizeSellerFieldKey(key = '') {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9]+)/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bId\b/g, 'ID')
    .replace(/\bVat\b/g, 'VAT')
    .replace(/\bCoc\b/g, 'COC')
    .replace(/\bPoa\b/g, 'POA')
    .replace(/\bFica\b/g, 'FICA')
}

function formatSellerOnboardingFieldValue(value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value) || isPlainObject(value)) return JSON.stringify(value, null, 2)
  return String(value)
}

function parseSellerOnboardingJson(raw = '', fallback = []) {
  const text = String(raw || '').trim()
  if (!text) return fallback
  const parsed = JSON.parse(text)
  if (Array.isArray(parsed) || isPlainObject(parsed)) return parsed
  throw new Error('Expected JSON array or object.')
}

function parseSellerOnboardingList(raw = '') {
  const text = String(raw || '').trim()
  if (!text) return []
  return text
    .split(/\r?\n|,/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

const SELLER_PROFILE_ADDRESS_KEYS = [
  'propertyAddressSearch',
  'propertyAddressLine1',
  'propertyAddressLine2',
  'suburb',
  'city',
  'province',
  'postalCode',
  'municipality',
  'country',
]

const SELLER_PROFILE_JSON_KEYS = new Set([
  'companyDirectors',
  'trustees',
  'executors',
  'powerOfAttorneyRepresentatives',
  'multipleOwners',
])

const SELLER_PROFILE_READ_ONLY_KEYS = new Set([
  'propertyAddress',
  'propertyAddressDetails',
  'canonicalPropertyType',
  'flowVersion',
  'sellerBranch',
  'propertyBranch',
  'flowVisibleFields',
  'flowRequiredFields',
  'flowDocumentTriggers',
  'ownershipFieldLabels',
])

const SELLER_PROFILE_LIST_KEYS = new Set(['features'])

const SELLER_PROFILE_CHECKBOX_KEYS = new Set([
  'vatRegistered',
  'sectionalTitle',
  'shareBlock',
  'estateOrHoa',
  'bodyCorporate',
  'commercialProperty',
  'schemeRulesAvailable',
  'hoaRulesAvailable',
  'tenantScheduleAvailable',
  'titleDeedAvailable',
  'sgDiagramAvailable',
  'erfDiagramAvailable',
  'approvedBuildingPlansAvailable',
  'floorPlanAvailable',
  'pool',
  'rentalScheduleAvailable',
  'existingBond',
  'multipleBonds',
  'accessBond',
  'cancellationRequired',
  'cancellationAttorneyKnown',
  'gasInstallation',
  'electricFence',
  'solarInstallation',
  'swimmingPool',
  'boreholeInstallation',
  'borehole',
  'generatorInstallation',
  'beetleCertificateRegion',
  'plumbingCertificateRequired',
  'occupationCertificateAvailable',
  'electricalCocAvailable',
  'gasCocAvailable',
  'electricFenceCertificateAvailable',
  'plumbingCertificateAvailable',
  'solarComplianceAvailable',
])

const SELLER_PROFILE_TEXTAREA_KEYS = new Set([
  'residentialAddress',
  'companyRegisteredAddress',
  'authorisedSignatoryAddress',
  'trustRegisteredAddress',
  'authorisedTrusteeAddress',
  'executorAuthorityDetails',
  'powerOfAttorneyAuthorityDetails',
  'commercialUseDescription',
  'mixedUseSplit',
  'tenantContactDetails',
  'noticePeriodDetails',
  'cancellationAttorneyDetails',
  'propertyCondition',
  'kitchenCondition',
  'bathroomCondition',
  'views',
  'recentRenovations',
  'propertyNotes',
  'sellingReason',
  'alterationDetails',
  'schemeName',
])

const SELLER_PROFILE_DATE_KEYS = new Set(['leaseExpiryDate'])

const SELLER_DOCUMENT_GROUP_DEFS = [
  { key: 'seller_identity', label: 'Seller Identity', icon: UserRound },
  { key: 'company_authority', label: 'Company Authority', icon: Building2 },
  { key: 'trust_authority', label: 'Trust Authority', icon: Shield },
  { key: 'property', label: 'Property', icon: Home },
  { key: 'fica_compliance', label: 'FICA / Compliance', icon: BadgeCheck },
  { key: 'poa_estate', label: 'POA / Estate Docs', icon: FileText },
  { key: 'occupancy_bond', label: 'Occupancy & Bond', icon: Banknote },
]

const SELLER_PROFILE_SECTION_DEFS = [
  {
    id: 'identity',
    title: 'Seller Identity',
    description: 'Core seller and authority values captured during onboarding.',
    defaultOpen: true,
    keys: [
      'fullName',
      'sellerFirstName',
      'sellerSurname',
      'idNumber',
      'entityName',
      'entityRegistrationNumber',
      'entityRepresentative',
      'legalType',
      'sellerType',
      'sellerLegalType',
      'sellerTaxNumber',
      'taxNumber',
      'email',
      'phone',
      'residentialAddress',
      'ownershipType',
      'maritalStatus',
      'maritalRegime',
      'vatRegistered',
      'vatNumber',
      'authorisedRepresentative',
      'spouseName',
      'spouseIdNumber',
      'spouseEmail',
      'spousePhone',
    ],
  },
  {
    id: 'company',
    title: 'Company Authority',
    description: 'Company identity, directors, and signatory details.',
    keys: [
      'companyName',
      'companyRegistrationNumber',
      'companyDirectors',
      'companyDirectorName',
      'companyDirectorEmail',
      'companyDirectorPhone',
      'companyRegisteredAddress',
      'authorisedSignatoryName',
      'authorisedSignatoryEmail',
      'authorisedSignatoryPhone',
      'authorisedSignatoryAddress',
    ],
  },
  {
    id: 'trust',
    title: 'Trust Authority',
    description: 'Trust identity, trustees, and authorised signatory details.',
    keys: [
      'trustName',
      'trustRegistrationNumber',
      'trustees',
      'trusteeName',
      'trusteeEmail',
      'trusteePhone',
      'trustRegisteredAddress',
      'authorisedTrusteeName',
      'authorisedTrusteeEmail',
      'authorisedTrusteePhone',
      'authorisedTrusteeAddress',
    ],
  },
  {
    id: 'entity',
    title: 'Estate / POA / Multiple Owners',
    description: 'Estate, power of attorney, and co-owner details.',
    keys: [
      'executors',
      'executorName',
      'executorEmail',
      'executorPhone',
      'estateReference',
      'executorAuthorityDetails',
      'powerOfAttorneyRepresentatives',
      'powerOfAttorneyName',
      'powerOfAttorneyEmail',
      'powerOfAttorneyPhone',
      'powerOfAttorneyPrincipalName',
      'powerOfAttorneyPrincipalIdNumber',
      'powerOfAttorneyReference',
      'powerOfAttorneyAuthorityDetails',
      'multipleOwners',
      'ownershipFieldLabels',
    ],
  },
  {
    id: 'property',
    title: 'Property',
    description: 'Address, sale context, and the property profile used for mandate prep.',
    defaultOpen: true,
    keys: [
      'askingPrice',
      'mandateType',
      'sellingTimeline',
      'sellingReason',
      'propertyCategory',
      'propertyStructureType',
      'canonicalPropertyType',
      'sectionalTitle',
      'shareBlock',
      'estateOrHoa',
      'bodyCorporate',
      'commercialProperty',
      'propertyAddressSearch',
      'propertyAddressLine1',
      'propertyAddressLine2',
      'suburb',
      'city',
      'province',
      'postalCode',
      'municipality',
      'country',
      'propertyAddress',
      'propertyAddressDetails',
      'estateComplexName',
      'estateName',
      'schemeBodyCorporateName',
      'schemeManagingAgentName',
      'schemeManagingAgentEmail',
      'schemeManagingAgentPhone',
      'schemeLevies',
      'schemeRulesAvailable',
      'unitNumber',
      'sectionNumber',
      'schemeName',
      'hoaContactName',
      'hoaContactEmail',
      'hoaContactPhone',
      'hoaManagementCompany',
      'hoaRulesAvailable',
      'commercialUseDescription',
      'mixedUseSplit',
      'tenantScheduleAvailable',
      'landZoning',
      'landServicesAvailable',
      'landWaterSource',
      'erfNumber',
      'titleDeedAvailable',
      'sgDiagramAvailable',
      'erfDiagramAvailable',
      'approvedBuildingPlansAvailable',
      'floorPlanAvailable',
      'erfSize',
      'floorSize',
      'bedrooms',
      'bathrooms',
      'livingArea',
      'kitchens',
      'garages',
      'parkingCovered',
      'parkingOpen',
      'pool',
      'levies',
      'ratesTaxes',
      'monthlyWaterSpend',
      'monthlyElectricitySpend',
      'recentAlterations',
      'alterationDetails',
      'features',
      'propertyCondition',
      'kitchenCondition',
      'bathroomCondition',
      'views',
      'recentRenovations',
      'propertyNotes',
    ],
  },
  {
    id: 'occupancy',
    title: 'Occupancy & Bond',
    description: 'Tenant, occupancy, and bond detail captured for mandate risk checks.',
    keys: [
      'occupancyStatus',
      'leaseExists',
      'leaseExpiryDate',
      'monthlyRental',
      'rentalDeposit',
      'tenantName',
      'tenantContactDetails',
      'noticePeriodDetails',
      'rentalScheduleAvailable',
      'existingBond',
      'bondBank',
      'bondAccountReference',
      'multipleBonds',
      'accessBond',
      'estimatedSettlementAmount',
      'cancellationRequired',
      'cancellationAttorneyKnown',
      'cancellationAttorneyDetails',
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance',
    description: 'Installation and certificate flags that drive document readiness.',
    keys: [
      'gasInstallation',
      'electricFence',
      'solarInstallation',
      'swimmingPool',
      'boreholeInstallation',
      'borehole',
      'generatorInstallation',
      'beetleCertificateRegion',
      'plumbingCertificateRequired',
      'occupationCertificateAvailable',
      'electricalCocAvailable',
      'gasCocAvailable',
      'electricFenceCertificateAvailable',
      'plumbingCertificateAvailable',
      'solarComplianceAvailable',
    ],
  },
  {
    id: 'metadata',
    title: 'Flow Metadata',
    description: 'Internal flow context and compatibility data from the onboarding record.',
    keys: [
      'flowVersion',
      'sellerBranch',
      'propertyBranch',
      'flowVisibleFields',
      'flowRequiredFields',
      'flowDocumentTriggers',
    ],
  },
]

function getSellerProfileFieldConfig(key = '') {
  const normalized = String(key || '')
  const type = SELLER_PROFILE_JSON_KEYS.has(normalized)
    ? 'json'
    : SELLER_PROFILE_LIST_KEYS.has(normalized)
      ? 'list'
      : SELLER_PROFILE_CHECKBOX_KEYS.has(normalized)
        ? 'checkbox'
        : SELLER_PROFILE_TEXTAREA_KEYS.has(normalized)
          ? 'textarea'
          : SELLER_PROFILE_DATE_KEYS.has(normalized)
            ? 'date'
            : 'text'
  const readOnly = SELLER_PROFILE_READ_ONLY_KEYS.has(normalized)
  const span = ['json', 'list', 'textarea'].includes(type) || readOnly ? 2 : 1
  const rows = type === 'json'
    ? 7
    : type === 'list'
      ? 5
      : type === 'textarea'
        ? 4
        : 1
  return {
    key: normalized,
    label: humanizeSellerFieldKey(normalized),
    type,
    readOnly,
    span,
    rows,
  }
}

function SellerOnboardingFieldEditor({
  field,
  value,
  draftValue,
  onChange,
  complexValue,
  onComplexChange,
}) {
  const commonClass = field.readOnly
    ? 'min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500 outline-none'
    : 'min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-300'
  if (field.type === 'checkbox') {
    return (
      <label className={`grid gap-2 ${field.span === 2 ? 'md:col-span-2' : ''}`}>
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{field.label}</span>
        <span className={`inline-flex min-h-11 items-center gap-3 rounded-xl border px-3 ${field.readOnly ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={field.readOnly}
            onChange={(event) => onChange?.(field.key, event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-300"
          />
          <span className="text-sm font-semibold text-slate-700">{value ? 'Yes' : 'No'}</span>
        </span>
      </label>
    )
  }

  if (field.type === 'json' || field.type === 'list') {
    const textValue = field.readOnly
      ? formatSellerOnboardingFieldValue(value)
      : complexValue !== undefined
        ? String(complexValue)
        : formatSellerOnboardingFieldValue(value)
    return (
      <label className={`grid gap-2 ${field.span === 2 ? 'md:col-span-2' : ''}`}>
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{field.label}</span>
        <textarea
          rows={field.rows}
          value={textValue}
          readOnly={field.readOnly}
          onChange={field.readOnly ? undefined : (event) => onComplexChange?.(field.key, event.target.value)}
          className={`${commonClass} resize-y py-3 font-mono text-xs leading-6 ${field.readOnly ? 'text-slate-500' : 'text-slate-900'}`}
          placeholder={field.type === 'list' ? 'One item per line' : '{ }'}
        />
      </label>
    )
  }

  return (
    <label className={`grid gap-2 ${field.span === 2 ? 'md:col-span-2' : ''}`}>
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{field.label}</span>
      {field.type === 'textarea' ? (
        <textarea
          rows={field.rows}
          value={String(draftValue ?? '')}
          readOnly={field.readOnly}
          onChange={field.readOnly ? undefined : (event) => onChange?.(field.key, event.target.value)}
          className={`${commonClass} resize-y py-3 font-medium leading-6 ${field.readOnly ? 'text-slate-500' : 'text-slate-900'}`}
        />
      ) : (
        <input
          type={field.type === 'date' ? 'date' : 'text'}
          value={String(draftValue ?? '')}
          readOnly={field.readOnly}
          onChange={field.readOnly ? undefined : (event) => onChange?.(field.key, event.target.value)}
          className={commonClass}
        />
      )}
    </label>
  )
}

function SellerOnboardingSection({ section, draft, complexDrafts, onChange, onComplexChange }) {
  const fields = section.keys
    .map((key) => getSellerProfileFieldConfig(key))
    .filter(Boolean)

  if (!fields.length) return null

  return (
    <details open={section.defaultOpen} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-950">{section.title}</h4>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{section.description}</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">{fields.length} fields</span>
        </div>
      </summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <SellerOnboardingFieldEditor
            key={field.key}
            field={field}
            value={draft?.[field.key]}
            draftValue={draft?.[field.key]}
            complexValue={complexDrafts?.[field.key]}
            onChange={onChange}
            onComplexChange={onComplexChange}
          />
        ))}
      </div>
    </details>
  )
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string' && value.trim() === '') return false
  if (Array.isArray(value) && value.length === 0) return false
  if (typeof value === 'object' && Object.keys(value).length === 0) return false
  return true
}

function normalizeComparableSellerValue(value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).trim()
}

function isMonetarySellerFieldKey(key = '') {
  return /(?:price|value|amount|levies|ratesTaxes|monthlyRental|rentalDeposit|settlement|commission|askingPrice|estimatedValue|bond|taxNumber)/i.test(String(key || ''))
}

function formatSubmittedSellerOnboardingFieldValue(field = {}, value) {
  if (!hasValue(value)) return ''
  const key = String(field?.key || '').toLowerCase()
  if (key === 'propertyaddressdetails' || key === 'propertyaddress') {
    const formattedAddress = formatPropertyAddress(value)
    if (formattedAddress) return formattedAddress
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    const parts = value.map((item) => {
      if (item && typeof item === 'object') {
        return normalizeText(
          item.fullName ||
            item.full_name ||
            item.name ||
            [item.firstName, item.lastName || item.surname].filter(Boolean).join(' ') ||
            item.email ||
            item.idNumber ||
            item.id_number,
        )
      }
      return normalizeText(item)
    }).filter(Boolean)
    return parts.length ? parts.join(', ') : ''
  }
  if (value && typeof value === 'object') {
    const formattedAddress = formatPropertyAddress(value)
    if (formattedAddress) return formattedAddress
    const entries = Object.entries(value).filter(([, entryValue]) => hasValue(entryValue))
    if (!entries.length) return ''
    if (entries.length === 1) {
      const [entryKey, entryValue] = entries[0]
      return `${humanizeSellerFieldKey(entryKey)}: ${formatSubmittedSellerOnboardingFieldValue({ key: entryKey }, entryValue)}`
    }
    return entries
      .slice(0, 3)
      .map(([entryKey, entryValue]) => `${humanizeSellerFieldKey(entryKey)}: ${formatSubmittedSellerOnboardingFieldValue({ key: entryKey }, entryValue)}`)
      .join(' · ')
  }
  if (key.includes('date')) return formatDate(value, '')
  if (isMonetarySellerFieldKey(key)) {
    const numeric = Number(String(value).replace(/[^0-9.-]/g, ''))
    if (Number.isFinite(numeric) && numeric > 0) return formatCurrency(numeric)
  }
  return String(value)
}

function getSellerOnboardingProgressMeta({ row = {}, listing = null, journey = null, onboardingStatus = '' } = {}) {
  const normalized = normalizeText(
    onboardingStatus ||
      getSellerOnboardingStatus(row, listing, journey) ||
      row?.sellerOnboardingStatus ||
      row?.seller_onboarding_status ||
      listing?.sellerOnboarding?.status ||
      '',
  ).toLowerCase()

  if (sellerOnboardingIsSubmitted(normalized)) {
    return {
      label: normalized === 'completed' || normalized === 'onboarding_completed' || normalized === 'seller_onboarding_completed'
        ? 'Completed'
        : 'Submitted',
      tone: 'green',
      state: normalized === 'completed' || normalized === 'onboarding_completed' || normalized === 'seller_onboarding_completed'
        ? 'completed'
        : 'submitted',
      status: normalized || 'completed',
    }
  }

  if (sellerOnboardingHasStarted(normalized) || Boolean(getSellerOnboardingToken(row, listing)) || Boolean(journey?.onboardingSent)) {
    return {
      label: 'Sent',
      tone: 'amber',
      state: 'sent',
      status: normalized || 'sent',
    }
  }

  return {
    label: 'Not sent',
    tone: 'slate',
    state: 'not_sent',
    status: normalized || 'not_started',
  }
}

function isSellerSubmittedSectionRelevant(section = {}, profile = {}, data = {}) {
  if (!section?.id || section.id === 'metadata') return false
  const sectionHasValues = (section.keys || []).some((key) => hasValue(data?.[key]))
  if (section.id === 'identity') return true
  if (section.id === 'company') return profile?.sellerBranch === 'company' || sectionHasValues
  if (section.id === 'trust') return profile?.sellerBranch === 'trust' || sectionHasValues
  if (section.id === 'entity') {
    return ['deceased_estate', 'power_of_attorney', 'multiple_individuals'].includes(profile?.sellerBranch) || sectionHasValues
  }
  if (section.id === 'property') return true
  if (section.id === 'occupancy') {
    return profile?.occupancyStatus && profile.occupancyStatus !== 'unknown' ||
      profile?.bondStatus && profile.bondStatus !== 'unknown' ||
      sectionHasValues
  }
  if (section.id === 'compliance') {
    return Boolean(profile?.sectionalTitle || profile?.shareBlock || profile?.estateOrHoa || profile?.commercialProperty || sectionHasValues)
  }
  return sectionHasValues
}

function getSellerSubmittedSectionDefinitions(profile = {}, data = {}) {
  return SELLER_PROFILE_SECTION_DEFS.filter((section) => isSellerSubmittedSectionRelevant(section, profile, data))
}

function getSellerSubmittedSectionModels({
  sections = [],
  data = {},
  draft = {},
  complexDrafts = {},
  editable = false,
  addedFieldKeys = [],
} = {}) {
  const addedSet = new Set((Array.isArray(addedFieldKeys) ? addedFieldKeys : []).filter(Boolean))
  const knownKeys = new Set(sections.flatMap((section) => section.keys || []))

  const models = sections.map((section) => {
    const fieldConfigs = (section.keys || []).map((key) => getSellerProfileFieldConfig(key))
    const fields = fieldConfigs
      .filter((field) => hasValue(data?.[field.key]) || addedSet.has(field.key))
      .map((field) => ({
        ...field,
        value: editable ? draft?.[field.key] : data?.[field.key],
        draftValue: editable ? draft?.[field.key] : data?.[field.key],
        complexValue: editable ? complexDrafts?.[field.key] : undefined,
        populated: hasValue(data?.[field.key]),
      }))
    const missingFields = fieldConfigs.filter((field) => !hasValue(data?.[field.key]) && !addedSet.has(field.key) && !field.readOnly)

    if (!fields.length && !(editable && missingFields.length)) return null

    const capturedCount = (section.keys || []).filter((key) => hasValue(data?.[key])).length
    const totalCount = (section.keys || []).length

    return {
      ...section,
      className: (section.keys || []).length >= 6 ? 'lg:col-span-2' : '',
      fields,
      missingFields,
      capturedCount,
      totalCount,
      countLabel: totalCount ? `${capturedCount} of ${totalCount}` : `${capturedCount}`,
    }
  }).filter(Boolean)

  const extraKeys = Object.keys(data || {})
    .filter((key) => !knownKeys.has(key))
    .filter((key) => !SELLER_PROFILE_READ_ONLY_KEYS.has(key))
    .filter((key) => key !== 'currentStep')
    .filter((key) => hasValue(data?.[key]) || addedSet.has(key))

  if (extraKeys.length) {
    models.push({
      id: 'other-submitted-details',
      title: 'Other Submitted Details',
      description: 'Additional submitted values not covered by the main sections.',
      className: 'lg:col-span-2',
      fields: extraKeys.map((key) => {
        const field = getSellerProfileFieldConfig(key)
        return {
          ...field,
          value: editable ? draft?.[field.key] : data?.[field.key],
          draftValue: editable ? draft?.[field.key] : data?.[field.key],
          complexValue: editable ? complexDrafts?.[field.key] : undefined,
          populated: hasValue(data?.[field.key]),
        }
      }),
      capturedCount: extraKeys.filter((key) => hasValue(data?.[key])).length,
      totalCount: extraKeys.length,
      countLabel: `${extraKeys.filter((key) => hasValue(data?.[key])).length} of ${extraKeys.length}`,
    })
  }

  return models
}

function getSellerCapturedFieldSummary({
  sections = [],
  data = {},
} = {}) {
  const sectionKeys = new Set(sections.flatMap((section) => section.keys || []))
  const extraKeys = Object.keys(data || {})
    .filter((key) => !sectionKeys.has(key))
    .filter((key) => !SELLER_PROFILE_READ_ONLY_KEYS.has(key))
    .filter((key) => key !== 'currentStep')

  const countableKeys = [
    ...sectionKeys,
    ...extraKeys,
  ]

  const populated = countableKeys.filter((key) => hasValue(data?.[key]))
  return {
    populated: populated.length,
    total: countableKeys.length,
    label: countableKeys.length ? `${populated.length} of ${countableKeys.length}` : `${populated.length}`,
  }
}

function getSellerDocumentOverviewGroupKey(requirement = {}) {
  const requirementGroup = normalizeText(requirement?.requirement_group || requirement?.group || '').toLowerCase()
  const requirementKey = normalizeText(requirement?.requirement_key || requirement?.requirementKey || requirement?.key || '').toLowerCase()
  const requirementLabel = normalizeText(requirement?.requirement_name || requirement?.requirementName || requirement?.label || requirement?.name || '').toLowerCase()
  const signal = `${requirementKey} ${requirementLabel}`

  if (!requirementGroup || requirementGroup === 'mandate') return ''
  if (requirementGroup === 'seller_identity' || requirementGroup === 'marital') return 'seller_identity'
  if (requirementGroup === 'company') return 'company_authority'
  if (requirementGroup === 'trust') return 'trust_authority'
  if (requirementGroup === 'property') return 'property'
  if (requirementGroup === 'fica' || requirementGroup === 'property_compliance' || requirementGroup === 'compliance') return 'fica_compliance'
  if (requirementGroup === 'deceased_estate' || requirementGroup === 'power_of_attorney') return 'poa_estate'
  if (requirementGroup === 'occupancy') return 'occupancy_bond'
  if (requirementGroup === 'financial') {
    if (/bond|settlement|cancellation|bond_statement|bond_bank|bond_account/.test(signal)) return 'occupancy_bond'
    return 'fica_compliance'
  }
  return ''
}

function getSellerDocumentRequirementState(status = '', hasDocument = false) {
  const normalized = normalizeText(status).toLowerCase()
  if (hasDocument || ['uploaded', 'approved', 'verified', 'accepted', 'completed', 'complete', 'signed', 'submitted', 'received'].includes(normalized)) return 'completed'
  if (['requested', 'missing', 'outstanding', 'rejected', 'under_review'].includes(normalized)) return 'outstanding'
  if (!normalized || ['required', 'not_started', 'pending', 'draft'].includes(normalized)) return 'not_started'
  if (normalized === 'not_applicable') return 'not_applicable'
  return 'outstanding'
}

function getSellerDocumentRequirementKey(requirement = {}) {
  return normalizeText(requirement?.requirement_key || requirement?.requirementKey || requirement?.key || requirement?.id || '')
}

function buildSellerDocumentOverviewModel({
  profile = {},
  listing = null,
  journey = null,
} = {}) {
  const fallbackProfile = buildSellerRequirementProfile(listing?.sellerOnboarding?.formData || {}, listing || {})
  const requirementProfile = profile && Object.keys(profile || {}).length ? profile : fallbackProfile
  const requirementSource = getSellerRequiredDocuments(listing || {}, requirementProfile?.formData || {})
    .filter((requirement) => requirement?.is_required !== false)
    .filter((requirement) => normalizeText(requirement?.requirement_group || requirement?.group).toLowerCase() !== 'mandate')

  const requirementStatusByKey = new Map()
  const listingRequirementRows = Array.isArray(listing?.documentRequirements) ? listing.documentRequirements : []
  for (const row of listingRequirementRows) {
    const key = getSellerDocumentRequirementKey(row)
    if (!key) continue
    requirementStatusByKey.set(key.toLowerCase(), {
      status: row?.status || row?.documentStatus || row?.document_status || '',
      url: row?.url || row?.documentUrl || row?.document_url || '',
    })
  }

  const journeyDocumentRows = Array.isArray(journey?.documents) ? journey.documents : []
  for (const row of journeyDocumentRows) {
    const requirement = row?.original?.requirement || row?.requirement || {}
    const key = getSellerDocumentRequirementKey(requirement)
    if (!key) continue
    requirementStatusByKey.set(key.toLowerCase(), {
      status: row?.status || row?.documentStatus || row?.document_status || '',
      url: row?.url || row?.documentUrl || row?.document_url || '',
    })
  }

  const groupsByKey = new Map(SELLER_DOCUMENT_GROUP_DEFS.map((group) => [group.key, {
    ...group,
    total: 0,
    completed: 0,
    outstanding: 0,
    notStarted: 0,
    requirements: [],
  }]))

  for (const requirement of requirementSource) {
    const groupKey = getSellerDocumentOverviewGroupKey(requirement)
    if (!groupKey) continue
    const requirementKey = getSellerDocumentRequirementKey(requirement).toLowerCase()
    const statusEntry = requirementStatusByKey.get(requirementKey) || {}
    const state = getSellerDocumentRequirementState(statusEntry.status || requirement?.status || '', Boolean(statusEntry.url))
    if (state === 'not_applicable') continue
    const group = groupsByKey.get(groupKey)
    if (!group) continue
    group.total += 1
    group[state] += 1
    group.requirements.push({
      ...requirement,
      state,
      status: statusEntry.status || requirement?.status || '',
      hasDocument: Boolean(statusEntry.url),
    })
  }

  const groups = Array.from(groupsByKey.values()).filter((group) => group.total > 0)
  const summary = groups.reduce((accumulator, group) => {
    accumulator.total += group.total
    accumulator.completed += group.completed
    accumulator.outstanding += group.outstanding
    accumulator.notStarted += group.notStarted
    return accumulator
  }, {
    total: 0,
    completed: 0,
    outstanding: 0,
    notStarted: 0,
  })

  const percent = summary.total ? Math.round((summary.completed / summary.total) * 100) : 0

  return {
    groups,
    summary,
    percent,
    profile: requirementProfile,
  }
}

function SellerSubmittedField({
  field,
  editable = false,
  value,
  draftValue,
  complexValue,
  onChange,
  onComplexChange,
}) {
  if (editable) {
    return (
      <SellerOnboardingFieldEditor
        field={field}
        value={value}
        draftValue={draftValue}
        complexValue={complexValue}
        onChange={onChange}
        onComplexChange={onComplexChange}
      />
    )
  }

  const displayValue = formatSubmittedSellerOnboardingFieldValue(field, value)
  return (
    <div className={`grid gap-2 ${field.span === 2 ? 'md:col-span-2' : ''}`}>
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{field.label}</span>
      <div className="min-h-11 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700 shadow-[0_1px_0_rgba(255,255,255,0.8)]">
        {displayValue ? <span className="whitespace-pre-wrap leading-6 text-slate-900">{displayValue}</span> : <span className="text-slate-400">Not captured</span>}
      </div>
    </div>
  )
}

function SellerSubmittedSectionCard({
  section,
  editable = false,
  onChange,
  onComplexChange,
  onAddField,
}) {
  if (!section?.fields?.length && !(editable && section?.missingFields?.length)) return null
  const fieldCountLabel = section.countLabel || `${section.capturedCount || 0}`
  const addableFields = (section.missingFields || []).filter((field) => !field.readOnly)
  const sectionTone = section.totalCount
    ? section.capturedCount === section.totalCount
      ? 'green'
      : section.capturedCount
        ? 'amber'
        : 'slate'
    : 'slate'
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)] ${section.className || ''}`.trim()}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-950">{section.title}</h4>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{section.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill tone={sectionTone}>{fieldCountLabel}</StatusPill>
          {editable && addableFields.length ? (
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 transition hover:bg-slate-100">
                Add missing field
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Hidden fields</p>
                <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
                  {addableFields.map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => onAddField?.(field.key)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <span className="min-w-0 truncate">{field.label}</span>
                      <span className="shrink-0 text-xs font-semibold text-blue-700">Add</span>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          ) : null}
        </div>
      </div>
      {section.fields.length ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {section.fields.map((field) => (
            <SellerSubmittedField
              key={field.key}
              field={field}
              editable={editable}
              value={field.value}
              draftValue={field.draftValue}
              complexValue={field.complexValue}
              onChange={onChange}
              onComplexChange={onComplexChange}
            />
          ))}
        </div>
      ) : editable && addableFields.length ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
          No submitted values captured for this section yet. Add a missing field to start an override.
        </div>
      ) : null}
    </section>
  )
}

function buildSellerOnboardingSubmissionPatch({
  sourceData = {},
  draft = {},
  complexDrafts = {},
  addedFieldKeys = [],
} = {}) {
  const nextDraft = clonePlainObject(draft)
  const allKeys = new Set([
    ...Object.keys(sourceData || {}),
    ...Object.keys(nextDraft || {}),
    ...(Array.isArray(addedFieldKeys) ? addedFieldKeys : []),
  ])

  for (const key of allKeys) {
    if (!key || key === 'currentStep' || SELLER_PROFILE_READ_ONLY_KEYS.has(key)) continue
    const field = getSellerProfileFieldConfig(key)
    const complexValue = complexDrafts?.[key]

    if (field.type === 'json') {
      if (typeof complexValue === 'string' && complexValue.trim()) {
        nextDraft[key] = parseSellerOnboardingJson(complexValue, nextDraft[key] || [])
      }
    } else if (field.type === 'list') {
      if (typeof complexValue === 'string' && complexValue.trim()) {
        nextDraft[key] = parseSellerOnboardingList(complexValue)
      }
    }
  }

  const normalizedAddress = normalizePropertyAddress({
    propertyAddressDetails: isPlainObject(nextDraft.propertyAddressDetails) ? nextDraft.propertyAddressDetails : {},
    propertyAddressSearch: nextDraft.propertyAddressSearch || '',
    propertyAddressLine1: nextDraft.propertyAddressLine1 || '',
    propertyAddressLine2: nextDraft.propertyAddressLine2 || '',
    suburb: nextDraft.suburb || '',
    city: nextDraft.city || '',
    province: nextDraft.province || '',
    postalCode: nextDraft.postalCode || '',
    municipality: nextDraft.municipality || '',
    country: nextDraft.country || '',
  }, {}, createBlankPropertyAddress())

  nextDraft.propertyAddressDetails = normalizedAddress
  nextDraft.propertyAddress = normalizedAddress.formatted || nextDraft.propertyAddress || ''
  nextDraft.propertyAddressSearch = normalizedAddress.query || nextDraft.propertyAddressSearch || ''
  nextDraft.propertyAddressLine1 = normalizedAddress.line1 || nextDraft.propertyAddressLine1 || ''
  nextDraft.propertyAddressLine2 = normalizedAddress.line2 || nextDraft.propertyAddressLine2 || ''
  nextDraft.suburb = normalizedAddress.suburb || nextDraft.suburb || ''
  nextDraft.city = normalizedAddress.city || nextDraft.city || ''
  nextDraft.province = normalizedAddress.province || nextDraft.province || ''
  nextDraft.postalCode = normalizedAddress.postalCode || nextDraft.postalCode || ''
  nextDraft.municipality = normalizedAddress.municipality || nextDraft.municipality || ''
  const addressKeys = [
    'propertyAddressSearch',
    'propertyAddressLine1',
    'propertyAddressLine2',
    'suburb',
    'city',
    'province',
    'postalCode',
    'municipality',
    'country',
  ]
  const hasAddressInput = addressKeys.some((key) => hasValue(nextDraft?.[key]) || hasValue(sourceData?.[key]))
  nextDraft.country = hasAddressInput
    ? normalizedAddress.country || nextDraft.country || sourceData?.country || 'South Africa'
    : nextDraft.country || sourceData?.country || ''

  const patch = {}
  const changedFields = []
  for (const key of allKeys) {
    if (!key || key === 'currentStep' || SELLER_PROFILE_READ_ONLY_KEYS.has(key)) continue
    if (!hasValue(nextDraft?.[key])) continue
    if (normalizeComparableSellerValue(sourceData?.[key]) === normalizeComparableSellerValue(nextDraft?.[key])) continue
    patch[key] = nextDraft[key]
    changedFields.push(key)
  }

  return {
    nextDraft,
    patch,
    changedFields,
  }
}

function SellerProfileTab({
  row,
  sourceInfo,
  journey,
  onboardingStatus,
  listing = null,
  actor = null,
  sendingOnboarding = false,
  onSaved,
  onSendSellerOnboarding,
  onResendSellerPortalLink,
  onCopySellerPortalLink,
}) {
  const sourceFormData = useMemo(() => clonePlainObject(readSellerOnboardingFormData(listing, row)), [listing, row])
  const sourceKey = useMemo(() => JSON.stringify(sourceFormData), [sourceFormData])
  const [draft, setDraft] = useState(() => clonePlainObject(sourceFormData))
  const [complexDrafts, setComplexDrafts] = useState(() => ({
    companyDirectors: formatSellerOnboardingFieldValue(sourceFormData.companyDirectors || []),
    trustees: formatSellerOnboardingFieldValue(sourceFormData.trustees || []),
    executors: formatSellerOnboardingFieldValue(sourceFormData.executors || []),
    powerOfAttorneyRepresentatives: formatSellerOnboardingFieldValue(sourceFormData.powerOfAttorneyRepresentatives || []),
    multipleOwners: formatSellerOnboardingFieldValue(sourceFormData.multipleOwners || []),
    features: Array.isArray(sourceFormData.features) ? sourceFormData.features.join('\n') : '',
  }))
  const [addedFieldKeys, setAddedFieldKeys] = useState([])
  const [isEditingSubmittedDetails, setIsEditingSubmittedDetails] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const createComplexDraftState = useCallback((formData = sourceFormData) => ({
    companyDirectors: formatSellerOnboardingFieldValue(formData.companyDirectors || []),
    trustees: formatSellerOnboardingFieldValue(formData.trustees || []),
    executors: formatSellerOnboardingFieldValue(formData.executors || []),
    powerOfAttorneyRepresentatives: formatSellerOnboardingFieldValue(formData.powerOfAttorneyRepresentatives || []),
    multipleOwners: formatSellerOnboardingFieldValue(formData.multipleOwners || []),
    features: Array.isArray(formData.features) ? formData.features.join('\n') : '',
  }), [sourceFormData])

  useEffect(() => {
    const nextDraft = clonePlainObject(sourceFormData)
    setDraft(nextDraft)
    setComplexDrafts(createComplexDraftState(nextDraft))
    setAddedFieldKeys([])
    setIsEditingSubmittedDetails(false)
    setMessage('')
    setError('')
  }, [createComplexDraftState, sourceKey, sourceFormData])

  const requirementProfile = useMemo(() => buildSellerRequirementProfile(sourceFormData, listing || row), [listing, row, sourceFormData])
  const progressMeta = useMemo(() => getSellerOnboardingProgressMeta({ row, listing, journey, onboardingStatus }), [journey, listing, onboardingStatus, row])
  const onboardingState = progressMeta.state
  const onboardingSubmitted = onboardingState === 'submitted' || onboardingState === 'completed'
  const submittedSections = useMemo(
    () => getSellerSubmittedSectionDefinitions(requirementProfile, sourceFormData),
    [requirementProfile, sourceFormData],
  )
  const submittedSectionModels = useMemo(
    () => getSellerSubmittedSectionModels({
      sections: submittedSections,
      data: sourceFormData,
      draft,
      complexDrafts,
      editable: onboardingSubmitted && isEditingSubmittedDetails,
      addedFieldKeys,
    }),
    [addedFieldKeys, complexDrafts, draft, onboardingSubmitted, isEditingSubmittedDetails, sourceFormData, submittedSections],
  )
  const capturedSummary = useMemo(
    () => getSellerCapturedFieldSummary({ sections: submittedSections, data: sourceFormData }),
    [sourceFormData, submittedSections],
  )
  const documentOverview = useMemo(
    () => buildSellerDocumentOverviewModel({ profile: requirementProfile, listing, journey }),
    [journey, listing, requirementProfile],
  )

  const sellerName = normalizeText(row.name || row.contact?.name || requirementProfile.sellerName) || 'Seller lead'
  const sellerPhone = normalizeText(row.phone || row.contact?.phone || requirementProfile.sellerContactPhone)
  const sellerEmail = normalizeText(row.email || row.contact?.email || requirementProfile.sellerContactEmail)
  const sourceLabel = normalizeText(sourceInfo?.leadSource || row.source || row.leadSource || 'Unknown')
  const portalLink = getSellerPortalLink(row, listing)
  const portalStatus = normalizeText(journey?.sellerPortalStatus || (portalLink ? 'Available' : 'Not opened')) || 'Not opened'
  const sentDateLabel = onboardingState === 'not_sent'
    ? 'Not sent'
    : formatDateTime(
      listing?.sellerOnboarding?.sentAt ||
        listing?.sellerOnboarding?.createdAt ||
        listing?.sellerOnboarding?.submittedAt ||
        row.updatedAt,
      'Not sent',
    )
  const lastUpdatedLabel = formatDateTime(
    listing?.sellerOnboarding?.updatedAt ||
      listing?.sellerOnboarding?.createdAt ||
      listing?.updatedAt ||
      row.updatedAt,
    'Not updated',
  )

  const syncDraftToSource = useCallback(() => {
    const nextDraft = clonePlainObject(sourceFormData)
    setDraft(nextDraft)
    setComplexDrafts(createComplexDraftState(nextDraft))
    setAddedFieldKeys([])
  }, [createComplexDraftState, sourceFormData])

  const beginEditing = useCallback(() => {
    setIsEditingSubmittedDetails(true)
    setMessage('')
    setError('')
  }, [])

  const discardChanges = useCallback(() => {
    syncDraftToSource()
    setIsEditingSubmittedDetails(false)
    setMessage('')
    setError('')
  }, [syncDraftToSource])

  const viewSubmittedOnboarding = useCallback(() => {
    setIsEditingSubmittedDetails(false)
    setMessage('')
    setError('')
    if (typeof document === 'undefined') return
    const target = document.getElementById('seller-onboarding-editor')
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [])

  const updateField = useCallback((key, value) => {
    setError('')
    setMessage('')
    setDraft((previous) => {
      const next = { ...(previous || {}), [key]: value }
      if (SELLER_PROFILE_ADDRESS_KEYS.includes(key)) {
        const normalizedAddress = normalizePropertyAddress({
          propertyAddressDetails: isPlainObject(previous?.propertyAddressDetails) ? previous.propertyAddressDetails : {},
          propertyAddressSearch: next.propertyAddressSearch || '',
          propertyAddressLine1: next.propertyAddressLine1 || '',
          propertyAddressLine2: next.propertyAddressLine2 || '',
          suburb: next.suburb || '',
          city: next.city || '',
          province: next.province || '',
          postalCode: next.postalCode || '',
          municipality: next.municipality || '',
          country: next.country || '',
        }, {}, createBlankPropertyAddress())
        return {
          ...next,
          propertyAddressDetails: normalizedAddress,
          propertyAddress: normalizedAddress.formatted || next.propertyAddress || '',
          propertyAddressSearch: normalizedAddress.query || next.propertyAddressSearch || '',
          propertyAddressLine1: normalizedAddress.line1 || next.propertyAddressLine1 || '',
          propertyAddressLine2: normalizedAddress.line2 || next.propertyAddressLine2 || '',
          suburb: normalizedAddress.suburb || next.suburb || '',
          city: normalizedAddress.city || next.city || '',
          province: normalizedAddress.province || next.province || '',
          postalCode: normalizedAddress.postalCode || next.postalCode || '',
          municipality: normalizedAddress.municipality || next.municipality || '',
          country: normalizedAddress.country || next.country || 'South Africa',
        }
      }
      return next
    })
  }, [])

  const updateComplexField = useCallback((key, value) => {
    setError('')
    setMessage('')
    setComplexDrafts((previous) => ({ ...(previous || {}), [key]: value }))
  }, [])

  const addMissingField = useCallback((key) => {
    if (!key) return
    setError('')
    setMessage('')
    setIsEditingSubmittedDetails(true)
    setAddedFieldKeys((previous) => (previous.includes(key) ? previous : [...previous, key]))
  }, [])

  const saveOverrides = useCallback(async () => {
    const listingId = getSellerListingId(row, listing || journey?.listing || null)
    if (!listingId) {
      setError('Link a seller listing before saving onboarding overrides.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const { nextDraft, patch, changedFields } = buildSellerOnboardingSubmissionPatch({
        sourceData: sourceFormData,
        draft,
        complexDrafts,
        addedFieldKeys,
      })

      if (!changedFields.length) {
        setMessage('No changes detected to save.')
        return
      }

      await updatePrivateListingOnboardingFormData(listingId, patch, {
        status: onboardingSubmitted ? onboardingStatus : 'in_progress',
      })

      const changedFieldLabels = changedFields.slice(0, 6).map((key) => humanizeSellerFieldKey(key)).join(', ')
      await createPrivateListingActivity({
        privateListingId: listingId,
        activityType: 'seller_onboarding_overrides_saved',
        activityTitle: 'Seller onboarding overrides saved',
        activityDescription: changedFieldLabels
          ? `Updated ${changedFieldLabels} from the Seller tab.`
          : 'Updated seller onboarding from the Seller tab.',
        performedBy: actor?.id || actor?.userId || null,
        visibility: 'internal',
        metadata: {
          sourceStatus: onboardingStatus || progressMeta.status || '',
          recordStatus: onboardingSubmitted ? onboardingStatus : 'in_progress',
          changedFields,
          addedFieldKeys,
        },
      }).catch(() => {})

      setDraft(nextDraft)
      setComplexDrafts(createComplexDraftState(nextDraft))
      setAddedFieldKeys([])
      setIsEditingSubmittedDetails(false)
      setMessage('Seller onboarding overrides saved.')
      await onSaved?.()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save seller onboarding overrides.')
    } finally {
      setSaving(false)
    }
  }, [
    actor?.id,
    actor?.userId,
    addedFieldKeys,
    complexDrafts,
    createComplexDraftState,
    draft,
    journey?.listing,
    listing,
    onboardingStatus,
    onboardingSubmitted,
    onSaved,
    progressMeta.status,
    row,
    sourceFormData,
  ])

  const snapshotAction = (() => {
    if (onboardingState === 'not_sent') {
      return (
        <button
          type="button"
          onClick={onSendSellerOnboarding}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!onSendSellerOnboarding || sendingOnboarding}
        >
          {sendingOnboarding ? 'Sending seller onboarding...' : 'Send seller onboarding'}
        </button>
      )
    }
    if (onboardingState === 'sent') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onResendSellerPortalLink}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!onResendSellerPortalLink || !portalLink}
          >
            Resend seller portal link
          </button>
          <button
            type="button"
            onClick={onCopySellerPortalLink}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!onCopySellerPortalLink || !portalLink}
          >
            Copy portal link
          </button>
        </div>
      )
    }
    if (isEditingSubmittedDetails) {
      return (
        <button
          type="button"
          onClick={saveOverrides}
          disabled={saving}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saving ? 'Saving...' : 'Save overrides'}
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={viewSubmittedOnboarding}
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        View submitted onboarding
      </button>
    )
  })()

  const snapshotStatusTone = progressMeta.state === 'completed' || progressMeta.state === 'submitted'
    ? 'green'
    : progressMeta.state === 'sent'
      ? 'amber'
      : 'slate'

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <SellerWorkspaceCard
          title="Seller Snapshot"
          action={(
            <div className="flex flex-wrap items-center justify-end gap-2">
              <StatusPill tone={snapshotStatusTone}>{progressMeta.label}</StatusPill>
              {snapshotAction}
            </div>
          )}
        >
          <dl className="flex flex-1 flex-col">
            <SellerInfoRow label="Seller" value={sellerName} />
            <SellerInfoRow label="Phone" value={sellerPhone || '—'} />
            <SellerInfoRow label="Email" value={sellerEmail || '—'} />
            <SellerInfoRow label="Source" value={sourceLabel} />
            {onboardingState !== 'not_sent' ? (
              <SellerInfoRow label="Captured Fields" value={capturedSummary.label} />
            ) : null}
            <SellerInfoRow label="Last Updated" value={lastUpdatedLabel} />
          </dl>
        </SellerWorkspaceCard>

        <SellerWorkspaceCard
          title="Document Readiness"
          action={(
            <StatusPill tone={onboardingSubmitted ? (documentOverview.percent >= 80 ? 'green' : documentOverview.percent ? 'amber' : 'slate') : progressMeta.tone}>
              {onboardingSubmitted ? `${documentOverview.percent}% complete` : progressMeta.label}
            </StatusPill>
          )}
        >
          {onboardingSubmitted ? (
            <div className="flex h-full flex-col gap-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <ListingReadinessCircle percent={documentOverview.percent} />
                <div className="min-w-0">
                  <p className="text-lg font-semibold tracking-[-0.035em] text-slate-950">Document readiness</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                    {documentOverview.summary.completed} completed, {documentOverview.summary.outstanding} outstanding, {documentOverview.summary.notStarted} not started
                  </p>
                </div>
              </div>
              <div className="grid gap-2 text-sm font-medium text-slate-600">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
                  <span>Completed</span>
                  <span className="font-semibold text-emerald-700">{documentOverview.summary.completed}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
                  <span>Outstanding</span>
                  <span className="font-semibold text-amber-700">{documentOverview.summary.outstanding}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
                  <span>Not started</span>
                  <span className="font-semibold text-slate-700">{documentOverview.summary.notStarted}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
              <p className="text-sm font-semibold text-slate-950">Waiting for seller submission</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Document readiness will populate once the seller has submitted onboarding details.
              </p>
              <div className="mt-4 grid gap-2 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2">
                  <span>Sent date</span>
                  <span className="font-semibold text-slate-900">{sentDateLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2">
                  <span>Portal status</span>
                  <span className="font-semibold text-slate-900">{portalStatus}</span>
                </div>
              </div>
            </div>
          )}
        </SellerWorkspaceCard>
      </div>

      <SellerWorkspaceCard
        id="seller-onboarding-editor"
        title="Seller Onboarding"
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusPill tone={snapshotStatusTone}>{progressMeta.label}</StatusPill>
            {onboardingState === 'not_sent' ? (
              <button
                type="button"
                onClick={onSendSellerOnboarding}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!onSendSellerOnboarding || sendingOnboarding}
              >
                {sendingOnboarding ? 'Sending seller onboarding...' : 'Send seller onboarding'}
              </button>
            ) : onboardingState === 'sent' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onResendSellerPortalLink}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={!onResendSellerPortalLink || !portalLink}
                >
                  Resend seller portal link
                </button>
                <button
                  type="button"
                  onClick={onCopySellerPortalLink}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!onCopySellerPortalLink || !portalLink}
                >
                  Copy portal link
                </button>
              </div>
            ) : isEditingSubmittedDetails ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={discardChanges}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveOverrides}
                  disabled={saving}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving ? 'Saving...' : 'Save overrides'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={beginEditing}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Edit submitted details
              </button>
            )}
          </div>
        )}
      >
        {message ? <p className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
        {error ? <p className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}

        {onboardingState === 'not_sent' ? (
          <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
            <p className="text-sm font-semibold text-slate-950">Onboarding not sent</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Send the onboarding form to collect seller and authority details.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSendSellerOnboarding}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!onSendSellerOnboarding || sendingOnboarding}
              >
                {sendingOnboarding ? 'Sending seller onboarding...' : 'Send seller onboarding'}
              </button>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-950">What the seller will submit</p>
              <p className="mt-2 leading-6">
                The seller will complete their details and upload the required documents.
                Submitted information will appear here once received.
              </p>
            </div>
          </div>
        ) : onboardingState === 'sent' ? (
          <div className="rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5">
            <p className="text-sm font-semibold text-slate-950">Seller onboarding sent</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Waiting for the seller to complete the form.
            </p>
            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2">
                <span>Sent date</span>
                <span className="font-semibold text-slate-900">{sentDateLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2">
                <span>Portal status</span>
                <span className="font-semibold text-slate-900">{portalStatus}</span>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onResendSellerPortalLink}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!onResendSellerPortalLink || !portalLink}
              >
                Resend seller portal link
              </button>
              <button
                type="button"
                onClick={onCopySellerPortalLink}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!onCopySellerPortalLink || !portalLink}
              >
                Copy portal link
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
              Only populated submitted fields are shown by default.
              Click Edit submitted details to reveal blank but relevant fields for overrides.
            </div>
            {isEditingSubmittedDetails ? (
              <div className="mt-4 rounded-3xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                You are editing the seller submission copy.
                Save overrides writes an audit trail against the lead record and keeps the original seller submission as the baseline.
              </div>
            ) : null}
            {submittedSectionModels.length ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {submittedSectionModels.map((section) => (
                  <SellerSubmittedSectionCard
                    key={section.id}
                    section={section}
                    editable={onboardingSubmitted && isEditingSubmittedDetails}
                    onChange={updateField}
                    onComplexChange={updateComplexField}
                    onAddField={addMissingField}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-6">
                <p className="text-sm font-semibold text-slate-900">No submitted fields captured yet</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  The seller submission exists, but no populated values were returned.
                  Click Edit submitted details to add the missing information.
                </p>
                {!isEditingSubmittedDetails ? (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={beginEditing}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] hover:bg-slate-800"
                    >
                      Edit submitted details
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </SellerWorkspaceCard>
    </div>
  )
}

function SellerPropertyTab({ row, listing }) {
  const property = getSellerPropertySummary(row, listing)
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <SellerPropertyPreviewCard row={row} listing={listing} />
      <SellerWorkspaceCard title="Property Detail">
        <dl className="flex flex-1 flex-col">
          <SellerInfoRow label="Address" value={property.address} />
          <SellerInfoRow label="Property Type" value={property.propertyType} />
          <SellerInfoRow label="Estimated Value" value={property.estimatedValue ? formatCurrency(property.estimatedValue) : 'Value pending'} />
          <SellerInfoRow label="Bedrooms" value={property.bedrooms || 'Pending'} />
          <SellerInfoRow label="Bathrooms" value={property.bathrooms || 'Pending'} />
          <SellerInfoRow label="Erf Size" value={property.erfSize || 'Pending'} />
          <SellerInfoRow label="Description" value={property.description || 'Pending'} />
        </dl>
      </SellerWorkspaceCard>
    </div>
  )
}

function SellerCommissionCard({
  commissionDraft,
  commissionSummary,
  commissionStructures = [],
  commissionStructuresLoading = false,
  savingCommission = false,
  onCommissionDraftChange,
  onSaveCommission,
}) {
  const structures = Array.isArray(commissionStructures) ? commissionStructures.filter((item) => item?.isActive !== false) : []
  const percentage = toFiniteNumber(commissionDraft?.percentage)
  const amount = toFiniteNumber(commissionDraft?.amount)
  const estimatedExVat = amount || commissionSummary?.estimatedExVat || 0
  const vatHandling = normalizeText(commissionDraft?.vatHandling).toLowerCase()
  const vatIncluded = ['yes', 'inclusive'].includes(vatHandling) || vatHandling.includes('incl')
  const estimatedInclVat = vatIncluded ? estimatedExVat : estimatedExVat ? estimatedExVat * 1.15 : 0
  const selectedStructure = structures.find((item) => normalizeText(item.id || item.name) === normalizeText(commissionDraft?.agencyStructureId))
  const update = (key, value) => onCommissionDraftChange?.(key, value)
  return (
    <SellerWorkspaceCard
      title="Commission Structure"
      action={<StatusPill tone={commissionSummary?.hasData ? 'green' : 'slate'}>{commissionSummary?.hasData ? 'Captured' : 'Pending'}</StatusPill>}
      className="min-h-[420px]"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Agency Split</span>
          <select
            value={commissionDraft?.agencyStructureId || ''}
            onChange={(event) => {
              const next = structures.find((item) => normalizeText(item.id || item.name) === normalizeText(event.target.value))
              update('agencyStructureId', event.target.value)
              update('agencyStructureName', next?.name || '')
            }}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
          >
            <option value="">{commissionStructuresLoading ? 'Loading structures...' : 'No split selected'}</option>
            {structures.map((structure) => (
              <option key={structure.id || structure.name} value={structure.id || structure.name}>
                {structure.name}{structure.isDefault ? ' (Default)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Mandate Commission</span>
          <select
            value={commissionDraft?.commissionType || 'percentage'}
            onChange={(event) => update('commissionType', event.target.value)}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed Amount</option>
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Commission %</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={commissionDraft?.percentage || ''}
            onChange={(event) => update('percentage', event.target.value)}
            placeholder="5"
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Fixed Amount</span>
          <input
            type="number"
            min="0"
            step="1000"
            value={commissionDraft?.amount || ''}
            onChange={(event) => update('amount', event.target.value)}
            placeholder={estimatedExVat ? String(Math.round(estimatedExVat)) : '0'}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">VAT Handling</span>
          <select
            value={commissionDraft?.vatHandling || ''}
            onChange={(event) => update('vatHandling', event.target.value)}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
          >
            <option value="">Not captured</option>
            <option value="no">No VAT</option>
            <option value="exclusive">VAT Exclusive</option>
            <option value="inclusive">VAT Inclusive</option>
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Paid By</span>
          <select
            value={commissionDraft?.paymentResponsibility || ''}
            onChange={(event) => update('paymentResponsibility', event.target.value)}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
          >
            <option value="">Not captured</option>
            <option value="seller">Seller</option>
            <option value="buyer">Buyer</option>
            <option value="split">Split</option>
            <option value="agency">Agency</option>
          </select>
        </label>
      </div>
      <label className="mt-4 grid gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Mandate Terms</span>
        <input
          value={commissionDraft?.mandateTerms || ''}
          onChange={(event) => update('mandateTerms', event.target.value)}
          placeholder="Sole mandate, payable on registration"
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
        />
      </label>
      <label className="mt-4 grid gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Notes / Special Conditions</span>
        <textarea
          rows={3}
          value={commissionDraft?.notes || ''}
          onChange={(event) => update('notes', event.target.value)}
          placeholder="Capture exclusions, overrides, or seller-specific commission notes."
          className="min-h-[96px] rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
        />
      </label>
      <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
        <SellerInfoRow label="Split Profile" value={selectedStructure?.name || commissionDraft?.agencyStructureName || 'Not selected'} />
        <SellerInfoRow label="Ex VAT" value={estimatedExVat ? formatCurrency(estimatedExVat) : 'Not captured'} />
        <SellerInfoRow label="Incl VAT" value={estimatedInclVat ? formatCurrency(estimatedInclVat) : 'Not captured'} />
      </div>
      <button
        type="button"
        onClick={() => onSaveCommission?.(commissionDraft)}
        disabled={savingCommission}
        className="mt-5 inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <CreditCard size={16} />
        {savingCommission ? 'Saving...' : 'Save Commission'}
      </button>
      {percentage || amount ? <p className="mt-2 text-xs font-semibold text-slate-500">Saved terms sync to seller onboarding data for mandate merge fields.</p> : null}
    </SellerWorkspaceCard>
  )
}

function SellerMandateTab({
  row,
  listing,
  journey,
  onboardingStatus = '',
  commissionDraft,
  commissionSummary,
  commissionStructures = [],
  commissionStructuresLoading = false,
  savingCommission = false,
  onCommissionDraftChange,
  onSaveCommission,
  onGenerateMandate,
}) {
  const mandateMeta = getSellerMandateMeta(row, listing, journey)
  const mandateRequiresOnboarding = !mandateMeta.hasRecord && !sellerOnboardingIsSubmitted(onboardingStatus)
  const mandateActionHelp = mandateRequiresOnboarding
    ? 'Seller onboarding must be submitted before generating a mandate.'
    : mandateMeta.actionLabel
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <SellerWorkspaceCard title="Mandate Status" action={<StatusPill tone={mandateMeta.tone}>{mandateMeta.label}</StatusPill>}>
        <dl className="flex flex-1 flex-col">
          <SellerInfoRow label="Status" value={mandateMeta.label} />
          <SellerInfoRow label="Packet Id" value={row.mandatePacketId || row.mandate_packet_id || listing?.mandatePacketId || listing?.mandate_packet_id} />
          <SellerInfoRow label="Date Signed" value={formatDateTime(row.mandateSignedAt || row.mandate_signed_at || listing?.mandateSignedAt || listing?.mandate_signed_at)} />
          <SellerInfoRow label="Seller Portal" value={journey?.sellerPortalStatus || 'Not opened'} />
        </dl>
        <button
          type="button"
          onClick={onGenerateMandate}
          disabled={mandateRequiresOnboarding}
          title={mandateActionHelp}
          className={`mt-5 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${mandateRequiresOnboarding ? 'bg-slate-200 text-slate-500' : 'bg-slate-950 text-white hover:bg-slate-800'}`}
        >
          {mandateMeta.actionLabel}
        </button>
        {mandateRequiresOnboarding ? <p className="mt-2 text-xs font-semibold text-slate-500">{mandateActionHelp}</p> : null}
      </SellerWorkspaceCard>
      <div className="grid gap-6">
        <SellerCommissionCard
          commissionDraft={commissionDraft}
          commissionSummary={commissionSummary}
          commissionStructures={commissionStructures}
          commissionStructuresLoading={commissionStructuresLoading}
          savingCommission={savingCommission}
          onCommissionDraftChange={onCommissionDraftChange}
          onSaveCommission={onSaveCommission}
        />
        <SellerWorkspaceCard title="Mandate History" className="min-h-[220px]">
          <div className="space-y-3">
            {[
              ['Generated', sellerMandateHasRecord(row, listing, journey) ? 'Available' : 'Not generated'],
              ['Sent', ['sent', 'signed'].includes(getSellerMandateStatus(row, listing, journey)) ? 'Sent' : 'Pending'],
              ['Signed', mandateMeta.mode === 'signed' ? 'Signed' : 'Pending'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3 py-3">
                <span className="text-sm font-semibold text-slate-700">{label}</span>
                <span className="text-sm font-semibold text-slate-950">{value}</span>
              </div>
            ))}
          </div>
        </SellerWorkspaceCard>
      </div>
    </div>
  )
}

function SellerDocumentsTab({ journey, listing = null, row = {} }) {
  const documents = useMemo(() => {
    const journeyDocuments = Array.isArray(journey?.documents) ? journey.documents : []
    const listingDocuments = buildSellerDocumentRowsFromListing(listing, row)
    return mergeSellerDocumentRows(journeyDocuments, listingDocuments)
  }, [journey, listing, row])
  const completion = getSellerDocumentCompletion(documents)
  const summary = useMemo(() => getSellerDocumentStatusSummary(documents), [documents])
  const [activeTab, setActiveTab] = useState('property')
  const [searchValue, setSearchValue] = useState('')
  const searchableDocuments = useMemo(
    () => documents.filter((document) => document?.required !== false && document?.applicable !== false),
    [documents],
  )
  const resolvedActiveTab = useMemo(() => {
    if (SELLER_DOCUMENT_CENTER_TABS.some((tab) => tab.key === activeTab) && getSellerDocumentCountForTab(searchableDocuments, activeTab)) {
      return activeTab
    }
    return SELLER_DOCUMENT_CENTER_TABS.find((tab) => getSellerDocumentCountForTab(searchableDocuments, tab.key) > 0)?.key || activeTab
  }, [activeTab, searchableDocuments])

  const filteredDocuments = useMemo(() => {
    const query = normalizeText(searchValue).toLowerCase()
    return searchableDocuments.filter((document) => {
      const matchesTab = normalizeText(document.category).toLowerCase() === resolvedActiveTab
      const haystack = [
        document?.title,
        document?.label,
        document?.description,
        document?.whyNeeded,
        document?.uploadedFileName,
      ].filter(Boolean).join(' ').toLowerCase()
      const matchesSearch = !query || haystack.includes(query)
      return matchesTab && matchesSearch
    })
  }, [resolvedActiveTab, searchValue, searchableDocuments])

  return (
    <SellerWorkspaceCard title="Document Center" action={<StatusPill tone={completion.percent >= 80 ? 'green' : completion.percent ? 'amber' : 'slate'}>{completion.percent}% complete</StatusPill>}>
      <p className="text-sm leading-6 text-slate-500">Track seller uploads, FICA, property documents, and additional requests.</p>
      <div className="mt-5 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-5 xl:h-[420px]">
          <ListingReadinessCircle percent={completion.percent} />
          <p className="mt-4 text-lg font-semibold tracking-[-0.035em] text-slate-950">Documents Complete</p>
          <p className="mt-1 text-sm font-medium text-slate-500">{completion.complete}/{completion.total} requirements complete</p>
          <div className="mt-5 space-y-3">
            {[
              ['Outstanding', summary.outstanding, 'bg-amber-500'],
              ['Uploaded', summary.uploaded, 'bg-blue-500'],
              ['Under Review', summary.underReview, 'bg-slate-500'],
              ['Approved', summary.approved, 'bg-emerald-500'],
              ['Rejected', summary.rejected, 'bg-rose-500'],
            ].filter(([, count]) => count > 0 || searchableDocuments.length).map(([label, count, dotClass]) => (
              <div key={label} className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
                <span className="inline-flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                  {label}
                </span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-4 xl:flex xl:h-[420px] xl:flex-col xl:overflow-hidden">
          <div className="flex flex-wrap gap-2">
            {SELLER_DOCUMENT_CENTER_TABS.map((tab) => {
              const count = getSellerDocumentCountForTab(searchableDocuments, tab.key)
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${resolvedActiveTab === tab.key ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {tab.label}
                  <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs ${resolvedActiveTab === tab.key ? 'bg-white text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative w-full lg:max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search documents..."
                className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-blue-300"
              />
            </label>
          </div>

          {!searchableDocuments.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 xl:flex-1">
              <p className="text-base font-semibold text-slate-950">No seller document requirements have been generated yet.</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">Once seller document requirements are created in the shared workflow, they will appear here automatically.</p>
            </div>
          ) : filteredDocuments.length ? (
            <div className="space-y-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-2">
              {filteredDocuments.map((document) => (
                <article key={document.id} className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold tracking-[-0.03em] text-slate-950">{document.title || document.label}</h3>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getSellerDocumentCategoryTone(document.category)}`}>
                          {getSellerDocumentCategoryLabel(document.category)}
                        </span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getDocumentStatusTone(document.status)}`}>
                          {getSellerDocumentDisplayStatus(document)}
                        </span>
                      </div>
                      {document.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{document.description}</p> : null}
                      {document.whyNeeded ? <p className="mt-2 text-xs font-medium text-slate-500">Why this is needed: {document.whyNeeded}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-slate-500">
                        {document.uploadedFileName ? <span>File: <span className="font-semibold text-slate-700">{document.uploadedFileName}</span></span> : null}
                        {document.uploadedAt ? <span>Uploaded {formatDateTime(document.uploadedAt, 'Recently')}</span> : null}
                        {document.uploadedBy ? <span>By {document.uploadedBy}</span> : null}
                        {document.requestedBy ? <span>Requested by {document.requestedBy}</span> : null}
                        {document.rejectionReason ? <span className="text-rose-600">Reason: {document.rejectionReason}</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {document.url ? (
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          View file
                        </a>
                      ) : (
                        <span className="inline-flex min-h-10 items-center rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-500">
                          Awaiting seller upload
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 xl:flex-1">
              <p className="text-base font-semibold text-slate-950">No documents match the current filters.</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">Try a different category or search term to view the seller requirement list.</p>
            </div>
          )}
        </div>
      </div>
    </SellerWorkspaceCard>
  )
}

function SellerTimelineList({ timeline = [], limit = 8, compact = false }) {
  const items = getSellerTimelineItems(timeline, limit)
  return (
    <div className="divide-y divide-slate-100">
      {items.length ? items.map((item) => (
        <article key={item.key} className={`grid gap-3 py-4 ${compact ? 'grid-cols-[32px_minmax(0,1fr)]' : 'sm:grid-cols-[40px_minmax(0,1fr)_170px] sm:items-center'}`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Clock3 size={16} /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 truncate text-sm text-slate-500">{item.description}</p>
          </div>
          {!compact ? <time className="text-sm font-semibold text-slate-500 sm:text-right">{formatDateTime(item.timestamp, 'No date')}</time> : null}
        </article>
      )) : <p className="py-3 text-sm text-slate-500">No seller activity yet.</p>}
    </div>
  )
}

function SellerTimelineSummaryCard({ row = {}, listing = null, journey = null, readiness = null, onTabChange }) {
  const summary = buildSellerTimelineSummary({ row, listing, journey, readiness })
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Timeline Summary</p>
      <h3 className="mt-3 text-lg font-semibold tracking-[-0.035em] text-slate-950">{summary.leadStatus}</h3>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{summary.next}</p>
      <button type="button" onClick={() => onTabChange?.('overview')} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        View next steps
      </button>
    </section>
  )
}

function SellerTimelineMilestonesCard({ row = {}, listing = null, journey = null }) {
  const milestones = getSellerMilestones({ row, listing, journey })
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Key Milestones</p>
      <div className="mt-4 space-y-3">
        {milestones.map((milestone) => (
          <div key={milestone.key} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
            <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border ${milestone.complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
              {milestone.complete ? <CheckCircle2 size={15} /> : <Clock3 size={14} />}
            </span>
            <div className="min-w-0">
              <p className={`truncate text-sm font-semibold ${milestone.complete ? 'text-slate-950' : 'text-slate-500'}`}>{milestone.label}</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-400">{milestone.complete ? formatDate(milestone.date, 'Date unavailable') : 'Upcoming'}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SellerActivityAvatar({ name = '' }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
      {getInitials(name)}
    </span>
  )
}

function SellerActivityCard({ event, density = 'list' }) {
  const Icon = getSellerActivityIcon(event.category, event.tone)
  const toneClasses = {
    success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    workflow: 'border-blue-100 bg-blue-50 text-blue-700',
    attention: 'border-amber-100 bg-amber-50 text-amber-700',
    risk: 'border-rose-100 bg-rose-50 text-rose-700',
  }
  const compact = density === 'compact'
  return (
    <article className={`relative grid min-w-0 gap-3 border-b border-slate-100 last:border-b-0 ${compact ? 'py-3 sm:grid-cols-[40px_minmax(0,1fr)]' : 'py-5 sm:grid-cols-[44px_minmax(0,1fr)_88px]'}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${toneClasses[event.tone] || toneClasses.workflow}`}>
        {createElement(Icon, { size: 17 })}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold text-slate-950">{event.title}{event.count > 1 ? ` x${event.count}` : ''}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-500">{event.category}</span>
        </div>
        {!compact ? <p className="mt-1 text-sm leading-6 text-slate-600">{event.description}</p> : null}
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold text-slate-500">
          <SellerActivityAvatar name={event.actor} />
          <span className="truncate text-slate-700">{event.actor}</span>
          <span>{event.timestamp ? formatRelativeTime(event.timestamp, 'Date unavailable') : 'Date unavailable'}</span>
          {event.timestamp ? <span>{formatDateTime(event.timestamp, 'Date unavailable')}</span> : null}
        </div>
      </div>
      <button type="button" className="absolute right-0 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label="Activity event actions">
        <MoreVertical size={16} />
      </button>
    </article>
  )
}

function SellerPremiumActivityFeed({ events = [], density = 'list', className = '' }) {
  if (!events.length) {
    return (
      <div className={`mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center ${className}`}>
        <p className="text-base font-semibold text-slate-950">No activity yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Activity will appear here as the seller progresses from lead to listing.</p>
      </div>
    )
  }
  return (
    <div className={`mt-2 divide-y divide-slate-100 ${className}`}>
      {events.map((event) => <SellerActivityCard key={event.key} event={event} density={density} />)}
    </div>
  )
}

function SellerActivityInsightsPanel({
  insights,
  dateRange,
  toneFilter,
  actorFilter,
  actorOptions = [],
  onDateRangeChange,
  onToneFilterChange,
  onActorFilterChange,
}) {
  const rows = [
    ['Total Events', insights.total],
    ['Last 7 Days', insights.last7Days],
    ['Documents', insights.documents],
    ['Appointments', insights.appointments],
    ['Pending Actions', insights.pendingActions],
  ]
  return (
    <aside className="grid min-w-0 gap-5 lg:grid-cols-2 xl:grid-cols-1">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Activity Insights</p>
        <dl className="mt-4 space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-sm font-semibold text-slate-600">{label}</dt>
              <dd className="text-sm font-semibold text-slate-950">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Filters</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            Date range
            <select value={dateRange} onChange={(event) => onDateRangeChange?.(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none focus:border-blue-300">
              <option value="all">All time</option>
              <option value="last_7">Last 7 days</option>
              <option value="last_30">Last 30 days</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            Event type
            <select value={toneFilter} onChange={(event) => onToneFilterChange?.(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none focus:border-blue-300">
              <option value="all">All types</option>
              <option value="success">Success</option>
              <option value="workflow">Workflow</option>
              <option value="attention">Attention</option>
              <option value="risk">Error / Risk</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            Actor
            <select value={actorFilter} onChange={(event) => onActorFilterChange?.(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none focus:border-blue-300">
              <option value="all">All actors</option>
              {actorOptions.map((actor) => <option key={actor} value={actor}>{actor}</option>)}
            </select>
          </label>
          <button type="button" disabled className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-400">
            Export Activity
          </button>
        </div>
      </section>
    </aside>
  )
}

function SellerActivityTab({ timeline = [], row = {}, listing = null, journey = null, readiness = null, onTabChange }) {
  const rawEvents = useMemo(() => (Array.isArray(timeline) ? timeline : []).map(normalizeSellerActivityEvent), [timeline])
  const dedupedEvents = useMemo(() => dedupeSellerActivityEvents(rawEvents), [rawEvents])
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [density, setDensity] = useState('list')
  const [dateRange, setDateRange] = useState('all')
  const [toneFilter, setToneFilter] = useState('all')
  const [actorFilter, setActorFilter] = useState('all')
  const filteredEvents = useMemo(() => {
    const now = new Date()
    return dedupedEvents
      .filter((event) => categoryFilter === 'all' || event.category === categoryFilter)
      .filter((event) => toneFilter === 'all' || event.tone === toneFilter)
      .filter((event) => actorFilter === 'all' || event.actor === actorFilter)
      .filter((event) => {
        if (dateRange === 'all') return true
        const date = readDate(event.timestamp)
        if (!date) return false
        const days = dateRange === 'last_7' ? 7 : 30
        return now.getTime() - date.getTime() <= days * 86_400_000
      })
      .sort((left, right) => {
        const leftTime = readDate(left.timestamp)?.getTime() || 0
        const rightTime = readDate(right.timestamp)?.getTime() || 0
        return sortOrder === 'oldest' ? leftTime - rightTime : rightTime - leftTime
      })
  }, [actorFilter, categoryFilter, dateRange, dedupedEvents, sortOrder, toneFilter])
  const actorOptions = useMemo(() => Array.from(new Set(dedupedEvents.map((event) => event.actor).filter(Boolean))).sort(), [dedupedEvents])
  const categoryOptions = [
    { key: 'all', label: 'All' },
    { key: 'communication', label: 'Communication' },
    { key: 'documents', label: 'Documents' },
    { key: 'mandate', label: 'Mandate' },
    { key: 'appointments', label: 'Appointments' },
    { key: 'system', label: 'System' },
  ]

  return (
    <SellerWorkspaceCard title="Activity Workspace" className="min-h-0">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.035em] text-slate-950">Activity</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{rawEvents.length} events</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-300">
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {['compact', 'list'].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDensity(option)}
                  className={`min-h-8 rounded-lg px-3 text-xs font-semibold capitalize ${density === option ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid min-w-0 gap-5 lg:grid-cols-12">
          <div className="grid min-w-0 gap-5 lg:col-span-4 xl:col-span-3">
            <SellerTimelineSummaryCard row={row} listing={listing} journey={journey} readiness={readiness} onTabChange={onTabChange} />
            <SellerTimelineMilestonesCard row={row} listing={listing} journey={journey} />
          </div>
          <div className="min-w-0 lg:col-span-8 xl:col-span-6">
            <div className="flex h-[560px] min-h-[380px] min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4">
              <div className="shrink-0 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap gap-2">
                  {categoryOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setCategoryFilter(option.key)}
                      className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold transition ${categoryFilter === option.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <SellerPremiumActivityFeed events={filteredEvents} density={density} className="min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-gutter:stable]" />
            </div>
          </div>
          <div className="min-w-0 lg:col-span-12 xl:col-span-3">
            <SellerActivityInsightsPanel
              insights={getSellerActivityInsights(rawEvents, readiness)}
              dateRange={dateRange}
              toneFilter={toneFilter}
              actorFilter={actorFilter}
              actorOptions={actorOptions}
              onDateRangeChange={setDateRange}
              onToneFilterChange={setToneFilter}
              onActorFilterChange={setActorFilter}
            />
          </div>
        </div>
      </div>
    </SellerWorkspaceCard>
  )
}

function SellerTabContent({
  activeTab,
  row,
  sourceInfo,
  journey,
  readiness,
  listing,
  onboardingStatus,
  timeline,
  organisationId,
  actor,
  commissionDraft,
  commissionSummary,
  commissionStructures,
  commissionStructuresLoading,
  savingCommission,
  sendingSellerOnboarding,
  onCommissionDraftChange,
  onSaveCommission,
  onSaved,
  onSendSellerOnboarding,
  onResendSellerPortalLink,
  onCopySellerPortalLink,
  onTabChange,
  onGenerateMandate,
  appointmentComposerSignal = 0,
}) {
  if (activeTab === 'seller') {
    return (
      <SellerProfileTab
        row={row}
        sourceInfo={sourceInfo}
        journey={journey}
        onboardingStatus={onboardingStatus}
        listing={listing}
        actor={actor}
        sendingOnboarding={sendingSellerOnboarding}
        onSaved={onSaved}
        onSendSellerOnboarding={onSendSellerOnboarding}
        onResendSellerPortalLink={onResendSellerPortalLink}
        onCopySellerPortalLink={onCopySellerPortalLink}
      />
    )
  }
  if (activeTab === 'property') return <SellerPropertyTab row={row} listing={listing} />
  if (activeTab === 'mandate') {
    return (
      <SellerMandateTab
        row={row}
        listing={listing}
        journey={journey}
        onboardingStatus={onboardingStatus}
        commissionDraft={commissionDraft}
        commissionSummary={commissionSummary}
        commissionStructures={commissionStructures}
        commissionStructuresLoading={commissionStructuresLoading}
        savingCommission={savingCommission}
        onCommissionDraftChange={onCommissionDraftChange}
        onSaveCommission={onSaveCommission}
        onGenerateMandate={onGenerateMandate}
      />
    )
  }
  if (activeTab === 'appointments') {
    return (
      <SellerAppointmentsTab
        organisationId={organisationId}
        lead={row}
        listing={listing}
        actor={actor}
        onSaved={onSaved}
        openComposerSignal={appointmentComposerSignal}
      />
    )
  }
  if (activeTab === 'documents') return <SellerDocumentsTab journey={journey} listing={listing} row={row} />
  if (activeTab === 'activity') return <SellerActivityTab timeline={timeline} row={row} listing={listing} journey={journey} readiness={readiness} onTabChange={onTabChange} />
  return (
    <SellerOverviewTab
      row={row}
      sourceInfo={sourceInfo}
      journey={journey}
      readiness={readiness}
      timeline={timeline}
      organisationId={organisationId}
      actor={actor}
      onSaved={onSaved}
      onTabChange={onTabChange}
    />
  )
}

function SellerKpiRow({ row, journey = null }) {
  const cards = [
    { label: 'Lead Age', value: `${Math.max(0, Number(journey?.kpis?.find((item) => item.key === 'lead_age')?.value || 0))} Days` },
    { label: 'Mandate Status', value: formatSellerJourneyValue({ value: journey?.mandateStatus || 'not_started' }).replace(/_/g, ' ') },
    { label: 'Listing Status', value: journey?.listingCreated ? journey?.listingLive ? 'Live' : 'Draft' : 'Not Created' },
    { label: 'Offers', value: `${row.offers?.length || row.offerCount || 0} Offers` },
  ]
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className={`${panelClass} flex min-h-[116px] flex-col justify-between p-5`}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{card.label}</p>
          <strong className="mt-4 block truncate text-2xl font-semibold tracking-[-0.045em] capitalize text-slate-950">{card.value}</strong>
        </article>
      ))}
    </section>
  )
}

function SellerDetailsCard({ row, sourceInfo, journey }) {
  return (
    <SellerWorkspaceCard title="Seller Details" id="seller-details">
      <dl className="flex flex-1 flex-col">
        <SellerInfoRow label="Property" value={getLeadContextSummary(row)} />
        <SellerInfoRow label="Estimated Value" value={formatCurrency(row.estimatedValue || row.estimated_value)} />
        <SellerInfoRow label="Source" value={sourceInfo?.leadSource || row.source} />
        <SellerInfoRow label="Created" value={formatDate(row.createdAt)} />
        <SellerInfoRow label="Portal" value={journey?.sellerPortalStatus || 'Not opened'} />
      </dl>
    </SellerWorkspaceCard>
  )
}

function SellerDocumentsSummaryCard({ journey = null }) {
  const documents = Array.isArray(journey?.documents) ? journey.documents : []
  const completion = getSellerDocumentCompletion(documents)
  const summary = getSellerDocumentStatusSummary(documents)
  const topDocuments = documents
    .filter((document) => document?.required !== false && document?.applicable !== false)
    .slice(0, 4)
  return (
    <SellerWorkspaceCard
      density="compact"
      className="scroll-mt-6"
      title="Documents"
      action={<StatusPill tone={completion.percent >= 80 ? 'green' : completion.percent ? 'amber' : 'slate'}>{completion.percent}%</StatusPill>}
      id="seller-documents"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[1rem] font-semibold tracking-[-0.03em] text-slate-950">Documents Complete</p>
          <p className="mt-1 text-sm font-medium text-slate-500">{completion.complete}/{completion.total} requirements complete</p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-slate-500">{completion.percent}% complete</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[
          ['Outstanding', summary.outstanding],
          ['Uploaded', summary.uploaded + summary.underReview],
          ['Approved', summary.approved],
          ['Rejected', summary.rejected],
        ].map(([label, count]) => (
          <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{count}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
        {topDocuments.length ? topDocuments.map((document) => {
          return (
            <div key={document.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{document.label}</span>
              <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[11px] font-semibold ${getDocumentStatusTone(document.status)}`}>
                {getSellerDocumentDisplayStatus(document)}
              </span>
            </div>
          )
        }) : <p className="text-sm text-slate-500">No seller document requirements have been generated yet.</p>}
      </div>
    </SellerWorkspaceCard>
  )
}

function SellerOwnershipSummaryCard({ organisationId, lead, actor, onSaved }) {
  const [agentId, setAgentId] = useState(lead.assignedAgentId || '')
  const [queueId, setQueueId] = useState(lead.assignedQueueId || 'unassigned')
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const canManage = canManageLeadAssignment(actor, lead)

  useEffect(() => {
    setAgentId(lead.assignedAgentId || '')
    setQueueId(lead.assignedQueueId || 'unassigned')
  }, [lead.assignedAgentId, lead.assignedQueueId])

  async function run(label, action) {
    try {
      setSaving(label)
      setError('')
      await action()
      await onSaved()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update assignment.')
    } finally {
      setSaving('')
    }
  }

  return (
    <SellerWorkspaceCard
      density="compact"
      className="h-[320px]"
      title="Ownership"
      id="seller-ownership"
      action={<StatusPill tone={getSlaTone(lead.slaStatus)}>{formatSlaStatus(lead.slaStatus)}</StatusPill>}
    >
      <dl className="flex flex-1 flex-col">
        <SellerInfoRow label="Agent" value={getOwnerName(lead)} />
        <SellerInfoRow label="Queue" value={lead.assignedQueue || 'No queue'} />
        <SellerInfoRow label="SLA" value={formatDateTime(lead.slaDueAt)} />
        <SellerInfoRow label="Assigned Date" value={formatDateTime(lead.assignedAt)} />
      </dl>
      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {canManage ? (
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Manage Assignment</summary>
          <div className="mt-3 grid gap-3">
            <input value={agentId} onChange={(event) => setAgentId(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Agent user id" />
            <select value={queueId} onChange={(event) => setQueueId(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              {LEAD_ASSIGNMENT_QUEUES.map((queue) => <option key={queue} value={queue}>{queue.replace(/_/g, ' ')}</option>)}
            </select>
            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" disabled={Boolean(saving) || !agentId} onClick={() => run('agent', () => assignLeadToAgent({ organisationId, leadId: lead.leadId, agentId, reason: 'Assigned from Lead Workspace' }, { actor }))} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Assign</button>
              <button type="button" disabled={Boolean(saving)} onClick={() => run('queue', () => assignLeadToQueue({ organisationId, leadId: lead.leadId, queueId, reason: 'Assigned to queue from Lead Workspace' }, { actor }))} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-60">Queue</button>
              <button type="button" disabled={Boolean(saving)} onClick={() => run('auto', () => autoAssignLead({ organisationId, leadId: lead.leadId }, { actor }))} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 disabled:opacity-60">Auto</button>
            </div>
          </div>
        </details>
      ) : null}
    </SellerWorkspaceCard>
  )
}

function SellerCommunicationCard({ lead }) {
  const preferences = normalizeLeadCommunicationPreferences(
    lead?.communicationPreferences ||
    buildDefaultLeadCommunicationPreferences({ organisationId: lead?.organisationId || lead?.organisation_id, leadId: lead?.leadId }),
  )
  const deliveries = Array.isArray(lead?.communicationDeliveries) ? lead.communicationDeliveries : []
  const latestDelivery = deliveries[0] || null
  const latestActivityDate = getLatestActivityDate(lead.latestActivity)
  return (
    <SellerWorkspaceCard title="Communication">
      <dl className="flex flex-1 flex-col">
        <SellerInfoRow label="Preferred Channel" value={preferences.preferredChannel || 'Email'} />
        <SellerInfoRow label="Email Alerts" value={preferences.emailEnabled ? 'Enabled' : 'Paused'} />
        <SellerInfoRow label="WhatsApp Alerts" value={preferences.whatsappEnabled ? 'Enabled' : 'Paused'} />
        <SellerInfoRow label="Last Contact" value={formatDateTime(latestDelivery?.createdAt || latestDelivery?.preparedAt || latestActivityDate, 'None yet')} />
      </dl>
    </SellerWorkspaceCard>
  )
}

function SellerTimelinePanel({ timeline = [] }) {
  const items = (Array.isArray(timeline) ? timeline : []).slice(0, 8)
  return (
    <section id="seller-timeline" className={`${panelClass} scroll-mt-6 p-5`}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">Timeline</h2>
        <StatusPill>{items.length} events</StatusPill>
      </div>
      <div className="mt-4 divide-y divide-slate-100">
        {items.length ? items.map((item, index) => {
          const title = normalizeText(item.title || item.activityType || item.activity_type || item.type) || 'Lead Updated'
          const description = normalizeText(item.description || item.activityNote || item.activity_note || item.outcome) || 'Seller workflow activity'
          const timestamp = item.timestamp || item.activityDate || item.activity_date || item.createdAt || item.created_at
          return (
            <article key={item.id || item.activityId || `${title}-${timestamp}-${index}`} className="grid min-h-[72px] gap-4 py-4 sm:grid-cols-[36px_minmax(0,1fr)_150px] sm:items-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Clock3 size={16} /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{title}</p>
                <p className="mt-1 truncate text-sm text-slate-500">{description}</p>
              </div>
              <time className="text-sm font-semibold text-slate-500 sm:text-right">{formatRelativeTime(timestamp, 'No date')}</time>
            </article>
          )
        }) : <EmptyState title="No seller timeline yet" copy="Seller contact, onboarding, mandate, listing, and document events will appear here." />}
      </div>
    </section>
  )
}

function SellerLeadWorkspaceLayout({
  row,
  sourceInfo,
  sellerJourney,
  sellerReadiness,
  linkedSellerListing,
  sellerOnboardingStatus,
  sendingSellerOnboarding,
  sendingSellerPortalLink,
  sellerActionError,
  sellerActionMessage,
  organisationId,
  actor,
  timeline,
  savingCommission,
  onSaved,
  onSaveCommission,
  onSendSellerOnboarding,
  onResendSellerPortalLink,
  onOpenSellerPortalLink,
  onGenerateMandate,
  onOpenListing,
  onCopySellerPortalLink,
  onCopyListingLink,
  onMarkAsLost,
  onArchiveLead,
}) {
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState('overview')
  const [appointmentComposerSignal, setAppointmentComposerSignal] = useState(0)
  const sellerOnboardingInFlightRef = useRef(false)
  const commissionSummary = useMemo(() => getSellerCommissionWorkspace(row, linkedSellerListing), [linkedSellerListing, row])
  const [commissionDraft, setCommissionDraft] = useState(() => buildSellerCommissionDraft(commissionSummary))
  const [commissionStructures, setCommissionStructures] = useState([])
  const [commissionStructuresLoading, setCommissionStructuresLoading] = useState(false)
  useEffect(() => {
    setCommissionDraft(buildSellerCommissionDraft(commissionSummary))
  }, [commissionSummary])
  useEffect(() => {
    let active = true
    async function loadCommissionStructures() {
      try {
        setCommissionStructuresLoading(true)
        const rows = await listOrganisationCommissionStructures()
        if (active) setCommissionStructures(Array.isArray(rows) ? rows : [])
      } catch {
        if (active) setCommissionStructures([])
      } finally {
        if (active) setCommissionStructuresLoading(false)
      }
    }
    void loadCommissionStructures()
    return () => {
      active = false
    }
  }, [])
  const updateCommissionDraft = useCallback((key, value) => {
    setCommissionDraft((previous) => ({ ...previous, [key]: value }))
  }, [])
  const focusSellerWorkspaceSection = useCallback((sectionId = '') => {
    if (!sectionId || typeof window === 'undefined') return
    window.setTimeout(() => {
      const target = document.getElementById(sectionId)
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, 80)
  }, [])
  const openAppointmentComposer = useCallback(() => {
    setActiveWorkspaceTab('appointments')
    setAppointmentComposerSignal((value) => value + 1)
  }, [])
  const handleAcquisitionAction = useCallback((actionId = '') => {
    const key = normalizeText(actionId).toLowerCase()
    if (key === 'send_onboarding') onSendSellerOnboarding?.()
    else if (key === 'open_seller_portal') onOpenSellerPortalLink?.()
    else if (['generate_mandate', 'send_mandate', 'view_mandate', 'check_signature_status', 'resend_mandate'].includes(key)) onGenerateMandate?.()
    else if (['add_commission', 'review_commission', 'open_commission'].includes(key)) setActiveWorkspaceTab('mandate')
    else if (['create_listing', 'open_listing', 'complete_listing', 'activate_listing'].includes(key)) onOpenListing?.()
    else if (['open_documents'].includes(key)) setActiveWorkspaceTab('documents')
    else if (['schedule_appointment', 'open_appointments'].includes(key)) openAppointmentComposer()
    else if (['contact_seller', 'open_timeline'].includes(key)) setActiveWorkspaceTab('activity')
    else if (['capture_property_address'].includes(key)) setActiveWorkspaceTab('property')
    else if (key === 'edit_seller') {
      setActiveWorkspaceTab('seller')
      focusSellerWorkspaceSection('seller-onboarding-editor')
    }
    else if (key === 'assign_agent') {
      setActiveWorkspaceTab('overview')
      focusSellerWorkspaceSection('seller-ownership')
    } else if (key === 'open_journey') {
      focusSellerWorkspaceSection('seller-journey')
    } else if (key === 'open_readiness') {
      setActiveWorkspaceTab('documents')
    }
    else setActiveWorkspaceTab('overview')
  }, [focusSellerWorkspaceSection, onGenerateMandate, onOpenListing, onOpenSellerPortalLink, onSendSellerOnboarding, openAppointmentComposer])

  return (
    <div className="space-y-6">
      <SellerLeadHeader
        row={row}
        journey={sellerJourney}
        readiness={sellerReadiness}
        listing={linkedSellerListing}
        onboardingStatus={sellerOnboardingStatus}
        sendingOnboarding={sendingSellerOnboarding}
        sendingPortalLink={sendingSellerPortalLink}
        onSendSellerOnboarding={onSendSellerOnboarding}
        onResendSellerPortalLink={onResendSellerPortalLink}
        onGenerateMandate={onGenerateMandate}
        onOpenListing={onOpenListing}
        onOpenAppointments={openAppointmentComposer}
        onCopySellerPortalLink={onCopySellerPortalLink}
        onCopyListingLink={onCopyListingLink}
        onMarkAsLost={onMarkAsLost}
        onArchiveLead={onArchiveLead}
        onStatusAction={handleAcquisitionAction}
      />
      {sellerActionError ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{sellerActionError}</p> : null}
      {sellerActionMessage ? <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{sellerActionMessage}</p> : null}
      <SellerAcquisitionActionRow
        row={row}
        listing={linkedSellerListing}
        journey={sellerJourney}
        readiness={sellerReadiness}
        onboardingStatus={sellerOnboardingStatus}
        onAction={handleAcquisitionAction}
      />
      <SellerJourneyRail journey={sellerJourney} row={row} listing={linkedSellerListing} />
      <SellerWorkspaceTabs activeTab={activeWorkspaceTab} onTabChange={setActiveWorkspaceTab} />
      <SellerTabContent
        activeTab={activeWorkspaceTab}
        row={row}
        sourceInfo={sourceInfo}
        journey={sellerJourney}
        readiness={sellerReadiness}
        listing={linkedSellerListing}
        onboardingStatus={sellerOnboardingStatus}
        timeline={timeline}
        organisationId={organisationId}
        actor={actor}
        commissionDraft={commissionDraft}
        commissionSummary={commissionSummary}
        commissionStructures={commissionStructures}
        commissionStructuresLoading={commissionStructuresLoading}
        savingCommission={savingCommission}
        sendingSellerOnboarding={sendingSellerOnboarding}
        onCommissionDraftChange={updateCommissionDraft}
        onSaveCommission={onSaveCommission}
        onSaved={onSaved}
        onSendSellerOnboarding={onSendSellerOnboarding}
        onResendSellerPortalLink={onResendSellerPortalLink}
        onCopySellerPortalLink={onCopySellerPortalLink}
        onTabChange={setActiveWorkspaceTab}
        onGenerateMandate={onGenerateMandate}
        appointmentComposerSignal={appointmentComposerSignal}
      />
    </div>
  )
}

function OwnershipCard({ organisationId, lead, actor, onSaved }) {
  const [agentId, setAgentId] = useState(lead.assignedAgentId || '')
  const [queueId, setQueueId] = useState(lead.assignedQueueId || 'unassigned')
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const canManage = canManageLeadAssignment(actor, lead)

  useEffect(() => {
    setAgentId(lead.assignedAgentId || '')
    setQueueId(lead.assignedQueueId || 'unassigned')
  }, [lead.assignedAgentId, lead.assignedQueueId])

  async function run(label, action) {
    try {
      setSaving(label)
      setError('')
      await action()
      await onSaved()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update assignment.')
    } finally {
      setSaving('')
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Ownership</h3>
          <p className="mt-1 text-sm text-slate-500">Responsible owner, queue, and first-contact SLA for this lead.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={getSlaTone(lead.slaStatus)}>{formatSlaStatus(lead.slaStatus)}</StatusPill>
          <StatusPill>{formatSlaStatus(lead.ownershipStatus)}</StatusPill>
        </div>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Assigned Agent" value={lead.assignedAgent || 'Unassigned'} />
        <Field label="Assigned Team" value={lead.assignedQueue || '—'} />
        <Field label="Assigned Date" value={formatDateTime(lead.assignedAt)} />
        <Field label="Response SLA" value={formatDateTime(lead.slaDueAt)} />
        <Field label="First Contacted" value={formatDateTime(lead.firstContactedAt)} />
        <Field label="Response Time" value={lead.responseTimeHours !== null ? `${lead.responseTimeHours}h` : '—'} />
        <Field label="Agent Id" value={lead.assignedAgentId || '—'} />
        <Field label="Queue Id" value={lead.assignedQueueId || '—'} />
      </dl>

      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {canManage ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_180px_auto_auto_auto]">
          <input value={agentId} onChange={(event) => setAgentId(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Agent user id" />
          <select value={queueId} onChange={(event) => setQueueId(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            {LEAD_ASSIGNMENT_QUEUES.map((queue) => <option key={queue} value={queue}>{queue.replace(/_/g, ' ')}</option>)}
          </select>
          <button type="button" disabled={Boolean(saving) || !agentId} onClick={() => run('agent', () => assignLeadToAgent({ organisationId, leadId: lead.leadId, agentId, reason: 'Assigned from Lead Workspace' }, { actor }))} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">
            Assign
          </button>
          <button type="button" disabled={Boolean(saving)} onClick={() => run('queue', () => assignLeadToQueue({ organisationId, leadId: lead.leadId, queueId, reason: 'Assigned to queue from Lead Workspace' }, { actor }))} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
            Assign Queue
          </button>
          <button type="button" disabled={Boolean(saving)} onClick={() => run('auto', () => autoAssignLead({ organisationId, leadId: lead.leadId }, { actor }))} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 disabled:opacity-60">
            Auto-Assign
          </button>
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-3">
          <button type="button" disabled={Boolean(saving) || Boolean(lead.firstContactedAt)} onClick={() => run('contacted', () => markLeadFirstContacted({ organisationId, leadId: lead.leadId }, { actor }))} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 disabled:opacity-60">
            Mark First Contacted
          </button>
        </div>
      ) : null}

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-950">View History</summary>
        <div className="mt-3 divide-y divide-slate-100">
          {lead.assignmentHistory?.length ? lead.assignmentHistory.map((item) => (
            <div key={item.assignmentId || `${item.createdAt}-${item.reason}`} className="grid gap-2 py-3 text-sm sm:grid-cols-[150px_1fr]">
              <span className="font-semibold text-slate-500">{formatDateTime(item.createdAt)}</span>
              <span className="text-slate-700">
                {item.reason || 'Assignment updated'} · {item.previousAgentId || item.previousQueueId || 'none'} → {item.newAgentId || item.newQueueId || 'none'}
              </span>
            </div>
          )) : <p className="py-3 text-sm text-slate-500">No assignment history yet.</p>}
        </div>
      </details>
    </section>
  )
}

function AgentLeadWorkspace() {
  const { leadId } = useParams()
  const navigate = useNavigate()
  const workspaceContext = useWorkspace()
  const organisationId = getOrganisationId(workspaceContext)
  const actor = useMemo(() => getActor({
    ...(workspaceContext.profile || {}),
    workspaceRole: workspaceContext.currentMembership?.workspace_role || workspaceContext.currentMembership?.organisation_role || workspaceContext.currentMembership?.role || workspaceContext.profile?.role,
  }), [workspaceContext.currentMembership, workspaceContext.profile])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [shareDraft, setShareDraft] = useState(null)
  const [sellerActionError, setSellerActionError] = useState('')
  const [sellerActionMessage, setSellerActionMessage] = useState('')
  const [sendingSellerOnboarding, setSendingSellerOnboarding] = useState(false)
  const [sendingSellerPortalLink, setSendingSellerPortalLink] = useState(false)
  const [savingSellerCommission, setSavingSellerCommission] = useState(false)

  const loadWorkspace = useCallback(async () => {
    if (!organisationId || !leadId) return
    try {
      setLoading(true)
      setError('')
      const result = await fetchAgentLeadWorkspace({ organisationId, leadId, actor })
      setData(result)
    } catch (loadError) {
      setData(null)
      setError(loadError?.message || 'Unable to load this lead.')
    } finally {
      setLoading(false)
    }
  }, [actor, leadId, organisationId])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    let cancelled = false
    const refreshWorkspace = () => {
      if (cancelled) return
      void loadWorkspace()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshWorkspace()
      }
    }

    window.addEventListener('itg:seller-onboarding-submitted', refreshWorkspace)
    window.addEventListener('itg:listings-updated', refreshWorkspace)
    window.addEventListener('itg:pipeline-updated', refreshWorkspace)
    window.addEventListener('focus', refreshWorkspace)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.removeEventListener('itg:seller-onboarding-submitted', refreshWorkspace)
      window.removeEventListener('itg:listings-updated', refreshWorkspace)
      window.removeEventListener('itg:pipeline-updated', refreshWorkspace)
      window.removeEventListener('focus', refreshWorkspace)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadWorkspace])

  const row = data?.row || null
  const sourceInfo = row ? getLeadSourceInfo(row) : null
  const workspaceAnalytics = row ? buildLeadWorkspaceAnalyticsSummary(row) : null
  const leadCategory = row ? normalizeLeadCategory(row) : 'other'
  const isSellerLeadWorkspace = leadCategory === 'seller'
  const linkedSellerListing = useMemo(() => {
    if (!row) return null
    const leadListingId = normalizeText(row.listingId || row.listing_id || row.privateListingId || row.private_listing_id)
    return (row.listings || data?.listings || []).find((listing) => {
      const listingId = normalizeText(listing?.id || listing?.listingId || listing?.listing_id)
      const sellerLeadId = normalizeText(listing?.sellerLeadId || listing?.seller_lead_id || listing?.originatingCrmLeadId || listing?.originating_crm_lead_id || listing?.leadId || listing?.lead_id)
      return (leadListingId && listingId === leadListingId) || sellerLeadId === row.leadId
    }) || row.listings?.[0] || (leadListingId ? { id: leadListingId } : null)
  }, [data?.listings, row])
  const sellerMandatePacket = useMemo(() => {
    if (!row || !isSellerLeadWorkspace) return null
    const mandatePacketId = normalizeText(row.mandatePacketId || row.mandate_packet_id || linkedSellerListing?.mandatePacketId || linkedSellerListing?.mandate_packet_id)
    const packets = Array.isArray(row.documentPackets) ? row.documentPackets : []
    return packets.find((packet) => mandatePacketId && normalizeText(packet.id || packet.packetId || packet.packet_id) === mandatePacketId) ||
      packets.find((packet) => normalizeText(packet.packetType || packet.packet_type || packet.title).toLowerCase().includes('mandate')) ||
      row.mandatePacket ||
      null
  }, [isSellerLeadWorkspace, linkedSellerListing, row])
  const sellerMandatePacketStatus = useMemo(() => {
    if (!sellerMandatePacket) return null
    const sourceContext = sellerMandatePacket.sourceContextJson || sellerMandatePacket.source_context_json || {}
    return {
      packet: sellerMandatePacket,
      state: sellerMandatePacket.status || sellerMandatePacket.packetStatus || sellerMandatePacket.packet_status,
      signingStatus: sourceContext.signingStatus || sourceContext.signing_status || sourceContext.mandateStatus || sourceContext.mandate_status,
      sourceContext,
      signedAt: sourceContext.signedAt || sourceContext.signed_at || sellerMandatePacket.completedAt || sellerMandatePacket.completed_at,
      completedAt: sellerMandatePacket.completedAt || sellerMandatePacket.completed_at,
    }
  }, [sellerMandatePacket])
  const sellerJourney = useMemo(() => {
    if (!row || !isSellerLeadWorkspace) return null
    return buildSellerJourney({
      lead: row,
      contact: row.contact || {},
      appointments: row.appointments || [],
      listing: linkedSellerListing,
      mandatePacket: sellerMandatePacket,
      mandatePacketStatus: sellerMandatePacketStatus,
    })
  }, [isSellerLeadWorkspace, linkedSellerListing, row, sellerMandatePacket, sellerMandatePacketStatus])
  const sellerReadiness = useMemo(() => {
    if (!row || !isSellerLeadWorkspace) return null
    return buildSellerReadinessSummary({
      lead: row,
      contact: row.contact || {},
      appointments: row.appointments || [],
      listing: linkedSellerListing,
      mandatePacket: sellerMandatePacket,
      mandatePacketStatus: sellerMandatePacketStatus,
      journey: sellerJourney,
    })
  }, [isSellerLeadWorkspace, linkedSellerListing, row, sellerJourney, sellerMandatePacket, sellerMandatePacketStatus])
  const sellerOnboardingStatus = row ? getSellerOnboardingStatus(row, linkedSellerListing, sellerJourney) : ''
  const workspaceName = normalizeText(workspaceContext.currentWorkspace?.name || workspaceContext.workspace?.name)
  const tabs = useMemo(() => isSellerLeadWorkspace
    ? [
      { key: 'overview', label: 'Overview' },
      { key: 'listing_journey', label: 'Listing Journey' },
      { key: 'readiness', label: 'Readiness' },
      { key: 'timeline', label: 'Timeline' },
      { key: 'documents', label: 'Documents' },
      { key: 'appointments', label: 'Appointments' },
      { key: 'seller_actions', label: 'Seller Actions' },
    ]
    : [
      { key: 'overview', label: 'Overview' },
      { key: 'property_match', label: 'Property Match' },
      { key: 'timeline', label: 'Timeline' },
      { key: 'tasks', label: 'Tasks' },
      { key: 'appointments', label: 'Appointments' },
      { key: 'offers', label: 'Offers' },
    ], [isSellerLeadWorkspace])

  useEffect(() => {
    if (!row) return
    if (!tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(isSellerLeadWorkspace ? 'listing_journey' : 'overview')
    }
  }, [activeTab, isSellerLeadWorkspace, row, tabs])

  const sendSellerOnboardingForLead = useCallback(async () => {
    if (!row || !isSellerLeadWorkspace || sendingSellerOnboarding || sellerOnboardingInFlightRef.current) return
    if (!organisationId) {
      setSellerActionError('Select an agency workspace before sending seller onboarding.')
      return
    }
    const sellerEmail = normalizeText(row.email || row.contact?.email)
    if (!sellerEmail || !sellerEmail.includes('@')) {
      setSellerActionError('Seller email is required to send onboarding.')
      return
    }

    try {
      sellerOnboardingInFlightRef.current = true
      setSendingSellerOnboarding(true)
      setSellerActionError('')
      setSellerActionMessage('')
      let listingId = normalizeText(linkedSellerListing?.id || row.listingId || row.listing_id)
      if (!listingId) {
        const created = await createPrivateListing({
          organisationId,
          assignedAgentId: normalizeText(row.assignedAgentId || actor.id),
          sellerLeadId: normalizeText(row.leadId),
          originatingCrmLeadId: normalizeText(row.leadId),
          listingStatus: 'seller_lead',
          sellerOnboardingStatus: 'not_started',
          mandateStatus: 'not_started',
          listingVisibility: 'internal',
          title: normalizeText(row.propertyInterest || row.property_interest || row.sellerPropertyAddress || row.seller_property_address),
          propertyType: normalizeText(row.propertyType || row.property_type) || 'House',
          listingCategory: 'private_sale',
          askingPrice: Number(row.estimatedValue || row.estimated_value || row.budget || 0) || 0,
          estimatedValue: Number(row.estimatedValue || row.estimated_value || row.budget || 0) || 0,
          addressLine1: normalizeText(row.sellerPropertyAddress || row.seller_property_address || row.areaInterest || row.area_interest),
          suburb: normalizeText(row.areaInterest || row.area_interest),
          description: normalizeText(row.notes),
          source: 'lead_workspace_seller_onboarding',
        }, {
          includeRequirementsAndDocuments: false,
          syncRequirements: false,
        })
        listingId = normalizeText(created?.listing?.id)
      }
      if (!listingId) throw new Error('Create or link a seller listing before sending onboarding.')

      const onboarding = await sendSellerOnboarding(listingId, {
        sellerContactEmail: sellerEmail,
        sellerContactPhone: normalizeText(row.phone || row.contact?.phone),
      })
      const onboardingEmail = await invokeEdgeFunction('send-email', {
        body: buildSellerOnboardingEmailPayload({
          row,
          listing: linkedSellerListing,
          onboarding,
          organisationId,
          actor,
          workspaceName,
        }),
      })
      if (onboardingEmail?.error || onboardingEmail?.data?.error) {
        throw new Error(
          onboardingEmail?.error?.message ||
            onboardingEmail?.data?.error ||
            'Seller onboarding email could not be sent.',
        )
      }
      await updateAgencyCrmLeadRecord(organisationId, row.leadId, {
        stage: 'Seller Onboarding Sent',
        status: 'Sent',
        sellerOnboardingToken: onboarding?.token,
        sellerOnboardingLink: onboarding?.link,
        sellerOnboardingStatus: 'sent',
        listingId,
      })
      await createAgencyCrmLeadActivity(organisationId, row.leadId, {
        agent: { id: actor.id, name: actor.fullName || actor.name, email: actor.email },
        activityType: 'Seller Onboarding Sent',
        activityNote: `Seller onboarding was sent to ${row.name || 'Seller'}.`,
        outcome: 'Onboarding link sent',
        activityDate: new Date().toISOString(),
      }, { actor })
      setSellerActionMessage('Seller onboarding email sent.')
      await loadWorkspace()
    } catch (actionError) {
      setSellerActionError(actionError?.message || 'Unable to send seller onboarding right now.')
    } finally {
      sellerOnboardingInFlightRef.current = false
      setSendingSellerOnboarding(false)
    }
  }, [actor, isSellerLeadWorkspace, linkedSellerListing, loadWorkspace, organisationId, row, sendingSellerOnboarding, workspaceName])

  const resendSellerPortalLink = useCallback(async () => {
    if (!row || !isSellerLeadWorkspace || sendingSellerPortalLink) return
    if (!organisationId) {
      setSellerActionError('Select an agency workspace before resending the seller portal link.')
      return
    }
    const sellerEmail = normalizeText(row.email || row.contact?.email)
    if (!sellerEmail || !sellerEmail.includes('@')) {
      setSellerActionError('Seller email is required to resend the seller portal link.')
      return
    }
    const portalLink = getSellerPortalLink(row, linkedSellerListing)
    if (!portalLink) {
      setSellerActionError('Send seller onboarding first to create the seller portal link.')
      return
    }

    try {
      setSendingSellerPortalLink(true)
      setSellerActionError('')
      setSellerActionMessage('')
      const portalEmail = await invokeEdgeFunction('send-email', {
        body: buildSellerOnboardingEmailPayload({
          row,
          listing: linkedSellerListing,
          onboarding: { portalLink },
          portalLink,
          organisationId,
          actor,
          workspaceName,
          emailKind: 'portal_documents',
        }),
      })
      if (portalEmail?.error || portalEmail?.data?.error) {
        throw new Error(
          portalEmail?.error?.message ||
            portalEmail?.data?.error ||
            'Seller portal email could not be sent.',
        )
      }
      await createAgencyCrmLeadActivity(organisationId, row.leadId, {
        agent: { id: actor.id, name: actor.fullName || actor.name, email: actor.email },
        activityType: 'Seller Portal Link Resent',
        activityNote: `Seller portal link was resent to ${row.name || 'Seller'}.`,
        outcome: 'Seller portal link resent',
        activityDate: new Date().toISOString(),
      }, { actor }).catch(() => {})
      setSellerActionMessage('Seller portal link resent.')
    } catch (actionError) {
      setSellerActionError(actionError?.message || 'Unable to resend the seller portal link right now.')
    } finally {
      setSendingSellerPortalLink(false)
    }
  }, [actor, isSellerLeadWorkspace, linkedSellerListing, organisationId, row, sendingSellerPortalLink, workspaceName])

  const saveSellerCommissionForLead = useCallback(async (draft = {}) => {
    if (!row || !isSellerLeadWorkspace || savingSellerCommission) return
    if (!organisationId) {
      setSellerActionError('Select an agency workspace before saving commission terms.')
      return
    }
    try {
      setSavingSellerCommission(true)
      setSellerActionError('')
      setSellerActionMessage('')
      let listingId = getSellerListingId(row, linkedSellerListing)
      if (!listingId) {
        const created = await createPrivateListing({
          organisationId,
          assignedAgentId: normalizeText(row.assignedAgentId || actor.id),
          sellerLeadId: normalizeText(row.leadId),
          originatingCrmLeadId: normalizeText(row.leadId),
          listingStatus: 'seller_lead',
          sellerOnboardingStatus: 'in_progress',
          mandateStatus: 'not_started',
          listingVisibility: 'internal',
          title: normalizeText(row.propertyInterest || row.property_interest || row.sellerPropertyAddress || row.seller_property_address),
          propertyType: normalizeText(row.propertyType || row.property_type) || 'House',
          listingCategory: 'private_sale',
          askingPrice: Number(row.estimatedValue || row.estimated_value || row.budget || 0) || 0,
          estimatedValue: Number(row.estimatedValue || row.estimated_value || row.budget || 0) || 0,
          addressLine1: normalizeText(row.sellerPropertyAddress || row.seller_property_address || row.areaInterest || row.area_interest),
          suburb: normalizeText(row.areaInterest || row.area_interest),
          description: normalizeText(row.notes),
          source: 'lead_workspace_commission',
        }, {
          includeRequirementsAndDocuments: false,
          syncRequirements: false,
        })
        listingId = normalizeText(created?.listing?.id)
        if (listingId) {
          await updateAgencyCrmLeadRecord(organisationId, row.leadId, { listingId }).catch(() => {})
        }
      }
      if (!listingId) throw new Error('Create or link a seller listing before saving commission terms.')

      const formPatch = buildSellerCommissionFormPatch(draft, actor)
      const existingFormData = readSellerOnboardingFormData(linkedSellerListing, row)
      const currentStatus = getSellerOnboardingStatus(row, linkedSellerListing, sellerJourney)
      await updatePrivateListingOnboardingFormData(listingId, {
        ...existingFormData,
        ...formPatch,
      }, {
        status: sellerOnboardingIsSubmitted(currentStatus) ? currentStatus : 'in_progress',
      })
      await createAgencyCrmLeadActivity(organisationId, row.leadId, {
        agent: { id: actor.id, name: actor.fullName || actor.name, email: actor.email },
        activityType: 'Commission Updated',
        activityNote: 'Seller lead commission structure and mandate commission terms were updated.',
        outcome: formPatch.agencyCommissionStructureName || formPatch.commissionStructure,
        activityDate: new Date().toISOString(),
      }, { actor }).catch(() => {})
      setSellerActionMessage('Commission structure saved for mandate generation.')
      await loadWorkspace()
    } catch (actionError) {
      setSellerActionError(actionError?.message || 'Unable to save commission terms right now.')
    } finally {
      setSavingSellerCommission(false)
    }
  }, [actor, isSellerLeadWorkspace, linkedSellerListing, loadWorkspace, organisationId, row, savingSellerCommission, sellerJourney])

  const openMandateWorkspace = useCallback(() => {
    if (!row) return
    const onboardingSubmitted = sellerOnboardingIsSubmitted(getSellerOnboardingStatus(row, linkedSellerListing, sellerJourney))
    const mandateMeta = getSellerMandateMeta(row, linkedSellerListing, sellerJourney)
    if (!mandateMeta.hasRecord && !onboardingSubmitted) {
      setSellerActionError('Send seller onboarding and wait for the seller to submit their details before generating the mandate.')
      return
    }
    const returnTo = encodeURIComponent(`/pipeline/leads/${row.leadId}`)
    navigate(`/pipeline/leads/${row.leadId}/legal/mandate?mode=${mandateMeta.mode}&returnTo=${returnTo}`)
  }, [linkedSellerListing, navigate, row, sellerJourney])

  const openSellerListing = useCallback(() => {
    const listingId = getSellerListingId(row, linkedSellerListing)
    if (listingId) navigate(`/agent/listings/${encodeURIComponent(listingId)}`)
    else navigate('/listings')
  }, [linkedSellerListing, navigate, row])

  const openSellerPortalLink = useCallback(() => {
    const link = getSellerPortalLink(row, linkedSellerListing)
    if (!link) {
      setSellerActionError('Send seller onboarding first to create the seller portal link.')
      return
    }
    setSellerActionError('')
    if (typeof window !== 'undefined') {
      window.open(link, '_blank', 'noopener,noreferrer')
    } else {
      setSellerActionMessage(link)
    }
  }, [linkedSellerListing, row])

  const copySellerPortalLink = useCallback(async () => {
    const link = getSellerPortalLink(row, linkedSellerListing)
    if (!link) {
      setSellerActionError('Send the seller portal link before copying it.')
      return
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setSellerActionError('Clipboard access is unavailable in this browser.')
      return
    }
    try {
      await navigator.clipboard.writeText(link)
      setSellerActionError('')
      setSellerActionMessage('Seller portal link copied.')
    } catch (copyError) {
      setSellerActionError(copyError?.message || 'Unable to copy the seller portal link.')
    }
  }, [linkedSellerListing, row])

  const copyListingLink = useCallback(async () => {
    const listingId = getSellerListingId(row, linkedSellerListing)
    if (!listingId) {
      setSellerActionError('Create or link a listing before copying the listing link.')
      return
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setSellerActionError('Clipboard access is unavailable in this browser.')
      return
    }
    try {
      const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://app.bridgenine.co.za'
      await navigator.clipboard.writeText(`${origin}/agent/listings/${encodeURIComponent(listingId)}`)
      setSellerActionError('')
      setSellerActionMessage('Listing link copied.')
    } catch (copyError) {
      setSellerActionError(copyError?.message || 'Unable to copy the listing link.')
    }
  }, [linkedSellerListing, row])

  const updateSellerLeadLifecycle = useCallback(async (nextStatus, activityType, confirmationCopy) => {
    const leadId = normalizeText(row?.leadId)
    if (!organisationId || !leadId) {
      setSellerActionError('This seller lead cannot be updated until the workspace has loaded.')
      return
    }
    const confirmed = typeof window === 'undefined' ? true : window.confirm(confirmationCopy)
    if (!confirmed) return
    try {
      setSellerActionError('')
      setSellerActionMessage('')
      await updateAgencyCrmLeadRecord(organisationId, leadId, {
        stage: nextStatus,
        status: nextStatus,
      })
      await createAgencyCrmLeadActivity(organisationId, leadId, {
        agent: { id: actor.id, name: actor.fullName || actor.name, email: actor.email },
        activityType,
        activityNote: `${row?.name || 'Seller lead'} was marked as ${nextStatus.toLowerCase()}.`,
        outcome: nextStatus,
        activityDate: new Date().toISOString(),
      }, { actor }).catch(() => {})
      setSellerActionMessage(`Seller lead marked as ${nextStatus.toLowerCase()}.`)
      await loadWorkspace()
    } catch (actionError) {
      setSellerActionError(actionError?.message || `Unable to mark this seller lead as ${nextStatus.toLowerCase()}.`)
    }
  }, [actor, loadWorkspace, organisationId, row])

  const markSellerLeadAsLost = useCallback(() => {
    updateSellerLeadLifecycle('Lost', 'Seller Lead Lost', `Mark ${row?.name || 'this seller lead'} as lost?`)
  }, [row?.name, updateSellerLeadLifecycle])

  const archiveSellerLead = useCallback(() => {
    updateSellerLeadLifecycle('Archived', 'Seller Lead Archived', `Archive ${row?.name || 'this seller lead'}?`)
  }, [row?.name, updateSellerLeadLifecycle])

  const deleteCurrentLead = useCallback(async () => {
    const leadIdToDelete = normalizeText(row?.leadId)
    if (!organisationId || !leadIdToDelete) {
      setError('This lead cannot be deleted until the workspace has loaded.')
      return
    }
    const leadName = normalizeText(row?.name) || 'this lead'
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`Delete ${leadName}? This cannot be undone.`)
    if (!confirmed) return

    try {
      setError('')
      await deleteAgencyCrmLeadRecord(organisationId, leadIdToDelete)
      navigate('/pipeline/leads')
    } catch (deleteError) {
      setError(deleteError?.message || 'Unable to delete this lead.')
    }
  }, [navigate, organisationId, row])

  const markBuyerReachedOut = useCallback(async () => {
    if (!organisationId || !row?.leadId) {
      throw new Error('This lead cannot be updated until the workspace has loaded.')
    }
    await markLeadFirstContacted({ organisationId, leadId: row.leadId }, { actor })
    await loadWorkspace()
  }, [actor, loadWorkspace, organisationId, row])

  const convertBuyerLead = useCallback(() => {
    const transactionId = getLeadLinkedTransactionId(row)
    if (transactionId) navigate(`/transactions/${transactionId}`)
    else setActiveTab('offers')
  }, [navigate, row])

  const runBuyerWorkspaceAction = useCallback((actionId = 'overview') => {
    if (actionId === 'convert') {
      convertBuyerLead()
      return
    }
    setActiveTab(actionId || 'overview')
  }, [convertBuyerLead])

  return (
    <main className={pageShell}>
      <button type="button" onClick={() => navigate('/pipeline/leads')} className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950">
        <ArrowLeft size={15} />
        Back to leads
      </button>
      {loading ? <LoadingSkeleton lines={10} className={panelClass} /> : null}
      {error && !loading ? <EmptyState title="Lead workspace could not be loaded" copy={error} /> : null}
      {!loading && !error && !row ? <EmptyState title="Lead not found" copy="This lead was not returned by the existing lead repository for the selected workspace." /> : null}
      {row ? (
        <>
          {isSellerLeadWorkspace ? (
            <SellerLeadWorkspaceLayout
              row={row}
              sourceInfo={sourceInfo}
              sellerJourney={sellerJourney}
              sellerReadiness={sellerReadiness}
              linkedSellerListing={linkedSellerListing}
              sellerOnboardingStatus={sellerOnboardingStatus}
              sendingSellerOnboarding={sendingSellerOnboarding}
              sendingSellerPortalLink={sendingSellerPortalLink}
              sellerActionError={sellerActionError}
              sellerActionMessage={sellerActionMessage}
              organisationId={organisationId}
              actor={actor}
              timeline={data?.timeline || row.communicationTimeline || []}
              savingCommission={savingSellerCommission}
              onSaved={loadWorkspace}
              onSaveCommission={saveSellerCommissionForLead}
              onSendSellerOnboarding={sendSellerOnboardingForLead}
              onResendSellerPortalLink={resendSellerPortalLink}
              onOpenSellerPortalLink={openSellerPortalLink}
              onGenerateMandate={openMandateWorkspace}
              onOpenListing={openSellerListing}
              onCopySellerPortalLink={copySellerPortalLink}
              onCopyListingLink={copyListingLink}
              onMarkAsLost={markSellerLeadAsLost}
              onArchiveLead={archiveSellerLead}
            />
          ) : (
            <div className="buyer-lead-workspace">
              <BuyerLeadHeader
                row={row}
                sourceInfo={sourceInfo}
                leadScore={getBuyerLeadScore(row, workspaceAnalytics)}
                lastActivity={getBuyerLastActivity(row)}
                onOpenTimeline={() => setActiveTab('timeline')}
                onDelete={deleteCurrentLead}
                onRunCommand={runBuyerWorkspaceAction}
              />

              <BuyerJourneyCommandRow
                row={row}
                onNavigate={setActiveTab}
                onConvert={convertBuyerLead}
              />

              <BuyerOutreachProgress
                row={row}
                onLogOutreach={() => setActiveTab('timeline')}
                onMarkReachedOut={markBuyerReachedOut}
                onAddViewing={() => setActiveTab('appointments')}
                onOpenAppointments={() => setActiveTab('appointments')}
                onOpenOffers={() => setActiveTab('offers')}
                onConvert={convertBuyerLead}
              />

              <nav className={`${panelClass} buyer-workspace-tabs flex gap-2 overflow-x-auto p-2`} aria-label="Lead workspace tabs">
                {tabs.map((tab) => (
                  <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`buyer-workspace-tab min-h-10 rounded-xl px-3 text-sm font-semibold ${activeTab === tab.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {tab.label}
                  </button>
                ))}
              </nav>

              <div className="tab-content">
                {activeTab === 'overview' ? (
                  <BuyerLeadOverview
                    row={row}
                    workspace={data || {}}
                    sourceInfo={sourceInfo}
                    onNavigate={setActiveTab}
                  />
                ) : null}

                {activeTab === 'property_match' ? (
                  <BuyerPropertyMatchPanel
                    organisationId={organisationId}
                    row={row}
                    workspace={data || {}}
                    actor={actor}
                    onSaved={loadWorkspace}
                    onShare={setShareDraft}
                  />
                ) : null}

                {activeTab === 'timeline' ? (
                  <CommunicationTimelinePanel
                    organisationId={organisationId}
                    lead={row}
                    actor={actor}
                    timeline={data?.timeline || row.communicationTimeline || []}
                    onSaved={loadWorkspace}
                  />
                ) : null}

                {activeTab === 'tasks' ? (
                  <section className={buyerWorkspaceCardClass}>
                    <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Tasks</h2>
                    <TaskForm organisationId={organisationId} leadId={row.leadId} actor={actor} onSaved={loadWorkspace} />
                    <div className="mt-5"><TaskList items={row.tasks} /></div>
                  </section>
                ) : null}

                {activeTab === 'appointments' ? (
                  <LeadAppointmentsPanel
                    organisationId={organisationId}
                    lead={row}
                    actor={actor}
                    onSaved={loadWorkspace}
                  />
                ) : null}

                {activeTab === 'offers' ? (
                  <section className={buyerWorkspaceCardClass}>
                    <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Offers / Transactions</h2>
                    <div className="mt-5 grid gap-5">
                      <LeadOfferReadinessPanel
                        organisationId={organisationId}
                        lead={row}
                        actor={actor}
                        onSaved={loadWorkspace}
                      />
                      <LeadOfferTransactionConversionPanel
                        organisationId={organisationId}
                        lead={row}
                        actor={actor}
                        onSaved={loadWorkspace}
                      />
                      <LeadOfferEdgeCasesPanel
                        organisationId={organisationId}
                        lead={row}
                        actor={actor}
                        onSaved={loadWorkspace}
                      />
                      <LeadTransactionHandoffPanel
                        organisationId={organisationId}
                        lead={row}
                        actor={actor}
                        onSaved={loadWorkspace}
                      />
                      <OfferTransactionList offers={row.offers} transactions={row.transactions} convertedTransactionId={row.convertedTransactionId} />
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          )}
        </>
      ) : null}
      {shareDraft && row ? (
        <PropertyShareDialog
          draft={shareDraft}
          organisationId={organisationId}
          lead={row}
          requirements={data?.requirements || row.requirements || []}
          savedSearches={data?.savedSearches || row.savedSearches || []}
          actor={actor}
          onClose={() => setShareDraft(null)}
          onSaved={async () => {
            setShareDraft(null)
            await loadWorkspace()
          }}
        />
      ) : null}
    </main>
  )
}

export default function AgentLeadsPage() {
  const { leadId } = useParams()
  return leadId ? <AgentLeadWorkspace /> : <AgentLeadList />
}
