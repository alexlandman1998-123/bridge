import { ArrowUpRight, CalendarDays, CheckSquare, Clock3, Columns3, Filter, Home, ImageIcon, Mail, MoreHorizontal, Pencil, Phone, Plus, Search, Table2, Trash2, TrendingUp, Upload, UserRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import AppointmentCalendarActions from '../../components/appointments/AppointmentCalendarActions'
import LegalDocumentWorkspace from '../../components/documents/LegalDocumentWorkspace'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  ACTIVITY_TYPES,
  APPOINTMENT_PARTICIPANT_ROLES,
  APPOINTMENT_RSVP_STATUSES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  LEAD_PRIORITIES,
  LEAD_STAGES,
  TASK_PRIORITIES,
  addAppointmentOutcomeAsync,
  buildAppointmentsDashboardSummary,
  buildPipelineMetrics,
  buildPrincipalReporting,
  createAppointmentAsync,
  filterDeletedAgencyLeadRows,
  getAgencyCrmUpdatedEventName,
  getAgencyPipelineSnapshot,
  checkAppointmentSchedulingIntegrityAsync,
  listAppointmentsAsync,
  listAppointmentResourcesAsync,
  recoverAgencyPipelineStoreForOrganisation,
  updateAppointmentAsync,
  updateAppointmentParticipantRsvpAsync,
} from '../../lib/agencyPipelineService'
import {
  createAgencyCrmLeadActivity,
  updateAgencyCrmContactRecord,
  createAgencyCrmLeadRecord,
  createAgencyCrmLeadTask,
  deleteAgencyCrmLeadActivity,
  deleteAgencyCrmLeadRecord,
  deleteAgencyCrmLeadTask,
  listAgencyCrmLeadContacts,
  updateAgencyCrmLeadActivity,
  updateAgencyCrmLeadRecord,
  updateAgencyCrmLeadTask,
} from '../../lib/agencyCrmRepository'
import { listOrganisationUsers, fetchOrganisationSettings } from '../../lib/settingsApi'
import { canAccessPrincipalExperience, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import Modal from '../../components/ui/Modal'
import {
  buildSellerClientPortalLink,
  buildSellerOnboardingLink,
  createAgentSellerLead,
  createListingDraftFromSellerLead,
  generateSellerOnboardingToken,
  LISTING_STATUS,
  SELLER_ONBOARDING_STATUS,
  readAgentPrivateListings,
  updateAgentSellerLead,
  updateSellerWorkflowRecordByToken,
} from '../../lib/agentListingStorage'
import { MOCK_DATA_ENABLED } from '../../lib/mockData'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { createPrivateListing, createPrivateListingActivity, getOrganisationPrivateListings, getSellerOnboardingByToken, sendSellerOnboarding, updatePrivateListing } from '../../services/privateListingService'
import { generatePacketVersion, generateSigningLinks, listPacketTemplates, prepareSigningFields } from '../../core/documents/packetService'
import { createDocumentPacket, fetchDocumentPacket, listDocumentPackets } from '../../lib/documentPacketsApi'
import {
  mapSellerOnboardingToMandateData,
  normalizeSellerOnboardingStatus,
  validateMandateGenerationData,
} from '../../core/documents/mandateDataMapper'
import {
  documentPacketBelongsToLead,
  formatPacketStatusMeta,
  resolveDocumentPacketActionState,
  resolveDocumentPacketStatus,
} from '../../core/documents/packetStatusResolver'
import { getAppointmentTypeLabel, getAppointmentTypeOptions } from '../../lib/appointmentTypeDefinitions'
import { readViewingRequests } from '../../lib/viewingWorkflow'
import {
  applyAppointmentTemplate,
  getAppointmentRequiredPrep,
  getAppointmentTemplateInstructions,
  getAppointmentTypeTemplate,
} from '../../services/appointmentTemplateService'
import { createCanonicalOffer } from '../../lib/buyerLifecycleService'
import { isBuyerWorkflowStage, transitionBuyerLeadStage } from '../../lib/workflowEngine'

const PIPELINE_CONTEXT_TIMEOUT_MS = 3500
const PIPELINE_RECORDS_TIMEOUT_MS = 3500
const PIPELINE_APPOINTMENT_RECORDS_TIMEOUT_MS = 15000
const SELLER_ONBOARDING_COMPLETION_POLL_MS = 7000
const LEAD_WORKSPACE_RETRY_MS = 2500
const CANVASSING_STORAGE_PREFIX = 'itg:agency-canvassing:v1'
const CANVASSING_UPDATED_EVENT = 'itg:agency-canvassing-updated'
const LEAD_WORKSPACE_MAX_RETRIES = 10
const LEAD_TABLE_PAGE_SIZE = 12
const QUICK_CREATE_STORAGE_KEY = 'bridge:quick-create-records:v1'
const APPOINTMENT_CATEGORY_CONFIG = {
  viewing: {
    label: 'Viewing',
    background: '#f0f7ff',
    border: '#bfdbfe',
    accent: '#2f6fb3',
    text: '#1f4f78',
    badgeBackground: '#e2f0ff',
  },
  seller_consultation: {
    label: 'Seller Consultation',
    background: '#fff8eb',
    border: '#f3d59a',
    accent: '#b7791f',
    text: '#805317',
    badgeBackground: '#fff0cf',
  },
  buyer_consultation: {
    label: 'Buyer Consultation',
    background: '#effaf3',
    border: '#bfe7cc',
    accent: '#2f855a',
    text: '#256348',
    badgeBackground: '#dcf5e5',
  },
  signing: {
    label: 'Signing Appointment',
    background: '#f6f1ff',
    border: '#d8c7f5',
    accent: '#7856b8',
    text: '#5b3c93',
    badgeBackground: '#eee4ff',
  },
  valuation: {
    label: 'Valuation',
    background: '#eefbfb',
    border: '#b8e2e1',
    accent: '#248a8a',
    text: '#1f6667',
    badgeBackground: '#d9f4f3',
  },
  media: {
    label: 'Photos / Media',
    background: '#fff3f2',
    border: '#f3c4bd',
    accent: '#c45a44',
    text: '#95402f',
    badgeBackground: '#ffe4df',
  },
  general: {
    label: 'General Appointment',
    background: '#f6f8fb',
    border: '#d8e2ee',
    accent: '#60758d',
    text: '#3d5368',
    badgeBackground: '#edf2f7',
  },
  other: {
    label: 'Other / Unknown',
    background: '#f8f7fb',
    border: '#ddd8e8',
    accent: '#756b8f',
    text: '#554b6b',
    badgeBackground: '#eeebf5',
  },
}

function withPipelineTimeout(task, message, timeoutMs = PIPELINE_CONTEXT_TIMEOUT_MS) {
  let timeoutId = null
  return Promise.race([
    task,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

const LEAD_LOST_REASON_OPTIONS = [
  'No response',
  'Not interested',
  'Duplicate',
  'Wrong details',
  'Bought elsewhere',
  'Sold elsewhere',
  'Other',
]

const BUYER_LEAD_KANBAN_STAGES = [
  {
    id: 'lead',
    label: 'Lead',
    stageValue: 'Lead',
    description: 'New leads needing qualification.',
    emptyState: 'New leads will appear here once created or converted from canvassing.',
  },
  {
    id: 'viewing_contacted',
    label: 'Viewing / Contacted',
    stageValue: 'Contacted',
    description: 'Engaged, qualified, or viewing booked.',
    emptyState: 'Move leads here once contacted or viewing is booked.',
  },
  {
    id: 'offer',
    label: 'Offer',
    stageValue: 'Offer Submitted',
    description: 'Offer discussions and negotiation.',
    emptyState: 'Move leads here once offer discussions begin.',
  },
  {
    id: 'deal_otp',
    label: 'Deal / OTP',
    stageValue: 'Deal Created',
    description: 'Deal created or OTP in motion.',
    emptyState: 'Move leads here once a deal or OTP is in motion.',
  },
  {
    id: 'finance',
    label: 'Finance',
    stageValue: 'Finance',
    description: 'Finance or bond work in progress.',
    emptyState: 'Move leads here once finance or bond work begins.',
  },
  {
    id: 'transfer',
    label: 'Transfer',
    stageValue: 'Transfer',
    description: 'Transfer process in progress.',
    emptyState: 'Move leads here once transfer is underway.',
  },
  {
    id: 'registered',
    label: 'Registered',
    stageValue: 'Registered / Closed',
    description: 'Transaction successfully registered.',
    emptyState: 'Registered transactions will appear here.',
  },
  {
    id: 'lost',
    label: 'Lost',
    stageValue: 'Lost',
    description: 'Lead closed or no longer active.',
    emptyState: 'Closed or lost leads will appear here.',
  },
]

const SELLER_LEAD_KANBAN_STAGES = [
  {
    id: 'lead',
    label: 'Lead',
    stageValue: 'Lead',
    description: 'New seller leads needing qualification.',
    emptyState: 'New seller leads will appear here once created or converted from canvassing.',
  },
  {
    id: 'valuation_scheduled',
    label: 'Valuation Scheduled',
    stageValue: 'Appointment Scheduled',
    description: 'Valuation booked or being arranged.',
    emptyState: 'Move seller leads here once valuation is booked or being arranged.',
  },
  {
    id: 'mandate_sent',
    label: 'Mandate Sent',
    stageValue: 'Mandate Sent',
    description: 'Mandate prepared or sent to seller.',
    emptyState: 'Move seller leads here once the mandate is prepared or sent.',
  },
  {
    id: 'mandate_signed',
    label: 'Mandate Signed',
    stageValue: 'Mandate Signed',
    description: 'Mandate signed and ready to list.',
    emptyState: 'Move seller leads here once the mandate is signed.',
  },
  {
    id: 'listing_active',
    label: 'Listing Active',
    stageValue: 'Converted To Listing',
    description: 'Property listed and being marketed.',
    emptyState: 'Move seller leads here once the listing is active.',
  },
  {
    id: 'offer_received',
    label: 'Offer Received',
    stageValue: 'Offer Submitted',
    description: 'Offer received from buyer.',
    emptyState: 'Move seller leads here once an offer is received.',
  },
  {
    id: 'deal_otp',
    label: 'Deal / OTP',
    stageValue: 'Deal Created',
    description: 'Deal created or OTP in motion.',
    emptyState: 'Move seller leads here once a deal or OTP is in motion.',
  },
  {
    id: 'transfer',
    label: 'Transfer',
    stageValue: 'Transfer',
    description: 'Transfer process in progress.',
    emptyState: 'Move seller leads here once transfer is underway.',
  },
  {
    id: 'registered',
    label: 'Registered',
    stageValue: 'Registered / Closed',
    description: 'Transaction successfully registered.',
    emptyState: 'Registered seller transactions will appear here.',
  },
  {
    id: 'lost',
    label: 'Lost',
    stageValue: 'Lost',
    description: 'Lead closed or no longer active.',
    emptyState: 'Closed or lost seller leads will appear here.',
  },
]

function getLeadKanbanColumnsForType(leadType = 'buyer') {
  return leadType === 'seller' ? SELLER_LEAD_KANBAN_STAGES : BUYER_LEAD_KANBAN_STAGES
}

function getPipelineKanbanColumn(columnId = '', leadType = 'buyer') {
  const columns = getLeadKanbanColumnsForType(leadType)
  return columns.find((column) => column.id === columnId) || columns[0]
}

function normalizeLeadKanbanStage(stage) {
  const normalized = normalizeKey(stage)
  if (!normalized) return 'lead'
  if (['canvassing', 'prospecting', 'new_prospect', 'new prospect', 'new_lead', 'new lead'].includes(normalized)) return 'lead'
  return normalized
}

function resolvePipelineKanbanColumnId(lead = {}, linkedDeal = null) {
  const stage = normalizeLeadKanbanStage(lead?.stage || lead?.status)
  const status = normalizeLeadKanbanStage(lead?.status)
  const combined = `${stage} ${status}`
  const isSellerLead = normalizeKey(lead?.leadCategory).includes('seller')

  if (combined.includes('lost') || combined.includes('archive')) return 'lost'
  if (combined.includes('registered') || combined.includes('closed')) return 'registered'
  if (combined.includes('transfer')) return 'transfer'
  if (combined.includes('finance') || combined.includes('bond')) return 'finance'
  if (
    combined.includes('deal') ||
    combined.includes('otp') ||
    combined.includes('transaction') ||
    linkedDeal
  ) return 'deal_otp'
  if (isSellerLead) {
    if (combined.includes('offer') || combined.includes('negotiating')) return 'offer_received'
    if (combined.includes('converted to listing') || combined.includes('listing active')) return 'listing_active'
    if (combined.includes('mandate signed')) return 'mandate_signed'
    if (combined.includes('mandate sent') || combined.includes('mandate generated') || combined.includes('mandate ready')) return 'mandate_sent'
    if (combined.includes('valuation') || combined.includes('appointment') || combined.includes('viewing')) return 'valuation_scheduled'
  }
  if (combined.includes('offer') || combined.includes('negotiating')) return 'offer'
  if (
    combined.includes('contacted') ||
    combined.includes('qualified') ||
    combined.includes('viewing') ||
    combined.includes('appointment') ||
    combined.includes('onboarding') ||
    combined.includes('follow-up')
  ) return 'viewing_contacted'
  return 'lead'
}

function canMovePipelineCard({ user = {}, card = null, fromStage = '', toStage = '' } = {}) {
  if (!card?.leadId) {
    return { allowed: false, reason: 'This pipeline card could not be found.' }
  }

  const roleKey = normalizeKey(user.role)
  if (['attorney', 'bond_originator', 'bond originator', 'conveyancer'].includes(roleKey)) {
    return { allowed: false, reason: 'This role cannot move main agency pipeline stages.' }
  }

  const assignedId = normalizeKey(card?.assignedAgentId)
  const assignedEmail = normalizeKey(card?.assignedAgentEmail)
  const userId = normalizeKey(user?.id)
  const userEmail = normalizeKey(user?.email)
  const ownsCard = Boolean(
    user?.isPrincipal ||
      !assignedId && !assignedEmail ||
      assignedId === userId ||
      assignedId === userEmail ||
      assignedEmail === userEmail ||
      assignedEmail === userId,
  )
  if (!ownsCard) {
    return { allowed: false, reason: 'Only the assigned agent or a principal can move this card.' }
  }

  const fromKey = normalizeKey(fromStage)
  const toKey = normalizeKey(toStage)
  if (fromKey === toKey) {
    return { allowed: false, reason: 'This card is already in that pipeline stage.' }
  }

  return { allowed: true, reason: null }
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeAppointmentCategorySignal(value) {
  return normalizeKey(value)
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveAppointmentCategoryKey(appointment = {}) {
  const primaryType = normalizeAppointmentCategorySignal(appointment?.appointmentType || appointment?.appointment_type)
  const title = normalizeAppointmentCategorySignal(appointment?.title)
  const customType = normalizeAppointmentCategorySignal(appointment?.customTypeLabel || appointment?.custom_type_label)
  const source = normalizeAppointmentCategorySignal(appointment?.source)
  const related = normalizeAppointmentCategorySignal(
    [
      appointment?.category,
      appointment?.appointmentCategory,
      appointment?.relatedEntityType,
      appointment?.related_entity_type,
      appointment?.linkedWorkflow,
      appointment?.linked_workflow,
      appointment?.linkedWorkflowStage,
      appointment?.linked_workflow_stage,
      appointment?.completionBehavior,
      appointment?.completion_behavior,
    ].filter(Boolean).join(' '),
  )
  const label = normalizeAppointmentCategorySignal(getAppointmentTypeLabel(primaryType) || appointment?.appointmentTypeLabel)
  const signal = [primaryType, customType, label, title, source, related].filter(Boolean).join(' ')

  if (/(viewing|property viewing|viewing request|showing|show day|open house)/.test(signal)) return 'viewing'
  if (/(seller consultation|seller consult|seller meeting|seller lead|mandate consultation|mandate meeting)/.test(signal)) return 'seller_consultation'
  if (/(buyer consultation|buyer consult|buyer meeting|buyer lead|buyer appointment)/.test(signal)) return 'buyer_consultation'
  if (/(signing|signature|sign |otp|offer to purchase|document signing|mandate signing|contract signing)/.test(signal)) return 'signing'
  if (/(valuation|appraisal|market appraisal|cma|comparative market analysis|price opinion)/.test(signal)) return 'valuation'
  if (/(photo|photos|photography|media|video|virtual tour|floor plan|floorplan|property photos)/.test(signal)) return 'media'
  if (primaryType === 'other' || primaryType === 'unknown' || /\b(other|unknown|misc)\b/.test(signal)) return 'other'
  return 'general'
}

function getAppointmentCategory(appointment = {}) {
  const key = resolveAppointmentCategoryKey(appointment)
  return APPOINTMENT_CATEGORY_CONFIG[key] || APPOINTMENT_CATEGORY_CONFIG.general
}

function getAppointmentCategoryCardStyle(appointment = {}) {
  const category = getAppointmentCategory(appointment)
  return {
    backgroundColor: category.background,
    borderColor: category.border,
    borderLeftColor: category.accent,
  }
}

function getAppointmentCategoryBadgeStyle(appointment = {}) {
  const category = getAppointmentCategory(appointment)
  return {
    backgroundColor: category.badgeBackground,
    color: category.text,
  }
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeLeadUuid(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (isUuidLike(raw)) return raw
  const withoutPrefix = raw.replace(/^lead_/i, '')
  return isUuidLike(withoutPrefix) ? withoutPrefix : ''
}

function normalizeLeadIdentityKey(value) {
  return normalizeLeadUuid(value) || normalizeText(value)
}

function getCanvassingStorageKey(organisationId) {
  return `${CANVASSING_STORAGE_PREFIX}:${normalizeText(organisationId) || 'default'}`
}

function readCanvassingStore(organisationId) {
  if (typeof window === 'undefined') return { prospects: [], activities: [] }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(getCanvassingStorageKey(organisationId)) || '{}')
    return {
      prospects: Array.isArray(parsed?.prospects) ? parsed.prospects : [],
      activities: Array.isArray(parsed?.activities) ? parsed.activities : [],
    }
  } catch {
    return { prospects: [], activities: [] }
  }
}

function resolveCanvassingProspectCategory(prospect = {}) {
  const type = normalizeText(prospect?.prospectType).toLowerCase()
  if (type.includes('seller') || type.includes('landlord')) return 'Seller'
  if (type.includes('buyer') || type.includes('tenant') || type.includes('investor')) return 'Buyer'
  return 'Buyer'
}

function buildLeadContactFallback(lead = {}) {
  const firstName = normalizeText(lead?.sellerName)
  const lastName = normalizeText(lead?.sellerSurname)
  const phone = normalizeText(lead?.sellerPhone)
  const email = normalizeText(lead?.sellerEmail).toLowerCase()
  if (!firstName && !lastName && !phone && !email) return null
  return {
    contactId: normalizeText(lead?.contactId),
    firstName,
    lastName,
    phone,
    email,
    contactType: normalizeText(lead?.leadCategory) || 'Lead',
  }
}

function buildCanvassingProspectContactFallback(prospect = {}) {
  const firstName = normalizeText(prospect?.firstName)
  const lastName = normalizeText(prospect?.lastName)
  const phone = normalizeText(prospect?.phone)
  const email = normalizeText(prospect?.email).toLowerCase()
  if (!firstName && !lastName && !phone && !email) return null
  return {
    contactId: '',
    firstName,
    lastName,
    phone,
    email,
    contactType: resolveCanvassingProspectCategory(prospect),
  }
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function buildAppointmentListingLabel(listing = {}) {
  const reference = normalizeText(listing?.listingReference || listing?.reference || listing?.listing_reference)
  const title = normalizeText(listing?.listingTitle || listing?.title || listing?.propertyName || listing?.property_name)
  const address = normalizeText(listing?.propertyAddress || listing?.address || listing?.addressLine1 || listing?.address_line_1)
  const suburb = normalizeText(listing?.suburb)
  const price = Number(listing?.askingPrice || listing?.asking_price || listing?.price || listing?.estimatedValue || 0)
  return [
    reference || title || address || 'Listing',
    address && address !== title ? address : '',
    suburb,
    Number.isFinite(price) && price > 0 ? formatCurrency(price) : '',
  ].filter(Boolean).join(' — ')
}

function resolveMediaUrl(media = {}) {
  if (!media || typeof media !== 'object') return ''
  return normalizeText(media?.url || media?.signedUrl || media?.publicUrl || media?.fileUrl || media?.src)
}

function resolveListingImageUrl(listing = {}) {
  const marketing = listing?.marketing && typeof listing.marketing === 'object' ? listing.marketing : {}
  const propertyDetails = listing?.propertyDetails && typeof listing.propertyDetails === 'object' ? listing.propertyDetails : {}
  const onboardingFormData =
    listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
      ? listing.sellerOnboarding.formData
      : {}
  const gallery = [
    ...(Array.isArray(marketing.imageGallery) ? marketing.imageGallery : []),
    ...(Array.isArray(listing?.imageGallery) ? listing.imageGallery : []),
    ...(Array.isArray(onboardingFormData.imageGallery) ? onboardingFormData.imageGallery : []),
    ...(Array.isArray(listing?.images) ? listing.images : []),
  ].filter((item) => resolveMediaUrl(item))
  const coverImageId = normalizeText(marketing.coverImageId || propertyDetails.coverImageId || onboardingFormData.coverImageId || listing?.coverImageId || listing?.cover_image_id)
  const coverImage =
    resolveMediaUrl(listing?.coverImage)
      ? listing.coverImage
      : gallery.find((item) => normalizeText(item?.id || item?.path) === coverImageId) || gallery[0] || null
  return normalizeText(marketing.mediaUrl || listing?.mediaUrl || listing?.coverImageUrl || listing?.thumbnailUrl || resolveMediaUrl(coverImage))
}

function normalizeAppointmentListingOption(listing = {}) {
  const id = normalizeText(listing?.id || listing?.listingId || listing?.listing_id)
  if (!id) return null
  const status = normalizeText(listing?.status || listing?.listingStatus || listing?.lifecycleStatus || listing?.listing_status).toLowerCase()
  if (['archived', 'deleted', 'withdrawn', 'removed'].some((blocked) => status.includes(blocked))) return null
  const bedrooms = Number(listing?.bedrooms || listing?.propertyDetails?.bedrooms || 0) || 0
  const bathrooms = Number(listing?.bathrooms || listing?.propertyDetails?.bathrooms || 0) || 0
  const parking = Number(listing?.garages || listing?.coveredParking || listing?.openParking || listing?.propertyDetails?.garages || listing?.propertyDetails?.coveredParking || listing?.propertyDetails?.openParking || 0) || 0
  const askingPrice = Number(listing?.askingPrice || listing?.asking_price || listing?.price || listing?.propertyDetails?.price || listing?.estimatedValue || 0) || 0
  return {
    id,
    label: buildAppointmentListingLabel(listing),
    status: status || 'active',
    title: normalizeText(listing?.listingTitle || listing?.title || listing?.propertyName || listing?.property_name),
    address: normalizeText(listing?.propertyAddress || listing?.address || listing?.addressLine1 || listing?.address_line_1),
    suburb: normalizeText(listing?.suburb),
    askingPrice,
    bedrooms,
    bathrooms,
    parking,
    thumbnailUrl: resolveListingImageUrl(listing),
    assignedAgentId: normalizeText(listing?.assignedAgentId || listing?.assigned_agent_id || listing?.agentId || listing?.agent_id),
    assignedAgentEmail: normalizeText(listing?.assignedAgentEmail || listing?.assigned_agent_email || listing?.agentEmail || listing?.agent_email).toLowerCase(),
    createdBy: normalizeText(listing?.createdBy || listing?.created_by),
    organisationId: normalizeText(listing?.organisationId || listing?.organisation_id),
    updatedAt: listing?.updatedAt || listing?.updated_at || listing?.createdAt || listing?.created_at || null,
  }
}

function buildListingOptionsFromLeads(leads = []) {
  const options = []
  for (const lead of Array.isArray(leads) ? leads : []) {
    const listingId = normalizeText(lead?.listingId || lead?.listing_id)
    if (!listingId) continue
    options.push(normalizeAppointmentListingOption({
      id: listingId,
      listingReference: listingId,
      title: lead?.propertyInterest,
      address: lead?.sellerPropertyAddress,
      suburb: lead?.areaInterest,
      estimatedValue: lead?.estimatedValue || lead?.budget,
      assignedAgentId: lead?.assignedAgentId || lead?.assigned_agent_id,
      assignedAgentEmail: lead?.assignedAgentEmail || lead?.assigned_agent_email,
      createdBy: lead?.createdBy || lead?.created_by,
      organisationId: lead?.organisationId || lead?.organisation_id,
      updatedAt: lead?.updatedAt,
    }))
  }
  return options.filter(Boolean)
}

function readQuickCreateAppointments() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUICK_CREATE_STORAGE_KEY) || '{}')
    return Array.isArray(parsed?.appointments) ? parsed.appointments : []
  } catch {
    return []
  }
}

function mapLocalStatusToAppointmentStatus(value = '') {
  const normalized = normalizeKey(value).replace(/\s+/g, '_')
  if (normalized === 'scheduled') return 'confirmed'
  if (normalized === 'pending_approval' || normalized === 'viewing_requested') return 'requested'
  if (normalized === 'reschedule_requested') return 'alternative_requested'
  if (normalized === 'no_show') return 'no_show'
  return APPOINTMENT_STATUSES.includes(normalized) ? normalized : 'requested'
}

function buildAgentLookupKeys(agent = {}) {
  return [
    agent?.id,
    agent?.userId,
    agent?.email,
    agent?.fullName,
    agent?.name,
  ].map((value) => normalizeKey(value)).filter(Boolean)
}

function appointmentBelongsToAgent(appointment = {}, agent = {}) {
  const agentKeys = new Set(buildAgentLookupKeys(agent))
  if (!agentKeys.size) return false
  const appointmentKeys = [
    appointment?.assignedAgentId,
    appointment?.assignedAgentEmail,
    appointment?.assignedAgentName,
    appointment?.agentId,
    appointment?.agentEmail,
    appointment?.createdBy,
    appointment?.createdById,
    ...(Array.isArray(appointment?.participants)
      ? appointment.participants.flatMap((participant) => [
          participant?.userId,
          participant?.email,
          participant?.name,
        ])
      : []),
  ].map((value) => normalizeKey(value)).filter(Boolean)
  return appointmentKeys.some((key) => agentKeys.has(key))
}

function mapQuickCreateAppointmentToCalendar(row = {}, { organisationId = '', currentAgent = {} } = {}) {
  const appointmentId = normalizeText(row?.appointmentId || row?.appointment_id || row?.id)
  const dateTime = normalizeText(row?.dateTime || row?.date_time || row?.startTime || row?.startsAt)
  const date = normalizeText(row?.date) || (dateTime ? dateTime.slice(0, 10) : '')
  const startTime = normalizeText(row?.time || row?.start_time) || (dateTime ? dateTime.slice(11, 16) : '')
  const rowOrganisationId = normalizeText(row?.organisationId || row?.organisation_id)
  const resolvedOrganisationId = !rowOrganisationId || rowOrganisationId === 'default'
    ? normalizeText(organisationId)
    : rowOrganisationId
  if (!appointmentId || (!date && !dateTime)) return null
  return {
    appointmentId,
    organisationId: resolvedOrganisationId || null,
    assignedAgentId: normalizeText(row?.assignedAgentId || row?.agentId || currentAgent?.id) || null,
    assignedAgentName: normalizeText(row?.assignedAgent || row?.assignedAgentName || currentAgent?.fullName) || null,
    assignedAgentEmail: normalizeText(row?.assignedAgentEmail || row?.agentEmail || currentAgent?.email).toLowerCase() || null,
    appointmentType: normalizeText(row?.appointmentType || row?.appointment_type) || 'other',
    title: normalizeText(row?.title) || getAppointmentTypeLabel(row?.appointmentType || 'other'),
    date: date || null,
    startTime: startTime || null,
    endTime: normalizeText(row?.endTime || row?.end_time) || null,
    dateTime: dateTime || (date ? `${date}T${startTime || '00:00'}` : null),
    location: normalizeText(row?.location),
    notes: normalizeText(row?.notes),
    status: mapLocalStatusToAppointmentStatus(row?.status),
    relatedEntityType: normalizeText(row?.relatedEntityType || row?.related_entity_type || (row?.relatedRecord ? 'quick_create' : 'none')),
    relatedEntityId: normalizeText(row?.relatedEntityId || row?.related_entity_id || row?.relatedRecord) || null,
    createdBy: normalizeText(row?.createdBy || row?.createdById || currentAgent?.id) || null,
    createdAt: row?.createdAt || row?.created_at || new Date().toISOString(),
    updatedAt: row?.updatedAt || row?.updated_at || row?.createdAt || row?.created_at || new Date().toISOString(),
    source: normalizeText(row?.source) || 'quick_create',
    participants: [],
  }
}

function mapViewingRequestToCalendarAppointment(row = {}, { organisationId = '', currentAgent = {} } = {}) {
  const viewingId = normalizeText(row?.viewing_id || row?.viewingId || row?.id)
  if (!viewingId) return null
  const date = normalizeText(row?.proposed_date || row?.proposedDate)
  const startTime = normalizeText(row?.proposed_time || row?.proposedTime)
  if (!date && !startTime) return null
  const agentParticipant = (Array.isArray(row?.participants) ? row.participants : [])
    .find((participant) => normalizeKey(participant?.role) === 'agent')
  return {
    appointmentId: `viewing:${viewingId}`,
    organisationId: normalizeText(row?.organisationId || row?.organisation_id || organisationId) || null,
    assignedAgentId: normalizeText(row?.agent_id || row?.agentId || currentAgent?.id) || null,
    assignedAgentName: normalizeText(row?.agentName || agentParticipant?.name || currentAgent?.fullName) || null,
    assignedAgentEmail: normalizeText(row?.agentEmail || currentAgent?.email).toLowerCase() || null,
    appointmentType: 'viewing',
    title: `Viewing: ${normalizeText(row?.listing_title || row?.listingTitle) || 'Listing'}`,
    date: date || null,
    startTime: startTime || null,
    endTime: null,
    dateTime: date ? `${date}T${startTime || '00:00'}` : null,
    location: normalizeText(row?.location),
    notes: normalizeText(row?.notes),
    status: mapLocalStatusToAppointmentStatus(row?.status),
    leadId: normalizeText(row?.buyer_lead_id || row?.buyerLeadId) || null,
    listingId: normalizeText(row?.listing_id || row?.listingId) || null,
    relatedEntityType: 'viewing_request',
    relatedEntityId: viewingId,
    createdBy: normalizeText(row?.created_by || row?.createdBy || currentAgent?.id) || null,
    createdAt: row?.created_at || row?.createdAt || new Date().toISOString(),
    updatedAt: row?.updated_at || row?.updatedAt || row?.created_at || row?.createdAt || new Date().toISOString(),
    source: 'viewing_request',
    participants: (Array.isArray(row?.participants) ? row.participants : []).map((participant) => ({
      participantId: normalizeText(participant?.participant_id || participant?.participantId),
      name: normalizeText(participant?.name),
      participantRole: normalizeText(participant?.role),
      rsvpStatus: normalizeText(participant?.response_status),
    })),
  }
}

function mergeCalendarAppointmentRows(remoteRows = [], localRows = []) {
  const byId = new Map()
  for (const row of [...remoteRows, ...localRows]) {
    const id = normalizeText(row?.appointmentId || row?.appointment_id || row?.id)
    if (!id) continue
    if (!byId.has(id)) {
      byId.set(id, row)
      continue
    }
    const existing = byId.get(id)
    const existingIsLocal = normalizeText(existing?.source)
    const rowIsRemote = !normalizeText(row?.source)
    if (existingIsLocal && rowIsRemote) byId.set(id, row)
  }
  return Array.from(byId.values())
}

function buildLocalCalendarAppointments({ organisationId = '', currentAgent = {}, includeAll = false } = {}) {
  const quickAppointments = readQuickCreateAppointments()
    .map((row) => mapQuickCreateAppointmentToCalendar(row, { organisationId, currentAgent }))
    .filter(Boolean)
  const viewingAppointments = readViewingRequests()
    .map((row) => mapViewingRequestToCalendarAppointment(row, { organisationId, currentAgent }))
    .filter(Boolean)
  const rows = [...quickAppointments, ...viewingAppointments]
  if (includeAll) return rows
  return rows.filter((row) => appointmentBelongsToAgent(row, currentAgent))
}

function dedupeListingOptions(options = []) {
  const byId = new Map()
  for (const option of Array.isArray(options) ? options : []) {
    if (!option?.id) continue
    const existing = byId.get(option.id)
    if (!existing) {
      byId.set(option.id, option)
      continue
    }
    const existingTime = new Date(existing.updatedAt || 0).getTime()
    const optionTime = new Date(option.updatedAt || 0).getTime()
    if (optionTime >= existingTime) byId.set(option.id, option)
  }
  return Array.from(byId.values()).sort((left, right) => left.label.localeCompare(right.label))
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-ZA')
}

function formatDateShort(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function resolveLeadFunnelStage(lead = {}) {
  const normalizedKanbanStage = normalizeLeadKanbanStage(lead?.stage || lead?.status)
  if (normalizedKanbanStage === 'lead') return 'Lead'
  const stage = normalizeText(lead?.stage || lead?.status).toLowerCase()
  if (!stage) return 'Cold'
  if (stage.includes('lost')) return 'Archived'
  if (stage.includes('converted') || stage.includes('deal created')) return 'Converted'
  if (stage.includes('offer')) return 'Offer Discussed'
  if (stage.includes('viewing completed')) return 'Viewed'
  if (stage.includes('appointment scheduled') || stage.includes('viewing')) return 'Viewing Scheduled'
  if (
    stage.includes('contacted') ||
    stage.includes('follow-up') ||
    stage.includes('qualified') ||
    stage.includes('negotiating')
  ) return 'Contacted'
  return 'Cold'
}

function resolveLeadNextStep(lead = {}, tasks = []) {
  const openTask = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => normalizeText(task?.status) !== 'Completed')
    .sort((a, b) => new Date(a?.dueDate || a?.createdAt || 0) - new Date(b?.dueDate || b?.createdAt || 0))[0]
  if (openTask?.title) return openTask.title

  const stage = normalizeText(lead?.stage || lead?.status).toLowerCase()
  if (stage.includes('offer')) return 'Convert to transaction'
  if (stage.includes('appointment') || stage.includes('viewing')) return 'Follow up after viewing'
  if (stage.includes('contacted') || stage.includes('qualified') || stage.includes('follow-up')) return 'Schedule viewing'
  if (stage.includes('lost')) return 'Archived'
  return 'Call lead'
}

const AGENT_KANBAN_COLORS = ['#32a9e0', '#30bf73', '#f26b4f', '#8b6ce8', '#f0a92e', '#1f6f9f', '#d64c7f']

function getAgentKanbanColor(value = '') {
  const text = normalizeText(value) || 'unassigned'
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % AGENT_KANBAN_COLORS.length
  }
  return AGENT_KANBAN_COLORS[Math.abs(hash) % AGENT_KANBAN_COLORS.length]
}

function getInitials(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'NA'
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function getLeadStageTone(value = '') {
  const stage = normalizeText(value).toLowerCase()
  if (stage.includes('converted') || stage.includes('deal') || stage.includes('signed')) return 'border-[#cde8d8] bg-[#effaf3] text-[#26724c]'
  if (stage.includes('offer') || stage.includes('negotiat')) return 'border-[#f1dfb8] bg-[#fff8e8] text-[#8a641d]'
  if (stage.includes('view') || stage.includes('appointment')) return 'border-[#d4e5fb] bg-[#f1f7ff] text-[#2d659a]'
  if (stage.includes('contact') || stage.includes('qualif') || stage.includes('follow')) return 'border-[#d8e2f0] bg-[#f5f8fc] text-[#405c78]'
  if (stage.includes('lost') || stage.includes('archive')) return 'border-[#ead4d1] bg-[#fff5f4] text-[#9a4038]'
  return 'border-[#dce7f2] bg-[#f8fbff] text-[#35546c]'
}

function getLeadCategoryMeta(lead = {}, contact = {}) {
  const signal = normalizeText(lead?.leadCategory || lead?.leadDirection || contact?.contactType).toLowerCase()
  if (signal.includes('tenant')) return { label: 'Tenant', className: 'border-[#d7e4f5] bg-[#f2f7ff] text-[#315f8f]' }
  if (signal.includes('investor')) return { label: 'Investor', className: 'border-[#ded8f6] bg-[#f5f2ff] text-[#5f4a9b]' }
  if (signal.includes('seller') || signal.includes('landlord')) return { label: 'Seller Lead', className: 'border-[#f0dfb8] bg-[#fff8eb] text-[#8a641d]' }
  return { label: 'Buyer Lead', className: 'border-[#cfe8dc] bg-[#effaf3] text-[#2d6b4a]' }
}

function getLeadStatusMeta(lead = {}, funnelStage = '') {
  const signal = normalizeText(`${funnelStage} ${lead?.stage || ''} ${lead?.status || ''} ${lead?.priority || ''}`).toLowerCase()
  if (signal.includes('lost') || signal.includes('archive')) {
    return { label: 'Archived', score: 1, className: 'border-[#ead4d1] bg-[#fff5f4] text-[#9a4038]', dotClassName: 'bg-[#d96b5f]' }
  }
  if (signal.includes('converted') || signal.includes('qualified') || signal.includes('deal') || signal.includes('signed')) {
    return { label: 'Qualified', score: 4, className: 'border-[#cfe8dc] bg-[#effaf3] text-[#26724c]', dotClassName: 'bg-[#35a66d]' }
  }
  if (signal.includes('hot') || signal.includes('offer') || signal.includes('view') || signal.includes('appointment')) {
    return { label: 'Hot', score: 5, className: 'border-[#cfe8dc] bg-[#effaf3] text-[#26724c]', dotClassName: 'bg-[#35a66d]' }
  }
  if (signal.includes('warm') || signal.includes('contact') || signal.includes('follow')) {
    return { label: 'Warm', score: 3, className: 'border-[#f1dfb8] bg-[#fff8e8] text-[#8a641d]', dotClassName: 'bg-[#d79d3f]' }
  }
  return { label: 'Cold', score: 2, className: 'border-[#d4e5fb] bg-[#f1f7ff] text-[#2d659a]', dotClassName: 'bg-[#4f82b8]' }
}

function getLeadOpportunityPreview(lead = {}, linkedTransaction = null, isSeller = false, linkedListing = null) {
  const listingId = normalizeText(lead?.listingId || lead?.listing_id)
  const transactionTitle = normalizeText(linkedTransaction?.title || linkedTransaction?.transactionReference || linkedTransaction?.propertyAddress)
  const listingTitle = normalizeText(linkedListing?.title || linkedListing?.label)
  const propertyTitle = normalizeText(lead?.propertyInterest || lead?.sellerPropertyAddress || lead?.areaInterest)
  const title = transactionTitle || listingTitle || propertyTitle
  const priceValue = Number(linkedListing?.askingPrice || lead?.estimatedValue || lead?.budget || linkedTransaction?.purchasePrice || linkedTransaction?.salesPrice || 0)
  const area = normalizeText(linkedListing?.suburb || linkedListing?.address || lead?.areaInterest || lead?.sellerPropertyAddress)
  const propertyType = normalizeText(lead?.propertyInterest)
  const listingSpecs = [
    linkedListing?.bedrooms ? `${linkedListing.bedrooms} Bed` : '',
    linkedListing?.bathrooms ? `${linkedListing.bathrooms} Bath` : '',
    linkedListing?.parking ? `${linkedListing.parking} Parking` : '',
  ].filter(Boolean).join(' • ')
  const hasListing = Boolean(listingId || linkedListing || title || linkedTransaction)

  return {
    hasListing,
    title: title || (isSeller ? 'Seller property' : 'Target property'),
    subtitle: linkedListing?.address || (listingId && !linkedListing ? `Listing ${listingId}` : (area || (isSeller ? 'Mandate workspace' : 'Buyer brief'))),
    price: priceValue > 0 ? formatCurrency(priceValue) : '',
    specs: listingSpecs || [propertyType && propertyType !== title ? propertyType : '', area && area !== title ? area : ''].filter(Boolean).join(' • '),
    thumbnailUrl: normalizeText(linkedListing?.thumbnailUrl),
  }
}

function formatRelativeTime(value) {
  if (!value) return 'No activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No activity'
  const diffMs = Date.now() - date.getTime()
  const absMs = Math.abs(diffMs)
  const minutes = Math.round(absMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDateShort(value)
}

function getLeadNextActionMeta(lead = {}, tasks = [], linkedAppointment = null, nextStep = '') {
  const openTask = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => normalizeText(task?.status) !== 'Completed')
    .sort((a, b) => new Date(a?.dueDate || a?.createdAt || 0) - new Date(b?.dueDate || b?.createdAt || 0))[0]
  const appointmentDate = linkedAppointment?.dateTime || linkedAppointment?.appointmentDate || linkedAppointment?.createdAt
  const hasAppointment = Boolean(linkedAppointment && appointmentDate)
  const baseTitle = normalizeText(openTask?.title || nextStep || linkedAppointment?.title) || 'Take action'
  const detail = normalizeText(openTask?.description || lead?.nextFollowUpNote || lead?.notes || linkedAppointment?.notes) || 'Review the lead and choose the next best step.'
  const today = new Date()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()

  if (openTask?.dueDate) {
    const due = new Date(openTask.dueDate)
    if (!Number.isNaN(due.getTime())) {
      const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
      const dayDiff = Math.round((dueDay - todayDay) / 86400000)
      if (dayDiff < 0) {
        return {
          eyebrow: 'Lead follow-up',
          title: baseTitle,
          meta: `Overdue • ${Math.abs(dayDiff)} day${Math.abs(dayDiff) === 1 ? '' : 's'}`,
          detail,
          className: 'border-[#f0d6d3] bg-[#fff7f6] text-[#8f3a31]',
        }
      }
      if (dayDiff === 0) {
        return {
          eyebrow: 'Lead follow-up',
          title: baseTitle,
          meta: 'Due today',
          detail,
          className: 'border-[#efdcb7] bg-[#fff9ec] text-[#8a641d]',
        }
      }
      return {
        eyebrow: 'Lead follow-up',
        title: baseTitle,
        meta: formatDateShort(openTask.dueDate),
        detail,
        className: 'border-[#d7e7d8] bg-[#f4fbf6] text-[#2d6b4a]',
      }
    }
  }

  if (hasAppointment) {
    return {
      eyebrow: 'Upcoming appointment',
      title: normalizeText(linkedAppointment?.title || getAppointmentTypeLabel(linkedAppointment?.appointmentType)) || baseTitle,
      meta: formatCompactDate(appointmentDate),
      detail: normalizeText(linkedAppointment?.location || linkedAppointment?.meetingUrl) || detail,
      className: 'border-[#efdcb7] bg-[#fff9ec] text-[#8a641d]',
    }
  }

  return {
    eyebrow: 'Next best action',
    title: baseTitle,
    meta: 'Healthy',
    detail,
    className: 'border-[#d7e7d8] bg-[#f4fbf6] text-[#2d6b4a]',
  }
}

function getNextStepStatus(tasks = []) {
  const openTask = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => normalizeText(task?.status) !== 'Completed')
    .sort((a, b) => new Date(a?.dueDate || a?.createdAt || 0) - new Date(b?.dueDate || b?.createdAt || 0))[0]
  if (!openTask?.dueDate) return { label: 'No due date', tone: 'bg-[#d7e2ed]', text: 'text-[#60758b]' }
  const due = new Date(openTask.dueDate)
  if (Number.isNaN(due.getTime())) return { label: 'No due date', tone: 'bg-[#d7e2ed]', text: 'text-[#60758b]' }
  const today = new Date()
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (dueDay < todayDay) return { label: 'Overdue', tone: 'bg-[#df6d5f]', text: 'text-[#a33a30]' }
  if (dueDay === todayDay) return { label: 'Due today', tone: 'bg-[#d79d3f]', text: 'text-[#8a641d]' }
  return { label: formatDateShort(openTask.dueDate), tone: 'bg-[#4f82b8]', text: 'text-[#315f8f]' }
}

function formatPercent(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0%'
  return `${Math.round(numeric)}%`
}

function formatCompactDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-ZA', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getConflictLevelTone(level) {
  const normalized = normalizeText(level).toLowerCase()
  if (normalized === 'hard_conflict') return 'border-[#f2d0ce] bg-[#fff5f4] text-[#9f3028]'
  return 'border-[#f3dfb7] bg-[#fff8ec] text-[#8a5b1f]'
}

function isValidEmail(value) {
  const text = String(value || '').trim()
  if (!text) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
}

function isPermissionDeniedError(error) {
  const status = Number(error?.status || error?.statusCode || 0)
  const code = String(error?.code || '').trim()
  const message = String(error?.message || '').toLowerCase()
  return status === 403 || code === '42501' || message.includes('permission denied') || message.includes('row-level security')
}

function resolveSellerSignerLink(signers = [], sellerEmail = '') {
  const rows = Array.isArray(signers) ? signers : []
  const normalizedSellerEmail = normalizeText(sellerEmail).toLowerCase()
  const sellerRoleRows = rows.filter((row) => normalizeText(row?.signer_role).toLowerCase() === 'seller')
  if (!sellerRoleRows.length) return ''
  if (normalizedSellerEmail) {
    const exact = sellerRoleRows.find(
      (row) => normalizeText(row?.signer_email).toLowerCase() === normalizedSellerEmail,
    )
    if (exact?.signing_link) return normalizeText(exact.signing_link)
  }
  return normalizeText(sellerRoleRows[0]?.signing_link)
}

function resolveSignerLinkByRole(signers = [], role = '', email = '') {
  const rows = Array.isArray(signers) ? signers : []
  const normalizedRole = normalizeText(role).toLowerCase()
  const normalizedEmail = normalizeText(email).toLowerCase()
  const roleRows = rows.filter((row) => normalizeText(row?.signer_role).toLowerCase() === normalizedRole)
  if (!roleRows.length) return ''
  if (normalizedEmail) {
    const exact = roleRows.find((row) => normalizeText(row?.signer_email).toLowerCase() === normalizedEmail)
    if (exact?.signing_link) return normalizeText(exact.signing_link)
  }
  return normalizeText(roleRows[0]?.signing_link)
}

function resolveWorkspaceModeFromAction(actionKey) {
  const normalized = normalizeText(actionKey).toLowerCase()
  if (normalized === 'generate') return 'generate'
  if (normalized === 'edit') return 'edit'
  if (normalized === 'send') return 'send'
  if (normalized === 'view_signed') return 'signed'
  return 'view'
}

function dedupeByKey(rows = [], resolveKey) {
  const map = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = normalizeText(resolveKey(row))
    if (!key) continue
    const existing = map.get(key)
    if (!existing) {
      map.set(key, row)
      continue
    }
    const existingTime = new Date(existing?.updatedAt || existing?.createdAt || 0).getTime()
    const rowTime = new Date(row?.updatedAt || row?.createdAt || 0).getTime()
    if (rowTime >= existingTime) map.set(key, row)
  }
  return [...map.values()]
}

function mergeLeadRowsForReload(localRows = [], remoteRows = []) {
  const mergedById = new Map()
  const remoteLeadRows = Array.isArray(remoteRows) ? remoteRows : []

  for (const localRow of Array.isArray(localRows) ? localRows : []) {
    const key = normalizeLeadIdentityKey(localRow?.leadId)
    if (!key) continue
    mergedById.set(key, localRow)
  }

  for (const remoteRow of remoteLeadRows) {
    const key = normalizeLeadIdentityKey(remoteRow?.leadId)
    if (!key) continue
    const localRow = mergedById.get(key) || {}
    const isRemoteRowAuthoritative = isUuidLike(normalizeLeadUuid(remoteRow?.leadId))
    const remoteUpdated = new Date(remoteRow?.updatedAt || remoteRow?.createdAt || 0).getTime()
    const localUpdated = new Date(localRow?.updatedAt || localRow?.createdAt || 0).getTime()
    const baseRow = isRemoteRowAuthoritative
      ? { ...localRow, ...remoteRow }
      : remoteUpdated >= localUpdated ? { ...localRow, ...remoteRow } : { ...remoteRow, ...localRow }

    mergedById.set(key, {
      ...baseRow,
      assignedAgentName: normalizeText(baseRow.assignedAgentName || localRow.assignedAgentName || remoteRow.assignedAgentName),
      assignedAgentEmail: normalizeText(baseRow.assignedAgentEmail || localRow.assignedAgentEmail || remoteRow.assignedAgentEmail).toLowerCase(),
      sellerOnboardingToken: normalizeText(baseRow.sellerOnboardingToken || localRow.sellerOnboardingToken),
      sellerOnboardingLink: normalizeText(baseRow.sellerOnboardingLink || localRow.sellerOnboardingLink),
      sellerOnboardingStatus: normalizeText(baseRow.sellerOnboardingStatus || localRow.sellerOnboardingStatus),
      sellerWorkflowLeadId: normalizeText(baseRow.sellerWorkflowLeadId || localRow.sellerWorkflowLeadId),
      sellerName: normalizeText(baseRow.sellerName || localRow.sellerName),
      sellerSurname: normalizeText(baseRow.sellerSurname || localRow.sellerSurname),
      sellerEmail: normalizeText(baseRow.sellerEmail || localRow.sellerEmail).toLowerCase(),
      sellerPhone: normalizeText(baseRow.sellerPhone || localRow.sellerPhone),
      mandatePacketId: isRemoteRowAuthoritative
        ? normalizeText(remoteRow.mandatePacketId)
        : normalizeText(baseRow.mandatePacketId || localRow.mandatePacketId),
      listingId: isRemoteRowAuthoritative
        ? normalizeText(remoteRow.listingId)
        : normalizeText(baseRow.listingId || localRow.listingId),
      canvassingProspectId: normalizeText(baseRow.canvassingProspectId || localRow.canvassingProspectId),
    })
  }

  return [...mergedById.values()]
}

function mapPrivateListingToLeadFallback(listing = {}) {
  const formData = listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
    ? listing.sellerOnboarding.formData
    : {}
  const leadIdSeed =
    normalizeText(listing?.originatingCrmLeadId) ||
    normalizeText(listing?.sellerLeadId) ||
    normalizeText(listing?.id)
  if (!leadIdSeed) return null

  const leadId = leadIdSeed.startsWith('lead_') ? leadIdSeed : `lead_${leadIdSeed}`
  const onboardingStatus = normalizeText(listing?.sellerOnboarding?.status || listing?.sellerOnboardingStatus)
  const isCompleted = onboardingStatus.toLowerCase() === 'completed'
  const createdAt = listing?.createdAt || new Date().toISOString()
  const updatedAt = listing?.sellerOnboarding?.submittedAt || listing?.updatedAt || createdAt

  return {
    leadId,
    organisationId: normalizeText(listing?.organisationId),
    assignedAgentId: normalizeText(listing?.assignedAgentId),
    assignedAgentName: normalizeText(listing?.assignedAgentName),
    assignedAgentEmail: normalizeText(listing?.assignedAgentEmail),
    contactId: `contact_${leadIdSeed}`,
    leadCategory: 'Seller',
    leadDirection: 'Inbound',
    leadSource: 'Seller Onboarding',
    stage: isCompleted ? 'Onboarding Completed' : onboardingStatus ? 'Onboarding Sent' : 'Lead',
    status: isCompleted ? 'Onboarding Completed' : onboardingStatus ? 'Onboarding Sent' : 'Lead',
    priority: 'Medium',
    budget: Number(formData.askingPrice || listing?.askingPrice || listing?.estimatedValue || 0) || 0,
    areaInterest: normalizeText(formData.suburb || listing?.suburb),
    propertyInterest: normalizeText(listing?.listingTitle || listing?.title || formData.propertyType || listing?.propertyType),
    sellerPropertyAddress: normalizeText(formData.propertyAddress || listing?.propertyAddress || listing?.addressLine1),
    estimatedValue: Number(formData.askingPrice || listing?.askingPrice || listing?.estimatedValue || 0) || 0,
    notes: '',
    sellerOnboardingToken: normalizeText(listing?.sellerOnboarding?.token),
    sellerOnboardingLink: normalizeText(listing?.sellerOnboarding?.link),
    sellerOnboardingStatus: onboardingStatus,
    sellerWorkflowLeadId: normalizeText(listing?.sellerLeadId),
    listingId: normalizeText(listing?.id),
    sellerOnboarding: listing?.sellerOnboarding || null,
    createdAt,
    updatedAt,
  }
}

function mapPrivateListingToContactFallback(listing = {}) {
  const formData = listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
    ? listing.sellerOnboarding.formData
    : {}
  const leadIdSeed =
    normalizeText(listing?.originatingCrmLeadId) ||
    normalizeText(listing?.sellerLeadId) ||
    normalizeText(listing?.id)
  if (!leadIdSeed) return null

  return {
    contactId: `contact_${leadIdSeed}`,
    organisationId: normalizeText(listing?.organisationId),
    assignedAgentId: normalizeText(listing?.assignedAgentId),
    assignedAgentName: normalizeText(listing?.assignedAgentName),
    assignedAgentEmail: normalizeText(listing?.assignedAgentEmail),
    firstName: normalizeText(formData.sellerFirstName || listing?.seller?.name?.split?.(' ')?.[0]),
    lastName: normalizeText(formData.sellerSurname || ''),
    phone: normalizeText(formData.phone || listing?.seller?.phone),
    email: normalizeText(formData.email || listing?.seller?.email).toLowerCase(),
    contactType: 'Lead',
    notes: '',
    createdAt: listing?.createdAt || new Date().toISOString(),
    updatedAt: listing?.sellerOnboarding?.submittedAt || listing?.updatedAt || new Date().toISOString(),
  }
}

function findLeadBySellerOnboardingEvent(leads = [], event = {}) {
  const token = normalizeText(event?.token)
  const leadId = normalizeLeadIdentityKey(event?.leadId || event?.sellerWorkflowLeadId)
  const sellerLeadId = normalizeLeadIdentityKey(event?.sellerLeadId)
  const listingId = normalizeText(event?.listingId || event?.privateListingId)
  const organisationId = normalizeText(event?.organisationId)

  return (
    Array.isArray(leads)
      ? leads.find((row) => {
        const rowOrganisationId = normalizeText(row?.organisationId)
        if (organisationId && rowOrganisationId && rowOrganisationId !== organisationId) {
          return false
        }

        const rowLeadId = normalizeLeadIdentityKey(row?.leadId)
        const rowSellerWorkflowLeadId = normalizeLeadIdentityKey(row?.sellerWorkflowLeadId)
        const rowSellerLeadId = normalizeLeadIdentityKey(row?.sellerLeadId)
        const rowToken = normalizeText(row?.sellerOnboardingToken)
        const rowOnboardingToken = normalizeText(row?.sellerOnboarding?.token)
        const rowListingId = normalizeText(row?.listingId)

        if ((leadId && rowLeadId === leadId) || (sellerLeadId && rowSellerWorkflowLeadId === sellerLeadId) || (rowSellerLeadId && rowSellerLeadId === sellerLeadId)) {
          return true
        }
        if ((token && rowToken === token) || (token && rowOnboardingToken === token)) return true
        return listingId && rowListingId && rowListingId === listingId
      })
      : null
  ) || null
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function getCurrentTimeValue() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function getTomorrowIsoDate() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

function parseTimeToMinutes(value) {
  const normalized = normalizeText(value)
  const match = normalized.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return (hours * 60) + minutes
}

function formatMinutesToTime(value) {
  const safe = Math.max(0, Number(value) || 0)
  const hours = Math.floor((safe % (24 * 60)) / 60)
  const minutes = safe % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function buildDefaultAppointmentFormForType(type, seed = {}) {
  const hasExplicitType = Boolean(normalizeText(type || seed?.appointmentType))
  const template = getAppointmentTypeTemplate(hasExplicitType ? (type || seed?.appointmentType) : 'other')
  const mergedSeed = {
    ...LEAD_DETAIL_DEFAULT_APPOINTMENT,
    ...seed,
    appointmentType: hasExplicitType ? template.type : '',
  }
  const withTemplate = hasExplicitType ? applyAppointmentTemplate(template.type, mergedSeed) : mergedSeed

  const startTime = normalizeText(withTemplate.startTime || withTemplate.start_time || mergedSeed.startTime)
  const defaultDuration = Number(template.defaultDurationMinutes || 45)
  const computedEnd = (() => {
    const startMinutes = parseTimeToMinutes(startTime)
    if (!Number.isFinite(startMinutes)) return normalizeText(withTemplate.endTime || mergedSeed.endTime)
    return formatMinutesToTime(startMinutes + defaultDuration)
  })()

  return {
    ...mergedSeed,
    appointmentType: hasExplicitType ? template.type : '',
    title: normalizeText(withTemplate.title),
    endTime: normalizeText(withTemplate.endTime) || computedEnd,
    visibility: normalizeText(withTemplate.visibility || template.defaultVisibility) || template.defaultVisibility,
    linkedWorkflow: normalizeText(withTemplate.linkedWorkflow || template.linkedWorkflow),
    linkedWorkflowStage: normalizeText(withTemplate.linkedWorkflowStage || template.linkedWorkflowStage),
    completionBehavior: normalizeText(withTemplate.completionBehavior),
    instructions: normalizeText(withTemplate.instructions || getAppointmentTemplateInstructions(template.type, 'buyer')),
    internalInstructions: normalizeText(withTemplate.internalInstructions || template.internalInstructions),
    requiredDocuments: Array.isArray(withTemplate.requiredDocuments) ? withTemplate.requiredDocuments : [],
    reminderRules: Array.isArray(withTemplate.reminderRules) ? withTemplate.reminderRules : [],
    workflowCompletionEffect:
      withTemplate.workflowCompletionEffect && typeof withTemplate.workflowCompletionEffect === 'object'
        ? withTemplate.workflowCompletionEffect
        : {},
  }
}

function toDateOnlyIso(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function getStartOfWeek(anchorDate) {
  const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate())
  const day = start.getDay()
  const diff = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  return start
}

function getWeekDays(anchorDate) {
  const start = getStartOfWeek(anchorDate)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

function getCalendarRangeDays(anchorDate, length = 1) {
  const start = new Date(anchorDate)
  start.setHours(0, 0, 0, 0)
  return Array.from({ length }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

function getMonthGridDays(anchorDate) {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  const gridStart = getStartOfWeek(monthStart)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })
}

function parseAppointmentDate(appointment) {
  const dateValue = appointment?.date || appointment?.appointmentDate || appointment?.appointment_date
  const timeValue = appointment?.startTime || appointment?.start_time || '00:00'
  if (dateValue) {
    const normalizedTime = normalizeText(timeValue)
    const safeTime = /^\d{1,2}:\d{2}(:\d{2})?$/.test(normalizedTime) ? normalizedTime : '00:00'
    const dateCandidate = new Date(`${dateValue}T${safeTime}`)
    if (!Number.isNaN(dateCandidate.getTime())) {
      return dateCandidate
    }
  }
  const dateTimeValue = appointment?.dateTime || appointment?.date_time || appointment?.startsAt || appointment?.starts_at
  const dateTimeCandidate = dateTimeValue ? new Date(dateTimeValue) : null
  if (dateTimeCandidate && !Number.isNaN(dateTimeCandidate.getTime())) {
    return dateTimeCandidate
  }
  return null
}

function formatCalendarPeriodLabel(view, anchorDate) {
  if (view === 'day') {
    return anchorDate.toLocaleDateString('en-ZA', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
  }
  if (view === 'three_day') {
    const days = getCalendarRangeDays(anchorDate, 3)
    const start = days[0]
    const end = days[2]
    return `${start.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })}`
  }
  if (view === 'week') {
    const weekDays = getWeekDays(anchorDate)
    const start = weekDays[0]
    const end = weekDays[6]
    return `${start.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })}`
  }
  return anchorDate.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
}

function formatAppointmentTimeRange(appointment) {
  const start = normalizeText(appointment?.startTime)
  const end = normalizeText(appointment?.endTime)
  if (start && end) return `${start} - ${end}`
  if (start) return start
  const parsed = parseAppointmentDate(appointment)
  if (!parsed) return 'Time pending'
  return parsed.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
}

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

const LEAD_DETAIL_DEFAULT_ACTIVITY = {
  activityType: 'Call',
  activityNote: '',
  outcome: '',
}

const LEAD_DETAIL_DEFAULT_TASK = {
  title: '',
  description: '',
  dueDate: getTodayIsoDate(),
  priority: 'Medium',
}

const LEAD_DETAIL_DEFAULT_APPOINTMENT = {
  appointmentType: '',
  customTypeLabel: '',
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  timezone: 'Africa/Johannesburg',
  allDay: false,
  locationType: 'physical_address',
  location: '',
  meetingUrl: '',
  relatedEntityType: 'lead',
  relatedEntityId: '',
  visibility: 'shared_role_players',
  linkedWorkflow: '',
  linkedWorkflowStage: '',
  completionBehavior: '',
  instructions: '',
  internalInstructions: '',
  requiredDocuments: [],
  reminderRules: [],
  workflowCompletionEffect: {},
  status: 'requested',
  listingId: '',
  transactionId: '',
  contactId: '',
  resourceId: '',
  allowOutsideBusinessHours: false,
  schedulingOverrideReason: '',
  notes: '',
  recipientEmail: '',
  sendInviteEmails: true,
  attachCalendarInvite: true,
  notifyCreatorOnRsvp: true,
  participants: [],
  participantDraft: {
    name: '',
    email: '',
    phone: '',
    participantRole: 'Buyer',
    isRequired: true,
    rsvpStatus: 'Pending',
  },
}

const APPOINTMENT_TYPE_OPTIONS = getAppointmentTypeOptions()

const MANUAL_LEAD_SOURCE_OPTIONS = [
  'Property24',
  'Private Property',
  'Website',
  'Referral',
  'Walk-In',
  'WhatsApp',
  'Facebook',
  'Google',
  'Cold Call',
  'Door Knock',
  'Manual Entry',
  'Other',
]

const NEW_LEAD_DEFAULTS = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  leadCategory: 'Buyer',
  leadDirection: 'Inbound',
  leadSource: MANUAL_LEAD_SOURCE_OPTIONS[0],
  stage: 'Lead',
  priority: 'Medium',
  linkedListing: '',
  budget: '',
  propertyArea: '',
  propertyType: '',
  estimatedValue: '',
  areaInterest: '',
  propertyInterest: '',
  sellerPropertyAddress: '',
  notes: '',
  nextFollowUpDate: '',
  nextFollowUpNote: '',
}

const DEFAULT_LEAD_FILTER = {
  search: '',
  source: 'all',
  stage: 'all',
  agent: 'all',
  sort: 'newest',
}

function resolveLeadCategoryView(value = '') {
  return normalizeText(value).toLowerCase() === 'seller' ? 'seller' : 'buyer'
}

function leadCategoryLabelForView(value = '') {
  return resolveLeadCategoryView(value) === 'seller' ? 'Seller' : 'Buyer'
}

const LEAD_DETAIL_DEFAULTS = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  leadSource: MANUAL_LEAD_SOURCE_OPTIONS[0],
  leadDirection: 'Inbound',
  priority: 'Medium',
  budget: '',
  estimatedValue: '',
  areaInterest: '',
  propertyInterest: '',
  sellerPropertyAddress: '',
  notes: '',
}

function AgencyPipelinePage({ initialViewMode = 'pipeline' } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { leadId: routeLeadIdParam = '' } = useParams()
  const routeLeadId = normalizeText(routeLeadIdParam)
  const isLeadWorkspaceRoute = !initialViewMode || (initialViewMode !== 'calendar' && routeLeadId.length > 0)
  const { role, profile } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [organisationId, setOrganisationId] = useState('')
  const [organisationName, setOrganisationName] = useState('')
  const [users, setUsers] = useState([])
  const [records, setRecords] = useState({
    contacts: [],
    leads: [],
    leadActivities: [],
    tasks: [],
    appointments: [],
    deals: [],
  })
  const [canvassingStore, setCanvassingStore] = useState({ prospects: [], activities: [] })
  const reloadRequestRef = useRef(0)
  const reloadTimerRef = useRef(null)
  const isCalendarMode = initialViewMode === 'calendar'
  const isOverviewMode = initialViewMode === 'overview'
  const [leadTypeView, setLeadTypeView] = useState('buyer')
  const [pipelineViewMode, setPipelineViewMode] = useState('table')
  const [draggingPipelineCardId, setDraggingPipelineCardId] = useState('')
  const draggingPipelineCardRef = useRef('')
  const [leadWorkspaceTab, setLeadWorkspaceTab] = useState('overview')
  const [leadFilter, setLeadFilter] = useState(DEFAULT_LEAD_FILTER)
  const [leadTablePage, setLeadTablePage] = useState(1)
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [leadForm, setLeadForm] = useState(NEW_LEAD_DEFAULTS)
  const [isLeadCreating, setIsLeadCreating] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [leadArchiveModal, setLeadArchiveModal] = useState({
    open: false,
    leadId: '',
    reason: LEAD_LOST_REASON_OPTIONS[0],
    notes: '',
  })
  const [leadDeleteModal, setLeadDeleteModal] = useState({
    open: false,
    leadId: '',
    confirmText: '',
    error: '',
  })
  const [leadDetailForm, setLeadDetailForm] = useState(LEAD_DETAIL_DEFAULTS)
  const [isLeadDetailSaving, setIsLeadDetailSaving] = useState(false)
  const [activityForm, setActivityForm] = useState(LEAD_DETAIL_DEFAULT_ACTIVITY)
  const [editingActivityId, setEditingActivityId] = useState('')
  const [taskForm, setTaskForm] = useState(LEAD_DETAIL_DEFAULT_TASK)
  const [editingTaskId, setEditingTaskId] = useState('')
  const [appointmentForm, setAppointmentForm] = useState(() => buildDefaultAppointmentFormForType('', LEAD_DETAIL_DEFAULT_APPOINTMENT))
  const [calendarView, setCalendarView] = useState('week')
  const [calendarCursorDate, setCalendarCursorDate] = useState(() => new Date())
  const [calendarAgentFilter, setCalendarAgentFilter] = useState('all')
  const principalView = isOverviewMode ? 'reporting' : 'operational'
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false)
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('')
  const [appointmentOutcomeForm, setAppointmentOutcomeForm] = useState({
    outcomeSummary: '',
    clientFeedback: '',
    agentNotes: '',
    nextStep: '',
    followUpDate: '',
  })
  const [appointmentResources, setAppointmentResources] = useState([])
  const [appointmentListingOptions, setAppointmentListingOptions] = useState([])
  const [appointmentSchedulingIntegrity, setAppointmentSchedulingIntegrity] = useState(null)
  const [appointmentSchedulingLoading, setAppointmentSchedulingLoading] = useState(false)
  const [appointmentSchedulingError, setAppointmentSchedulingError] = useState('')
  const [isSellerOnboardingSending, setIsSellerOnboardingSending] = useState(false)
  const [isMandateGenerating, setIsMandateGenerating] = useState(false)
  const [isMandateSending, setIsMandateSending] = useState(false)

  const routeLeadRecord = useMemo(() => {
    if (!routeLeadId) return null
    const routeLeadKey = normalizeLeadIdentityKey(routeLeadId)
    return records.leads.find((lead) => normalizeLeadIdentityKey(lead?.leadId) === routeLeadKey) || null
  }, [records.leads, routeLeadId])
  const [legalWorkspaceOpen, setLegalWorkspaceOpen] = useState(false)
  const [legalWorkspaceMode] = useState('view')
  const [mandatePacketStatus, setMandatePacketStatus] = useState(() => ({
    packetType: 'mandate',
    state: 'NO_PACKET',
    packet: null,
    versions: [],
    signingSummary: null,
    warnings: [],
    actionHint: 'No packet record was found for this context.',
  }))

  const currentAgent = useMemo(
    () => ({
      id: normalizeText(profile?.id || profile?.email),
      email: normalizeText(profile?.email).toLowerCase(),
      fullName: normalizeText(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')) || 'Current Agent',
    }),
    [profile?.email, profile?.firstName, profile?.fullName, profile?.id, profile?.lastName],
  )

  const isPrincipal = useMemo(
    () =>
      canAccessPrincipalExperience({
        appRole: role,
        membershipRole: normalizeOrganisationMembershipRole(membershipRole),
      }),
    [membershipRole, role],
  )

  const agentOptions = useMemo(() => {
    const rows = Array.isArray(users) ? users : []
    const normalized = rows
      .map((row) => ({
        id: normalizeText(row?.userId || row?.email),
        name: normalizeText(row?.fullName || `${row?.firstName || ''} ${row?.lastName || ''}`) || normalizeText(row?.email) || 'Agent',
        email: normalizeText(row?.email).toLowerCase(),
      }))
      .filter((row) => row.id)

    const hasCurrent = normalized.some(
      (row) => normalizeKey(row.id) === normalizeKey(currentAgent.id) || normalizeKey(row.email) === normalizeKey(currentAgent.email),
    )
    if (!hasCurrent) {
      normalized.push({
        id: currentAgent.id,
        name: currentAgent.fullName,
        email: currentAgent.email,
      })
    }

    return normalized
  }, [currentAgent.email, currentAgent.fullName, currentAgent.id, users])

  const resolveAgentById = useCallback(
    (id) => {
      const key = normalizeKey(id)
      const found = agentOptions.find(
        (item) => normalizeKey(item.id) === key || (key && normalizeKey(item.email) === key),
      )
      if (found) return found
      return {
        id: currentAgent.id,
        name: currentAgent.fullName,
        email: currentAgent.email,
      }
    },
    [agentOptions, currentAgent.email, currentAgent.fullName, currentAgent.id],
  )

  useEffect(() => {
    if (!isPrincipal) {
      setCalendarAgentFilter(normalizeText(currentAgent.id || currentAgent.email))
      return
    }
    setCalendarAgentFilter((previous) => {
      const normalizedPrevious = normalizeText(previous)
      if (!normalizedPrevious || normalizedPrevious === normalizeText(currentAgent.id || currentAgent.email)) return 'all'
      if (normalizedPrevious === 'all') return previous
      const stillAvailable = agentOptions.some(
        (agent) => normalizeKey(agent.id) === normalizeKey(normalizedPrevious) || normalizeKey(agent.email) === normalizeKey(normalizedPrevious),
      )
      return stillAvailable ? previous : 'all'
    })
  }, [agentOptions, currentAgent.email, currentAgent.id, isPrincipal])

  const buildAppointmentDraftForIntegrity = useCallback(() => {
    const selectedAppointmentForDraft = selectedAppointmentId
      ? (records.appointments.find(
          (appointment) => normalizeText(appointment?.appointmentId) === normalizeText(selectedAppointmentId),
        ) || null)
      : null

    const selectedLeadForDraft = (() => {
      if (selectedLeadId) {
        const byLeadId = records.leads.find((lead) => normalizeLeadIdentityKey(lead?.leadId) === normalizeLeadIdentityKey(selectedLeadId))
        if (byLeadId) return byLeadId
      }
      const linkedLeadId = normalizeText(selectedAppointmentForDraft?.leadId)
      if (linkedLeadId) {
        return records.leads.find((lead) => normalizeLeadIdentityKey(lead?.leadId) === normalizeLeadIdentityKey(linkedLeadId)) || null
      }
      return null
    })()

    const linkedLead = selectedLeadForDraft || null
    const assignedAgent = resolveAgentById(
      normalizeText(
        selectedAppointmentForDraft?.assignedAgentId ||
        selectedAppointmentForDraft?.assignedAgentEmail ||
        linkedLead?.assignedAgentId ||
        linkedLead?.assignedAgentEmail ||
        currentAgent.id,
      ),
    )
    const draft = {
      appointmentId: selectedAppointmentId || null,
      title: normalizeText(appointmentForm.title) || getAppointmentTypeLabel(appointmentForm.appointmentType),
      appointmentType: appointmentForm.appointmentType,
      date: appointmentForm.date,
      startTime: appointmentForm.startTime,
      endTime: appointmentForm.endTime,
      location: appointmentForm.location,
      status: appointmentForm.status,
      leadId: normalizeText(linkedLead?.leadId || selectedAppointmentForDraft?.leadId) || null,
      contactId: normalizeText(appointmentForm.contactId || linkedLead?.contactId || selectedAppointmentForDraft?.contactId) || null,
      listingId: normalizeText(appointmentForm.listingId || selectedAppointmentForDraft?.listingId) || null,
      transactionId: normalizeText(appointmentForm.transactionId || selectedAppointmentForDraft?.transactionId) || null,
      resourceId: normalizeText(appointmentForm.resourceId) || null,
      allowOutsideBusinessHours: isPrincipal && appointmentForm.allowOutsideBusinessHours === true,
      schedulingOverrideReason: normalizeText(appointmentForm.schedulingOverrideReason) || null,
      notes: appointmentForm.notes,
      participants: appointmentForm.participants,
      assignedAgent,
      visibility: normalizeText(appointmentForm.visibility) || undefined,
      linkedWorkflow: normalizeText(appointmentForm.linkedWorkflow) || undefined,
      linkedWorkflowStage: normalizeText(appointmentForm.linkedWorkflowStage) || undefined,
      completionBehavior: normalizeText(appointmentForm.completionBehavior) || undefined,
      instructions: normalizeText(appointmentForm.instructions) || undefined,
      requiredDocuments: Array.isArray(appointmentForm.requiredDocuments) ? appointmentForm.requiredDocuments : undefined,
      workflowCompletionEffect: appointmentForm.workflowCompletionEffect && typeof appointmentForm.workflowCompletionEffect === 'object'
        ? appointmentForm.workflowCompletionEffect
        : undefined,
    }
    return applyAppointmentTemplate(draft.appointmentType, draft)
  }, [
    appointmentForm,
    currentAgent.id,
    records.appointments,
    records.leads,
    resolveAgentById,
    selectedAppointmentId,
    selectedLeadId,
    isPrincipal,
  ])

  const reloadRecords = useCallback(
    async (orgId) => {
      if (reloadTimerRef.current && typeof window !== 'undefined') {
        window.clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }
      const requestId = reloadRequestRef.current + 1
      reloadRequestRef.current = requestId
      const snapshot = getAgencyPipelineSnapshot(orgId)
      let mergedSnapshot = snapshot
      let listingOptionsForAppointments = dedupeListingOptions([
        ...buildListingOptionsFromLeads(Array.isArray(snapshot?.leads) ? snapshot.leads : []),
        ...readAgentPrivateListings().map((listing) => normalizeAppointmentListingOption(listing)).filter(Boolean),
      ])
      const applySnapshotRecords = (sourceSnapshot, appointmentRows = sourceSnapshot?.appointments || []) => {
        const sourceContacts = Array.isArray(sourceSnapshot?.contacts) ? sourceSnapshot.contacts : []
        const sourceLeads = Array.isArray(sourceSnapshot?.leads) ? sourceSnapshot.leads : []
        const sourceTasks = Array.isArray(sourceSnapshot?.tasks) ? sourceSnapshot.tasks : []
        const sourceActivities = Array.isArray(sourceSnapshot?.leadActivities) ? sourceSnapshot.leadActivities : []
        const sourceDeals = Array.isArray(sourceSnapshot?.deals) ? sourceSnapshot.deals : []
        const sourceAppointments = Array.isArray(appointmentRows)
          ? appointmentRows
          : (Array.isArray(sourceSnapshot?.appointments) ? sourceSnapshot.appointments : [])
        const scopedLeads = sourceLeads
        const scopedLeadIds = new Set(
          scopedLeads
            .flatMap((lead) => [lead?.leadId, lead?.id])
            .map((value) => normalizeLeadIdentityKey(value))
            .filter(Boolean),
        )
        const scopedTasks = sourceTasks.filter((task) => scopedLeadIds.has(normalizeLeadIdentityKey(task?.leadId)))
        const scopedAppointments = sourceAppointments.filter((row) => {
          const appointmentOrganisationId = normalizeText(row?.organisationId || row?.organisation_id)
          return !appointmentOrganisationId || !normalizeText(orgId) || appointmentOrganisationId === normalizeText(orgId)
        })
        const scopedActivities = sourceActivities.filter((row) => scopedLeadIds.has(normalizeLeadIdentityKey(row?.leadId)))
        const scopedDeals = sourceDeals.filter((row) => scopedLeadIds.has(normalizeLeadIdentityKey(row?.leadId)))

        setRecords({
          contacts: sourceContacts,
          leads: scopedLeads,
          leadActivities: scopedActivities,
          tasks: scopedTasks,
          appointments: scopedAppointments,
          deals: scopedDeals,
        })
      }

      if (requestId === reloadRequestRef.current) {
        applySnapshotRecords(snapshot)
      }
      if (isSupabaseConfigured && supabase && isUuidLike(orgId)) {
        try {
          const crmSnapshot = await withPipelineTimeout(
            listAgencyCrmLeadContacts(orgId),
            'Lead data is taking too long to load.',
            PIPELINE_RECORDS_TIMEOUT_MS,
          )

          let privateListingFallbackContacts = []
          let privateListingFallbackLeads = []
          try {
            const privateListings = await withPipelineTimeout(
              getOrganisationPrivateListings(orgId, { includeRequirementsAndDocuments: false }),
              'Private listing data is taking too long to load.',
              PIPELINE_RECORDS_TIMEOUT_MS,
            )
            listingOptionsForAppointments = dedupeListingOptions([
              ...listingOptionsForAppointments,
              ...(Array.isArray(privateListings) ? privateListings : []).map((listing) => normalizeAppointmentListingOption(listing)).filter(Boolean),
            ])
            privateListingFallbackLeads = (Array.isArray(privateListings) ? privateListings : [])
              .map((listing) => mapPrivateListingToLeadFallback(listing))
              .filter(Boolean)
            privateListingFallbackContacts = (Array.isArray(privateListings) ? privateListings : [])
              .map((listing) => mapPrivateListingToContactFallback(listing))
              .filter(Boolean)
          } catch (listingLoadError) {
            console.warn('[PIPELINE] private listing fallback load failed; continuing with CRM leads only.', listingLoadError)
          }

          const mergedContactsForFiltering = dedupeByKey(
            [...(crmSnapshot.contacts || []), ...privateListingFallbackContacts],
            (row) => row?.contactId,
          )

          const filteredLocalLeads = filterDeletedAgencyLeadRows(
            orgId,
            crmSnapshot.leads || [],
            mergedContactsForFiltering,
          )
          const filteredSupabaseLeads = filterDeletedAgencyLeadRows(
            orgId,
            [...privateListingFallbackLeads],
            mergedContactsForFiltering,
          )

          mergedSnapshot = {
            ...crmSnapshot,
            contacts: mergedContactsForFiltering,
            leads: mergeLeadRowsForReload(filteredLocalLeads, filteredSupabaseLeads),
            leadActivities: Array.isArray(crmSnapshot.leadActivities) ? crmSnapshot.leadActivities : [],
            tasks: Array.isArray(crmSnapshot.tasks) ? crmSnapshot.tasks : [],
          }
        } catch (dbLoadError) {
          console.warn('[PIPELINE] supabase lead/contact load failed; using local snapshot only.', dbLoadError)
        }
      }
      let appointmentRows = []
      try {
        appointmentRows = await withPipelineTimeout(
          listAppointmentsAsync(orgId, {
            includeAll: isPrincipal,
            agentId: isPrincipal ? '' : currentAgent.id,
            agentEmail: isPrincipal ? '' : currentAgent.email,
            agentKeys: isPrincipal ? [] : [currentAgent.id, currentAgent.email],
          }),
          'Appointment data is taking too long to load.',
          PIPELINE_APPOINTMENT_RECORDS_TIMEOUT_MS,
        )
      } catch (appointmentLoadError) {
        console.warn('[PIPELINE] appointment load failed; continuing without appointment rows.', appointmentLoadError)
      }
      appointmentRows = mergeCalendarAppointmentRows(
        appointmentRows,
        buildLocalCalendarAppointments({ organisationId: orgId, currentAgent, includeAll: isPrincipal }),
      )

      if (requestId !== reloadRequestRef.current) return
      setAppointmentListingOptions(dedupeListingOptions([
        ...listingOptionsForAppointments,
        ...buildListingOptionsFromLeads(mergedSnapshot.leads),
      ]))
      applySnapshotRecords(mergedSnapshot, appointmentRows)
    },
    [currentAgent, isPrincipal],
  )

  const scheduleRecordsReload = useCallback(
    (orgId, delayMs = 180) => {
      if (!orgId || typeof window === 'undefined') return
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current)
      }
      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null
        void reloadRecords(orgId)
      }, delayMs)
    },
    [reloadRecords],
  )

  const reloadCanvassingStore = useCallback((orgId = organisationId) => {
    if (!orgId) {
      setCanvassingStore({ prospects: [], activities: [] })
      return
    }
    setCanvassingStore(readCanvassingStore(orgId))
  }, [organisationId])

  useEffect(() => {
    reloadCanvassingStore(organisationId)
  }, [organisationId, reloadCanvassingStore])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleCanvassingRefresh = (event) => {
      const eventOrgId = normalizeText(event?.detail?.organisationId)
      if (eventOrgId && organisationId && eventOrgId !== organisationId) return
      reloadCanvassingStore(organisationId)
    }
    const handleStorage = (event) => {
      if (event?.key && event.key !== getCanvassingStorageKey(organisationId)) return
      reloadCanvassingStore(organisationId)
    }
    window.addEventListener(CANVASSING_UPDATED_EVENT, handleCanvassingRefresh)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(CANVASSING_UPDATED_EVENT, handleCanvassingRefresh)
      window.removeEventListener('storage', handleStorage)
    }
  }, [organisationId, reloadCanvassingStore])

  useEffect(() => {
    return () => {
      if (reloadTimerRef.current && typeof window !== 'undefined') {
        window.clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }
    }
  }, [])

  const loadContext = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [contextResult, usersResult] = await Promise.allSettled([
        withPipelineTimeout(fetchOrganisationSettings(), 'Organisation context is taking too long to load.'),
        withPipelineTimeout(listOrganisationUsers(), 'Team directory is taking too long to load.'),
      ])
      const contextError = contextResult.status === 'rejected' ? contextResult.reason : null
      const usersError = usersResult.status === 'rejected' ? usersResult.reason : null
      const contextDenied = isPermissionDeniedError(contextError)
      const usersDenied = isPermissionDeniedError(usersError)

      if (contextError && !contextDenied) {
        console.warn('[PIPELINE] organisation context load failed; using fallback workspace context.', contextError)
      }
      if (usersError && !usersDenied) {
        console.warn('[PIPELINE] team directory load failed; using current user fallback.', usersError)
      }

      const context = contextResult.status === 'fulfilled' ? contextResult.value : null
      const organisationUsers = usersResult.status === 'fulfilled' ? usersResult.value : []
      const rawOrganisationId = normalizeText(context?.organisation?.id)
      const resolvedOrgId = isUuidLike(rawOrganisationId) ? rawOrganisationId : ''
      const storageOrgId = resolvedOrgId || 'default'
      const fallbackMembershipRole = role === 'agent' ? 'agent' : 'viewer'
      const resolvedMembershipRole = normalizeText(context?.membershipRole || fallbackMembershipRole) || fallbackMembershipRole

      setOrganisationId(resolvedOrgId)
      setOrganisationName(normalizeText(context?.organisation?.display_name || context?.organisation?.displayName || context?.organisation?.name))
      setMembershipRole(resolvedMembershipRole)
      if (resolvedOrgId) {
        const recovery = recoverAgencyPipelineStoreForOrganisation(resolvedOrgId)
        if (recovery?.migrated) {
          console.warn('[PIPELINE] recovered scoped CRM store', recovery)
          setMessage(`Recovered ${recovery.leads || 0} lead(s) from legacy workspace scope.`)
        }
      }
      setUsers(Array.isArray(organisationUsers) && organisationUsers.length ? organisationUsers : [{
        id: currentAgent.id,
        userId: currentAgent.id,
        firstName: normalizeText(profile?.firstName),
        lastName: normalizeText(profile?.lastName),
        fullName: currentAgent.fullName,
        email: currentAgent.email,
        role: resolvedMembershipRole,
        status: 'active',
      }])
      setSelectedAgentId((previous) => previous || normalizeText(currentAgent.id || currentAgent.email))
      if (isCalendarMode) {
        await reloadRecords(storageOrgId)
      } else {
        void reloadRecords(storageOrgId)
      }
      if (!resolvedOrgId && !contextError) {
        setError('Organisation membership is not active for this account yet. Add/accept your organisation membership, then refresh.')
      }
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load agency pipeline data.')
    } finally {
      setLoading(false)
    }
  }, [currentAgent.email, currentAgent.fullName, currentAgent.id, isCalendarMode, profile?.firstName, profile?.lastName, reloadRecords, role])

  useEffect(() => {
    void loadContext()
  }, [loadContext])

  useEffect(() => {
    if (!organisationId) return
    const eventName = getAgencyCrmUpdatedEventName()
    const handler = () => {
      scheduleRecordsReload(organisationId)
    }
    window.addEventListener(eventName, handler)
    window.addEventListener('itg:quick-create-updated', handler)
    window.addEventListener('itg:viewings-updated', handler)
    return () => {
      window.removeEventListener(eventName, handler)
      window.removeEventListener('itg:quick-create-updated', handler)
      window.removeEventListener('itg:viewings-updated', handler)
    }
  }, [organisationId, scheduleRecordsReload])

  useEffect(() => {
    if (!organisationId || !isCalendarMode || typeof window === 'undefined') return undefined

    const refreshCalendarAppointments = () => {
      scheduleRecordsReload(organisationId, 0)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshCalendarAppointments()
      }
    }

    window.addEventListener('focus', refreshCalendarAppointments)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const intervalId = window.setInterval(refreshCalendarAppointments, 45000)

    return () => {
      window.removeEventListener('focus', refreshCalendarAppointments)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(intervalId)
    }
  }, [isCalendarMode, organisationId, scheduleRecordsReload])

  useEffect(() => {
    if (!organisationId) return
    const handler = (event) => {
      const eventDetail = event?.detail || {}
      const lead = findLeadBySellerOnboardingEvent(records.leads, eventDetail)
      if (!lead?.leadId) {
        scheduleRecordsReload(organisationId)
        return
      }
      const submittedToken = normalizeText(eventDetail?.token || lead?.sellerOnboardingToken)
      const submittedAt = normalizeText(eventDetail?.submittedAt) || new Date().toISOString()
      const onboardingStatus = normalizeText(eventDetail?.sellerOnboardingStatus)
      const resolvedOnboardingStatus = onboardingStatus ? onboardingStatus.toLowerCase() : 'completed'

      void updateAgencyCrmLeadRecord(organisationId, lead.leadId, {
        stage: 'Onboarding Completed',
        status: 'Onboarding Completed',
        sellerOnboardingStatus: resolvedOnboardingStatus.includes('complete') ? 'completed' : resolvedOnboardingStatus || 'completed',
        sellerOnboardingToken: submittedToken,
        listingId: normalizeText(eventDetail?.listingId || eventDetail?.privateListingId || lead.listingId),
        sellerWorkflowLeadId: normalizeLeadIdentityKey(eventDetail?.sellerLeadId || lead.sellerWorkflowLeadId || lead.sellerLeadId),
        sellerOnboarding: {
          ...(lead?.sellerOnboarding || {}),
          status: resolvedOnboardingStatus.includes('complete') ? 'completed' : resolvedOnboardingStatus || 'completed',
          token: submittedToken || lead?.sellerOnboarding?.token || null,
          submittedAt,
        },
      }).catch((syncError) => {
        console.warn('[PIPELINE] non-blocking seller onboarding submission sync failed', syncError)
      })
      void createAgencyCrmLeadActivity(organisationId, lead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Seller Onboarding Submitted',
        activityNote: 'Seller onboarding was completed.',
        outcome: 'Onboarding completed',
      }, { actor: currentAgent }).catch((syncError) => {
        console.warn('[PIPELINE] non-blocking seller onboarding activity sync failed', syncError)
      })
      setMessage('Seller onboarding submitted. Lead moved to onboarding completed.')
      scheduleRecordsReload(organisationId)
    }

    window.addEventListener('itg:seller-onboarding-submitted', handler)
    return () => {
      window.removeEventListener('itg:seller-onboarding-submitted', handler)
    }
  }, [currentAgent, currentAgent.email, currentAgent.fullName, currentAgent.id, organisationId, records.leads, scheduleRecordsReload])

  useEffect(() => {
    if (!organisationId) return
    const handler = (event) => {
      const eventDetail = event?.detail || {}
      const lead = findLeadBySellerOnboardingEvent(records.leads, eventDetail)
      if (!lead?.leadId) return

      const token = normalizeText(eventDetail?.token || lead?.sellerOnboardingToken)
      if (!token) {
        scheduleRecordsReload(organisationId)
        return
      }

      void updateAgencyCrmLeadRecord(organisationId, lead.leadId, {
        stage: 'Mandate Signed',
        status: 'Mandate Signed',
        sellerOnboardingToken: token,
        mandatePacketId: normalizeText(lead?.mandatePacketId || eventDetail?.mandatePacketId || lead?.mandatePacketId),
        listingId: normalizeText(eventDetail?.listingId || eventDetail?.privateListingId || lead.listingId),
        sellerWorkflowLeadId: normalizeLeadIdentityKey(eventDetail?.sellerLeadId || lead.sellerWorkflowLeadId || lead.sellerLeadId),
        sellerOnboarding: {
          ...(lead?.sellerOnboarding || {}),
          token: token || lead?.sellerOnboarding?.token || null,
          signedAt: normalizeText(eventDetail?.signedAt || eventDetail?.submittedAt) || new Date().toISOString(),
          status: 'signed',
        },
      }).catch((syncError) => {
        console.warn('[PIPELINE] non-blocking mandate signed sync failed', syncError)
      })
      void createAgencyCrmLeadActivity(organisationId, lead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Mandate Signed',
        activityNote: 'mandate_signed',
        outcome: event?.detail?.listingActivated ? 'Listing activated' : 'Signed',
      }, { actor: currentAgent }).catch((syncError) => {
        console.warn('[PIPELINE] non-blocking mandate signed activity sync failed', syncError)
      })
      setMessage(
        event?.detail?.listingActivated
          ? 'Mandate signed. Listing is now ready for active workflow.'
          : 'Mandate signed.',
      )
      scheduleRecordsReload(organisationId)
    }

    window.addEventListener('itg:seller-mandate-signed', handler)
    return () => {
      window.removeEventListener('itg:seller-mandate-signed', handler)
    }
  }, [currentAgent, currentAgent.email, currentAgent.fullName, currentAgent.id, organisationId, records.leads, scheduleRecordsReload])

  useEffect(() => {
    if (isCalendarMode) return
    setLeadForm((previous) => ({
      ...previous,
      leadCategory: leadTypeView === 'seller' ? 'Seller' : 'Buyer',
    }))
  }, [isCalendarMode, leadTypeView])

  useEffect(() => {
    setLeadFilter((previous) => ({
      ...previous,
      source: 'all',
      stage: 'all',
    }))
  }, [leadTypeView])

  useEffect(() => {
    if (!routeLeadId) return
    setSelectedLeadId(routeLeadId)
    setLeadWorkspaceTab('overview')
  }, [routeLeadId])

  useEffect(() => {
    if (!routeLeadId || !records.leads.length) return
    const routeKey = normalizeLeadIdentityKey(routeLeadId)
    const routeLead = records.leads.find((row) => normalizeLeadIdentityKey(row?.leadId) === routeKey)
    if (!routeLead) return
    const category = resolveLeadCategoryView(routeLead?.leadCategory)
    if (leadTypeView !== category) {
      setLeadTypeView(category)
    }
  }, [leadTypeView, records.leads, routeLeadId])

  useEffect(() => {
    if (!isLeadWorkspaceRoute || !routeLeadId || routeLeadRecord || !organisationId || !isSupabaseConfigured) return
    let attempt = 0
    let retryTimer = null
    const refreshLeadWorkspace = () => {
      if (attempt >= LEAD_WORKSPACE_MAX_RETRIES) return
      attempt += 1
      void reloadRecords(organisationId)
      if (attempt >= LEAD_WORKSPACE_MAX_RETRIES) return
      if (typeof window !== 'undefined') {
        retryTimer = window.setTimeout(refreshLeadWorkspace, LEAD_WORKSPACE_RETRY_MS)
      }
    }
    refreshLeadWorkspace()
    return () => {
      if (retryTimer && typeof window !== 'undefined') {
        window.clearTimeout(retryTimer)
      }
    }
  }, [
    isLeadWorkspaceRoute,
    organisationId,
    reloadRecords,
    routeLeadId,
    routeLeadRecord,
  ])

  useEffect(() => {
    if (isLeadWorkspaceRoute) {
      if (routeLeadId) return
      if (selectedLeadId && records.leads.length && !records.leads.some((row) => normalizeLeadIdentityKey(row?.leadId) === normalizeLeadIdentityKey(selectedLeadId))) {
        setSelectedLeadId('')
      }
      return
    }
    if (!selectedLeadId && records.leads.length) {
      setSelectedLeadId(records.leads[0].leadId)
    }
    if (selectedLeadId && !records.leads.some((row) => normalizeLeadIdentityKey(row?.leadId) === normalizeLeadIdentityKey(selectedLeadId))) {
      setSelectedLeadId(records.leads[0]?.leadId || '')
    }
  }, [isLeadWorkspaceRoute, records.leads, routeLeadId, selectedLeadId])

  useEffect(() => {
    if (!selectedAppointmentId) return
    if (!records.appointments.some((appointment) => normalizeText(appointment?.appointmentId) === normalizeText(selectedAppointmentId))) {
      setSelectedAppointmentId('')
    }
  }, [records.appointments, selectedAppointmentId])

  const leadSourceOptions = MANUAL_LEAD_SOURCE_OPTIONS

  const filteredLeads = useMemo(() => {
    const categoryValue = leadTypeView === 'seller' ? 'seller' : 'buyer'
    const visibleRows = records.leads.filter((lead) => {
      const canvassingProspect = (Array.isArray(canvassingStore.prospects) ? canvassingStore.prospects : [])
        .find((prospect) => normalizeText(prospect?.id) === normalizeText(lead?.canvassingProspectId))
      const contact =
        records.contacts.find((row) => normalizeText(row?.contactId) === normalizeText(lead?.contactId)) ||
        buildLeadContactFallback(lead) ||
        buildCanvassingProspectContactFallback(canvassingProspect)
      const categoryMatch = resolveLeadCategoryView(lead?.leadCategory) === categoryValue
      const searchMatch = leadFilter.search
        ? [
            contact?.firstName,
            contact?.lastName,
            contact?.phone,
            contact?.email,
            lead?.leadSource,
            lead?.leadCategory,
            lead?.assignedAgentName,
            lead?.assignedAgentEmail,
            lead?.areaInterest,
            lead?.propertyInterest,
            lead?.sellerPropertyAddress,
          ]
            .join(' ')
            .toLowerCase()
            .includes(leadFilter.search.toLowerCase())
        : true
      const sourceMatch = leadFilter.source === 'all' ? true : normalizeText(lead?.leadSource) === leadFilter.source
      const stageMatch = leadFilter.stage === 'all'
        ? true
        : normalizeText(lead?.stage) === leadFilter.stage ||
          normalizeLeadKanbanStage(lead?.stage || lead?.status) === normalizeKey(leadFilter.stage)
      const agentMatch =
        leadFilter.agent === 'all'
          ? true
          : normalizeKey(lead?.assignedAgentId) === normalizeKey(leadFilter.agent) ||
            normalizeKey(lead?.assignedAgentEmail) === normalizeKey(leadFilter.agent)

      return categoryMatch && searchMatch && sourceMatch && stageMatch && agentMatch
    })

    return visibleRows.sort((left, right) => {
      if (leadFilter.sort === 'stage') {
        return normalizeLeadKanbanStage(left?.stage || left?.status).localeCompare(normalizeLeadKanbanStage(right?.stage || right?.status))
      }

      if (leadFilter.sort === 'next_follow_up') {
        const leftTask = records.tasks
          .filter((task) => normalizeText(task?.leadId) === normalizeText(left?.leadId) && normalizeText(task?.status) !== 'Completed')
          .sort((a, b) => new Date(a?.dueDate || a?.createdAt || 0) - new Date(b?.dueDate || b?.createdAt || 0))[0]
        const rightTask = records.tasks
          .filter((task) => normalizeText(task?.leadId) === normalizeText(right?.leadId) && normalizeText(task?.status) !== 'Completed')
          .sort((a, b) => new Date(a?.dueDate || a?.createdAt || 0) - new Date(b?.dueDate || b?.createdAt || 0))[0]
        const leftDate = new Date(leftTask?.dueDate || leftTask?.createdAt || 8640000000000000).getTime()
        const rightDate = new Date(rightTask?.dueDate || rightTask?.createdAt || 8640000000000000).getTime()
        return leftDate - rightDate
      }

      const leftTime = new Date(left?.createdAt || 0).getTime()
      const rightTime = new Date(right?.createdAt || 0).getTime()
      return rightTime - leftTime
    })
  }, [canvassingStore.prospects, leadFilter.agent, leadFilter.search, leadFilter.source, leadFilter.sort, leadFilter.stage, leadTypeView, records.contacts, records.leads, records.tasks])

  useEffect(() => {
    setLeadTablePage(1)
  }, [leadFilter.agent, leadFilter.search, leadFilter.source, leadFilter.sort, leadFilter.stage, leadTypeView])

  const leadTableTotalPages = Math.max(1, Math.ceil(filteredLeads.length / LEAD_TABLE_PAGE_SIZE))
  const leadTableCurrentPage = Math.min(leadTablePage, leadTableTotalPages)
  const leadTableRows = useMemo(() => {
    const startIndex = (leadTableCurrentPage - 1) * LEAD_TABLE_PAGE_SIZE
    return filteredLeads.slice(startIndex, startIndex + LEAD_TABLE_PAGE_SIZE)
  }, [filteredLeads, leadTableCurrentPage])
  const leadTableStart = filteredLeads.length ? (leadTableCurrentPage - 1) * LEAD_TABLE_PAGE_SIZE + 1 : 0
  const leadTableEnd = Math.min(filteredLeads.length, leadTableCurrentPage * LEAD_TABLE_PAGE_SIZE)

  const availableLeadSources = useMemo(() => {
    const targetCategory = leadTypeView === 'seller' ? 'seller' : 'buyer'
    return Array.from(
      new Set(
        records.leads
          .filter((lead) => normalizeText(lead?.leadCategory).toLowerCase() === targetCategory)
          .map((lead) => normalizeText(lead?.leadSource))
          .filter(Boolean),
      ),
    )
  }, [leadTypeView, records.leads])

  useEffect(() => {
    if (isLeadWorkspaceRoute) return
    if (!selectedLeadId && filteredLeads.length) {
      setSelectedLeadId(filteredLeads[0].leadId)
      return
    }
    if (selectedLeadId && !filteredLeads.some((row) => normalizeLeadIdentityKey(row?.leadId) === normalizeLeadIdentityKey(selectedLeadId))) {
      setSelectedLeadId(filteredLeads[0]?.leadId || '')
    }
  }, [filteredLeads, isLeadWorkspaceRoute, selectedLeadId])

  const allLeadById = useMemo(() => {
    const map = new Map()
    for (const lead of records.leads) {
      const rawKey = normalizeText(lead?.leadId)
      const identityKey = normalizeLeadIdentityKey(lead?.leadId)
      if (rawKey) map.set(rawKey, lead)
      if (identityKey) map.set(identityKey, lead)
    }
    return map
  }, [records.leads])

  const leadById = useMemo(() => {
    const map = new Map()
    for (const lead of filteredLeads) {
      const rawKey = normalizeText(lead?.leadId)
      const identityKey = normalizeLeadIdentityKey(lead?.leadId)
      if (rawKey) map.set(rawKey, lead)
      if (identityKey) map.set(identityKey, lead)
    }
    return map
  }, [filteredLeads])

  const contactById = useMemo(() => {
    const map = new Map()
    for (const contact of records.contacts) {
      map.set(normalizeText(contact?.contactId), contact)
    }
    return map
  }, [records.contacts])

  const canvassingProspectById = useMemo(() => {
    const map = new Map()
    for (const prospect of Array.isArray(canvassingStore.prospects) ? canvassingStore.prospects : []) {
      map.set(normalizeText(prospect?.id), prospect)
    }
    return map
  }, [canvassingStore.prospects])

  const selectedLeadKey = normalizeLeadIdentityKey(selectedLeadId)
  const selectedLead = selectedLeadId
    ? (allLeadById.get(selectedLeadId) || leadById.get(selectedLeadId) || allLeadById.get(selectedLeadKey) || leadById.get(selectedLeadKey) || null)
    : null

  const selectedLeadContact = useMemo(() => {
    if (!selectedLead) return null
    return (
      records.contacts.find((contact) => normalizeText(contact?.contactId) === normalizeText(selectedLead.contactId)) ||
      buildLeadContactFallback(selectedLead) ||
      buildCanvassingProspectContactFallback(canvassingProspectById.get(normalizeText(selectedLead?.canvassingProspectId)))
    )
  }, [canvassingProspectById, records.contacts, selectedLead])

  const selectedLeadActivities = useMemo(() => {
    if (!selectedLead) return []
    const leadKey = normalizeLeadIdentityKey(selectedLead.leadId)
    return records.leadActivities
      .filter((row) => normalizeLeadIdentityKey(row?.leadId) === leadKey)
      .sort((a, b) => new Date(b.activityDate || b.createdAt || 0) - new Date(a.activityDate || a.createdAt || 0))
  }, [records.leadActivities, selectedLead])

  const selectedLeadTasks = useMemo(() => {
    if (!selectedLead) return []
    const leadKey = normalizeLeadIdentityKey(selectedLead.leadId)
    return records.tasks
      .filter((row) => normalizeLeadIdentityKey(row?.leadId) === leadKey)
      .sort((a, b) => new Date(a.dueDate || a.createdAt || 0) - new Date(b.dueDate || b.createdAt || 0))
  }, [records.tasks, selectedLead])

  const selectedLeadAppointments = useMemo(() => {
    if (!selectedLead) return []
    const leadKey = normalizeLeadIdentityKey(selectedLead.leadId)
    return records.appointments
      .filter((row) => normalizeLeadIdentityKey(row?.leadId) === leadKey)
      .sort((a, b) => new Date(a.dateTime || a.createdAt || 0) - new Date(b.dateTime || b.createdAt || 0))
  }, [records.appointments, selectedLead])

  const selectedLeadLinkedAppointment = useMemo(
    () =>
      selectedLeadAppointments
        .slice()
        .sort((a, b) => new Date(b?.dateTime || b?.createdAt || 0) - new Date(a?.dateTime || a?.createdAt || 0))[0] || null,
    [selectedLeadAppointments],
  )

  const selectedLeadLinkedTransaction = useMemo(() => {
    if (!selectedLead) return null
    return (
      records.deals
        .filter((row) => normalizeLeadIdentityKey(row?.leadId) === normalizeLeadIdentityKey(selectedLead?.leadId))
        .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0] || null
    )
  }, [records.deals, selectedLead])

  const selectedLeadNotes = useMemo(() => {
    if (!selectedLead) return ''
    return normalizeText(selectedLead.notes || selectedLead.internalNotes || selectedLead.nextFollowUpNote || '')
  }, [selectedLead])
  const selectedLeadNextStep = useMemo(() => resolveLeadNextStep(selectedLead, selectedLeadTasks), [selectedLead, selectedLeadTasks])

  useEffect(() => {
    if (!selectedLead) {
      setLeadDetailForm(LEAD_DETAIL_DEFAULTS)
      return
    }
    setLeadDetailForm({
      firstName: normalizeText(selectedLeadContact?.firstName),
      lastName: normalizeText(selectedLeadContact?.lastName),
      phone: normalizeText(selectedLeadContact?.phone),
      email: normalizeText(selectedLeadContact?.email).toLowerCase(),
      leadSource: normalizeText(selectedLead?.leadSource) || LEAD_DETAIL_DEFAULTS.leadSource,
      leadDirection: normalizeText(selectedLead?.leadDirection) || LEAD_DETAIL_DEFAULTS.leadDirection,
      priority: normalizeText(selectedLead?.priority) || LEAD_DETAIL_DEFAULTS.priority,
      budget: normalizeText(selectedLead?.budget),
      estimatedValue: normalizeText(selectedLead?.estimatedValue),
      areaInterest: normalizeText(selectedLead?.areaInterest),
      propertyInterest: normalizeText(selectedLead?.propertyInterest),
      sellerPropertyAddress: normalizeText(selectedLead?.sellerPropertyAddress),
      notes: normalizeText(selectedLead?.notes),
    })
  }, [selectedLead, selectedLeadContact])

  const selectedLeadIsSeller = normalizeText(selectedLead?.leadCategory).toLowerCase() === 'seller'
  const selectedLeadRecordId = normalizeText(selectedLead?.leadId)
  const selectedLeadMandatePacketId = normalizeText(selectedLead?.mandatePacketId)
  const selectedLeadStageKey = normalizeText(selectedLead?.stage).toLowerCase()
  const selectedLeadPropertyArea = normalizeText(selectedLead?.sellerPropertyAddress || selectedLead?.areaInterest)
  const selectedLeadPropertyType = normalizeText(selectedLead?.propertyInterest)
  const selectedLeadOnboardingStatusKey = normalizeSellerOnboardingStatus(
    selectedLead?.sellerOnboardingStatus || selectedLead?.sellerOnboarding?.status,
    {
      hasToken: Boolean(selectedLead?.sellerOnboardingToken || selectedLead?.sellerOnboarding?.token),
      hasFormData: Boolean(selectedLead?.sellerOnboarding?.formData && Object.keys(selectedLead.sellerOnboarding.formData).length),
    },
  )
  const selectedLeadHasMandateData = Boolean(
    selectedLead &&
      selectedLeadContact &&
      normalizeText(selectedLeadContact?.firstName || selectedLeadContact?.lastName) &&
      normalizeText(selectedLeadContact?.phone) &&
      (selectedLeadPropertyArea || normalizeText(selectedLead?.propertyInterest || selectedLead?.listingId)),
  )
  const selectedLeadOnboardingCompleted =
    selectedLeadStageKey.includes('onboarding completed') ||
    selectedLeadOnboardingStatusKey === 'completed'
  const selectedLeadOnboardingTimestamp = normalizeText(
    selectedLead?.sellerOnboarding?.completedAt ||
      selectedLead?.sellerOnboarding?.submittedAt ||
      selectedLead?.sellerOnboarding?.updatedAt ||
      selectedLead?.updatedAt,
  )

  useEffect(() => {
    if (!selectedLead || !selectedLeadIsSeller || selectedLeadOnboardingCompleted || !organisationId) return
    const onboardingToken = normalizeText(selectedLead?.sellerOnboardingToken || selectedLead?.sellerOnboarding?.token)
    const linkedListingId = normalizeText(selectedLead?.listingId)
    if ((!onboardingToken && !linkedListingId) || !isSupabaseConfigured) return

    let cancelled = false
    let pollTimer = null
    const clearPollTimer = () => {
      if (pollTimer && typeof window !== 'undefined') {
        window.clearTimeout(pollTimer)
      }
      pollTimer = null
    }

    async function reconcileSellerOnboardingCompletion() {
      try {
        let onboardingContext = null
        if (onboardingToken) {
          onboardingContext = await getSellerOnboardingByToken(onboardingToken, { includeRequirementsAndDocuments: false })
        } else if (supabase && linkedListingId) {
          const onboardingQuery = await supabase
            .from('private_listing_seller_onboarding')
            .select('id, private_listing_id, token, status, submitted_at, updated_at, form_data')
            .eq('private_listing_id', linkedListingId)
            .maybeSingle()
          if (onboardingQuery.error) throw onboardingQuery.error
          onboardingContext = {
            onboarding: onboardingQuery.data,
            listing: {
              id: linkedListingId,
              sellerOnboarding: onboardingQuery.data
                ? {
                    token: normalizeText(onboardingQuery.data.token),
                    status: normalizeText(onboardingQuery.data.status),
                    submittedAt: onboardingQuery.data.submitted_at || null,
                    completedAt: onboardingQuery.data.submitted_at || null,
                    updatedAt: onboardingQuery.data.updated_at || null,
                    formData: onboardingQuery.data.form_data || {},
                  }
                : null,
            },
          }
        }

        const hydratedOnboarding = onboardingContext?.listing?.sellerOnboarding || null
        const hydratedStatus = normalizeSellerOnboardingStatus(
          hydratedOnboarding?.status || onboardingContext?.onboarding?.status,
          {
            hasToken: true,
            hasFormData: Boolean(
              hydratedOnboarding?.formData &&
                typeof hydratedOnboarding.formData === 'object' &&
                Object.keys(hydratedOnboarding.formData).length,
            ),
          },
        )
        if (cancelled) return
        if (hydratedStatus !== 'completed') {
          if (typeof window !== 'undefined' && !cancelled) {
            clearPollTimer()
            pollTimer = window.setTimeout(() => {
              void reconcileSellerOnboardingCompletion()
            }, SELLER_ONBOARDING_COMPLETION_POLL_MS)
          }
          return
        }

        const completedAt =
          hydratedOnboarding?.completedAt ||
          hydratedOnboarding?.submittedAt ||
          onboardingContext?.onboarding?.submitted_at ||
          new Date().toISOString()
        const listingId = normalizeText(onboardingContext?.listing?.id || linkedListingId)
        const patch = {
          stage: 'Onboarding Completed',
          status: 'Onboarding Completed',
          sellerOnboardingStatus: 'completed',
          listingId: listingId || normalizeText(selectedLead?.listingId),
          sellerOnboarding: {
            ...(selectedLead?.sellerOnboarding || {}),
            ...hydratedOnboarding,
            token: normalizeText(hydratedOnboarding?.token || onboardingToken),
            status: 'completed',
            submittedAt: completedAt,
            completedAt,
            formData: hydratedOnboarding?.formData || selectedLead?.sellerOnboarding?.formData || {},
          },
        }

        setRecords((previous) => ({
          ...previous,
          leads: (Array.isArray(previous.leads) ? previous.leads : []).map((lead) =>
            normalizeText(lead?.leadId) === normalizeText(selectedLead.leadId)
              ? { ...lead, ...patch, updatedAt: new Date().toISOString() }
              : lead,
          ),
        }))
        await updateAgencyCrmLeadRecord(organisationId, selectedLead.leadId, patch)
        await createAgencyCrmLeadActivity(organisationId, selectedLead.leadId, {
          agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
          activityType: 'Seller Onboarding Submitted',
          activityNote: 'Seller onboarding was completed.',
          outcome: 'Onboarding completed',
        }, { actor: currentAgent })

        if (listingId) {
          await updatePrivateListing(
            listingId,
            {
              listingStatus: 'onboarding_completed',
              sellerOnboardingStatus: 'completed',
            },
            { includeRequirementsAndDocuments: false },
          ).catch((listingSyncError) => {
            console.warn('[PIPELINE] private listing onboarding completion sync failed', listingSyncError)
          })
        }

        if (typeof window !== 'undefined') {
          void reloadRecords(organisationId)
        }
      } catch (syncError) {
        if (!cancelled) {
          console.warn('[PIPELINE] seller onboarding completion reconciliation failed', syncError)
          if (typeof window !== 'undefined') {
            clearPollTimer()
            pollTimer = window.setTimeout(() => {
              void reconcileSellerOnboardingCompletion()
            }, SELLER_ONBOARDING_COMPLETION_POLL_MS)
          }
        }
      }
    }

    void reconcileSellerOnboardingCompletion()
    return () => {
      cancelled = true
      clearPollTimer()
    }
  }, [
    currentAgent,
    currentAgent.email,
    currentAgent.fullName,
    currentAgent.id,
    organisationId,
    selectedLead,
    selectedLeadIsSeller,
    selectedLeadOnboardingCompleted,
    reloadRecords,
  ])

  const selectedLeadMandateSigned = selectedLeadStageKey.includes('mandate signed')
  const selectedLeadMandateViewLink = useMemo(() => {
    const directLink = normalizeText(selectedLead?.mandateSigningLink || selectedLead?.mandateSignerLink)
    if (directLink) return directLink
    const token = normalizeText(selectedLead?.sellerOnboardingToken)
    if (!token) return ''
    const baseLink = buildSellerClientPortalLink(token)
    if (!baseLink) return ''
    return `${baseLink}/mandate`
  }, [selectedLead])

  const selectedLeadMandateActionState = useMemo(
    () =>
      resolveDocumentPacketActionState({
        packetType: 'mandate',
        state: mandatePacketStatus?.state,
        isBusy: isMandateGenerating || isMandateSending,
        warningCount: Array.isArray(mandatePacketStatus?.warnings) ? mandatePacketStatus.warnings.length : 0,
      }),
    [isMandateGenerating, isMandateSending, mandatePacketStatus?.state, mandatePacketStatus?.warnings],
  )
  const selectedLeadMandateActionMeta = useMemo(() => {
    const stamp = formatPacketStatusMeta(mandatePacketStatus)
    if (stamp) return stamp
    if (selectedLeadMandateActionState.actionKey === 'generate') return 'No mandate packet yet.'
    if (selectedLeadMandateActionState.actionKey === 'edit') return 'Draft exists and can be updated.'
    if (selectedLeadMandateActionState.actionKey === 'send') return 'Draft generated and ready to send.'
    if (selectedLeadMandateActionState.actionKey === 'view') return 'Packet was already sent for signature.'
    if (selectedLeadMandateActionState.actionKey === 'view_signed') return 'Fully signed packet is available.'
    return ''
  }, [mandatePacketStatus, selectedLeadMandateActionState.actionKey])

  const selectedLeadWorkflowHealth = useMemo(() => {
    if (!selectedLead) {
      return { completed: 0, total: 0, percent: 0, missing: [] }
    }

    const isSeller = normalizeText(selectedLead.leadCategory).toLowerCase() === 'seller'
    const stage = normalizeText(selectedLead.stage).toLowerCase()
    const appointments = selectedLeadAppointments || []
    const hasAppointment = appointments.length > 0
    const hasCompletedAppointment = appointments.some((row) => normalizeText(row?.status).toLowerCase() === 'completed')
    const hasTransaction = Boolean(selectedLeadLinkedTransaction)
    const hasOffer = stage.includes('offer') || hasTransaction
    const hasListing = Boolean(
      normalizeText(selectedLead?.listingId || selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress),
    )
    const hasMandate = Boolean(
      normalizeText(mandatePacketStatus?.packet?.id) &&
        documentPacketBelongsToLead(mandatePacketStatus?.packet, selectedLead?.leadId),
    )
    const mandateSigningStatus = normalizeText(mandatePacketStatus?.signingStatus).toLowerCase()
    const mandateSigned = stage.includes('mandate signed') || ['signed', 'uploaded_signed'].includes(mandateSigningStatus)
    const otpSigned = stage.includes('otp signed')

    const checks = isSeller
      ? [
          { key: 'valuation_booked', label: 'Valuation / appointment booked', done: hasAppointment },
          { key: 'mandate_generated', label: 'Mandate generated', done: hasMandate },
          { key: 'mandate_signed', label: 'Mandate signed', done: mandateSigned },
          { key: 'listing_active', label: 'Listing active/linked', done: hasListing },
        ]
      : [
          { key: 'appointment_booked', label: 'Viewing/appointment booked', done: hasAppointment },
          { key: 'viewing_completed', label: 'Viewing completed', done: hasCompletedAppointment },
          { key: 'offer_submitted', label: 'Offer submitted', done: hasOffer },
          { key: 'transaction_created', label: 'Transaction created', done: hasTransaction },
          { key: 'otp_signed', label: 'OTP signed', done: otpSigned },
        ]

    const completed = checks.filter((item) => item.done).length
    const total = checks.length
    return {
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
      items: checks,
      missing: checks.filter((item) => !item.done),
    }
  }, [mandatePacketStatus?.packet, mandatePacketStatus?.signingStatus, selectedLead, selectedLeadAppointments, selectedLeadLinkedTransaction])

  const leadTasksByLeadId = useMemo(() => {
    const map = new Map()
    for (const task of Array.isArray(records.tasks) ? records.tasks : []) {
      const leadId = normalizeLeadIdentityKey(task?.leadId)
      if (!leadId) continue
      if (!map.has(leadId)) map.set(leadId, [])
      map.get(leadId).push(task)
    }
    return map
  }, [records.tasks])

  const leadActivitiesByLeadId = useMemo(() => {
    const map = new Map()
    for (const activity of Array.isArray(records.leadActivities) ? records.leadActivities : []) {
      const leadId = normalizeLeadIdentityKey(activity?.leadId)
      if (!leadId) continue
      if (!map.has(leadId)) map.set(leadId, [])
      map.get(leadId).push(activity)
    }
    return map
  }, [records.leadActivities])

  const linkedDealByLeadId = useMemo(() => {
    const map = new Map()
    for (const deal of Array.isArray(records.deals) ? records.deals : []) {
      const leadId = normalizeLeadIdentityKey(deal?.leadId)
      if (!leadId) continue
      const existing = map.get(leadId)
      const existingTime = new Date(existing?.updatedAt || existing?.createdAt || 0).getTime()
      const dealTime = new Date(deal?.updatedAt || deal?.createdAt || 0).getTime()
      if (!existing || dealTime >= existingTime) {
        map.set(leadId, deal)
      }
    }
    return map
  }, [records.deals])

  const kanbanColumns = useMemo(() => {
    const columns = getLeadKanbanColumnsForType(leadTypeView).map((column) => ({ ...column, cards: [] }))
    const columnById = new Map(columns.map((column) => [column.id, column]))
    for (const lead of filteredLeads) {
      const leadId = normalizeLeadIdentityKey(lead?.leadId)
      const columnId = resolvePipelineKanbanColumnId(lead, linkedDealByLeadId.get(leadId))
      const column = columnById.get(columnId) || columns[0]
      column.cards.push(lead)
    }
    return columns
  }, [filteredLeads, leadTypeView, linkedDealByLeadId])

  const principalProductivityRows = useMemo(() => {
    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
    const rowByAgent = new Map()

    const ensureRow = (agentLabel) => {
      const key = normalizeText(agentLabel) || 'Unassigned'
      if (!rowByAgent.has(key)) {
        rowByAgent.set(key, {
          agent: key,
          newLeads: 0,
          contacted: 0,
          viewingsScheduled: 0,
          followUps: 0,
          converted: 0,
          conversionRate: 0,
          lastActivity: '',
          isLikelyFallback: false,
        })
      }
      return rowByAgent.get(key)
    }

    for (const lead of Array.isArray(filteredLeads) ? filteredLeads : []) {
      const agentLabel = normalizeText(lead?.assignedAgentName || lead?.assignedAgentEmail || 'Unassigned')
      const row = ensureRow(agentLabel)
      const createdAt = new Date(lead?.createdAt || 0).getTime()
      const stage = normalizeText(lead?.stage || lead?.status).toLowerCase()
      if (Number.isFinite(createdAt) && createdAt >= sevenDaysAgo) row.newLeads += 1
      if (['contacted', 'qualified', 'appointment scheduled', 'appointment completed', 'follow-up', 'negotiating', 'offer submitted', 'offer accepted', 'deal created', 'converted to transaction'].includes(stage)) {
        row.contacted += 1
      }
      if (stage.includes('deal created') || stage.includes('converted to transaction')) row.converted += 1
      const leadTasks = leadTasksByLeadId.get(normalizeLeadIdentityKey(lead?.leadId)) || []
      row.followUps += leadTasks.filter((task) => normalizeText(task?.status) !== 'Completed').length
      const leadActivities = leadActivitiesByLeadId.get(normalizeLeadIdentityKey(lead?.leadId)) || []
      for (const activity of leadActivities) {
        const at = new Date(activity?.activityDate || activity?.createdAt || 0).getTime()
        if (!Number.isFinite(at)) continue
        if (!row.lastActivity || at > new Date(row.lastActivity).getTime()) row.lastActivity = new Date(at).toISOString()
      }
    }

    for (const appointment of Array.isArray(records.appointments) ? records.appointments : []) {
      const type = normalizeText(appointment?.appointmentType).toLowerCase()
      if (!type.includes('viewing')) continue
      const leadId = normalizeText(appointment?.leadId)
      const leadKey = normalizeLeadIdentityKey(leadId)
      const linkedLead = leadId ? (leadById.get(leadId) || allLeadById.get(leadId) || leadById.get(leadKey) || allLeadById.get(leadKey) || null) : null
      const agentLabel = normalizeText(
        linkedLead?.assignedAgentName ||
        linkedLead?.assignedAgentEmail ||
        appointment?.assignedAgentName ||
        appointment?.assignedAgentEmail ||
        'Unassigned',
      )
      const row = ensureRow(agentLabel)
      row.viewingsScheduled += 1
      const at = new Date(appointment?.updatedAt || appointment?.dateTime || appointment?.createdAt || 0).getTime()
      if (Number.isFinite(at) && (!row.lastActivity || at > new Date(row.lastActivity).getTime())) {
        row.lastActivity = new Date(at).toISOString()
      }
    }

    const values = Array.from(rowByAgent.values())
      .map((row) => ({
        ...row,
        conversionRate: row.contacted > 0 ? (row.converted / Math.max(row.contacted, 1)) * 100 : 0,
        lastActivityLabel: row.lastActivity ? formatDateShort(row.lastActivity) : 'No recent activity',
      }))
      .sort((a, b) => b.newLeads - a.newLeads || b.contacted - a.contacted)

    return values.length
      ? values
      : [{
          agent: 'No agent activity yet',
          newLeads: 0,
          contacted: 0,
          viewingsScheduled: 0,
          followUps: 0,
          converted: 0,
          conversionRate: 0,
          lastActivity: '',
          lastActivityLabel: 'Waiting for data',
          isLikelyFallback: true,
        }]
  }, [allLeadById, filteredLeads, leadActivitiesByLeadId, leadById, leadTasksByLeadId, records.appointments])

  useEffect(() => {
    let active = true

    if (!selectedLeadRecordId || !selectedLeadIsSeller || !organisationId) {
      setMandatePacketStatus({
        packetType: 'mandate',
        state: 'NO_PACKET',
        packet: null,
        versions: [],
        signingSummary: null,
        warnings: [],
        actionHint: 'No packet record was found for this context.',
      })
      return () => {
        active = false
      }
    }

    const loadPacketStatus = async () => {
      const leadUuid = normalizeLeadUuid(selectedLeadRecordId)
      const mandatePacketId = selectedLeadMandatePacketId
      const transactionId = normalizeText(selectedLeadLinkedTransaction?.transactionId || selectedLeadLinkedTransaction?.dealId)
      const hasResolvablePacketContext =
        (mandatePacketId && isUuidLike(mandatePacketId)) ||
        Boolean(leadUuid) ||
        (transactionId && isUuidLike(transactionId))

      if (!hasResolvablePacketContext) {
        if (!active) return
        setMandatePacketStatus({
          packetType: 'mandate',
          state: 'NO_PACKET',
          packet: null,
          versions: [],
          signingSummary: null,
          warnings: [],
          actionHint: 'No packet record was found for this local lead yet.',
        })
        return
      }

      try {
        const resolved = await resolveDocumentPacketStatus({
          packetType: 'mandate',
          packetId: mandatePacketId,
          leadId: leadUuid,
          transactionId: isUuidLike(transactionId) ? transactionId : '',
          organisationId,
        })
        if (!active) return
        setMandatePacketStatus(resolved)
      } catch (statusError) {
        if (!active) return
        setMandatePacketStatus({
          packetType: 'mandate',
          state: mandatePacketId ? 'UNKNOWN' : 'NO_PACKET',
          packet: null,
          versions: [],
          signingSummary: null,
          warnings: [normalizeText(statusError?.message || 'Unable to resolve mandate packet status.')],
          actionHint: 'Packet status resolver failed. Use existing action flow as fallback.',
        })
      }
    }

    void loadPacketStatus()
    return () => {
      active = false
    }
  }, [
    organisationId,
    selectedLeadRecordId,
    selectedLeadMandatePacketId,
    selectedLeadIsSeller,
    selectedLeadLinkedTransaction?.transactionId,
    selectedLeadLinkedTransaction?.dealId,
  ])

  const calendarScopedAppointments = useMemo(() => {
    if (!isCalendarMode) return records.appointments
    if (!isPrincipal) return records.appointments
    const filterKey = normalizeKey(calendarAgentFilter)
    if (!filterKey || filterKey === 'all') return records.appointments
    return records.appointments.filter((appointment) => {
      const appointmentKeys = [
        appointment?.assignedAgentId,
        appointment?.assignedAgentEmail,
        appointment?.agentId,
        appointment?.agentEmail,
        appointment?.createdBy,
        ...(Array.isArray(appointment?.participants)
          ? appointment.participants.flatMap((participant) => [
              participant?.userId,
              participant?.email,
            ])
          : []),
      ]
        .map((value) => normalizeKey(value))
        .filter(Boolean)
      return appointmentKeys.includes(filterKey)
    })
  }, [calendarAgentFilter, isCalendarMode, isPrincipal, records.appointments])

  const appointmentSummary = useMemo(() => {
    if (!organisationId) {
      return {
        rows: [],
        pending: [],
        reschedule: [],
        upcoming: [],
        today: [],
        thisWeek: [],
        statusCounts: [],
        typeCounts: [],
      }
    }
    return buildAppointmentsDashboardSummary(calendarScopedAppointments, { now: new Date() })
  }, [calendarScopedAppointments, organisationId])

  const selectedAppointment = useMemo(() => {
    if (!selectedAppointmentId) return null
    return records.appointments.find((appointment) => normalizeText(appointment?.appointmentId) === normalizeText(selectedAppointmentId)) || null
  }, [records.appointments, selectedAppointmentId])

  const appointmentListingById = useMemo(() => {
    const map = new Map()
    for (const option of appointmentListingOptions) {
      if (option?.id) map.set(normalizeText(option.id), option)
    }
    return map
  }, [appointmentListingOptions])

  const appointmentListingByLabel = useMemo(() => {
    const map = new Map()
    for (const option of appointmentListingOptions) {
      const labels = [
        option?.label,
        option?.title,
        option?.address,
        [option?.title, option?.address].filter(Boolean).join(' — '),
      ]
      for (const label of labels) {
        const key = normalizeKey(label)
        if (key && !map.has(key)) map.set(key, option)
      }
    }
    return map
  }, [appointmentListingOptions])

  const resolveLeadLinkedListing = useCallback(
    (lead = {}) => {
      const listingId = normalizeText(lead?.listingId || lead?.listing_id)
      if (listingId && appointmentListingById.has(listingId)) return appointmentListingById.get(listingId)
      const possibleLabels = [
        lead?.propertyInterest,
        lead?.sellerPropertyAddress,
        [lead?.propertyInterest, lead?.sellerPropertyAddress].filter(Boolean).join(' — '),
      ]
      for (const label of possibleLabels) {
        const match = appointmentListingByLabel.get(normalizeKey(label))
        if (match) return match
      }
      return null
    },
    [appointmentListingById, appointmentListingByLabel],
  )

  const resolveAppointmentListingLabel = useCallback(
    (listingId) => {
      const id = normalizeText(listingId)
      if (!id) return ''
      return appointmentListingById.get(id)?.label || id
    },
    [appointmentListingById],
  )

  const selectedAppointmentTemplate = useMemo(
    () => getAppointmentTypeTemplate(appointmentForm.appointmentType || 'other'),
    [appointmentForm.appointmentType],
  )

  const appointmentPrepChecklist = useMemo(() => {
    const statusByKey = {}
    const uploadedKeys = []
    for (const requirement of Array.isArray(appointmentForm.requiredDocuments) ? appointmentForm.requiredDocuments : []) {
      const key = normalizeText(requirement?.key || requirement)
      if (!key) continue
      const normalizedKey = key.toLowerCase()
      const status = normalizeText(requirement?.status).toLowerCase()
      if (status) statusByKey[normalizedKey] = status
      if (requirement?.completed === true || ['uploaded', 'approved', 'completed', 'under_review'].includes(status)) {
        uploadedKeys.push(normalizedKey)
      }
    }
    const transactionContext = {
      requirementStatusByKey: statusByKey,
      uploadedRequirementKeys: uploadedKeys,
    }
    return getAppointmentRequiredPrep(appointmentForm.appointmentType || 'other', transactionContext)
  }, [appointmentForm.appointmentType, appointmentForm.requiredDocuments])

  const calendarAppointmentsByDate = useMemo(() => {
    const groups = new Map()
    for (const appointment of calendarScopedAppointments) {
      const parsedDate = parseAppointmentDate(appointment)
      if (!parsedDate) continue
      const key = toDateOnlyIso(parsedDate)
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key).push(appointment)
    }

    for (const [_key, rows] of groups.entries()) {
      rows.sort((left, right) => {
        const leftTime = parseAppointmentDate(left)?.getTime() ?? 0
        const rightTime = parseAppointmentDate(right)?.getTime() ?? 0
        return leftTime - rightTime
      })
    }

    return groups
  }, [calendarScopedAppointments])

  const weekDays = useMemo(() => getWeekDays(calendarCursorDate), [calendarCursorDate])
  const dayDays = useMemo(() => getCalendarRangeDays(calendarCursorDate, 1), [calendarCursorDate])
  const threeDayDays = useMemo(() => getCalendarRangeDays(calendarCursorDate, 3), [calendarCursorDate])
  const monthDays = useMemo(() => getMonthGridDays(calendarCursorDate), [calendarCursorDate])
  const visibleCalendarDays = calendarView === 'month'
    ? monthDays
    : calendarView === 'three_day'
      ? threeDayDays
      : calendarView === 'day'
        ? dayDays
        : weekDays
  const calendarHeaderDays = calendarView === 'month'
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : visibleCalendarDays.map((day) => day.toLocaleDateString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short' }))
  const calendarGridTemplateColumns = `repeat(${calendarView === 'month' ? 7 : Math.max(1, visibleCalendarDays.length)}, minmax(0, 1fr))`
  const calendarPeriodLabel = useMemo(
    () => formatCalendarPeriodLabel(calendarView, calendarCursorDate),
    [calendarCursorDate, calendarView],
  )
  const visibleCalendarAppointmentCount = useMemo(() => {
    return visibleCalendarDays.reduce((total, day) => {
      const key = toDateOnlyIso(day)
      return total + (calendarAppointmentsByDate.get(key)?.length || 0)
    }, 0)
  }, [calendarAppointmentsByDate, visibleCalendarDays])

  const metrics = useMemo(
    () =>
      buildPipelineMetrics({
        leads: filteredLeads,
        tasks: records.tasks,
        appointments: records.appointments,
        deals: records.deals,
      }),
    [filteredLeads, records.appointments, records.deals, records.tasks],
  )

  const leadPageSummary = useMemo(() => {
    const targetCategory = leadTypeView === 'seller' ? 'seller' : 'buyer'
    const allCategoryLeads = records.leads.filter((lead) => normalizeText(lead?.leadCategory).toLowerCase() === targetCategory)
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - 6)
    weekStart.setHours(0, 0, 0, 0)
    const newThisWeek = allCategoryLeads.filter((lead) => {
      const created = new Date(lead?.createdAt || 0)
      return !Number.isNaN(created.getTime()) && created >= weekStart
    }).length
    return {
      total: allCategoryLeads.length,
      newThisWeek,
      filtered: filteredLeads.length,
    }
  }, [filteredLeads.length, leadTypeView, records.leads])

  const principalReporting = useMemo(
    () =>
      buildPrincipalReporting({
        leads: filteredLeads,
        activities: records.leadActivities,
        appointments: records.appointments,
        deals: records.deals,
      }),
    [filteredLeads, records.appointments, records.deals, records.leadActivities],
  )

  const appointmentHasHardConflicts = appointmentSchedulingIntegrity?.hasHardConflicts === true
  const appointmentHasSoftConflicts = appointmentSchedulingIntegrity?.hasSoftConflicts === true
  const appointmentCanSave = !appointmentSchedulingLoading && !appointmentHasHardConflicts

  useEffect(() => {
    if (!organisationId) {
      setAppointmentResources([])
      return
    }
    let isCancelled = false
    void (async () => {
      try {
        const resources = await listAppointmentResourcesAsync(organisationId, { includeInactive: false })
        if (!isCancelled) {
          setAppointmentResources(Array.isArray(resources) ? resources : [])
        }
      } catch {
        if (!isCancelled) {
          setAppointmentResources([])
        }
      }
    })()
    return () => {
      isCancelled = true
    }
  }, [organisationId])

  useEffect(() => {
    if (!appointmentModalOpen) {
      setAppointmentSchedulingLoading(false)
      setAppointmentSchedulingError('')
      return
    }
    if (!organisationId || !normalizeText(appointmentForm.date) || !normalizeText(appointmentForm.startTime)) {
      setAppointmentSchedulingIntegrity(null)
      setAppointmentSchedulingError('')
      setAppointmentSchedulingLoading(false)
      return
    }

    const payload = buildAppointmentDraftForIntegrity()
    let isCancelled = false
    const timer = window.setTimeout(() => {
      setAppointmentSchedulingLoading(true)
      setAppointmentSchedulingError('')
      void (async () => {
        try {
          const integrity = await checkAppointmentSchedulingIntegrityAsync(
            organisationId,
            payload,
            {
              excludeAppointmentId: selectedAppointmentId || null,
              allowOutsideBusinessHours: payload.allowOutsideBusinessHours === true,
              maxSuggestions: 5,
            },
          )
          if (!isCancelled) {
            setAppointmentSchedulingIntegrity(integrity)
          }
        } catch (integrityError) {
          if (!isCancelled) {
            setAppointmentSchedulingIntegrity(null)
            setAppointmentSchedulingError(integrityError?.message || 'Unable to run availability checks right now.')
          }
        } finally {
          if (!isCancelled) {
            setAppointmentSchedulingLoading(false)
          }
        }
      })()
    }, 300)

    return () => {
      isCancelled = true
      window.clearTimeout(timer)
    }
  }, [
    appointmentModalOpen,
    organisationId,
    appointmentForm.date,
    appointmentForm.startTime,
    appointmentForm.endTime,
    appointmentForm.appointmentType,
    appointmentForm.resourceId,
    appointmentForm.allowOutsideBusinessHours,
    appointmentForm.schedulingOverrideReason,
    appointmentForm.location,
    appointmentForm.status,
    appointmentForm.listingId,
    appointmentForm.transactionId,
    appointmentForm.contactId,
    appointmentForm.participants,
    appointmentForm.title,
    selectedAppointmentId,
    buildAppointmentDraftForIntegrity,
  ])

  function clearLeadForm() {
    setLeadForm({
      ...NEW_LEAD_DEFAULTS,
      leadSource: MANUAL_LEAD_SOURCE_OPTIONS[0] || 'Other',
    })
    setSelectedAgentId(normalizeText(currentAgent.id || currentAgent.email))
  }

  function openLeadForm(category = leadTypeView) {
    setError('')
    setLeadForm({
      ...NEW_LEAD_DEFAULTS,
      leadSource: MANUAL_LEAD_SOURCE_OPTIONS[0] || 'Other',
      leadCategory: leadCategoryLabelForView(category),
    })
    setSelectedAgentId(normalizeText(currentAgent.id || currentAgent.email))
    setShowLeadForm(true)
  }

  function updateLeadFormField(key, value) {
    setLeadForm((previous) => ({ ...previous, [key]: value }))
  }

  async function handleCreateLead(event) {
    event.preventDefault()
    if (isLeadCreating) return
    if (!organisationId) return
    if (
      !normalizeText(leadForm.firstName) ||
      !normalizeText(leadForm.lastName) ||
      !normalizeText(leadForm.phone) ||
      !normalizeText(leadForm.email) ||
      !normalizeText(leadForm.leadSource)
    ) {
      setError('Name, surname, phone, email, and lead source are required.')
      return
    }

    const assignedAgent = resolveAgentById(selectedAgentId || currentAgent.id)
    const linkedListingId = normalizeText(leadForm.linkedListing)
    const linkedListing = linkedListingId ? appointmentListingById.get(linkedListingId) : null
    setIsLeadCreating(true)
    try {
      const createdLead = await createAgencyCrmLeadRecord(
        organisationId,
        {
          contact: {
            firstName: normalizeText(leadForm.firstName) || 'Lead',
            lastName: normalizeText(leadForm.lastName),
            phone: normalizeText(leadForm.phone),
            email: normalizeText(leadForm.email),
            notes: normalizeText(leadForm.notes),
            contactType: leadForm.leadCategory,
          },
          assignedAgent,
          leadCategory: leadForm.leadCategory,
          leadDirection: leadForm.leadDirection,
          leadSource: leadForm.leadSource,
          stage: leadForm.stage,
          priority: leadForm.priority,
          listingId: linkedListingId,
          budget: Number(leadForm.budget || 0) || 0,
          estimatedValue: Number(leadForm.estimatedValue || 0) || 0,
          areaInterest: normalizeText(leadForm.areaInterest || leadForm.propertyArea),
          propertyInterest: normalizeText(leadForm.propertyInterest || linkedListing?.label || leadForm.linkedListing || leadForm.propertyType),
          sellerPropertyAddress: normalizeText(leadForm.sellerPropertyAddress || leadForm.propertyArea),
          notes: leadForm.notes,
        },
        {
          actor: {
            id: currentAgent.id,
            name: currentAgent.fullName,
            email: currentAgent.email,
          },
        },
      )
      const createdLeadKey = normalizeLeadIdentityKey(createdLead?.leadId)
      if (createdLeadKey) {
        setRecords((previous) => ({
          ...previous,
          leads: [
            createdLead,
            ...(Array.isArray(previous.leads) ? previous.leads : []).filter(
              (lead) => normalizeLeadIdentityKey(lead?.leadId) !== createdLeadKey,
            ),
          ],
        }))
      }
      if (normalizeText(leadForm.nextFollowUpDate)) {
        void createAgencyCrmLeadTask(
          organisationId,
          createdLead.leadId,
          {
            assignedAgent,
            title: normalizeText(leadForm.nextFollowUpNote) || 'Lead follow-up',
            description: normalizeText(leadForm.notes),
            dueDate: normalizeText(leadForm.nextFollowUpDate),
            status: 'Pending',
            priority: leadForm.priority,
          },
          {
            actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
          },
        ).catch((taskError) => {
          console.warn('[PIPELINE] non-blocking lead follow-up task creation failed', taskError)
        })
      }
      void createAgencyCrmLeadActivity(organisationId, createdLead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Lead Created',
        activityNote: 'lead_created',
        outcome: 'Manual lead captured',
        activityDate: new Date().toISOString(),
      }, { actor: currentAgent }).catch((activityError) => {
        console.warn('[PIPELINE] non-blocking lead created activity failed', activityError)
      })
      setError('')
      setMessage('Lead created.')
      setLeadTypeView(resolveLeadCategoryView(createdLead?.leadCategory || leadForm.leadCategory))
      setLeadFilter({ ...DEFAULT_LEAD_FILTER })
      setSelectedLeadId(createdLead?.leadId || '')
      clearLeadForm()
      setShowLeadForm(false)
      void reloadRecords(organisationId)
    } catch (createError) {
      setError(createError?.message || 'Unable to create lead right now.')
    } finally {
      setIsLeadCreating(false)
    }
  }

  async function handleUpdateLeadStage(leadId, stage, options = {}) {
    if (!organisationId || !leadId) return
    const targetLead = records.leads.find((lead) => normalizeText(lead?.leadId) === normalizeText(leadId)) || selectedLead || null
    const nextStage = normalizeText(stage)
    const movedAt = new Date().toISOString()
    const leadCategoryKey = normalizeKey(targetLead?.leadCategory)
    const isBuyerLead = !leadCategoryKey.includes('seller') && !leadCategoryKey.includes('landlord')
    const isBuyerStageMove = isBuyerLead && (isBuyerWorkflowStage(targetLead?.stage || targetLead?.status) || isBuyerWorkflowStage(nextStage))

    if (isBuyerStageMove) {
      try {
        const result = await transitionBuyerLeadStage({
          organisationId,
          lead: targetLead,
          leadId,
          toStage: nextStage,
          actor: { ...currentAgent, role: membershipRole || role, isPrincipal },
          options,
        })
        setRecords((previous) => ({
          ...previous,
          leads: (Array.isArray(previous.leads) ? previous.leads : []).map((lead) => (
            normalizeText(lead?.leadId) === normalizeText(leadId)
              ? {
                  ...lead,
                  stage: result.stage,
                  status: result.stage,
                  updatedAt: movedAt,
                }
              : lead
          )),
        }))
        scheduleRecordsReload(organisationId, 850)
        if (options.successMessage) setMessage(options.successMessage)
      } catch (transitionError) {
        setError(transitionError?.message || 'Workflow rules blocked this stage move.')
        scheduleRecordsReload(organisationId, 250)
      }
      return
    }

    setRecords((previous) => ({
      ...previous,
      leads: (Array.isArray(previous.leads) ? previous.leads : []).map((lead) => (
        normalizeText(lead?.leadId) === normalizeText(leadId)
          ? {
              ...lead,
              stage: nextStage,
              status: nextStage,
              updatedAt: movedAt,
            }
          : lead
      )),
    }))
    await updateAgencyCrmLeadRecord(organisationId, leadId, { stage: nextStage, status: nextStage })
    await createAgencyCrmLeadActivity(
      organisationId,
      leadId,
      {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Stage Change',
        activityNote: normalizeText(options.activityNote) || `Pipeline stage moved to ${nextStage}`,
        outcome: nextStage,
      },
      { actor: currentAgent },
    )
    scheduleRecordsReload(organisationId, 850)
    if (options.successMessage) {
      setMessage(options.successMessage)
    }
  }

  function updateLeadDetailField(field, value) {
    setLeadDetailForm((previous) => ({
      ...previous,
      [field]: value,
    }))
  }

  function resetActivityComposer() {
    setActivityForm(LEAD_DETAIL_DEFAULT_ACTIVITY)
    setEditingActivityId('')
  }

  function resetTaskComposer() {
    setTaskForm(LEAD_DETAIL_DEFAULT_TASK)
    setEditingTaskId('')
  }

  async function handleSaveLeadDetails(event) {
    event.preventDefault()
    if (!organisationId || !selectedLead) return
    if (!normalizeText(leadDetailForm.firstName) || !normalizeText(leadDetailForm.phone) || !normalizeText(leadDetailForm.email)) {
      setError('First name, phone, and email are required before saving lead details.')
      return
    }

    setIsLeadDetailSaving(true)
    try {
      const contactPatch = {
        firstName: normalizeText(leadDetailForm.firstName),
        lastName: normalizeText(leadDetailForm.lastName),
        phone: normalizeText(leadDetailForm.phone),
        email: normalizeText(leadDetailForm.email).toLowerCase(),
      }
      const leadPatch = {
        leadSource: normalizeText(leadDetailForm.leadSource) || LEAD_DETAIL_DEFAULTS.leadSource,
        leadDirection: normalizeText(leadDetailForm.leadDirection) || LEAD_DETAIL_DEFAULTS.leadDirection,
        priority: normalizeText(leadDetailForm.priority) || LEAD_DETAIL_DEFAULTS.priority,
        budget: Number(leadDetailForm.budget || 0) || 0,
        estimatedValue: Number(leadDetailForm.estimatedValue || 0) || 0,
        areaInterest: normalizeText(leadDetailForm.areaInterest),
        propertyInterest: normalizeText(leadDetailForm.propertyInterest),
        sellerPropertyAddress: normalizeText(leadDetailForm.sellerPropertyAddress),
        notes: normalizeText(leadDetailForm.notes),
      }

      if (selectedLeadContact?.contactId) {
        await updateAgencyCrmContactRecord(organisationId, selectedLeadContact.contactId, contactPatch)
      }
      await updateAgencyCrmLeadRecord(organisationId, selectedLead.leadId, leadPatch)

      setRecords((previous) => ({
        ...previous,
        contacts: (Array.isArray(previous.contacts) ? previous.contacts : []).map((contact) =>
          normalizeText(contact?.contactId) === normalizeText(selectedLeadContact?.contactId)
            ? {
                ...contact,
                ...contactPatch,
                updatedAt: new Date().toISOString(),
              }
            : contact,
        ),
        leads: (Array.isArray(previous.leads) ? previous.leads : []).map((lead) =>
          normalizeLeadIdentityKey(lead?.leadId) === normalizeLeadIdentityKey(selectedLead.leadId)
            ? {
                ...lead,
                ...leadPatch,
                updatedAt: new Date().toISOString(),
              }
            : lead,
        ),
      }))

      setError('')
      setMessage('Lead details saved.')
      scheduleRecordsReload(organisationId, 250)
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save lead details right now.')
    } finally {
      setIsLeadDetailSaving(false)
    }
  }

  async function handleMovePipelineCard(leadId, targetColumnId) {
    const lead = records.leads.find((row) => normalizeText(row?.leadId) === normalizeText(leadId))
    const leadType = normalizeKey(lead?.leadCategory).includes('seller') ? 'seller' : 'buyer'
    const targetColumn = getPipelineKanbanColumn(targetColumnId, leadType)
    const currentColumn = getPipelineKanbanColumn(resolvePipelineKanbanColumnId(lead, linkedDealByLeadId.get(normalizeText(leadId))), leadType)
    const validation = canMovePipelineCard({
      user: {
        id: currentAgent.id,
        email: currentAgent.email,
        role,
        isPrincipal,
      },
      card: lead,
      fromStage: currentColumn.stageValue,
      toStage: targetColumn.stageValue,
    })

    if (!validation.allowed) {
      setError(validation.reason || 'This card cannot be moved to that stage.')
      setDraggingPipelineCardId('')
      return
    }

    setError('')
    setDraggingPipelineCardId('')
    draggingPipelineCardRef.current = ''
    void handleUpdateLeadStage(leadId, targetColumn.stageValue, {
      activityNote: `Moved from ${currentColumn.label} to ${targetColumn.label} by ${currentAgent.fullName}`,
      successMessage: `Moved to ${targetColumn.label}.`,
    })
  }

  async function handleAddActivity(event) {
    event.preventDefault()
    if (!selectedLead || !organisationId) return
    if (!normalizeText(activityForm.activityNote)) {
      setError('Add an activity note before saving.')
      return
    }
    if (editingActivityId) {
      await updateAgencyCrmLeadActivity(organisationId, editingActivityId, {
        activityType: activityForm.activityType,
        activityNote: activityForm.activityNote,
        outcome: activityForm.outcome,
      })
    } else {
      await createAgencyCrmLeadActivity(organisationId, selectedLead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: activityForm.activityType,
        activityNote: activityForm.activityNote,
        outcome: activityForm.outcome,
        activityDate: new Date().toISOString(),
      }, { actor: currentAgent })
    }
    resetActivityComposer()
    setError('')
    setMessage(editingActivityId ? 'Activity updated.' : 'Activity logged.')
    void reloadRecords(organisationId)
  }

  function handleEditActivity(activity) {
    setEditingActivityId(normalizeText(activity?.activityId))
    setActivityForm({
      activityType: normalizeText(activity?.activityType) || LEAD_DETAIL_DEFAULT_ACTIVITY.activityType,
      activityNote: normalizeText(activity?.activityNote),
      outcome: normalizeText(activity?.outcome),
    })
    setError('')
  }

  async function handleDeleteActivity(activity) {
    if (!organisationId || !activity?.activityId) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this activity entry?')) {
      return
    }
    await deleteAgencyCrmLeadActivity(organisationId, activity.activityId)
    if (normalizeText(editingActivityId) === normalizeText(activity.activityId)) {
      resetActivityComposer()
    }
    setError('')
    setMessage('Activity deleted.')
    void reloadRecords(organisationId)
  }

  async function handleCreateTask(event) {
    event.preventDefault()
    if (!selectedLead || !organisationId) return
    if (!normalizeText(taskForm.title)) {
      setError('Task title is required.')
      return
    }
    const assignedAgent = resolveAgentById(selectedLead.assignedAgentId || selectedLead.assignedAgentEmail || currentAgent.id)
    if (editingTaskId) {
      await updateAgencyCrmLeadTask(
        organisationId,
        editingTaskId,
        {
          title: taskForm.title,
          description: taskForm.description,
          dueDate: taskForm.dueDate,
          priority: taskForm.priority,
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
    } else {
      await createAgencyCrmLeadTask(
        organisationId,
        selectedLead.leadId,
        {
          assignedAgent,
          title: taskForm.title,
          description: taskForm.description,
          dueDate: taskForm.dueDate,
          status: 'Pending',
          priority: taskForm.priority,
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
    }
    resetTaskComposer()
    setError('')
    setMessage(editingTaskId ? 'Task updated.' : 'Follow-up task created.')
    void reloadRecords(organisationId)
  }

  async function handleTaskStatusToggle(task) {
    if (!organisationId || !task?.taskId) return
    const nextStatus = normalizeText(task?.status) === 'Completed' ? 'Pending' : 'Completed'
    await updateAgencyCrmLeadTask(
      organisationId,
      task.taskId,
      { status: nextStatus },
      {
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      },
    )
    void reloadRecords(organisationId)
  }

  function handleEditTask(task) {
    setEditingTaskId(normalizeText(task?.taskId))
    setTaskForm({
      title: normalizeText(task?.title),
      description: normalizeText(task?.description),
      dueDate: normalizeText(task?.dueDate).slice(0, 10),
      priority: normalizeText(task?.priority) || LEAD_DETAIL_DEFAULT_TASK.priority,
    })
    setError('')
  }

  async function handleDeleteTask(task) {
    if (!organisationId || !task?.taskId) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this follow-up task?')) {
      return
    }
    await deleteAgencyCrmLeadTask(organisationId, task.taskId, {
      actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
    })
    if (normalizeText(editingTaskId) === normalizeText(task.taskId)) {
      resetTaskComposer()
    }
    setError('')
    setMessage('Task deleted.')
    void reloadRecords(organisationId)
  }

  function handleAppointmentTypeChange(nextType) {
    const normalizedNextType = normalizeText(nextType)
    const template = getAppointmentTypeTemplate(normalizedNextType || 'other')
    setAppointmentForm((previous) => {
      const previousTemplate = getAppointmentTypeTemplate(previous?.appointmentType || 'other')
      const nextForm = buildDefaultAppointmentFormForType(normalizedNextType ? template.type : '', {
        ...previous,
        appointmentType: normalizedNextType ? template.type : '',
      })
      const keepCustomTitle = normalizeText(previous.title) && normalizeText(previous.title) !== normalizeText(previousTemplate.label)
      return {
        ...nextForm,
        title: keepCustomTitle ? previous.title : (normalizedNextType ? normalizeText(nextForm.title || template.label) : ''),
      }
    })
  }

  function handleAppointmentListingChange(nextListingId) {
    const listingId = normalizeText(nextListingId)
    const listing = listingId ? appointmentListingById.get(listingId) : null
    setAppointmentForm((previous) => ({
      ...previous,
      listingId,
      relatedEntityType: listingId && ['none', 'listing', ''].includes(normalizeText(previous.relatedEntityType)) ? 'listing' : previous.relatedEntityType,
      relatedEntityId: listingId && ['none', 'listing', ''].includes(normalizeText(previous.relatedEntityType)) ? listingId : previous.relatedEntityId,
      location: normalizeText(previous.location) || normalizeText(listing?.address || listing?.label) || previous.location,
    }))
  }

  function summarizeAppointmentInviteDelivery(created, requestedInvite, participants = []) {
    if (!requestedInvite) return 'Appointment added.'
    const participantRows = Array.isArray(participants) ? participants : []
    const hasRecipientEmail = participantRows.some((participant) => isValidEmail(participant?.email))
    if (!hasRecipientEmail) {
      return 'Appointment saved. Add a recipient email to send the appointment request.'
    }
    if (created?.notificationError) {
      return 'Appointment saved, but the appointment request email could not be sent.'
    }
    const emailRows = (Array.isArray(created?.notificationResults) ? created.notificationResults : [])
      .map((row) => row?.email)
      .filter(Boolean)
    if (emailRows.some((row) => row?.sent === true)) {
      return 'Appointment added. Email request sent.'
    }
    if (emailRows.some((row) => row?.status === 'failed')) {
      return 'Appointment saved, but the appointment request email could not be sent.'
    }
    if (emailRows.some((row) => row?.reason === 'missing_recipient_email')) {
      return 'Appointment saved. Add a recipient email to send the appointment request.'
    }
    return 'Appointment saved. No external appointment request email was sent.'
  }

  async function handleCreateAppointment(event) {
    event.preventDefault()
    if (!organisationId) return
    if (appointmentModalOpen && !appointmentCanSave) {
      setError('Resolve hard scheduling conflicts before saving this appointment.')
      return
    }
    if (!normalizeText(appointmentForm.appointmentType)) {
      setError('Select an appointment type before sending the request.')
      return
    }
    if (!normalizeText(appointmentForm.date) || (!appointmentForm.allDay && !normalizeText(appointmentForm.startTime))) {
      setError('Appointment date and start time are required unless this is an all-day appointment.')
      return
    }
    if (!appointmentForm.allDay && normalizeText(appointmentForm.endTime) && parseTimeToMinutes(appointmentForm.endTime) <= parseTimeToMinutes(appointmentForm.startTime)) {
      setError('Appointment end time must be after the start time.')
      return
    }
    const linkedLead = selectedLead || null
    const calendarTargetAgent = isCalendarMode && isPrincipal && normalizeText(calendarAgentFilter) && normalizeText(calendarAgentFilter) !== 'all'
      ? resolveAgentById(calendarAgentFilter)
      : currentAgent
    const assignedAgent = resolveAgentById(
      normalizeText(
        linkedLead?.assignedAgentId ||
        linkedLead?.assignedAgentEmail ||
        calendarTargetAgent?.id ||
        calendarTargetAgent?.email ||
        currentAgent.id,
      ),
    )
    const linkedLeadEmail = normalizeText(selectedLeadContact?.email || linkedLead?.email)
    const linkedLeadParticipantRole = normalizeText(linkedLead?.leadCategory).toLowerCase() === 'seller' ? 'Seller' : 'Buyer'
    const participantSeed = [...(appointmentForm.participants || [])]
    const explicitRecipientEmail = normalizeText(appointmentForm.recipientEmail).toLowerCase()
    if (explicitRecipientEmail && !isValidEmail(explicitRecipientEmail)) {
      setError('Enter a valid recipient email before sending the appointment request.')
      return
    }
    if (explicitRecipientEmail && !participantSeed.some((participant) => normalizeText(participant?.email).toLowerCase() === explicitRecipientEmail)) {
      participantSeed.push({
        name: normalizeText(selectedLeadContact?.firstName || selectedLeadContact?.lastName)
          ? [selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ').trim()
          : explicitRecipientEmail,
        email: explicitRecipientEmail,
        phone: normalizeText(selectedLeadContact?.phone || linkedLead?.phone),
        participantRole: linkedLeadParticipantRole || 'Client',
        isRequired: true,
        rsvpStatus: 'Pending',
      })
    }
    if (linkedLead && linkedLeadEmail && !participantSeed.some((participant) => normalizeText(participant?.email).toLowerCase() === linkedLeadEmail.toLowerCase())) {
      participantSeed.push({
        name: [selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ').trim() || linkedLead?.name || linkedLeadEmail,
        email: linkedLeadEmail,
        phone: normalizeText(selectedLeadContact?.phone || linkedLead?.phone),
        participantRole: linkedLeadParticipantRole,
        isRequired: true,
        rsvpStatus: 'Pending',
      })
    }
    const appointmentPayload = applyAppointmentTemplate(appointmentForm.appointmentType, {
      title: normalizeText(appointmentForm.title) || getAppointmentTypeLabel(appointmentForm.appointmentType),
      appointmentType: appointmentForm.appointmentType,
      customTypeLabel: normalizeText(appointmentForm.customTypeLabel),
      date: appointmentForm.date,
      startTime: appointmentForm.startTime,
      endTime: appointmentForm.endTime,
      timezone: appointmentForm.timezone || 'Africa/Johannesburg',
      allDay: appointmentForm.allDay === true,
      locationType: appointmentForm.locationType,
      location: appointmentForm.location,
      meetingUrl: appointmentForm.meetingUrl,
      status: appointmentForm.status || 'requested',
      leadId: normalizeText(linkedLead?.leadId) || null,
      contactId: normalizeText(appointmentForm.contactId || linkedLead?.contactId) || null,
      listingId: normalizeText(appointmentForm.listingId) || null,
      listingLabel: resolveAppointmentListingLabel(appointmentForm.listingId),
      transactionId: normalizeText(appointmentForm.transactionId) || null,
      relatedEntityType: normalizeText(appointmentForm.relatedEntityType) || (linkedLead ? 'lead' : 'none'),
      relatedEntityId: normalizeText(appointmentForm.relatedEntityId || linkedLead?.leadId) || null,
      resourceId: normalizeText(appointmentForm.resourceId) || null,
      allowOutsideBusinessHours: isPrincipal && appointmentForm.allowOutsideBusinessHours === true,
      schedulingOverrideReason: isPrincipal ? normalizeText(appointmentForm.schedulingOverrideReason) || null : null,
      notes: appointmentForm.notes,
      participants: participantSeed,
      assignedAgent,
      visibility: normalizeText(appointmentForm.visibility) || undefined,
      linkedWorkflow: normalizeText(appointmentForm.linkedWorkflow) || undefined,
      linkedWorkflowStage: normalizeText(appointmentForm.linkedWorkflowStage) || undefined,
      completionBehavior: normalizeText(appointmentForm.completionBehavior) || undefined,
      instructions: normalizeText(appointmentForm.instructions) || undefined,
      internalInstructions: normalizeText(appointmentForm.internalInstructions) || undefined,
      requiredDocuments: Array.isArray(appointmentForm.requiredDocuments) ? appointmentForm.requiredDocuments : undefined,
      reminderRules: Array.isArray(appointmentForm.reminderRules) ? appointmentForm.reminderRules : undefined,
      workflowCompletionEffect: appointmentForm.workflowCompletionEffect && typeof appointmentForm.workflowCompletionEffect === 'object'
        ? appointmentForm.workflowCompletionEffect
        : undefined,
      sendInviteEmails: appointmentForm.sendInviteEmails !== false,
      attachCalendarInvite: appointmentForm.attachCalendarInvite !== false,
      notifyCreatorOnRsvp: appointmentForm.notifyCreatorOnRsvp !== false,
    })
    try {
      const created = await createAppointmentAsync(
        organisationId,
        appointmentPayload,
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      setAppointmentForm(buildDefaultAppointmentFormForType('', {
        ...LEAD_DETAIL_DEFAULT_APPOINTMENT,
        date: getTomorrowIsoDate(),
        startTime: getCurrentTimeValue(),
        timezone: 'Africa/Johannesburg',
      }))
      setAppointmentSchedulingIntegrity(created?.schedulingIntegrity || null)
      setAppointmentSchedulingError('')
      setError('')
      setMessage(summarizeAppointmentInviteDelivery(created, appointmentPayload.sendInviteEmails !== false, participantSeed))
      setAppointmentModalOpen(false)
      if (created?.appointmentId) {
        setSelectedAppointmentId(created.appointmentId)
      }
      if (linkedLead && normalizeText(linkedLead.leadCategory).toLowerCase() === 'seller') {
        await updateAgencyCrmLeadRecord(organisationId, linkedLead.leadId, {
          stage: 'Appointment Scheduled',
          status: 'Appointment Requested',
        })
      }
      await reloadRecords(organisationId)
    } catch (createError) {
      if (createError?.code === 'APPOINTMENT_HARD_CONFLICT') {
        setAppointmentSchedulingIntegrity(createError?.schedulingConflicts || null)
      }
      setError(createError?.message || 'Unable to create appointment right now.')
    }
  }

  function handleAddParticipantToDraft() {
    if (!normalizeText(appointmentForm.participantDraft?.name) && !normalizeText(appointmentForm.participantDraft?.email)) {
      setError('Participant name or email is required.')
      return
    }
    setAppointmentForm((previous) => ({
      ...previous,
      participants: [
        ...(previous.participants || []),
        {
          name: normalizeText(previous.participantDraft?.name),
          email: normalizeText(previous.participantDraft?.email),
          phone: normalizeText(previous.participantDraft?.phone),
          participantRole: previous.participantDraft?.participantRole || 'Other Contact',
          isRequired: previous.participantDraft?.isRequired !== false,
          rsvpStatus: previous.participantDraft?.rsvpStatus || 'Pending',
        },
      ],
      participantDraft: {
        name: '',
        email: '',
        phone: '',
        participantRole: 'Buyer',
        isRequired: true,
        rsvpStatus: 'Pending',
      },
    }))
    setError('')
  }

  function handleRemoveParticipantFromDraft(index) {
    setAppointmentForm((previous) => ({
      ...previous,
      participants: (previous.participants || []).filter((_item, itemIndex) => itemIndex !== index),
    }))
  }

  function handleOpenAppointmentModal(appointment = null) {
    if (appointment) {
      setAppointmentForm(buildDefaultAppointmentFormForType(appointment.appointmentType || 'viewing', {
        appointmentType: appointment.appointmentType || 'viewing',
        customTypeLabel: appointment.customTypeLabel || '',
        title: appointment.title || appointment.appointmentType || '',
        date: appointment.date || (appointment.dateTime ? String(appointment.dateTime).slice(0, 10) : ''),
        startTime: appointment.startTime || (appointment.dateTime ? String(appointment.dateTime).slice(11, 16) : ''),
        endTime: appointment.endTime || '',
        timezone: appointment.timezone || 'Africa/Johannesburg',
        allDay: appointment.allDay === true,
        locationType: appointment.locationType || 'physical_address',
        location: appointment.location || '',
        meetingUrl: appointment.meetingUrl || '',
        relatedEntityType: appointment.relatedEntityType || (appointment.leadId ? 'lead' : appointment.transactionId ? 'transaction' : 'none'),
        relatedEntityId: appointment.relatedEntityId || appointment.leadId || appointment.transactionId || '',
        visibility: appointment.visibility || '',
        linkedWorkflow: appointment.linkedWorkflow || '',
        linkedWorkflowStage: appointment.linkedWorkflowStage || '',
        completionBehavior: appointment.completionBehavior || '',
        instructions: appointment.instructions || '',
        internalInstructions: appointment.internalInstructions || '',
        requiredDocuments: Array.isArray(appointment.requiredDocuments) ? appointment.requiredDocuments : [],
        reminderRules: Array.isArray(appointment.reminderRules) ? appointment.reminderRules : [],
        workflowCompletionEffect:
          appointment.workflowCompletionEffect && typeof appointment.workflowCompletionEffect === 'object'
            ? appointment.workflowCompletionEffect
            : {},
        status: appointment.status || 'requested',
        listingId: appointment.listingId || '',
        transactionId: appointment.transactionId || '',
        contactId: appointment.contactId || '',
        resourceId: appointment.resourceId || '',
        allowOutsideBusinessHours: appointment.allowOutsideBusinessHours === true,
        schedulingOverrideReason: appointment.schedulingOverrideReason || '',
        notes: appointment.notes || '',
        recipientEmail: (Array.isArray(appointment.participants)
          ? appointment.participants.find((row) => normalizeText(row?.participantRole).toLowerCase() !== 'agent' && normalizeText(row?.email))?.email
          : '') || '',
        sendInviteEmails: true,
        attachCalendarInvite: true,
        notifyCreatorOnRsvp: true,
        participants: Array.isArray(appointment.participants)
          ? appointment.participants.map((row) => ({
              name: row.name || '',
              email: row.email || '',
              phone: row.phone || '',
              participantRole: row.participantRole || 'Other Contact',
              isRequired: row.isRequired !== false,
              rsvpStatus: row.rsvpStatus || 'Pending',
              participantId: row.participantId || '',
              rsvpToken: row.rsvpToken || '',
            }))
          : [],
        participantDraft: {
          name: '',
          email: '',
          phone: '',
          participantRole: 'Buyer',
          isRequired: true,
          rsvpStatus: 'Pending',
        },
      }))
      setSelectedAppointmentId(appointment.appointmentId)
      setAppointmentOutcomeForm({
        outcomeSummary: appointment.outcomeSummary || '',
        clientFeedback: appointment.clientFeedback || '',
        agentNotes: appointment.agentNotes || '',
        nextStep: appointment.nextStep || '',
        followUpDate: appointment.followUpDate || '',
      })
      setAppointmentSchedulingIntegrity(appointment?.schedulingIntegrity || null)
    } else {
      setSelectedAppointmentId('')
      setAppointmentForm(buildDefaultAppointmentFormForType('', {
        ...LEAD_DETAIL_DEFAULT_APPOINTMENT,
        date: getTomorrowIsoDate(),
        startTime: getCurrentTimeValue(),
        contactId: normalizeText(selectedLead?.contactId) || '',
        listingId: normalizeText(selectedLead?.listingId) || '',
        relatedEntityType: selectedLead ? 'lead' : 'none',
        relatedEntityId: normalizeText(selectedLead?.leadId) || '',
        recipientEmail: normalizeText(selectedLeadContact?.email || selectedLead?.email) || '',
      }))
      setAppointmentOutcomeForm({
        outcomeSummary: '',
        clientFeedback: '',
        agentNotes: '',
        nextStep: '',
        followUpDate: '',
      })
      setAppointmentSchedulingIntegrity(null)
    }
    setAppointmentSchedulingError('')
    setError('')
    setAppointmentModalOpen(true)
  }

  function handleScheduleSellerAppointment() {
    if (!selectedLead) return
    setAppointmentForm((previous) => buildDefaultAppointmentFormForType('seller_consultation', {
      ...previous,
      appointmentType: 'seller_consultation',
      date: previous.date || getTomorrowIsoDate(),
      startTime: previous.startTime || getCurrentTimeValue(),
      contactId: normalizeText(selectedLead?.contactId) || '',
    }))
    setAppointmentSchedulingIntegrity(null)
    setAppointmentSchedulingError('')
    setError('')
    setAppointmentModalOpen(true)
  }

  async function handleSendSellerOnboarding() {
    if (!selectedLead) return
    if (isSellerOnboardingSending) return
    if (!organisationId) {
      setError('Organisation membership is not active yet. Reload and ensure this principal account is linked to an organisation.')
      return
    }
    if (!selectedLeadIsSeller) return

    const sellerName = [selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ').trim() || 'Seller'
    const sellerEmail = normalizeText(selectedLeadContact?.email)
    if (!isValidEmail(sellerEmail)) {
      setError('Seller email is required to send onboarding.')
      return
    }

    setIsSellerOnboardingSending(true)
    setMessage('Preparing seller onboarding…')
    try {
      const useDbFirstListingPersistence = Boolean(isSupabaseConfigured && !MOCK_DATA_ENABLED)
      let token = normalizeText(selectedLead?.sellerOnboardingToken) || generateSellerOnboardingToken()
      let onboardingLink = buildSellerOnboardingLink(token)
      let sellerWorkflowLead = null
      let canonicalListingId = normalizeText(selectedLead?.listingId)

      if (useDbFirstListingPersistence) {
        if (!canonicalListingId) {
          const created = await createPrivateListing({
            organisationId,
            assignedAgentId: normalizeText(selectedLead?.assignedAgentId || currentAgent.id),
            sellerLeadId: normalizeLeadIdentityKey(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId),
            originatingCrmLeadId: normalizeLeadIdentityKey(selectedLead?.leadId),
            listingStatus: 'seller_lead',
            sellerOnboardingStatus: 'not_started',
            mandateStatus: 'not_started',
            listingVisibility: 'internal',
            title: normalizeText(selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress),
            propertyType: normalizeText(selectedLeadPropertyType) || 'House',
            listingCategory: 'private_sale',
            askingPrice: Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0,
            estimatedValue: Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0,
            addressLine1: normalizeText(selectedLead?.sellerPropertyAddress || selectedLeadPropertyArea),
            suburb: normalizeText(selectedLead?.areaInterest),
            city: '',
            province: '',
            description: normalizeText(selectedLead?.notes),
            source: 'pipeline_seller_lead',
          }, {
            includeRequirementsAndDocuments: false,
            syncRequirements: false,
          })
          canonicalListingId = normalizeText(created?.listing?.id)
        }

        if (canonicalListingId) {
          const onboarding = await sendSellerOnboarding(canonicalListingId, {
            sellerContactEmail: sellerEmail,
            sellerContactPhone: normalizeText(selectedLeadContact?.phone),
          })
          token = normalizeText(onboarding?.token) || token
          onboardingLink = normalizeText(onboarding?.link) || onboardingLink
        }
      } else {
        sellerWorkflowLead = createAgentSellerLead({
          sellerLeadId: normalizeLeadIdentityKey(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId),
          sellerName: normalizeText(selectedLeadContact?.firstName),
          sellerSurname: normalizeText(selectedLeadContact?.lastName),
          sellerEmail,
          sellerPhone: normalizeText(selectedLeadContact?.phone),
          propertyAddress: normalizeText(selectedLeadPropertyArea || selectedLead?.sellerPropertyAddress),
          propertyType: normalizeText(selectedLeadPropertyType) || 'House',
          estimatedPrice: Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0,
          listingTitle: normalizeText(selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress),
          suburb: normalizeText(selectedLead?.areaInterest),
          assignedAgentName: normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName),
          assignedAgentEmail: normalizeText(selectedLead?.assignedAgentEmail || currentAgent.email),
          leadSource: normalizeText(selectedLead?.leadSource) || 'Other',
          stage: 'onboarding_sent',
          listingStatus: LISTING_STATUS.SELLER_ONBOARDING_SENT,
          onboardingStatus: SELLER_ONBOARDING_STATUS.NOT_STARTED,
          sellerOnboarding: {
            token,
            link: onboardingLink,
            status: SELLER_ONBOARDING_STATUS.NOT_STARTED,
          },
          notes: normalizeText(selectedLead?.notes),
        })
      }

      await updateAgencyCrmLeadRecord(organisationId, selectedLead.leadId, {
        stage: 'Onboarding Sent',
        status: 'Onboarding Sent',
        sellerOnboardingToken: token,
        sellerOnboardingLink: onboardingLink,
        sellerOnboardingStatus: 'sent',
        sellerWorkflowLeadId: normalizeText(sellerWorkflowLead?.sellerLeadId || sellerWorkflowLead?.id || selectedLead.leadId),
        listingId: canonicalListingId || normalizeText(selectedLead?.listingId),
      })
      await createAgencyCrmLeadActivity(organisationId, selectedLead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Seller Onboarding Sent',
        activityNote: `Seller onboarding was sent to ${sellerName}.`,
        outcome: 'Onboarding link sent',
        activityDate: new Date().toISOString(),
      }, { actor: currentAgent })

      if (isSupabaseConfigured) {
        try {
          const onboardingEmailPayload = {
            type: 'seller_onboarding_link',
            to: sellerEmail,
            organisationId: normalizeText(organisationId),
            sellerName,
            propertyTitle: normalizeText(selectedLead?.propertyInterest || selectedLeadPropertyArea || 'your property'),
            onboardingLink,
            agentName: normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName || currentAgent.email),
          }
          void invokeEdgeFunction('send-email', {
            body: {
              ...onboardingEmailPayload,
            },
          })
            .then(({ data: emailResult, error: emailError }) => {
              if (emailError) {
                console.error('[Seller Onboarding] email send failed', {
                  leadId: selectedLead?.leadId || null,
                  listingId: canonicalListingId || null,
                  error: emailError,
                })
                return
              }
              const routedType = normalizeText(emailResult?.type).toLowerCase()
              if (routedType && !['seller_onboarding', 'seller_onboarding_link'].includes(routedType)) {
                console.error('[Seller Onboarding] unexpected email template route', {
                  leadId: selectedLead?.leadId || null,
                  listingId: canonicalListingId || null,
                  responseType: routedType,
                })
              }
            })
            .catch((emailError) => {
              console.error('[Seller Onboarding] email send failed', {
                leadId: selectedLead?.leadId || null,
                listingId: canonicalListingId || null,
                error: emailError,
              })
            })
        } catch {
          // Onboarding record is created even if email send fails.
        }
      }

      setError('')
      setMessage('Seller onboarding sent.')
      await reloadRecords(organisationId)
    } catch (sendError) {
      setError(sendError?.message || 'Unable to send seller onboarding right now.')
      return
    } finally {
      setIsSellerOnboardingSending(false)
    }
  }

  async function handleGenerateMandateFromSellerLead({ onProgress } = {}) {
    if (!selectedLead || !organisationId) {
      throw new Error('Select a seller lead with an active organisation before generating a mandate.')
    }
    if (!selectedLeadIsSeller) {
      throw new Error('Mandates can only be generated for seller leads.')
    }
    setIsMandateGenerating(true)
    onProgress?.('Preparing template…')
    try {
      const packetTitle = `Mandate - ${[selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ') || 'Seller'}`
      const templates = await listPacketTemplates({ packetType: 'mandate', moduleType: 'agency', includeInactive: false, limit: 1 })
      const template = Array.isArray(templates) ? templates[0] : null
      const dbLeadId = normalizeLeadUuid(selectedLead.leadId)
      const mandatePacketId = normalizeText(selectedLead?.mandatePacketId)
      const onboardingToken = normalizeText(selectedLead?.sellerOnboardingToken || selectedLead?.sellerOnboarding?.token)
      let hydratedLead = selectedLead
      let hydratedPrivateListing = null
      const hasLeadFormData = Boolean(
        selectedLead?.sellerOnboarding?.formData && typeof selectedLead.sellerOnboarding.formData === 'object',
      )
      const shouldFetchOnboardingContext = isSupabaseConfigured && onboardingToken && (!selectedLeadOnboardingCompleted || !hasLeadFormData)
      if (shouldFetchOnboardingContext) {
        onProgress?.('Checking seller onboarding…')
        try {
          const onboardingContext = await getSellerOnboardingByToken(onboardingToken, { includeRequirementsAndDocuments: false })
          const hydratedOnboarding = onboardingContext?.listing?.sellerOnboarding || null
          hydratedPrivateListing = onboardingContext?.listing || null
          if (hydratedOnboarding?.formData) {
            hydratedLead = {
              ...selectedLead,
              listingId: normalizeText(onboardingContext?.listing?.id || selectedLead?.listingId),
              sellerOnboardingStatus: normalizeText(hydratedOnboarding.status || selectedLead?.sellerOnboardingStatus),
              sellerOnboarding: {
                ...(selectedLead?.sellerOnboarding || {}),
                ...hydratedOnboarding,
                formData: hydratedOnboarding.formData || {},
              },
            }
          }
        } catch (onboardingLookupError) {
          console.warn('[MANDATE] seller onboarding lookup failed before generation', onboardingLookupError)
        }
      }
      const leadForMapping = {
        ...hydratedLead,
        name: [selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ').trim(),
        sellerName: normalizeText(selectedLeadContact?.firstName),
        sellerSurname: normalizeText(selectedLeadContact?.lastName),
        sellerEmail: normalizeText(selectedLeadContact?.email),
        sellerPhone: normalizeText(selectedLeadContact?.phone),
        propertyAddress: normalizeText(hydratedLead?.sellerPropertyAddress || selectedLeadPropertyArea),
        propertyType: normalizeText(selectedLeadPropertyType) || 'House',
        listingTitle: normalizeText(hydratedLead?.propertyInterest || hydratedLead?.sellerPropertyAddress || selectedLeadPropertyArea),
        askingPrice: Number(hydratedLead?.estimatedValue || hydratedLead?.budget || 0) || 0,
        assignedAgentName: normalizeText(hydratedLead?.assignedAgentName || currentAgent.fullName),
        assignedAgentEmail: normalizeText(hydratedLead?.assignedAgentEmail || currentAgent.email),
      }
      const mandateData = mapSellerOnboardingToMandateData(
        {
          onboardingSubmission: {
            ...((leadForMapping?.sellerOnboarding?.formData && typeof leadForMapping.sellerOnboarding.formData === 'object')
              ? leadForMapping.sellerOnboarding.formData
              : {}),
            status: normalizeText(leadForMapping?.sellerOnboardingStatus || leadForMapping?.sellerOnboarding?.status),
            askingPrice: Number(hydratedLead?.estimatedValue || hydratedLead?.budget || leadForMapping?.sellerOnboarding?.formData?.askingPrice || 0) || '',
            mandateType: 'sole',
          },
          lead: leadForMapping,
          privateListing: hydratedPrivateListing || {},
          agency: {
            name: normalizeText(organisationName || profile?.companyName || profile?.company || profile?.organisationName),
            legalName: normalizeText(organisationName || profile?.companyName || profile?.company || profile?.organisationName),
            organisationName: normalizeText(organisationName || profile?.companyName || profile?.company || profile?.organisationName),
          },
          organisation: {
            id: organisationId,
            name: normalizeText(organisationName || profile?.companyName || profile?.company || profile?.organisationName),
            displayName: normalizeText(organisationName || profile?.companyName || profile?.company || profile?.organisationName),
          },
          agent: currentAgent,
          contact: selectedLeadContact || {},
          transaction: {},
        },
      )
      const mandatePreflight = validateMandateGenerationData(mandateData, { action: 'generate' })
      if (!mandatePreflight.canProceed) {
        console.warn('[MANDATE] generation preflight found missing data; continuing with mandate generation.', {
          leadId: selectedLead?.leadId || null,
          missingRequiredFields: mandatePreflight.missingRequiredFields,
          warnings: mandatePreflight.warnings,
        })
      }

      const loadExistingPacket = async () => {
        if (mandatePacketId && isUuidLike(mandatePacketId)) {
          try {
            const packet = await fetchDocumentPacket(mandatePacketId, { includeVersions: false, includeEvents: false })
            if (documentPacketBelongsToLead(packet, selectedLead.leadId)) return packet
            console.warn('[MANDATE] existing packet ignored because it belongs to another lead', {
              packetId: mandatePacketId,
              routeLeadId: selectedLead.leadId,
              packetLeadId: packet?.lead_id || null,
            })
          } catch (fetchError) {
            console.warn('[MANDATE] existing packet lookup by ID failed before generation', {
              packetId: mandatePacketId,
              error: fetchError,
            })
          }
        }

        if (!dbLeadId) return null
        try {
          const existingPackets = await listDocumentPackets({
            organisationId,
            packetType: 'mandate',
            leadId: dbLeadId,
            limit: 1,
          })
          return Array.isArray(existingPackets) ? existingPackets[0] || null : null
        } catch (listError) {
          if (!['PACKETS_SCHEMA_MISSING', 'PACKETS_RLS_DENIED'].includes(listError?.code)) {
            throw listError
          }
        }
        return null
      }

      const existingPacket = await loadExistingPacket()
      if (['sent', 'partially_signed', 'signed', 'archived'].includes(normalizeText(existingPacket?.status).toLowerCase())) {
        const blocker = 'This mandate is already sent or signed. Open the current packet instead of generating a new draft.'
        setError(blocker)
        throw new Error(blocker)
      }

      let packet = existingPacket
      let fallbackPacketId = ''
      try {
        const scopedAssignedAgentId = isUuidLike(currentAgent.id) ? currentAgent.id : ''
        if (!packet?.id) {
          packet = await createDocumentPacket({
            organisationId,
            packetType: 'mandate',
            title: packetTitle,
            leadId: dbLeadId || null,
            // Always anchor packet ownership to the signed-in user for this flow.
            // This avoids stale historical assignment ids tripping stricter RLS checks.
            assignedAgentId: scopedAssignedAgentId || null,
            status: 'ready_for_generation',
            templateId: normalizeText(template?.id || ''),
            templateKeySnapshot: normalizeText(template?.key || template?.template_key || ''),
            templateLabelSnapshot: normalizeText(template?.label || template?.name || 'Mandate'),
            sourceContextJson: {
              leadId: dbLeadId || null,
              uiLeadId: normalizeText(selectedLead.leadId) || null,
              leadCategory: selectedLead.leadCategory,
              leadSource: selectedLead.leadSource,
              contactId: selectedLead.contactId,
              generatedDataSnapshot: mandateData,
              missingFieldsSnapshot: mandatePreflight.missingRequiredFields,
              warningsSnapshot: mandatePreflight.warnings,
              sourceContext: mandateData.sourceContext,
            },
          })
        }
      } catch (packetError) {
        if (!['PACKETS_SCHEMA_MISSING', 'PACKETS_RLS_DENIED'].includes(packetError?.code)) {
          throw packetError
        }
        fallbackPacketId = `local-mandate-${Date.now()}`
      }

      if (packet?.id) {
        onProgress?.('Merging seller and property details…')
        try {
          onProgress?.('Generating mandate PDF…')
          await generatePacketVersion({
            packetId: packet.id,
            packetType: 'mandate',
            template,
            allowWarnings: true,
            forceGenerate: false,
            context: {
              organisationId,
              generatedByRole: 'agent',
              generatedByUserId: normalizeText(currentAgent.id),
              generatedByName: normalizeText(currentAgent.fullName),
              generatedByUserEmail: normalizeText(currentAgent.email),
              agentEmail: normalizeText(selectedLead?.assignedAgentEmail || currentAgent.email),
              mandateData,
              mandateValidation: mandatePreflight,
              sourceContext: mandateData.sourceContext,
              privateListing: hydratedPrivateListing || null,
              contact: selectedLeadContact || null,
              organisation: {
                id: organisationId,
                name: normalizeText(organisationName || profile?.companyName || profile?.company || profile?.organisationName),
                displayName: normalizeText(organisationName || profile?.companyName || profile?.company || profile?.organisationName),
              },
              lead: {
                id: normalizeLeadUuid(selectedLead.leadId) || null,
                lead_id: normalizeLeadUuid(selectedLead.leadId) || null,
                ...leadForMapping,
              },
              agency: mandateData.agency,
              agent: mandateData.agent,
              generatedDataSnapshot: mandateData,
              mandateDraft: {
                ...mandateData.mandate,
                mandateType: mandateData.mandate.type,
                askingPrice: mandateData.mandate.askingPrice,
                commissionStructure: mandateData.mandate.commissionStructure,
                commissionPercent: mandateData.mandate.commissionPercent,
                commissionAmount: mandateData.mandate.commissionAmount,
                mandateStartDate: mandateData.mandate.startDate,
                mandateEndDate: mandateData.mandate.endDate,
              },
            },
          })
          onProgress?.('Preparing preview…')
        } catch (generationError) {
          const details = normalizeText(generationError?.message || String(generationError))
          const blocker = new Error(
            details || 'Mandate packet was created, but version generation failed. Confirm packet table permissions and template setup, then retry.',
          )
          blocker.code = generationError?.code || 'MANDATE_PACKET_VERSION_FAILED'
          blocker.packetId = packet.id
          throw blocker
        }
      }

      await updateAgencyCrmLeadRecord(organisationId, selectedLead.leadId, {
        stage: 'Mandate Generated',
        status: 'Mandate Generated',
        mandatePacketId: normalizeText(packet?.id) || fallbackPacketId,
      })
      await createAgencyCrmLeadActivity(organisationId, selectedLead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Mandate Generated',
        activityNote: 'Mandate was generated successfully.',
        outcome: normalizeText(packet?.id) ? 'Mandate packet created' : 'Generated in fallback mode',
      }, { actor: currentAgent })
      setError('')
      setMessage(
        normalizeText(packet?.id)
          ? 'Mandate packet generated for this seller lead.'
          : 'Mandate generated. Packet tracking is running in fallback mode until packet schema/permissions are fully enabled.',
      )
      onProgress?.('Draft ready.')
      void reloadRecords(organisationId).catch((reloadError) => {
        console.warn('[MANDATE] post-generation lead refresh failed; keeping generated packet available in workspace.', reloadError)
      })
      return true
    } catch (mandateError) {
      if (selectedLead?.leadId && mandateError?.code !== 'MANDATE_PREFLIGHT_BLOCKED') {
        await createAgencyCrmLeadActivity(organisationId, selectedLead.leadId, {
          agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
          activityType: 'Note',
          activityNote: 'Mandate generation failed. Review the missing information and try again.',
          outcome: normalizeText(mandateError?.code || 'Failed'),
        }, { actor: currentAgent })
      }
      setError(mandateError?.message || 'Unable to generate mandate from this lead right now.')
      throw mandateError
    } finally {
      setIsMandateGenerating(false)
    }
  }

  async function handleCreateListingFromSellerLead() {
    if (!selectedLead) return
    if (!organisationId) {
      setError('Organisation membership is not active yet. Reload and ensure this principal account is linked to an organisation.')
      return
    }
    if (!selectedLeadIsSeller) return

    const stageKey = normalizeText(selectedLead?.stage).toLowerCase()
    const hasMandateSigned = stageKey.includes('mandate signed')
    const useDbFirstListingPersistence = Boolean(isSupabaseConfigured && !MOCK_DATA_ENABLED)
    let createdListingId = ''

    if (useDbFirstListingPersistence) {
      const created = await createPrivateListing({
        organisationId,
        assignedAgentId: normalizeText(selectedLead?.assignedAgentId || currentAgent.id),
        sellerLeadId: normalizeLeadIdentityKey(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId),
        originatingCrmLeadId: normalizeLeadIdentityKey(selectedLead?.leadId),
        listingStatus: hasMandateSigned ? 'mandate_signed' : 'seller_lead',
        sellerOnboardingStatus:
          normalizeText(selectedLead?.sellerOnboardingStatus || '').toLowerCase() === 'completed'
            ? 'completed'
            : 'not_started',
        mandateStatus: hasMandateSigned ? 'signed' : 'not_started',
        listingVisibility: 'internal',
        title: normalizeText(selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress),
        propertyType: normalizeText(selectedLeadPropertyType) || 'House',
        listingCategory: 'private_sale',
        askingPrice: Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0,
        estimatedValue: Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0,
        addressLine1: normalizeText(selectedLead?.sellerPropertyAddress || selectedLeadPropertyArea),
        suburb: normalizeText(selectedLead?.areaInterest),
        city: '',
        province: '',
        source: 'pipeline_seller_conversion',
      })
      createdListingId = normalizeText(created?.listing?.id)
      if (!createdListingId) {
        setError('Unable to create canonical listing from this seller lead.')
        return
      }

      await createPrivateListingActivity({
        privateListingId: createdListingId,
        activityType: 'listing_updated',
        activityTitle: 'Listing linked from seller lead',
        activityDescription: 'Seller lead converted to canonical private listing intake.',
        performedBy: normalizeText(currentAgent.id),
        visibility: 'internal',
        metadata: {
          leadId: normalizeText(selectedLead?.leadId),
          conversionType: 'pipeline_seller_conversion',
        },
      }).catch(() => {})
    } else {
      const listingDraft = createListingDraftFromSellerLead(
        {
          sellerLeadId: normalizeLeadIdentityKey(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId),
          id: normalizeLeadIdentityKey(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId),
          sellerName: normalizeText(selectedLeadContact?.firstName),
          sellerSurname: normalizeText(selectedLeadContact?.lastName),
          sellerEmail: normalizeText(selectedLeadContact?.email),
          sellerPhone: normalizeText(selectedLeadContact?.phone),
          propertyAddress: normalizeText(selectedLead?.sellerPropertyAddress || selectedLeadPropertyArea),
          propertyType: normalizeText(selectedLeadPropertyType) || 'House',
          estimatedPrice: Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0,
          listingTitle: normalizeText(selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress),
          suburb: normalizeText(selectedLead?.areaInterest),
          assignedAgentName: normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName),
          assignedAgentEmail: normalizeText(selectedLead?.assignedAgentEmail || currentAgent.email),
          leadSource: normalizeText(selectedLead?.leadSource || 'Other'),
          sellerOnboarding: {
            token: normalizeText(selectedLead?.sellerOnboardingToken),
            link: normalizeText(selectedLead?.sellerOnboardingLink),
            status: normalizeText(selectedLead?.sellerOnboardingStatus || '').toLowerCase() === 'completed'
              ? SELLER_ONBOARDING_STATUS.COMPLETED
              : SELLER_ONBOARDING_STATUS.NOT_STARTED,
            formData: {
              propertyAddress: normalizeText(selectedLead?.sellerPropertyAddress || selectedLeadPropertyArea),
              propertyType: normalizeText(selectedLeadPropertyType),
              askingPrice: Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0,
            },
          },
          mandate: {
            status: hasMandateSigned ? 'signed' : 'draft',
            signedAt: hasMandateSigned ? new Date().toISOString() : null,
          },
        },
        {
          stage: hasMandateSigned ? LISTING_STATUS.MANDATE_SIGNED : LISTING_STATUS.SELLER_ONBOARDING_COMPLETED,
        },
      )

      if (!listingDraft?.id) {
        setError('Unable to create listing draft from this seller lead.')
        return
      }
      createdListingId = normalizeText(listingDraft.id)
      updateAgentSellerLead(normalizeText(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId), (row) => ({
        ...row,
        listingDraftId: listingDraft.id,
        listingStatus: hasMandateSigned ? LISTING_STATUS.MANDATE_SIGNED : LISTING_STATUS.SELLER_ONBOARDING_COMPLETED,
      }))
    }

    await updateAgencyCrmLeadRecord(organisationId, selectedLead.leadId, {
      stage: 'Converted To Listing',
      status: 'Converted To Listing',
      listingId: createdListingId,
    })
    await createAgencyCrmLeadActivity(organisationId, selectedLead.leadId, {
      agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      activityType: 'Listing Created',
      activityNote: hasMandateSigned ? 'listing_created_after_mandate' : 'listing_created_before_mandate',
      outcome: hasMandateSigned ? 'Mandate signed' : 'Manual override',
    }, { actor: currentAgent })

    setError('')
    setMessage(
      useDbFirstListingPersistence
        ? 'Canonical private listing created and linked to this seller lead.'
        : hasMandateSigned
          ? 'Listing handoff created from signed mandate.'
          : 'Listing draft created. Mandate signature still outstanding (workflow warning).',
    )
    await reloadRecords(organisationId)
  }

  function handleCalendarShift(direction) {
    setCalendarCursorDate((previous) => {
      const next = new Date(previous)
      if (calendarView === 'month') {
        next.setMonth(previous.getMonth() + direction)
      } else if (calendarView === 'three_day') {
        next.setDate(previous.getDate() + 3 * direction)
      } else if (calendarView === 'day') {
        next.setDate(previous.getDate() + direction)
      } else {
        next.setDate(previous.getDate() + 7 * direction)
      }
      return next
    })
  }

  function handleCalendarGoToday() {
    setCalendarCursorDate(new Date())
  }

  async function handleSaveAppointmentDetail(event) {
    event.preventDefault()
    if (!organisationId) return
    if (!appointmentCanSave) {
      setError('Resolve hard scheduling conflicts before saving this appointment.')
      return
    }
    if (!selectedAppointmentId) {
      await handleCreateAppointment(event)
      return
    }
    if (!normalizeText(appointmentForm.date) || (!appointmentForm.allDay && !normalizeText(appointmentForm.startTime))) {
      setError('Appointment date and start time are required unless this is an all-day appointment.')
      return
    }
    if (!appointmentForm.allDay && normalizeText(appointmentForm.endTime) && parseTimeToMinutes(appointmentForm.endTime) <= parseTimeToMinutes(appointmentForm.startTime)) {
      setError('Appointment end time must be after the start time.')
      return
    }
    const updateParticipants = [...(appointmentForm.participants || [])]
    const explicitRecipientEmail = normalizeText(appointmentForm.recipientEmail).toLowerCase()
    if (explicitRecipientEmail && !isValidEmail(explicitRecipientEmail)) {
      setError('Enter a valid recipient email before sending the appointment request.')
      return
    }
    if (explicitRecipientEmail && !updateParticipants.some((participant) => normalizeText(participant?.email).toLowerCase() === explicitRecipientEmail)) {
      updateParticipants.push({
        name: explicitRecipientEmail,
        email: explicitRecipientEmail,
        phone: '',
        participantRole: 'Client',
        isRequired: true,
        rsvpStatus: 'Pending',
      })
    }
    try {
      const updatePayload = applyAppointmentTemplate(appointmentForm.appointmentType, {
        title: normalizeText(appointmentForm.title) || getAppointmentTypeLabel(appointmentForm.appointmentType),
        appointmentType: appointmentForm.appointmentType,
        customTypeLabel: normalizeText(appointmentForm.customTypeLabel),
        date: appointmentForm.date,
        startTime: appointmentForm.startTime,
        endTime: appointmentForm.endTime,
        timezone: appointmentForm.timezone || 'Africa/Johannesburg',
        allDay: appointmentForm.allDay === true,
        locationType: appointmentForm.locationType,
        location: appointmentForm.location,
        meetingUrl: appointmentForm.meetingUrl,
        status: appointmentForm.status,
        listingId: normalizeText(appointmentForm.listingId) || null,
        listingLabel: resolveAppointmentListingLabel(appointmentForm.listingId),
        transactionId: normalizeText(appointmentForm.transactionId) || null,
        relatedEntityType: normalizeText(appointmentForm.relatedEntityType) || null,
        relatedEntityId: normalizeText(appointmentForm.relatedEntityId) || null,
        contactId: normalizeText(appointmentForm.contactId) || null,
        resourceId: normalizeText(appointmentForm.resourceId) || null,
        allowOutsideBusinessHours: isPrincipal && appointmentForm.allowOutsideBusinessHours === true,
        schedulingOverrideReason: isPrincipal ? normalizeText(appointmentForm.schedulingOverrideReason) || null : null,
        notes: appointmentForm.notes,
        participants: updateParticipants,
        visibility: normalizeText(appointmentForm.visibility) || undefined,
        linkedWorkflow: normalizeText(appointmentForm.linkedWorkflow) || undefined,
        linkedWorkflowStage: normalizeText(appointmentForm.linkedWorkflowStage) || undefined,
        completionBehavior: normalizeText(appointmentForm.completionBehavior) || undefined,
        instructions: normalizeText(appointmentForm.instructions) || undefined,
        internalInstructions: normalizeText(appointmentForm.internalInstructions) || undefined,
        requiredDocuments: Array.isArray(appointmentForm.requiredDocuments) ? appointmentForm.requiredDocuments : undefined,
        reminderRules: Array.isArray(appointmentForm.reminderRules) ? appointmentForm.reminderRules : undefined,
        workflowCompletionEffect: appointmentForm.workflowCompletionEffect && typeof appointmentForm.workflowCompletionEffect === 'object'
          ? appointmentForm.workflowCompletionEffect
          : undefined,
        sendInviteEmails: appointmentForm.sendInviteEmails !== false,
        attachCalendarInvite: appointmentForm.attachCalendarInvite !== false,
        notifyCreatorOnRsvp: appointmentForm.notifyCreatorOnRsvp !== false,
      })
      await updateAppointmentAsync(
        organisationId,
        selectedAppointmentId,
        updatePayload,
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      setMessage('Appointment updated.')
      setAppointmentModalOpen(false)
      await reloadRecords(organisationId)
    } catch (updateError) {
      if (updateError?.code === 'APPOINTMENT_HARD_CONFLICT') {
        setAppointmentSchedulingIntegrity(updateError?.schedulingConflicts || null)
      }
      setError(updateError?.message || 'Unable to update appointment right now.')
    }
  }

  async function handleSendMandateToSeller() {
    if (!selectedLead || !organisationId) return
    if (!selectedLeadIsSeller) return
    const mandatePacketId = normalizeText(selectedLead?.mandatePacketId)
    if (!mandatePacketId) {
      setError('Generate the mandate packet first before sending.')
      return
    }

    const sellerEmail = normalizeText(selectedLeadContact?.email)
    if (!isValidEmail(sellerEmail)) {
      setError('Seller email is required to send the mandate.')
      return
    }

    setIsMandateSending(true)
    try {
      if (isSupabaseConfigured && isUuidLike(mandatePacketId)) {
        const packet = await fetchDocumentPacket(mandatePacketId, { includeVersions: false, includeEvents: false })
        if (!documentPacketBelongsToLead(packet, selectedLead.leadId)) {
          await updateAgencyCrmLeadRecord(organisationId, selectedLead.leadId, {
            mandatePacketId: '',
            mandateStatus: '',
          })
          setError('This lead was linked to a mandate packet for another lead. I cleared the stale link; generate a fresh mandate for this seller.')
          await reloadRecords(organisationId)
          return
        }
      }

      const sellerName = [selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ').trim() || 'Seller'
      const propertyTitle = normalizeText(selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress || 'your property')
      const onboardingToken = normalizeText(selectedLead?.sellerOnboardingToken)
      const sellerClientPortalBaseLink = buildSellerClientPortalLink(onboardingToken)
      const sellerMandatePortalLink = sellerClientPortalBaseLink ? `${sellerClientPortalBaseLink}/mandate` : ''
      const sentAtIso = new Date().toISOString()
      let sellerSigningLink = ''
      let agentSigningLink = ''
      let signingEmailFailed = false

      if (isSupabaseConfigured && isUuidLike(mandatePacketId)) {
        try {
          const signingPreparation = await prepareSigningFields({
            packetId: mandatePacketId,
            packetType: 'mandate',
            organisationId,
            placeholders: {
              'seller.display_name': sellerName,
              'seller.email': sellerEmail,
              'agent.display_name': normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName),
              'agent.email': normalizeText(selectedLead?.assignedAgentEmail || currentAgent.email),
              'property.address': propertyTitle,
              'property.listing_title': propertyTitle,
              'mandate.asking_price': String(Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0),
            },
            context: {
              lead: {
                sellerName: normalizeText(selectedLeadContact?.firstName),
                sellerSurname: normalizeText(selectedLeadContact?.lastName),
                sellerEmail,
              },
              mandateDraft: {
                sellerEmail,
              },
              generatedByName: normalizeText(currentAgent.fullName),
              generatedByUserEmail: normalizeText(currentAgent.email),
              agentEmail: normalizeText(currentAgent.email),
            },
          })
          const signingVersionId = normalizeText(signingPreparation?.version?.id)

          const linkResult = await generateSigningLinks({
            packetId: mandatePacketId,
            packetVersionId: signingVersionId || null,
            organisationId,
            expiresInHours: 168,
            baseUrl:
              (typeof window !== 'undefined' && window.location?.origin)
                ? window.location.origin
                : 'https://app.bridgenine.co.za',
          })
          agentSigningLink = resolveSignerLinkByRole(linkResult?.signers, 'agent', normalizeText(selectedLead?.assignedAgentEmail || currentAgent.email))
          sellerSigningLink = resolveSellerSignerLink(linkResult?.signers, sellerEmail)
        } catch (linkError) {
          console.warn('[MANDATE] unable to prepare signer link; continuing with client portal selling link', linkError)
        }

        if (!sellerSigningLink && supabase) {
          try {
            const signerLookup = await supabase
              .from('document_packet_signers')
              .select('signing_token, signer_role, signer_email')
              .eq('packet_id', mandatePacketId)
              .eq('signer_role', 'seller')
              .order('created_at', { ascending: true })

            if (!signerLookup.error) {
              const normalizedSellerEmail = sellerEmail.toLowerCase()
              const signerRows = Array.isArray(signerLookup.data) ? signerLookup.data : []
              const matchedSigner =
                signerRows.find(
                  (row) => normalizeText(row?.signer_email).toLowerCase() === normalizedSellerEmail && normalizeText(row?.signing_token),
                ) ||
                signerRows.find((row) => normalizeText(row?.signing_token)) ||
                null
              const signerToken = normalizeText(matchedSigner?.signing_token)
              if (signerToken) {
                const origin =
                  (typeof window !== 'undefined' && window.location?.origin)
                    ? window.location.origin
                    : 'https://app.bridgenine.co.za'
                sellerSigningLink = `${origin}/sign/${signerToken}`
              }
            }
          } catch (signerLookupError) {
            console.warn('[MANDATE] signer lookup fallback failed', signerLookupError)
          }
        }
      }

      const outboundMandateLink = agentSigningLink || sellerSigningLink || sellerMandatePortalLink
      if (!agentSigningLink) {
        setError('Agent signing link could not be generated yet. Confirm the assigned agent has an email address, then click Generate Mandate and Send Mandate again.')
        return
      }

      if (isSupabaseConfigured) {
        try {
          await invokeEdgeFunction('send-email', {
            body: {
              type: 'seller_mandate_sent',
              to: normalizeText(selectedLead?.assignedAgentEmail || currentAgent.email),
              organisationId,
              packetId: mandatePacketId,
              recipientRole: 'agent',
              recipientName: normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName || currentAgent.email),
              sellerName,
              propertyTitle,
              mandateType: 'Mandate',
              mandateStartDate: '',
              mandateEndDate: '',
              askingPrice: formatCurrency(Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0),
              portalLink: outboundMandateLink,
              agentName: normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName || currentAgent.email),
            },
          })
        } catch (emailError) {
          signingEmailFailed = true
          console.warn('[MANDATE] signing email failed after link preparation', emailError)
        }
      }

      await updateAgencyCrmLeadRecord(organisationId, selectedLead.leadId, {
        stage: 'Mandate Sent',
        status: 'Mandate Sent',
        mandateStatus: 'sent_to_agent',
        mandateSentAt: sentAtIso,
        mandateSigningLink: agentSigningLink,
      })
      if (onboardingToken) {
        updateSellerWorkflowRecordByToken(onboardingToken, (row) => ({
          ...row,
            mandateStatus: 'sent_to_agent',
            mandate: {
              ...(row?.mandate || {}),
            status: 'sent_to_agent',
            sentAt: sentAtIso,
            signerLink: agentSigningLink || row?.mandate?.signerLink || '',
          },
          sellerOnboarding: {
            ...(row?.sellerOnboarding || {}),
            formData: {
              ...((row?.sellerOnboarding?.formData && typeof row.sellerOnboarding.formData === 'object')
                ? row.sellerOnboarding.formData
                : {}),
              mandatePacketId,
              mandateSentAt: sentAtIso,
              mandateSigningLink: sellerSigningLink || '',
            },
          },
        }))
      }

      const listingId = normalizeText(selectedLead?.listingId)
      if (isSupabaseConfigured && isUuidLike(listingId)) {
        try {
          await updatePrivateListing(
            listingId,
            {
              listingStatus: 'mandate_sent',
              mandateStatus: 'sent_for_signature',
            },
            { includeRequirementsAndDocuments: false },
          )
          await createPrivateListingActivity({
            privateListingId: listingId,
            activityType: 'mandate_sent',
            activityTitle: 'Mandate sent for digital signing',
            activityDescription: 'Mandate was sent to the seller for digital signing.',
            performedBy: normalizeText(currentAgent.id),
            visibility: 'internal',
            metadata: {
              leadId: normalizeText(selectedLead?.leadId),
              packetId: mandatePacketId,
              signingMethod: 'digital',
            },
          })
        } catch (listingUpdateError) {
          console.warn('[MANDATE] listing status update skipped', listingUpdateError)
        }
      }

      if (isSupabaseConfigured && supabase && onboardingToken) {
        try {
          const onboardingLookup = await supabase
            .from('private_listing_seller_onboarding')
            .select('id, form_data')
            .eq('token', onboardingToken)
            .maybeSingle()
          if (!onboardingLookup.error && onboardingLookup.data?.id) {
            const existingFormData =
              onboardingLookup.data.form_data && typeof onboardingLookup.data.form_data === 'object'
                ? onboardingLookup.data.form_data
                : {}
            await supabase
              .from('private_listing_seller_onboarding')
              .update({
                form_data: {
                  ...existingFormData,
                  mandatePacketId,
                  mandateSentAt: sentAtIso,
                  mandateSigningLink: sellerSigningLink || '',
                },
              })
              .eq('id', onboardingLookup.data.id)
          }
        } catch (onboardingPersistError) {
          console.warn('[MANDATE] onboarding metadata persistence skipped', onboardingPersistError)
        }
      }

      await createAgencyCrmLeadActivity(organisationId, selectedLead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Mandate Sent',
        activityNote: signingEmailFailed
          ? 'Mandate signing link was created, but the email could not be sent.'
          : 'Mandate was sent to the seller for digital signing.',
        outcome: signingEmailFailed ? 'Email failed' : 'Sent for digital signing',
      }, { actor: currentAgent })
      setError('')
      setMessage(signingEmailFailed
        ? 'Mandate signing link created, but the email could not be sent. Use resend from the mandate workspace.'
        : 'Mandate sent to seller.')
      await reloadRecords(organisationId)
    } finally {
      setIsMandateSending(false)
    }
  }

  async function handleSelectedLeadMandatePrimaryAction() {
    if (!selectedLead || !selectedLeadIsSeller) return

    const actionKey = normalizeText(selectedLeadMandateActionState?.actionKey).toLowerCase()
    const workspaceMode = resolveWorkspaceModeFromAction(actionKey)
    const transactionId = normalizeText(selectedLeadLinkedTransaction?.transactionId || selectedLeadLinkedTransaction?.dealId)
    const params = new URLSearchParams()
    params.set('mode', workspaceMode)
    params.set('leadId', normalizeText(selectedLead.leadId))
    params.set('returnTo', `${location.pathname}${location.search}`)
    const statusPacket = mandatePacketStatus?.packet || null
    const mandatePacketId = documentPacketBelongsToLead(statusPacket, selectedLead.leadId)
      ? normalizeText(statusPacket?.id)
      : ''
    if (mandatePacketId) params.set('packetId', mandatePacketId)
    const route = transactionId
      ? `/transactions/${transactionId}/legal/mandate?${params.toString()}`
      : `/pipeline/leads/${selectedLead.leadId}/legal/mandate?${params.toString()}`
    navigate(route)
  }

  function handleWorkspaceViewMandate() {
    if (!selectedLeadMandateViewLink) {
      setError('Mandate link is not available yet. Generate and send the mandate first.')
      return
    }
    const opened = window.open(selectedLeadMandateViewLink, '_blank', 'noopener,noreferrer')
    if (!opened) window.location.href = selectedLeadMandateViewLink
  }

  async function handleUpdateParticipantRsvp(participant, nextStatus) {
    if (!organisationId || !selectedAppointmentId || !participant?.participantId) return
    try {
      await updateAppointmentParticipantRsvpAsync(
        organisationId,
        selectedAppointmentId,
        participant.participantId,
        {
          rsvpStatus: nextStatus,
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      await reloadRecords(organisationId)
    } catch (rsvpError) {
      setError(rsvpError?.message || 'Unable to update RSVP.')
    }
  }

  async function handleSaveAppointmentOutcome() {
    if (!organisationId || !selectedAppointmentId) return
    try {
      await addAppointmentOutcomeAsync(
        organisationId,
        selectedAppointmentId,
        {
          status: appointmentForm.status === 'cancelled' ? 'cancelled' : 'completed',
          outcomeSummary: appointmentOutcomeForm.outcomeSummary,
          clientFeedback: appointmentOutcomeForm.clientFeedback,
          agentNotes: appointmentOutcomeForm.agentNotes,
          nextStep: appointmentOutcomeForm.nextStep,
          followUpDate: appointmentOutcomeForm.followUpDate,
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      setMessage('Appointment outcome saved.')
      await reloadRecords(organisationId)
    } catch (outcomeError) {
      setError(outcomeError?.message || 'Unable to save appointment outcome.')
    }
  }

  async function handleCancelAppointment() {
    if (!organisationId || !selectedAppointmentId) return
    try {
      await updateAppointmentAsync(
        organisationId,
        selectedAppointmentId,
        {
          status: 'cancelled',
          cancellationReason: normalizeText(appointmentOutcomeForm.agentNotes || appointmentForm.notes) || 'Cancelled from Bridge appointment detail.',
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      setMessage('Appointment cancelled.')
      setAppointmentModalOpen(false)
      await reloadRecords(organisationId)
    } catch (cancelError) {
      setError(cancelError?.message || 'Unable to cancel appointment right now.')
    }
  }

  async function handleResendAppointmentInvite() {
    if (!organisationId || !selectedAppointmentId) return
    try {
      await updateAppointmentAsync(
        organisationId,
        selectedAppointmentId,
        { status: selectedAppointment?.status || appointmentForm.status || 'requested' },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      setMessage('Appointment invite resent.')
      await reloadRecords(organisationId)
    } catch (resendError) {
      setError(resendError?.message || 'Unable to resend appointment invite right now.')
    }
  }

  function handleCopyAppointmentLink() {
    if (!selectedAppointmentId || typeof window === 'undefined') return
    const link = `${window.location.origin}/calendar?appointmentId=${encodeURIComponent(selectedAppointmentId)}`
    void navigator.clipboard?.writeText(link)
    setMessage('Appointment link copied.')
  }

  function handleOpenAppointmentRelatedRecord() {
    const relatedType = normalizeText(appointmentForm.relatedEntityType || selectedAppointment?.relatedEntityType)
    const relatedId = normalizeText(appointmentForm.relatedEntityId || selectedAppointment?.relatedEntityId || selectedAppointment?.leadId || selectedAppointment?.transactionId)
    if (relatedType === 'lead' && relatedId) {
      navigate(`/pipeline/leads/${relatedId}`)
      setAppointmentModalOpen(false)
      return
    }
    if (relatedType === 'transaction' && relatedId) {
      navigate(`/transactions/${relatedId}`)
      setAppointmentModalOpen(false)
      return
    }
    setError('No related record is linked to this appointment yet.')
  }

  async function handleCreateFollowUpTaskFromAppointment() {
    if (!organisationId || !selectedAppointment || !normalizeText(selectedAppointment.leadId)) return
    const dueDate = normalizeText(appointmentOutcomeForm.followUpDate) || getTodayIsoDate()
    await createAgencyCrmLeadTask(
      organisationId,
      selectedAppointment.leadId,
      {
        assignedAgent: resolveAgentById(selectedAppointment.assignedAgentId || selectedAppointment.assignedAgentEmail || currentAgent.id),
        title: normalizeText(appointmentOutcomeForm.nextStep) || 'Appointment follow-up',
        description: normalizeText(appointmentOutcomeForm.agentNotes) || normalizeText(appointmentOutcomeForm.outcomeSummary),
        dueDate,
        status: 'Pending',
        priority: 'Medium',
      },
      {
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      },
    )
    setMessage('Follow-up task created from appointment.')
    void reloadRecords(organisationId)
  }

  async function handleCreateBuyerOfferDraft() {
    if (!selectedLead || !organisationId) return
    try {
      await createCanonicalOffer({
        organisationId,
        buyerLeadId: selectedLead.leadId,
        buyerContactId: selectedLead.contactId,
        listingId: selectedLead.listingId,
        agentId: currentAgent.id,
        status: 'draft',
        offerAmount: Number(selectedLead.estimatedValue || selectedLead.budget || 0) || null,
        financeType: selectedLead.financeType || selectedLead.preferredFinanceType || '',
      }, {
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      })
      setError('')
      setMessage('Offer draft created. Buyer lead stage updated to Offer Draft.')
      setLeadWorkspaceTab('overview')
      await reloadRecords(organisationId)
    } catch (offerError) {
      setError(offerError?.message || 'Unable to create offer draft.')
    }
  }

  function openArchiveLeadModal(leadId) {
    setLeadArchiveModal({
      open: true,
      leadId: normalizeText(leadId),
      reason: LEAD_LOST_REASON_OPTIONS[0],
      notes: '',
    })
  }

  function openDeleteLeadModal(leadId) {
    setLeadDeleteModal({
      open: true,
      leadId: normalizeText(leadId),
      confirmText: '',
      error: '',
    })
  }

  async function handleArchiveLead() {
    if (!organisationId) return
    const leadId = normalizeText(leadArchiveModal.leadId)
    if (!leadId) return
    const reason = normalizeText(leadArchiveModal.reason) || LEAD_LOST_REASON_OPTIONS[0]
    const notes = normalizeText(leadArchiveModal.notes)
    const existingLead = allLeadById.get(leadId) || null

    await updateAgencyCrmLeadRecord(organisationId, leadId, {
      stage: 'Lost',
      status: 'Lost',
      lostReason: reason,
      notes: [normalizeText(existingLead?.notes), `Archive reason: ${reason}`, notes].filter(Boolean).join(' | '),
    })
    await createAgencyCrmLeadActivity(organisationId, leadId, {
      agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      activityType: 'Stage Change',
      activityNote: `lead_archived:${reason}`,
      outcome: notes || reason,
    }, { actor: currentAgent })
    setLeadArchiveModal((previous) => ({ ...previous, open: false }))
    setError('')
    setMessage('Lead archived in Lost status. History has been preserved.')
    await reloadRecords(organisationId)
  }

  async function handleDeleteLead() {
    const leadId = normalizeText(leadDeleteModal.leadId)
    if (!leadId) return
    if (normalizeText(leadDeleteModal.confirmText).toUpperCase() !== 'DELETE') {
      setError('Type DELETE to permanently delete this lead.')
      return
    }

    const leadIdentityKey = normalizeLeadIdentityKey(leadId)
    const leadForDelete = records.leads.find((row) => normalizeText(row?.leadId) === leadId) || null
    const targetOrganisationId = normalizeText(organisationId || leadForDelete?.organisationId || 'default')
    setError('')
    try {
      await deleteAgencyCrmLeadRecord(targetOrganisationId, leadId)
      setRecords((previous) => ({
        ...previous,
        leads: previous.leads.filter((row) => normalizeLeadIdentityKey(row?.leadId) !== leadIdentityKey),
        leadActivities: previous.leadActivities.filter((row) => normalizeLeadIdentityKey(row?.leadId) !== leadIdentityKey),
        tasks: previous.tasks.filter((row) => normalizeLeadIdentityKey(row?.leadId) !== leadIdentityKey),
        appointments: previous.appointments.map((row) =>
          normalizeLeadIdentityKey(row?.leadId) === leadIdentityKey ? { ...row, leadId: '', updatedAt: new Date().toISOString() } : row,
        ),
        deals: previous.deals.filter((row) => normalizeLeadIdentityKey(row?.leadId) !== leadIdentityKey),
      }))
      setLeadDeleteModal({ open: false, leadId: '', confirmText: '', error: '' })
      if (selectedLeadId === leadId) {
        setSelectedLeadId('')
        if (isLeadWorkspaceRoute) navigate('/pipeline/leads')
      }
      setMessage('Lead deleted permanently.')
      await reloadRecords(targetOrganisationId)
    } catch (deleteError) {
      const deleteMessage = deleteError?.message || 'Unable to delete lead right now.'
      setLeadDeleteModal((previous) => ({ ...previous, error: deleteMessage }))
      setError(deleteMessage)
    }
  }

  if (loading) {
    return (
      <section className="rounded-[20px] border border-[#dde4ee] bg-white p-6">
        <LoadingSkeleton lines={10} />
      </section>
    )
  }

  return (
    <section className="min-w-0 max-w-full space-y-5 overflow-hidden">

      {error ? <div className="rounded-[18px] border border-[#f6d4d4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f1d1d]">{error}</div> : null}
      {message ? <div className="rounded-[18px] border border-[#d4e8dc] bg-[#eef9f1] px-4 py-3 text-sm text-[#1a6e3a]">{message}</div> : null}

      {!isCalendarMode && !isLeadWorkspaceRoute ? (
        <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'New Leads', value: metrics.newLeads, detail: `${leadPageSummary.newThisWeek} captured this week`, icon: UserRound, tone: 'text-[#315f8f] bg-[#edf5ff]' },
            { label: 'Follow-Ups Today', value: metrics.followUpsDueToday, detail: 'Ready for agent action', icon: CheckSquare, tone: 'text-[#8a641d] bg-[#fff7e8]' },
            { label: 'Active Opportunities', value: metrics.activeOpportunities, detail: `${leadPageSummary.filtered} visible now`, icon: TrendingUp, tone: 'text-[#26724c] bg-[#effaf3]' },
            { label: 'Appointments This Week', value: metrics.appointmentsThisWeek, detail: 'Viewings and meetings', icon: CalendarDays, tone: 'text-[#405b75] bg-[#f5f8fc]' },
            { label: 'Overdue Tasks', value: metrics.overdueTasks, detail: metrics.overdueTasks ? 'Needs attention' : 'No blockers', icon: CheckSquare, tone: 'text-[#9a4038] bg-[#fff5f4]' },
          ].map((metric) => {
            const Icon = metric.icon
            return (
              <article key={metric.label} className="group min-w-0 rounded-[20px] border border-[#dfe8f1] bg-white/88 px-4 py-3 shadow-[0_18px_36px_rgba(24,45,68,0.06)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-[#cddbe9]">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{metric.label}</span>
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] ${metric.tone}`}>
                    <Icon size={14} />
                  </span>
                </div>
                <strong className="mt-3 block text-[1.9rem] font-semibold leading-none tracking-[-0.05em] text-[#102236] tabular-nums">{metric.value}</strong>
                <p className="mt-2 truncate text-[0.78rem] font-medium text-[#667b92]">{metric.detail}</p>
              </article>
            )
          })}
        </section>
      ) : null}

      {isCalendarMode ? (
        <section className="space-y-4">
          <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#20344b]">Agent Calendar</h3>
                <p className="mt-1 text-sm text-[#60758d]">Schedule, confirm, and complete internal appointments linked to leads, contacts, listings, and transactions.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isPrincipal ? (
                  <select
                    value={calendarAgentFilter}
                    onChange={(event) => setCalendarAgentFilter(event.target.value)}
                    className="h-9 min-w-[160px] rounded-full border border-[#d6e1ee] bg-white px-3 text-xs font-semibold text-[#35546c] outline-none transition focus:border-[#1f4f78] focus:ring-2 focus:ring-[#dcecff]"
                    aria-label="Calendar agent filter"
                  >
                    <option value="all">All agents</option>
                    {agentOptions.map((agent) => (
                      <option key={`${agent.id}:${agent.email}:calendar`} value={agent.id || agent.email}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {[
                  { key: 'day', label: 'Day' },
                  { key: 'three_day', label: '3 Day' },
                  { key: 'week', label: 'Week' },
                  { key: 'month', label: 'Month' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setCalendarView(option.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      calendarView === option.key
                        ? 'border-[#1f4f78] bg-[#1f4f78] text-white'
                        : 'border-[#d6e1ee] bg-white text-[#35546c]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleOpenAppointmentModal()}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-[#1f4f78] bg-[#1f4f78] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#173f61]"
                >
                  <Plus size={14} />
                  Appointment
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[#dce6f2] bg-[#f8fbff] px-3 py-2">
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCalendarShift(-1)}
                  className="rounded-full border border-[#d5e0ec] bg-white px-2.5 py-1 text-xs font-semibold text-[#35546c]"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={handleCalendarGoToday}
                  className="rounded-full border border-[#d5e0ec] bg-white px-2.5 py-1 text-xs font-semibold text-[#35546c]"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleCalendarShift(1)}
                  className="rounded-full border border-[#d5e0ec] bg-white px-2.5 py-1 text-xs font-semibold text-[#35546c]"
                >
                  Next
                </button>
              </div>
              <p className="text-sm font-semibold text-[#28455f]">{calendarPeriodLabel}</p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-[12px] border border-[#dce6f2] bg-[#f8fbff] px-3 py-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Pending</p>
                <p className="mt-1 text-[1.15rem] font-semibold text-[#1c354b]">{appointmentSummary.pending.length}</p>
              </div>
              <div className="rounded-[12px] border border-[#dce6f2] bg-[#f8fbff] px-3 py-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Needs Reschedule</p>
                <p className="mt-1 text-[1.15rem] font-semibold text-[#1c354b]">{appointmentSummary.reschedule.length}</p>
              </div>
              <div className="rounded-[12px] border border-[#dce6f2] bg-[#f8fbff] px-3 py-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Today</p>
                <p className="mt-1 text-[1.15rem] font-semibold text-[#1c354b]">{appointmentSummary.today.length}</p>
              </div>
              <div className="rounded-[12px] border border-[#dce6f2] bg-[#f8fbff] px-3 py-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">This Week</p>
                <p className="mt-1 text-[1.15rem] font-semibold text-[#1c354b]">{appointmentSummary.thisWeek.length}</p>
              </div>
            </div>
          </article>

          <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
            <div className="space-y-2">
              <div className="grid gap-2" style={{ gridTemplateColumns: calendarGridTemplateColumns }}>
                {calendarHeaderDays.map((label) => (
                  <div key={label} className="rounded-[10px] bg-[#f5f8fc] px-2 py-1 text-center text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#75889d]">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid gap-2" style={{ gridTemplateColumns: calendarGridTemplateColumns }}>
                {visibleCalendarDays.map((day) => {
                  const key = toDateOnlyIso(day)
                  const rows = calendarAppointmentsByDate.get(key) || []
                  const inActiveMonth = calendarView === 'month' ? day.getMonth() === calendarCursorDate.getMonth() : true
                  const isToday = isSameDay(day, new Date())
                  const shownRows = rows.slice(0, 4)
                  const hiddenCount = Math.max(rows.length - shownRows.length, 0)

                  return (
                    <div
                      key={key}
                      className={`min-h-[148px] rounded-[12px] border p-2 ${
                        isToday
                          ? 'border-[#1f4f78] bg-[#f2f7fd]'
                          : inActiveMonth
                            ? 'border-[#e0e8f2] bg-white'
                            : 'border-[#ebf0f6] bg-[#f9fbfe]'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-1">
                        <span className={`text-xs font-semibold ${inActiveMonth ? 'text-[#203a52]' : 'text-[#8ca0b5]'}`}>
                          {day.getDate()}
                        </span>
                        {rows.length ? (
                          <span className="rounded-full border border-[#d8e3ef] bg-[#f8fbff] px-1.5 py-0.5 text-[0.64rem] font-semibold text-[#35546c]">
                            {rows.length}
                          </span>
                        ) : null}
                      </div>

                      <div className="space-y-1">
                        {shownRows.map((appointment) => {
                          const listingLabel = resolveAppointmentListingLabel(appointment?.listingId)
                          const category = getAppointmentCategory(appointment)
                          return (
                            <button
                              key={appointment.appointmentId}
                              type="button"
                              onClick={() => handleOpenAppointmentModal(appointment)}
                              className="w-full rounded-[8px] border border-l-[4px] px-2 py-1 text-left shadow-[0_6px_14px_rgba(31,54,78,0.035)] transition hover:brightness-[0.985]"
                              style={getAppointmentCategoryCardStyle(appointment)}
                            >
                              <p className="truncate text-[0.68rem] font-semibold text-[#203a52]">{formatAppointmentTimeRange(appointment)}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <span
                                  className="inline-flex rounded-full px-1.5 py-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.055em]"
                                  style={getAppointmentCategoryBadgeStyle(appointment)}
                                >
                                  {category.label}
                                </span>
                                <span className="inline-flex rounded-full bg-white/80 px-1.5 py-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.055em] text-[#315a7a]">
                                  {APPOINTMENT_STATUS_LABELS[appointment.status] || appointment.status || 'Requested'}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-[0.66rem] text-[#5f748d]">{appointment.title || getAppointmentTypeLabel(appointment.appointmentType)}</p>
                              {listingLabel ? (
                                <p className="truncate text-[0.62rem] text-[#6d8299]">{listingLabel}</p>
                              ) : null}
                              <p className="truncate text-[0.62rem] text-[#7a8fa5]">
                                {(appointment.participants || []).filter((person) => person?.rsvpStatus === 'Accepted').length} accepted · {(appointment.participants || []).filter((person) => person?.rsvpStatus !== 'Accepted').length} pending
                              </p>
                            </button>
                          )
                        })}
                        {hiddenCount > 0 ? (
                          <p className="px-1 text-[0.66rem] font-semibold text-[#5f7894]">+{hiddenCount} more</p>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>

              {visibleCalendarAppointmentCount === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[#dce6f2] bg-[#f8fbff] px-4 py-3 text-sm text-[#60758d]">
                  {calendarScopedAppointments.length
                    ? 'No appointments in this calendar period. Use Today or move through the calendar to jump back into the schedule.'
                    : 'No appointments are visible for this calendar yet.'}
                </div>
              ) : null}
            </div>
          </article>
        </section>
      ) : isPrincipal && principalView === 'reporting' ? (
        <section className="space-y-4">
          <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
            <h3 className="text-base font-semibold text-[#20344b]">Agent Productivity</h3>
            <p className="mt-1 text-sm text-[#60758d]">Agency-wide lead throughput, follow-ups, conversion, and recent activity.</p>
            <div className="mt-4 overflow-x-auto rounded-[14px] border border-[#e4ebf4]">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-[#f7faff] text-left text-[0.7rem] uppercase tracking-[0.08em] text-[#6f839a]">
                  <tr>
                    <th className="px-3 py-2">Agent</th>
                    <th className="px-3 py-2">New Leads</th>
                    <th className="px-3 py-2">Contacted</th>
                    <th className="px-3 py-2">Viewings Scheduled</th>
                    <th className="px-3 py-2">Follow-ups</th>
                    <th className="px-3 py-2">Converted</th>
                    <th className="px-3 py-2">Conversion Rate</th>
                    <th className="px-3 py-2">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {principalProductivityRows.length ? (
                    principalProductivityRows.map((row) => (
                      <tr key={row.agent} className="border-t border-[#e8eef5] text-[#2d4560]">
                        <td className="px-3 py-2 font-medium">{row.agent}</td>
                        <td className="px-3 py-2">{row.newLeads}</td>
                        <td className="px-3 py-2">{row.contacted}</td>
                        <td className="px-3 py-2">{row.viewingsScheduled}</td>
                        <td className="px-3 py-2">{row.followUps}</td>
                        <td className="px-3 py-2">{row.converted}</td>
                        <td className="px-3 py-2">{formatPercent(row.conversionRate)}</td>
                        <td className="px-3 py-2">{row.lastActivityLabel}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-[#6c8097]" colSpan={8}>No productivity data yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
              <h3 className="text-base font-semibold text-[#20344b]">Lead Sources</h3>
              <p className="mt-1 text-sm text-[#60758d]">Where leads are currently entering the agency pipeline.</p>
              {principalReporting.leadSourceRows.length ? (
                <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr]">
                  <div className="flex items-center justify-center">
                    <div
                      className="h-[140px] w-[140px] rounded-full border border-[#dce6f1]"
                      style={{
                        background: (() => {
                          const colors = ['#2f80ed', '#27ae60', '#f2994a', '#8e44ad', '#16a085', '#f2c94c', '#eb5757', '#7f8c8d']
                          const total = principalReporting.leadSourceRows.reduce((sum, row) => sum + row.count, 0) || 1
                          let current = 0
                          const segments = principalReporting.leadSourceRows.slice(0, 8).map((row, index) => {
                            const start = (current / total) * 360
                            current += row.count
                            const end = (current / total) * 360
                            return `${colors[index % colors.length]} ${start}deg ${end}deg`
                          })
                          return `conic-gradient(${segments.join(', ')})`
                        })(),
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    {principalReporting.leadSourceRows.map((row) => (
                      <div key={row.source} className="flex items-center justify-between rounded-[12px] border border-[#e4ecf5] bg-[#fbfdff] px-3 py-2 text-sm">
                        <span className="text-[#2f4b65]">{row.source}</span>
                        <strong className="text-[#102539]">{row.count}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-[12px] border border-dashed border-[#d9e3ef] bg-[#fbfdff] px-3 py-4 text-sm text-[#6c8097]">
                  No lead source breakdown is available yet.
                </p>
              )}
            </article>

            <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
              <h3 className="text-base font-semibold text-[#20344b]">Appointment Mix</h3>
              <p className="mt-1 text-sm text-[#60758d]">Viewings, valuation meetings, and follow-up appointment distribution.</p>
              <div className="mt-4 space-y-2">
                {principalReporting.appointmentTypeRows.length ? (
                  principalReporting.appointmentTypeRows.map((row) => {
                    const total = principalReporting.appointmentTypeRows.reduce((sum, item) => sum + item.count, 0) || 1
                    const width = Math.max(6, Math.round((row.count / total) * 100))
                    return (
                      <div key={row.type} className="rounded-[12px] border border-[#e4ecf5] bg-[#fbfdff] px-3 py-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[#2f4b65]">{row.type}</span>
                          <strong className="text-[#102539]">{row.count}</strong>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-[#e6edf6]">
                          <span className="block h-full rounded-full bg-[#2f7b9e]" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="rounded-[12px] border border-dashed border-[#d9e3ef] bg-[#fbfdff] px-3 py-4 text-sm text-[#6c8097]">
                    No appointment mix data is available yet.
                  </p>
                )}
              </div>
            </article>
          </div>
        </section>
      ) : (
        <>
          {!isLeadWorkspaceRoute ? (
          <section className="min-w-0 rounded-[22px] border border-[#dfe8f1] bg-white/88 p-3 shadow-[0_18px_42px_rgba(24,45,68,0.06)] backdrop-blur">
            <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
              <label className="flex min-h-[46px] min-w-0 flex-1 items-center gap-3 rounded-[16px] border border-[#dbe6f1] bg-[#f8fbfe] px-4 transition focus-within:border-[#9db7cf] focus-within:bg-white">
                <Search size={16} className="shrink-0 text-[#7f92a6]" />
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-[#162334] outline-none placeholder:text-[#97a7b8]"
                  type="search"
                  placeholder="Search leads, clients, listings..."
                  value={leadFilter.search}
                  onChange={(event) => setLeadFilter((previous) => ({ ...previous, search: event.target.value }))}
                />
                <kbd className="hidden rounded-[8px] border border-[#d7e1ec] bg-white px-2 py-1 text-[0.68rem] font-bold text-[#7b8ca2] sm:inline-flex">⌘K</kbd>
              </label>

              <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:flex xl:shrink-0">
                <select className="min-h-[46px] rounded-[16px] border border-[#dbe6f1] bg-white px-3 text-sm font-semibold text-[#2b4056] outline-none transition hover:border-[#c7d6e5]" value={leadFilter.source} onChange={(event) => setLeadFilter((previous) => ({ ...previous, source: event.target.value }))}>
                  <option value="all">All Sources</option>
                  {availableLeadSources.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select className="min-h-[46px] rounded-[16px] border border-[#dbe6f1] bg-white px-3 text-sm font-semibold text-[#2b4056] outline-none transition hover:border-[#c7d6e5]" value={leadFilter.stage} onChange={(event) => setLeadFilter((previous) => ({ ...previous, stage: event.target.value }))}>
                  <option value="all">All Stages</option>
                  {LEAD_STAGES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {isPrincipal ? (
                  <select className="min-h-[46px] rounded-[16px] border border-[#dbe6f1] bg-white px-3 text-sm font-semibold text-[#2b4056] outline-none transition hover:border-[#c7d6e5]" value={leadFilter.agent} onChange={(event) => setLeadFilter((previous) => ({ ...previous, agent: event.target.value }))}>
                    <option value="all">All Agents</option>
                    {agentOptions.map((agent) => (
                      <option key={`${agent.id}:${agent.email}`} value={agent.id || agent.email}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select className="min-h-[46px] rounded-[16px] border border-[#dbe6f1] bg-white px-3 text-sm font-semibold text-[#2b4056] outline-none transition hover:border-[#c7d6e5]" value={leadFilter.sort} onChange={(event) => setLeadFilter((previous) => ({ ...previous, sort: event.target.value }))}>
                  <option value="newest">Sort: Newest</option>
                  <option value="next_follow_up">Sort: Next Follow-up</option>
                  <option value="stage">Sort: Stage</option>
                </select>
                <button
                  type="button"
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[16px] border border-[#dbe6f1] bg-white px-3 text-sm font-semibold text-[#405b75] transition hover:border-[#c7d6e5] hover:bg-[#f8fbfe]"
                  onClick={() => setLeadFilter({ search: '', source: 'all', stage: 'all', agent: 'all', sort: 'newest' })}
                >
                  <Filter size={15} />
                  Reset
                </button>
              </div>
            </div>
            {!isPrincipal ? (
              <p className="mt-2 px-1 text-xs font-medium text-[#6c8097]">
                Pipeline value: <strong className="text-[#1a344e]">{formatCurrency(metrics.pipelineValue)}</strong>
              </p>
            ) : null}
          </section>
          ) : null}

          <section className="grid gap-4">
            {!isLeadWorkspaceRoute ? (
            <article className="min-w-0 overflow-hidden rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
              <div className="border-b border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Lead Pipeline</p>
                    <h3 className="mt-1 text-[1.2rem] font-semibold tracking-[-0.035em] text-[#142132]">
                      {leadTypeView === 'seller' ? 'Seller Leads' : 'Buyer Leads'}
                    </h3>
                    <p className="mt-1 text-sm text-[#60758b]">
                      {leadPageSummary.filtered} visible · {metrics.followUpsDueToday} follow-ups today
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="inline-flex items-center rounded-[16px] border border-[#dbe4ee] bg-[#f6f9fc] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                    <button
                      type="button"
                      onClick={() => setPipelineViewMode('table')}
                      className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-[12px] px-3 text-xs font-semibold transition ${
                        pipelineViewMode === 'table' ? 'bg-white text-[#163247] shadow-[0_8px_18px_rgba(24,45,68,0.12)]' : 'text-[#51667f] hover:text-[#1f4f78]'
                      }`}
                    >
                      <Table2 size={13} />
                      Table
                    </button>
                    <button
                      type="button"
                      onClick={() => setPipelineViewMode('kanban')}
                      className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-[12px] px-3 text-xs font-semibold transition ${
                        pipelineViewMode === 'kanban' ? 'bg-white text-[#163247] shadow-[0_8px_18px_rgba(24,45,68,0.12)]' : 'text-[#51667f] hover:text-[#1f4f78]'
                      }`}
                    >
                      <Columns3 size={13} />
                      Kanban
                    </button>
                  </div>
                  <div className="inline-flex items-center rounded-[16px] border border-[#dbe4ee] bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setLeadTypeView('buyer')}
                      className={`rounded-[12px] px-3 py-2 text-xs font-semibold transition ${
                        leadTypeView === 'buyer' ? 'bg-[#163247] text-white shadow-[0_8px_18px_rgba(22,50,71,0.18)]' : 'text-[#51667f] hover:text-[#1f4f78]'
                      }`}
                    >
                      Buyer Leads
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeadTypeView('seller')}
                      className={`rounded-[12px] px-3 py-2 text-xs font-semibold transition ${
                        leadTypeView === 'seller' ? 'bg-[#163247] text-white shadow-[0_8px_18px_rgba(22,50,71,0.18)]' : 'text-[#51667f] hover:text-[#1f4f78]'
                      }`}
                    >
                      Seller Leads
                    </button>
                  </div>
                  <button type="button" className="inline-flex min-h-[40px] items-center justify-center rounded-[14px] border border-[#dbe4ee] bg-white px-3 text-[#405b75] transition hover:border-[#c7d6e5] hover:bg-[#f8fbfe]" aria-label="More lead actions">
                    <MoreHorizontal size={17} />
                  </button>
                  </div>
                </div>
              </div>
              {pipelineViewMode === 'kanban' ? (
                <div className="max-w-full overflow-x-auto pb-2">
                  <div className="flex min-h-[560px] gap-3 pr-1">
                    {kanbanColumns.map((column) => (
                      <section
                        key={column.id}
                        className={`flex w-[278px] shrink-0 flex-col rounded-[16px] border bg-[#f7faff] transition ${
                          draggingPipelineCardId ? 'border-[#b9cde3]' : 'border-[#dfe8f3]'
                        }`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault()
                          const leadId = normalizeText(event.dataTransfer.getData('text/plain') || draggingPipelineCardRef.current || draggingPipelineCardId)
                          if (leadId) void handleMovePipelineCard(leadId, column.id)
                        }}
                      >
                        <div className="sticky top-0 z-[1] rounded-t-[16px] border-b border-[#dfe8f3] bg-[#f7faff] px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="h-5 w-1 rounded-full bg-[#35a7d8]" />
                              <h4 className="truncate text-[0.82rem] font-bold uppercase tracking-[0.03em] text-[#172b3f]">{column.label}</h4>
                            </div>
                            <span className="rounded-full border border-[#d8e4f0] bg-white px-2 py-0.5 text-[0.68rem] font-semibold text-[#5a718a]">
                              {column.cards.length}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[0.66rem] leading-4 text-[#71869d]">{column.description}</p>
                        </div>
                        <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
                          {column.cards.length ? (
                            column.cards.map((lead) => {
                              const leadId = normalizeLeadIdentityKey(lead?.leadId)
                              const leadContact = contactById.get(normalizeText(lead?.contactId))
                              const leadTasks = leadTasksByLeadId.get(leadId) || []
                              const leadActivities = leadActivitiesByLeadId.get(leadId) || []
                              const linkedDeal = linkedDealByLeadId.get(leadId)
                              const latestActivity = [...leadActivities]
                                .sort((a, b) => new Date(b?.activityDate || b?.createdAt || 0) - new Date(a?.activityDate || a?.createdAt || 0))[0]
                              const lastActivityLabel = formatDateShort(latestActivity?.activityDate || latestActivity?.createdAt || lead?.updatedAt || lead?.createdAt)
                              const nextStep = resolveLeadNextStep(lead, leadTasks)
                              const clientName = [leadContact?.firstName, leadContact?.lastName].filter(Boolean).join(' ') || 'Unnamed lead'
                              const propertyLabel = normalizeText(lead?.propertyInterest || lead?.sellerPropertyAddress || lead?.areaInterest || linkedDeal?.title) || 'Property not linked'
                              const assignedAgent = normalizeText(lead?.assignedAgentName || lead?.assignedAgentEmail || 'Unassigned')
                              const agentColor = getAgentKanbanColor(lead?.assignedAgentId || lead?.assignedAgentEmail || assignedAgent)
                              const isOverdue = leadTasks.some((task) => {
                                const due = new Date(task?.dueDate || 0).getTime()
                                return normalizeText(task?.status) !== 'Completed' && Number.isFinite(due) && due < Date.now()
                              })
                              const priority = normalizeText(lead?.priority)
                              const stageLabel = normalizeLeadKanbanStage(lead?.stage || lead?.status) === 'lead' ? 'Lead' : normalizeText(lead?.stage || lead?.status || 'Lead')
                              const badges = [
                                priority && priority !== 'Medium' ? priority : '',
                                isOverdue ? 'Overdue' : '',
                                linkedDeal ? 'Transaction' : '',
                                normalizeKey(stageLabel).includes('otp') ? 'OTP Pending' : '',
                                normalizeKey(stageLabel).includes('finance') ? 'Finance Pending' : '',
                              ].filter(Boolean)

                              return (
                                <article
                                  key={leadId}
                                  draggable
                                  className={`group cursor-grab overflow-hidden rounded-[14px] border bg-white shadow-[0_8px_18px_rgba(31,54,78,0.08)] transition active:cursor-grabbing ${
                                    draggingPipelineCardId === leadId ? 'border-[#2f6f9f] opacity-70' : 'border-[#dfe8f3] hover:border-[#b9cde3]'
                                  }`}
                                  onDragStart={(event) => {
                                    setDraggingPipelineCardId(leadId)
                                    draggingPipelineCardRef.current = leadId
                                    event.dataTransfer.setData('text/plain', leadId)
                                    event.dataTransfer.effectAllowed = 'move'
                                  }}
                                  onDragEnd={() => {
                                    window.setTimeout(() => {
                                      setDraggingPipelineCardId('')
                                      draggingPipelineCardRef.current = ''
                                    }, 0)
                                  }}
                                  onClick={(event) => {
                                    if (draggingPipelineCardRef.current) {
                                      event.preventDefault()
                                      return
                                    }
                                    setSelectedLeadId(leadId)
                                    navigate(`/pipeline/leads/${leadId}`)
                                  }}
                                >
                                  <div className="h-6 px-3 py-1 text-center text-[0.62rem] font-bold uppercase tracking-[0.08em] text-white" style={{ backgroundColor: agentColor }}>
                                    {assignedAgent}
                                  </div>
                                  <div className="m-2 rounded-[10px] border border-dashed border-[#cfdce9] bg-[#fbfdff] p-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <h5 className="truncate text-[0.86rem] font-bold leading-5 text-[#172b3f]" title={clientName}>
                                          {clientName}
                                        </h5>
                                        <p className="mt-0.5 line-clamp-2 text-[0.72rem] leading-4 text-[#718196]" title={propertyLabel}>
                                          {propertyLabel}
                                        </p>
                                      </div>
                                      <span className="shrink-0 rounded-full bg-[#edf4fb] px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.05em] text-[#325a7a]">
                                        {lead.leadCategory || 'Lead'}
                                      </span>
                                    </div>
                                    <div className="mt-2 flex items-center justify-between gap-2">
                                      <div className="flex -space-x-1.5">
                                        <span
                                          className="grid h-6 w-6 place-items-center rounded-full border-2 border-white text-[0.58rem] font-bold text-white shadow-sm"
                                          style={{ backgroundColor: agentColor }}
                                          title={assignedAgent}
                                        >
                                          {getInitials(assignedAgent)}
                                        </span>
                                      </div>
                                      <span className="rounded-md bg-[#eef6fd] px-2 py-1 text-[0.66rem] font-semibold text-[#23618b]">
                                        {stageLabel}
                                      </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {badges.slice(0, 2).map((badge) => (
                                        <span key={badge} className="rounded-md bg-[#fff7e8] px-1.5 py-0.5 text-[0.6rem] font-semibold text-[#8a5b1f]">
                                          {badge}
                                        </span>
                                      ))}
                                    </div>
                                    <p className="mt-2 line-clamp-1 text-[0.68rem] text-[#5f7186]" title={nextStep}>
                                      Next: <span className="font-semibold text-[#263f58]">{nextStep}</span>
                                    </p>
                                  </div>
                                  <div className="flex items-center justify-between px-3 pb-2 text-[0.68rem] text-[#73879c]">
                                    <span className="truncate">{leadTasks.length} tasks</span>
                                    <span className="truncate">{lastActivityLabel}</span>
                                  </div>
                                </article>
                              )
                            })
                          ) : (
                            <div className="rounded-[14px] border border-dashed border-[#d4e1ef] bg-white/70 px-3 py-8 text-center text-xs text-[#71869d]">
                              {column.emptyState || `Move leads here once they are ready for ${column.label}.`}
                            </div>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              ) : (
              <>
              <div className="hidden max-w-full overflow-x-auto lg:block">
                <table className="w-full min-w-[1516px] table-fixed text-sm">
                  <thead className="sticky top-0 z-[1] h-[52px] border-b border-[rgba(15,23,42,0.06)] bg-[#FCFCFD] text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="w-[56px] px-5 py-4"><span className="sr-only">Select</span></th>
                      <th className="w-[360px] px-5 py-4">Lead</th>
                      <th className="w-[300px] px-5 py-4">Opportunity</th>
                      <th className="w-[160px] px-5 py-4">Status</th>
                      <th className="w-[260px] px-5 py-4">Next Action</th>
                      <th className="w-[180px] px-5 py-4">Owner</th>
                      <th className="w-[140px] px-5 py-4">Activity</th>
                      <th className="w-[60px] px-5 py-4 text-right"><span className="sr-only">Menu</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(15,23,42,0.06)] bg-white">
                    {leadTableRows.length ? (
                      leadTableRows.map((lead) => {
                        const leadContact =
                          contactById.get(normalizeText(lead.contactId)) ||
                          buildLeadContactFallback(lead) ||
                          buildCanvassingProspectContactFallback(canvassingProspectById.get(normalizeText(lead?.canvassingProspectId)))
                        const leadId = normalizeLeadIdentityKey(lead?.leadId)
                        const linkedAppointment = records.appointments
                          .filter((row) => normalizeLeadIdentityKey(row?.leadId) === leadId)
                          .sort((a, b) => new Date(b?.dateTime || b?.createdAt || 0) - new Date(a?.dateTime || a?.createdAt || 0))[0]
                        const linkedTransaction = records.deals
                          .filter((row) => normalizeLeadIdentityKey(row?.leadId) === leadId)
                          .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0]
                        const leadTasks = leadTasksByLeadId.get(leadId) || []
                        const leadActivities = leadActivitiesByLeadId.get(leadId) || []
                        const isSeller = normalizeText(lead?.leadCategory).toLowerCase() === 'seller'
                        const funnelStage = resolveLeadFunnelStage(lead)
                        const nextStep = resolveLeadNextStep(lead, leadTasks)
                        const latestActivity = [...leadActivities]
                          .sort((a, b) => new Date(b?.activityDate || b?.createdAt || 0) - new Date(a?.activityDate || a?.createdAt || 0))[0]
                        const activityReference = latestActivity?.activityDate || latestActivity?.createdAt || linkedAppointment?.updatedAt || linkedAppointment?.dateTime || lead?.updatedAt || lead?.createdAt
                        const lastActivityLabel = formatDateShort(activityReference)
                        const assignedAgent = normalizeText(lead?.assignedAgentName || lead?.assignedAgentEmail || 'Unassigned')
                        const agentColor = getAgentKanbanColor(lead?.assignedAgentId || lead?.assignedAgentEmail || assignedAgent)
                        const leadName = [leadContact?.firstName, leadContact?.lastName].filter(Boolean).join(' ') || 'Unnamed lead'
                        const isActive = normalizeLeadIdentityKey(selectedLeadId) === leadId && isLeadWorkspaceRoute
                        const categoryMeta = getLeadCategoryMeta(lead, leadContact)
                        const statusMeta = getLeadStatusMeta(lead, funnelStage)
                        const linkedListing = resolveLeadLinkedListing(lead)
                        const opportunity = getLeadOpportunityPreview(lead, linkedTransaction, isSeller, linkedListing)
                        const actionMeta = getLeadNextActionMeta(lead, leadTasks, linkedAppointment, nextStep)
                        const latestActivityTitle = normalizeText(latestActivity?.activityType || latestActivity?.activityNote || linkedAppointment?.title)

                        return (
                          <tr
                            key={lead.leadId}
                            className={`group h-[112px] cursor-pointer text-slate-700 transition-all duration-200 hover:bg-slate-50/70 hover:shadow-sm ${isActive ? 'bg-[#f2f7ff]' : 'bg-white'}`}
                            onClick={() => {
                              setSelectedLeadId(lead.leadId)
                              navigate(`/pipeline/leads/${lead.leadId}`)
                            }}
                          >
                            <td className="px-5 py-5 align-middle" onClick={(event) => event.stopPropagation()}>
                              <input type="checkbox" className="h-4 w-4 rounded-[5px] border-slate-300 text-[#2563eb] shadow-sm focus:ring-2 focus:ring-[#dbeafe]" aria-label={`Select ${leadName}`} />
                            </td>
                            <td className="px-5 py-5 align-middle">
                              <div className="flex min-w-0 items-start gap-3.5">
                                <span
                                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[0.78rem] font-bold text-white shadow-[0_10px_22px_rgba(24,45,68,0.14)] ring-1 ring-white/70"
                                  style={{ backgroundImage: `linear-gradient(135deg, ${agentColor}, #1f4f78)` }}
                                >
                                  {getInitials(leadName)}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-[16px] font-semibold leading-6 text-slate-900">{leadName}</p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] ${categoryMeta.className}`}>
                                      {categoryMeta.label}
                                    </span>
                                  </div>
                                  <div className="mt-2 grid min-w-0 gap-1 text-[13px] font-medium text-slate-500">
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <Phone size={13} className="shrink-0 text-slate-400" />
                                      <span className="truncate">{leadContact?.phone || 'No phone'}</span>
                                    </span>
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <Mail size={13} className="shrink-0 text-slate-400" />
                                      <span className="truncate">{leadContact?.email || 'No email'}</span>
                                    </span>
                                  </div>
                                  <p className="mt-2 truncate text-[0.72rem] font-medium text-slate-400">
                                    {lead.leadSource || 'Manual'} • {formatDateShort(lead?.createdAt)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-5 align-middle">
                              {opportunity.hasListing ? (
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="relative grid h-[72px] w-[120px] shrink-0 place-items-center overflow-hidden rounded-[14px] border border-slate-200 bg-slate-100" style={{ backgroundImage: `linear-gradient(135deg, ${agentColor}22, #f8fafc 70%)` }}>
                                    <Home size={20} className="text-slate-400" />
                                    {opportunity.thumbnailUrl ? (
                                      <img
                                        src={opportunity.thumbnailUrl}
                                        alt=""
                                        loading="lazy"
                                        className="absolute inset-0 h-full w-full object-cover"
                                        onError={(event) => {
                                          event.currentTarget.style.display = 'none'
                                        }}
                                      />
                                    ) : null}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">{opportunity.title}</p>
                                    <p className="mt-0.5 truncate text-[13px] font-medium text-slate-500">{opportunity.subtitle}</p>
                                    {opportunity.price ? <p className="mt-2 text-[13px] font-semibold text-[#1f4f78]">{opportunity.price}</p> : null}
                                    <p className="mt-0.5 truncate text-[12px] font-medium text-slate-400">{opportunity.specs || 'Property details pending'}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3">
                                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-slate-400 shadow-sm">
                                    <ImageIcon size={17} />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-700">No listing assigned</p>
                                    <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-[#1f4f78]">Assign listing <ArrowUpRight size={12} /></p>
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-5 align-middle">
                              <div className="space-y-2">
                                <span className={`inline-flex rounded-full border px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] ${statusMeta.className}`}>{statusMeta.label}</span>
                                <div className="flex items-center gap-1" aria-label={`${statusMeta.label} lead score ${statusMeta.score} out of 5`}>
                                  {Array.from({ length: 5 }).map((_, dotIndex) => (
                                    <span key={`${lead.leadId}:score:${dotIndex}`} className={`h-2 w-2 rounded-full ${dotIndex < statusMeta.score ? statusMeta.dotClassName : 'bg-slate-200'}`} />
                                  ))}
                                </div>
                                <p className="truncate text-[12px] font-medium text-slate-400">{funnelStage}</p>
                              </div>
                            </td>
                            <td className="px-5 py-5 align-middle">
                              <div className={`rounded-2xl border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.035)] ${actionMeta.className}`}>
                                <p className="text-[0.62rem] font-bold uppercase tracking-[0.08em] opacity-75">{actionMeta.eyebrow}</p>
                                <p className="mt-1 truncate text-sm font-semibold text-slate-900">{actionMeta.title}</p>
                                <p className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.08em]">{actionMeta.meta}</p>
                                <p className="mt-2 line-clamp-2 text-[12px] font-medium leading-5 text-slate-500">{actionMeta.detail}</p>
                                <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#1f4f78]">Take action <ArrowUpRight size={12} /></span>
                              </div>
                            </td>
                            <td className="px-5 py-5 align-middle">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[0.72rem] font-bold text-white shadow-sm" style={{ backgroundColor: agentColor }}>{getInitials(assignedAgent)}</span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-800">{assignedAgent}</p>
                                  <p className="mt-0.5 truncate text-[12px] font-medium text-slate-400">Agent</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-5 align-middle">
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                                  <Clock3 size={13} className="shrink-0 text-slate-400" />
                                  {formatRelativeTime(activityReference)}
                                </p>
                                <p className="mt-1 line-clamp-2 text-[12px] font-medium leading-5 text-slate-500">{latestActivityTitle || lastActivityLabel}</p>
                              </div>
                            </td>
                            <td className="px-5 py-5 text-right align-middle">
                              <button
                                type="button"
                                className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent bg-transparent text-slate-400 opacity-0 transition-all duration-200 hover:border-slate-200 hover:bg-white hover:text-slate-700 focus:opacity-100 group-hover:opacity-100"
                                aria-label={`Open actions for ${leadName}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openArchiveLeadModal(lead.leadId)
                                }}
                              >
                                <MoreHorizontal size={17} />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td className="px-6 py-14" colSpan={8}>
                          <div className="mx-auto max-w-lg rounded-[28px] border border-dashed border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-8 py-10 text-center shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
                            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#edf4fb] text-[#35546c]">
                              <UserRound size={24} />
                            </div>
                            <h4 className="mt-5 text-[1.1rem] font-semibold tracking-[-0.025em] text-slate-900">
                              {leadTypeView === 'seller' ? 'No seller leads yet' : 'No buyer leads yet'}
                            </h4>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                              {leadTypeView === 'seller'
                                ? 'Create your first seller lead manually or convert a canvassing prospect when they are ready to sell.'
                                : 'Create your first buyer lead manually or connect listings to start capturing enquiries automatically.'}
                            </p>
                            <button
                              type="button"
                              className="mt-6 inline-flex min-h-[42px] items-center justify-center gap-2 rounded-2xl bg-[#163247] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(22,50,71,0.18)]"
                              onClick={() => openLeadForm(leadTypeView)}
                            >
                              <Plus size={15} />
                              Create Lead
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="hidden items-center justify-center gap-3 border-t border-[rgba(15,23,42,0.06)] bg-[#FCFCFD] px-5 py-4 lg:flex">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={leadTableCurrentPage <= 1}
                  onClick={() => setLeadTablePage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <p className="min-w-[220px] text-center text-sm font-medium text-slate-500">
                  {leadTableStart}-{leadTableEnd} of {filteredLeads.length} leads
                </p>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={leadTableCurrentPage >= leadTableTotalPages}
                  onClick={() => setLeadTablePage((page) => Math.min(leadTableTotalPages, page + 1))}
                >
                  Next
                </button>
              </div>
              <div className="space-y-3 p-4 lg:hidden">
                {filteredLeads.length ? (
                  filteredLeads.map((lead) => {
                    const leadContact =
                      contactById.get(normalizeText(lead.contactId)) ||
                      buildLeadContactFallback(lead) ||
                      buildCanvassingProspectContactFallback(canvassingProspectById.get(normalizeText(lead?.canvassingProspectId)))
                    const leadId = normalizeLeadIdentityKey(lead?.leadId)
                    const leadTasks = leadTasksByLeadId.get(leadId) || []
                    const leadActivities = leadActivitiesByLeadId.get(leadId) || []
                    const latestActivity = [...leadActivities]
                      .sort((a, b) => new Date(b?.activityDate || b?.createdAt || 0) - new Date(a?.activityDate || a?.createdAt || 0))[0]
                    const linkedAppointment = records.appointments
                      .filter((row) => normalizeLeadIdentityKey(row?.leadId) === leadId)
                      .sort((a, b) => new Date(b?.dateTime || b?.createdAt || 0) - new Date(a?.dateTime || a?.createdAt || 0))[0]
                    const linkedTransaction = records.deals
                      .filter((row) => normalizeLeadIdentityKey(row?.leadId) === leadId)
                      .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0]
                    const isSeller = normalizeText(lead?.leadCategory).toLowerCase() === 'seller'
                    const linkedListingLabel = normalizeText(lead?.listingId || lead?.propertyInterest || lead?.sellerPropertyAddress)
                    const interestedListing = isSeller
                      ? linkedListingLabel || 'Property not linked yet'
                      : linkedListingLabel || normalizeText(linkedTransaction?.title) || 'No listing selected yet'
                    const funnelStage = resolveLeadFunnelStage(lead)
                    const nextStep = resolveLeadNextStep(lead, leadTasks)
                    const activityReference = latestActivity?.activityDate || latestActivity?.createdAt || linkedAppointment?.updatedAt || linkedAppointment?.dateTime || lead?.updatedAt || lead?.createdAt
                    const assignedAgent = normalizeText(lead?.assignedAgentName || lead?.assignedAgentEmail || 'Unassigned')
                    const agentColor = getAgentKanbanColor(lead?.assignedAgentId || lead?.assignedAgentEmail || assignedAgent)
                    const leadName = [leadContact?.firstName, leadContact?.lastName].filter(Boolean).join(' ') || 'Unnamed lead'
                    const nextStepStatus = getNextStepStatus(leadTasks)

                    return (
                      <article
                        key={`mobile-${lead.leadId}`}
                        className="rounded-[22px] border border-[#dfe8f1] bg-white p-4 shadow-[0_16px_32px_rgba(24,45,68,0.07)]"
                        onClick={() => {
                          setSelectedLeadId(lead.leadId)
                          navigate(`/pipeline/leads/${lead.leadId}`)
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[0.78rem] font-bold text-white" style={{ backgroundColor: agentColor }}>
                              {getInitials(leadName)}
                            </span>
                            <div className="min-w-0">
                              <h4 className="truncate text-[1rem] font-semibold text-[#142132]">{leadName}</h4>
                              <p className="mt-1 truncate text-sm text-[#60758b]">{interestedListing}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${getLeadStageTone(funnelStage)}`}>
                            {funnelStage}
                          </span>
                        </div>
                        <div className="mt-4 grid gap-3 rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] p-3">
                          <div>
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Next Step</p>
                            <p className="mt-1 text-sm font-semibold text-[#2d4560]">{nextStep}</p>
                            <span className={`mt-1 inline-flex items-center gap-1.5 text-[0.7rem] font-semibold ${nextStepStatus.text}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${nextStepStatus.tone}`} />
                              {nextStepStatus.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Agent</p>
                              <p className="mt-1 truncate font-medium text-[#2d4560]">{assignedAgent}</p>
                            </div>
                            <div>
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Activity</p>
                              <p className="mt-1 truncate font-medium text-[#2d4560]">{formatDateShort(activityReference)}</p>
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })
                ) : (
                  <div className="rounded-[22px] border border-dashed border-[#d6e2ef] bg-[#fbfdff] px-5 py-8 text-center">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-[18px] bg-[#edf4fb] text-[#35546c]">
                      <UserRound size={22} />
                    </div>
                    <h4 className="mt-4 text-[1.05rem] font-semibold tracking-[-0.025em] text-[#142132]">
                      {leadTypeView === 'seller' ? 'No seller leads yet' : 'No buyer leads yet'}
                    </h4>
                    <p className="mt-2 text-sm leading-6 text-[#60758b]">Create your first lead to start building the pipeline.</p>
                  </div>
                )}
              </div>
              </>
              )}
            </article>
            ) : null}

            {isLeadWorkspaceRoute ? (
            <article className="space-y-4">
              <div className="rounded-[24px] border border-[#dfe8f2] bg-white p-5 shadow-[0_18px_44px_rgba(31,54,78,0.08)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-3">
                    <button
                      type="button"
                      className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f7894] transition hover:text-[#1f4f78]"
                      onClick={() => navigate('/pipeline/leads')}
                    >
                      ← Back to Leads
                    </button>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8da3]">Lead Workspace</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-2xl font-semibold tracking-[-0.035em] text-[#102033]">
                          {[selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ') || 'Seller Lead'}
                        </h3>
                        {selectedLead ? (
                          <span className="rounded-full border border-[#d8e5f2] bg-[#f5f9fd] px-3 py-1 text-xs font-semibold text-[#294c6e]">
                            {selectedLeadIsSeller ? 'Seller' : 'Buyer'} Lead
                          </span>
                        ) : null}
                        {selectedLead ? (
                          <span className="rounded-full border border-[#d9e7f5] bg-[#eef6fd] px-3 py-1 text-xs font-semibold text-[#1f5f8a]">
                            {resolveLeadFunnelStage(selectedLead)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {selectedLead ? (
                      <div className="grid gap-3 text-sm text-[#526b84] md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7c8fa5]">Assigned Agent</p>
                          <p className="mt-1 font-semibold text-[#203a54]">{selectedLead.assignedAgentName || selectedLead.assignedAgentEmail || 'Unassigned'}</p>
                        </div>
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7c8fa5]">Contact</p>
                          <p className="mt-1 font-semibold text-[#203a54]">{selectedLeadContact?.phone || 'No phone'} · {selectedLeadContact?.email || 'No email'}</p>
                        </div>
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7c8fa5]">Property / Listing</p>
                          <p className="mt-1 truncate font-semibold text-[#203a54]">
                            {selectedLead.listingId || selectedLead.sellerPropertyAddress || selectedLead.propertyInterest || 'Not linked yet'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7c8fa5]">Next Step</p>
                          <p className="mt-1 truncate font-semibold text-[#203a54]">{selectedLeadNextStep || 'No next step set'}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {selectedLeadIsSeller ? (
                    <div className={`rounded-[16px] border px-3 py-2 text-xs ${
                      selectedLeadOnboardingCompleted
                        ? 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]'
                        : 'border-[#f1d8d0] bg-[#fff5f3] text-[#973824]'
                    }`}>
                      <p className="font-semibold">
                        Seller onboarding: {selectedLeadOnboardingStatusKey.replace(/_/g, ' ')}
                      </p>
                      <p className="mt-0.5 max-w-[260px]">
                        {selectedLeadOnboardingCompleted
                          ? 'Complete. Mandate generation is available.'
                          : 'Not complete yet. Mandate generation can still continue.'}
                      </p>
                      {selectedLeadOnboardingTimestamp ? (
                        <p className="mt-1 font-semibold">{formatDate(selectedLeadOnboardingTimestamp)}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {selectedLead ? (
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#e8eef5] pt-4">
                    {selectedLeadIsSeller ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleSendSellerOnboarding}
                          disabled={selectedLeadOnboardingCompleted || isSellerOnboardingSending}
                        >
	                          {selectedLeadOnboardingCompleted
	                            ? 'Onboarding Completed'
	                            : isSellerOnboardingSending
	                              ? 'Sending…'
	                              : selectedLeadOnboardingStatusKey === 'not_sent'
	                                ? 'Send Seller Onboarding'
	                                : 'Resend Seller Onboarding'}
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={handleScheduleSellerAppointment}>
                          Schedule Appointment
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleSelectedLeadMandatePrimaryAction()}
                          disabled={isMandateGenerating || isMandateSending}
                          title={
                            !selectedLeadHasMandateData && selectedLeadMandateActionState.actionKey === 'generate'
                                ? 'Open the legal workspace and complete missing seller/property details manually.'
                              : selectedLeadMandateActionMeta
                          }
                        >
                          {isMandateGenerating
                            ? 'Generating…'
                            : isMandateSending
                              ? 'Sending…'
                              : selectedLeadMandateActionState.label}
                        </Button>
                        <Button type="button" size="sm" className="bg-[#123955] shadow-[0_10px_24px_rgba(18,57,85,0.18)]" onClick={handleCreateListingFromSellerLead}>
                          {selectedLeadMandateSigned ? 'Convert to Listing' : 'Convert to Listing (Override)'}
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => openArchiveLeadModal(selectedLead.leadId)}>
                          Archive Lead
                        </Button>
                        <Button type="button" variant="secondary" size="sm" className="border-[#f1d0ca] text-[#9f3a2f] hover:bg-[#fff6f4]" onClick={() => openDeleteLeadModal(selectedLead.leadId)}>
                          Delete Lead
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button type="button" variant="secondary" size="sm" onClick={() => handleOpenAppointmentModal()}>
                          Schedule Appointment
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleCreateBuyerOfferDraft()}
                          disabled={Boolean(selectedLead.convertedTransactionId || selectedLead.convertedDealId)}
                        >
                          {selectedLead.convertedTransactionId || selectedLead.convertedDealId ? 'Transaction Created' : 'Create Offer'}
                        </Button>
                        <Button type="button" variant="secondary" size="sm" disabled title="OTP generation is available once a transaction is linked.">
                          Generate OTP
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => openArchiveLeadModal(selectedLead.leadId)}>
                          Archive Lead
                        </Button>
                        <Button type="button" variant="secondary" size="sm" className="border-[#f1d0ca] text-[#9f3a2f] hover:bg-[#fff6f4]" onClick={() => openDeleteLeadModal(selectedLead.leadId)}>
                          Delete Lead
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
              {selectedLead ? (
                <div className="overflow-x-auto rounded-[18px] border border-[#dfe8f2] bg-white p-1.5 shadow-[0_10px_28px_rgba(31,54,78,0.05)]" role="tablist" aria-label="Lead workspace sections">
                  <div className="flex min-w-max items-center gap-1">
                  {[
                    { key: 'overview', label: 'Overview', meta: 'Summary' },
                    {
                      key: 'activity',
                      label: 'Activity',
                      meta: selectedLeadActivities.length,
                    },
                    {
                      key: 'tasks',
                      label: 'Tasks',
                      meta: selectedLeadTasks.length,
                    },
                    {
                      key: 'appointments',
                      label: 'Appointments',
                      meta: selectedLeadAppointments.length,
                    },
                  ].map((tab) => {
                    const isActive = leadWorkspaceTab === tab.key
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setLeadWorkspaceTab(tab.key)}
                        role="tab"
                        aria-selected={isActive}
                        className={`rounded-[14px] px-4 py-2.5 text-left transition ${
                          isActive
                            ? 'bg-[#eaf3fb] text-[#123955]'
                            : 'text-[#536a83] hover:bg-[#f7faff] hover:text-[#1f4f78]'
                        }`}
                      >
                        <span className="block text-sm font-semibold leading-tight">
                          {tab.label}
                        </span>
                        <span className={`mt-0.5 block text-[0.7rem] font-semibold leading-tight ${isActive ? 'text-[#2b6c99]' : 'text-[#90a2b6]'}`}>
                          {tab.key === 'overview' ? tab.meta : `${tab.label} · ${tab.meta}`}
                        </span>
                      </button>
                    )
                  })}
                  </div>
                </div>
              ) : null}
              {selectedLead ? (
                <div className={`mt-3 grid gap-4 ${leadWorkspaceTab === 'overview' ? 'xl:grid-cols-[1.65fr_0.95fr]' : ''}`}>
                  <div className="space-y-4">
                  {leadWorkspaceTab === 'overview' ? (
                  <div className="space-y-4">
                    <div className="rounded-[20px] border border-[#e0e8f2] bg-white p-4 shadow-[0_12px_30px_rgba(31,54,78,0.06)]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ea4]">Lead Summary</p>
                          <h4 className="mt-1 text-base font-semibold text-[#172b3f]">
                            {[selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ') || 'Lead Contact'}
                          </h4>
                        </div>
                        <div className="w-full sm:w-56">
                          <Field as="select" value={selectedLead.stage} onChange={(event) => handleUpdateLeadStage(selectedLead.leadId, event.target.value)}>
                            {LEAD_STAGES.map((stage) => (
                              <option key={stage} value={stage}>
                                {stage}
                              </option>
                            ))}
                          </Field>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {[
                          ['Seller name', [selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ') || 'Lead Contact'],
                          ['Phone', selectedLeadContact?.phone || 'No phone'],
                          ['Email', selectedLeadContact?.email || 'No email'],
                          ['Lead source', selectedLead.leadSource || 'Not captured'],
                          ['Lead channel', selectedLead.leadDirection || 'Not captured'],
                          ['Pipeline value', formatCurrency(selectedLead.estimatedValue || selectedLead.budget)],
                          ['Property type', selectedLead.propertyInterest || 'Not captured'],
                          ['Budget', formatCurrency(selectedLead.budget)],
                          ['Preferred area', selectedLead.areaInterest || selectedLead.sellerPropertyAddress || 'Not captured'],
                          ['Linked listing/property', selectedLead.listingId || selectedLead.sellerPropertyAddress || selectedLead.propertyInterest || 'Not linked yet'],
                          [
                            'Linked appointment',
                            selectedLeadLinkedAppointment
                              ? `${getAppointmentTypeLabel(selectedLeadLinkedAppointment?.appointmentType) || 'Appointment'} · ${formatDate(selectedLeadLinkedAppointment?.dateTime || selectedLeadLinkedAppointment?.createdAt)}`
                              : 'Not linked yet',
                          ],
                          ['Linked transaction', selectedLeadLinkedTransaction?.transactionId || selectedLeadLinkedTransaction?.dealId || 'Not linked yet'],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-[14px] border border-[#e6edf5] bg-[#fbfdff] px-3 py-2.5">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8395aa]">{label}</p>
                            <p className="mt-1 truncate text-sm font-semibold text-[#263f58]" title={String(value)}>
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <form className="rounded-[20px] border border-[#e0e8f2] bg-white p-4 shadow-[0_12px_30px_rgba(31,54,78,0.05)]" onSubmit={handleSaveLeadDetails}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-[#172b3f]">Lead Details</h4>
                          <p className="mt-1 text-xs text-[#6d839b]">Update the contact and property basics for this lead.</p>
                        </div>
                        <Button type="submit" size="sm" disabled={isLeadDetailSaving}>
                          {isLeadDetailSaving ? 'Saving...' : 'Save Details'}
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Field placeholder="First name" value={leadDetailForm.firstName} onChange={(event) => updateLeadDetailField('firstName', event.target.value)} />
                        <Field placeholder="Last name" value={leadDetailForm.lastName} onChange={(event) => updateLeadDetailField('lastName', event.target.value)} />
                        <Field placeholder="Phone" value={leadDetailForm.phone} onChange={(event) => updateLeadDetailField('phone', event.target.value)} />
                        <Field placeholder="Email" value={leadDetailForm.email} onChange={(event) => updateLeadDetailField('email', event.target.value)} />
                        <Field as="select" value={leadDetailForm.leadSource} onChange={(event) => updateLeadDetailField('leadSource', event.target.value)}>
                          {MANUAL_LEAD_SOURCE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Field>
                        <Field as="select" value={leadDetailForm.leadDirection} onChange={(event) => updateLeadDetailField('leadDirection', event.target.value)}>
                          {['Inbound', 'Outbound'].map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Field>
                        <Field as="select" value={leadDetailForm.priority} onChange={(event) => updateLeadDetailField('priority', event.target.value)}>
                          {LEAD_PRIORITIES.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Field>
                        <Field placeholder="Area of interest" value={leadDetailForm.areaInterest} onChange={(event) => updateLeadDetailField('areaInterest', event.target.value)} />
                        <Field placeholder="Budget" value={leadDetailForm.budget} onChange={(event) => updateLeadDetailField('budget', event.target.value)} />
                        <Field placeholder="Estimated value" value={leadDetailForm.estimatedValue} onChange={(event) => updateLeadDetailField('estimatedValue', event.target.value)} />
                        <Field placeholder="Property type / interest" value={leadDetailForm.propertyInterest} onChange={(event) => updateLeadDetailField('propertyInterest', event.target.value)} />
                        <Field placeholder="Seller property address" value={leadDetailForm.sellerPropertyAddress} onChange={(event) => updateLeadDetailField('sellerPropertyAddress', event.target.value)} />
                      </div>
                      <div className="mt-3">
                        <Field
                          as="textarea"
                          rows={3}
                          placeholder="Notes"
                          value={leadDetailForm.notes}
                          onChange={(event) => updateLeadDetailField('notes', event.target.value)}
                        />
                      </div>
                    </form>

                    <div className="rounded-[20px] border border-[#e0e8f2] bg-white p-4 shadow-[0_12px_30px_rgba(31,54,78,0.05)]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-[#172b3f]">Documents</h4>
                          <p className="mt-1 text-xs text-[#6d839b]">Generated packets and signed documents for this lead.</p>
                        </div>
                        <Upload className="h-4 w-4 text-[#7890a8]" />
                      </div>
                      <div className="mt-3 rounded-[16px] border border-dashed border-[#cfdae8] bg-[#fbfdff] px-4 py-6 text-center text-sm text-[#6f839c]">
                        No linked documents yet.
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-[#e0e8f2] bg-white p-4 shadow-[0_12px_30px_rgba(31,54,78,0.05)]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-[#172b3f]">Lead Updates</h4>
                          <p className="mt-1 text-xs text-[#6d839b]">Latest activity preview for this lead.</p>
                        </div>
                        <span className="rounded-full bg-[#eef5fb] px-2 py-1 text-xs font-semibold text-[#315b7a]">
                          {selectedLeadActivities.length}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {selectedLeadActivities.slice(0, 4).length ? (
                          selectedLeadActivities.slice(0, 4).map((row) => (
                            <div key={row.activityId} className="flex gap-3 rounded-[14px] border border-[#e7eef6] bg-[#fbfdff] px-3 py-2.5 text-xs">
                              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#eaf3fb] text-[#285b7d]">
                                <Columns3 className="h-3.5 w-3.5" />
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold text-[#263f58]">{row.activityType || 'Lead update'}</p>
                                <p className="mt-0.5 line-clamp-2 text-[#647a92]">{row.activityNote || row.outcome || 'No note captured'}</p>
                                <p className="mt-1 text-[#91a2b5]">{formatDate(row.activityDate || row.createdAt)}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[14px] border border-dashed border-[#d7e2ef] bg-[#fbfdff] px-4 py-5 text-center text-sm text-[#6f839c]">
                            No lead updates yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  ) : null}

                  {leadWorkspaceTab === 'activity' ? (
                  <div className="space-y-2 rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-[#28435e]">{editingActivityId ? 'Edit Activity' : 'Activities'}</h4>
                      {editingActivityId ? (
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={resetActivityComposer}>
                          <X className="h-4 w-4" />
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                    <form className="grid gap-2" onSubmit={handleAddActivity}>
                      <Field as="select" value={activityForm.activityType} onChange={(event) => setActivityForm((previous) => ({ ...previous, activityType: event.target.value }))}>
                        {ACTIVITY_TYPES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Field>
                      <Field
                        placeholder="Activity note"
                        value={activityForm.activityNote}
                        onChange={(event) => setActivityForm((previous) => ({ ...previous, activityNote: event.target.value }))}
                      />
                      <Field placeholder="Outcome (optional)" value={activityForm.outcome} onChange={(event) => setActivityForm((previous) => ({ ...previous, outcome: event.target.value }))} />
                      <Button type="submit">{editingActivityId ? 'Save Activity' : 'Log Activity'}</Button>
                    </form>
                    <div className="max-h-44 space-y-2 overflow-auto pt-1">
                      {selectedLeadActivities.length ? (
                        selectedLeadActivities.map((row) => (
                          <div key={row.activityId} className="rounded-[10px] border border-[#e7edf5] bg-[#fbfdff] px-2.5 py-2 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-[#29435d]">{row.activityType}</p>
                                <p className="mt-0.5 text-[#7a8ea5]">{formatDate(row.activityDate || row.createdAt)}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2"
                                  title="Edit activity"
                                  onClick={() => handleEditActivity(row)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-[#a94442]"
                                  title="Delete activity"
                                  onClick={() => void handleDeleteActivity(row)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <p className="mt-0.5 text-[#587089]">{row.activityNote || 'No note'}</p>
                            {normalizeText(row.outcome) ? <p className="mt-0.5 text-[#7a8ea5]">Outcome: {row.outcome}</p> : null}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[#6d839b]">No activity logged yet.</p>
                      )}
                    </div>
                  </div>
                  ) : null}

                  {leadWorkspaceTab === 'tasks' ? (
                  <div className="space-y-2 rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-[#28435e]">{editingTaskId ? 'Edit Follow-up Task' : 'Tasks / Follow-ups'}</h4>
                      {editingTaskId ? (
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={resetTaskComposer}>
                          <X className="h-4 w-4" />
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                    <form className="grid gap-2" onSubmit={handleCreateTask}>
                      <Field placeholder="Task title" value={taskForm.title} onChange={(event) => setTaskForm((previous) => ({ ...previous, title: event.target.value }))} />
                      <Field
                        placeholder="Description"
                        value={taskForm.description}
                        onChange={(event) => setTaskForm((previous) => ({ ...previous, description: event.target.value }))}
                      />
                      <Field type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((previous) => ({ ...previous, dueDate: event.target.value }))} />
                      <Field as="select" value={taskForm.priority} onChange={(event) => setTaskForm((previous) => ({ ...previous, priority: event.target.value }))}>
                        {TASK_PRIORITIES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Field>
                      <Button type="submit">{editingTaskId ? 'Save Task' : 'Create Task'}</Button>
                    </form>
                    <div className="max-h-40 space-y-2 overflow-auto pt-1">
                      {selectedLeadTasks.length ? (
                        selectedLeadTasks.map((task) => (
                          <div
                            key={task.taskId}
                            className="rounded-[10px] border border-[#e7edf5] bg-[#fbfdff] px-2.5 py-2 text-xs"
                          >
                            <p className="font-semibold text-[#29435d]">{task.title}</p>
                            <p className="mt-0.5 text-[#587089]">Due: {task.dueDate || 'No date'} • {task.priority}</p>
                            <p className="mt-0.5 text-[#7a8ea5]">Status: {task.status}</p>
                            {normalizeText(task.description) ? <p className="mt-0.5 text-[#7a8ea5]">{task.description}</p> : null}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Button type="button" size="sm" variant="secondary" className="h-8 px-2 text-xs" onClick={() => void handleTaskStatusToggle(task)}>
                                <CheckSquare className="h-4 w-4" />
                                {normalizeText(task?.status) === 'Completed' ? 'Reopen' : 'Complete'}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2"
                                title="Edit task"
                                onClick={() => handleEditTask(task)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-[#a94442]"
                                title="Delete task"
                                onClick={() => void handleDeleteTask(task)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[#6d839b]">No follow-up tasks yet.</p>
                      )}
                    </div>
                  </div>
                  ) : null}

                  {leadWorkspaceTab === 'appointments' ? (
                  <div className="space-y-2 rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                    <h4 className="text-sm font-semibold text-[#28435e]">Appointments</h4>
                    <form className="grid gap-2" onSubmit={handleCreateAppointment}>
                      <Field
                        placeholder="Appointment title"
                        value={appointmentForm.title}
                        onChange={(event) => setAppointmentForm((previous) => ({ ...previous, title: event.target.value }))}
                      />
                      <Field
                        as="select"
                        value={appointmentForm.appointmentType}
                        onChange={(event) => handleAppointmentTypeChange(event.target.value)}
                      >
                        {APPOINTMENT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Field>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field type="date" value={appointmentForm.date} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, date: event.target.value }))} />
                        <Field type="time" value={appointmentForm.startTime} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, startTime: event.target.value }))} />
                      </div>
                      <Field placeholder="Location" value={appointmentForm.location} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, location: event.target.value }))} />
                      <Field as="select" value={appointmentForm.status} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, status: event.target.value }))}>
                        {APPOINTMENT_STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Field>
                      <Field placeholder="Notes" value={appointmentForm.notes} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, notes: event.target.value }))} />
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit">Book Appointment</Button>
                        <Button type="button" variant="secondary" onClick={() => handleOpenAppointmentModal()}>
                          Open Full Form
                        </Button>
                      </div>
                    </form>
                    <div className="max-h-36 space-y-2 overflow-auto pt-1">
                      {selectedLeadAppointments.length ? (
                        selectedLeadAppointments.map((appointment) => (
                          <button
                            key={appointment.appointmentId}
                            type="button"
                            onClick={() => handleOpenAppointmentModal(appointment)}
                            className="w-full rounded-[10px] border border-[#e7edf5] bg-[#fbfdff] px-2.5 py-2 text-left text-xs"
                          >
                            <p className="font-semibold text-[#29435d]">{getAppointmentTypeLabel(appointment.appointmentType)}</p>
                            <p className="mt-0.5 text-[#587089]">{formatDate(appointment.dateTime)} • {appointment.status}</p>
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-[#6d839b]">No appointments yet.</p>
                      )}
                    </div>
                  </div>
                  ) : null}

                  </div>

                  {leadWorkspaceTab === 'overview' ? (
                  <aside className="space-y-3">
                    <div className="rounded-[20px] border border-[#e0e8f2] bg-white p-4 shadow-[0_12px_30px_rgba(31,54,78,0.05)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ea4]">Workflow Health</p>
                          <p className="mt-1 text-lg font-semibold text-[#172b3f]">
                            {selectedLeadWorkflowHealth.completed}/{selectedLeadWorkflowHealth.total} steps complete
                          </p>
                        </div>
                        <span className="rounded-full bg-[#eef7f1] px-2.5 py-1 text-xs font-semibold text-[#247345]">
                          {selectedLeadWorkflowHealth.percent}%
                        </span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-[#e3ebf4]">
                        <span className="block h-full rounded-full bg-[#2f7b9e]" style={{ width: `${selectedLeadWorkflowHealth.percent}%` }} />
                      </div>
                      <div className="mt-3 space-y-2">
                        {selectedLeadWorkflowHealth.items?.map((item) => (
                          <div key={item.key} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e7eef6] bg-[#fbfdff] px-3 py-2 text-xs">
                            <span className="font-medium text-[#435b74]">{item.label}</span>
                            <span className={`rounded-full px-2 py-0.5 font-semibold ${
                              item.done ? 'bg-[#eaf7ef] text-[#1e7a46]' : 'bg-[#fff6e8] text-[#a35f14]'
                            }`}>
                              {item.done ? 'Done' : 'Missing'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-[#e0e8f2] bg-white p-4 shadow-[0_12px_30px_rgba(31,54,78,0.05)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ea4]">Linked Records</p>
                      <div className="mt-3 space-y-2">
                        {[
                          ['Listing', selectedLead.listingId || selectedLead.propertyInterest || selectedLead.sellerPropertyAddress || 'Not linked yet'],
                          ['Transaction', selectedLeadLinkedTransaction?.transactionId || selectedLeadLinkedTransaction?.dealId || 'Not linked yet'],
                          ['Appointment', selectedLeadLinkedAppointment ? getAppointmentTypeLabel(selectedLeadLinkedAppointment.appointmentType) : 'Not linked yet'],
                        ].map(([label, value]) => (
                          <div key={label} className="flex items-start justify-between gap-3 rounded-[12px] border border-[#e7eef6] bg-[#fbfdff] px-3 py-2 text-xs">
                            <span className="font-semibold text-[#7b8ea4]">{label}</span>
                            <span className="max-w-[62%] text-right font-semibold text-[#263f58]">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-[#e0e8f2] bg-white p-4 shadow-[0_12px_30px_rgba(31,54,78,0.05)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ea4]">
                        {normalizeText(selectedLead.leadCategory).toLowerCase() === 'seller' ? 'Mandate / Listing' : 'Offers / Transaction'}
                      </p>
                      {normalizeText(selectedLead.leadCategory).toLowerCase() === 'seller' ? (
                        <div className="mt-3 space-y-2 text-xs">
                          <div className="rounded-[12px] bg-[#fbfdff] px-3 py-2">
                            <p className="font-semibold text-[#7b8ea4]">Mandate ID</p>
                            <p className="mt-1 break-all font-semibold text-[#263f58]">{normalizeText(selectedLead?.mandatePacketId || selectedLead?.mandatePacket?.id) || 'Not generated yet'}</p>
                          </div>
                          <div className="rounded-[12px] bg-[#fbfdff] px-3 py-2">
                            <p className="font-semibold text-[#7b8ea4]">Listing ID</p>
                            <p className="mt-1 break-all font-semibold text-[#263f58]">{normalizeText(selectedLead?.listingId || selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress) || 'Not linked yet'}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2 text-xs">
                          <div className="rounded-[12px] bg-[#fbfdff] px-3 py-2">
                            <p className="font-semibold text-[#7b8ea4]">Offers</p>
                            <p className="mt-1 font-semibold text-[#263f58]">{selectedLeadLinkedTransaction ? 'Offer linked to transaction' : 'No accepted offer linked yet'}</p>
                          </div>
                          <div className="rounded-[12px] bg-[#fbfdff] px-3 py-2">
                            <p className="font-semibold text-[#7b8ea4]">Transaction</p>
                            <p className="mt-1 font-semibold text-[#263f58]">{selectedLeadLinkedTransaction?.transactionId || selectedLeadLinkedTransaction?.dealId || 'Not created yet'}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-[20px] border border-[#e0e8f2] bg-white p-4 shadow-[0_12px_30px_rgba(31,54,78,0.05)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ea4]">Notes / Comments</p>
                      <div className="mt-3 rounded-[14px] border border-[#e7eef6] bg-[#fbfdff] px-3 py-3 text-sm text-[#5f7590]">
                        {selectedLeadNotes || 'No notes yet.'}
                      </div>
                    </div>
                  </aside>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 rounded-[14px] border border-dashed border-[#d7e2ef] bg-[#f9fbfe] px-4 py-5 text-sm text-[#6f839c]">
                  {routeLeadId ? 'Loading this lead workspace. If it was just converted, it will appear here as soon as the local pipeline store refreshes.' : 'Select a lead from the pipeline board to open the CRM workspace.'}
                </p>
              )}
            </article>
            ) : null}
          </section>
        </>
      )}

      <Modal
        open={leadArchiveModal.open}
        onClose={() => setLeadArchiveModal((previous) => ({ ...previous, open: false }))}
        title="Archive Lead"
        subtitle="Move this lead out of the active pipeline while keeping the full activity history."
        className="max-w-lg"
      >
        <div className="grid gap-3">
          <Field
            as="select"
            value={leadArchiveModal.reason}
            onChange={(event) => setLeadArchiveModal((previous) => ({ ...previous, reason: event.target.value }))}
          >
            {LEAD_LOST_REASON_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Field>
          <Field
            as="textarea"
            rows={3}
            placeholder="Optional notes"
            value={leadArchiveModal.notes}
            onChange={(event) => setLeadArchiveModal((previous) => ({ ...previous, notes: event.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLeadArchiveModal((previous) => ({ ...previous, open: false }))}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleArchiveLead()}>
              Archive Lead
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={leadDeleteModal.open}
        onClose={() => setLeadDeleteModal({ open: false, leadId: '', confirmText: '', error: '' })}
        title="Delete Lead"
        subtitle="Permanently remove this lead from the pipeline. Archive instead if you want to preserve the full history."
        className="max-w-lg"
      >
        <div className="grid gap-3">
          <div className="rounded-[14px] border border-[#f1d0ca] bg-[#fff7f5] px-4 py-3 text-sm text-[#8d3529]">
            This cannot be undone. Related local activities and follow-up tasks will be removed, and linked appointments will be detached from the lead.
          </div>
          {leadDeleteModal.error ? (
            <div className="rounded-[14px] border border-[#f6d4d4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f1d1d]">
              {leadDeleteModal.error}
            </div>
          ) : null}
          <Field
            placeholder="Type DELETE to confirm"
            value={leadDeleteModal.confirmText}
            onChange={(event) => setLeadDeleteModal((previous) => ({ ...previous, confirmText: event.target.value, error: '' }))}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLeadDeleteModal({ open: false, leadId: '', confirmText: '', error: '' })}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleDeleteLead()} disabled={normalizeText(leadDeleteModal.confirmText).toUpperCase() !== 'DELETE'}>
              Delete Lead
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showLeadForm && !isCalendarMode}
        onClose={() => {
          setShowLeadForm(false)
          clearLeadForm()
        }}
        title="Create Lead"
        subtitle="Capture a buyer or seller lead and move it straight into your CRM workspace."
        className="max-w-3xl"
      >
        <form className="grid gap-3" onSubmit={handleCreateLead}>
          <div className="rounded-[14px] border border-[#dbe4ee] bg-[#f8fbff] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Lead Type</p>
            <div className="mt-2 inline-flex items-center rounded-full border border-[#dbe4ee] bg-white p-1">
              <button
                type="button"
                onClick={() => updateLeadFormField('leadCategory', 'Buyer')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  normalizeText(leadForm.leadCategory).toLowerCase() === 'buyer'
                    ? 'bg-[#1f4f78] text-white'
                    : 'text-[#51667f] hover:text-[#1f4f78]'
                }`}
              >
                Buyer Lead
              </button>
              <button
                type="button"
                onClick={() => setLeadForm((previous) => ({ ...previous, leadCategory: 'Seller', linkedListing: '' }))}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  normalizeText(leadForm.leadCategory).toLowerCase() === 'seller'
                    ? 'bg-[#1f4f78] text-white'
                    : 'text-[#51667f] hover:text-[#1f4f78]'
                }`}
              >
                Seller Lead
              </button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <Field placeholder="Name *" value={leadForm.firstName} onChange={(event) => updateLeadFormField('firstName', event.target.value)} />
            <Field placeholder="Surname *" value={leadForm.lastName} onChange={(event) => updateLeadFormField('lastName', event.target.value)} />
            <Field placeholder="Phone *" value={leadForm.phone} onChange={(event) => updateLeadFormField('phone', event.target.value)} />
            <Field placeholder="Email *" value={leadForm.email} onChange={(event) => updateLeadFormField('email', event.target.value)} />
            <Field as="select" value={leadForm.leadSource} onChange={(event) => updateLeadFormField('leadSource', event.target.value)}>
              {leadSourceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Field>
            <Field as="select" value={leadForm.priority} onChange={(event) => updateLeadFormField('priority', event.target.value)}>
              {LEAD_PRIORITIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Field>
            {isPrincipal ? (
              <Field as="select" value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
                {agentOptions.map((agent) => (
                  <option key={`${agent.id}:${agent.email}`} value={agent.id || agent.email}>
                    {agent.name}
                  </option>
                ))}
              </Field>
            ) : null}
          </div>

          {normalizeText(leadForm.leadCategory).toLowerCase() === 'seller' ? (
            <div className="grid gap-2 md:grid-cols-2">
              <Field placeholder="Property Area (optional)" value={leadForm.propertyArea} onChange={(event) => updateLeadFormField('propertyArea', event.target.value)} />
              <Field placeholder="Property Type (optional)" value={leadForm.propertyType} onChange={(event) => updateLeadFormField('propertyType', event.target.value)} />
              <Field placeholder="Estimated Property Value (optional)" value={leadForm.estimatedValue} onChange={(event) => updateLeadFormField('estimatedValue', event.target.value)} />
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              <Field as="select" value={leadForm.linkedListing} onChange={(event) => updateLeadFormField('linkedListing', event.target.value)}>
                <option value="">No listing selected</option>
                {appointmentListingOptions.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.label}
                  </option>
                ))}
              </Field>
              <Field placeholder="Budget (optional)" value={leadForm.budget} onChange={(event) => updateLeadFormField('budget', event.target.value)} />
              <Field placeholder="Area Interest (optional)" value={leadForm.areaInterest} onChange={(event) => updateLeadFormField('areaInterest', event.target.value)} />
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            <Field type="date" value={leadForm.nextFollowUpDate} onChange={(event) => updateLeadFormField('nextFollowUpDate', event.target.value)} />
            <Field placeholder="Next follow-up note (optional)" value={leadForm.nextFollowUpNote} onChange={(event) => updateLeadFormField('nextFollowUpNote', event.target.value)} />
          </div>

          <Field as="textarea" rows={3} placeholder="Notes (optional)" value={leadForm.notes} onChange={(event) => updateLeadFormField('notes', event.target.value)} />

          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isLeadCreating}
              onClick={() => {
                setShowLeadForm(false)
                clearLeadForm()
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLeadCreating || !organisationId}>
              {isLeadCreating ? 'Creating...' : 'Create Lead'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={appointmentModalOpen}
        onClose={() => {
          setAppointmentModalOpen(false)
          setAppointmentSchedulingError('')
          setAppointmentSchedulingLoading(false)
        }}
        title={selectedAppointmentId ? 'Appointment Details' : 'Create Appointment'}
        subtitle="Manage appointment scheduling, participants, RSVP responses, and outcomes."
        className="max-w-4xl"
      >
        <form className="grid gap-3" onSubmit={handleSaveAppointmentDetail}>
          {selectedAppointmentId && selectedAppointment ? (
            <div className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-[#1f3952]">Appointment Snapshot</h4>
                  <p className="mt-1 text-xs text-[#6a8098]">Bridge is the master record. Calendar files and RSVP links are generated from this appointment.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={handleCopyAppointmentLink}>Copy Link</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={handleResendAppointmentInvite}>Resend Invite</Button>
                  <Button type="button" variant="secondary" size="sm" className="border-[#f0c8c5] text-[#9f3028]" onClick={handleCancelAppointment}>Cancel Appointment</Button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">Who:</span> {selectedAppointment.participants?.map((person) => person?.name || person?.email).filter(Boolean).join(', ') || (selectedAppointment.assignedAgentName || selectedAppointment.assignedAgentEmail || 'Unassigned')}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">What:</span> {selectedAppointment.title || getAppointmentTypeLabel(selectedAppointment.appointmentType) || 'Appointment'}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">When:</span> {formatDate(selectedAppointment.dateTime)}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">Where:</span> {selectedAppointment.location || 'Location pending'}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">Listing:</span> {resolveAppointmentListingLabel(selectedAppointment.listingId) || 'Not linked'}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">Why:</span> {getAppointmentTypeLabel(selectedAppointment.appointmentType) || selectedAppointment.nextStep || 'Meeting follow-up'}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">Status:</span> {APPOINTMENT_STATUS_LABELS[selectedAppointment.status] || selectedAppointment.status || 'Requested'}</p>
              </div>
              {(selectedAppointment.notes || selectedAppointment.clientFeedback || selectedAppointment.agentNotes || selectedAppointment.outcomeSummary) ? (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <p className="rounded-[10px] border border-[#e3ebf5] bg-white px-2 py-1 text-xs text-[#4f6780]">
                    <span className="font-semibold text-[#233f58]">Notes:</span> {selectedAppointment.notes || '—'}
                  </p>
                  <p className="rounded-[10px] border border-[#e3ebf5] bg-white px-2 py-1 text-xs text-[#4f6780]">
                    <span className="font-semibold text-[#233f58]">Comments:</span> {selectedAppointment.clientFeedback || selectedAppointment.agentNotes || selectedAppointment.outcomeSummary || '—'}
                  </p>
                </div>
              ) : null}
              <div className="mt-2">
                <AppointmentCalendarActions
                  appointment={selectedAppointment}
                  compact
                  preferServerGeneration
                  onError={(calendarError) => setError(calendarError?.message || 'Calendar invite could not be generated.')}
                />
              </div>
            </div>
          ) : null}

          <div className="rounded-[16px] border border-[#dce6f2] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6f839c]">Appointment Details</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Field
                placeholder="Appointment title"
                value={appointmentForm.title}
                onChange={(event) => setAppointmentForm((previous) => ({ ...previous, title: event.target.value }))}
              />
              <Field
                as="select"
                value={appointmentForm.appointmentType}
                onChange={(event) => handleAppointmentTypeChange(event.target.value)}
              >
                <option value="">Select appointment type</option>
                {APPOINTMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Field>
              {appointmentForm.appointmentType === 'other' ? (
                <Field
                  placeholder="Custom type label"
                  value={appointmentForm.customTypeLabel}
                  onChange={(event) => setAppointmentForm((previous) => ({ ...previous, customTypeLabel: event.target.value }))}
                />
              ) : null}
              <Field
                as="select"
                value={appointmentForm.locationType}
                onChange={(event) => setAppointmentForm((previous) => ({ ...previous, locationType: event.target.value }))}
              >
                <option value="physical_address">Physical address</option>
                <option value="video_call">Google Meet / Video Call</option>
                <option value="phone_call">Phone Call</option>
                <option value="to_be_confirmed">To be confirmed</option>
              </Field>
              <Field placeholder="Location / address" value={appointmentForm.location} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, location: event.target.value }))} />
              <Field placeholder="Meeting link (optional)" value={appointmentForm.meetingUrl} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, meetingUrl: event.target.value }))} />
              <Field as="textarea" rows={3} placeholder="Description / agenda" value={appointmentForm.notes} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, notes: event.target.value }))} className="md:col-span-2" />
            </div>
          </div>

          <div className="rounded-[16px] border border-[#dce6f2] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6f839c]">Date & Time</p>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <Field type="date" value={appointmentForm.date} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, date: event.target.value }))} />
              <Field type="time" value={appointmentForm.startTime} disabled={appointmentForm.allDay} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, startTime: event.target.value }))} />
              <Field type="time" value={appointmentForm.endTime} disabled={appointmentForm.allDay} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, endTime: event.target.value }))} />
              <Field value={appointmentForm.timezone} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, timezone: event.target.value }))} />
              <label className="flex items-center gap-2 rounded-[10px] border border-[#dce6f2] bg-[#f8fbff] px-3 py-2 text-xs text-[#33536d] md:col-span-4">
                <input type="checkbox" checked={appointmentForm.allDay === true} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, allDay: event.target.checked }))} />
                All-day appointment
              </label>
            </div>
          </div>

          <div className="rounded-[16px] border border-[#dce6f2] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6f839c]">Link this appointment</p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Field as="select" value={appointmentForm.listingId} onChange={(event) => handleAppointmentListingChange(event.target.value)}>
                <option value="">No listing selected</option>
                {appointmentListingOptions.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.label}
                  </option>
                ))}
              </Field>
              <Field as="select" value={appointmentForm.relatedEntityType} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, relatedEntityType: event.target.value }))}>
                <option value="none">General / Internal</option>
                <option value="lead">Lead</option>
                <option value="listing">Listing</option>
                <option value="transaction">Transaction</option>
                <option value="client">Client</option>
              </Field>
              <Field placeholder="Search or select record" value={appointmentForm.relatedEntityId} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, relatedEntityId: event.target.value }))} />
              <Field as="select" value={appointmentForm.status} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, status: event.target.value }))}>
                {APPOINTMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {APPOINTMENT_STATUS_LABELS[status] || status}
                  </option>
                ))}
              </Field>
              <Field
                as="select"
                value={appointmentForm.resourceId}
                onChange={(event) => setAppointmentForm((previous) => ({ ...previous, resourceId: event.target.value }))}
              >
                <option value="">No room/resource selected</option>
                {appointmentResources.map((resource) => (
                  <option key={resource.resourceId} value={resource.resourceId}>
                    {resource.resourceName}
                  </option>
                ))}
              </Field>
              {selectedAppointmentId ? (
                <Button type="button" variant="secondary" onClick={handleOpenAppointmentRelatedRecord}>
                  Open Related Record
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-[#6f839c]">
              Listings are loaded from current organisation stock. Older appointments without a listing still remain visible.
            </p>
          </div>

          <div className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f7894]">Appointment Purpose</p>
                <p className="mt-1 text-sm font-semibold text-[#203a52]">{selectedAppointmentTemplate.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#5f7690]">{selectedAppointmentTemplate.description}</p>
              </div>
              <div className="space-y-1 text-xs text-[#4f6780]">
                <p><span className="font-semibold text-[#233f58]">Default duration:</span> {selectedAppointmentTemplate.defaultDurationMinutes} min</p>
                <p><span className="font-semibold text-[#233f58]">Visibility:</span> {selectedAppointmentTemplate.defaultVisibility === 'client_visible' ? 'Client visible' : 'Internal team'}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Field
                as="select"
                value={appointmentForm.visibility || selectedAppointmentTemplate.defaultVisibility}
                onChange={(event) => setAppointmentForm((previous) => ({ ...previous, visibility: event.target.value }))}
              >
                <option value="internal_only">Internal only</option>
                <option value="client_visible">Client visible</option>
                <option value="shared_role_players">Team visible</option>
              </Field>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div className="rounded-[10px] border border-[#e2eaf4] bg-white px-3 py-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Required Participants</p>
                <p className="mt-1 text-xs text-[#48627d]">
                  {(selectedAppointmentTemplate.requiredParticipantRoles || []).join(', ') || 'No strict role requirements.'}
                </p>
              </div>
              <div className="rounded-[10px] border border-[#e2eaf4] bg-white px-3 py-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Reschedule Roles</p>
                <p className="mt-1 text-xs text-[#48627d]">
                  {(selectedAppointmentTemplate.allowedRescheduleRoles || []).join(', ') || 'Standard participant rules.'}
                </p>
              </div>
            </div>

            <Field
              as="textarea"
              rows={3}
              placeholder="Client instructions"
              value={appointmentForm.instructions || ''}
              onChange={(event) => setAppointmentForm((previous) => ({ ...previous, instructions: event.target.value }))}
              className="mt-3"
            />

            <div className="mt-3 rounded-[10px] border border-[#e2eaf4] bg-white px-3 py-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Required Before Appointment</p>
              <div className="mt-1 space-y-1">
                {appointmentPrepChecklist.length ? (
                  appointmentPrepChecklist.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#48627d]">{item.label}</span>
                      <span className={item.completed ? 'text-[#1f7d44]' : 'text-[#a76723]'}>
                        {item.completed ? 'Completed' : 'Missing'}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[#6f839c]">No prep documents required for this appointment type.</p>
                )}
              </div>
            </div>
          </div>

          <Field
            as="textarea"
            rows={3}
            placeholder="Notes"
            value={appointmentForm.notes}
            onChange={(event) => setAppointmentForm((previous) => ({ ...previous, notes: event.target.value }))}
          />

          <div className="rounded-[14px] border border-[#e4ebf4] bg-[#fbfdff] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#28435e]">Availability & Conflict Checks</p>
              {appointmentSchedulingLoading ? (
                <span className="text-xs text-[#5f7690]">Checking availability...</span>
              ) : (
                <span className="text-xs text-[#5f7690]">Last checked: {appointmentSchedulingIntegrity?.checkedAt ? formatCompactDate(appointmentSchedulingIntegrity.checkedAt) : '—'}</span>
              )}
            </div>

            {appointmentSchedulingError ? (
              <div className="mt-2 rounded-[10px] border border-[#f2d0ce] bg-[#fff5f4] px-3 py-2 text-xs text-[#9f3028]">
                {appointmentSchedulingError}
              </div>
            ) : null}

            {appointmentHasHardConflicts ? (
              <div className="mt-2 space-y-2">
                {(appointmentSchedulingIntegrity?.hardConflicts || []).map((conflict, index) => (
                  <div key={`hard-${conflict.type || index}-${conflict.appointmentId || index}`} className={`rounded-[10px] border px-3 py-2 text-xs ${getConflictLevelTone(conflict.level)}`}>
                    <p className="font-semibold">Hard conflict: {conflict.message || 'Scheduling conflict detected.'}</p>
                    {conflict.startsAt ? (
                      <p className="mt-1 opacity-80">
                        Existing appointment: {formatCompactDate(conflict.startsAt)} - {formatCompactDate(conflict.endsAt)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {appointmentHasSoftConflicts ? (
              <div className="mt-2 space-y-2">
                {(appointmentSchedulingIntegrity?.softConflicts || []).map((conflict, index) => (
                  <div key={`soft-${conflict.type || index}-${conflict.appointmentId || index}`} className={`rounded-[10px] border px-3 py-2 text-xs ${getConflictLevelTone(conflict.level)}`}>
                    <p className="font-semibold">Soft warning: {conflict.message || 'Potential scheduling overlap detected.'}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {Array.isArray(appointmentSchedulingIntegrity?.participantAvailability) && appointmentSchedulingIntegrity.participantAvailability.length ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {appointmentSchedulingIntegrity.participantAvailability.map((availability, index) => (
                  <div key={`${availability?.identityKey || availability?.email || index}`} className="rounded-[10px] border border-[#e3ebf5] bg-white px-3 py-2 text-xs">
                    <p className="font-semibold text-[#28435e]">
                      {availability?.name || availability?.email || availability?.role || 'Participant'}
                    </p>
                    <p className={`mt-1 ${availability?.isAvailable ? 'text-[#1c7c4f]' : 'text-[#b26d22]'}`}>
                      {availability?.isAvailable ? 'Available in selected slot' : 'Potential overlap detected'}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {Array.isArray(appointmentSchedulingIntegrity?.suggestedSlots) && appointmentSchedulingIntegrity.suggestedSlots.length ? (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Suggested Next Slots</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {appointmentSchedulingIntegrity.suggestedSlots.slice(0, 4).map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() =>
                        setAppointmentForm((previous) => ({
                          ...previous,
                          date: String(slot.start).slice(0, 10),
                          startTime: String(slot.start).slice(11, 16),
                          endTime: String(slot.end).slice(11, 16),
                        }))
                      }
                      className="rounded-full border border-[#dce6f2] bg-white px-3 py-1 text-xs font-semibold text-[#35546c]"
                    >
                      {slot.label || formatCompactDate(slot.start)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[14px] border border-[#e4ebf4] bg-[#fbfdff] p-3">
            <p className="text-sm font-semibold text-[#28435e]">Participants</p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <Field placeholder="Name" value={appointmentForm.participantDraft?.name || ''} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, participantDraft: { ...previous.participantDraft, name: event.target.value } }))} />
              <Field placeholder="Email" value={appointmentForm.participantDraft?.email || ''} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, participantDraft: { ...previous.participantDraft, email: event.target.value } }))} />
              <Field placeholder="Phone" value={appointmentForm.participantDraft?.phone || ''} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, participantDraft: { ...previous.participantDraft, phone: event.target.value } }))} />
              <Field as="select" value={appointmentForm.participantDraft?.participantRole || 'Buyer'} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, participantDraft: { ...previous.participantDraft, participantRole: event.target.value } }))}>
                {APPOINTMENT_PARTICIPANT_ROLES.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {roleOption}
                  </option>
                ))}
              </Field>
              <Field as="select" value={appointmentForm.participantDraft?.rsvpStatus || 'Pending'} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, participantDraft: { ...previous.participantDraft, rsvpStatus: event.target.value } }))}>
                {APPOINTMENT_RSVP_STATUSES.map((statusOption) => (
                  <option key={statusOption} value={statusOption}>
                    {statusOption}
                  </option>
                ))}
              </Field>
              <label className="flex items-center gap-2 rounded-[10px] border border-[#dce6f2] bg-white px-3 py-2 text-xs text-[#33536d]">
                <input
                  type="checkbox"
                  checked={appointmentForm.participantDraft?.isRequired !== false}
                  onChange={(event) => setAppointmentForm((previous) => ({ ...previous, participantDraft: { ...previous.participantDraft, isRequired: event.target.checked } }))}
                />
                Required attendee
              </label>
              <Button type="button" variant="secondary" onClick={handleAddParticipantToDraft}>
                Add Participant
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {(appointmentForm.participants || []).length ? (
                (appointmentForm.participants || []).map((participant, index) => (
                  <div key={`${participant.participantId || participant.email || participant.name || index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#e5ecf5] bg-white px-3 py-2 text-xs">
                    <div>
                      <p className="font-semibold text-[#223f59]">{participant.name || participant.email || 'Participant'}</p>
                      <p className="mt-0.5 text-[#5e748d]">{participant.participantRole} • {participant.rsvpStatus} • {participant.isRequired === false ? 'Optional' : 'Required'}</p>
                    </div>
                    <div className="flex gap-1.5">
                      {selectedAppointmentId && participant.participantId ? (
                        <>
                          {APPOINTMENT_RSVP_STATUSES.map((statusOption) => (
                            <button
                              key={statusOption}
                              type="button"
                              onClick={() => handleUpdateParticipantRsvp(participant, statusOption)}
                              className="rounded-full border border-[#dce6f2] px-2 py-0.5 text-[0.68rem] font-semibold text-[#35546c]"
                            >
                              {statusOption}
                            </button>
                          ))}
                        </>
                      ) : null}
                      <button type="button" className="rounded-full border border-[#dce6f2] px-2 py-0.5 text-[0.68rem] font-semibold text-[#35546c]" onClick={() => handleRemoveParticipantFromDraft(index)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-[10px] border border-dashed border-[#d5e1ee] bg-white px-3 py-3 text-xs text-[#6f839c]">
                  No participants added yet. Add clients, agents, attorneys, or manual email recipients.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[14px] border border-[#e4ebf4] bg-[#fbfdff] p-3">
            <p className="text-sm font-semibold text-[#28435e]">Notifications</p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Field
                placeholder="Recipient email"
                value={appointmentForm.recipientEmail || ''}
                onChange={(event) => setAppointmentForm((previous) => ({ ...previous, recipientEmail: event.target.value }))}
              />
              <label className="flex items-center gap-2 rounded-[10px] border border-[#dce6f2] bg-white px-3 py-2 text-xs text-[#33536d]">
                <input type="checkbox" checked={appointmentForm.sendInviteEmails !== false} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, sendInviteEmails: event.target.checked }))} />
                Send appointment invite emails
              </label>
              <label className="flex items-center gap-2 rounded-[10px] border border-[#dce6f2] bg-white px-3 py-2 text-xs text-[#33536d]">
                <input type="checkbox" checked={appointmentForm.attachCalendarInvite !== false} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, attachCalendarInvite: event.target.checked }))} />
                Attach calendar invite file
              </label>
              <label className="flex items-center gap-2 rounded-[10px] border border-[#dce6f2] bg-white px-3 py-2 text-xs text-[#33536d]">
                <input type="checkbox" checked={appointmentForm.notifyCreatorOnRsvp !== false} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, notifyCreatorOnRsvp: event.target.checked }))} />
                Notify me on RSVP
              </label>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#e4ebf4] bg-[#fbfdff] p-3">
            <p className="text-sm font-semibold text-[#28435e]">Outcome & Follow-up</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <Field placeholder="Outcome summary" value={appointmentOutcomeForm.outcomeSummary} onChange={(event) => setAppointmentOutcomeForm((previous) => ({ ...previous, outcomeSummary: event.target.value }))} />
              <Field placeholder="Client feedback" value={appointmentOutcomeForm.clientFeedback} onChange={(event) => setAppointmentOutcomeForm((previous) => ({ ...previous, clientFeedback: event.target.value }))} />
              <Field placeholder="Next step" value={appointmentOutcomeForm.nextStep} onChange={(event) => setAppointmentOutcomeForm((previous) => ({ ...previous, nextStep: event.target.value }))} />
              <Field type="date" value={appointmentOutcomeForm.followUpDate} onChange={(event) => setAppointmentOutcomeForm((previous) => ({ ...previous, followUpDate: event.target.value }))} />
            </div>
            <Field as="textarea" rows={2} placeholder="Agent notes" value={appointmentOutcomeForm.agentNotes} onChange={(event) => setAppointmentOutcomeForm((previous) => ({ ...previous, agentNotes: event.target.value }))} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={handleSaveAppointmentOutcome} disabled={!selectedAppointmentId}>
                Save Outcome
              </Button>
              <Button type="button" variant="secondary" onClick={handleCreateFollowUpTaskFromAppointment} disabled={!selectedAppointment?.leadId}>
                Create Follow-up Task
              </Button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAppointmentModalOpen(false)
                setAppointmentSchedulingError('')
                setAppointmentSchedulingLoading(false)
              }}
            >
              Close
            </Button>
            <Button type="submit" disabled={!appointmentCanSave}>
              {selectedAppointmentId ? 'Save Appointment' : 'Create Appointment'}
            </Button>
          </div>
        </form>
      </Modal>

      <LegalDocumentWorkspace
        open={legalWorkspaceOpen}
        onClose={() => setLegalWorkspaceOpen(false)}
        transactionId={normalizeText(selectedLeadLinkedTransaction?.transactionId || selectedLeadLinkedTransaction?.dealId)}
        transactionReference={
          [
            normalizeText(selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress),
            normalizeText(selectedLead?.leadCategory || 'Seller Lead'),
          ].filter(Boolean).join(' · ') || 'Seller lead document context'
        }
        packetType="mandate"
        packetId={
          isUuidLike(mandatePacketStatus?.packet?.id) && documentPacketBelongsToLead(mandatePacketStatus?.packet, selectedLead?.leadId)
            ? normalizeText(mandatePacketStatus.packet.id)
            : ''
        }
        mode={legalWorkspaceMode}
        initialStatus={mandatePacketStatus}
        organisationId={organisationId}
        onGenerate={handleGenerateMandateFromSellerLead}
        onSend={handleSendMandateToSeller}
        onEdit={handleGenerateMandateFromSellerLead}
        onView={handleWorkspaceViewMandate}
        onViewSigned={handleWorkspaceViewMandate}
        onRefreshContext={async () => {
          if (!organisationId) return
          await reloadRecords(organisationId)
        }}
      />
    </section>
  )
}

export default AgencyPipelinePage
