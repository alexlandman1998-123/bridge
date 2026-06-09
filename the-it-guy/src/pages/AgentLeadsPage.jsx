import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Home,
  Mail,
  MessageSquarePlus,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  UserRound,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { buildSellerOnboardingLink } from '../lib/agentListingStorage'
import { createAppointmentAsync, updateAppointmentAsync } from '../lib/agencyPipelineService'
import {
  createCanonicalOffer,
  createOfferPortalSession,
  createTransactionFromAcceptedCanonicalOffer,
  upsertAppointmentViewedListings,
} from '../lib/buyerLifecycleService'
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
  sendSellerOnboarding,
} from '../services/privateListingService'
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
import {
  acceptRecommendation,
  completeRecommendation,
  convertRecommendationToTask,
  dismissRecommendation as dismissLeadRecommendation,
  getRecommendationMetrics,
} from '../services/leadRecommendationService'
import {
  acceptSuggestion,
  generateSuggestionsForLead,
  rejectSuggestion,
} from '../services/leadSuggestionService'

const pageShell = 'mx-auto flex w-full max-w-[1480px] flex-col gap-5'
const panelClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm'
const buyerWorkspaceCardClass = `${panelClass} card`
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LEAD_APPOINTMENT_TYPES = [
  { value: 'viewing', label: 'Viewing' },
  { value: 'buyer_consultation', label: 'Buyer Consultation' },
  { value: 'otp_signing', label: 'OTP Signing' },
  { value: 'other', label: 'Other Appointment' },
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
  { key: 'all', label: 'All Leads', helper: 'Unified operating list', icon: Tag },
  { key: 'buyer', label: 'Buyer Leads', helper: 'Requirements, matches, viewings', icon: UserRound },
  { key: 'seller', label: 'Seller Leads', helper: 'Property, mandate, listing readiness', icon: Home },
  { key: 'other', label: 'Other', helper: 'Uncategorised follow-up', icon: FileText },
]
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
  return {
    leadSource: row.source || row.leadSource || row.lead_source || 'Unknown',
    originalSource: sourceFromType(firstActivity) || row.source || 'Unknown',
    firstSource: sourceFromType(firstActivity) || row.source || 'Unknown',
    latestSource: sourceFromType(latestActivity) || row.source || 'Unknown',
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
    id: normalizeText(profile?.id || profile?.user_id || profile?.email),
    userId: normalizeText(profile?.id || profile?.user_id || profile?.email),
    email: normalizeText(profile?.email).toLowerCase(),
    name: normalizeText(profile?.fullName || profile?.full_name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')),
    fullName: normalizeText(profile?.fullName || profile?.full_name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')),
    role: normalizeText(profile?.role || profile?.workspaceRole || profile?.workspace_role || profile?.organisationRole || profile?.organisation_role),
    workspaceRole: normalizeText(profile?.workspaceRole || profile?.workspace_role || profile?.organisationRole || profile?.organisation_role || profile?.role),
  }
}

function StatusPill({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-rose-50 text-rose-700',
  }
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${tones[tone] || tones.slate}`}>{children}</span>
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

function getLeadCategoryLabel(row = {}) {
  const category = normalizeLeadCategory(row)
  if (category === 'seller') return 'Seller Lead'
  if (category === 'buyer') return 'Buyer Lead'
  return 'Other Lead'
}

function getLeadCategoryTone(row = {}) {
  const category = normalizeLeadCategory(row)
  if (category === 'seller') return 'green'
  if (category === 'buyer') return 'blue'
  return 'slate'
}

function isUuidLike(value = '') {
  return UUID_PATTERN.test(normalizeText(value))
}

function getOwnerName(row = {}) {
  const owner = normalizeText(row.assignedAgentName || row.assigned_agent_name || row.assignedAgent || row.assigned_agent)
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

function getNextAction(row = {}) {
  const activeRecommendation = (Array.isArray(row.recommendations) ? row.recommendations : []).find((item) => ['pending', 'accepted'].includes(String(item.status || '').toLowerCase()))
  if (activeRecommendation?.title) return activeRecommendation.title
  if (row.nextTask?.title) return row.nextTask.title
  const category = normalizeLeadCategory(row)
  const stage = normalizeText(row.stage).toLowerCase()
  if (category === 'seller') {
    if (!row.listingCount) return 'Link Property'
    if (stage.includes('mandate')) return 'Check Mandate Signature'
    if (stage.includes('listing')) return 'Activate Listing'
    return 'Contact Seller'
  }
  if (row.appointmentCount) return 'Follow Up Viewing'
  if ((row.suggestions || []).length) return 'Review Matches'
  return category === 'buyer' ? 'Contact Buyer' : 'Contact Lead'
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

function RecommendationSummaryCard({ pendingCount = 0, urgentCount = 0, dueTodayCount = 0, overdueCount = 0 }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">Recommended Actions</p>
        <p className="mt-0.5 text-xs font-medium text-amber-800">{pendingCount} actions pending</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-amber-800">
        <span title="Urgent" className="rounded-full bg-white px-2 py-1">{urgentCount} urgent</span>
        <span title="Due today" className="hidden rounded-full bg-white px-2 py-1 sm:inline-flex">{dueTodayCount} today</span>
        <span title="Overdue" className="rounded-full bg-white px-2 py-1">{overdueCount} overdue</span>
      </div>
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

function BuyerLeadHeader({ row, sourceInfo, leadScore, lastActivity, onOpenTimeline, onDelete, onConvert }) {
  const [moreOpen, setMoreOpen] = useState(false)
  return (
    <header className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="blue">Buyer Lead</StatusPill>
            <StatusPill tone={getStageTone(row.stage)}>{formatCleanValue(row.stage || row.status)}</StatusPill>
            <StatusPill tone={leadScore >= 80 ? 'green' : 'amber'}>{getIntentLabel(leadScore)}</StatusPill>
          </div>
          <h1 className="mt-3 break-words text-3xl font-semibold tracking-[-0.045em] text-slate-950">{row.name}</h1>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1.5"><Phone size={15} />{row.phone || 'No phone'}</span>
            <span className="inline-flex items-center gap-1.5"><Mail size={15} />{row.email || 'No email'}</span>
            <span className="inline-flex items-center gap-1.5"><Tag size={15} />{formatCleanValue(sourceInfo?.leadSource || row.source)}</span>
            <span className="inline-flex items-center gap-1.5"><UserRound size={15} />{getOwnerName(row)}</span>
          </div>
          {lastActivity?.date ? <p className="mt-2 text-sm font-medium text-slate-500">Last activity {formatRelativeTime(lastActivity.date)} · {formatDateTime(lastActivity.date)}</p> : null}
        </div>
        <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-3 xl:w-auto">
          <div className="relative">
            <button type="button" onClick={() => setMoreOpen((open) => !open)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" aria-haspopup="menu" aria-expanded={moreOpen}>
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
          <button type="button" onClick={onConvert} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700">
            Convert to Transaction
          </button>
        </div>
      </div>
    </header>
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

function LeadIdentityBlock({ row, onOpen, activeCategory = 'all' }) {
  const context = getLeadContextSummary(row)
  const showCategoryBadge = !['buyer', 'seller', 'other'].includes(activeCategory)
  return (
    <button type="button" onClick={onOpen} className="group min-w-0 text-left">
      <span className="block truncate text-sm font-semibold text-slate-950 group-hover:text-blue-700">{row.name}</span>
      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500">
        <span className="truncate">{row.phone || 'No phone'}</span>
        {row.email ? <span className="max-w-[180px] truncate">{row.email}</span> : null}
      </span>
      <span className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
        {showCategoryBadge ? <StatusPill tone={getLeadCategoryTone(row)}>{getLeadCategoryLabel(row)}</StatusPill> : null}
        <span className="max-w-[180px] truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{row.source || 'Unknown'}</span>
      </span>
      {context ? <span className="mt-2 block max-w-[260px] truncate text-xs font-semibold text-slate-500">{context}</span> : null}
    </button>
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

function LeadCategoryFilter({ filters, rows, onChange }) {
  const counts = rows.reduce((accumulator, row) => {
    const category = normalizeLeadCategory(row)
    accumulator.all += 1
    accumulator[category] = (accumulator[category] || 0) + 1
    return accumulator
  }, { all: 0, buyer: 0, seller: 0, other: 0 })
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Lead pipeline views">
      {LEAD_CATEGORY_FILTERS.map((option) => {
        const active = filters.category === option.key
        const Icon = option.icon
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange((previous) => ({ ...previous, category: option.key }))}
            role="tab"
            aria-selected={active}
            className={`flex min-h-[72px] items-center gap-3 rounded-xl border px-3 text-left transition ${active ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
              <Icon size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{option.label}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>{counts[option.key] || 0}</span>
              </span>
              <span className={`mt-1 block truncate text-xs font-medium ${active ? 'text-slate-200' : 'text-slate-500'}`}>{option.helper}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function LeadViewSummary({ category = 'all', visibleCount = 0 }) {
  const summaries = {
    all: {
      title: 'All leads',
      copy: 'A combined queue for triage. Switch to Buyer Leads or Seller Leads for the cleaner category-specific workflow.',
    },
    buyer: {
      title: 'Buyer leads',
      copy: 'Buyer context is prioritised: requirements, latest buyer activity, and the next buyer action.',
    },
    seller: {
      title: 'Seller leads',
      copy: 'Seller context is prioritised: property address, mandate or listing stage, and the next seller action.',
    },
    other: {
      title: 'Other leads',
      copy: 'Basic follow-up leads that are not yet buyer or seller pipeline work.',
    },
  }
  const summary = summaries[category] || summaries.all
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{summary.title}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-500">{summary.copy}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-slate-500">{visibleCount} visible</span>
      </div>
    </div>
  )
}

function getLeadColumnHeader(category = 'all') {
  if (category === 'buyer') return 'Buyer / Requirement'
  if (category === 'seller') return 'Seller / Property'
  if (category === 'other') return 'Lead / Notes'
  return 'Lead Context'
}

function EmptyLeadResults({ onCreate, onImport, onAdjustFilters }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">No leads found</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">Create your first buyer or seller lead to start managing the pipeline.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => onCreate('buyer')} className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Create Buyer Lead</button>
        <button type="button" onClick={() => onCreate('seller')} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Create Seller Lead</button>
        <button type="button" onClick={onImport} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Import Leads</button>
        <button type="button" onClick={onAdjustFilters} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Adjust Filters</button>
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

function CreateLeadDropdown({ activeCategory = 'all', onCreate, onImport }) {
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
    <div className="relative">
      <button
        type="button"
        onClick={() => defaultCategory ? choose(defaultCategory) : setOpen((previous) => !previous)}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
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
    workspaceRole: workspaceContext.currentMembership?.workspace_role || workspaceContext.currentMembership?.organisation_role || workspaceContext.currentMembership?.role || workspaceContext.profile?.role,
  }), [workspaceContext.currentMembership, workspaceContext.profile])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [assignmentMetrics, setAssignmentMetrics] = useState({ unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })
  const [filters, setFilters] = useState({ search: '', category: 'all', stage: 'all', source: 'all', agent: 'all', createdFrom: '', createdTo: '' })
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
      const result = await listAgentLeadWorkspaceRows({ organisationId })
      setRows(result.rows)
      setAssignmentMetrics(result.assignmentMetrics || { unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })
    } catch (loadError) {
      setRows([])
      setAssignmentMetrics({ unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })
      setError(loadError?.message || 'Unable to load leads right now.')
    } finally {
      setLoading(false)
    }
  }, [organisationId])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const options = useMemo(() => getLeadFilterOptions(rows), [rows])
  const visibleRows = useMemo(() => {
    const filtered = filterAgentLeadRows(rows, filters)
    if (!filters.category || filters.category === 'all') return filtered
    return filtered.filter((row) => normalizeLeadCategory(row) === filters.category)
  }, [rows, filters])
  const recommendationRows = useMemo(() => rows.flatMap((row) => Array.isArray(row.recommendations) ? row.recommendations : []), [rows])
  const recommendationMetrics = useMemo(() => getRecommendationMetrics(recommendationRows), [recommendationRows])
  const pendingRecommendations = recommendationMetrics.pending + recommendationMetrics.accepted
  const leadColumnHeader = getLeadColumnHeader(filters.category)
  const dueTodayRecommendations = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return recommendationRows.filter((item) => ['pending', 'accepted'].includes(String(item.status || '').toLowerCase()) && String(item.dueDate || item.due_date || '').slice(0, 10) === today).length
  }, [recommendationRows])

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
    <main className={pageShell}>
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Agent Workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Leads</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Buyer and seller lead views share one CRM system, with the table adapting to the active pipeline context.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CreateLeadDropdown
            activeCategory={filters.category}
            onCreate={openCreateLead}
            onImport={() => navigate('/pipeline/enquiries')}
          />
          <button type="button" onClick={() => navigate('/pipeline/enquiries')} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            Import
          </button>
          <button type="button" onClick={loadRows} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </header>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[repeat(4,minmax(120px,1fr))_minmax(320px,1.4fr)]">
        <span className="sr-only">Unassigned Leads Assigned Leads Overdue Leads Escalated Leads My Recommendations Recommended Next Actions</span>
        <CompactMetric label="Unassigned" value={assignmentMetrics.unassigned || 0} icon={UserRound} />
        <CompactMetric label="Assigned" value={assignmentMetrics.assigned || 0} icon={Tag} />
        <CompactMetric label="Overdue" value={assignmentMetrics.overdue || 0} icon={Clock3} />
        <CompactMetric label="Escalated" value={assignmentMetrics.escalated || 0} icon={CheckCircle2} />
        <div className="sm:col-span-2 lg:col-span-4 2xl:col-span-1">
          <RecommendationSummaryCard
            pendingCount={pendingRecommendations}
            urgentCount={recommendationMetrics.urgent || 0}
            dueTodayCount={dueTodayRecommendations}
            overdueCount={recommendationMetrics.overdue || 0}
          />
        </div>
      </section>

      <section className={`${panelClass} p-4`}>
        <div className="grid gap-3">
          <LeadCategoryFilter filters={filters} rows={rows} onChange={setFilters} />
          <LeadViewSummary category={filters.category} visibleCount={visibleRows.length} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_repeat(4,minmax(130px,1fr))]">
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300"
              placeholder="Search name, phone, email"
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
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={filters.createdFrom} onChange={(event) => setFilters((previous) => ({ ...previous, createdFrom: event.target.value }))} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700" aria-label="Created from" />
            <input type="date" value={filters.createdTo} onChange={(event) => setFilters((previous) => ({ ...previous, createdTo: event.target.value }))} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700" aria-label="Created to" />
          </div>
        </div>
      </section>

      {loading ? <LoadingSkeleton lines={10} className={panelClass} /> : null}
      {error && !loading ? <EmptyState title="Leads could not be loaded" copy={error} /> : null}
      {!loading && !error ? (
        <section className={`${panelClass} relative`}>
          <div className="hidden lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[36%]" />
                <col className="w-[13%]" />
                <col className="w-[16%]" />
                <col className="w-[21%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">{leadColumnHeader}</th>
                  <th className="px-3 py-2.5 font-semibold">Stage</th>
                  <th className="px-3 py-2.5 font-semibold">Owner</th>
                  <th className="px-3 py-2.5 font-semibold">Latest Activity</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => {
                  const latestDate = getLatestActivityDate(row.latestActivity)
                  const openRow = () => navigate(`/pipeline/leads/${row.leadId}`)
                  return (
                    <tr key={row.leadId} className="align-middle hover:bg-slate-50/80">
                      <td className="px-3 py-3">
                        <LeadIdentityBlock row={row} onOpen={openRow} activeCategory={filters.category} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill tone={getStageTone(row.stage)}>{row.stage}</StatusPill>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block truncate font-semibold text-slate-800">{getOwnerName(row)}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{row.assignedQueue && row.assignedQueue !== '—' ? row.assignedQueue.replace(/_/g, ' ') : 'No queue'}</span>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getSlaTone(row.slaStatus) === 'red' ? 'bg-rose-50 text-rose-700' : getSlaTone(row.slaStatus) === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{formatSlaStatus(row.slaStatus)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block truncate font-medium text-slate-800">{getLatestActivityTitle(row)}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{formatRelativeTime(latestDate, 'No activity yet')}</span>
                      </td>
                      <td className="px-3 py-3">
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
              const latestDate = getLatestActivityDate(row.latestActivity)
              const nextDate = row.nextTask?.dueDate || row.nextTask?.due_date
              const openRow = () => navigate(`/pipeline/leads/${row.leadId}`)
              return (
                <article key={`card-${row.leadId}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <LeadIdentityBlock row={row} onOpen={openRow} activeCategory={filters.category} />
                    <StatusPill tone={getStageTone(row.stage)}>{row.stage}</StatusPill>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Owner</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{getOwnerName(row)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatSlaStatus(row.slaStatus)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Latest Activity</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{getLatestActivityTitle(row)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatRelativeTime(latestDate, 'No activity yet')}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Next Action</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{getNextAction(row)}</p>
                      <p className="mt-1 text-xs text-slate-500">{nextDate ? formatDate(nextDate) : 'Recommended next step'}</p>
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
                onAdjustFilters={() => setFilters({ search: '', category: 'all', stage: 'all', source: 'all', agent: 'all', createdFrom: '', createdTo: '' })}
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
        locationType: normalizeText(draft.location || selectedProperty?.description) ? 'physical' : 'to_be_confirmed',
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
  return (
    <section className={buyerWorkspaceCardClass}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Appointments</h2>
          <p className="mt-1 text-sm text-slate-500">Create appointments directly for this lead with buyer details already linked.</p>
        </div>
      </div>
      <LeadAppointmentForm organisationId={organisationId} lead={lead} actor={actor} onSaved={onSaved} />
      <div className="mt-5">
        <AppointmentList items={lead.appointments} organisationId={organisationId} lead={lead} actor={actor} onSaved={onSaved} />
      </div>
    </section>
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
          <p className="mt-1 text-sm text-slate-500">A buyer transaction should be created from the accepted offer, then buyer onboarding can start from the transaction record.</p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Conversion Rule</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">Accepted offer only</p>
            <p className="mt-1 text-xs text-slate-500">Sent, submitted, and seller-review offers stay blocked until accepted.</p>
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
          No accepted offer yet. Keep the offer in review until the seller accepts, then return here to create the transaction.
        </div>
      )}
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
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-slate-950">{formatCurrency(getOfferAmount(offer))}</strong>
                <StatusPill tone={getOfferStatusTone(offer.status)}>{offer.status || 'draft'}</StatusPill>
              </div>
              <p className="mt-2 text-xs text-slate-500">Updated {formatDateTime(offer.updatedAt || offer.updated_at || offer.createdAt || offer.created_at)}</p>
            </article>
          )) : <p className="text-sm text-slate-500">No offers linked.</p>}
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-950">Transactions</h3>
        <div className="space-y-3">
          {safeTransactions.length ? safeTransactions.map((transaction, index) => {
            const transactionId = normalizeText(transaction.id || transaction.transactionId || transaction.transaction_id)
            return (
            <article key={transactionId || `transaction-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-slate-950">Transaction</strong>
                <StatusPill tone="green">{transaction.status || 'Linked'}</StatusPill>
              </div>
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

function getSellerOnboardingStatus(row = {}, listing = null) {
  return normalizeText(
    row?.sellerOnboardingStatus ||
    row?.seller_onboarding_status ||
    row?.sellerOnboarding?.status ||
    listing?.sellerOnboarding?.status ||
    listing?.sellerOnboardingStatus ||
    listing?.seller_onboarding_status,
  ).toLowerCase()
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
  const directLink = normalizeText(
    row?.sellerOnboardingLink ||
      row?.seller_onboarding_link ||
      row?.sellerOnboarding?.link ||
      listing?.sellerOnboarding?.link ||
      listing?.sellerOnboardingLink ||
      listing?.seller_onboarding_link,
  )
  if (directLink) return directLink
  return buildSellerOnboardingLink(getSellerOnboardingToken(row, listing))
}

function sellerOnboardingIsSubmitted(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  return ['submitted', 'completed', 'complete', 'under_review', 'onboarding_completed', 'seller_onboarding_completed'].includes(normalized)
}

function sellerOnboardingActionLabel(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (sellerOnboardingIsSubmitted(normalized)) return 'Seller Onboarding Submitted'
  if (['sent', 'in_progress', 'started'].includes(normalized)) return 'Resend Seller Onboarding'
  return 'Send Seller Onboarding'
}

function getSellerOnboardingActionMeta(status = '', row = {}, listing = null) {
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
  if (hasToken || ['sent', 'in_progress', 'started'].includes(normalized)) {
    return {
      label: 'Onboarding Link Sent',
      tone: 'sent',
      disabled: true,
      icon: Mail,
      help: 'Use resend if the seller needs the portal link again.',
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
  const address = normalizeText(
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
  const suburb = normalizeText(listing?.suburb || row?.suburb || row?.areaInterest || row?.area_interest)
  const city = normalizeText(listing?.city || row?.city)
  return {
    address: [address, suburb, city].filter(Boolean).join(', ') || 'Property address pending',
    propertyType: normalizeText(listing?.propertyType || listing?.property_type || row?.propertyType || row?.property_type) || 'Property type pending',
    estimatedValue: Number(listing?.estimatedValue || listing?.estimated_value || listing?.askingPrice || listing?.asking_price || row?.estimatedValue || row?.estimated_value || row?.budget || 0) || 0,
    bedrooms: normalizeText(listing?.bedrooms || listing?.propertyDetails?.bedrooms || row?.bedrooms),
    bathrooms: normalizeText(listing?.bathrooms || listing?.propertyDetails?.bathrooms || row?.bathrooms),
    erfSize: normalizeText(listing?.erfSize || listing?.erf_size || listing?.propertyDetails?.erfSize || row?.erfSize || row?.erf_size),
    description: normalizeText(listing?.description || listing?.propertyDescription || listing?.property_description || row?.notes),
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

function getSellerNextBestActionMeta({ row = {}, listing = null, journey = null, readiness = null, onboardingStatus = '' } = {}) {
  const blocker = readiness?.blockers?.find((item) => item.severity === 'blocked') || readiness?.blockers?.[0] || readiness?.nextAction?.blocker || null
  const nextAction = readiness?.nextAction || journey?.nextRecommendedAction || null
  if (!sellerOnboardingIsSubmitted(onboardingStatus) && !getSellerOnboardingToken(row, listing)) {
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
  if (step.key === 'appointment_valuation') {
    return journey?.valuationAppointment?.completedAt ||
      journey?.valuationAppointment?.completed_at ||
      journey?.valuationAppointment?.dateTime ||
      journey?.valuationAppointment?.date_time ||
      journey?.valuationAppointment?.startTime ||
      journey?.valuationAppointment?.start_time
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
  return journey?.currentStageStartedAt || row?.updatedAt || row?.updated_at
}

function buildSellerOnboardingEmailPayload({ row = {}, listing = null, onboarding = {}, organisationId = '', actor = {}, workspaceName = '' } = {}) {
  const propertyTitle = normalizeText(
    listing?.title ||
      listing?.propertyTitle ||
      row?.propertyInterest ||
      row?.property_interest ||
      row?.sellerPropertyAddress ||
      row?.seller_property_address ||
      row?.areaInterest ||
      row?.area_interest ||
      'your property',
  )
  return {
    type: 'seller_onboarding_link',
    to: normalizeText(row.email || row.contact?.email).toLowerCase(),
    organisationId: normalizeText(organisationId),
    sellerName: normalizeText(row.name || row.contact?.name || 'Seller'),
    propertyTitle,
    onboardingLink: normalizeText(onboarding?.link),
    transactionReference: normalizeText(row.leadReference || row.lead_reference || row.leadId),
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
  if (!rows.length) return { complete: 0, total: 0, percent: 0 }
  const complete = rows.filter((document) => {
    const status = normalizeText(document.status || document.documentStatus || document.document_status).toLowerCase()
    return Boolean(document.url) || ['approved', 'uploaded', 'verified', 'accepted', 'complete', 'completed', 'signed'].includes(status)
  }).length
  return {
    complete,
    total: rows.length,
    percent: Math.round((complete / rows.length) * 100),
  }
}

function SellerWorkspaceCard({ title, action, children, className = '', id = '' }) {
  return (
    <section id={id || undefined} className={`${panelClass} flex h-full min-h-[220px] flex-col p-5 ${className}`}>
      <div className="flex min-h-8 items-start justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">{title}</h2>
        {action}
      </div>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
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

function SellerLeadStatusChips({ row, journey, readiness, listing = null }) {
  const listingMeta = getSellerListingMeta(row, listing, journey)
  const mandateMeta = getSellerMandateMeta(row, listing, journey)
  const chips = [
    { label: 'Assigned Agent', value: getOwnerName(row) || 'Unassigned', tone: getOwnerName(row) === 'Unassigned' ? 'slate' : 'blue' },
    { label: 'Current Stage', value: journey?.stage?.label || row.stage || 'Contacted', tone: 'blue' },
    { label: 'Readiness', value: readiness?.readinessLabel || 'Review', tone: readiness?.missingItems?.length ? 'amber' : 'green' },
    { label: 'Listing', value: listingMeta.label, tone: listingMeta.tone },
    { label: 'Mandate', value: mandateMeta.label, tone: mandateMeta.tone },
  ]

  const toneClasses = {
    green: 'border-emerald-100 bg-emerald-50/80 text-emerald-800',
    amber: 'border-amber-100 bg-amber-50/80 text-amber-800',
    blue: 'border-blue-100 bg-blue-50/80 text-blue-800',
    slate: 'border-slate-200 bg-slate-50/90 text-slate-700',
  }

  return (
    <dl className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {chips.map((chip) => (
        <div key={chip.label} className={`min-w-0 rounded-2xl border px-3 py-2 shadow-[0_10px_30px_rgba(15,23,42,0.04)] ${toneClasses[chip.tone] || toneClasses.slate}`}>
          <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">{chip.label}</dt>
          <dd className="mt-1 truncate text-sm font-semibold capitalize">{chip.value || 'Not Set'}</dd>
        </div>
      ))}
    </dl>
  )
}

function SellerLeadActions({
  row,
  journey,
  listing = null,
  onboardingStatus = '',
  sendingOnboarding = false,
  onSendSellerOnboarding,
  onGenerateMandate,
  onOpenListing,
  onCopySellerPortalLink,
  onCopyListingLink,
  onMarkAsLost,
  onArchiveLead,
}) {
  const listingMeta = getSellerListingMeta(row, listing, journey)
  const mandateMeta = getSellerMandateMeta(row, listing, journey)
  const onboardingMeta = getSellerOnboardingActionMeta(onboardingStatus, row, listing)
  const OnboardingIcon = onboardingMeta.icon || Mail
  const mandateRequiresOnboarding = !mandateMeta.hasRecord && !sellerOnboardingIsSubmitted(onboardingStatus)

  const buttonBase = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
      <button type="button" onClick={onOpenListing} className={`${buttonBase} bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)] hover:bg-slate-800`}>
        {listingMeta.actionLabel}
      </button>
      <button
        type="button"
        onClick={() => onSendSellerOnboarding?.()}
        disabled={sendingOnboarding || onboardingMeta.disabled}
        title={onboardingMeta.help}
        className={`${buttonBase} border ${onboardingMeta.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : onboardingMeta.tone === 'sent' ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
      >
        <OnboardingIcon size={16} />
        {sendingOnboarding ? 'Sending...' : onboardingMeta.label}
      </button>
      <button
        type="button"
        onClick={() => onSendSellerOnboarding?.()}
        disabled={sendingOnboarding}
        className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
      >
        <RefreshCw size={15} />
        Resend Seller Portal Link
      </button>
      <button
        type="button"
        onClick={onGenerateMandate}
        disabled={mandateRequiresOnboarding}
        title={mandateRequiresOnboarding ? 'Seller onboarding must be submitted before generating a mandate.' : mandateMeta.actionLabel}
        className={`${buttonBase} border ${mandateMeta.tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : mandateMeta.hasRecord ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
      >
        <FileText size={16} />
        {mandateMeta.actionLabel}
      </button>
      <details className="relative">
        <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" aria-label="Seller actions">
          <MoreVertical size={17} />
        </summary>
        <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl">
          <a href="#seller-details" className="block rounded-lg px-3 py-2 hover:bg-slate-50">Edit seller details</a>
          <a href="#seller-ownership" className="block rounded-lg px-3 py-2 hover:bg-slate-50">Assign agent</a>
          {onboardingMeta.disabled ? (
            <button type="button" onClick={() => onSendSellerOnboarding?.()} disabled={sendingOnboarding} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50">
              Resend Onboarding Link
            </button>
          ) : null}
          <button type="button" onClick={onCopySellerPortalLink} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Copy seller portal link</button>
          <button type="button" onClick={onCopyListingLink} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Copy listing link</button>
          <div className="my-1 h-px bg-slate-100" />
          <button type="button" onClick={onMarkAsLost} className="block w-full rounded-lg px-3 py-2 text-left text-rose-600 hover:bg-rose-50">Mark as lost</button>
          <button type="button" onClick={onArchiveLead} className="block w-full rounded-lg px-3 py-2 text-left text-rose-600 hover:bg-rose-50">Archive lead</button>
        </div>
      </details>
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
  onSendSellerOnboarding,
  onGenerateMandate,
  onOpenListing,
  onCopySellerPortalLink,
  onCopyListingLink,
  onMarkAsLost,
  onArchiveLead,
}) {
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
              <StatusPill>{row.source || 'Unknown source'}</StatusPill>
              <StatusPill>{row.status || row.stage || 'Active'}</StatusPill>
              <StatusPill>{formatDate(row.createdAt, 'No created date')}</StatusPill>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <SellerLeadStatusChips row={row} journey={journey} readiness={readiness} listing={listing} />
          <SellerLeadActions
            row={row}
            journey={journey}
            listing={listing}
            onboardingStatus={onboardingStatus}
            sendingOnboarding={sendingOnboarding}
            onSendSellerOnboarding={onSendSellerOnboarding}
            onGenerateMandate={onGenerateMandate}
            onOpenListing={onOpenListing}
            onCopySellerPortalLink={onCopySellerPortalLink}
            onCopyListingLink={onCopyListingLink}
            onMarkAsLost={onMarkAsLost}
            onArchiveLead={onArchiveLead}
          />
        </div>
      </div>
    </header>
  )
}

function SellerJourneyRail({ journey = null, row = {}, listing = null }) {
  if (!journey) return <EmptyState title="Seller journey unavailable" copy="This seller lead could not be mapped to the existing seller journey service." />
  return (
    <section className={`${panelClass} flex h-full min-h-[220px] flex-col p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">Seller Journey</h2>
          <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-slate-950">{journey.status?.summary || journey.stage?.label || 'Contacted'}</p>
        </div>
        <StatusPill tone={journey.listingLive ? 'green' : journey.listingCreated ? 'amber' : 'blue'}>{journey.stage?.status || journey.status?.status || 'Active'}</StatusPill>
      </div>
      <ol className="mt-7 grid gap-4 lg:grid-cols-6">
        {(journey.steps || []).map((step, index, steps) => {
          const date = getSellerJourneyStepDate(row, listing, journey, step)
          const isLast = index === steps.length - 1
          return (
            <li key={step.key} className="relative min-w-0">
              {!isLast ? <span className={`absolute left-10 top-5 hidden h-px w-[calc(100%+1rem)] lg:block ${step.completed ? 'bg-emerald-300' : 'bg-slate-200'}`} /> : null}
              <div className="relative flex min-h-[104px] flex-col items-start gap-3">
                <span className={`z-10 flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold shadow-sm ${step.current ? 'border-blue-600 bg-blue-600 text-white ring-4 ring-blue-100' : step.completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-300'}`}>
                  {step.completed || step.current ? <CheckCircle2 size={16} /> : <FileText size={14} />}
                </span>
                <div className="min-w-0">
                  <p className={`truncate text-sm font-semibold ${step.current ? 'text-blue-700' : step.completed ? 'text-slate-950' : 'text-slate-500'}`}>{step.label}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">{date ? formatDate(date) : step.upcoming ? 'Upcoming' : step.status || step.state}</p>
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
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.95fr)_minmax(260px,0.65fr)]">
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
    { key: 'documents', label: 'Documents' },
    { key: 'activity', label: 'Activity' },
  ]
  return (
    <nav className={`${panelClass} sticky top-0 z-10 flex flex-wrap gap-1 p-2 shadow-[0_12px_30px_rgba(15,23,42,0.06)]`} aria-label="Seller workspace tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={`min-h-10 rounded-xl px-4 text-sm font-semibold transition ${activeTab === tab.key ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

function SellerOverviewTab({ row, sourceInfo, journey, timeline, organisationId, actor, onSaved, onTabChange }) {
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-4">
      <SellerWorkspaceCard title="Lead Summary">
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
      <SellerWorkspaceCard title="Recent Activity" action={<button type="button" onClick={() => onTabChange('activity')} className="text-xs font-semibold text-blue-700">View All</button>}>
        <SellerTimelineList timeline={timeline} limit={5} compact />
      </SellerWorkspaceCard>
      <SellerOwnershipSummaryCard organisationId={organisationId} lead={row} actor={actor} onSaved={onSaved} />
    </div>
  )
}

function SellerProfileTab({ row, journey, onboardingStatus }) {
  const preferences = normalizeLeadCommunicationPreferences(
    row?.communicationPreferences ||
    buildDefaultLeadCommunicationPreferences({ organisationId: row?.organisationId || row?.organisation_id, leadId: row?.leadId }),
  )
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SellerWorkspaceCard title="Seller Contact">
        <dl className="flex flex-1 flex-col">
          <SellerInfoRow label="Name" value={row.name || row.contact?.name} />
          <SellerInfoRow label="Phone" value={row.phone || row.contact?.phone} />
          <SellerInfoRow label="Email" value={row.email || row.contact?.email} />
          <SellerInfoRow label="Portal Status" value={journey?.sellerPortalStatus || 'Not opened'} />
          <SellerInfoRow label="Onboarding" value={normalizeText(onboardingStatus).replace(/_/g, ' ') || 'Not started'} />
        </dl>
      </SellerWorkspaceCard>
      <SellerWorkspaceCard title="Communication">
        <dl className="flex flex-1 flex-col">
          <SellerInfoRow label="Preferred Channel" value={preferences.preferredChannel || 'Email'} />
          <SellerInfoRow label="Email Alerts" value={preferences.emailEnabled ? 'Enabled' : 'Paused'} />
          <SellerInfoRow label="WhatsApp Alerts" value={preferences.whatsappEnabled ? 'Enabled' : 'Paused'} />
          <SellerInfoRow label="Notes" value={row.notes || row.description} />
        </dl>
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

function SellerMandateTab({ row, listing, journey, onGenerateMandate }) {
  const mandateMeta = getSellerMandateMeta(row, listing, journey)
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <SellerWorkspaceCard title="Mandate Status" action={<StatusPill tone={mandateMeta.tone}>{mandateMeta.label}</StatusPill>}>
        <dl className="flex flex-1 flex-col">
          <SellerInfoRow label="Status" value={mandateMeta.label} />
          <SellerInfoRow label="Packet Id" value={row.mandatePacketId || row.mandate_packet_id || listing?.mandatePacketId || listing?.mandate_packet_id} />
          <SellerInfoRow label="Date Signed" value={formatDateTime(row.mandateSignedAt || row.mandate_signed_at || listing?.mandateSignedAt || listing?.mandate_signed_at)} />
          <SellerInfoRow label="Seller Portal" value={journey?.sellerPortalStatus || 'Not opened'} />
        </dl>
        <button type="button" onClick={onGenerateMandate} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white">
          {mandateMeta.actionLabel}
        </button>
      </SellerWorkspaceCard>
      <SellerWorkspaceCard title="Mandate History">
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
  )
}

function SellerDocumentsTab({ journey }) {
  const documents = journey?.documents || []
  const completion = getSellerDocumentCompletion(documents)
  return (
    <SellerWorkspaceCard title="Document Center" action={<StatusPill tone={completion.percent >= 80 ? 'green' : completion.percent ? 'amber' : 'slate'}>{completion.percent}% complete</StatusPill>}>
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div>
          <ListingReadinessCircle percent={completion.percent} />
          <p className="mt-4 text-lg font-semibold tracking-[-0.035em] text-slate-950">Documents Complete</p>
          <p className="mt-1 text-sm font-medium text-slate-500">{completion.complete}/{completion.total} requirements complete</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {documents.length ? documents.map((document) => {
            const complete = getSellerDocumentCompletion([document]).percent === 100
            return (
              <article key={document.id} className={`rounded-2xl border p-4 ${complete ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{document.label}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{document.status || (complete ? 'Uploaded' : 'Missing')}</p>
                  </div>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full ${complete ? 'bg-emerald-600 text-white' : 'bg-white text-rose-500'}`}>
                    {complete ? <CheckCircle2 size={15} /> : <FileText size={15} />}
                  </span>
                </div>
                {document.url ? <a href={document.url} className="mt-3 inline-flex text-sm font-semibold text-blue-700">Open document</a> : null}
              </article>
            )
          }) : <EmptyState title="No seller documents" copy="Seller document requirements will appear from the existing seller journey." />}
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

function SellerActivityTab({ timeline = [] }) {
  return (
    <SellerWorkspaceCard title="Activity">
      <SellerTimelineList timeline={timeline} limit={30} />
    </SellerWorkspaceCard>
  )
}

function SellerTabContent({ activeTab, row, sourceInfo, journey, readiness, listing, onboardingStatus, timeline, organisationId, actor, onSaved, onTabChange, onGenerateMandate }) {
  if (activeTab === 'seller') return <SellerProfileTab row={row} journey={journey} onboardingStatus={onboardingStatus} />
  if (activeTab === 'property') return <SellerPropertyTab row={row} listing={listing} />
  if (activeTab === 'mandate') return <SellerMandateTab row={row} listing={listing} journey={journey} onGenerateMandate={onGenerateMandate} />
  if (activeTab === 'documents') return <SellerDocumentsTab journey={journey} />
  if (activeTab === 'activity') return <SellerActivityTab timeline={timeline} />
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
  const documents = journey?.documents || []
  const completion = getSellerDocumentCompletion(documents)
  return (
    <SellerWorkspaceCard
      className="scroll-mt-6"
      title="Documents"
      action={<StatusPill tone={completion.percent >= 80 ? 'green' : completion.percent ? 'amber' : 'slate'}>{completion.percent}%</StatusPill>}
      id="seller-documents"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-lg font-semibold tracking-[-0.035em] text-slate-950">Documents Complete</p>
        <span className="text-sm font-semibold text-slate-500">{completion.complete}/{completion.total}</span>
      </div>
      <div className="mt-4 flex flex-1 flex-col justify-between gap-2">
        {documents.length ? documents.map((document) => {
          const complete = getSellerDocumentCompletion([document]).percent === 100
          return (
            <div key={document.id} className="flex min-h-8 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <span className="truncate text-sm font-semibold text-slate-700">{document.label}</span>
              <span className={`text-sm font-semibold ${complete ? 'text-emerald-600' : 'text-rose-500'}`}>{complete ? '✓' : '✗'}</span>
            </div>
          )
        }) : <p className="text-sm text-slate-500">No seller documents linked.</p>}
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
    <SellerWorkspaceCard title="Ownership" id="seller-ownership" action={<StatusPill tone={getSlaTone(lead.slaStatus)}>{formatSlaStatus(lead.slaStatus)}</StatusPill>}>
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
  sellerActionError,
  sellerActionMessage,
  organisationId,
  actor,
  timeline,
  onSaved,
  onSendSellerOnboarding,
  onGenerateMandate,
  onOpenListing,
  onCopySellerPortalLink,
  onCopyListingLink,
  onMarkAsLost,
  onArchiveLead,
}) {
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState('overview')
  const handleAcquisitionAction = useCallback((actionId = '') => {
    const key = normalizeText(actionId).toLowerCase()
    if (['send_onboarding', 'open_seller_portal'].includes(key)) onSendSellerOnboarding?.()
    else if (['generate_mandate', 'send_mandate', 'view_mandate', 'check_signature_status', 'resend_mandate'].includes(key)) onGenerateMandate?.()
    else if (['create_listing', 'open_listing', 'complete_listing', 'activate_listing'].includes(key)) onOpenListing?.()
    else if (['open_documents'].includes(key)) setActiveWorkspaceTab('documents')
    else if (['contact_seller', 'open_timeline'].includes(key)) setActiveWorkspaceTab('activity')
    else if (['capture_property_address'].includes(key)) setActiveWorkspaceTab('property')
    else setActiveWorkspaceTab('overview')
  }, [onGenerateMandate, onOpenListing, onSendSellerOnboarding])

  return (
    <div className="space-y-6">
      <SellerLeadHeader
        row={row}
        journey={sellerJourney}
        readiness={sellerReadiness}
        listing={linkedSellerListing}
        onboardingStatus={sellerOnboardingStatus}
        sendingOnboarding={sendingSellerOnboarding}
        onSendSellerOnboarding={onSendSellerOnboarding}
        onGenerateMandate={onGenerateMandate}
        onOpenListing={onOpenListing}
        onCopySellerPortalLink={onCopySellerPortalLink}
        onCopyListingLink={onCopyListingLink}
        onMarkAsLost={onMarkAsLost}
        onArchiveLead={onArchiveLead}
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
        onSaved={onSaved}
        onTabChange={setActiveWorkspaceTab}
        onGenerateMandate={onGenerateMandate}
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

  const loadWorkspace = useCallback(async () => {
    if (!organisationId || !leadId) return
    try {
      setLoading(true)
      setError('')
      const result = await fetchAgentLeadWorkspace({ organisationId, leadId })
      setData(result)
    } catch (loadError) {
      setData(null)
      setError(loadError?.message || 'Unable to load this lead.')
    } finally {
      setLoading(false)
    }
  }, [leadId, organisationId])

  useEffect(() => {
    void loadWorkspace()
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
  const sellerJourney = useMemo(() => {
    if (!row || !isSellerLeadWorkspace) return null
    return buildSellerJourney({
      lead: row,
      contact: row.contact || {},
      appointments: row.appointments || [],
      listing: linkedSellerListing,
    })
  }, [isSellerLeadWorkspace, linkedSellerListing, row])
  const sellerReadiness = useMemo(() => {
    if (!row || !isSellerLeadWorkspace) return null
    return buildSellerReadinessSummary({
      lead: row,
      contact: row.contact || {},
      appointments: row.appointments || [],
      listing: linkedSellerListing,
      journey: sellerJourney,
    })
  }, [isSellerLeadWorkspace, linkedSellerListing, row, sellerJourney])
  const sellerOnboardingStatus = row ? getSellerOnboardingStatus(row, linkedSellerListing) : ''
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
    if (!row || !isSellerLeadWorkspace || sendingSellerOnboarding) return
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
        stage: 'Onboarding Sent',
        status: 'Onboarding Sent',
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
      setSendingSellerOnboarding(false)
    }
  }, [actor, isSellerLeadWorkspace, linkedSellerListing, loadWorkspace, organisationId, row, sendingSellerOnboarding, workspaceName])

  const openMandateWorkspace = useCallback(() => {
    if (!row) return
    const onboardingSubmitted = sellerOnboardingIsSubmitted(getSellerOnboardingStatus(row, linkedSellerListing))
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
    if (row?.convertedTransactionId) navigate(`/transactions/${row.convertedTransactionId}`)
    else setActiveTab('offers')
  }, [navigate, row?.convertedTransactionId])

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
              sellerActionError={sellerActionError}
              sellerActionMessage={sellerActionMessage}
              organisationId={organisationId}
              actor={actor}
              timeline={data?.timeline || row.communicationTimeline || []}
              onSaved={loadWorkspace}
              onSendSellerOnboarding={sendSellerOnboardingForLead}
              onGenerateMandate={openMandateWorkspace}
              onOpenListing={openSellerListing}
              onCopySellerPortalLink={copySellerPortalLink}
              onCopyListingLink={copyListingLink}
              onMarkAsLost={markSellerLeadAsLost}
              onArchiveLead={archiveSellerLead}
            />
          ) : (
            <div className="buyer-lead-workspace page-content">
              <BuyerLeadHeader
                row={row}
                sourceInfo={sourceInfo}
                leadScore={getBuyerLeadScore(row, workspaceAnalytics)}
                lastActivity={getBuyerLastActivity(row)}
                onOpenTimeline={() => setActiveTab('timeline')}
                onDelete={deleteCurrentLead}
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
