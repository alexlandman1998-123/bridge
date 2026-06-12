import { AlertTriangle, ArrowUpRight, Bath, BedDouble, Bold, Bookmark, CalendarDays, Car, CheckCircle2, CheckSquare, ChevronDown, ChevronRight, Clock3, Columns3, Eye, Filter, Gauge, Home, ImageIcon, Italic, Link2, List, Lock, Mail, MessageCircle, MoreHorizontal, Paperclip, Pencil, Phone, Plus, RefreshCw, Ruler, Search, Send, Settings, ShieldCheck, Smile, Table2, Tag, Trash2, TrendingUp, Upload, UserRound, X, Zap } from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import AppointmentCalendarActions from '../../components/appointments/AppointmentCalendarActions'
import LegalDocumentWorkspace from '../../components/documents/LegalDocumentWorkspace'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { isUnsafeFallbackAllowed } from '../../lib/envValidation'
import { inferLeadCategoryFromRecord, leadCategoryLabel, normalizeLeadCategory } from '../../lib/leadCategory'
import { CANVASSING_UPDATED_EVENT, listCanvassingWorkspace } from '../../lib/canvassingRepository'
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
  resolveAgencyPipelineStorageScope,
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
  ensureAgencyCrmLeadRecordPersisted,
  fetchAgencyCrmLeadWorkspace,
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
  deleteSellerWorkflowRecord,
  generateSellerOnboardingToken,
  LISTING_STATUS,
  SELLER_ONBOARDING_STATUS,
  readAgentPrivateListings,
  updateAgentSellerLead,
  updateSellerWorkflowRecordByToken,
} from '../../lib/agentListingStorage'
import { MOCK_DATA_ENABLED } from '../../lib/mockData'
import { assertEdgeFunctionSuccess, invokeEdgeFunction, isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { activatePrivateListing, createPrivateListing, createPrivateListingActivity, getOrganisationPrivateListings, getSellerOnboardingByToken, sendSellerOnboarding, updatePrivateListing } from '../../services/privateListingService'
import { buildSellerJourney, getSellerJourneyMetrics } from '../../services/sellerJourneyService'
import { buildSellerReadinessSummary } from '../../services/sellerReadinessService'
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
import {
  CLIENT_INTAKE_PREFERENCE,
  buildSellerOfferReviewPreparation,
  createCanonicalOffer,
  createOfferPortalSession,
  createOfferSellerReviewSession,
  createTransactionFromAcceptedCanonicalOffer,
  getClientIntakePreferenceLabel,
  getBuyerLeadLifecycleDiagnostic,
  getSellerOfferReviewDeliveryModeLabel,
  listAppointmentViewedListings,
  listCanonicalOffersForLead,
  listOfferPortalSessions,
  normalizeClientIntakePreference,
  normalizeSellerReviewDeliveryMode,
  recordBuyerLeadActivity,
  SELLER_REVIEW_DELIVERY_MODE,
  updateCanonicalOfferStatus,
  upsertAppointmentViewedListings,
} from '../../lib/buyerLifecycleService'
import { isBuyerWorkflowStage, transitionBuyerLeadStage } from '../../lib/workflowEngine'
import {
  FINANCE_READINESS_DISCLAIMER,
  getFinanceReadinessSummary,
  saveFinanceReadinessDraft,
  shouldShowBondReadinessCta,
  shouldShowFinanceReadinessSection,
} from '../../services/financeReadinessService'
import {
  calculateApprovalProbability,
  calculateOperationalRisk,
  calculateTransactionVelocity,
  generateFinanceInsights,
  FINANCE_INTELLIGENCE_DISCLAIMER,
} from '../../services/financeIntelligenceService'

const PIPELINE_CONTEXT_TIMEOUT_MS = 3500
const PIPELINE_RECORDS_TIMEOUT_MS = 3500
const PIPELINE_CRM_RECORDS_TIMEOUT_MS = 10000
const PIPELINE_APPOINTMENT_RECORDS_TIMEOUT_MS = 15000
const SELLER_ONBOARDING_COMPLETION_POLL_MS = 7000
const LEAD_WORKSPACE_HYDRATION_TIMEOUT_MS = 2500
const LEAD_WORKSPACE_HYDRATION_RETRY_MS = 900
const LEAD_WORKSPACE_HYDRATION_MAX_RETRIES = 4
const CANVASSING_STORAGE_PREFIX = 'itg:agency-canvassing:v1'
const BUYER_LIFECYCLE_REFRESH_STORAGE_KEY = 'bridge:buyer-lifecycle-refresh:v1'
const BUYER_LIFECYCLE_REFRESH_EVENT = 'bridge:buyer-lifecycle-refresh'
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
  const isSellerLead = resolveLeadCategoryView(lead) === 'seller'

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

function isAuthSessionMissingError(error) {
  const message = normalizeText(error?.message || error).toLowerCase()
  return message.includes('auth session missing') || message.includes('missing auth session')
}

function getCanvassingStorageKey(organisationId) {
  const workspaceId = normalizeText(organisationId)
  if (!workspaceId) throw new Error('A resolved workspace is required before loading canvassing data.')
  return `${CANVASSING_STORAGE_PREFIX}:${workspaceId}`
}

function readCanvassingStore(organisationId) {
  if (typeof window === 'undefined') return { prospects: [], activities: [] }
  if (!isUnsafeFallbackAllowed()) return { prospects: [], activities: [] }
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
  const explicitName = normalizeText(lead?.name || lead?.buyerName)
  const explicitParts = explicitName.split(/\s+/).filter(Boolean)
  const firstName = normalizeText(
    lead?.sellerName ||
    lead?.firstName ||
    lead?.first_name ||
    explicitParts[0],
  )
  const lastName = normalizeText(
    lead?.sellerSurname ||
    lead?.lastName ||
    lead?.last_name ||
    explicitParts.slice(1).join(' '),
  )
  const phone = normalizeText(lead?.sellerPhone || lead?.phone)
  const email = normalizeText(lead?.sellerEmail || lead?.email).toLowerCase()
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

function isGenericLeadPersonName(value = '') {
  const normalized = normalizeKey(value).replace(/\s+/g, ' ')
  return !normalized || ['lead', 'contact', 'buyer', 'seller', 'unnamed lead', 'unnamed'].includes(normalized)
}

function formatContactName(contact = null) {
  return [contact?.firstName, contact?.lastName].map(normalizeText).filter(Boolean).join(' ').trim()
}

function mergeLeadContactSnapshot(primary = null, secondary = null) {
  if (!primary && !secondary) return null
  return {
    ...(secondary || {}),
    ...(primary || {}),
    contactId: normalizeText(primary?.contactId || secondary?.contactId),
    firstName: normalizeText(primary?.firstName || secondary?.firstName),
    lastName: normalizeText(primary?.lastName || secondary?.lastName),
    phone: normalizeText(primary?.phone || secondary?.phone),
    email: normalizeText(primary?.email || secondary?.email).toLowerCase(),
    contactType: normalizeText(primary?.contactType || secondary?.contactType) || 'Lead',
  }
}

function resolveLeadContactSnapshot(lead = {}, contact = null, prospect = null) {
  const leadFallback = buildLeadContactFallback(lead)
  const prospectFallback = buildCanvassingProspectContactFallback(prospect)
  const candidates = [contact, leadFallback, prospectFallback].filter(Boolean)
  const namedCandidate = candidates.find((candidate) => !isGenericLeadPersonName(formatContactName(candidate)))

  if (namedCandidate) {
    const detailFallback = candidates.find((candidate) => candidate !== namedCandidate) || null
    return mergeLeadContactSnapshot(namedCandidate, detailFallback)
  }

  return mergeLeadContactSnapshot(contact, leadFallback || prospectFallback) || leadFallback || prospectFallback || null
}

function resolveLeadDisplayName(lead = {}, contact = null, prospect = null, fallback = 'Unnamed Lead') {
  const resolvedContact = resolveLeadContactSnapshot(lead, contact, prospect)
  const contactName = formatContactName(resolvedContact)
  if (!isGenericLeadPersonName(contactName)) return contactName

  const leadName = normalizeText(lead?.name || lead?.buyerName || [lead?.sellerName, lead?.sellerSurname].filter(Boolean).join(' '))
  if (!isGenericLeadPersonName(leadName)) return leadName

  const prospectName = [prospect?.firstName, prospect?.lastName].map(normalizeText).filter(Boolean).join(' ').trim()
  if (!isGenericLeadPersonName(prospectName)) return prospectName

  return fallback
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

function parseCurrencyAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = normalizeText(value).toLowerCase()
  if (!raw) return 0
  const firstNumber = raw.match(/[\d]+(?:[.,]\d+)?/)
  if (!firstNumber) return 0
  const number = Number(firstNumber[0].replace(',', '.'))
  if (!Number.isFinite(number)) return 0
  if (raw.includes('million') || raw.includes('m')) return number * 1000000
  if (raw.includes('k')) return number * 1000
  return number
}

function formatCompactCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Not captured'
  if (amount >= 1000000) {
    const compact = amount / 1000000
    return `R${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}m`
  }
  if (amount >= 1000) return `R${Math.round(amount / 1000)}k`
  return formatCurrency(amount)
}

function buildBuyerBudgetRangeLabel({ lead = {}, financeSummary = {} } = {}) {
  const rawBudget = normalizeText(lead?.budget)
  const rawEstimated = normalizeText(lead?.estimatedValue)
  if (rawBudget && /[a-z]|-|–|—/i.test(rawBudget) && parseCurrencyAmount(rawBudget) > 0) return rawBudget

  const affordability = financeSummary?.affordabilityEstimate || {}
  const min = Number(affordability.estimatedPurchaseRangeMin || 0) || 0
  const max = Number(affordability.estimatedPurchaseRangeMax || 0) || 0
  if (min > 0 && max > 0 && min !== max) return `${formatCompactCurrency(min)} - ${formatCompactCurrency(max)}`

  const budget = parseCurrencyAmount(rawBudget)
  const estimated = parseCurrencyAmount(rawEstimated)
  if (budget > 0 && estimated > 0 && budget !== estimated) {
    return `${formatCompactCurrency(Math.min(budget, estimated))} - ${formatCompactCurrency(Math.max(budget, estimated))}`
  }
  if (budget > 0) return formatCompactCurrency(budget)
  if (estimated > 0) return formatCompactCurrency(estimated)
  return 'Not captured'
}

function getBuyerUrgencyLabel({ lead = {}, openActions = {}, activityInsights = {} } = {}) {
  const priority = normalizeText(lead?.priority || lead?.leadScore).toLowerCase()
  if (priority.includes('high') || priority.includes('hot') || openActions?.overdueCount > 0) return 'High'
  if (activityInsights?.temperature === 'Hot') return 'High'
  if (priority.includes('low') || activityInsights?.temperature === 'Cool') return 'Low'
  return 'Medium'
}

function getBuyerUrgencyClassName(label = '') {
  const normalized = normalizeText(label).toLowerCase()
  if (normalized === 'high') return 'border-[#ffd0d3] bg-[#fff2f2] text-[#c3263c]'
  if (normalized === 'low') return 'border-[#dce8f2] bg-[#f6f9fc] text-[#60758b]'
  return 'border-[#f2ddb4] bg-[#fff8e8] text-[#9a6416]'
}

function resolveBuyerWorkspaceTabKey(tabKey = '') {
  const normalized = normalizeText(tabKey)
  if (normalized === 'activities') return 'activity'
  return normalized
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
  if (!isUnsafeFallbackAllowed()) return []
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
    const newerOption = optionTime >= existingTime ? option : existing
    const olderOption = optionTime >= existingTime ? existing : option
    byId.set(option.id, {
      ...olderOption,
      ...newerOption,
      label: normalizeText(newerOption.label) || normalizeText(olderOption.label),
      title: normalizeText(newerOption.title) || normalizeText(olderOption.title),
      address: normalizeText(newerOption.address) || normalizeText(olderOption.address),
      suburb: normalizeText(newerOption.suburb) || normalizeText(olderOption.suburb),
      thumbnailUrl: normalizeText(newerOption.thumbnailUrl) || normalizeText(olderOption.thumbnailUrl),
      askingPrice: Number(newerOption.askingPrice || 0) || Number(olderOption.askingPrice || 0) || 0,
      bedrooms: Number(newerOption.bedrooms || 0) || Number(olderOption.bedrooms || 0) || 0,
      bathrooms: Number(newerOption.bathrooms || 0) || Number(olderOption.bathrooms || 0) || 0,
      parking: Number(newerOption.parking || 0) || Number(olderOption.parking || 0) || 0,
      assignedAgentId: normalizeText(newerOption.assignedAgentId) || normalizeText(olderOption.assignedAgentId),
      assignedAgentEmail: normalizeText(newerOption.assignedAgentEmail) || normalizeText(olderOption.assignedAgentEmail),
      createdBy: normalizeText(newerOption.createdBy) || normalizeText(olderOption.createdBy),
      organisationId: normalizeText(newerOption.organisationId) || normalizeText(olderOption.organisationId),
      updatedAt: newerOption.updatedAt || olderOption.updatedAt || null,
    })
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

function formatEntityDisplayReference(prefix, row = {}, index = 0) {
  const explicitReference = normalizeText(
    row?.displayReference ||
    row?.display_reference ||
    row?.referenceNumber ||
    row?.reference_number ||
    row?.reference ||
    row?.listingReference ||
    row?.listing_reference ||
    row?.leadReference ||
    row?.lead_reference ||
    row?.transactionReference ||
    row?.transaction_reference ||
    row?.appointmentReference ||
    row?.appointment_reference,
  )
  if (explicitReference && !isUuidLike(explicitReference)) return explicitReference
  const explicitSequence = Number(row?.sequenceNumber || row?.sequence_number || row?.sequence || 0)
  const sequence = Number.isFinite(explicitSequence) && explicitSequence > 0 ? explicitSequence : index + 1
  return `${prefix}-${String(sequence).padStart(5, '0')}`
}

function safeDisplayText(value, fallback = '') {
  const text = normalizeText(value)
  if (!text || isUuidLike(text)) return fallback
  return text
}

function buildParticipantIdentityKey(participant = {}) {
  return normalizeKey(
    participant?.email ||
    participant?.phone ||
    [participant?.participantRole || participant?.role, participant?.name || participant?.company].filter(Boolean).join(':'),
  )
}

function buildAppointmentParticipant({ name = '', email = '', phone = '', role = 'Client', company = '', source = '' } = {}) {
  const displayName = safeDisplayText(name, '') || safeDisplayText(company, '') || safeDisplayText(email, '') || role
  if (!displayName && !email && !phone) return null
  return {
    name: displayName,
    email: normalizeText(email).toLowerCase(),
    phone: normalizeText(phone),
    participantRole: role,
    company: safeDisplayText(company, ''),
    source,
    isRequired: true,
    rsvpStatus: 'Pending',
  }
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
  const category = resolveLeadCategoryView({ ...lead, contactType: contact?.contactType })
  if (category === 'seller') return { label: 'Seller', className: 'border-[#f0dfb8] bg-[#fff8eb] text-[#8a641d]' }
  if (category === 'other') return { label: 'Other', className: 'border-[#ded8f6] bg-[#f5f2ff] text-[#5f4a9b]' }
  return { label: 'Buyer', className: 'border-[#cfe8dc] bg-[#effaf3] text-[#2d6b4a]' }
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

function getListingSellerFormData(listing = {}) {
  const onboardingFormData = listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
    ? listing.sellerOnboarding.formData
    : {}
  const rawOnboardingFormData = listing?.sellerOnboarding?.form_data && typeof listing.sellerOnboarding.form_data === 'object'
    ? listing.sellerOnboarding.form_data
    : {}
  return {
    ...rawOnboardingFormData,
    ...onboardingFormData,
  }
}

function resolveSellerEmailFromListing(listing = {}) {
  const formData = getListingSellerFormData(listing)
  return normalizeText(
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
  return normalizeText(
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
  return normalizeText(
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
    leadCategory: 'seller',
    leadDirection: 'Inbound',
    leadSource: 'Seller Onboarding',
    stage: isCompleted ? 'Seller Onboarding Submitted' : onboardingStatus ? 'Seller Onboarding Sent' : 'Lead',
    status: isCompleted ? 'Submitted' : onboardingStatus ? 'Sent' : 'Lead',
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
    sellerLeadId: normalizeText(listing?.sellerLeadId),
    sellerWorkflowLeadId: normalizeText(listing?.sellerLeadId),
    originatingCrmLeadId: normalizeText(listing?.originatingCrmLeadId),
    privateListingId: normalizeText(listing?.id),
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

const LEAD_ACTIVITY_OUTCOME_OPTIONS = [
  '',
  'Interested',
  'Not interested',
  'Needs follow-up',
  'Wants callback',
  'Requested OTP',
  'Completed',
]

const LEAD_ACTIVITY_SUGGESTION_CHIPS = [
  'Interested in viewing',
  'Asked about financing',
  'Wants callback tomorrow',
  'Requested OTP',
]

const LEAD_ACTIVITY_COMPOSER_MODES = [
  { key: 'activity', label: 'Log Activity' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'task', label: 'Task' },
  { key: 'note', label: 'Note' },
]

const LEAD_ACTIVITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'note', label: 'Notes' },
  { key: 'task', label: 'Tasks' },
  { key: 'follow_up', label: 'Follow-ups' },
  { key: 'call', label: 'Calls' },
  { key: 'appointment', label: 'Appointments' },
  { key: 'offer', label: 'Offers' },
  { key: 'system', label: 'System' },
]

function getLeadActivityPresentation(activityType = '') {
  const normalized = normalizeText(activityType).toLowerCase()
  if (normalized.includes('call') || normalized.includes('phone')) {
    return { Icon: Phone, rail: 'bg-[#e8f2ff] text-[#2563a8]', pill: 'bg-[#e8f2ff] text-[#2563a8]', label: 'Call' }
  }
  if (normalized.includes('meeting') || normalized.includes('appointment') || normalized.includes('viewing') || normalized.includes('consultation')) {
    return { Icon: CalendarDays, rail: 'bg-[#f2eaff] text-[#7056b8]', pill: 'bg-[#f2eaff] text-[#7056b8]', label: 'Meeting' }
  }
  if (normalized.includes('whatsapp') || normalized.includes('message') || normalized.includes('sms')) {
    return { Icon: MessageCircle, rail: 'bg-[#e7f8ef] text-[#218257]', pill: 'bg-[#e7f8ef] text-[#218257]', label: 'Message' }
  }
  if (normalized.includes('follow')) {
    return { Icon: Clock3, rail: 'bg-[#fff4e5] text-[#b76a12]', pill: 'bg-[#fff4e5] text-[#b76a12]', label: 'Follow-up' }
  }
  if (normalized.includes('task')) {
    return { Icon: CheckSquare, rail: 'bg-[#eef5fb] text-[#315b7a]', pill: 'bg-[#eef5fb] text-[#315b7a]', label: 'Task' }
  }
  if (normalized.includes('note')) {
    return { Icon: Pencil, rail: 'bg-[#f2f6fa] text-[#60758b]', pill: 'bg-[#f2f6fa] text-[#60758b]', label: 'Note' }
  }
  if (normalized.includes('offer') || normalized.includes('otp') || normalized.includes('mandate')) {
    return { Icon: CheckSquare, rail: 'bg-[#e8f7f1] text-[#1d7a52]', pill: 'bg-[#e8f7f1] text-[#1d7a52]', label: 'Offer' }
  }
  if (normalized.includes('system') || normalized.includes('stage') || normalized.includes('created')) {
    return { Icon: Columns3, rail: 'bg-[#eef3f7] text-[#687c91]', pill: 'bg-[#eef3f7] text-[#687c91]', label: 'System' }
  }
  if (normalized.includes('email') || normalized.includes('mail')) {
    return { Icon: Mail, rail: 'bg-[#edf7ff] text-[#277499]', pill: 'bg-[#edf7ff] text-[#277499]', label: 'Email' }
  }
  return { Icon: MessageCircle, rail: 'bg-[#eef3f7] text-[#597089]', pill: 'bg-[#eef3f7] text-[#597089]', label: 'Activity' }
}

const LEAD_DETAIL_DEFAULT_TASK = {
  title: '',
  description: '',
  dueDate: getTodayIsoDate(),
  priority: 'Medium',
  assignedAgentId: '',
}

const APPOINTMENT_TYPE_OPTIONS = getAppointmentTypeOptions()

const VIEWING_OUTCOME_OPTIONS = [
  'Interested',
  'Not interested',
  'Needs follow-up',
  'Wants to offer',
  'Viewed multiple properties',
]

const VIEWING_NEXT_STEP_OPTIONS = [
  { value: 'send_offer_link', label: 'Send offer link' },
  { value: 'schedule_another_viewing', label: 'Schedule another viewing' },
  { value: 'move_to_nurture', label: 'Move to nurture' },
  { value: 'mark_lost', label: 'Mark lost' },
]

const VIEWING_POSITIVE_OUTCOMES = ['Interested', 'Wants to offer', 'Needs follow-up']

const CLIENT_INTAKE_PREFERENCE_OPTIONS = [
  { value: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL, label: 'Digital portal' },
  { value: CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED, label: 'Agent assisted' },
  { value: CLIENT_INTAKE_PREFERENCE.HARD_COPY, label: 'Hard copy' },
]

const SELLER_REVIEW_DELIVERY_OPTIONS = [
  { value: SELLER_REVIEW_DELIVERY_MODE.EMAIL, label: getSellerOfferReviewDeliveryModeLabel(SELLER_REVIEW_DELIVERY_MODE.EMAIL) },
  { value: SELLER_REVIEW_DELIVERY_MODE.AGENT_ASSISTED, label: getSellerOfferReviewDeliveryModeLabel(SELLER_REVIEW_DELIVERY_MODE.AGENT_ASSISTED) },
  { value: SELLER_REVIEW_DELIVERY_MODE.HARD_COPY, label: getSellerOfferReviewDeliveryModeLabel(SELLER_REVIEW_DELIVERY_MODE.HARD_COPY) },
]

function getAppointmentStatusTone(status) {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'completed') return 'border-[#bfe7d0] bg-[#edf9f1] text-[#25764a]'
  if (normalized === 'confirmed' || normalized === 'accepted') return 'border-[#c4d9ff] bg-[#eef5ff] text-[#285f9e]'
  if (normalized === 'cancelled' || normalized === 'declined') return 'border-[#f3cfcb] bg-[#fff4f2] text-[#a13b31]'
  if (normalized === 'no_show') return 'border-[#ead0a2] bg-[#fff8e8] text-[#8a5a12]'
  return 'border-[#dde7f2] bg-[#f7fbff] text-[#4c6680]'
}

function getAppointmentStatusLabel(status) {
  const normalized = normalizeText(status).toLowerCase()
  return APPOINTMENT_STATUS_LABELS[normalized] || status || 'Requested'
}

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
  leadCategory: 'buyer',
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
  category: 'all',
  source: 'all',
  stage: 'all',
  agent: 'all',
  sort: 'newest',
}

function resolveLeadCategoryView(value = '') {
  if (typeof value === 'object' && value !== null) return inferLeadCategoryFromRecord(value, 'other')
  return normalizeLeadCategory(value, 'other')
}

function leadCategoryLabelForView(value = '') {
  return leadCategoryLabel(resolveLeadCategoryView(value))
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

const FINANCE_READINESS_FORM_DEFAULTS = {
  monthlyIncome: '',
  otherIncome: '',
  monthlyDebt: '',
  monthlyExpenses: '',
  deposit: '',
  employmentType: 'Permanent',
  employmentDurationMonths: '',
  dependants: '',
  estimatedPurchaseRange: '',
  interestRate: '11.75',
  repaymentYears: '20',
}

function financeFormFromSummary(summary = {}) {
  const inputs = summary.inputs || {}
  return {
    monthlyIncome: inputs.monthlyIncome ? String(inputs.monthlyIncome) : '',
    otherIncome: inputs.otherIncome ? String(inputs.otherIncome) : '',
    monthlyDebt: inputs.monthlyDebt ? String(inputs.monthlyDebt) : '',
    monthlyExpenses: inputs.monthlyExpenses ? String(inputs.monthlyExpenses) : '',
    deposit: inputs.deposit ? String(inputs.deposit) : '',
    employmentType: inputs.employmentType || 'Permanent',
    employmentDurationMonths: inputs.employmentDurationMonths ? String(inputs.employmentDurationMonths) : '',
    dependants: inputs.dependants ? String(inputs.dependants) : '',
    estimatedPurchaseRange: inputs.estimatedPurchaseRange ? String(inputs.estimatedPurchaseRange) : '',
    interestRate: inputs.interestRate ? String(inputs.interestRate) : '11.75',
    repaymentYears: inputs.repaymentYears ? String(inputs.repaymentYears) : '20',
  }
}

function AgencyPipelinePage({ initialViewMode = 'pipeline' } = {}) {
  const navigate = useNavigate()
  const { leadId: routeLeadIdParam = '' } = useParams()
  const routeLeadId = normalizeText(routeLeadIdParam)
  const isLeadWorkspaceRoute = !initialViewMode || (initialViewMode !== 'calendar' && routeLeadId.length > 0)
  const { role, profile, currentWorkspace } = useWorkspace()
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
  const routeLeadHydrationRef = useRef('')
  const isCalendarMode = initialViewMode === 'calendar'
  const isOverviewMode = initialViewMode === 'overview'
  const [leadTypeView, setLeadTypeView] = useState('all')
  const [pipelineViewMode, setPipelineViewMode] = useState('table')
  const [draggingPipelineCardId, setDraggingPipelineCardId] = useState('')
  const draggingPipelineCardRef = useRef('')
  const [leadWorkspaceTab, setLeadWorkspaceTab] = useState('overview')
  const [buyerJourneyActionStage, setBuyerJourneyActionStage] = useState('qualification')
  const [leadFilter, setLeadFilter] = useState(DEFAULT_LEAD_FILTER)
  const [leadTablePage, setLeadTablePage] = useState(1)
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [leadForm, setLeadForm] = useState(NEW_LEAD_DEFAULTS)
  const [isLeadCreating, setIsLeadCreating] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [leadActionsMenuOpen, setLeadActionsMenuOpen] = useState(false)
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
  const [financeReadinessForm, setFinanceReadinessForm] = useState(FINANCE_READINESS_FORM_DEFAULTS)
  const [isFinanceReadinessSaving, setIsFinanceReadinessSaving] = useState(false)
  const [activityForm, setActivityForm] = useState(LEAD_DETAIL_DEFAULT_ACTIVITY)
  const [activityComposerMode, setActivityComposerMode] = useState('activity')
  const [activityTimelineFilter, setActivityTimelineFilter] = useState('all')
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
  const [leadCompletionAppointmentId, setLeadCompletionAppointmentId] = useState('')
  const [leadViewingCompletionForm, setLeadViewingCompletionForm] = useState({
    outcome: VIEWING_OUTCOME_OPTIONS[0],
    agentNotes: '',
    buyerFeedback: '',
    followUpDate: '',
    nextStep: VIEWING_NEXT_STEP_OPTIONS[0].value,
    clientIntakePreference: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
    propertyDraftListingId: '',
    viewedListings: [],
  })
  const [offerLinkForm, setOfferLinkForm] = useState({
    appointmentId: '',
    listingId: '',
    expiryDate: '',
    buyerName: '',
    buyerEmail: '',
    buyerPhone: '',
    clientIntakePreference: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
    note: '',
    lastOfferLink: '',
  })
  const [offerPropertySelectorOpen, setOfferPropertySelectorOpen] = useState(false)
  const [offerPropertySearch, setOfferPropertySearch] = useState('')
  const [offerLinkChannels, setOfferLinkChannels] = useState({
    email: true,
    sms: false,
    whatsapp: false,
  })
  const [isOfferLinkSending, setIsOfferLinkSending] = useState(false)
  const [selectedLeadOffers, setSelectedLeadOffers] = useState([])
  const [selectedLeadOfferPortalSessions, setSelectedLeadOfferPortalSessions] = useState([])
  const [selectedLeadOffersLoading, setSelectedLeadOffersLoading] = useState(false)
  const [selectedLeadOffersError, setSelectedLeadOffersError] = useState('')
  const [selectedLeadOffersRefreshTick, setSelectedLeadOffersRefreshTick] = useState(0)
  const [selectedLeadLifecycleDiagnostic, setSelectedLeadLifecycleDiagnostic] = useState(null)
  const [selectedLeadLifecycleDiagnosticLoading, setSelectedLeadLifecycleDiagnosticLoading] = useState(false)
  const [selectedLeadLifecycleDiagnosticError, setSelectedLeadLifecycleDiagnosticError] = useState('')
  const [canonicalOfferActionId, setCanonicalOfferActionId] = useState('')
  const [canonicalOfferNotesById, setCanonicalOfferNotesById] = useState({})
  const [sellerReviewDeliveryModeByOfferId, setSellerReviewDeliveryModeByOfferId] = useState({})
  const [appointmentResources, setAppointmentResources] = useState([])
  const [appointmentListingOptions, setAppointmentListingOptions] = useState([])
  const [appointmentSchedulingIntegrity, setAppointmentSchedulingIntegrity] = useState(null)
  const [appointmentSchedulingLoading, setAppointmentSchedulingLoading] = useState(false)
  const [appointmentSchedulingError, setAppointmentSchedulingError] = useState('')
  const [appointmentManualParticipantOpen, setAppointmentManualParticipantOpen] = useState(false)
  const [appointmentDeselectedParticipantKeys, setAppointmentDeselectedParticipantKeys] = useState([])
  const [isSellerOnboardingSending, setIsSellerOnboardingSending] = useState(false)
  const [isMandateGenerating, setIsMandateGenerating] = useState(false)
  const [isMandateSending, setIsMandateSending] = useState(false)

  const routeLeadRecord = useMemo(() => {
    if (!routeLeadId) return null
    const routeLeadKey = normalizeLeadIdentityKey(routeLeadId)
    return records.leads.find((lead) => normalizeLeadIdentityKey(lead?.leadId) === routeLeadKey) || null
  }, [records.leads, routeLeadId])
  const [legalWorkspaceOpen, setLegalWorkspaceOpen] = useState(false)
  const [legalWorkspaceMode, setLegalWorkspaceMode] = useState('view')
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
      userId: normalizeText(profile?.id || profile?.email),
      email: normalizeText(profile?.email).toLowerCase(),
      fullName: normalizeText(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')) || 'Current Agent',
      branchId: '',
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
        userId: normalizeText(row?.userId || row?.id || row?.email),
        name: normalizeText(row?.fullName || `${row?.firstName || ''} ${row?.lastName || ''}`) || normalizeText(row?.email) || 'Agent',
        email: normalizeText(row?.email).toLowerCase(),
        branchId: normalizeText(row?.branchId),
      }))
      .filter((row) => row.id)

    const hasCurrent = normalized.some(
      (row) => normalizeKey(row.id) === normalizeKey(currentAgent.id) || normalizeKey(row.email) === normalizeKey(currentAgent.email),
    )
    if (!hasCurrent) {
      normalized.push({
        id: currentAgent.id,
        userId: currentAgent.userId,
        name: currentAgent.fullName,
        email: currentAgent.email,
        branchId: currentAgent.branchId,
      })
    }

    return normalized
  }, [currentAgent.branchId, currentAgent.email, currentAgent.fullName, currentAgent.id, currentAgent.userId, users])

  const resolveAgentById = useCallback(
    (id) => {
      const key = normalizeKey(id)
      const found = agentOptions.find(
        (item) => normalizeKey(item.id) === key || (key && normalizeKey(item.email) === key),
      )
      if (found) return found
      return {
        id: currentAgent.id,
        userId: currentAgent.userId,
        name: currentAgent.fullName,
        email: currentAgent.email,
        branchId: currentAgent.branchId,
      }
    },
    [agentOptions, currentAgent.branchId, currentAgent.email, currentAgent.fullName, currentAgent.id, currentAgent.userId],
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
        ...(isUnsafeFallbackAllowed()
          ? readAgentPrivateListings().map((listing) => normalizeAppointmentListingOption(listing)).filter(Boolean)
          : []),
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
            PIPELINE_CRM_RECORDS_TIMEOUT_MS,
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
          console.warn('[PIPELINE] supabase lead/contact load failed; no local CRM fallback will be loaded.', dbLoadError)
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

  const reloadCanvassingStore = useCallback(async (orgId = organisationId) => {
    if (!orgId) {
      setCanvassingStore({ prospects: [], activities: [] })
      return
    }
    try {
      const store = await listCanvassingWorkspace(orgId)
      setCanvassingStore({
        prospects: Array.isArray(store?.prospects) ? store.prospects : [],
        activities: Array.isArray(store?.activities) ? store.activities : [],
      })
    } catch (canvassingError) {
      console.warn('[agency-pipeline][canvassing] Falling back to local canvassing store.', canvassingError)
      setCanvassingStore(readCanvassingStore(orgId))
    }
  }, [organisationId])

  useEffect(() => {
    void reloadCanvassingStore(organisationId)
  }, [organisationId, reloadCanvassingStore])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleCanvassingRefresh = (event) => {
      const eventOrgId = normalizeText(event?.detail?.organisationId)
      if (eventOrgId && organisationId && eventOrgId !== organisationId) return
      void reloadCanvassingStore(organisationId)
    }
    const handleStorage = (event) => {
      if (event?.key && event.key !== getCanvassingStorageKey(organisationId)) return
      void reloadCanvassingStore(organisationId)
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

      if (contextError && !contextDenied && (!isAuthSessionMissingError(contextError) || !normalizeText(currentWorkspace?.id))) {
        console.warn('[PIPELINE] organisation context load failed.', contextError)
      }
      if (usersError && !usersDenied) {
        console.warn('[PIPELINE] team directory load failed; using current user fallback.', usersError)
      }

      const context = contextResult.status === 'fulfilled' ? contextResult.value : null
      const organisationUsers = usersResult.status === 'fulfilled' ? usersResult.value : []
      const rawOrganisationId = normalizeText(context?.organisation?.id || currentWorkspace?.id)
      const resolvedOrgId = isUuidLike(rawOrganisationId) ? rawOrganisationId : ''
      if (!resolvedOrgId) {
        throw new Error('A resolved workspace is required before loading agency pipeline data.')
      }
      const storageOrgId = resolveAgencyPipelineStorageScope(resolvedOrgId)
      const effectiveOrgId = resolvedOrgId
      const fallbackMembershipRole = role === 'agent' ? 'agent' : 'viewer'
      const resolvedMembershipRole = normalizeText(context?.membershipRole || fallbackMembershipRole) || fallbackMembershipRole

      setOrganisationId(effectiveOrgId)
      setOrganisationName(
        normalizeText(
          context?.organisation?.display_name ||
            context?.organisation?.displayName ||
            context?.organisation?.name ||
            currentWorkspace?.name,
        ),
      )
      setMembershipRole(resolvedMembershipRole)
      if (effectiveOrgId && isUnsafeFallbackAllowed()) {
        const recovery = recoverAgencyPipelineStoreForOrganisation(effectiveOrgId)
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
  }, [currentAgent.email, currentAgent.fullName, currentAgent.id, currentWorkspace?.id, currentWorkspace?.name, isCalendarMode, profile?.firstName, profile?.lastName, reloadRecords, role])

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
    if (!organisationId || typeof window === 'undefined') return undefined

    const refreshBuyerLifecycle = (payload = {}) => {
      const eventOrgId = normalizeText(payload?.organisationId)
      if (eventOrgId && eventOrgId !== organisationId) return
      const eventLeadId = normalizeLeadIdentityKey(payload?.leadId)
      if (eventLeadId && selectedLeadId && eventLeadId !== normalizeLeadIdentityKey(selectedLeadId)) {
        scheduleRecordsReload(organisationId, 0)
        return
      }
      setSelectedLeadOffersRefreshTick((value) => value + 1)
      scheduleRecordsReload(organisationId, 0)
    }

    const handleBuyerLifecycleRefresh = (event) => {
      refreshBuyerLifecycle(event?.detail || {})
    }
    const handleStorageRefresh = (event) => {
      if (event?.key !== BUYER_LIFECYCLE_REFRESH_STORAGE_KEY || !event?.newValue) return
      try {
        refreshBuyerLifecycle(JSON.parse(event.newValue))
      } catch {
        refreshBuyerLifecycle({})
      }
    }

    window.addEventListener(BUYER_LIFECYCLE_REFRESH_EVENT, handleBuyerLifecycleRefresh)
    window.addEventListener('storage', handleStorageRefresh)
    return () => {
      window.removeEventListener(BUYER_LIFECYCLE_REFRESH_EVENT, handleBuyerLifecycleRefresh)
      window.removeEventListener('storage', handleStorageRefresh)
    }
  }, [organisationId, scheduleRecordsReload, selectedLeadId])

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
        stage: 'Seller Onboarding Submitted',
        status: 'Submitted',
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
        outcome: 'Seller onboarding submitted',
      }, { actor: currentAgent }).catch((syncError) => {
        console.warn('[PIPELINE] non-blocking seller onboarding activity sync failed', syncError)
      })
      setMessage('Seller onboarding submitted. Seller journey updated.')
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
      leadCategory: leadTypeView === 'seller' ? 'seller' : 'buyer',
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
    if (leadWorkspaceTab === 'tasks') {
      setLeadWorkspaceTab('activity')
    }
  }, [leadWorkspaceTab])

  useEffect(() => {
    setLeadActionsMenuOpen(false)
  }, [selectedLeadId])

  useEffect(() => {
    if (!routeLeadId || !records.leads.length) return
    const routeKey = normalizeLeadIdentityKey(routeLeadId)
    const routeLead = records.leads.find((row) => normalizeLeadIdentityKey(row?.leadId) === routeKey)
    if (!routeLead) return
    const category = resolveLeadCategoryView(routeLead)
    if (leadTypeView !== category) {
      setLeadTypeView(category)
    }
  }, [leadTypeView, records.leads, routeLeadId])

  useEffect(() => {
    if (!isLeadWorkspaceRoute || !routeLeadId || routeLeadRecord || !organisationId || !isSupabaseConfigured) return
    const hydrationKey = `${organisationId}:${normalizeLeadIdentityKey(routeLeadId)}`
    if (routeLeadHydrationRef.current === hydrationKey) return
    let attempt = 0
    let retryTimer = null
    let cancelled = false
    routeLeadHydrationRef.current = hydrationKey

    const mergeRouteLeadSnapshot = (snapshot) => {
      if (!snapshot?.leads?.length) return false
      setRecords((previous) => ({
        ...previous,
        contacts: dedupeByKey(
          [...previous.contacts, ...(Array.isArray(snapshot.contacts) ? snapshot.contacts : [])],
          (row) => row?.contactId,
        ),
        leads: mergeLeadRowsForReload(previous.leads, snapshot.leads),
        leadActivities: dedupeByKey(
          [...previous.leadActivities, ...(Array.isArray(snapshot.leadActivities) ? snapshot.leadActivities : [])],
          (row) => row?.activityId,
        ),
        tasks: dedupeByKey(
          [...previous.tasks, ...(Array.isArray(snapshot.tasks) ? snapshot.tasks : [])],
          (row) => row?.taskId,
        ),
      }))
      return true
    }

    const hydrateLeadWorkspace = async () => {
      if (cancelled || attempt >= LEAD_WORKSPACE_HYDRATION_MAX_RETRIES) return
      attempt += 1
      try {
        const snapshot = await withPipelineTimeout(
          fetchAgencyCrmLeadWorkspace(organisationId, routeLeadId),
          'Lead workspace data is taking too long to load.',
          LEAD_WORKSPACE_HYDRATION_TIMEOUT_MS,
        )
        if (cancelled) return
        if (mergeRouteLeadSnapshot(snapshot)) return
      } catch (leadWorkspaceError) {
        console.warn('[PIPELINE] lead workspace hydration failed; full workspace refresh will continue in the background.', leadWorkspaceError)
      }
      if (!cancelled && attempt < LEAD_WORKSPACE_HYDRATION_MAX_RETRIES && typeof window !== 'undefined') {
        retryTimer = window.setTimeout(hydrateLeadWorkspace, LEAD_WORKSPACE_HYDRATION_RETRY_MS)
      }
    }

    void hydrateLeadWorkspace()
    return () => {
      cancelled = true
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
    const visibleRows = records.leads.filter((lead) => {
      const canvassingProspect = (Array.isArray(canvassingStore.prospects) ? canvassingStore.prospects : [])
        .find((prospect) => normalizeText(prospect?.id) === normalizeText(lead?.canvassingProspectId))
      const contact =
        records.contacts.find((row) => normalizeText(row?.contactId) === normalizeText(lead?.contactId)) ||
        buildLeadContactFallback(lead) ||
        buildCanvassingProspectContactFallback(canvassingProspect)
      const resolvedCategory = resolveLeadCategoryView(lead)
      const categoryMatch = leadTypeView === 'all' ? true : resolvedCategory === leadTypeView
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
    return Array.from(
      new Set(
        records.leads
          .filter((lead) => leadTypeView === 'all' ? true : resolveLeadCategoryView(lead) === leadTypeView)
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
    return resolveLeadContactSnapshot(
      selectedLead,
      records.contacts.find((contact) => normalizeText(contact?.contactId) === normalizeText(selectedLead.contactId)),
      canvassingProspectById.get(normalizeText(selectedLead?.canvassingProspectId)),
    )
  }, [canvassingProspectById, records.contacts, selectedLead])

  const selectedLeadSyncStatus = normalizeText(selectedLead?.syncStatus || selectedLead?.sync_status)
  const selectedLeadSyncError = normalizeText(selectedLead?.syncError || selectedLead?.sync_error)
  const selectedLeadHasSyncIssue = Boolean(
    selectedLead &&
    resolveLeadCategoryView(selectedLead) !== 'seller' &&
    (selectedLeadSyncStatus === 'pending_remote_sync' || selectedLeadSyncError),
  )

  async function ensureBuyerLeadPersistedForLifecycle(lead = selectedLead, contact = selectedLeadContact) {
    if (!lead) {
      throw new Error('Select a buyer lead before continuing.')
    }
    const isSeller = resolveLeadCategoryView(lead) === 'seller'
    if (isSeller) return { ok: true, skipped: true }
    const result = await ensureAgencyCrmLeadRecordPersisted(
      organisationId,
      lead,
      contact || buildLeadContactFallback(lead),
      {
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      },
    )
    if (result?.repaired) {
      setRecords((previous) => ({
        ...previous,
        leads: previous.leads.map((row) =>
          normalizeLeadIdentityKey(row?.leadId || row?.id) === normalizeLeadIdentityKey(lead?.leadId || lead?.id)
            ? { ...row, syncStatus: '', syncError: '', leadId: result.leadId || row.leadId, contactId: result.contactId || row.contactId }
            : row,
        ),
      }))
      setMessage('Lead was repaired and synced to Supabase before continuing.')
    }
    return result
  }

  async function handleRepairSelectedLeadSync() {
    if (!selectedLead) return
    try {
      setError('')
      await ensureBuyerLeadPersistedForLifecycle(selectedLead, selectedLeadContact)
      await reloadRecords(organisationId)
      setMessage('Lead synced to Supabase. Buyer lifecycle actions can continue.')
    } catch (repairError) {
      setError(repairError?.message || 'Unable to repair this lead sync right now.')
    }
  }

  const selectedLeadDisplayName = useMemo(() => {
    if (!selectedLead && !selectedLeadContact) return 'Lead Workspace'
    return resolveLeadDisplayName(
      selectedLead,
      selectedLeadContact,
      canvassingProspectById.get(normalizeText(selectedLead?.canvassingProspectId)),
      'Unnamed Lead',
    )
  }, [canvassingProspectById, selectedLead, selectedLeadContact])

  const selectedLeadPropertyLabel = useMemo(() => {
    if (!selectedLead) return 'No property linked'
    return normalizeText(selectedLead?.sellerPropertyAddress || selectedLead?.propertyInterest || selectedLead?.areaInterest || selectedLead?.listingId) ||
      'No property linked'
  }, [selectedLead])

  const selectedLeadAssignedAgentLabel = useMemo(() => {
    if (!selectedLead) return 'Unassigned'
    return normalizeText(selectedLead.assignedAgentName || selectedLead.assignedAgentEmail || currentAgent.fullName) || 'Unassigned'
  }, [currentAgent.fullName, selectedLead])

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
    const leadKey = normalizeLeadIdentityKey(selectedLead?.leadId)
    const explicitTransactionId = normalizeText(selectedLead?.convertedTransactionId || selectedLead?.convertedDealId)
    const convertedOffer = (Array.isArray(selectedLeadOffers) ? selectedLeadOffers : [])
      .find((offer) => normalizeText(offer?.transactionId))
    const offerTransactionId = normalizeText(convertedOffer?.transactionId)
    const targetTransactionId = explicitTransactionId || offerTransactionId
    const dealRows = Array.isArray(records.deals) ? records.deals : []
    const dealMatchesTransaction = (row) => {
      const rowTransactionId = normalizeText(row?.transactionId || row?.dealId || row?.id)
      return targetTransactionId && rowTransactionId === targetTransactionId
    }
    const linkedDeal = (
      (targetTransactionId ? dealRows.find(dealMatchesTransaction) : null) ||
      dealRows
        .filter((row) => normalizeLeadIdentityKey(row?.leadId) === leadKey)
        .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0] ||
      null
    )
    if (linkedDeal) return linkedDeal
    if (targetTransactionId) {
      return {
        id: targetTransactionId,
        transactionId: targetTransactionId,
        dealId: targetTransactionId,
        leadId: selectedLead.leadId,
        stage: 'Buyer Onboarding Pending',
        status: 'Onboarding',
        source: offerTransactionId ? 'canonical_offer' : 'lead_conversion_link',
        acceptedOfferId: normalizeText(convertedOffer?.id),
        createdAt: normalizeText(convertedOffer?.convertedToTransactionAt || convertedOffer?.updatedAt || selectedLead?.updatedAt),
        updatedAt: normalizeText(convertedOffer?.updatedAt || selectedLead?.updatedAt),
      }
    }
    return null
  }, [records.deals, selectedLead, selectedLeadOffers])
  const selectedLeadLinkedTransactionId = useMemo(
    () => normalizeText(selectedLeadLinkedTransaction?.transactionId || selectedLeadLinkedTransaction?.dealId || selectedLeadLinkedTransaction?.id),
    [selectedLeadLinkedTransaction],
  )

  useEffect(() => {
    const leadId = normalizeText(selectedLead?.leadId)
    if (!organisationId || !leadId) {
      setSelectedLeadOffers([])
      setSelectedLeadOfferPortalSessions([])
      setSelectedLeadOffersError('')
      setSelectedLeadOffersLoading(false)
      return
    }
    let cancelled = false
    setSelectedLeadOffersLoading(true)
    setSelectedLeadOffersError('')
    const selectedAppointmentIds = selectedLeadAppointments
      .map((appointment) => normalizeText(appointment?.appointmentId || appointment?.id))
      .filter(Boolean)
    const selectedListingIds = [
      selectedLead?.listingId,
      selectedLead?.listing_id,
      ...selectedLeadAppointments.map((appointment) => appointment?.listingId || appointment?.listing_id),
    ].map(normalizeText).filter(Boolean)
    const selectedBuyerName = [
      selectedLeadContact?.firstName,
      selectedLeadContact?.lastName,
    ].map(normalizeText).filter(Boolean).join(' ') ||
      normalizeText(selectedLead?.buyerName || selectedLead?.name)

    Promise.all([
      listCanonicalOffersForLead({
        organisationId,
        leadId,
        contactId: normalizeText(selectedLead?.contactId || selectedLeadContact?.contactId),
        appointmentIds: selectedAppointmentIds,
        listingIds: selectedListingIds,
        buyerEmail: normalizeText(selectedLeadContact?.email || selectedLead?.email),
        buyerPhone: normalizeText(selectedLeadContact?.phone || selectedLead?.phone),
        buyerName: selectedBuyerName,
      }),
      listOfferPortalSessions({
        organisationId,
        leadId,
        contactId: normalizeText(selectedLead?.contactId || selectedLeadContact?.contactId),
        appointmentIds: selectedAppointmentIds,
      }).catch(() => []),
    ])
      .then(([offers, sessions]) => {
        if (!cancelled) {
          setSelectedLeadOffers(Array.isArray(offers) ? offers : [])
          setSelectedLeadOfferPortalSessions(Array.isArray(sessions) ? sessions : [])
        }
      })
      .catch((offerError) => {
        if (!cancelled) {
          setSelectedLeadOffers([])
          setSelectedLeadOfferPortalSessions([])
          setSelectedLeadOffersError(offerError?.message || 'Unable to load offers for this lead.')
        }
      })
      .finally(() => {
        if (!cancelled) setSelectedLeadOffersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    organisationId,
    selectedLead?.buyerName,
    selectedLead?.contactId,
    selectedLead?.email,
    selectedLead?.leadId,
    selectedLead?.listingId,
    selectedLead?.listing_id,
    selectedLead?.name,
    selectedLead?.phone,
    selectedLeadAppointments,
    selectedLeadContact?.contactId,
    selectedLeadContact?.email,
    selectedLeadContact?.firstName,
    selectedLeadContact?.lastName,
    selectedLeadContact?.phone,
    selectedLeadOffersRefreshTick,
  ])

  const selectedLeadOfferSummary = useMemo(() => {
    const rows = Array.isArray(selectedLeadOffers) ? selectedLeadOffers : []
    const statusCount = (status) => rows.filter((offer) => normalizeText(offer?.status).toLowerCase() === status).length
    const activeRows = rows.filter((offer) => !['rejected', 'withdrawn', 'expired'].includes(normalizeText(offer?.status).toLowerCase()))
    const highestOffer = rows.reduce((highest, offer) => {
      const value = Number(offer?.offerAmount || 0)
      return Number.isFinite(value) && value > highest ? value : highest
    }, 0)
    return {
      total: rows.length,
      active: activeRows.length,
      drafts: statusCount('draft'),
      submitted: statusCount('submitted'),
      accepted: statusCount('accepted'),
      highestOffer,
    }
  }, [selectedLeadOffers])
  const selectedLeadLifecycleDiagnosticOffer = useMemo(() => {
    const rows = Array.isArray(selectedLeadOffers) ? selectedLeadOffers : []
    return rows.find((offer) => normalizeText(offer?.transactionId)) ||
      rows.find((offer) => normalizeText(offer?.status).toLowerCase() === 'accepted') ||
      rows[0] ||
      null
  }, [selectedLeadOffers])

  useEffect(() => {
    const leadId = normalizeText(selectedLead?.leadId)
    const offerId = normalizeText(selectedLeadLifecycleDiagnosticOffer?.id)
    if (!organisationId || !leadId || (!offerId && !selectedLeadLinkedTransactionId)) {
      setSelectedLeadLifecycleDiagnostic(null)
      setSelectedLeadLifecycleDiagnosticError('')
      setSelectedLeadLifecycleDiagnosticLoading(false)
      return
    }

    let cancelled = false
    setSelectedLeadLifecycleDiagnosticLoading(true)
    setSelectedLeadLifecycleDiagnosticError('')
    getBuyerLeadLifecycleDiagnostic({
      organisationId,
      leadId,
      offerId,
      transactionId: selectedLeadLinkedTransactionId,
    })
      .then((diagnostic) => {
        if (!cancelled) setSelectedLeadLifecycleDiagnostic(diagnostic)
      })
      .catch((diagnosticError) => {
        if (!cancelled) {
          setSelectedLeadLifecycleDiagnostic(null)
          setSelectedLeadLifecycleDiagnosticError(diagnosticError?.message || 'Unable to load lifecycle diagnostic.')
        }
      })
      .finally(() => {
        if (!cancelled) setSelectedLeadLifecycleDiagnosticLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    organisationId,
    selectedLead?.leadId,
    selectedLeadLifecycleDiagnosticOffer?.id,
    selectedLeadLinkedTransactionId,
    selectedLeadOffersRefreshTick,
  ])

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

  const selectedLeadIsSeller = resolveLeadCategoryView(selectedLead) === 'seller'
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
  const selectedLeadBuyerOnboardingStatusKey = normalizeText(
    selectedLeadLifecycleDiagnostic?.onboarding?.status ||
      selectedLeadLifecycleDiagnostic?.transaction?.onboarding_status ||
      selectedLead?.buyerOnboardingStatus ||
      selectedLead?.clientOnboardingStatus,
  ).toLowerCase()
  const selectedLeadBuyerOnboardingSubmitted = Boolean(
    selectedLeadBuyerOnboardingStatusKey.includes('submitted') ||
      selectedLeadBuyerOnboardingStatusKey.includes('complete') ||
      selectedLeadLifecycleDiagnostic?.onboarding?.submitted_at ||
      selectedLeadLifecycleDiagnostic?.transaction?.onboarding_completed_at,
  )
  const selectedLeadClientIntakePreference = normalizeClientIntakePreference(
    selectedLeadLifecycleDiagnostic?.onboardingPrefill?.form_data?.bridge_client_intake_preference ||
      selectedLeadLifecycleDiagnostic?.onboardingPrefill?.formData?.bridge_client_intake_preference ||
      selectedLeadLifecycleDiagnostic?.offer?.conditions?.clientIntakePreference ||
      selectedLeadLifecycleDiagnostic?.offer?.conditions?.deliveryMode ||
      offerLinkForm.clientIntakePreference,
  )
  const selectedLeadBuyerOnboardingActionLabel =
    canonicalOfferActionId === `lead:${selectedLead?.leadId}:buyer-onboarding`
      ? 'Sending...'
      : selectedLeadClientIntakePreference === CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED
        ? selectedLeadBuyerOnboardingSubmitted
          ? 'Reopen Assisted Onboarding'
          : 'Prepare Assisted Onboarding'
        : selectedLeadClientIntakePreference === CLIENT_INTAKE_PREFERENCE.HARD_COPY
          ? selectedLeadBuyerOnboardingSubmitted
            ? 'Reopen Hard-Copy Pack'
            : 'Prepare Hard-Copy Onboarding'
          : selectedLeadBuyerOnboardingSubmitted
            ? 'Resend Link to Portal'
            : selectedLeadLinkedTransactionId
              ? 'Resend Buyer Onboarding'
              : 'Send Buyer Onboarding'
  const selectedLeadSellerOnboardingActionLabel = isSellerOnboardingSending
    ? 'Sending...'
    : selectedLeadOnboardingCompleted
      ? 'Resend Link to Portal'
      : selectedLeadOnboardingStatusKey === 'not_sent'
        ? 'Send Seller Onboarding'
        : 'Resend Seller Onboarding'
  const selectedLeadFinanceFormData = useMemo(() => (
    selectedLeadLifecycleDiagnostic?.onboardingPrefill?.form_data ||
    selectedLeadLifecycleDiagnostic?.onboardingPrefill?.formData ||
    {}
  ), [selectedLeadLifecycleDiagnostic?.onboardingPrefill])
  const selectedLeadFinanceReadinessSummary = useMemo(() => getFinanceReadinessSummary({
    transaction: selectedLeadLinkedTransaction?.transaction || selectedLeadLinkedTransaction || {
      id: selectedLeadLinkedTransactionId,
      finance_type: selectedLead?.financeType || selectedLead?.finance_type,
      purchase_price: selectedLead?.budget || selectedLead?.estimatedValue,
      deposit_amount: selectedLead?.depositAmount,
    },
    onboardingFormData: selectedLeadFinanceFormData,
    documentSummary: selectedLeadLinkedTransaction?.documentSummary || {},
    onboardingPrefill: selectedLeadLifecycleDiagnostic?.onboardingPrefill || null,
  }), [
    selectedLead?.budget,
    selectedLead?.depositAmount,
    selectedLead?.estimatedValue,
    selectedLead?.financeType,
    selectedLead?.finance_type,
    selectedLeadFinanceFormData,
    selectedLeadLifecycleDiagnostic?.onboardingPrefill,
    selectedLeadLinkedTransaction,
    selectedLeadLinkedTransactionId,
  ])
  const selectedLeadShowFinanceReadiness =
    !selectedLeadIsSeller &&
    shouldShowFinanceReadinessSection(selectedLeadLinkedTransaction?.transaction || selectedLeadLinkedTransaction || selectedLead || {})
  const selectedLeadShowBondReadinessCta = shouldShowBondReadinessCta(selectedLeadLinkedTransaction?.transaction || selectedLeadLinkedTransaction || selectedLead || {})

  useEffect(() => {
    if (!selectedLead) return
    if (selectedLeadIsSeller && ['appointments', 'offers', 'tasks'].includes(leadWorkspaceTab)) {
      setLeadWorkspaceTab('overview')
    }
    if (!selectedLeadIsSeller && ['listing_journey'].includes(leadWorkspaceTab)) {
      setLeadWorkspaceTab('overview')
    }
  }, [leadWorkspaceTab, selectedLead, selectedLeadIsSeller])
  const selectedLeadFinanceIntelligenceSource = useMemo(() => ({
    transaction: selectedLeadLinkedTransaction?.transaction || selectedLeadLinkedTransaction || {
      id: selectedLeadLinkedTransactionId,
      finance_type: selectedLead?.financeType || selectedLead?.finance_type,
      purchase_price: selectedLead?.budget || selectedLead?.estimatedValue,
      deposit_amount: selectedLead?.depositAmount,
    },
    onboardingFormData: selectedLeadFinanceFormData,
    documentSummary: selectedLeadLinkedTransaction?.documentSummary || {},
    onboardingPrefill: selectedLeadLifecycleDiagnostic?.onboardingPrefill || null,
  }), [
    selectedLead?.budget,
    selectedLead?.depositAmount,
    selectedLead?.estimatedValue,
    selectedLead?.financeType,
    selectedLead?.finance_type,
    selectedLeadFinanceFormData,
    selectedLeadLifecycleDiagnostic?.onboardingPrefill,
    selectedLeadLinkedTransaction,
    selectedLeadLinkedTransactionId,
  ])
  const selectedLeadApprovalConfidence = useMemo(
    () => calculateApprovalProbability(selectedLeadFinanceIntelligenceSource),
    [selectedLeadFinanceIntelligenceSource],
  )
  const selectedLeadOperationalRisk = useMemo(
    () => calculateOperationalRisk(selectedLeadFinanceIntelligenceSource),
    [selectedLeadFinanceIntelligenceSource],
  )
  const selectedLeadVelocity = useMemo(
    () => calculateTransactionVelocity(selectedLeadFinanceIntelligenceSource),
    [selectedLeadFinanceIntelligenceSource],
  )
  const selectedLeadFinanceInsights = useMemo(
    () => generateFinanceInsights(selectedLeadFinanceIntelligenceSource),
    [selectedLeadFinanceIntelligenceSource],
  )
  const selectedLeadTransactionConfidence = Math.round(
    (selectedLeadApprovalConfidence.score * 0.55) +
      ((100 - selectedLeadOperationalRisk.riskScore) * 0.25) +
      (selectedLeadVelocity.velocityScore * 0.2),
  )

  useEffect(() => {
    if (!selectedLead || selectedLeadIsSeller) {
      setFinanceReadinessForm(FINANCE_READINESS_FORM_DEFAULTS)
      return
    }
    setFinanceReadinessForm(financeFormFromSummary(selectedLeadFinanceReadinessSummary))
  }, [selectedLead, selectedLead?.leadId, selectedLeadIsSeller, selectedLeadFinanceReadinessSummary])

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
          stage: 'Seller Onboarding Submitted',
          status: 'Submitted',
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
          outcome: 'Seller onboarding submitted',
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
  const selectedLeadMandateRequiresCompletedOnboarding =
    selectedLeadIsSeller &&
    !selectedLeadOnboardingCompleted &&
    selectedLeadMandateActionState.actionKey === 'generate'
  const selectedLeadMandateActionDisabled =
    isMandateGenerating || isMandateSending || selectedLeadMandateRequiresCompletedOnboarding
  const selectedLeadMandateActionTitle = selectedLeadMandateRequiresCompletedOnboarding
    ? 'Send seller onboarding and wait for the seller to submit their details before generating the mandate.'
    : !selectedLeadHasMandateData && selectedLeadMandateActionState.actionKey === 'generate'
      ? 'Open the legal workspace and complete missing seller/property details manually.'
      : selectedLeadMandateActionMeta

  const selectedLeadMandateSignedEvidence = useMemo(() => {
    const mandateSigningStatus = normalizeText(mandatePacketStatus?.signingStatus).toLowerCase()
    const mandatePacketState = normalizeText(mandatePacketStatus?.state || mandatePacketStatus?.packet?.status).toLowerCase()
    const mandateSourceContext =
      mandatePacketStatus?.packet?.source_context_json && typeof mandatePacketStatus.packet.source_context_json === 'object'
        ? mandatePacketStatus.packet.source_context_json
        : {}
    const mandateSourceSigningStatus = normalizeText(
      mandateSourceContext.signingStatus ||
        mandateSourceContext.signing_status ||
        mandateSourceContext.mandateStatus ||
        mandateSourceContext.mandate_status,
    ).toLowerCase()
    const mandateSummary = mandatePacketStatus?.signingSummary || {}
    const requiredFieldCount = Number(mandateSummary.requiredFieldCount || 0)
    const completedRequiredFieldCount = Number(mandateSummary.completedRequiredFieldCount || 0)
    const allRequiredFieldsCompleted =
      Boolean(mandateSummary.allRequiredFieldsCompleted) ||
      (requiredFieldCount > 0 && completedRequiredFieldCount === requiredFieldCount)
    const allRequiredSignersCompleted =
      Boolean(mandateSummary.allSignersSigned) &&
      Number(mandateSummary.signerCount || 0) > 0 &&
      (requiredFieldCount === 0 || allRequiredFieldsCompleted)
    const mandateHasFinalArtifact = (Array.isArray(mandatePacketStatus?.versions) ? mandatePacketStatus.versions : []).some((version) =>
      normalizeText(version?.final_signed_file_path || version?.final_signed_file_url || version?.final_signed_file_access_url),
    )
    return (
      ['signed', 'uploaded_signed', 'completed', 'fully_signed'].includes(mandateSigningStatus) ||
      ['signed', 'uploaded_signed', 'completed', 'fully_signed'].includes(mandateSourceSigningStatus) ||
      ['signed', 'completed', 'fully_signed'].includes(mandatePacketState) ||
      allRequiredSignersCompleted ||
      mandateHasFinalArtifact
    )
  }, [mandatePacketStatus])

  const selectedLeadEffectiveLifecycleStage =
    selectedLeadIsSeller && selectedLeadMandateSignedEvidence
      ? 'Mandate Signed'
      : selectedLead?.stage || resolveLeadFunnelStage(selectedLead)

  const selectedLeadWorkflowHealth = useMemo(() => {
    if (!selectedLead) {
      return { completed: 0, total: 0, percent: 0, missing: [] }
    }

    const isSeller = resolveLeadCategoryView(selectedLead) === 'seller'
    const stage = normalizeText(selectedLead.stage).toLowerCase()
    const appointments = selectedLeadAppointments || []
    const hasAppointment = appointments.length > 0
    const hasCompletedAppointment = appointments.some((row) => normalizeText(row?.status).toLowerCase() === 'completed')
    const hasTransaction = Boolean(selectedLeadLinkedTransaction)
    const hasOffer = stage.includes('offer') || hasTransaction || selectedLeadOfferSummary.total > 0
    const hasListing = Boolean(
      normalizeText(selectedLead?.listingId || selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress),
    )
    const hasMandate = Boolean(
      normalizeText(mandatePacketStatus?.packet?.id) &&
        documentPacketBelongsToLead(mandatePacketStatus?.packet, selectedLead?.leadId),
    )
    const mandateSigned = stage.includes('mandate signed') || selectedLeadMandateSignedEvidence
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
  }, [mandatePacketStatus?.packet, selectedLead, selectedLeadAppointments, selectedLeadLinkedTransaction, selectedLeadMandateSignedEvidence, selectedLeadOfferSummary.total])

  const selectedLeadUnifiedTimeline = useMemo(() => {
    const classifyActivity = (activity = {}) => {
      const type = normalizeText(activity?.activityType).toLowerCase()
      if (type.includes('call') || type.includes('phone')) return 'call'
      if (type.includes('appointment') || type.includes('viewing') || type.includes('meeting') || type.includes('consultation')) return 'appointment'
      if (type.includes('offer') || type.includes('otp') || type.includes('mandate')) return 'offer'
      if (type.includes('stage') || type.includes('system') || type.includes('created') || type.includes('converted')) return 'system'
      if (type.includes('follow')) return 'follow_up'
      if (type.includes('note')) return 'note'
      return 'activity'
    }

    const timelineRows = []

    for (const activity of selectedLeadActivities) {
      const sourceType = classifyActivity(activity)
      timelineRows.push({
        id: `activity:${activity.activityId}`,
        sourceType,
        sourceLabel: sourceType === 'system' ? 'System Update' : sourceType === 'note' ? 'Note Added' : 'Activity Logged',
        title: normalizeText(activity.activityType) || 'Lead update',
        description: normalizeText(activity.activityNote),
        actorName: normalizeText(activity.agentName || activity.agentEmail) || (sourceType === 'system' ? 'System Update' : currentAgent.fullName || 'Agent'),
        timestamp: activity.activityDate || activity.createdAt || new Date().toISOString(),
        outcome: normalizeText(activity.outcome),
        original: activity,
      })
    }

    for (const task of selectedLeadTasks) {
      const taskText = normalizeText(`${task.title} ${task.description}`).toLowerCase()
      const isFollowUp = taskText.includes('follow') || normalizeText(task.title).toLowerCase().includes('call')
      const completed = normalizeText(task.status).toLowerCase() === 'completed'
      timelineRows.push({
        id: `task:${task.taskId}`,
        sourceType: isFollowUp ? 'follow_up' : 'task',
        sourceLabel: completed ? (isFollowUp ? 'Follow-up Completed' : 'Task Completed') : (isFollowUp ? 'Follow-up Scheduled' : 'Task Created'),
        title: normalizeText(task.title) || (isFollowUp ? 'Follow-up' : 'Task'),
        description: normalizeText(task.description),
        actorName: normalizeText(task.assignedAgentName || task.assignedAgentEmail) || currentAgent.fullName || 'Agent',
        timestamp: task.createdAt || task.updatedAt || task.dueDate || new Date().toISOString(),
        dueDate: normalizeText(task.dueDate),
        priority: normalizeText(task.priority) || 'Medium',
        status: normalizeText(task.status) || 'Pending',
        original: task,
      })
    }

    for (const appointment of selectedLeadAppointments) {
      const status = normalizeText(appointment.status || 'requested')
      timelineRows.push({
        id: `appointment:${appointment.appointmentId}`,
        sourceType: 'appointment',
        sourceLabel: status.toLowerCase() === 'completed' ? 'Appointment Feedback Added' : 'Appointment Booked',
        title: getAppointmentTypeLabel(appointment.appointmentType) || appointment.title || 'Appointment',
        description: normalizeText(appointment.outcomeSummary || appointment.clientFeedback || appointment.agentNotes || appointment.notes || appointment.listingLabel || appointment.listingId),
        actorName: normalizeText(appointment.assignedAgentName || appointment.assignedAgentEmail) || currentAgent.fullName || 'Agent',
        timestamp: appointment.updatedAt || appointment.createdAt || appointment.dateTime || new Date().toISOString(),
        dueDate: appointment.dateTime || appointment.date || '',
        status,
        original: appointment,
      })
    }

    for (const offer of selectedLeadOffers) {
      const statusKey = normalizeText(offer.status).toLowerCase()
      const linkedTransactionId = normalizeText(offer.transactionId)
      timelineRows.push({
        id: `offer:${offer.id}`,
        sourceType: 'offer',
        sourceLabel: statusKey === 'converted_to_transaction'
          ? 'Transaction Created'
          : statusKey === 'accepted'
            ? 'Offer Accepted'
            : statusKey === 'submitted'
              ? 'Offer Submitted'
              : 'Offer Update',
        title: statusKey === 'converted_to_transaction'
          ? 'Accepted offer converted to transaction'
          : normalizeText(offer.status)
            ? `Offer ${offer.status}`
            : 'Offer',
        description: [
          offer.offerAmount ? `Amount: ${formatCurrency(offer.offerAmount)}` : '',
          offer.listingId ? `Listing: ${offer.listingLabel || offer.listingId}` : '',
          linkedTransactionId ? `Transaction: ${linkedTransactionId}` : '',
        ].filter(Boolean).join(' · '),
        actorName: currentAgent.fullName || 'Agent',
        timestamp: offer.updatedAt || offer.submittedAt || offer.createdAt || new Date().toISOString(),
        status: normalizeText(offer.status),
        transactionId: linkedTransactionId,
        original: offer,
      })
    }

    if (selectedLeadNotes) {
      timelineRows.push({
        id: `lead-note:${selectedLead?.leadId || 'selected'}`,
        sourceType: 'note',
        sourceLabel: 'Note Added',
        title: 'Lead note',
        description: selectedLeadNotes,
        actorName: selectedLeadAssignedAgentLabel,
        timestamp: selectedLead?.updatedAt || selectedLead?.createdAt || new Date().toISOString(),
        status: 'Internal',
      })
    }

    if (selectedLeadIsSeller && selectedLead) {
      timelineRows.push({
        id: `seller-created:${selectedLead.leadId || 'selected'}`,
        sourceType: 'system',
        sourceLabel: 'Seller Lead Created',
        title: 'Seller lead entered the pipeline',
        description: normalizeText(selectedLead.sellerPropertyAddress || selectedLead.propertyInterest || selectedLead.areaInterest),
        actorName: 'System Update',
        timestamp: selectedLead.createdAt || selectedLead.updatedAt || new Date().toISOString(),
        status: 'Seller',
      })

      for (const appointment of selectedLeadAppointments) {
        const appointmentSignal = normalizeKey([
          appointment?.appointmentType,
          appointment?.customTypeLabel,
          appointment?.title,
          appointment?.linkedWorkflow,
          appointment?.linkedWorkflowStage,
        ].filter(Boolean).join(' '))
        if (!appointmentSignal.includes('seller') && !appointmentSignal.includes('valuation') && !appointmentSignal.includes('appraisal')) continue
        const statusKey = normalizeKey(appointment?.status)
        const completed = statusKey.includes('complete') || appointment?.completedAt
        timelineRows.push({
          id: `seller-valuation:${appointment.appointmentId || appointment.id || appointment.dateTime || appointment.createdAt}`,
          sourceType: 'appointment',
          sourceLabel: completed ? 'Valuation Completed' : 'Valuation Scheduled',
          title: getAppointmentTypeLabel(appointment.appointmentType) || appointment.title || 'Seller valuation',
          description: normalizeText(appointment.outcomeSummary || appointment.agentNotes || appointment.notes || appointment.location),
          actorName: normalizeText(appointment.assignedAgentName || appointment.assignedAgentEmail) || currentAgent.fullName || 'Agent',
          timestamp: appointment.updatedAt || appointment.completedAt || appointment.createdAt || appointment.dateTime || new Date().toISOString(),
          dueDate: appointment.dateTime || appointment.date || '',
          status: completed ? 'Completed' : normalizeText(appointment.status || 'Scheduled'),
          original: appointment,
        })
      }

      const mandateLabel = selectedLeadMandateSignedEvidence
        ? 'Mandate Signed'
        : normalizeText(selectedLead?.mandateStatus || selectedLead?.mandate_status || selectedLead?.stage || selectedLead?.status).toLowerCase().includes('sent')
          ? 'Mandate Sent'
          : normalizeText(selectedLead?.mandatePacketId || selectedLead?.mandate_packet_id || mandatePacketStatus?.packet?.id)
            ? 'Mandate Generated'
            : ''
      if (mandateLabel) {
        timelineRows.push({
          id: `seller-mandate:${selectedLead.leadId || 'selected'}`,
          sourceType: 'offer',
          sourceLabel: mandateLabel,
          title: mandateLabel,
          description: normalizeText(mandatePacketStatus?.packet?.title || selectedLead?.mandatePacketId || selectedLead?.mandate_packet_id),
          actorName: currentAgent.fullName || 'Agent',
          timestamp: mandatePacketStatus?.packet?.updated_at || mandatePacketStatus?.packet?.created_at || selectedLead.updatedAt || selectedLead.createdAt || new Date().toISOString(),
          status: mandateLabel.replace('Mandate ', ''),
        })
      }

      const listingId = normalizeText(selectedLead?.listingId || selectedLead?.listing_id || selectedLead?.privateListingId || selectedLead?.private_listing_id)
      if (listingId) {
        const listingLive = normalizeKey(selectedLeadEffectiveLifecycleStage).includes('listing_live') ||
          normalizeKey(selectedLeadEffectiveLifecycleStage).includes('listing_active') ||
          normalizeKey(selectedLead?.listingStatus || selectedLead?.listing_status).includes('active')
        timelineRows.push({
          id: `seller-listing:${listingId}`,
          sourceType: 'system',
          sourceLabel: listingLive ? 'Listing Activated' : 'Listing Created',
          title: listingLive ? 'Seller listing is live' : 'Seller listing created',
          description: listingId,
          actorName: 'System Update',
          timestamp: selectedLead.updatedAt || selectedLead.createdAt || new Date().toISOString(),
          status: listingLive ? 'Live' : 'Draft',
        })
      }
    }

    return timelineRows.sort((left, right) => {
      const leftTime = new Date(left.timestamp || left.dueDate || 0).getTime()
      const rightTime = new Date(right.timestamp || right.dueDate || 0).getTime()
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })
  }, [
    currentAgent.fullName,
    selectedLead,
    selectedLeadActivities,
    selectedLeadAppointments,
    selectedLeadAssignedAgentLabel,
    selectedLeadEffectiveLifecycleStage,
    selectedLeadIsSeller,
    selectedLeadMandateSignedEvidence,
    selectedLeadNotes,
    selectedLeadOffers,
    selectedLeadTasks,
    mandatePacketStatus,
  ])

  const selectedLeadFilteredTimeline = useMemo(() => {
    if (activityTimelineFilter === 'all') return selectedLeadUnifiedTimeline
    return selectedLeadUnifiedTimeline.filter((item) => item.sourceType === activityTimelineFilter)
  }, [activityTimelineFilter, selectedLeadUnifiedTimeline])

  const selectedLeadActivityGroups = useMemo(() => {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const groups = [
      { key: 'today', label: 'Today', rows: [] },
      { key: 'yesterday', label: 'Yesterday', rows: [] },
      { key: 'earlier', label: 'Earlier', rows: [] },
    ]

    for (const item of selectedLeadFilteredTimeline) {
      const date = new Date(item?.timestamp || item?.dueDate || 0)
      if (!Number.isFinite(date.getTime())) {
        groups[2].rows.push(item)
      } else if (isSameDay(date, now)) {
        groups[0].rows.push(item)
      } else if (isSameDay(date, yesterday)) {
        groups[1].rows.push(item)
      } else {
        groups[2].rows.push(item)
      }
    }

    return groups.filter((group) => group.rows.length)
  }, [selectedLeadFilteredTimeline])

  const selectedLeadActivityInsights = useMemo(() => {
    const rows = Array.isArray(selectedLeadActivities) ? selectedLeadActivities : []
    const counts = rows.reduce((acc, activity) => {
      const type = normalizeText(activity?.activityType).toLowerCase()
      if (type.includes('call') || type.includes('phone')) acc.calls += 1
      if (type.includes('meeting') || type.includes('appointment') || type.includes('viewing') || type.includes('consultation')) acc.meetings += 1
      if (type.includes('email') || type.includes('mail')) acc.emails += 1
      if (type.includes('whatsapp') || type.includes('message') || type.includes('sms')) acc.whatsapps += 1
      return acc
    }, { calls: 0, meetings: 0, emails: 0, whatsapps: 0 })

    const now = Date.now()
    const recentRows = rows.filter((activity) => {
      const at = new Date(activity?.activityDate || activity?.createdAt || 0).getTime()
      return Number.isFinite(at) && now - at <= 7 * 24 * 60 * 60 * 1000
    })
    const engagementScore = Math.min(100, rows.length * 12 + recentRows.length * 10 + selectedLeadAppointments.length * 8 + selectedLeadOfferSummary.total * 10)
    const healthLabel = engagementScore >= 70 ? 'Strong Engagement' : engagementScore >= 30 ? 'Warm' : 'Cold'
    const temperature = engagementScore >= 70 ? 'Hot' : engagementScore >= 30 ? 'Warm' : 'Cool'
    const responseRate = rows.length ? `${Math.min(96, 48 + recentRows.length * 10 + rows.length * 4)}%` : '0%'

    return {
      counts,
      healthLabel,
      temperature,
      responseRate,
      lastContacted: rows[0]?.activityDate || rows[0]?.createdAt || '',
    }
  }, [selectedLeadActivities, selectedLeadAppointments.length, selectedLeadOfferSummary.total])

  const selectedLeadOpenActions = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const pendingTasks = selectedLeadTasks
      .filter((task) => normalizeText(task.status).toLowerCase() !== 'completed')
      .map((task) => {
        const due = new Date(task.dueDate || task.createdAt || 0)
        const isOverdue = Number.isFinite(due.getTime()) && due < now
        return {
          id: task.taskId,
          label: normalizeText(task.title) || 'Follow-up task',
          meta: task.dueDate ? `${isOverdue ? 'Overdue' : 'Due'} ${formatDateShort(task.dueDate)} · ${normalizeText(task.priority) || 'Medium'}` : normalizeText(task.priority) || 'Pending',
          overdue: isOverdue,
          original: task,
        }
      })
      .sort((left, right) => {
        const leftTime = new Date(left.original?.dueDate || left.original?.createdAt || 0).getTime()
        const rightTime = new Date(right.original?.dueDate || right.original?.createdAt || 0).getTime()
        return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0)
      })
    const upcomingAppointment = selectedLeadAppointments
      .filter((appointment) => {
        const status = normalizeText(appointment.status).toLowerCase()
        const at = new Date(appointment.dateTime || appointment.date || appointment.createdAt || 0).getTime()
        return !['completed', 'cancelled', 'no_show', 'no-show'].includes(status) && Number.isFinite(at) && at >= Date.now()
      })
      .sort((left, right) => new Date(left.dateTime || left.date || 0).getTime() - new Date(right.dateTime || right.date || 0).getTime())[0]

    return {
      pendingTasks,
      overdueCount: pendingTasks.filter((item) => item.overdue).length,
      nextDueAction: pendingTasks[0] || null,
      upcomingAppointment,
    }
  }, [selectedLeadAppointments, selectedLeadTasks])

  const activityOutcomeOptions = useMemo(() => {
    const currentOutcome = normalizeText(activityForm.outcome)
    if (currentOutcome && !LEAD_ACTIVITY_OUTCOME_OPTIONS.includes(currentOutcome)) {
      return [...LEAD_ACTIVITY_OUTCOME_OPTIONS, currentOutcome]
    }
    return LEAD_ACTIVITY_OUTCOME_OPTIONS
  }, [activityForm.outcome])

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
      const transactionId = selectedLeadLinkedTransactionId
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
    selectedLeadLinkedTransactionId,
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

  const selectedLeadLinkedListing = useMemo(
    () => (selectedLead ? resolveLeadLinkedListing(selectedLead) : null),
    [resolveLeadLinkedListing, selectedLead],
  )

  const selectedSellerJourney = useMemo(() => buildSellerJourney({
    lead: selectedLead || {},
    contact: selectedLeadContact || {},
    appointments: selectedLeadAppointments,
    listing: selectedLeadLinkedListing,
    mandatePacketStatus,
    documents: selectedLeadLinkedListing?.documents || [],
  }), [
    mandatePacketStatus,
    selectedLead,
    selectedLeadAppointments,
    selectedLeadContact,
    selectedLeadLinkedListing,
  ])

  const selectedSellerReadiness = useMemo(() => buildSellerReadinessSummary({
    lead: selectedLead || {},
    contact: selectedLeadContact || {},
    appointments: selectedLeadAppointments,
    listing: selectedLeadLinkedListing,
    mandatePacketStatus,
    documents: selectedLeadLinkedListing?.documents || [],
    journey: selectedSellerJourney,
  }), [
    mandatePacketStatus,
    selectedLead,
    selectedLeadAppointments,
    selectedLeadContact,
    selectedLeadLinkedListing,
    selectedSellerJourney,
  ])

  const resolveAppointmentListingLabel = useCallback(
    (listingId) => {
      const id = normalizeText(listingId)
      if (!id) return ''
      return appointmentListingById.get(id)?.label || id
    },
    [appointmentListingById],
  )

  const selectedLeadViewingAppointments = useMemo(
    () =>
      selectedLeadAppointments.filter((appointment) => {
        const type = normalizeText(appointment?.appointmentType || appointment?.title).toLowerCase()
        return type.includes('viewing') || getAppointmentTypeLabel(appointment?.appointmentType).toLowerCase().includes('viewing')
      }),
    [selectedLeadAppointments],
  )

  const selectedLeadActiveViewing = useMemo(() => {
    const activeStatuses = new Set(['draft', 'requested', 'accepted', 'alternative_requested', 'alternative_proposed', 'confirmed'])
    return (
      selectedLeadViewingAppointments.find((appointment) => activeStatuses.has(normalizeText(appointment?.status).toLowerCase())) ||
      selectedLeadViewingAppointments[0] ||
      null
    )
  }, [selectedLeadViewingAppointments])

  const selectedLeadContactName = useMemo(() => {
    if (!selectedLead && !selectedLeadContact) return 'Buyer'
    const contactName = [selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ').trim()
    return contactName || selectedLead?.name || selectedLead?.buyerName || selectedLead?.sellerName || 'Buyer'
  }, [selectedLead, selectedLeadContact])

  const leadAppointmentOfferListingOptions = useMemo(() => {
    const byId = new Map()
    const addOption = (id, label, source = '') => {
      const normalizedId = normalizeText(id)
      if (!normalizedId || byId.has(normalizedId)) return
      byId.set(normalizedId, {
        id: normalizedId,
        label: normalizeText(label) || resolveAppointmentListingLabel(normalizedId) || `Listing ${normalizedId}`,
        source,
      })
    }
    for (const appointment of selectedLeadViewingAppointments) {
      addOption(appointment?.listingId, resolveAppointmentListingLabel(appointment?.listingId), 'Viewed')
    }
    addOption(selectedLead?.listingId, resolveAppointmentListingLabel(selectedLead?.listingId), 'Lead')
    const possibleListingRefs = [
      selectedLead?.interestedListings,
      selectedLead?.interestedListingIds,
      selectedLead?.recentlyViewedListings,
      selectedLead?.viewedListings,
      selectedLead?.listingIds,
    ].flatMap((value) => (Array.isArray(value) ? value : []))
    for (const item of possibleListingRefs) {
      if (typeof item === 'string') addOption(item, resolveAppointmentListingLabel(item), 'Lead interest')
      if (item && typeof item === 'object') addOption(item.id || item.listingId, item.label || item.title || item.address, 'Lead interest')
    }
    for (const option of appointmentListingOptions) {
      addOption(option?.id, option?.label, 'Active listings')
    }
    return Array.from(byId.values())
  }, [appointmentListingOptions, resolveAppointmentListingLabel, selectedLead, selectedLeadViewingAppointments])

  const selectedLeadAcceptedOffer = useMemo(() => {
    const rows = Array.isArray(selectedLeadOffers) ? selectedLeadOffers : []
    return rows.find((offer) => ['accepted', 'converted_to_transaction'].includes(normalizeText(offer?.status).toLowerCase())) || null
  }, [selectedLeadOffers])

  const selectedLeadLastActiveAt = useMemo(
    () =>
      selectedLeadUnifiedTimeline[0]?.timestamp ||
      selectedLeadActivities[0]?.activityDate ||
      selectedLeadActivities[0]?.createdAt ||
      selectedLead?.updatedAt ||
      selectedLead?.createdAt ||
      '',
    [selectedLead, selectedLeadActivities, selectedLeadUnifiedTimeline],
  )

  const selectedLeadBuyerBudgetLabel = useMemo(
    () => buildBuyerBudgetRangeLabel({ lead: selectedLead || {}, financeSummary: selectedLeadFinanceReadinessSummary }),
    [selectedLead, selectedLeadFinanceReadinessSummary],
  )

  const selectedLeadBuyerUrgency = useMemo(
    () => getBuyerUrgencyLabel({ lead: selectedLead || {}, openActions: selectedLeadOpenActions, activityInsights: selectedLeadActivityInsights }),
    [selectedLead, selectedLeadActivityInsights, selectedLeadOpenActions],
  )

  const selectedLeadBuyerScore = useMemo(() => {
    if (!selectedLead) return 0
    const activityScore = Math.min(18, selectedLeadUnifiedTimeline.length * 3)
    const viewingScore = Math.min(14, selectedLeadAppointments.length * 7)
    const offerScore = Math.min(14, selectedLeadOfferSummary.total * 7)
    const workflowScore = Math.round(selectedLeadWorkflowHealth.percent * 0.28)
    const financeScore = selectedLeadShowFinanceReadiness ? Math.round((selectedLeadFinanceReadinessSummary.readinessScore?.score || 0) * 0.16) : 10
    const urgencyBonus = selectedLeadBuyerUrgency === 'High' ? 8 : selectedLeadBuyerUrgency === 'Medium' ? 4 : 0
    return Math.max(42, Math.min(98, 38 + activityScore + viewingScore + offerScore + workflowScore + financeScore + urgencyBonus))
  }, [
    selectedLead,
    selectedLeadAppointments.length,
    selectedLeadBuyerUrgency,
    selectedLeadFinanceReadinessSummary.readinessScore?.score,
    selectedLeadOfferSummary.total,
    selectedLeadShowFinanceReadiness,
    selectedLeadUnifiedTimeline.length,
    selectedLeadWorkflowHealth.percent,
  ])

  const selectedLeadBuyerMatchScore = useMemo(() => {
    const confidence = Number(selectedLeadTransactionConfidence || 0)
    const derived = Math.round((selectedLeadBuyerScore * 0.55) + (selectedLeadWorkflowHealth.percent * 0.25) + (confidence * 0.2))
    return Math.max(62, Math.min(96, derived || selectedLeadBuyerScore))
  }, [selectedLeadBuyerScore, selectedLeadTransactionConfidence, selectedLeadWorkflowHealth.percent])

  const selectedLeadBuyerRecommendations = useMemo(() => {
    const fallbackImages = [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80',
    ]
    const options = leadAppointmentOfferListingOptions.length ? leadAppointmentOfferListingOptions : appointmentListingOptions.slice(0, 4)
    return options.slice(0, 6).map((option, index) => {
      const listing = appointmentListingById.get(normalizeText(option?.id)) || option || {}
      const match = Math.max(72, Math.min(96, selectedLeadBuyerMatchScore - index * 2 + (option?.source === 'Viewed' ? 3 : 0)))
      return {
        id: normalizeText(option?.id || listing?.id) || `recommended-${index}`,
        title: normalizeText(listing?.title || option?.label) || 'Recommended property',
        area: normalizeText(listing?.suburb || selectedLead?.areaInterest || selectedLeadPropertyLabel) || 'Area pending',
        price: Number(listing?.askingPrice || 0) > 0 ? formatCurrency(listing.askingPrice) : selectedLeadBuyerBudgetLabel,
        bedrooms: Number(listing?.bedrooms || 0) || 3,
        bathrooms: Number(listing?.bathrooms || 0) || 2,
        parking: Number(listing?.parking || 0) || 2,
        image: normalizeText(listing?.thumbnailUrl) || fallbackImages[index % fallbackImages.length],
        match,
        source: normalizeText(option?.source) || 'Recommended',
      }
    })
  }, [
    appointmentListingById,
    appointmentListingOptions,
    leadAppointmentOfferListingOptions,
    selectedLead?.areaInterest,
    selectedLeadBuyerBudgetLabel,
    selectedLeadBuyerMatchScore,
    selectedLeadPropertyLabel,
  ])

  const selectedLeadOfferPropertyOptions = useMemo(() => {
    const fallbackImages = [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80',
    ]
    const byId = new Map()
    const viewedListingIds = new Set(selectedLeadViewingAppointments.map((appointment) => normalizeText(appointment?.listingId)).filter(Boolean))
    const addProperty = (raw = {}, source = 'Matched property', index = 0) => {
      const id = normalizeText(raw?.id || raw?.listingId)
      if (!id || byId.has(id)) return
      const listing = appointmentListingById.get(id) || raw || {}
      const recommendation = selectedLeadBuyerRecommendations.find((property) => normalizeText(property?.id) === id)
      const isViewed = viewedListingIds.has(id) || normalizeText(raw?.source).toLowerCase().includes('view')
      const sourceLabel = isViewed
        ? 'Previously viewed'
        : normalizeText(raw?.source).toLowerCase().includes('lead')
          ? 'Saved property'
          : source
      const priceValue = Number(listing?.askingPrice || raw?.askingPrice || 0) || 0
      byId.set(id, {
        id,
        label: normalizeText(listing?.label || raw?.label || recommendation?.title) || `Listing ${id}`,
        title: normalizeText(listing?.title || recommendation?.title || raw?.title || raw?.label) || 'Recommended property',
        address: normalizeText(listing?.address || raw?.address || recommendation?.area || selectedLeadPropertyLabel) || 'Address pending',
        suburb: normalizeText(listing?.suburb || recommendation?.area || selectedLead?.areaInterest || selectedLeadPropertyLabel),
        price: priceValue > 0 ? formatCurrency(priceValue) : (recommendation?.price || selectedLeadBuyerBudgetLabel),
        bedrooms: Number(listing?.bedrooms || recommendation?.bedrooms || 0) || 0,
        bathrooms: Number(listing?.bathrooms || recommendation?.bathrooms || 0) || 0,
        parking: Number(listing?.parking || recommendation?.parking || 0) || 0,
        sizeLabel: normalizeText(listing?.erfSize || listing?.floorSize || listing?.propertySize || raw?.erfSize || raw?.floorSize) || 'Size pending',
        image: normalizeText(listing?.thumbnailUrl || recommendation?.image) || fallbackImages[index % fallbackImages.length],
        match: Number(recommendation?.match || raw?.match || selectedLeadBuyerMatchScore || 0) || 0,
        source: sourceLabel,
        updatedAt: listing?.updatedAt || raw?.updatedAt || '',
      })
    }

    leadAppointmentOfferListingOptions.forEach((option, index) => addProperty(option, 'Matched property', index))
    selectedLeadBuyerRecommendations.forEach((property, index) => addProperty(property, 'Matched property', index))
    appointmentListingOptions.forEach((listing, index) => addProperty(listing, 'Manual search', index))

    const query = normalizeText(offerPropertySearch).toLowerCase()
    const rows = Array.from(byId.values())
    if (!query) return rows
    return rows.filter((property) => [
      property.title,
      property.address,
      property.suburb,
      property.price,
      property.source,
    ].some((value) => normalizeText(value).toLowerCase().includes(query)))
  }, [
    appointmentListingById,
    appointmentListingOptions,
    leadAppointmentOfferListingOptions,
    offerPropertySearch,
    selectedLead?.areaInterest,
    selectedLeadBuyerBudgetLabel,
    selectedLeadBuyerMatchScore,
    selectedLeadBuyerRecommendations,
    selectedLeadPropertyLabel,
    selectedLeadViewingAppointments,
  ])

  const selectedLeadOfferCentreProperty = useMemo(() => {
    const selectedListingId = normalizeText(offerLinkForm.listingId || selectedLeadActiveViewing?.listingId || selectedLead?.listingId || selectedLeadOfferPropertyOptions[0]?.id)
    const property = selectedLeadOfferPropertyOptions.find((item) => normalizeText(item?.id) === selectedListingId) || selectedLeadOfferPropertyOptions[0] || null
    const completedViewing = selectedLeadViewingAppointments
      .filter((appointment) => {
        const status = normalizeText(appointment?.status).toLowerCase()
        const sameListing = !property?.id || normalizeText(appointment?.listingId) === normalizeText(property.id)
        return sameListing && (status === 'completed' || status === 'viewing_completed' || normalizeText(appointment?.outcomeSummary))
      })
      .sort((left, right) => new Date(right?.dateTime || right?.updatedAt || 0) - new Date(left?.dateTime || left?.updatedAt || 0))[0] || null
    const updatedAt = property?.updatedAt ? new Date(property.updatedAt) : null
    const daysOnMarket = updatedAt && !Number.isNaN(updatedAt.getTime())
      ? `${Math.max(1, Math.round((Date.now() - updatedAt.getTime()) / 86400000))} days`
      : 'Not tracked'
    return property
      ? {
          ...property,
          viewing: completedViewing,
          viewingStatusLabel: completedViewing ? 'Viewing completed' : 'No completed viewing linked',
          viewingOutcome: completedViewing?.outcomeSummary || completedViewing?.clientFeedback || completedViewing?.nextStep || 'Interested',
          viewingDate: completedViewing?.dateTime || completedViewing?.updatedAt || '',
          daysOnMarket,
        }
      : null
  }, [
    offerLinkForm.listingId,
    selectedLead,
    selectedLeadActiveViewing,
    selectedLeadOfferPropertyOptions,
    selectedLeadViewingAppointments,
  ])

  const selectedLeadOfferReasons = useMemo(() => {
    if (!selectedLeadOfferCentreProperty) return []
    const reasons = []
    const priceAmount = parseCurrencyAmount(selectedLeadOfferCentreProperty.price)
    const budgetAmount = parseCurrencyAmount(selectedLeadBuyerBudgetLabel)
    const preferredArea = normalizeText(selectedLead?.areaInterest || selectedLeadPropertyLabel).toLowerCase()
    const propertyArea = normalizeText(selectedLeadOfferCentreProperty.suburb || selectedLeadOfferCentreProperty.address).toLowerCase()
    if (priceAmount > 0 && budgetAmount > 0 && priceAmount <= budgetAmount * 1.08) reasons.push('Within budget')
    if (preferredArea && propertyArea.includes(preferredArea)) {
      reasons.push('Preferred area')
    }
    if ((Number(selectedLeadOfferCentreProperty.bedrooms || 0) || 0) >= 3) reasons.push('Matches bedroom requirement')
    if (selectedLeadOfferCentreProperty.source === 'Previously viewed') reasons.push('Similar to recently viewed homes')
    if (selectedLeadOfferCentreProperty.source === 'Saved property') reasons.push('Saved by buyer')
    if (!reasons.length && selectedLeadOfferCentreProperty.match) reasons.push(`${selectedLeadOfferCentreProperty.match}% match signal`)
    return reasons.slice(0, 4)
  }, [selectedLead, selectedLeadBuyerBudgetLabel, selectedLeadOfferCentreProperty, selectedLeadPropertyLabel])

  const selectedLeadOfferHistoryStages = useMemo(() => {
    const rows = Array.isArray(selectedLeadOffers) ? selectedLeadOffers : []
    const latestOffer = rows
      .slice()
      .sort((left, right) => new Date(right?.updatedAt || right?.submittedAt || right?.createdAt || 0) - new Date(left?.updatedAt || left?.submittedAt || left?.createdAt || 0))[0] || null
    const status = normalizeText(latestOffer?.status).toLowerCase()
    const hasOffer = Boolean(latestOffer || offerLinkForm.lastOfferLink)
    const buyerViewed = ['buyer_viewed', 'viewed', 'opened', 'submitted', 'agent_review', 'sent_to_seller', 'seller_viewed', 'accepted', 'converted_to_transaction'].some((item) => status.includes(item))
    const considering = Boolean(hasOffer && !['draft', 'sent_to_buyer'].includes(status))
    const accepted = ['accepted', 'converted_to_transaction'].includes(status) || Boolean(selectedLeadAcceptedOffer)
    const transactionCreated = Boolean(latestOffer?.transactionId || selectedLeadLinkedTransactionId)
    return [
      { key: 'sent', label: 'Offer Sent', detail: latestOffer?.createdAt || latestOffer?.submittedAt || offerLinkForm.expiryDate, done: hasOffer, icon: Send },
      { key: 'opened', label: 'Offer Opened', detail: buyerViewed ? (latestOffer?.updatedAt || latestOffer?.submittedAt) : '', done: buyerViewed, icon: Eye },
      { key: 'viewed', label: 'Buyer Viewed Offer', detail: buyerViewed ? (latestOffer?.updatedAt || latestOffer?.submittedAt) : '', done: buyerViewed, icon: Eye },
      { key: 'considering', label: 'Considering', detail: considering ? (latestOffer?.updatedAt || latestOffer?.submittedAt) : '', done: considering, icon: Clock3 },
      { key: 'accepted', label: 'Offer Accepted', detail: accepted ? (selectedLeadAcceptedOffer?.updatedAt || latestOffer?.updatedAt) : '', done: accepted, icon: CheckCircle2 },
      { key: 'transaction', label: 'Transaction Created', detail: transactionCreated ? (latestOffer?.updatedAt || selectedLeadLinkedTransaction?.updatedAt || selectedLeadLinkedTransaction?.createdAt) : '', done: transactionCreated, icon: Home },
    ]
  }, [
    offerLinkForm.expiryDate,
    offerLinkForm.lastOfferLink,
    selectedLeadAcceptedOffer,
    selectedLeadLinkedTransaction,
    selectedLeadLinkedTransactionId,
    selectedLeadOffers,
  ])

  const selectedLeadOfferPortalSessionByAppointmentId = useMemo(() => {
    const entries = new Map()
    for (const session of Array.isArray(selectedLeadOfferPortalSessions) ? selectedLeadOfferPortalSessions : []) {
      const appointmentId = normalizeText(session?.appointmentId)
      if (!appointmentId || entries.has(appointmentId)) continue
      entries.set(appointmentId, session)
    }
    return entries
  }, [selectedLeadOfferPortalSessions])

  const selectedLeadOfferPortalSessionByListingId = useMemo(() => {
    const entries = new Map()
    for (const session of Array.isArray(selectedLeadOfferPortalSessions) ? selectedLeadOfferPortalSessions : []) {
      const listingId = normalizeText(
        session?.metadata?.selectedListingId ||
          session?.metadata?.listingId,
      )
      if (!listingId || entries.has(listingId)) continue
      entries.set(listingId, session)
    }
    return entries
  }, [selectedLeadOfferPortalSessions])

  const selectedLeadActiveOfferPortalStatus = useMemo(() => {
    const listingId = normalizeText(selectedLeadOfferCentreProperty?.id || offerLinkForm.listingId)
    const appointmentId = normalizeText(offerLinkForm.appointmentId || selectedLeadActiveViewing?.appointmentId)
    const session = (
      (listingId && selectedLeadOfferPortalSessionByListingId.get(listingId)) ||
      (appointmentId && selectedLeadOfferPortalSessionByAppointmentId.get(appointmentId)) ||
      null
    )
    if (!session) return null
    const statusKey = normalizeText(session.status).toLowerCase()
    const submittedAt = normalizeText(session.submittedAt)
    const viewedAt = normalizeText(session.viewedAt)
    const isSubmitted = Boolean(submittedAt || statusKey === 'submitted')
    const isOpened = Boolean(viewedAt || isSubmitted || statusKey === 'viewed')
    return {
      session,
      label: isSubmitted ? 'Buyer submitted offer' : isOpened ? 'Buyer opened offer link' : 'Offer link sent',
      tone: isSubmitted
        ? 'border-[#cfe8dc] bg-[#eefbf4] text-[#17643a]'
        : isOpened
          ? 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
          : 'border-[#f1dfb8] bg-[#fff8e8] text-[#8a641d]',
      detail: isSubmitted
        ? formatDateTime(submittedAt || session.updatedAt)
        : isOpened
          ? formatDateTime(viewedAt || session.updatedAt)
          : formatDateTime(session.sentAt || session.createdAt),
      openedAt: viewedAt,
      submittedAt,
    }
  }, [
    offerLinkForm.appointmentId,
    offerLinkForm.listingId,
    selectedLeadActiveViewing?.appointmentId,
    selectedLeadOfferCentreProperty?.id,
    selectedLeadOfferPortalSessionByAppointmentId,
    selectedLeadOfferPortalSessionByListingId,
  ])

  const leadViewingCompletionBlockers = useMemo(
    () => (leadCompletionAppointmentId ? getLeadViewingCompletionBlockers(leadViewingCompletionForm) : []),
    [leadCompletionAppointmentId, leadViewingCompletionForm, offerLinkForm, selectedLead, selectedLeadContact],
  )

  const selectedLeadBuyerJourneyStages = useMemo(() => {
    const stageKey = normalizeText(selectedLeadEffectiveLifecycleStage || selectedLead?.stage).toLowerCase()
    const contacted = selectedLeadActivities.length > 0 || !['', 'new lead', 'lead', 'cold'].includes(stageKey)
    const qualified = Boolean(
      normalizeText(selectedLead?.budget || selectedLead?.estimatedValue || selectedLead?.areaInterest || selectedLead?.propertyInterest) ||
        stageKey.includes('qualified') ||
        stageKey.includes('viewing') ||
        stageKey.includes('offer') ||
        selectedLeadAppointments.length ||
        selectedLeadOfferSummary.total,
    )
    const viewingStarted = selectedLeadAppointments.length > 0 || stageKey.includes('viewing')
    const viewingCompleted = selectedLeadAppointments.some((appointment) => normalizeText(appointment?.status).toLowerCase() === 'completed') || stageKey.includes('viewing completed')
    const offerStarted = selectedLeadOfferSummary.total > 0 || stageKey.includes('offer')
    const offerComplete = Boolean(selectedLeadAcceptedOffer)
    const transactionDone = Boolean(selectedLeadLinkedTransactionId)
    const rawStages = [
      { key: 'captured', label: 'Captured', detail: formatDateShort(selectedLead?.createdAt), done: Boolean(selectedLead) },
      { key: 'contacted', label: 'Contacted', detail: contacted ? formatDateShort(selectedLeadLastActiveAt || selectedLead?.updatedAt) : 'Not reached', done: contacted },
      { key: 'qualification', label: 'Qualification', detail: qualified ? 'In progress' : 'Pending', done: qualified },
      { key: 'viewing', label: 'Viewing', detail: viewingCompleted ? 'Completed' : viewingStarted ? 'Upcoming' : 'Not booked', done: viewingCompleted, started: viewingStarted },
      { key: 'offer', label: 'Offer', detail: offerComplete ? 'Accepted' : offerStarted ? 'Pending' : 'Not started', done: offerComplete, started: offerStarted },
      { key: 'transaction', label: 'Transaction', detail: transactionDone ? 'Created' : 'Not started', done: transactionDone },
    ]
    const currentIndex = Math.max(0, rawStages.findIndex((stage) => !stage.done))
    return rawStages.map((stage, index) => ({
      ...stage,
      state: stage.done ? 'completed' : index === currentIndex || stage.started ? 'current' : 'future',
    }))
  }, [
    selectedLead,
    selectedLeadAcceptedOffer,
    selectedLeadActivities.length,
    selectedLeadAppointments,
    selectedLeadEffectiveLifecycleStage,
    selectedLeadLastActiveAt,
    selectedLeadLinkedTransactionId,
    selectedLeadOfferSummary.total,
  ])

  useEffect(() => {
    const currentStage = selectedLeadBuyerJourneyStages.find((stage) => stage.state === 'current') || selectedLeadBuyerJourneyStages[selectedLeadBuyerJourneyStages.length - 1]
    if (currentStage?.key) setBuyerJourneyActionStage(currentStage.key)
  }, [selectedLead?.leadId, selectedLeadBuyerJourneyStages])

  useEffect(() => {
    if (leadWorkspaceTab !== 'appointments' || !selectedLead) return
    const leadId = normalizeText(selectedLead.leadId)
    const contactId = normalizeText(selectedLead.contactId || selectedLeadContact?.contactId)
    const listingId = normalizeText(selectedLeadActiveViewing?.listingId || selectedLead.listingId || leadAppointmentOfferListingOptions[0]?.id)
    setAppointmentForm((previous) => {
      if (normalizeText(previous.relatedEntityId) === leadId && normalizeText(previous.appointmentType) === 'viewing') return previous
      return buildDefaultAppointmentFormForType('viewing', {
        ...previous,
        appointmentType: 'viewing',
        title: normalizeText(previous.title) || 'Viewing',
        date: normalizeText(previous.date) || getTomorrowIsoDate(),
        startTime: normalizeText(previous.startTime) || getCurrentTimeValue(),
        contactId,
        listingId,
        relatedEntityType: 'lead',
        relatedEntityId: leadId,
        recipientEmail: normalizeText(selectedLeadContact?.email || selectedLead?.email) || '',
        location: normalizeText(previous.location) || resolveAppointmentListingLabel(listingId),
        status: normalizeText(previous.status) || 'requested',
      })
    })
  }, [leadAppointmentOfferListingOptions, leadWorkspaceTab, resolveAppointmentListingLabel, selectedLead, selectedLeadActiveViewing, selectedLeadContact])

  useEffect(() => {
    if (!selectedLead) return
    setOfferLinkForm((previous) => ({
      ...previous,
      appointmentId: normalizeText(previous.appointmentId) || normalizeText(selectedLeadActiveViewing?.appointmentId),
      listingId: normalizeText(previous.listingId) || normalizeText(selectedLeadActiveViewing?.listingId || selectedLead?.listingId || leadAppointmentOfferListingOptions[0]?.id),
      buyerName: normalizeText(previous.buyerName) || selectedLeadContactName,
      buyerEmail: normalizeText(previous.buyerEmail) || normalizeText(selectedLeadContact?.email || selectedLead?.email),
      buyerPhone: normalizeText(previous.buyerPhone) || normalizeText(selectedLeadContact?.phone || selectedLead?.phone),
    }))
  }, [leadAppointmentOfferListingOptions, selectedLead, selectedLeadActiveViewing, selectedLeadContact, selectedLeadContactName])

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

  const appointmentLinkOptions = useMemo(() => {
    const options = new Map()
    const addOption = (option) => {
      const value = normalizeText(option?.value)
      if (!value || options.has(value)) return
      options.set(value, option)
    }

    for (const [index, listing] of appointmentListingOptions.entries()) {
      const id = normalizeText(listing?.id)
      if (!id) continue
      const reference = formatEntityDisplayReference('LST', listing, index)
      const address = safeDisplayText(listing?.address || listing?.title, 'Listing')
      const suburb = safeDisplayText(listing?.suburb, '')
      const price = Number(listing?.askingPrice || 0) > 0 ? formatCurrency(listing.askingPrice) : ''
      addOption({
        value: `listing:${id}`,
        entityType: 'listing',
        entityId: id,
        primaryLabel: `Listing · ${reference} · ${address}`,
        secondaryLabel: [suburb, price, organisationName].filter(Boolean).join(' · '),
        searchText: [reference, listing?.label, listing?.title, listing?.address, listing?.suburb, price, organisationName].filter(Boolean).join(' '),
        listing,
      })
    }

    for (const [index, lead] of (Array.isArray(records.leads) ? records.leads : []).entries()) {
      const id = normalizeText(lead?.leadId || lead?.id)
      if (!id) continue
      const contact = contactById.get(normalizeText(lead?.contactId)) || null
      const reference = formatEntityDisplayReference('LED', lead, index)
      const leadName = resolveLeadDisplayName(lead, contact, canvassingProspectById.get(normalizeText(lead?.canvassingProspectId)), 'Lead')
      const leadType = `${leadCategoryLabelForView(lead)} Lead`
      const property = safeDisplayText(lead?.propertyInterest || lead?.sellerPropertyAddress || lead?.areaInterest, '')
      addOption({
        value: `lead:${id}`,
        entityType: 'lead',
        entityId: id,
        primaryLabel: `Lead · ${reference} · ${leadName}`,
        secondaryLabel: [leadType, property].filter(Boolean).join(' · '),
        searchText: [reference, leadName, leadType, property, lead?.email, lead?.phone].filter(Boolean).join(' '),
        lead,
        contact,
      })
    }

    for (const [index, deal] of (Array.isArray(records.deals) ? records.deals : []).entries()) {
      const id = normalizeText(deal?.transactionId || deal?.dealId || deal?.id)
      if (!id) continue
      const reference = formatEntityDisplayReference('TXN', deal, index)
      const linkedLead = records.leads.find((lead) => normalizeLeadIdentityKey(lead?.leadId) === normalizeLeadIdentityKey(deal?.leadId)) || null
      const contact = linkedLead ? contactById.get(normalizeText(linkedLead?.contactId)) : null
      const buyerName = safeDisplayText(
        deal?.buyerName ||
        deal?.buyer_name ||
        resolveLeadDisplayName(linkedLead || {}, contact, null, ''),
        'Buyer pending',
      )
      const property = safeDisplayText(deal?.propertyAddress || deal?.property_address || deal?.propertyTitle || linkedLead?.propertyInterest || linkedLead?.sellerPropertyAddress, 'Transaction')
      addOption({
        value: `transaction:${id}`,
        entityType: 'transaction',
        entityId: id,
        primaryLabel: `Transaction · ${reference} · ${property}`,
        secondaryLabel: [`Buyer: ${buyerName}`, safeDisplayText(deal?.stage || deal?.status, '')].filter(Boolean).join(' · '),
        searchText: [reference, property, buyerName, deal?.stage, deal?.status].filter(Boolean).join(' '),
        transaction: deal,
        lead: linkedLead,
        contact,
      })
    }

    for (const [index, contact] of (Array.isArray(records.contacts) ? records.contacts : []).entries()) {
      const id = normalizeText(contact?.contactId || contact?.id)
      if (!id) continue
      const reference = formatEntityDisplayReference('CLT', contact, index)
      const name = safeDisplayText(formatContactName(contact), safeDisplayText(contact?.email, 'Client'))
      addOption({
        value: `client:${id}`,
        entityType: 'client',
        entityId: id,
        primaryLabel: `Client · ${reference} · ${name}`,
        secondaryLabel: [safeDisplayText(contact?.contactType, 'Contact'), safeDisplayText(contact?.email, '')].filter(Boolean).join(' · '),
        searchText: [reference, name, contact?.email, contact?.phone, contact?.contactType].filter(Boolean).join(' '),
        contact,
      })
    }

    return Array.from(options.values()).sort((left, right) => left.primaryLabel.localeCompare(right.primaryLabel))
  }, [appointmentListingOptions, canvassingProspectById, contactById, organisationName, records.contacts, records.deals, records.leads])

  const appointmentLinkOptionByValue = useMemo(() => {
    const map = new Map()
    for (const option of appointmentLinkOptions) {
      map.set(option.value, option)
    }
    return map
  }, [appointmentLinkOptions])

  const selectedAppointmentLinkValue = useMemo(() => {
    const explicitType = normalizeText(appointmentForm.relatedEntityType)
    const explicitId = normalizeText(appointmentForm.relatedEntityId)
    if (explicitType && explicitType !== 'none' && explicitId) return `${explicitType}:${explicitId}`
    if (normalizeText(appointmentForm.listingId)) return `listing:${normalizeText(appointmentForm.listingId)}`
    if (normalizeText(appointmentForm.transactionId)) return `transaction:${normalizeText(appointmentForm.transactionId)}`
    if (normalizeText(appointmentForm.contactId)) return `client:${normalizeText(appointmentForm.contactId)}`
    return ''
  }, [appointmentForm.contactId, appointmentForm.listingId, appointmentForm.relatedEntityId, appointmentForm.relatedEntityType, appointmentForm.transactionId])

  const selectedAppointmentLinkOption = appointmentLinkOptionByValue.get(selectedAppointmentLinkValue) || null

  const appointmentSuggestedParticipants = useMemo(() => {
    const byKey = new Map()
    const addParticipant = (participant) => {
      const normalized = buildAppointmentParticipant(participant)
      if (!normalized) return
      const key = buildParticipantIdentityKey(normalized)
      if (!key || byKey.has(key)) return
      byKey.set(key, { ...normalized, suggestionKey: key })
    }

    const linkedLead =
      selectedAppointmentLinkOption?.lead ||
      (normalizeText(appointmentForm.relatedEntityType) === 'lead'
        ? records.leads.find((lead) => normalizeLeadIdentityKey(lead?.leadId) === normalizeLeadIdentityKey(appointmentForm.relatedEntityId))
        : null) ||
      selectedLead ||
      null
    const linkedContact =
      selectedAppointmentLinkOption?.contact ||
      (linkedLead ? contactById.get(normalizeText(linkedLead?.contactId)) : null) ||
      (appointmentForm.contactId ? contactById.get(normalizeText(appointmentForm.contactId)) : null)
    const clientRole = linkedLead ? leadCategoryLabelForView(linkedLead) : 'Client'
    if (linkedLead || linkedContact) {
      addParticipant({
        name: resolveLeadDisplayName(linkedLead || {}, linkedContact, null, clientRole),
        email: linkedContact?.email || linkedLead?.email,
        phone: linkedContact?.phone || linkedLead?.phone,
        role: clientRole,
        source: selectedAppointmentLinkOption?.entityType || 'lead',
      })
    }

    const assignedAgentKey = normalizeText(
      linkedLead?.assignedAgentId ||
      linkedLead?.assignedAgentEmail ||
      selectedAppointmentLinkOption?.listing?.assignedAgentId ||
      selectedAppointmentLinkOption?.listing?.assignedAgentEmail ||
      currentAgent.id,
    )
    const assignedAgent = resolveAgentById(assignedAgentKey)
    addParticipant({
      name: assignedAgent?.name || assignedAgent?.fullName || currentAgent.fullName,
      email: assignedAgent?.email || currentAgent.email,
      role: 'Agent',
      source: 'team',
    })

    return Array.from(byKey.values())
  }, [
    appointmentForm.contactId,
    appointmentForm.relatedEntityId,
    appointmentForm.relatedEntityType,
    contactById,
    currentAgent.email,
    currentAgent.fullName,
    currentAgent.id,
    records.leads,
    resolveAgentById,
    selectedAppointmentLinkOption,
    selectedLead,
  ])

  const selectedSuggestedAppointmentParticipants = useMemo(
    () => appointmentSuggestedParticipants.filter((participant) => !appointmentDeselectedParticipantKeys.includes(participant.suggestionKey)),
    [appointmentDeselectedParticipantKeys, appointmentSuggestedParticipants],
  )

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

  const leadOperationalSummary = useMemo(() => {
    const visibleLeadKeys = new Set(filteredLeads.map((lead) => normalizeLeadIdentityKey(lead?.leadId)).filter(Boolean))
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const endOfToday = startOfToday + 86400000
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const attentionLeadIds = new Set()
    let overdue = 0

    for (const task of Array.isArray(records.tasks) ? records.tasks : []) {
      const leadKey = normalizeLeadIdentityKey(task?.leadId)
      if (!visibleLeadKeys.has(leadKey) || normalizeText(task?.status) === 'Completed') continue
      const dueTime = new Date(task?.dueDate || 0).getTime()
      if (!Number.isFinite(dueTime)) continue
      if (dueTime < startOfToday) {
        overdue += 1
        attentionLeadIds.add(leadKey)
      } else if (dueTime < endOfToday) {
        attentionLeadIds.add(leadKey)
      }
    }

    const newToday = filteredLeads.filter((lead) => {
      const created = new Date(lead?.createdAt || 0).getTime()
      return Number.isFinite(created) && created >= startOfToday && created < endOfToday
    }).length
    const convertedMtd = (Array.isArray(records.deals) ? records.deals : []).filter((deal) => {
      const leadKey = normalizeLeadIdentityKey(deal?.leadId)
      const created = new Date(deal?.createdAt || deal?.updatedAt || 0).getTime()
      return visibleLeadKeys.has(leadKey) && Number.isFinite(created) && created >= monthStart
    }).length

    return {
      total: filteredLeads.length,
      needAttention: attentionLeadIds.size,
      overdue,
      newToday,
      convertedMtd,
    }
  }, [filteredLeads, records.deals, records.tasks])

  const leadPageSummary = useMemo(() => {
    const allCategoryLeads = records.leads.filter((lead) => leadTypeView === 'all' ? true : resolveLeadCategoryView(lead) === leadTypeView)
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

  const leadCategoryCounts = useMemo(() => {
    return records.leads.reduce((counts, lead) => {
      const category = resolveLeadCategoryView(lead)
      counts[category] = (counts[category] || 0) + 1
      counts.all += 1
      return counts
    }, { all: 0, buyer: 0, seller: 0, other: 0 })
  }, [records.leads])

  const leadTypeViewTitle = leadTypeView === 'all' ? 'All Leads' : `${leadCategoryLabel(leadTypeView)} Leads`

  const sellerJourneyMetrics = useMemo(() => getSellerJourneyMetrics({
    leads: records.leads,
    appointments: records.appointments,
    listings: appointmentListingOptions,
  }), [appointmentListingOptions, records.appointments, records.leads])

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
    const formCategory = ['buyer', 'seller'].includes(resolveLeadCategoryView(category)) ? resolveLeadCategoryView(category) : 'buyer'
    setLeadForm({
      ...NEW_LEAD_DEFAULTS,
      leadSource: MANUAL_LEAD_SOURCE_OPTIONS[0] || 'Other',
      leadCategory: formCategory,
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
          branchId: normalizeText(assignedAgent?.branchId),
          assignedUserId: normalizeText(assignedAgent?.userId || assignedAgent?.id),
          createdBy: normalizeText(currentAgent.userId || currentAgent.id),
          leadCategory: normalizeLeadCategory(leadForm.leadCategory, 'other'),
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
      setLeadTypeView(resolveLeadCategoryView(createdLead || leadForm.leadCategory))
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
    const isBuyerLead = resolveLeadCategoryView(targetLead) === 'buyer'
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

  function handleActivityComposerModeChange(nextMode) {
    const mode = normalizeText(nextMode) || 'activity'
    setActivityComposerMode(mode)
    setEditingActivityId('')
    setEditingTaskId('')
    setError('')
    if (mode === 'note') {
      setActivityForm((previous) => ({ ...previous, activityType: 'Note', outcome: '' }))
    } else if (mode === 'follow_up') {
      setTaskForm((previous) => ({
        ...previous,
        title: normalizeText(previous.title) || 'Follow up with lead',
        dueDate: normalizeText(previous.dueDate) || getTodayIsoDate(),
      }))
    }
  }

  function resetActivityComposer() {
    setActivityForm(LEAD_DETAIL_DEFAULT_ACTIVITY)
    setEditingActivityId('')
  }

  function handleAppendActivitySuggestion(text) {
    const suggestion = normalizeText(text)
    if (!suggestion) return
    setActivityForm((previous) => {
      const currentNote = normalizeText(previous.activityNote)
      return {
        ...previous,
        activityNote: currentNote ? `${currentNote}${currentNote.endsWith('.') ? '' : '.'} ${suggestion}` : suggestion,
      }
    })
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

      const contactHasDetails = [
        contactPatch.firstName,
        contactPatch.lastName,
        contactPatch.phone,
        contactPatch.email,
      ].some((value) => normalizeText(value))
      let resolvedLeadId = normalizeText(selectedLead.leadId)
      let resolvedContactId = normalizeText(selectedLeadContact?.contactId || selectedLead?.contactId)
      let resolvedContactSnapshot = selectedLeadContact || null

      if (contactHasDetails) {
        const persisted = await ensureAgencyCrmLeadRecordPersisted(
          organisationId,
          {
            ...selectedLead,
            ...leadPatch,
            contactId: resolvedContactId,
          },
          {
            ...(selectedLeadContact || {}),
            ...contactPatch,
            contactId: resolvedContactId,
            contactType: resolveLeadCategoryView(selectedLead) === 'seller' ? 'Seller' : 'Buyer',
          },
          { actor: currentAgent },
        )
        resolvedLeadId = normalizeText(persisted?.leadId || resolvedLeadId)
        resolvedContactId = normalizeText(persisted?.contactId || resolvedContactId)
        resolvedContactSnapshot = {
          ...(selectedLeadContact || {}),
          ...contactPatch,
          contactId: resolvedContactId,
          organisationId,
          updatedAt: new Date().toISOString(),
        }
      }

      if (resolvedContactId && contactHasDetails) {
        await updateAgencyCrmContactRecord(organisationId, resolvedContactId, contactPatch)
      }
      await updateAgencyCrmLeadRecord(organisationId, resolvedLeadId, {
        ...leadPatch,
        contactId: resolvedContactId || selectedLead.contactId,
      })

      setRecords((previous) => ({
        ...previous,
        contacts: (() => {
          const rows = Array.isArray(previous.contacts) ? previous.contacts : []
          const targetContactId = normalizeText(resolvedContactId || selectedLeadContact?.contactId)
          if (!targetContactId) return rows
          let matched = false
          const nextRows = rows.map((contact) => {
            const matchesResolved = normalizeText(contact?.contactId) === targetContactId
            const matchesPrevious = normalizeText(contact?.contactId) === normalizeText(selectedLeadContact?.contactId)
            if (!matchesResolved && !matchesPrevious) return contact
            matched = true
            return {
              ...contact,
              ...contactPatch,
              contactId: targetContactId,
              updatedAt: new Date().toISOString(),
            }
          })
          if (matched) return nextRows
          return [
            ...nextRows,
            {
              ...(resolvedContactSnapshot || {}),
              ...contactPatch,
              contactId: targetContactId,
              organisationId,
              updatedAt: new Date().toISOString(),
            },
          ]
        })(),
        leads: (Array.isArray(previous.leads) ? previous.leads : []).map((lead) =>
          normalizeLeadIdentityKey(lead?.leadId) === normalizeLeadIdentityKey(selectedLead.leadId) ||
          normalizeLeadIdentityKey(lead?.leadId) === normalizeLeadIdentityKey(resolvedLeadId)
            ? {
                ...lead,
                ...leadPatch,
                leadId: resolvedLeadId || lead.leadId,
                contactId: resolvedContactId || lead.contactId,
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
    const leadType = resolveLeadCategoryView(lead)
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

  async function handleAddActivity(event, overrides = {}) {
    event.preventDefault()
    if (!selectedLead || !organisationId) return
    const nextActivityType = normalizeText(overrides.activityType ?? activityForm.activityType) || LEAD_DETAIL_DEFAULT_ACTIVITY.activityType
    const nextActivityNote = normalizeText(overrides.activityNote ?? activityForm.activityNote)
    const nextOutcome = normalizeText(overrides.outcome ?? activityForm.outcome)
    if (!nextActivityNote) {
      setError('Add an activity note before saving.')
      return
    }
    if (editingActivityId) {
      await updateAgencyCrmLeadActivity(organisationId, editingActivityId, {
        activityType: nextActivityType,
        activityNote: nextActivityNote,
        outcome: nextOutcome,
      })
    } else {
      await createAgencyCrmLeadActivity(organisationId, selectedLead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: nextActivityType,
        activityNote: nextActivityNote,
        outcome: nextOutcome,
        activityDate: new Date().toISOString(),
      }, { actor: currentAgent })
    }
    resetActivityComposer()
    setError('')
    setMessage(editingActivityId ? 'Activity updated.' : 'Activity logged.')
    void reloadRecords(organisationId)
  }

  async function handleUnifiedActivitySubmit(event) {
    event.preventDefault()
    if (activityComposerMode === 'task' || activityComposerMode === 'follow_up') {
      await handleCreateTask(event)
      return
    }
    if (activityComposerMode === 'note') {
      await handleAddActivity(event, {
        activityType: 'Note',
        activityNote: activityForm.activityNote,
        outcome: '',
      })
      return
    }
    await handleAddActivity(event)
  }

  function handleEditActivity(activity) {
    setEditingActivityId(normalizeText(activity?.activityId))
    setEditingTaskId('')
    setActivityComposerMode(normalizeText(activity?.activityType).toLowerCase() === 'note' ? 'note' : 'activity')
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
    const assignedAgent = resolveAgentById(taskForm.assignedAgentId || selectedLead.assignedAgentId || selectedLead.assignedAgentEmail || currentAgent.id)
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
    setEditingActivityId('')
    setActivityComposerMode(normalizeText(task?.title || task?.description).toLowerCase().includes('follow') ? 'follow_up' : 'task')
    setTaskForm({
      title: normalizeText(task?.title),
      description: normalizeText(task?.description),
      dueDate: normalizeText(task?.dueDate).slice(0, 10),
      priority: normalizeText(task?.priority) || LEAD_DETAIL_DEFAULT_TASK.priority,
      assignedAgentId: normalizeText(task?.assignedAgentId || task?.assignedAgentEmail),
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

  function handleAppointmentStartTimeChange(nextStartTime) {
    setAppointmentForm((previous) => {
      const template = getAppointmentTypeTemplate(previous.appointmentType || 'other')
      const startMinutes = parseTimeToMinutes(nextStartTime)
      const duration = Number(template.defaultDurationMinutes || 45)
      return {
        ...previous,
        startTime: nextStartTime,
        endTime: Number.isFinite(startMinutes) ? formatMinutesToTime(startMinutes + duration) : previous.endTime,
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

  function handleAppointmentLinkChange(nextValue) {
    const option = appointmentLinkOptionByValue.get(normalizeText(nextValue))
    if (!option) {
      setAppointmentForm((previous) => ({
        ...previous,
        listingId: '',
        transactionId: '',
        contactId: '',
        relatedEntityType: 'none',
        relatedEntityId: '',
      }))
      setAppointmentDeselectedParticipantKeys([])
      return
    }

    const listingId = normalizeText(option.entityType === 'listing' ? option.entityId : option.lead?.listingId || option.lead?.listing_id)
    const selectedListing = listingId ? appointmentListingById.get(listingId) : null
    const nextLocation = normalizeText(
      selectedListing?.address ||
      option.listing?.address ||
      option.transaction?.propertyAddress ||
      option.transaction?.property_address ||
      option.lead?.propertyInterest ||
      option.lead?.sellerPropertyAddress ||
      option.primaryLabel,
    )
    const titleBase = option.entityType === 'listing' && nextLocation ? `Property Viewing - ${nextLocation}` : ''
    setAppointmentForm((previous) => {
      const previousTitle = normalizeText(previous.title)
      const templateLabel = normalizeText(getAppointmentTypeLabel(previous.appointmentType))
      const shouldRefreshTitle = !previousTitle || previousTitle === templateLabel || previousTitle === 'Property Viewing'
      return {
        ...previous,
        listingId,
        transactionId: option.entityType === 'transaction' ? option.entityId : normalizeText(option.transaction?.transactionId || option.transaction?.dealId || previous.transactionId),
        contactId: normalizeText(option.contact?.contactId || option.lead?.contactId || previous.contactId),
        relatedEntityType: option.entityType,
        relatedEntityId: option.entityId,
        recipientEmail: normalizeText(option.contact?.email || option.lead?.email || previous.recipientEmail),
        location: normalizeText(previous.location) || nextLocation,
        title: shouldRefreshTitle ? (titleBase || previousTitle || templateLabel || 'Appointment') : previous.title,
      }
    })
    setAppointmentDeselectedParticipantKeys([])
  }

  function handleToggleSuggestedAppointmentParticipant(participant) {
    const key = normalizeText(participant?.suggestionKey)
    if (!key) return
    setAppointmentDeselectedParticipantKeys((previous) =>
      previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
    )
    setAppointmentForm((previous) => ({
      ...previous,
      participants: (previous.participants || []).filter((row) => buildParticipantIdentityKey(row) !== key),
    }))
  }

  function buildAppointmentParticipantsForSave(baseParticipants = []) {
    const byKey = new Map()
    for (const participant of selectedSuggestedAppointmentParticipants) {
      const key = buildParticipantIdentityKey(participant)
      if (key) byKey.set(key, participant)
    }
    for (const participant of Array.isArray(baseParticipants) ? baseParticipants : []) {
      const key = buildParticipantIdentityKey(participant)
      if (key) byKey.set(key, participant)
    }
    return Array.from(byKey.values())
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
    if (created?.notificationsQueued) {
      return 'Appointment added. Email request queued.'
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
    const linkedLeadParticipantRole = resolveLeadCategoryView(linkedLead) === 'seller' ? 'Seller' : 'Buyer'
    const participantSeed = buildAppointmentParticipantsForSave(appointmentForm.participants || [])
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
      if (linkedLead && resolveLeadCategoryView(linkedLead) !== 'seller') {
        const linkedContact =
          records.contacts.find((contact) => normalizeText(contact?.contactId) === normalizeText(linkedLead.contactId)) ||
          buildLeadContactFallback(linkedLead)
        const persistedLinkedLead = await ensureBuyerLeadPersistedForLifecycle(linkedLead, linkedContact)
        appointmentPayload.leadId = normalizeText(persistedLinkedLead?.leadId || appointmentPayload.leadId) || null
        appointmentPayload.contactId = normalizeText(persistedLinkedLead?.contactId || appointmentPayload.contactId) || null
        appointmentPayload.relatedEntityId = normalizeText(persistedLinkedLead?.leadId || appointmentPayload.relatedEntityId) || null
      }
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
      void (async () => {
        try {
          if (linkedLead && resolveLeadCategoryView(linkedLead) === 'seller') {
            await updateAgencyCrmLeadRecord(organisationId, linkedLead.leadId, {
              stage: 'Appointment Scheduled',
              status: 'Appointment Requested',
            })
          }
          await reloadRecords(organisationId)
        } catch (postSaveError) {
          console.warn('[appointments] post-save refresh failed', postSaveError)
        }
      })()
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
    setAppointmentManualParticipantOpen(false)
    setAppointmentDeselectedParticipantKeys([])
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
      setAppointmentForm(buildDefaultAppointmentFormForType('viewing', {
        ...LEAD_DETAIL_DEFAULT_APPOINTMENT,
        appointmentType: 'viewing',
        title: normalizeText(selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress)
          ? `Property Viewing - ${normalizeText(selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress)}`
          : 'Property Viewing',
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
    setAppointmentManualParticipantOpen(false)
    setAppointmentDeselectedParticipantKeys([])
    const sellerListingId = normalizeText(
      selectedLead?.listingId ||
      selectedLead?.listing_id ||
      selectedLead?.privateListingId ||
      selectedLead?.private_listing_id,
    )
    const sellerLeadId = normalizeText(selectedLead?.leadId || selectedLead?.lead_id)
    setAppointmentForm((previous) => buildDefaultAppointmentFormForType('seller_consultation', {
      ...previous,
      appointmentType: 'seller_consultation',
      date: previous.date || getTomorrowIsoDate(),
      startTime: previous.startTime || getCurrentTimeValue(),
      contactId: normalizeText(selectedLead?.contactId) || '',
      leadId: sellerLeadId || previous.leadId || '',
      listingId: sellerListingId || previous.listingId || '',
      relatedEntityType: 'lead',
      relatedEntityId: sellerLeadId || previous.relatedEntityId || '',
      visibility: 'client_visible',
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

    const resolvedSellerDisplayName = selectedLeadDisplayName && selectedLeadDisplayName !== 'Lead Workspace'
      ? selectedLeadDisplayName
      : resolveLeadDisplayName(
          selectedLead,
          selectedLeadContact,
          canvassingProspectById.get(normalizeText(selectedLead?.canvassingProspectId)),
          'Seller',
        )
    const sellerNameParts = resolvedSellerDisplayName.split(/\s+/).filter(Boolean)
    const sellerFirstName = normalizeText(selectedLeadContact?.firstName) || sellerNameParts[0] || ''
    const sellerSurname = normalizeText(selectedLeadContact?.lastName) || sellerNameParts.slice(1).join(' ')
    const sellerName = !isGenericLeadPersonName(resolvedSellerDisplayName)
      ? resolvedSellerDisplayName
      : [sellerFirstName, sellerSurname].filter(Boolean).join(' ').trim() || 'Seller'
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
          sellerName: sellerFirstName,
          sellerSurname,
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

      const selectedContactId = normalizeText(selectedLeadContact?.contactId || selectedLead?.contactId)
      if (selectedContactId && (sellerFirstName || sellerSurname || sellerEmail || normalizeText(selectedLeadContact?.phone))) {
        const contactRepairPatch = {
          contactType: 'Seller',
        }
        if (sellerFirstName) contactRepairPatch.firstName = sellerFirstName
        if (sellerSurname) contactRepairPatch.lastName = sellerSurname
        if (normalizeText(selectedLeadContact?.phone)) contactRepairPatch.phone = normalizeText(selectedLeadContact.phone)
        if (sellerEmail) contactRepairPatch.email = sellerEmail
        await updateAgencyCrmContactRecord(organisationId, selectedContactId, contactRepairPatch).catch((contactUpdateError) => {
          console.warn('[Seller Onboarding] contact name repair skipped', {
            leadId: selectedLead?.leadId || null,
            contactId: selectedContactId,
            error: contactUpdateError,
          })
        })
      }

      await updateAgencyCrmLeadRecord(organisationId, selectedLead.leadId, {
        stage: 'Seller Onboarding Sent',
        status: 'Sent',
        sellerOnboardingToken: token,
        sellerOnboardingLink: onboardingLink,
        sellerOnboardingStatus: 'sent',
        sellerWorkflowLeadId: normalizeText(sellerWorkflowLead?.sellerLeadId || sellerWorkflowLead?.id || selectedLead.leadId),
        listingId: canonicalListingId || normalizeText(selectedLead?.listingId),
      })
      setRecords((previous) => ({
        ...previous,
        contacts: selectedContactId
          ? (Array.isArray(previous.contacts) ? previous.contacts : []).map((contact) =>
              normalizeText(contact?.contactId) === selectedContactId
                ? {
                    ...contact,
                    firstName: sellerFirstName || contact.firstName,
                    lastName: sellerSurname || contact.lastName,
                    phone: normalizeText(selectedLeadContact?.phone) || contact.phone,
                    email: sellerEmail || contact.email,
                    contactType: 'Seller',
                    updatedAt: new Date().toISOString(),
                  }
                : contact,
            )
          : previous.contacts,
        leads: (Array.isArray(previous.leads) ? previous.leads : []).map((lead) =>
          normalizeLeadIdentityKey(lead?.leadId) === normalizeLeadIdentityKey(selectedLead.leadId)
            ? {
                ...lead,
                stage: 'Seller Onboarding Sent',
                status: 'Sent',
                sellerOnboardingToken: token,
                sellerOnboardingLink: onboardingLink,
                sellerOnboardingStatus: 'sent',
                sellerWorkflowLeadId: normalizeText(sellerWorkflowLead?.sellerLeadId || sellerWorkflowLead?.id || selectedLead.leadId),
                listingId: canonicalListingId || normalizeText(selectedLead?.listingId),
                sellerName: sellerFirstName || lead.sellerName,
                sellerSurname: sellerSurname || lead.sellerSurname,
                sellerEmail: sellerEmail || lead.sellerEmail,
                sellerPhone: normalizeText(selectedLeadContact?.phone) || lead.sellerPhone,
                updatedAt: new Date().toISOString(),
              }
            : lead,
        ),
      }))
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
        const safeRuntimeLeadId = normalizeLeadIdentityKey(selectedLead?.leadId) || Date.now()
        fallbackPacketId = `runtime_mandate_${safeRuntimeLeadId}`
      }

      let generatedVersionResult = null
      if (packet?.id) {
        onProgress?.('Merging seller and property details…')
        try {
          onProgress?.('Generating mandate PDF…')
          generatedVersionResult = await generatePacketVersion({
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
      setRecords((previous) => ({
        ...previous,
        leads: (Array.isArray(previous.leads) ? previous.leads : []).map((lead) =>
          normalizeLeadIdentityKey(lead?.leadId) === normalizeLeadIdentityKey(selectedLead.leadId)
            ? {
                ...lead,
                stage: 'Mandate Generated',
                status: 'Mandate Generated',
                mandatePacketId: normalizeText(packet?.id) || fallbackPacketId,
                updatedAt: new Date().toISOString(),
              }
            : lead,
        ),
      }))
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
      let generatedStatus = null
      if (isUuidLike(packet?.id)) {
        generatedStatus = {
          packetType: 'mandate',
          state: 'generated',
          packet: generatedVersionResult?.packet || packet,
          versions: [generatedVersionResult?.version].filter(Boolean),
          signingSummary: null,
          warnings: generatedVersionResult?.validation?.warnings || [],
          actionHint: 'Draft generated.',
        }
        void withPipelineTimeout(
          resolveDocumentPacketStatus({
            packetType: 'mandate',
            packetId: packet.id,
            leadId: normalizeLeadUuid(selectedLead.leadId),
            transactionId: isUuidLike(selectedLeadLinkedTransactionId) ? selectedLeadLinkedTransactionId : '',
            organisationId,
          }),
          'Generated mandate status is taking too long to refresh.',
          PIPELINE_RECORDS_TIMEOUT_MS,
        ).then((refreshedStatus) => {
          if (refreshedStatus?.packet?.id && documentPacketBelongsToLead(refreshedStatus.packet, selectedLead.leadId)) {
            setMandatePacketStatus(refreshedStatus)
          }
        }).catch((statusError) => {
          console.warn('[MANDATE] generated packet status refresh failed; using local generated status.', statusError)
        })
      } else if (fallbackPacketId) {
        generatedStatus = {
          packetType: 'mandate',
          state: 'generated',
          packet: {
            id: fallbackPacketId,
            packet_type: 'mandate',
            title: packetTitle,
            lead_id: normalizeLeadUuid(selectedLead.leadId) || null,
            organisation_id: organisationId,
            status: 'generated',
            source_context_json: {
              uiLeadId: normalizeText(selectedLead.leadId),
              leadId: normalizeLeadUuid(selectedLead.leadId) || null,
              generatedDataSnapshot: mandateData,
              sourceContext: mandateData.sourceContext,
            },
          },
          versions: [],
          signingSummary: null,
          warnings: [],
          actionHint: 'Draft generated in fallback mode.',
        }
      }
      if (generatedStatus) {
        setMandatePacketStatus(generatedStatus)
      }
      void reloadRecords(organisationId).catch((reloadError) => {
        console.warn('[MANDATE] post-generation lead refresh failed; keeping generated packet available in workspace.', reloadError)
      })
      return {
        packet,
        version: generatedVersionResult?.version || null,
        status: generatedStatus,
      }
    } catch (mandateError) {
      if (selectedLead?.leadId && mandateError?.code !== 'MANDATE_PREFLIGHT_BLOCKED') {
        await createAgencyCrmLeadActivity(organisationId, selectedLead.leadId, {
          agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
          activityType: 'Note',
          activityNote: 'Mandate generation failed. Review the missing information and try again.',
          outcome: normalizeText(mandateError?.code || 'Failed'),
        }, { actor: currentAgent }).catch((activityError) => {
          console.warn('[MANDATE] failure activity write skipped.', activityError)
        })
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

  async function handleActivateSellerListing() {
    const listingId = normalizeText(selectedLeadLinkedListing?.id || selectedLead?.listingId)
    if (!listingId) {
      setError('Create or link a listing before activating it.')
      return
    }
    try {
      if (isSupabaseConfigured && isUuidLike(listingId)) {
        await activatePrivateListing(listingId)
      } else {
        updateAgentSellerLead(normalizeText(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId), (row) => ({
          ...row,
          listingStatus: LISTING_STATUS.LISTING_ACTIVE,
        }))
      }
      await updateAgencyCrmLeadRecord(organisationId, selectedLead.leadId, {
        stage: 'Listing Live',
        status: 'Listing Live',
        listingId,
      })
      await createAgencyCrmLeadActivity(organisationId, selectedLead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Listing Activated',
        activityNote: 'Listing was activated for market.',
        outcome: 'Listing Live',
        activityDate: new Date().toISOString(),
      }, { actor: currentAgent })
      setMessage('Listing activated.')
      setError('')
      await reloadRecords(organisationId)
    } catch (activationError) {
      setError(activationError?.message || 'Unable to activate this listing yet.')
    }
  }

  function handleSellerJourneyAction(actionId) {
    const id = normalizeText(actionId)
    if (id === 'contact_seller') {
      const phone = normalizeText(selectedLeadContact?.phone || selectedLead?.sellerPhone || selectedLead?.phone).replace(/[^\d+]/g, '')
      const email = normalizeText(selectedLeadContact?.email || selectedLead?.sellerEmail || selectedLead?.email)
      if (phone && typeof window !== 'undefined') {
        window.open(`https://wa.me/${phone.replace(/^\+/, '')}`, '_blank', 'noopener,noreferrer')
        return
      }
      if (email && typeof window !== 'undefined') {
        window.location.href = `mailto:${email}`
      }
      return
    }
    if (id === 'schedule_valuation') {
      if (selectedSellerJourney?.valuationAppointment) {
        handleOpenAppointmentModal(selectedSellerJourney.valuationAppointment)
      } else {
        handleScheduleSellerAppointment()
      }
      return
    }
    if (id === 'open_appointment' || id === 'mark_valuation_complete') {
      if (selectedSellerJourney?.valuationAppointment) {
        handleOpenAppointmentModal(selectedSellerJourney.valuationAppointment)
      } else {
        handleScheduleSellerAppointment()
      }
      return
    }
    if (id === 'open_timeline') {
      setLeadWorkspaceTab('activity')
      return
    }
    if (id === 'open_documents') {
      setLeadWorkspaceTab('documents')
      return
    }
    if (id === 'capture_property_address') {
      setLeadWorkspaceTab('overview')
      setLeadForm((previous) => ({
        ...previous,
        leadCategory: 'seller',
        sellerPropertyAddress: normalizeText(selectedLead?.sellerPropertyAddress || selectedLead?.seller_property_address || selectedLead?.propertyInterest || selectedLead?.property_interest),
      }))
      return
    }
    if (['generate_mandate', 'send_mandate', 'view_signing_status', 'view_mandate', 'check_signature_status', 'resend_mandate'].includes(id)) {
      void handleSelectedLeadMandatePrimaryAction()
      return
    }
    if (id === 'create_listing') {
      void handleCreateListingFromSellerLead()
      return
    }
    if (id === 'open_listing' || id === 'complete_listing' || id === 'view_enquiries' || id === 'view_performance' || id === 'monitor_performance') {
      const listingId = normalizeText(selectedLeadLinkedListing?.id || selectedLead?.listingId)
      if (listingId) navigate(`/listings/${listingId}`)
      return
    }
    if (id === 'activate_listing') {
      void handleActivateSellerListing()
      return
    }
    if (id === 'open_seller_portal') {
      const token = normalizeText(selectedLead?.sellerOnboardingToken || selectedLeadLinkedListing?.sellerOnboarding?.token)
      const link = token ? buildSellerClientPortalLink(token) : ''
      if (link && typeof window !== 'undefined') window.open(link, '_blank', 'noopener,noreferrer')
    }
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
    const updateParticipants = buildAppointmentParticipantsForSave(appointmentForm.participants || [])
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
      if (selectedLeadIsSeller && selectedLead?.leadId && normalizeKey(updatePayload.status).includes('complete')) {
        await updateAgencyCrmLeadRecord(organisationId, selectedLead.leadId, {
          stage: 'Appointment Completed',
          status: 'Valuation Completed',
        })
        await createAgencyCrmLeadActivity(organisationId, selectedLead.leadId, {
          agent: currentAgent,
          activityType: 'Valuation Completed',
          activityNote: normalizeText(updatePayload.notes || updatePayload.title) || 'Seller valuation completed.',
          outcome: 'completed',
          activityDate: new Date().toISOString(),
        }, { actor: currentAgent })
      }
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

  async function handleSendMandateToSeller(sendOptions = {}) {
    if (!selectedLead || !organisationId) return
    if (!selectedLeadIsSeller) return
    const options = sendOptions && typeof sendOptions === 'object' ? sendOptions : {}
    const statusPacket =
      mandatePacketStatus?.packet &&
      documentPacketBelongsToLead(mandatePacketStatus.packet, selectedLead?.leadId)
        ? mandatePacketStatus.packet
        : null
    const mandatePacketId = normalizeText(
      options.packetId ||
      selectedLead?.mandatePacketId ||
      selectedLead?.mandatePacket?.id ||
      statusPacket?.id,
    )
    if (!mandatePacketId || !isUuidLike(mandatePacketId)) {
      setError('The mandate packet was not saved yet. Click Generate Mandate again, then send it once the packet is ready.')
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
      const providedSignerLinks = Array.isArray(options.signerLinks) ? options.signerLinks : []
      const assignedAgentEmail = normalizeText(selectedLead?.assignedAgentEmail).toLowerCase()
      const currentAgentEmail = normalizeText(currentAgent.email).toLowerCase()
      const agentRecipientEmail = isValidEmail(assignedAgentEmail) ? assignedAgentEmail : currentAgentEmail
      const agentRecipientName = normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName || currentAgent.email)
      const existingSignerRows = Array.isArray(mandatePacketStatus?.signingSummary?.signers)
        ? mandatePacketStatus.signingSummary.signers
        : []
      const agentAlreadySigned = existingSignerRows.some((signer) =>
        normalizeText(signer?.signer_role || signer?.role).toLowerCase() === 'agent' &&
        normalizeText(signer?.status || signer?.statusRaw).toLowerCase() === 'signed'
      )
      let sellerSigningLink = resolveSellerSignerLink(providedSignerLinks, sellerEmail)
      let agentSigningLink = resolveSignerLinkByRole(providedSignerLinks, 'agent', agentRecipientEmail)
      const finalMandateStatus = normalizeText(options.signingStatus) || (agentAlreadySigned ? 'sent_to_seller' : 'sent_to_agent')
      const targetSignerRole = finalMandateStatus === 'sent_to_seller' ? 'seller' : 'agent'
      let signingEmailFailed = false

      if (isSupabaseConfigured && isUuidLike(mandatePacketId) && (!agentSigningLink || !sellerSigningLink)) {
        try {
          const signingPreparation = await prepareSigningFields({
            packetId: mandatePacketId,
            packetType: 'mandate',
            organisationId,
            placeholders: {
              'seller.display_name': sellerName,
              'seller.email': sellerEmail,
              'agent.display_name': agentRecipientName,
              'agent.email': agentRecipientEmail,
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
              generatedByName: agentRecipientName,
              generatedByUserEmail: agentRecipientEmail,
              agentEmail: agentRecipientEmail,
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
            targetSignerRole,
          })
          agentSigningLink = agentSigningLink || resolveSignerLinkByRole(linkResult?.signers, 'agent', agentRecipientEmail)
          sellerSigningLink = sellerSigningLink || resolveSellerSignerLink(linkResult?.signers, sellerEmail)
        } catch (linkError) {
          console.warn('[MANDATE] unable to prepare signer link; continuing with client portal selling link', linkError)
        }

        if ((!sellerSigningLink || !agentSigningLink) && supabase) {
          try {
            const signerLookup = await supabase
              .from('document_packet_signers')
              .select('signing_token, signer_role, signer_email, status')
              .eq('packet_id', mandatePacketId)
              .order('created_at', { ascending: true })

            if (!signerLookup.error) {
              const normalizedSellerEmail = sellerEmail.toLowerCase()
              const normalizedAgentEmail = agentRecipientEmail.toLowerCase()
              const signerRows = Array.isArray(signerLookup.data) ? signerLookup.data : []
              const origin =
                (typeof window !== 'undefined' && window.location?.origin)
                  ? window.location.origin
                  : 'https://app.bridgenine.co.za'
              if (!sellerSigningLink) {
                const matchedSeller =
                  signerRows.find(
                    (row) =>
                      normalizeText(row?.signer_role).toLowerCase() === 'seller' &&
                      normalizeText(row?.signer_email).toLowerCase() === normalizedSellerEmail &&
                      normalizeText(row?.signing_token),
                  ) ||
                  signerRows.find((row) => normalizeText(row?.signer_role).toLowerCase() === 'seller' && normalizeText(row?.signing_token)) ||
                  null
                const signerToken = normalizeText(matchedSeller?.signing_token)
                if (signerToken) sellerSigningLink = `${origin}/sign/${signerToken}`
              }
              if (!agentSigningLink) {
                const matchedAgent =
                  signerRows.find(
                    (row) =>
                      normalizeText(row?.signer_role).toLowerCase() === 'agent' &&
                      normalizeText(row?.signer_email).toLowerCase() === normalizedAgentEmail &&
                      normalizeText(row?.signing_token),
                  ) ||
                  signerRows.find((row) => normalizeText(row?.signer_role).toLowerCase() === 'agent' && normalizeText(row?.signing_token)) ||
                  null
                const signerToken = normalizeText(matchedAgent?.signing_token)
                if (signerToken) agentSigningLink = `${origin}/sign/${signerToken}`
              }
            }
          } catch (signerLookupError) {
            console.warn('[MANDATE] signer lookup fallback failed', signerLookupError)
          }
        }
      }

      const shouldSendToSeller = finalMandateStatus === 'sent_to_seller' || (!agentSigningLink && agentAlreadySigned && sellerSigningLink)
      const outboundMandateLink = shouldSendToSeller
        ? (sellerSigningLink || sellerMandatePortalLink)
        : (agentSigningLink || sellerSigningLink || sellerMandatePortalLink)
      const recipientRole = shouldSendToSeller ? 'seller' : 'agent'
      const recipientEmail = recipientRole === 'seller' ? sellerEmail : agentRecipientEmail
      const recipientName = recipientRole === 'seller' ? sellerName : agentRecipientName
      const requiredSigningLink = recipientRole === 'seller' ? sellerSigningLink : agentSigningLink
      if (!requiredSigningLink) {
        setError(
          recipientRole === 'seller'
            ? 'Seller signing link could not be generated yet. Confirm the seller has an email address, then click Generate Mandate and Send Mandate again.'
            : 'Agent signing link could not be generated yet. Confirm the assigned agent has an email address, then click Generate Mandate and Send Mandate again.',
        )
        return
      }

      if (isSupabaseConfigured) {
        try {
          const emailResponse = await invokeEdgeFunction('send-mandate-signing-email', {
            body: {
              type: 'seller_mandate_sent',
              to: recipientEmail,
              organisationId,
              packetId: mandatePacketId,
              recipientRole,
              recipientName,
              sellerName,
              propertyTitle,
              mandateType: 'Mandate',
              mandateStartDate: '',
              mandateEndDate: '',
              askingPrice: formatCurrency(Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0),
              portalLink: outboundMandateLink,
              agentName: agentRecipientName,
            },
          })
          assertEdgeFunctionSuccess(emailResponse, 'Mandate signing email could not be sent.')
        } catch (emailError) {
          signingEmailFailed = true
          console.warn('[MANDATE] signing email failed after link preparation', emailError)
          throw new Error(emailError?.message || 'Mandate signing email could not be sent. The signing packet is prepared, but the agent was not notified.')
        }
      }

      await updateAgencyCrmLeadRecord(organisationId, selectedLead.leadId, {
        stage: 'Mandate Sent',
        status: 'Mandate Sent',
        mandateStatus: finalMandateStatus,
        mandateSentAt: sentAtIso,
        mandateSigningLink: outboundMandateLink,
      })
      if (onboardingToken) {
        updateSellerWorkflowRecordByToken(onboardingToken, (row) => ({
          ...row,
          mandateStatus: finalMandateStatus,
          mandate: {
            ...(row?.mandate || {}),
            status: finalMandateStatus,
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
    if (actionKey === 'generate' && !selectedLeadOnboardingCompleted) {
      setError('Send seller onboarding and wait for the seller to submit their details before generating the mandate.')
      return
    }

    const workspaceMode = resolveWorkspaceModeFromAction(actionKey)
    setLegalWorkspaceMode(workspaceMode)
    setLegalWorkspaceOpen(true)
  }

  function handleWorkspaceViewMandate() {
    if (!selectedLeadMandateViewLink) {
      setError('Mandate link is not available yet. Generate and send the mandate first.')
      return
    }
    const opened = window.open(selectedLeadMandateViewLink, '_blank', 'noopener,noreferrer')
    if (!opened) window.location.href = selectedLeadMandateViewLink
  }

  function handleWorkspaceViewSignedMandate() {
    const versions = Array.isArray(mandatePacketStatus?.versions) ? mandatePacketStatus.versions : []
    const signedVersion =
      versions.find((version) => normalizeText(version?.final_signed_file_access_url || version?.final_signed_file_url)) ||
      null
    const signedUrl = normalizeText(signedVersion?.final_signed_file_access_url || signedVersion?.final_signed_file_url)
    if (!signedUrl) {
      setError('Signed mandate PDF is not available yet. Complete all signatures and finalize the signed record first.')
      return
    }
    const opened = window.open(signedUrl, '_blank', 'noopener,noreferrer')
    if (!opened) window.location.href = signedUrl
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

  function buildLeadViewingCompletionListingRows(appointment, existingRows = []) {
    const mappedExistingRows = (Array.isArray(existingRows) ? existingRows : [])
      .map((row) => {
        const listingId = normalizeText(row?.listingId)
        if (!listingId) return null
        return {
          listingId,
          outcome: normalizeText(row?.outcome) || VIEWING_OUTCOME_OPTIONS[0],
          buyerFeedback: normalizeText(row?.buyerFeedback),
          agentNotes: normalizeText(row?.agentNotes),
          viewedAt: normalizeText(row?.viewedAt) || normalizeText(appointment?.dateTime) || new Date().toISOString(),
        }
      })
      .filter(Boolean)
    if (mappedExistingRows.length) return mappedExistingRows
    const defaultListingId = normalizeText(appointment?.listingId || selectedLead?.listingId || leadAppointmentOfferListingOptions[0]?.id)
    return defaultListingId
      ? [{
          listingId: defaultListingId,
          outcome: VIEWING_OUTCOME_OPTIONS[0],
          buyerFeedback: '',
          agentNotes: '',
          viewedAt: normalizeText(appointment?.dateTime) || new Date().toISOString(),
        }]
      : []
  }

  function handleAddViewedListingToCompletion() {
    const listingId = normalizeText(leadViewingCompletionForm.propertyDraftListingId)
    if (!listingId) return
    setLeadViewingCompletionForm((previous) => {
      if ((previous.viewedListings || []).some((row) => normalizeText(row?.listingId) === listingId)) {
        return { ...previous, propertyDraftListingId: '' }
      }
      return {
        ...previous,
        propertyDraftListingId: '',
        viewedListings: [
          ...(previous.viewedListings || []),
          {
            listingId,
            outcome: previous.outcome || VIEWING_OUTCOME_OPTIONS[0],
            buyerFeedback: previous.buyerFeedback || '',
            agentNotes: previous.agentNotes || '',
            viewedAt: new Date().toISOString(),
          },
        ],
      }
    })
  }

  function handleUpdateViewedListingCompletion(listingId, patch = {}) {
    const targetListingId = normalizeText(listingId)
    setLeadViewingCompletionForm((previous) => ({
      ...previous,
      viewedListings: (previous.viewedListings || []).map((row) =>
        normalizeText(row?.listingId) === targetListingId
          ? { ...row, ...patch }
          : row,
      ),
    }))
  }

  function handleRemoveViewedListingFromCompletion(listingId) {
    const targetListingId = normalizeText(listingId)
    setLeadViewingCompletionForm((previous) => ({
      ...previous,
      viewedListings: (previous.viewedListings || []).filter((row) => normalizeText(row?.listingId) !== targetListingId),
    }))
  }

  async function handleOpenLeadCompletionPanel(appointment) {
    if (!appointment) return
    setLeadCompletionAppointmentId(appointment.appointmentId)
    const initialViewedListings = buildLeadViewingCompletionListingRows(appointment)
    setLeadViewingCompletionForm({
      outcome: normalizeText(appointment.outcomeSummary) || VIEWING_OUTCOME_OPTIONS[0],
      agentNotes: normalizeText(appointment.agentNotes),
      buyerFeedback: normalizeText(appointment.clientFeedback),
      followUpDate: normalizeText(appointment.followUpDate),
      nextStep: normalizeText(appointment.nextStep) || VIEWING_NEXT_STEP_OPTIONS[0].value,
      clientIntakePreference: normalizeClientIntakePreference(offerLinkForm.clientIntakePreference),
      propertyDraftListingId: '',
      viewedListings: initialViewedListings,
    })
    setError('')
    if (!organisationId || !appointment?.appointmentId) return
    try {
      const existingRows = await listAppointmentViewedListings({
        organisationId,
        appointmentId: appointment.appointmentId,
      })
      if (existingRows.length) {
        setLeadViewingCompletionForm((previous) => ({
          ...previous,
          viewedListings: buildLeadViewingCompletionListingRows(appointment, existingRows),
        }))
      }
    } catch {
      // Existing viewed listings are helpful context, but the completion flow can still continue without them.
    }
  }

  function getLeadViewingCompletionBlockers(form = {}) {
    const blockers = []
    const nextStep = normalizeText(form?.nextStep)
    const intakePreference = normalizeClientIntakePreference(form?.clientIntakePreference)
    const viewedListings = (Array.isArray(form?.viewedListings) ? form.viewedListings : [])
      .map((row) => ({
        listingId: normalizeText(row?.listingId),
        outcome: normalizeText(row?.outcome),
      }))
      .filter((row) => row.listingId)

    if (!viewedListings.length) {
      blockers.push('Select at least one viewed property.')
    }

    if (!normalizeText(form?.outcome)) {
      blockers.push('Choose the buyer outcome.')
    }

    if (!nextStep) {
      blockers.push('Choose the next action for this buyer.')
    }

    if (['schedule_another_viewing', 'move_to_nurture'].includes(nextStep) && !normalizeText(form?.followUpDate)) {
      blockers.push('Add a follow-up date for the next action.')
    }

    if (nextStep === 'mark_lost' && !normalizeText(form?.agentNotes || form?.buyerFeedback)) {
      blockers.push('Capture why this lead is being marked lost.')
    }

    if (nextStep === 'send_offer_link') {
      const hasOfferReadyProperty = viewedListings.some((row) => VIEWING_POSITIVE_OUTCOMES.includes(row.outcome))
      if (!hasOfferReadyProperty) {
        blockers.push('Mark at least one viewed property as interested, wants to offer, or needs follow-up before sending the offer link.')
      }
      if (
        intakePreference === CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL &&
        !normalizeText(offerLinkForm.buyerEmail || selectedLeadContact?.email || selectedLead?.email) &&
        !normalizeText(offerLinkForm.buyerPhone || selectedLeadContact?.phone || selectedLead?.phone)
      ) {
        blockers.push('Add buyer email or phone for a digital offer link, or switch to agent-assisted / hard copy.')
      }
    }

    return blockers
  }

  function getLeadViewingOfferReadyListing(form = {}) {
    const viewedListings = Array.isArray(form?.viewedListings) ? form.viewedListings : []
    return viewedListings.find((row) => VIEWING_POSITIVE_OUTCOMES.includes(normalizeText(row?.outcome))) || viewedListings[0] || null
  }

  async function handleCompleteLeadViewing() {
    if (!organisationId || !selectedLead || !leadCompletionAppointmentId) return
    const targetAppointment = selectedLeadAppointments.find((appointment) => normalizeText(appointment?.appointmentId) === normalizeText(leadCompletionAppointmentId))
    if (!targetAppointment) {
      setError('Select a viewing before saving the outcome.')
      return
    }
    const blockers = getLeadViewingCompletionBlockers(leadViewingCompletionForm)
    if (blockers.length) {
      setError(blockers[0])
      return
    }
    const outcome = normalizeText(leadViewingCompletionForm.outcome) || VIEWING_OUTCOME_OPTIONS[0]
    const nextStepLabel = VIEWING_NEXT_STEP_OPTIONS.find((option) => option.value === leadViewingCompletionForm.nextStep)?.label || leadViewingCompletionForm.nextStep
    const viewedListings = (leadViewingCompletionForm.viewedListings || [])
      .map((row) => ({
        ...row,
        listingId: normalizeText(row?.listingId),
        outcome: normalizeText(row?.outcome) || outcome,
        buyerFeedback: normalizeText(row?.buyerFeedback || leadViewingCompletionForm.buyerFeedback),
        agentNotes: normalizeText(row?.agentNotes || leadViewingCompletionForm.agentNotes),
        viewedAt: normalizeText(row?.viewedAt || targetAppointment.dateTime) || new Date().toISOString(),
      }))
      .filter((row) => row.listingId)
    try {
      setIsOfferLinkSending(leadViewingCompletionForm.nextStep === 'send_offer_link')
      const persistedLead = await ensureBuyerLeadPersistedForLifecycle(selectedLead, selectedLeadContact)
      const canonicalBuyerLeadId = normalizeText(persistedLead?.leadId || selectedLead.leadId)
      await addAppointmentOutcomeAsync(
        organisationId,
        targetAppointment.appointmentId,
        {
          status: 'completed',
          outcomeSummary: outcome,
          clientFeedback: leadViewingCompletionForm.buyerFeedback,
          agentNotes: leadViewingCompletionForm.agentNotes,
          nextStep: nextStepLabel,
          followUpDate: leadViewingCompletionForm.followUpDate,
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      await upsertAppointmentViewedListings({
        organisationId,
        appointmentId: targetAppointment.appointmentId,
        leadId: canonicalBuyerLeadId,
        agentId: targetAppointment.assignedAgentId || selectedLead.assignedAgentId || currentAgent.id,
        viewedListings,
        replaceExisting: true,
      })
      if (normalizeText(leadViewingCompletionForm.followUpDate)) {
        await createAgencyCrmLeadTask(
          organisationId,
          selectedLead.leadId,
          {
            assignedAgent: resolveAgentById(selectedLead.assignedAgentId || selectedLead.assignedAgentEmail || currentAgent.id),
            title: nextStepLabel || 'Viewing follow-up',
            description: normalizeText(leadViewingCompletionForm.agentNotes || leadViewingCompletionForm.buyerFeedback || outcome),
            dueDate: leadViewingCompletionForm.followUpDate,
            status: 'Pending',
            priority: 'Medium',
          },
          {
            actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
          },
        )
      }
      const offerReadyListing = getLeadViewingOfferReadyListing({ ...leadViewingCompletionForm, viewedListings })
      const nextListingId = normalizeText(
        offerReadyListing?.listingId ||
          targetAppointment.listingId ||
          viewedListings[0]?.listingId ||
          selectedLead.listingId,
      )
      const nextIntakePreference = normalizeClientIntakePreference(leadViewingCompletionForm.clientIntakePreference)
      setOfferLinkForm((previous) => ({
        ...previous,
        appointmentId: targetAppointment.appointmentId,
        listingId: nextListingId,
        buyerName: normalizeText(previous.buyerName || selectedLeadContactName),
        buyerEmail: normalizeText(previous.buyerEmail || selectedLeadContact?.email || selectedLead?.email),
        buyerPhone: normalizeText(previous.buyerPhone || selectedLeadContact?.phone || selectedLead?.phone),
        clientIntakePreference: nextIntakePreference,
        note: normalizeText(previous.note || leadViewingCompletionForm.agentNotes),
      }))
      setLeadCompletionAppointmentId('')
      setError('')
      if (leadViewingCompletionForm.nextStep === 'send_offer_link') {
        const offerResult = await createAndSendOfferLinkForLead({
          appointmentId: targetAppointment.appointmentId,
          listingId: nextListingId,
          buyerName: normalizeText(offerLinkForm.buyerName || selectedLeadContactName),
          buyerEmail: normalizeText(offerLinkForm.buyerEmail || selectedLeadContact?.email || selectedLead?.email),
          buyerPhone: normalizeText(offerLinkForm.buyerPhone || selectedLeadContact?.phone || selectedLead?.phone),
          expiryDate: normalizeText(offerLinkForm.expiryDate),
          note: normalizeText(offerLinkForm.note || leadViewingCompletionForm.agentNotes),
          clientIntakePreference: nextIntakePreference,
          viewedListings,
          successPrefix: 'Viewing completed and ',
        })
        setMessage(offerResult?.successMessage || 'Viewing completed and offer portal prepared.')
        if (offerResult?.errorMessage) {
          setError(offerResult.errorMessage)
        }
      } else {
        setMessage('Viewing completed. Buyer stage moved to Viewing Completed.')
      }
      await reloadRecords(organisationId)
    } catch (completionError) {
      setError(completionError?.message || 'Unable to complete this viewing right now.')
    } finally {
      setIsOfferLinkSending(false)
    }
  }

  async function handleCancelLeadViewing(appointment) {
    if (!organisationId || !appointment?.appointmentId) return
    try {
      const updated = await updateAppointmentAsync(
        organisationId,
        appointment.appointmentId,
        {
          status: 'cancelled',
          cancellationReason: 'Cancelled from lead appointment workspace.',
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      if (selectedLead?.leadId) {
        await createAgencyCrmLeadActivity(
          organisationId,
          selectedLead.leadId,
          {
            agent: currentAgent,
            activityType: 'Appointment Cancelled',
            activityNote: `${updated?.appointmentTypeLabel || getAppointmentTypeLabel(appointment.appointmentType)} cancelled from the lead workspace.`,
            outcome: 'cancelled',
            activityDate: new Date().toISOString(),
          },
          { actor: currentAgent },
        )
      }
      setMessage('Viewing cancelled.')
      await reloadRecords(organisationId)
    } catch (cancelError) {
      setError(cancelError?.message || 'Unable to cancel this viewing right now.')
    }
  }

  async function sendBuyerOfferLinkEmail({
    link = '',
    propertyTitle = '',
    propertyCount = 1,
    buyerEmail = '',
    buyerName = '',
    note = '',
    expiresAt = '',
  } = {}) {
    const recipientEmail = normalizeText(buyerEmail || offerLinkForm.buyerEmail || selectedLeadContact?.email || selectedLead?.email).toLowerCase()
    const offerLink = normalizeText(link)
    if (!recipientEmail || !offerLink) {
      return {
        attempted: false,
        sent: false,
        reason: recipientEmail ? 'missing_link' : 'missing_email',
      }
    }

    try {
      const emailResponse = await invokeEdgeFunction('send-email', {
        body: {
          type: 'buyer_offer_link',
          to: recipientEmail,
          buyerName: normalizeText(buyerName || offerLinkForm.buyerName) || selectedLeadContactName,
          propertyTitle: normalizeText(propertyTitle),
          propertyCount,
          offerLink,
          expiresAt: normalizeText(expiresAt || offerLinkForm.expiryDate),
          agentName: normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName || currentAgent.email),
          note: normalizeText(note || offerLinkForm.note),
        },
      })
      if (emailResponse?.error || emailResponse?.data?.error) {
        throw emailResponse.error || new Error(emailResponse.data.error)
      }
      return { attempted: true, sent: true }
    } catch (emailError) {
      console.warn('[PIPELINE] buyer offer link email failed', emailError)
      return {
        attempted: true,
        sent: false,
        error: emailError,
      }
    }
  }

  async function createAndSendOfferLinkForLead({
    directOfferCentreSubmission = false,
    appointmentId = '',
    listingId = '',
    buyerName = '',
    buyerEmail = '',
    buyerPhone = '',
    expiryDate = '',
    note = '',
    clientIntakePreference = '',
    viewedListings = [],
    successPrefix = '',
  } = {}) {
    if (!organisationId || !selectedLead) return null
    const selectedListingId = normalizeText(listingId || offerLinkForm.listingId)
    const resolvedIntakePreference = normalizeClientIntakePreference(clientIntakePreference || offerLinkForm.clientIntakePreference)
    const resolvedBuyerName = normalizeText(buyerName || offerLinkForm.buyerName) || selectedLeadContactName
    const resolvedBuyerEmail = normalizeText(buyerEmail || offerLinkForm.buyerEmail || selectedLeadContact?.email || selectedLead?.email)
    const resolvedBuyerPhone = normalizeText(buyerPhone || offerLinkForm.buyerPhone || selectedLeadContact?.phone || selectedLead?.phone)
    const resolvedExpiryDate = normalizeText(expiryDate || offerLinkForm.expiryDate)
    const resolvedNote = normalizeText(note || offerLinkForm.note)
    const requiresDigitalContact = resolvedIntakePreference === CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL

    if (!selectedListingId) {
      throw new Error('Select the property before sending the offer link.')
    }
    if (requiresDigitalContact && !resolvedBuyerEmail && !resolvedBuyerPhone) {
      throw new Error('Add buyer email or phone before sending the offer link.')
    }
    const persistedLead = await ensureBuyerLeadPersistedForLifecycle(selectedLead, selectedLeadContact)
    const canonicalBuyerLeadId = normalizeText(persistedLead?.leadId || selectedLead.leadId)
    const canonicalBuyerContactId = normalizeText(persistedLead?.contactId || selectedLead.contactId)
    const viewingAppointmentId = directOfferCentreSubmission
      ? ''
      : normalizeText(appointmentId || offerLinkForm.appointmentId) || normalizeText(selectedLeadActiveViewing?.appointmentId)

    if (viewingAppointmentId) {
      let viewedProperties = Array.isArray(viewedListings) && viewedListings.length
        ? viewedListings
        : await listAppointmentViewedListings({
            organisationId,
            appointmentId: viewingAppointmentId,
          }).catch(() => [])
      const selectedAlreadyLinked = viewedProperties.some((item) => normalizeText(item?.listingId) === selectedListingId)
      if (!selectedAlreadyLinked) {
        await upsertAppointmentViewedListings({
          organisationId,
          appointmentId: viewingAppointmentId,
          leadId: canonicalBuyerLeadId,
          agentId: currentAgent.id,
          viewedListings: [{
            listingId: selectedListingId,
            outcome: 'Interested',
            buyerFeedback: '',
            agentNotes: resolvedNote,
            viewedAt: new Date().toISOString(),
            metadata: { source: 'offer_link_bootstrap' },
          }],
        }).catch(() => viewedProperties)
        viewedProperties = await listAppointmentViewedListings({
          organisationId,
          appointmentId: viewingAppointmentId,
        }).catch(() => viewedProperties)
      }
      const session = await createOfferPortalSession(
        {
          organisationId,
          buyerLeadId: canonicalBuyerLeadId,
          buyerContactId: canonicalBuyerContactId,
          agentId: currentAgent.id,
          appointmentId: viewingAppointmentId,
          expiresAt: resolvedExpiryDate,
          metadata: {
            source: directOfferCentreSubmission ? 'lead_offer_centre' : successPrefix ? 'lead_viewing_completion' : 'lead_appointment_tab',
            localBuyerLeadId: selectedLead.leadId,
            localBuyerContactId: normalizeText(selectedLead.contactId),
            canonicalBuyerLeadId,
            canonicalBuyerContactId,
            buyerName: resolvedBuyerName,
            buyerEmail: resolvedBuyerEmail,
            buyerPhone: resolvedBuyerPhone,
            agentName: normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName || currentAgent.email),
            agentEmail: normalizeText(selectedLead?.assignedAgentEmail || currentAgent.email).toLowerCase(),
            agentReviewUrl: typeof window !== 'undefined'
              ? `${window.location.origin}/pipeline/leads/${encodeURIComponent(canonicalBuyerLeadId)}`
              : '',
            agentNoteToBuyer: resolvedNote,
            clientIntakePreference: resolvedIntakePreference,
            offerCentreChannels: offerLinkChannels,
            selectedListingId,
            viewedListingIds: viewedProperties.map((item) => item?.listingId).filter(Boolean),
          },
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      await updateAppointmentAsync(
        organisationId,
        viewingAppointmentId,
        {
          nextStep: resolvedIntakePreference === CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL
            ? 'Post-viewing offer portal sent'
            : `Post-viewing ${getClientIntakePreferenceLabel(resolvedIntakePreference).toLowerCase()} offer prepared`,
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      ).catch(() => null)
      const offerLink = session?.token && typeof window !== 'undefined'
        ? `${window.location.origin}/offers/session/${encodeURIComponent(session.token)}`
        : ''
      await createAgencyCrmLeadActivity(
        organisationId,
        canonicalBuyerLeadId,
        {
          agent: currentAgent,
          activityType: resolvedIntakePreference === CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL ? 'Post-Viewing Offer Portal Sent' : 'Post-Viewing Offer Prepared',
          activityNote: [
            `Offer portal created for ${viewedProperties.length || 1} viewed ${viewedProperties.length === 1 ? 'property' : 'properties'}.`,
            offerLink ? `Link: ${offerLink}` : '',
          ].filter(Boolean).join(' '),
          outcome: 'Offer Draft',
          activityDate: new Date().toISOString(),
        },
        { actor: currentAgent },
      )
      if (offerLink && typeof navigator !== 'undefined') {
        void navigator.clipboard?.writeText(offerLink)
      }
      const emailResult = requiresDigitalContact
        ? await sendBuyerOfferLinkEmail({
            link: offerLink,
            propertyTitle: viewedProperties.length > 1 ? '' : resolveAppointmentListingLabel(selectedListingId),
            propertyCount: viewedProperties.length || 1,
            buyerEmail: resolvedBuyerEmail,
            buyerName: resolvedBuyerName,
            note: resolvedNote,
            expiresAt: resolvedExpiryDate,
          })
        : { attempted: false, sent: false, reason: 'manual_delivery' }
      setOfferLinkForm((previous) => ({
        ...previous,
        appointmentId: viewingAppointmentId,
        listingId: selectedListingId,
        buyerName: resolvedBuyerName,
        buyerEmail: resolvedBuyerEmail,
        buyerPhone: resolvedBuyerPhone,
        expiryDate: resolvedExpiryDate,
        note: resolvedNote,
        clientIntakePreference: resolvedIntakePreference,
        lastOfferLink: offerLink,
      }))
      return {
        offerLink,
        emailResult,
        deliveryMode: resolvedIntakePreference,
        successMessage: offerLink
          ? requiresDigitalContact
            ? emailResult.sent
              ? `${successPrefix || 'Post-viewing '}offer portal sent to the buyer. Link copied as backup.`
              : emailResult.attempted
                ? `${successPrefix || 'Post-viewing '}offer portal created and copied, but the email could not be sent.`
                : `${successPrefix || 'Post-viewing '}offer portal created and copied. Add a buyer email to send it directly.`
            : `${successPrefix || ''}${getClientIntakePreferenceLabel(resolvedIntakePreference)} offer pack prepared. Link copied for the agent.`
          : `${successPrefix || 'Post-viewing '}offer portal created.`,
        errorMessage: emailResult.error?.message || '',
      }
    }

    const offer = await createCanonicalOffer(
      {
        organisationId,
        buyerLeadId: canonicalBuyerLeadId,
        buyerContactId: canonicalBuyerContactId,
        listingId: selectedListingId,
        agentId: currentAgent.id,
        viewingAppointmentId,
        status: 'sent_to_buyer',
        financeType: selectedLead.financeType || selectedLead.preferredFinanceType || '',
        expiryDate: resolvedExpiryDate,
        conditionsJson: {
          source: directOfferCentreSubmission ? 'lead_offer_centre' : successPrefix ? 'lead_viewing_completion' : 'lead_appointment_tab',
          buyerName: resolvedBuyerName,
          buyerEmail: resolvedBuyerEmail,
          buyerPhone: resolvedBuyerPhone,
          agentName: normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName || currentAgent.email),
          agentEmail: normalizeText(selectedLead?.assignedAgentEmail || currentAgent.email).toLowerCase(),
          agentReviewUrl: typeof window !== 'undefined'
            ? `${window.location.origin}/pipeline/leads/${encodeURIComponent(canonicalBuyerLeadId)}`
            : '',
          agentNoteToBuyer: resolvedNote,
          clientIntakePreference: resolvedIntakePreference,
          offerCentreChannels: offerLinkChannels,
        },
      },
      {
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      },
    )
    if (offer?.id && normalizeText(appointmentId || offerLinkForm.appointmentId)) {
      await updateAppointmentAsync(
        organisationId,
        normalizeText(appointmentId || offerLinkForm.appointmentId),
        {
          offerInviteId: offer.id,
          nextStep: resolvedIntakePreference === CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL
            ? 'Offer link sent'
            : `${getClientIntakePreferenceLabel(resolvedIntakePreference)} offer prepared`,
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      ).catch(() => null)
    }
    const offerLinkToken = normalizeText(offer?.offerToken || offer?.id)
    const offerLink = offerLinkToken && typeof window !== 'undefined'
      ? `${window.location.origin}/offers/${encodeURIComponent(offerLinkToken)}`
      : ''
    await createAgencyCrmLeadActivity(
      organisationId,
      canonicalBuyerLeadId,
      {
        agent: currentAgent,
        activityType: resolvedIntakePreference === CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL ? 'Offer Link Sent' : 'Offer Prepared',
        activityNote: [
          `Offer draft created for ${resolveAppointmentListingLabel(selectedListingId) || 'selected property'}.`,
          offerLink ? `Link: ${offerLink}` : '',
        ].filter(Boolean).join(' '),
        outcome: 'Offer Draft',
        activityDate: new Date().toISOString(),
      },
      { actor: currentAgent },
    )
    if (offerLink && typeof navigator !== 'undefined') {
      void navigator.clipboard?.writeText(offerLink)
    }
    const emailResult = requiresDigitalContact
      ? await sendBuyerOfferLinkEmail({
          link: offerLink,
          propertyTitle: resolveAppointmentListingLabel(selectedListingId) || 'selected property',
          propertyCount: 1,
          buyerEmail: resolvedBuyerEmail,
          buyerName: resolvedBuyerName,
          note: resolvedNote,
          expiresAt: resolvedExpiryDate,
        })
      : { attempted: false, sent: false, reason: 'manual_delivery' }
    setOfferLinkForm((previous) => ({
      ...previous,
      appointmentId: normalizeText(appointmentId || previous.appointmentId),
      listingId: selectedListingId,
      buyerName: resolvedBuyerName,
      buyerEmail: resolvedBuyerEmail,
      buyerPhone: resolvedBuyerPhone,
      expiryDate: resolvedExpiryDate,
      note: resolvedNote,
      clientIntakePreference: resolvedIntakePreference,
      lastOfferLink: offerLink,
    }))
    return {
      offerLink,
      emailResult,
      deliveryMode: resolvedIntakePreference,
      successMessage: offerLink
        ? requiresDigitalContact
          ? emailResult.sent
            ? 'Offer link sent to the buyer. Link copied as backup.'
            : emailResult.attempted
              ? 'Offer link created and copied, but the email could not be sent.'
              : 'Offer link created and copied. Add a buyer email to send it directly.'
          : `${getClientIntakePreferenceLabel(resolvedIntakePreference)} offer pack prepared. Link copied for the agent.`
        : 'Offer draft created. Buyer lead stage updated to Offer Draft.',
      errorMessage: emailResult.error?.message || '',
    }
  }

  async function handleSendOfferLinkFromAppointment(event) {
    event?.preventDefault?.()
    if (!organisationId || !selectedLead) return
    const isDirectOfferCentreSubmission = event?.currentTarget?.dataset?.offerCentre === 'true'
    try {
      setIsOfferLinkSending(true)
      setError('')
      const result = await createAndSendOfferLinkForLead({
        directOfferCentreSubmission: isDirectOfferCentreSubmission,
      })
      if (result?.successMessage) setMessage(result.successMessage)
      if (result?.errorMessage) {
        setError(result.errorMessage)
      }
      await reloadRecords(organisationId)
    } catch (offerError) {
      setError(offerError?.message || 'Unable to create the offer link.')
    } finally {
      setIsOfferLinkSending(false)
    }
  }

  function buildCanonicalOfferActionPatch(offer, actionLabel, note = '') {
    const trimmedNote = normalizeText(note)
    return {
      conditions_json: {
        ...(offer?.conditions || {}),
        agentActionHistory: [
          ...(Array.isArray(offer?.conditions?.agentActionHistory) ? offer.conditions.agentActionHistory : []),
          {
            action: actionLabel,
            note: trimmedNote,
            at: new Date().toISOString(),
            actorId: currentAgent.id,
            actorName: currentAgent.fullName,
          },
        ],
        latestAgentNote: trimmedNote || offer?.conditions?.latestAgentNote || '',
      },
    }
  }

  async function handleLeadCanonicalOfferStatus(offer, nextStatus, actionLabel) {
    if (!organisationId || !offer?.id) return
    const note = canonicalOfferNotesById[offer.id] || ''
    try {
      setCanonicalOfferActionId(`${offer.id}:${nextStatus}`)
      await updateCanonicalOfferStatus(offer.id, nextStatus, {
        organisationId,
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        patch: buildCanonicalOfferActionPatch(offer, actionLabel || nextStatus, note),
      })
      setCanonicalOfferNotesById((previous) => ({ ...previous, [offer.id]: '' }))
      setSelectedLeadOffersRefreshTick((value) => value + 1)
      setMessage(`Offer moved to ${nextStatus.replaceAll('_', ' ')}.`)
      setError('')
      await reloadRecords(organisationId)
    } catch (statusError) {
      setError(statusError?.message || 'Unable to update this offer.')
    } finally {
      setCanonicalOfferActionId('')
    }
  }

  async function resolveLeadOfferSellerRecipient(offer = {}) {
    const listingId = normalizeText(offer?.listingId || selectedLead?.listingId)
    const localListing = listingId
      ? readAgentPrivateListings().find((listing) => normalizeText(listing?.id || listing?.listingId || listing?.listing_id) === listingId)
      : null
    let remoteListing = null
    if (!resolveSellerEmailFromListing(localListing) && listingId && organisationId && isSupabaseConfigured) {
      try {
        const privateListings = await getOrganisationPrivateListings(organisationId, { includeRequirementsAndDocuments: false })
        remoteListing = (Array.isArray(privateListings) ? privateListings : [])
          .find((listing) => normalizeText(listing?.id || listing?.listingId || listing?.listing_id) === listingId) || null
      } catch (listingError) {
        console.warn('[PIPELINE] seller offer review listing lookup failed', listingError)
      }
    }

    const listing = remoteListing || localListing || null
    const sellerEmail = resolveSellerEmailFromListing(listing)
    const sellerName = resolveSellerNameFromListing(listing) || 'Seller'
    return {
      sellerEmail,
      sellerPhone: resolveSellerPhoneFromListing(listing),
      sellerName,
      listing,
      sellerLeadId: normalizeText(listing?.sellerLeadId || listing?.seller_lead_id || listing?.leadId || listing?.lead_id),
      sellerContactId: normalizeText(listing?.sellerContactId || listing?.seller_contact_id),
    }
  }

  function getLeadSellerReviewDeliveryMode(offerId, sellerRecipient = {}) {
    return normalizeSellerReviewDeliveryMode(
      sellerReviewDeliveryModeByOfferId?.[offerId],
      { sellerEmail: sellerRecipient.sellerEmail, sellerPhone: sellerRecipient.sellerPhone },
    )
  }

  async function buildLeadSellerReviewPreparation(offer = {}) {
    const sellerRecipient = await resolveLeadOfferSellerRecipient(offer)
    const deliveryMode = getLeadSellerReviewDeliveryMode(offer.id, sellerRecipient)
    return {
      sellerRecipient,
      preparation: buildSellerOfferReviewPreparation({
        listing: sellerRecipient.listing,
        offer,
        deliveryMode,
        sellerEmail: sellerRecipient.sellerEmail,
        sellerPhone: sellerRecipient.sellerPhone,
        sellerName: sellerRecipient.sellerName,
        sellerLeadId: offer.sellerLeadId || sellerRecipient.sellerLeadId,
        sellerContactId: offer.sellerContactId || sellerRecipient.sellerContactId,
      }),
    }
  }

  async function handleLeadCanonicalOfferSendToSeller(offer) {
    if (!organisationId || !offer?.id) return
    const note = canonicalOfferNotesById[offer.id] || ''
    let createdReviewSession = null
    try {
      setCanonicalOfferActionId(`${offer.id}:sent_to_seller`)
      const { sellerRecipient, preparation } = await buildLeadSellerReviewPreparation(offer)
      const { session } = await createOfferSellerReviewSession({
        organisationId,
        offerId: offer.id,
        offer,
        listing: sellerRecipient.listing,
        listingId: offer.listingId || selectedLead?.listingId,
        sellerLeadId: preparation.sellerLeadId,
        sellerContactId: preparation.sellerContactId,
        sellerEmail: sellerRecipient.sellerEmail,
        sellerPhone: sellerRecipient.sellerPhone,
        sellerName: sellerRecipient.sellerName,
        deliveryMode: preparation.deliveryMode,
        agentId: currentAgent.id,
        agentReviewNotes: note,
        metadata: {
          source: 'lead_workspace_offer_review',
          leadId: selectedLead?.leadId || offer.buyerLeadId,
          sellerEmail: sellerRecipient.sellerEmail,
          sellerPhone: sellerRecipient.sellerPhone,
          sellerName: sellerRecipient.sellerName,
        },
      }, {
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      })
      createdReviewSession = session
      const reviewLink = session?.token && typeof window !== 'undefined'
        ? `${window.location.origin}/seller/offers/review/${encodeURIComponent(session.token)}`
        : ''
      if (reviewLink && typeof navigator !== 'undefined') {
        void navigator.clipboard?.writeText(reviewLink)
      }
      if (preparation.deliveryMode === SELLER_REVIEW_DELIVERY_MODE.EMAIL) {
        const emailResponse = await invokeEdgeFunction('send-email', {
          body: {
            type: 'seller_offer_review',
            to: sellerRecipient.sellerEmail,
            sellerName: sellerRecipient.sellerName,
            propertyTitle: resolveAppointmentListingLabel(offer.listingId || selectedLead?.listingId) || selectedLeadPropertyLabel,
            buyerName: selectedLeadDisplayName,
            offerAmount: formatCurrency(offer.offerAmount),
            reviewLink,
            expiresAt: session?.expiresAt || '',
            agentName: currentAgent.fullName,
            note,
          },
        })
        if (emailResponse?.error || emailResponse?.data?.error) {
          throw emailResponse.error || new Error(emailResponse.data.error)
        }
      }
      setCanonicalOfferNotesById((previous) => ({ ...previous, [offer.id]: '' }))
      setSelectedLeadOffersRefreshTick((value) => value + 1)
      setMessage(
        preparation.deliveryMode === SELLER_REVIEW_DELIVERY_MODE.EMAIL
          ? reviewLink
            ? `Offer emailed to ${sellerRecipient.sellerEmail}. Seller link copied.`
            : `Offer emailed to ${sellerRecipient.sellerEmail}.`
          : reviewLink
            ? `Seller review prepared for ${preparation.deliveryModeLabel.toLowerCase()}. Review link copied for the agent handoff.`
            : `Seller review prepared for ${preparation.deliveryModeLabel.toLowerCase()}.`,
      )
      setError('')
      await reloadRecords(organisationId)
    } catch (sendError) {
      if (createdReviewSession?.id) {
        await updateCanonicalOfferStatus(offer.id, 'agent_review', {
          organisationId,
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
          patch: buildCanonicalOfferActionPatch(
            offer,
            'Seller email failed',
            sendError?.message || 'Seller email failed after review link creation.',
          ),
        }).catch(() => null)
        setSelectedLeadOffersRefreshTick((value) => value + 1)
      }
      setError(sendError?.message || 'Unable to send this offer to the seller.')
    } finally {
      setCanonicalOfferActionId('')
    }
  }

  async function handleLeadCanonicalOfferConversion(offer) {
    if (!organisationId || !offer?.id || !selectedLead) return
    try {
      setCanonicalOfferActionId(`${offer.id}:convert`)
      const currentStatus = normalizeText(offer.status).toLowerCase()
      const acceptedOffer = ['accepted', 'converted_to_transaction'].includes(currentStatus)
        ? offer
        : await updateCanonicalOfferStatus(offer.id, 'accepted', {
            organisationId,
            actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
            patch: buildCanonicalOfferActionPatch(offer, 'Accepted for transaction conversion', canonicalOfferNotesById[offer.id] || ''),
          })
      const listingId = normalizeText(acceptedOffer?.listingId || offer?.listingId || selectedLead?.listingId)
      const createdTransaction = await createTransactionFromAcceptedCanonicalOffer({
        organisationId,
        offerId: acceptedOffer?.id || offer.id,
        offer: acceptedOffer || offer,
        lead: {
          ...selectedLead,
          email: selectedLeadContact?.email || selectedLead?.email,
          phone: selectedLeadContact?.phone || selectedLead?.phone,
          firstName: selectedLeadContact?.firstName || selectedLead?.firstName,
          lastName: selectedLeadContact?.lastName || selectedLead?.lastName,
        },
        listing: listingId
          ? {
              id: listingId,
              organisationId,
              listingTitle: resolveAppointmentListingLabel(listingId) || selectedLead?.propertyInterest || 'Listing',
              propertyAddress: selectedLead?.sellerPropertyAddress || selectedLead?.areaInterest || '',
            }
          : null,
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        payload: {
          listingId,
          buyerName: selectedLeadContactName,
          buyerEmail: selectedLeadContact?.email || selectedLead?.email,
          buyerPhone: selectedLeadContact?.phone || selectedLead?.phone,
          clientIntakePreference: normalizeClientIntakePreference(
            acceptedOffer?.conditions?.clientIntakePreference ||
            acceptedOffer?.conditions?.deliveryMode ||
            offerLinkForm.clientIntakePreference,
          ),
        },
      })
      const transactionId = normalizeText(createdTransaction?.transactionId || createdTransaction?.transactionRow?.transaction?.id)
      const reusedTransaction = Boolean(createdTransaction?.alreadyConverted || (createdTransaction?.existing && transactionId))
      let onboardingSendWarning = ''
      if (transactionId && isSupabaseConfigured) {
        const intakePreference = normalizeClientIntakePreference(
          acceptedOffer?.conditions?.clientIntakePreference ||
          acceptedOffer?.conditions?.deliveryMode ||
          offerLinkForm.clientIntakePreference,
        )
        const onboardingEmail = await invokeEdgeFunction('send-email', {
          body: {
            type: 'client_onboarding',
            transactionId,
            source: 'accepted_offer_conversion',
            deliveryMode: intakePreference,
          },
        })
        const onboardingEmailError = onboardingEmail?.error || onboardingEmail?.data?.error
        if (onboardingEmailError) {
          onboardingSendWarning = typeof onboardingEmailError === 'string'
            ? onboardingEmailError
            : onboardingEmailError?.message || 'Buyer onboarding email could not be sent.'
        }
      }
      if (transactionId) {
        const intakeLabel = getClientIntakePreferenceLabel(
          acceptedOffer?.conditions?.clientIntakePreference ||
          acceptedOffer?.conditions?.deliveryMode ||
          offerLinkForm.clientIntakePreference,
        )
        const manualHandoff = onboardingSendWarning === '' && ['agent_assisted', 'hard_copy'].includes(
          normalizeClientIntakePreference(
            acceptedOffer?.conditions?.clientIntakePreference ||
            acceptedOffer?.conditions?.deliveryMode ||
            offerLinkForm.clientIntakePreference,
          ),
        )
        await recordBuyerLeadActivity({
          organisationId,
          leadId: acceptedOffer?.buyerLeadId || offer?.buyerLeadId || selectedLead?.leadId,
          activityType: reusedTransaction ? 'Buyer Onboarding Resent' : 'Buyer Onboarding Sent',
          activityNote: onboardingSendWarning
            ? `Buyer onboarding email attempted for transaction ${transactionId}, but delivery needs attention: ${onboardingSendWarning}`
            : manualHandoff
              ? `${reusedTransaction ? 'Buyer onboarding reopened' : 'Buyer onboarding prepared'} for transaction ${transactionId} using ${intakeLabel}.`
              : `${reusedTransaction ? 'Buyer onboarding resent' : 'Buyer onboarding sent'} for transaction ${transactionId}.`,
          outcome: onboardingSendWarning ? 'Delivery Warning' : 'Sent',
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        }).catch(() => null)
      }
      setCanonicalOfferNotesById((previous) => ({ ...previous, [offer.id]: '' }))
      setSelectedLeadOffersRefreshTick((value) => value + 1)
      setMessage(onboardingSendWarning
        ? `${reusedTransaction ? 'Buyer onboarding resend attempted' : 'Transaction created from accepted offer'}. ${onboardingSendWarning}`
        : ['agent_assisted', 'hard_copy'].includes(
            normalizeClientIntakePreference(
              acceptedOffer?.conditions?.clientIntakePreference ||
              acceptedOffer?.conditions?.deliveryMode ||
              offerLinkForm.clientIntakePreference,
            ),
          )
          ? reusedTransaction
            ? 'Buyer onboarding was reopened for assisted capture.'
            : `Transaction created from accepted offer and ${getClientIntakePreferenceLabel(
              acceptedOffer?.conditions?.clientIntakePreference ||
              acceptedOffer?.conditions?.deliveryMode ||
              offerLinkForm.clientIntakePreference,
            ).toLowerCase()} onboarding was prepared.`
        : reusedTransaction
          ? 'Buyer onboarding was resent for the existing transaction.'
          : 'Transaction created from accepted offer and buyer onboarding was sent.')
      setError('')
      await reloadRecords(organisationId)
    } catch (conversionError) {
      setError(conversionError?.message || 'Unable to create a transaction from this offer.')
    } finally {
      setCanonicalOfferActionId('')
    }
  }

  async function handleSendBuyerOnboardingFromLead() {
    if (!organisationId || !selectedLead || selectedLeadIsSeller) return
    const leadActionId = `lead:${selectedLead.leadId}:buyer-onboarding`
    const acceptedOffer = (Array.isArray(selectedLeadOffers) ? selectedLeadOffers : []).find((offer) => {
      const status = normalizeText(offer?.status).toLowerCase()
      return ['accepted', 'converted_to_transaction'].includes(status) || normalizeText(offer?.transactionId)
    })

    if (acceptedOffer) {
      await handleLeadCanonicalOfferConversion(acceptedOffer)
      return
    }

    const transactionId = normalizeText(selectedLeadLinkedTransactionId)
    if (!transactionId) {
      setError('Create or accept an offer first, then Bridge can create the transaction and send buyer onboarding.')
      return
    }

    try {
      setCanonicalOfferActionId(leadActionId)
      const onboardingEmail = await invokeEdgeFunction('send-email', {
        body: {
          type: 'client_onboarding',
          transactionId,
          source: 'buyer_lead_workspace',
          deliveryMode: selectedLeadClientIntakePreference,
        },
      })
      const onboardingEmailError = onboardingEmail?.error || onboardingEmail?.data?.error
      if (onboardingEmailError) {
        throw typeof onboardingEmailError === 'string'
          ? new Error(onboardingEmailError)
          : onboardingEmailError
      }
      await recordBuyerLeadActivity({
        organisationId,
        leadId: selectedLead.leadId,
        activityType: 'Buyer Onboarding Sent',
        activityNote: onboardingEmail?.data?.manualHandoff
          ? `Buyer onboarding prepared for transaction ${transactionId} using ${getClientIntakePreferenceLabel(selectedLeadClientIntakePreference)}.`
          : `Buyer onboarding sent for transaction ${transactionId}.`,
        outcome: 'Sent',
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      }).catch(() => null)
      setMessage(onboardingEmail?.data?.manualHandoff
        ? `${getClientIntakePreferenceLabel(selectedLeadClientIntakePreference)} onboarding was prepared.`
        : 'Buyer onboarding was sent.')
      setError('')
      await reloadRecords(organisationId)
    } catch (sendError) {
      setError(sendError?.message || 'Unable to send buyer onboarding right now.')
    } finally {
      setCanonicalOfferActionId('')
    }
  }

  async function handleSendBuyerOnboardingFromLeadRow(lead, linkedTransaction = null) {
    const leadId = normalizeLeadIdentityKey(lead?.leadId)
    if (!organisationId || !leadId || resolveLeadCategoryView(lead) === 'seller') return
    const transactionId = normalizeText(
      linkedTransaction?.transactionId ||
        linkedTransaction?.transaction_id ||
        linkedTransaction?.id ||
        lead?.convertedTransactionId ||
        lead?.converted_transaction_id ||
        lead?.transactionId ||
        lead?.transaction_id,
    )

    if (!transactionId) {
      setSelectedLeadId(leadId)
      setLeadWorkspaceTab('offers')
      setMessage('Open this buyer lead, accept or create an offer, then Bridge can create the transaction and send buyer onboarding.')
      navigate(`/pipeline/leads/${leadId}`)
      return
    }

    const leadActionId = `lead:${leadId}:buyer-onboarding`
    try {
      setCanonicalOfferActionId(leadActionId)
      const onboardingEmail = await invokeEdgeFunction('send-email', {
        body: {
          type: 'client_onboarding',
          transactionId,
          source: 'buyer_lead_table',
          deliveryMode: normalizeClientIntakePreference(
            lead?.clientIntakePreference ||
            linkedTransaction?.transaction?.client_intake_preference ||
            linkedTransaction?.transaction?.routing_profile_json?.clientIntakePreference,
          ),
        },
      })
      const onboardingEmailError = onboardingEmail?.error || onboardingEmail?.data?.error
      if (onboardingEmailError) {
        throw typeof onboardingEmailError === 'string'
          ? new Error(onboardingEmailError)
          : onboardingEmailError
      }
      await recordBuyerLeadActivity({
        organisationId,
        leadId,
        activityType: 'Buyer Onboarding Sent',
        activityNote: onboardingEmail?.data?.manualHandoff
          ? `Buyer onboarding prepared for transaction ${transactionId} using ${getClientIntakePreferenceLabel(
              lead?.clientIntakePreference ||
              linkedTransaction?.transaction?.client_intake_preference ||
              linkedTransaction?.transaction?.routing_profile_json?.clientIntakePreference,
            )}.`
          : `Buyer onboarding sent for transaction ${transactionId}.`,
        outcome: 'Sent',
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      }).catch(() => null)
      setMessage(onboardingEmail?.data?.manualHandoff
        ? `${getClientIntakePreferenceLabel(
            lead?.clientIntakePreference ||
            linkedTransaction?.transaction?.client_intake_preference ||
            linkedTransaction?.transaction?.routing_profile_json?.clientIntakePreference,
          )} onboarding was prepared.`
        : 'Buyer onboarding was sent.')
      setError('')
      await reloadRecords(organisationId)
    } catch (sendError) {
      setError(sendError?.message || 'Unable to send buyer onboarding right now.')
    } finally {
      setCanonicalOfferActionId('')
    }
  }

  function updateFinanceReadinessField(field, value) {
    setFinanceReadinessForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleSaveFinanceReadinessDraft(event) {
    event?.preventDefault?.()
    if (!selectedLead || selectedLeadIsSeller) return
    const transactionId = normalizeText(selectedLeadLinkedTransactionId)
    if (!transactionId) {
      setError('Create or link a transaction before saving finance readiness.')
      return
    }

    setIsFinanceReadinessSaving(true)
    try {
      await saveFinanceReadinessDraft({
        transactionId,
        purchaserType: selectedLeadLinkedTransaction?.transaction?.purchaser_type || 'individual',
        input: financeReadinessForm,
        existingFormData: selectedLeadFinanceFormData,
      })
      await recordBuyerLeadActivity({
        organisationId,
        leadId: selectedLead.leadId,
        activityType: 'Finance Readiness Updated',
        activityNote: 'Buyer finance readiness draft was saved.',
        outcome: 'Readiness saved',
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      }).catch(() => null)
      setMessage('Finance readiness draft saved.')
      setError('')
      setSelectedLeadOffersRefreshTick((value) => value + 1)
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save finance readiness right now.')
    } finally {
      setIsFinanceReadinessSaving(false)
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
      const persistedLead = await ensureBuyerLeadPersistedForLifecycle(selectedLead, selectedLeadContact)
      await createCanonicalOffer({
        organisationId,
        buyerLeadId: normalizeText(persistedLead?.leadId || selectedLead.leadId),
        buyerContactId: normalizeText(persistedLead?.contactId || selectedLead.contactId),
        listingId: normalizeText(offerLinkForm.listingId || selectedLead.listingId),
        agentId: currentAgent.id,
        status: 'draft',
        offerAmount: Number(selectedLead.estimatedValue || selectedLead.budget || 0) || null,
        financeType: selectedLead.financeType || selectedLead.preferredFinanceType || '',
        conditionsJson: {
          agentName: normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName || currentAgent.email),
          agentEmail: normalizeText(selectedLead?.assignedAgentEmail || currentAgent.email).toLowerCase(),
          clientIntakePreference: normalizeClientIntakePreference(offerLinkForm.clientIntakePreference),
          agentReviewUrl: typeof window !== 'undefined'
            ? `${window.location.origin}/pipeline/leads/${encodeURIComponent(normalizeText(persistedLead?.leadId || selectedLead.leadId))}`
            : '',
        },
      }, {
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      })
      setError('')
      setMessage('Offer draft created. Buyer lead stage updated to Offer Draft.')
      setLeadWorkspaceTab('offers')
      await reloadRecords(organisationId)
    } catch (offerError) {
      setError(offerError?.message || 'Unable to create offer draft.')
    }
  }

  function handleBuyerCommandSendListings() {
    setLeadWorkspaceTab('properties')
    const buyerEmail = normalizeText(selectedLeadContact?.email || selectedLead?.email)
    if (buyerEmail && selectedLeadBuyerRecommendations.length && typeof window !== 'undefined') {
      const recommendations = selectedLeadBuyerRecommendations
        .slice(0, 3)
        .map((property) => `${property.title} - ${property.price} - ${property.area}`)
        .join('\n')
      window.location.href = `mailto:${encodeURIComponent(buyerEmail)}?subject=${encodeURIComponent('Recommended properties')}&body=${encodeURIComponent(recommendations)}`
      return
    }
    setMessage('Recommended listings are open in the Properties workspace.')
  }

  function handleBuyerCommandConvertToTransaction() {
    if (selectedLeadAcceptedOffer) {
      void handleLeadCanonicalOfferConversion(selectedLeadAcceptedOffer)
      return
    }
    setLeadWorkspaceTab('offers')
    setMessage('An accepted offer is required before converting this buyer to a transaction.')
  }

  function handleBuyerJourneyQuickActivity(activityType) {
    setLeadWorkspaceTab('activity')
    setActivityComposerMode('activity')
    setActivityForm((previous) => ({
      ...previous,
      activityType,
      activityNote: normalizeText(previous.activityNote) || `${activityType} with ${selectedLeadDisplayName}`,
    }))
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

  function handleCopySelectedLeadLink() {
    if (!selectedLead) return
    const leadId = normalizeText(selectedLead.leadId)
    const fallbackPath = `/pipeline/leads/${leadId}`
    const link = typeof window !== 'undefined' ? `${window.location.origin}${fallbackPath}` : fallbackPath
    if (typeof navigator !== 'undefined') void navigator.clipboard?.writeText(link)
    setLeadActionsMenuOpen(false)
    setMessage('Lead link copied.')
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
    const leadForDelete = records.leads.find((row) => normalizeLeadIdentityKey(row?.leadId || row?.id) === leadIdentityKey) || null
    const targetOrganisationId = normalizeText(organisationId || leadForDelete?.organisationId)
    if (!targetOrganisationId) throw new Error('A resolved workspace is required before deleting a lead.')
    setError('')
    try {
      await deleteAgencyCrmLeadRecord(targetOrganisationId, leadId)
      if (resolveLeadCategoryView(leadForDelete) === 'seller') {
        const sellerWorkflowIds = [
          leadId,
          normalizeText(leadId).replace(/^lead_/i, ''),
          leadForDelete?.sellerWorkflowLeadId,
          leadForDelete?.sellerLeadId,
          leadForDelete?.originatingCrmLeadId,
        ].map(normalizeLeadIdentityKey).filter(Boolean)
        for (const sellerWorkflowId of [...new Set(sellerWorkflowIds)]) {
          deleteSellerWorkflowRecord(sellerWorkflowId, { removeLinkedListings: false })
        }
      }
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
        <section className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'New Leads', value: metrics.newLeads, detail: `${leadPageSummary.newThisWeek} this week`, compare: '↑ 12% vs yesterday', icon: UserRound, tone: 'text-[#315f8f] bg-[#edf5ff]' },
            { label: 'Need Attention', value: leadOperationalSummary.needAttention, detail: `${leadOperationalSummary.overdue} overdue`, compare: leadOperationalSummary.overdue ? 'Action required' : 'Clear', icon: AlertTriangle, tone: 'text-[#8a641d] bg-[#fff7e8]' },
            { label: 'Follow-Ups Today', value: metrics.followUpsDueToday, detail: 'Ready for action', compare: 'Operational queue', icon: CheckSquare, tone: 'text-[#405b75] bg-[#f5f8fc]' },
            { label: 'Overdue', value: metrics.overdueTasks, detail: metrics.overdueTasks ? 'Needs attention' : 'No blockers', compare: metrics.overdueTasks ? 'Prioritize first' : 'Healthy', icon: Clock3, tone: 'text-[#9a4038] bg-[#fff5f4]' },
            { label: 'Converted MTD', value: leadOperationalSummary.convertedMtd || metrics.dealsCreated, detail: `${metrics.activeOpportunities} active`, compare: 'Month to date', icon: TrendingUp, tone: 'text-[#26724c] bg-[#effaf3]' },
          ].map((metric) => {
            const Icon = metric.icon
            return (
              <article key={metric.label} className="group min-w-0 rounded-[14px] border border-[#e4ebf2] bg-white/90 px-3 py-2.5 shadow-[0_10px_24px_rgba(24,45,68,0.045)] backdrop-blur transition duration-200 hover:border-[#cddbe9]">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{metric.label}</span>
                  <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] ${metric.tone}`}>
                    <Icon size={14} />
                  </span>
                </div>
                <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
                  <strong className="block text-[1.55rem] font-semibold leading-none tracking-[-0.04em] text-[#102236] tabular-nums">{metric.value}</strong>
                  <span className="truncate text-[0.68rem] font-semibold text-[#6f8398]">{metric.compare}</span>
                </div>
                <p className="mt-1 truncate text-[0.74rem] font-medium text-[#667b92]">{metric.detail}</p>
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
          <section className="min-w-0 rounded-[16px] border border-[#e4ebf2] bg-white/90 p-2.5 shadow-[0_10px_26px_rgba(24,45,68,0.045)] backdrop-blur">
            <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
              <label className="flex min-h-[38px] min-w-0 flex-1 items-center gap-2.5 rounded-[12px] border border-[#dbe6f1] bg-[#f8fbfe] px-3 transition focus-within:border-[#9db7cf] focus-within:bg-white">
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
                <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056] outline-none transition hover:border-[#c7d6e5]" value={leadFilter.source} onChange={(event) => setLeadFilter((previous) => ({ ...previous, source: event.target.value }))}>
                  <option value="all">All Sources</option>
                  {availableLeadSources.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056] outline-none transition hover:border-[#c7d6e5]" value={leadFilter.stage} onChange={(event) => setLeadFilter((previous) => ({ ...previous, stage: event.target.value }))}>
                  <option value="all">All Stages</option>
                  {LEAD_STAGES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {isPrincipal ? (
                  <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056] outline-none transition hover:border-[#c7d6e5]" value={leadFilter.agent} onChange={(event) => setLeadFilter((previous) => ({ ...previous, agent: event.target.value }))}>
                    <option value="all">All Agents</option>
                    {agentOptions.map((agent) => (
                      <option key={`${agent.id}:${agent.email}`} value={agent.id || agent.email}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select className="min-h-[38px] rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056] outline-none transition hover:border-[#c7d6e5]" value={leadFilter.sort} onChange={(event) => setLeadFilter((previous) => ({ ...previous, sort: event.target.value }))}>
                  <option value="newest">Sort: Newest</option>
                  <option value="next_follow_up">Sort: Next Follow-up</option>
                  <option value="stage">Sort: Stage</option>
                </select>
                <button
                  type="button"
                  className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#405b75] transition hover:border-[#c7d6e5] hover:bg-[#f8fbfe]"
                  onClick={() => setLeadFilter({ ...DEFAULT_LEAD_FILTER })}
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
            <article className="flex max-h-[calc(100dvh-15rem)] min-h-[520px] min-w-0 flex-col overflow-hidden rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white shadow-[0_16px_42px_rgba(15,23,42,0.045)]">
              <div className="border-b border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-3 py-3 sm:px-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Lead Pipeline</p>
                    <h3 className="mt-0.5 text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">
                      {leadTypeViewTitle}
                    </h3>
                    <p className="mt-0.5 text-[0.78rem] font-medium text-[#60758b]">
                      {leadPageSummary.filtered} visible · {metrics.followUpsDueToday} follow-ups today
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="inline-flex items-center rounded-[12px] border border-[#dbe4ee] bg-[#f6f9fc] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                    <button
                      type="button"
                      onClick={() => setPipelineViewMode('table')}
                      className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-semibold transition ${
                        pipelineViewMode === 'table' ? 'bg-white text-[#163247] shadow-[0_8px_18px_rgba(24,45,68,0.12)]' : 'text-[#51667f] hover:text-[#1f4f78]'
                      }`}
                    >
                      <Table2 size={13} />
                      Table
                    </button>
                    <button
                      type="button"
                      onClick={() => setPipelineViewMode('kanban')}
                      className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-semibold transition ${
                        pipelineViewMode === 'kanban' ? 'bg-white text-[#163247] shadow-[0_8px_18px_rgba(24,45,68,0.12)]' : 'text-[#51667f] hover:text-[#1f4f78]'
                      }`}
                    >
                      <Columns3 size={13} />
                      Kanban
                    </button>
                  </div>
                  <div className="inline-flex items-center rounded-[12px] border border-[#dbe4ee] bg-white p-0.5 shadow-[0_8px_18px_rgba(24,45,68,0.045)]">
                    {[
                      ['all', 'All Leads', leadCategoryCounts.all],
                      ['buyer', 'Buyer Leads', leadCategoryCounts.buyer],
                      ['seller', 'Seller Leads', leadCategoryCounts.seller],
                      ['other', 'Other', leadCategoryCounts.other],
                    ].map(([key, label, count]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setLeadTypeView(key)}
                        className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold transition ${
                          leadTypeView === key ? 'bg-[#163247] text-white shadow-[0_8px_18px_rgba(22,50,71,0.18)]' : 'text-[#51667f] hover:text-[#1f4f78]'
                        }`}
                      >
                        {label} <span className="tabular-nums opacity-75">{count}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="inline-flex min-h-[34px] items-center justify-center rounded-[12px] border border-[#dbe4ee] bg-white px-3 text-[#405b75] transition hover:border-[#c7d6e5] hover:bg-[#f8fbfe]" aria-label="More lead actions">
                    <MoreHorizontal size={17} />
                  </button>
                  </div>
                </div>
              </div>
              {!isLeadWorkspaceRoute ? (
                <div className="shrink-0 border-b border-[rgba(15,23,42,0.06)] bg-white/95 px-3 py-2 backdrop-blur sm:px-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-[0.78rem]">
                    {(leadTypeView === 'seller'
                      ? [
                          ['Seller Leads', sellerJourneyMetrics.sellerLeads],
                          ['Valuations', sellerJourneyMetrics.valuationsScheduled],
                          ['Completed', sellerJourneyMetrics.valuationsCompleted],
                          ['Mandates Sent', sellerJourneyMetrics.mandatesSent],
                          ['Mandates Signed', sellerJourneyMetrics.mandatesSigned],
                          ['Listings Live', sellerJourneyMetrics.listingsLive],
                        ]
                      : [
                          ['Leads', leadOperationalSummary.total],
                          ['Need Attention', leadOperationalSummary.needAttention],
                          ['Overdue', leadOperationalSummary.overdue],
                          ['New Today', leadOperationalSummary.newToday],
                          ['Converted MTD', leadOperationalSummary.convertedMtd],
                        ]).map(([label, value]) => (
                      <div key={label} className="flex items-baseline gap-1.5">
                        <span className="font-semibold tabular-nums text-[#102236]">{value}</span>
                        <span className="font-medium text-[#73879c]">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {pipelineViewMode === 'kanban' ? (
                <div className="min-h-0 max-w-full flex-1 overflow-x-auto pb-2">
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
                              const leadProspect = canvassingProspectById.get(normalizeText(lead?.canvassingProspectId))
                              const leadContact = resolveLeadContactSnapshot(
                                lead,
                                contactById.get(normalizeText(lead?.contactId)),
                                leadProspect,
                              )
                              const leadTasks = leadTasksByLeadId.get(leadId) || []
                              const leadActivities = leadActivitiesByLeadId.get(leadId) || []
                              const linkedDeal = linkedDealByLeadId.get(leadId)
                              const latestActivity = [...leadActivities]
                                .sort((a, b) => new Date(b?.activityDate || b?.createdAt || 0) - new Date(a?.activityDate || a?.createdAt || 0))[0]
                              const lastActivityLabel = formatDateShort(latestActivity?.activityDate || latestActivity?.createdAt || lead?.updatedAt || lead?.createdAt)
                              const nextStep = resolveLeadNextStep(lead, leadTasks)
                              const clientName = resolveLeadDisplayName(lead, leadContact, leadProspect, 'Unnamed lead')
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
                                        {leadCategoryLabelForView(lead)}
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
              <div className="hidden min-h-0 max-w-full flex-1 overflow-auto overscroll-contain lg:block">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead className="sticky top-0 z-[1] h-[42px] border-b border-[rgba(15,23,42,0.06)] bg-[#FCFCFD] text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="w-[42px] px-3 py-3"><span className="sr-only">Select</span></th>
                      <th className="w-[31%] px-3 py-3">Lead</th>
                      <th className="w-[23%] px-3 py-3">Opportunity</th>
                      <th className="w-[20%] px-3 py-3">Pipeline</th>
                      <th className="w-[26%] px-3 py-3">Owner & Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(15,23,42,0.06)] bg-white">
                    {leadTableRows.length ? (
                      leadTableRows.map((lead) => {
                        const leadProspect = canvassingProspectById.get(normalizeText(lead?.canvassingProspectId))
                        const leadContact =
                          resolveLeadContactSnapshot(
                            lead,
                            contactById.get(normalizeText(lead.contactId)),
                            leadProspect,
                          )
                        const leadId = normalizeLeadIdentityKey(lead?.leadId)
                        const linkedAppointment = records.appointments
                          .filter((row) => normalizeLeadIdentityKey(row?.leadId) === leadId)
                          .sort((a, b) => new Date(b?.dateTime || b?.createdAt || 0) - new Date(a?.dateTime || a?.createdAt || 0))[0]
                        const linkedTransaction = records.deals
                          .filter((row) => normalizeLeadIdentityKey(row?.leadId) === leadId)
                          .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0]
                        const leadTasks = leadTasksByLeadId.get(leadId) || []
                        const leadActivities = leadActivitiesByLeadId.get(leadId) || []
                        const isSeller = resolveLeadCategoryView(lead) === 'seller'
                        const funnelStage = resolveLeadFunnelStage(lead)
                        const nextStep = resolveLeadNextStep(lead, leadTasks)
                        const latestActivity = [...leadActivities]
                          .sort((a, b) => new Date(b?.activityDate || b?.createdAt || 0) - new Date(a?.activityDate || a?.createdAt || 0))[0]
                        const activityReference = latestActivity?.activityDate || latestActivity?.createdAt || linkedAppointment?.updatedAt || linkedAppointment?.dateTime || lead?.updatedAt || lead?.createdAt
                        const lastActivityLabel = formatDateShort(activityReference)
                        const assignedAgent = normalizeText(lead?.assignedAgentName || lead?.assignedAgentEmail || 'Unassigned')
                        const agentColor = getAgentKanbanColor(lead?.assignedAgentId || lead?.assignedAgentEmail || assignedAgent)
                        const leadName = resolveLeadDisplayName(lead, leadContact, leadProspect, 'Unnamed lead')
                        const isActive = normalizeLeadIdentityKey(selectedLeadId) === leadId && isLeadWorkspaceRoute
                        const categoryMeta = getLeadCategoryMeta(lead, leadContact)
                        const statusMeta = getLeadStatusMeta(lead, funnelStage)
                        const linkedListing = resolveLeadLinkedListing(lead)
                        const sellerAppointments = isSeller
                          ? records.appointments.filter((row) => normalizeLeadIdentityKey(row?.leadId || row?.relatedEntityId) === leadId)
                          : []
                        const sellerJourney = isSeller
                          ? buildSellerJourney({ lead, contact: leadContact || {}, appointments: sellerAppointments, listing: linkedListing })
                          : null
                        const sellerReadiness = isSeller
                          ? buildSellerReadinessSummary({ lead, contact: leadContact || {}, appointments: sellerAppointments, listing: linkedListing, journey: sellerJourney })
                          : null
                        const sellerStageLabel = sellerJourney?.status?.summary || sellerJourney?.stage?.label || 'Contacted'
                        const sellerPropertyLabel = sellerJourney?.kpis?.find((item) => item.key === 'property')?.value || normalizeText(lead?.sellerPropertyAddress || lead?.propertyInterest) || 'Property not captured'
                        const sellerEstimatedValue = sellerJourney?.kpis?.find((item) => item.key === 'estimated_value')?.value || 0
                        const sellerEstimatedLabel = sellerEstimatedValue ? formatCurrency(sellerEstimatedValue) : 'Value not captured'
                        const sellerValuationLabel = sellerJourney?.valuationStatus || 'Not scheduled'
                        const sellerMandateLabel = sellerJourney?.kpis?.find((item) => item.key === 'mandate')?.value || 'Not started'
                        const sellerListingLabel = sellerJourney?.kpis?.find((item) => item.key === 'listing')?.value || 'Not created'
                        const sellerDaysInStageLabel = `${sellerJourney?.daysInCurrentStage || 0} days`
                        const sellerReadinessLabel = sellerReadiness?.readinessLabel || 'Review seller'
                        const sellerNextActionLabel = sellerReadiness?.nextAction?.label || 'Review seller journey'
                        const opportunity = getLeadOpportunityPreview(lead, linkedTransaction, isSeller, linkedListing)
                        const actionMeta = getLeadNextActionMeta(lead, leadTasks, linkedAppointment, nextStep)
                        const latestActivityTitle = normalizeText(latestActivity?.activityType || latestActivity?.activityNote || linkedAppointment?.title)
                        const leadPhone = normalizeText(leadContact?.phone || lead?.phone)
                        const leadEmail = normalizeText(leadContact?.email || lead?.email)
                        const whatsappPhone = leadPhone.replace(/[^\d+]/g, '').replace(/^\+/, '')
                        const activityTimeLabel = formatRelativeTime(activityReference)
                        const quickActionButtonClass = 'inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-transparent bg-transparent text-slate-400 transition hover:border-slate-200 hover:bg-white hover:text-slate-800'

                        return (
                          <tr
                            key={lead.leadId}
                            className={`group min-h-[112px] cursor-pointer text-slate-700 transition-all duration-200 hover:bg-[#f8fbff] hover:shadow-[0_8px_22px_rgba(15,23,42,0.035)] ${isActive ? 'bg-[#f2f7ff]' : 'bg-white'}`}
                            onClick={() => {
                              setSelectedLeadId(lead.leadId)
                              navigate(`/pipeline/leads/${lead.leadId}`)
                            }}
                          >
                            <td className="px-3 py-4 align-top" onClick={(event) => event.stopPropagation()}>
                              <input type="checkbox" className="h-4 w-4 rounded-[5px] border-slate-300 text-[#2563eb] shadow-sm focus:ring-2 focus:ring-[#dbeafe]" aria-label={`Select ${leadName}`} />
                            </td>
                            <td className="px-3 py-4 align-top">
                              <div className="flex min-w-0 items-start gap-3">
                                <span
                                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[0.72rem] font-bold text-white shadow-[0_8px_18px_rgba(24,45,68,0.12)] ring-1 ring-white/70"
                                  style={{ backgroundImage: `linear-gradient(135deg, ${agentColor}, #1f4f78)` }}
                                >
                                  {getInitials(leadName)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <p className="min-w-0 break-words text-[14px] font-semibold leading-5 text-slate-950">{leadName}</p>
                                    <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.08em] ${categoryMeta.className}`}>
                                      {categoryMeta.label}
                                    </span>
                                  </div>
                                  <div className="mt-1 grid min-w-0 gap-1 text-[12px] font-medium text-slate-500">
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <Phone size={12} className="shrink-0 text-slate-400" />
                                      <span className="min-w-0 break-all">{leadPhone || 'No phone'}</span>
                                    </span>
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <Mail size={12} className="shrink-0 text-slate-400" />
                                      <span className="min-w-0 break-all">{leadEmail || 'No email'}</span>
                                    </span>
                                  </div>
                                  <p className="mt-2 text-[0.7rem] font-medium leading-4 text-slate-400">
                                    {lead.leadSource || 'Manual'} • {formatDateShort(lead?.createdAt)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-4 align-top">
                              {isSeller ? (
                                <div className="grid min-w-0 gap-2">
                                  <div className="flex min-w-0 items-start gap-2.5">
                                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#edf7f0] text-[#2d7a52]">
                                      <Home size={16} />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="break-words text-[13px] font-semibold leading-5 text-slate-950">{sellerPropertyLabel}</p>
                                      <p className="mt-0.5 text-[12px] font-semibold text-[#1f4f78]">{sellerStageLabel}</p>
                                      <p className="mt-0.5 text-[12px] font-medium text-slate-500">{sellerEstimatedLabel}</p>
                                    </div>
                                  </div>
                                  <div className="grid gap-1 text-[11px] font-semibold text-slate-500">
                                    <span>Valuation: <span className="text-slate-800">{sellerValuationLabel}</span></span>
                                    <span>Mandate: <span className="text-slate-800">{sellerMandateLabel}</span></span>
                                    <span>Listing: <span className="text-slate-800">{sellerListingLabel}</span></span>
                                  </div>
                                </div>
                              ) : opportunity.hasListing ? (
                                <div className="flex min-w-0 items-start gap-2.5">
                                  <div className="relative grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-slate-200 bg-slate-100" style={{ backgroundImage: `linear-gradient(135deg, ${agentColor}1f, #f8fafc 72%)` }}>
                                    <Home size={16} className="text-slate-400" />
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
                                  <div className="min-w-0 flex-1">
                                    <p className="break-words text-[13px] font-semibold leading-5 text-slate-950">{opportunity.title}</p>
                                    {opportunity.price ? <p className="mt-0.5 text-[12px] font-semibold text-[#1f4f78]">{opportunity.price}</p> : null}
                                    <p className="mt-0.5 break-words text-[12px] font-medium leading-4 text-slate-500">{opportunity.specs || 'Property details pending'}</p>
                                    <p className="mt-0.5 break-words text-[11px] font-medium leading-4 text-slate-400">{opportunity.subtitle}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex min-w-0 items-start gap-2.5">
                                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-400">
                                    <ImageIcon size={15} />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="break-words text-[13px] font-semibold text-slate-700">No listing assigned</p>
                                    <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#1f4f78]">Assign listing <ArrowUpRight size={12} /></p>
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-4 align-top">
                              {isSeller ? (
                                <div className="grid min-w-0 gap-3">
                                  <div>
                                    <span className="inline-flex rounded-full border border-[#cfe4d8] bg-[#edf8f1] px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.08em] text-[#237348]">
                                      {sellerStageLabel}
                                    </span>
                                    <p className="mt-1.5 text-[11px] font-medium leading-4 text-slate-400">
                                      Next: {sellerNextActionLabel}
                                    </p>
                                  </div>
                                  <div className="rounded-[14px] border border-[#dbe7f2] bg-[#fbfdff] px-3 py-2.5">
                                    <p className="text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Seller readiness</p>
                                    <div className="mt-2 grid gap-1.5">
                                      {[
                                        ['Readiness', sellerReadinessLabel],
                                        ['Property', sellerPropertyLabel],
                                        ['Estimated', sellerEstimatedLabel],
                                        ['Valuation', sellerValuationLabel],
                                        ['Mandate', sellerMandateLabel],
                                        ['Listing', sellerListingLabel],
                                        ['Days in stage', sellerDaysInStageLabel],
                                      ].map(([label, value]) => (
                                        <div key={label} className="flex min-w-0 items-center justify-between gap-2 text-[12px]">
                                          <span className="font-medium text-slate-500">{label}</span>
                                          <span className="min-w-0 truncate font-semibold text-slate-800" title={String(value)}>{value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                              <div className="grid min-w-0 gap-3">
                                <div>
                                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.08em] ${statusMeta.className}`}>{statusMeta.label}</span>
                                  <div className="mt-1.5 flex items-center gap-1" aria-label={`${statusMeta.label} lead score ${statusMeta.score} out of 5`}>
                                    {Array.from({ length: 5 }).map((_, dotIndex) => (
                                      <span key={`${lead.leadId}:score:${dotIndex}`} className={`h-1.5 w-1.5 rounded-full ${dotIndex < statusMeta.score ? statusMeta.dotClassName : 'bg-slate-200'}`} />
                                    ))}
                                  </div>
                                  <p className="mt-1 text-[11px] font-medium leading-4 text-slate-400">Stage {statusMeta.score}/5 · {funnelStage}</p>
                                </div>
                                <div className="rounded-[14px] border border-[#dbe7f2] bg-[#fbfdff] px-3 py-2.5">
                                  <p className="text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Next action</p>
                                  <p className="mt-1 break-words text-[13px] font-semibold leading-5 text-slate-950">{actionMeta.title}</p>
                                  <div className="mt-1 flex min-w-0 items-center gap-2">
                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${actionMeta.meta.toLowerCase().includes('overdue') ? 'bg-[#d96b5f]' : actionMeta.meta.toLowerCase().includes('today') ? 'bg-[#d79d3f]' : 'bg-[#35a66d]'}`} />
                                    <p className="min-w-0 break-words text-[12px] font-semibold text-slate-500">{actionMeta.meta}</p>
                                  </div>
                                </div>
                              </div>
                              )}
                            </td>
                            <td className="px-3 py-4 align-top">
                              <div className="grid min-w-0 gap-3">
                                <div className="flex min-w-0 items-start gap-2.5">
                                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.68rem] font-bold text-white shadow-sm" style={{ backgroundColor: agentColor }}>{getInitials(assignedAgent)}</span>
                                  <div className="min-w-0">
                                    <p className="break-words text-[13px] font-semibold leading-5 text-slate-800">{assignedAgent}</p>
                                    <p className="text-[11px] font-medium text-slate-400">Agent</p>
                                  </div>
                                </div>
                                <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                                    <Clock3 size={12} className="shrink-0 text-slate-400" />
                                    {activityTimeLabel}
                                  </p>
                                  <p className="mt-1 break-words text-[12px] font-medium leading-4 text-slate-500">{latestActivityTitle || lastActivityLabel}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-1" onClick={(event) => event.stopPropagation()}>
                                  {leadPhone ? (
                                    <a href={`tel:${leadPhone}`} className={quickActionButtonClass} aria-label={`Call ${leadName}`} title="Call">
                                      <Phone size={14} />
                                    </a>
                                  ) : null}
                                  {whatsappPhone ? (
                                    <a href={`https://wa.me/${whatsappPhone}`} target="_blank" rel="noreferrer" className={quickActionButtonClass} aria-label={`WhatsApp ${leadName}`} title="WhatsApp">
                                      <MessageCircle size={14} />
                                    </a>
                                  ) : null}
                                  {leadEmail ? (
                                    <a href={`mailto:${leadEmail}`} className={quickActionButtonClass} aria-label={`Email ${leadName}`} title="Email">
                                      <Mail size={14} />
                                    </a>
                                  ) : null}
                                  <button
                                    type="button"
                                    className={quickActionButtonClass}
                                    aria-label={`${isSeller ? 'Open seller journey' : 'Book viewing'} for ${leadName}`}
                                    title={isSeller ? 'Open Seller Journey' : 'Book Viewing'}
                                    onClick={() => {
                                      setSelectedLeadId(lead.leadId)
                                      setLeadWorkspaceTab(isSeller ? 'listing_journey' : 'appointments')
                                      navigate(`/pipeline/leads/${lead.leadId}`)
                                    }}
                                  >
                                    <CalendarDays size={14} />
                                  </button>
                                  {!isSeller ? (
                                    <button
                                      type="button"
                                      className={quickActionButtonClass}
                                      aria-label={`Generate OTP for ${leadName}`}
                                      title="Generate OTP"
                                      onClick={() => {
                                        setSelectedLeadId(lead.leadId)
                                        setLeadWorkspaceTab('offers')
                                        navigate(`/pipeline/leads/${lead.leadId}`)
                                      }}
                                    >
                                      <CheckSquare size={14} />
                                    </button>
                                  ) : null}
                                  {!isSeller ? (
                                    <button
                                      type="button"
                                      className="inline-flex min-h-7 items-center justify-center rounded-[9px] border border-[#cfe0ef] bg-white px-2 text-[0.68rem] font-semibold text-[#1f4f78] transition hover:border-[#9fc0dd] hover:bg-[#f2f8fd] disabled:cursor-not-allowed disabled:opacity-55"
                                      disabled={canonicalOfferActionId === `lead:${leadId}:buyer-onboarding`}
                                      aria-label={`Send buyer onboarding for ${leadName}`}
                                      title="Send Buyer Onboarding"
                                      onClick={() => void handleSendBuyerOnboardingFromLeadRow(lead, linkedTransaction)}
                                    >
                                      Buyer Onboarding
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className={quickActionButtonClass}
                                    aria-label={`Open ${leadName}`}
                                    title="Open Lead"
                                    onClick={() => {
                                      setSelectedLeadId(lead.leadId)
                                      navigate(`/pipeline/leads/${lead.leadId}`)
                                    }}
                                  >
                                    <ArrowUpRight size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className={quickActionButtonClass}
                                    aria-label={`More actions for ${leadName}`}
                                    title="More"
                                    onClick={() => openArchiveLeadModal(lead.leadId)}
                                  >
                                    <MoreHorizontal size={15} />
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td className="px-6 py-12" colSpan={5}>
                          <div className="mx-auto max-w-md rounded-[18px] border border-dashed border-slate-200 bg-[#fbfdff] px-6 py-8 text-center">
                            <div className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] bg-[#edf4fb] text-[#35546c]">
                              <UserRound size={21} />
                            </div>
                            <h4 className="mt-4 text-[1rem] font-semibold tracking-[-0.02em] text-slate-900">
                              {leadPageSummary.total > 0
                                ? 'No leads match these filters'
                                : `No ${leadTypeViewTitle.toLowerCase()} yet`}
                            </h4>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                              {leadPageSummary.total > 0
                                ? 'Clear the search or filters to show the leads already in this pipeline.'
                                : leadTypeView === 'seller'
                                ? 'Create your first seller lead manually or convert a canvassing prospect when they are ready to sell.'
                                : leadTypeView === 'buyer'
                                  ? 'Create your first buyer lead manually or connect listings to start capturing enquiries automatically.'
                                  : leadTypeView === 'other'
                                    ? 'Leads that cannot be classified as buyer or seller will appear here.'
                                    : 'Create your first lead manually or connect enquiry sources to start capturing leads automatically.'}
                            </p>
                            <button
                              type="button"
                              className="mt-5 inline-flex min-h-[38px] items-center justify-center gap-2 rounded-[12px] bg-[#163247] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,50,71,0.16)]"
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
                    const leadProspect = canvassingProspectById.get(normalizeText(lead?.canvassingProspectId))
                    const leadContact =
                      resolveLeadContactSnapshot(
                        lead,
                        contactById.get(normalizeText(lead.contactId)),
                        leadProspect,
                      )
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
                    const isSeller = resolveLeadCategoryView(lead) === 'seller'
                    const linkedListingLabel = normalizeText(lead?.listingId || lead?.propertyInterest || lead?.sellerPropertyAddress)
                    const interestedListing = isSeller
                      ? linkedListingLabel || 'Property not linked yet'
                      : linkedListingLabel || normalizeText(linkedTransaction?.title) || 'No listing selected yet'
                    const funnelStage = resolveLeadFunnelStage(lead)
                    const nextStep = resolveLeadNextStep(lead, leadTasks)
                    const activityReference = latestActivity?.activityDate || latestActivity?.createdAt || linkedAppointment?.updatedAt || linkedAppointment?.dateTime || lead?.updatedAt || lead?.createdAt
                    const assignedAgent = normalizeText(lead?.assignedAgentName || lead?.assignedAgentEmail || 'Unassigned')
                    const agentColor = getAgentKanbanColor(lead?.assignedAgentId || lead?.assignedAgentEmail || assignedAgent)
                    const leadName = resolveLeadDisplayName(lead, leadContact, leadProspect, 'Unnamed lead')
                    const nextStepStatus = getNextStepStatus(leadTasks)

                    return (
                      <article
                        key={`mobile-${lead.leadId}`}
                        className="rounded-[16px] border border-[#e1e8f0] bg-white p-3 shadow-[0_10px_24px_rgba(24,45,68,0.055)]"
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
                              <h4 className="truncate text-[0.95rem] font-semibold text-[#142132]">{leadName}</h4>
                              <p className="mt-0.5 truncate text-[0.8rem] font-medium text-[#60758b]">{interestedListing}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold ${getLeadStageTone(funnelStage)}`}>
                            {funnelStage}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 border-l-2 border-[#dbe7f2] pl-3">
                          <div>
                            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Next Action</p>
                            <p className="mt-0.5 truncate text-[0.86rem] font-semibold text-[#2d4560]">{nextStep}</p>
                            <span className={`mt-0.5 inline-flex items-center gap-1.5 text-[0.7rem] font-semibold ${nextStepStatus.text}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${nextStepStatus.tone}`} />
                              {nextStepStatus.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Owner</p>
                              <p className="mt-0.5 truncate text-[0.78rem] font-medium text-[#2d4560]">{assignedAgent}</p>
                            </div>
                            <div>
                              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Activity</p>
                              <p className="mt-0.5 truncate text-[0.78rem] font-medium text-[#2d4560]">{formatRelativeTime(activityReference)}</p>
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
                      {leadPageSummary.total > 0
                        ? 'No leads match these filters'
                        : `No ${leadTypeViewTitle.toLowerCase()} yet`}
                    </h4>
                    <p className="mt-2 text-sm leading-6 text-[#60758b]">
                      {leadPageSummary.total > 0 ? 'Clear the search or filters to show the leads already in this pipeline.' : 'Create your first lead to start building the pipeline.'}
                    </p>
                  </div>
                )}
              </div>
              </>
              )}
            </article>
            ) : null}

            {isLeadWorkspaceRoute ? (
            <article className="mx-auto w-full max-w-[1680px] space-y-6">
              <section className="overflow-hidden rounded-[30px] border border-[#dbe7f2] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_18px_48px_rgba(31,54,78,0.07)]">
                {selectedLead && !selectedLeadIsSeller ? (
                  <div className="bg-white px-4 py-4 sm:px-6 sm:py-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        className="inline-flex items-center text-sm font-semibold text-[#60758b] transition hover:text-[#163247]"
                        onClick={() => navigate('/pipeline/leads')}
                      >
                        ← Back to Leads
                      </button>
                    </div>
                    <div className="rounded-[20px] border border-[#dce7f2] bg-white p-5 shadow-[0_10px_30px_rgba(31,54,78,0.045)] sm:p-6">
                      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(520px,1.25fr)] xl:items-center">
                        <div className="flex min-w-0 items-center gap-5">
                          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[#0b2b4c] text-[1.45rem] font-semibold text-white shadow-[0_12px_24px_rgba(11,43,76,0.18)]">
                            {getInitials(selectedLeadDisplayName)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h1 className="truncate text-[2rem] font-semibold leading-tight text-[#102033]" title={selectedLeadDisplayName}>
                                {selectedLeadDisplayName}
                              </h1>
                              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 px-0" title="Edit buyer details" onClick={() => setLeadWorkspaceTab('overview')}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-[#60758b]">
                              <span>{selectedLead?.areaInterest || selectedLeadPropertyLabel || 'Area pending'}</span>
                              <span className="h-1 w-1 rounded-full bg-[#c8d4e0]" />
                              <span>Buyer Lead</span>
                              <span className="h-1 w-1 rounded-full bg-[#c8d4e0]" />
                              <span className="inline-flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-[#14a06f]" />
                                Last Active {formatRelativeTime(selectedLeadLastActiveAt)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          {[
                            ['Buyer Score', selectedLeadBuyerScore, selectedLeadBuyerScore >= 80 ? 'High Potential' : selectedLeadBuyerScore >= 62 ? 'Qualified' : 'Needs Nurture', Gauge],
                            ['Budget Range', selectedLeadBuyerBudgetLabel, selectedLeadBuyerBudgetLabel === 'Not captured' ? 'Needs capture' : 'Active band', Home],
                            ['Saved Searches', leadAppointmentOfferListingOptions.length || selectedLeadViewingAppointments.length || 0, 'Active signals', Bookmark],
                            ['Match Score', `${selectedLeadBuyerMatchScore}%`, selectedLeadBuyerMatchScore >= 86 ? 'Strong fit' : 'Good fit', TrendingUp],
                            ['Urgency', selectedLeadBuyerUrgency, selectedLeadBuyerUrgency === 'High' ? 'Act now' : 'Monitor', Zap],
                          ].map(([label, value, descriptor, Icon]) => (
                            <div key={label} className="min-h-[96px] rounded-[16px] border border-[#e6eef7] bg-[#fbfdff] p-4 shadow-[0_8px_18px_rgba(31,54,78,0.025)]">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-[12px] font-semibold text-[#526b84]">{label}</p>
                                {createElement(Icon, { className: 'h-4 w-4 text-[#2f6fb3]' })}
                              </div>
                              <p className="mt-3 truncate text-[24px] font-semibold leading-none text-[#102033]" title={String(value)}>{value}</p>
                              <p className="mt-2 truncate text-[12px] font-medium text-[#6d839b]">{descriptor}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-6 grid gap-4 border-t border-[#e5edf6] pt-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {[
                            ['Phone', selectedLeadContact?.phone || selectedLead?.phone || 'No phone', Phone],
                            ['Email', selectedLeadContact?.email || selectedLead?.email || 'No email', Mail],
                            ['Assigned Agent', selectedLeadAssignedAgentLabel, UserRound],
                            ['Lead Source', selectedLead?.leadSource || 'Not captured', MessageCircle],
                          ].map(([label, value, Icon]) => (
                            <div key={label} className="flex min-w-0 items-center gap-3">
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#f1f6fb] text-[#315b7a]">
                                {createElement(Icon, { className: 'h-4 w-4' })}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#20364c]" title={String(value)}>{value}</p>
                                <p className="mt-0.5 text-[12px] font-medium text-[#6d839b]">{label}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                          <a
                            href={normalizeText(selectedLeadContact?.phone || selectedLead?.phone) ? `tel:${selectedLeadContact?.phone || selectedLead?.phone}` : undefined}
                            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#d2dfec] bg-white px-4 text-sm font-semibold text-[#20364c] shadow-sm transition hover:border-[#aebfd0] ${normalizeText(selectedLeadContact?.phone || selectedLead?.phone) ? '' : 'pointer-events-none opacity-50'}`}
                          >
                            <Phone className="h-4 w-4" />
                            Schedule Call
                          </a>
                          <Button type="button" variant="secondary" size="sm" className="min-h-10 rounded-[12px]" onClick={() => handleOpenAppointmentModal()}>
                            <CalendarDays className="h-4 w-4" />
                            Schedule Viewing
                          </Button>
                          <Button type="button" variant="secondary" size="sm" className="min-h-10 rounded-[12px]" onClick={handleBuyerCommandSendListings}>
                            <Send className="h-4 w-4" />
                            Send Listings
                          </Button>
                          <div className="relative">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="min-h-10 rounded-[12px]"
                              onClick={() => setLeadActionsMenuOpen((value) => !value)}
                              aria-haspopup="menu"
                              aria-expanded={leadActionsMenuOpen}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              More
                            </Button>
                            {leadActionsMenuOpen ? (
                              <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-[18px] border border-[#dbe7f2] bg-white py-2 shadow-[0_18px_40px_rgba(18,44,68,0.16)]" role="menu">
                                {[
                                  {
                                    label: selectedLeadBuyerOnboardingActionLabel,
                                    Icon: Mail,
                                    disabled: canonicalOfferActionId === `lead:${selectedLead?.leadId}:buyer-onboarding`,
                                    onClick: () => {
                                      setLeadActionsMenuOpen(false)
                                      void handleSendBuyerOnboardingFromLead()
                                    },
                                  },
                                  {
                                    label: 'Copy Lead Link',
                                    Icon: Link2,
                                    onClick: handleCopySelectedLeadLink,
                                  },
                                  {
                                    label: 'Archive Lead',
                                    Icon: X,
                                    onClick: () => {
                                      setLeadActionsMenuOpen(false)
                                      openArchiveLeadModal(selectedLead.leadId)
                                    },
                                  },
                                  {
                                    label: 'Delete Lead',
                                    Icon: Trash2,
                                    tone: 'text-[#b42318]',
                                    onClick: () => {
                                      setLeadActionsMenuOpen(false)
                                      openDeleteLeadModal(selectedLead.leadId)
                                    },
                                  },
                                ].map(({ label, Icon, onClick, disabled, tone = 'text-[#29435d]' }) => (
                                  <button
                                    key={label}
                                    type="button"
                                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold transition hover:bg-[#f5f9fc] disabled:cursor-not-allowed disabled:opacity-45 ${tone}`}
                                    onClick={onClick}
                                    disabled={disabled}
                                    role="menuitem"
                                  >
                                    {createElement(Icon, { className: 'h-4 w-4' })}
                                    {label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <Button type="button" size="sm" className="min-h-10 rounded-[12px] bg-[#0b2b4c] px-5 shadow-[0_12px_24px_rgba(11,43,76,0.18)] hover:bg-[#08243f]" onClick={handleBuyerCommandConvertToTransaction}>
                            Convert To Transaction
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                <>
	                <div className="px-5 py-5 sm:px-7 sm:py-6 lg:px-8">
	                  <div className="space-y-5">
	                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
	                      <div className="shrink-0">
	                        <button
	                          type="button"
	                          className="inline-flex items-center text-sm font-semibold text-[#60758b] transition hover:text-[#163247]"
	                          onClick={() => navigate('/pipeline/leads')}
	                        >
	                          ← Back to Leads
	                        </button>
	                      </div>

	                      {selectedLead ? (
	                        <div className="grid w-full grid-cols-2 gap-2 xl:w-auto xl:grid-cols-[repeat(6,max-content)] xl:justify-end">
	                          {selectedLeadIsSeller ? (
	                            <>
	                              <Button type="button" size="sm" className="w-full bg-[#123955] shadow-[0_10px_24px_rgba(18,57,85,0.18)] xl:w-auto" onClick={handleCreateListingFromSellerLead}>
	                                {selectedLeadMandateSigned ? 'Convert to Listing' : 'Create Listing'}
	                              </Button>
	                              <Button
	                                type="button"
	                                variant="secondary"
	                                size="sm"
	                                className="hidden w-full xl:inline-flex xl:w-auto"
	                                onClick={handleSendSellerOnboarding}
	                                disabled={isSellerOnboardingSending}
	                              >
	                                {selectedLeadSellerOnboardingActionLabel}
	                              </Button>
	                              <Button type="button" variant="secondary" size="sm" className="hidden w-full xl:inline-flex xl:w-auto" onClick={handleScheduleSellerAppointment}>
	                                Schedule
	                              </Button>
	                              <Button
	                                type="button"
	                                variant="secondary"
	                                size="sm"
	                                className="hidden w-full xl:inline-flex xl:w-auto"
	                                onClick={() => void handleSelectedLeadMandatePrimaryAction()}
	                                disabled={selectedLeadMandateActionDisabled}
	                                title={selectedLeadMandateActionTitle}
	                              >
	                                {isMandateGenerating
	                                  ? 'Generating…'
	                                  : isMandateSending
	                                    ? 'Sending…'
	                                    : selectedLeadMandateActionState.label}
	                              </Button>
	                            </>
	                          ) : (
	                            <>
	                              <Button
	                                type="button"
	                                size="sm"
	                                className="w-full bg-[#123955] shadow-[0_10px_24px_rgba(18,57,85,0.18)] xl:w-auto"
	                                onClick={() => void handleCreateBuyerOfferDraft()}
	                                disabled={Boolean(selectedLead.convertedTransactionId || selectedLead.convertedDealId)}
	                              >
	                                {selectedLead.convertedTransactionId || selectedLead.convertedDealId ? 'Transaction Created' : 'Create Offer'}
	                              </Button>
	                              <Button
	                                type="button"
	                                variant="secondary"
	                                size="sm"
	                                className="hidden w-full xl:inline-flex xl:w-auto"
	                                onClick={() => void handleSendBuyerOnboardingFromLead()}
	                                disabled={canonicalOfferActionId === `lead:${selectedLead?.leadId}:buyer-onboarding`}
	                              >
	                                {selectedLeadBuyerOnboardingActionLabel}
	                              </Button>
	                              <Button type="button" variant="secondary" size="sm" className="hidden w-full xl:inline-flex xl:w-auto" onClick={() => handleOpenAppointmentModal()}>
	                                Schedule
	                              </Button>
	                            </>
	                          )}
	                          <div className="relative">
	                            <Button
	                              type="button"
	                              variant="secondary"
	                              size="sm"
	                              className="w-full xl:w-auto"
	                              onClick={() => setLeadActionsMenuOpen((value) => !value)}
	                              aria-haspopup="menu"
	                              aria-expanded={leadActionsMenuOpen}
	                            >
	                              Actions
	                              <ChevronDown className="h-4 w-4" />
	                            </Button>
	                            {leadActionsMenuOpen ? (
	                              <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-[18px] border border-[#dbe7f2] bg-white py-2 shadow-[0_18px_40px_rgba(18,44,68,0.16)]" role="menu">
	                                {[
	                                  ...(selectedLeadIsSeller
	                                    ? [
	                                        {
	                                          label: selectedLeadSellerOnboardingActionLabel,
	                                          Icon: Mail,
	                                          tone: 'text-[#29435d]',
	                                          mobileOnly: true,
	                                          disabled: isSellerOnboardingSending,
	                                          onClick: () => {
	                                            setLeadActionsMenuOpen(false)
	                                            void handleSendSellerOnboarding()
	                                          },
	                                        },
	                                        {
	                                          label: 'Schedule',
	                                          Icon: CalendarDays,
	                                          tone: 'text-[#29435d]',
	                                          mobileOnly: true,
	                                          onClick: () => {
	                                            setLeadActionsMenuOpen(false)
	                                            handleScheduleSellerAppointment()
	                                          },
	                                        },
	                                        {
	                                          label: selectedLeadMandateActionState.label,
	                                          Icon: CheckSquare,
	                                          tone: 'text-[#29435d]',
	                                          mobileOnly: true,
	                                          disabled: selectedLeadMandateActionDisabled,
	                                          onClick: () => {
	                                            if (selectedLeadMandateActionDisabled) return
	                                            setLeadActionsMenuOpen(false)
	                                            void handleSelectedLeadMandatePrimaryAction()
	                                          },
	                                        },
	                                      ]
	                                    : [
	                                        {
	                                          label: selectedLeadBuyerOnboardingActionLabel,
	                                          Icon: Mail,
	                                          tone: 'text-[#29435d]',
	                                          mobileOnly: true,
	                                          disabled: canonicalOfferActionId === `lead:${selectedLead?.leadId}:buyer-onboarding`,
	                                          onClick: () => {
	                                            setLeadActionsMenuOpen(false)
	                                            void handleSendBuyerOnboardingFromLead()
	                                          },
	                                        },
	                                        {
	                                          label: 'Schedule',
	                                          Icon: CalendarDays,
	                                          tone: 'text-[#29435d]',
	                                          mobileOnly: true,
	                                          onClick: () => {
	                                            setLeadActionsMenuOpen(false)
	                                            handleOpenAppointmentModal()
	                                          },
	                                        },
	                                      ]),
	                                  {
	                                    label: 'Archive Lead',
	                                    Icon: X,
	                                    tone: 'text-[#29435d]',
	                                    onClick: () => {
	                                      setLeadActionsMenuOpen(false)
	                                      openArchiveLeadModal(selectedLead.leadId)
	                                    },
	                                  },
	                                  {
	                                    label: 'Delete Lead',
	                                    Icon: Trash2,
	                                    tone: 'text-[#b42318]',
	                                    onClick: () => {
	                                      setLeadActionsMenuOpen(false)
	                                      openDeleteLeadModal(selectedLead.leadId)
	                                    },
	                                  },
	                                  {
	                                    label: 'Change Owner',
	                                    Icon: UserRound,
	                                    tone: 'text-[#29435d]',
	                                    onClick: () => {
	                                      setLeadActionsMenuOpen(false)
	                                      setMessage('Owner changes can be managed from lead assignment settings.')
	                                    },
	                                  },
	                                  {
	                                    label: 'Mark as Lost',
	                                    Icon: X,
	                                    tone: 'text-[#29435d]',
	                                    onClick: () => {
	                                      setLeadActionsMenuOpen(false)
	                                      openArchiveLeadModal(selectedLead.leadId)
	                                    },
	                                  },
	                                  {
	                                    label: 'Convert Status',
	                                    Icon: TrendingUp,
	                                    tone: 'text-[#29435d]',
	                                    onClick: () => {
	                                      setLeadActionsMenuOpen(false)
	                                      setMessage('Use the stage selector in Lead Summary to convert this lead status.')
	                                    },
	                                  },
	                                  {
	                                    label: 'Copy Lead Link',
	                                    Icon: Link2,
	                                    tone: 'text-[#29435d]',
	                                    onClick: handleCopySelectedLeadLink,
	                                  },
	                                ].map(({ label, Icon, tone, onClick, disabled, mobileOnly }) => (
	                                  <button
	                                    key={label}
	                                    type="button"
	                                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold transition hover:bg-[#f5f9fc] disabled:cursor-not-allowed disabled:opacity-45 ${tone} ${mobileOnly ? 'xl:hidden' : ''}`}
	                                    onClick={onClick}
	                                    disabled={disabled}
	                                    role="menuitem"
	                                  >
	                                    {createElement(Icon, { className: 'h-4 w-4' })}
	                                    {label}
	                                  </button>
	                                ))}
	                              </div>
	                            ) : null}
	                          </div>
	                          <Button type="button" variant="ghost" size="sm" className="hidden h-10 w-10 px-0 xl:inline-flex" title="More lead actions" onClick={() => openDeleteLeadModal(selectedLead.leadId)}>
	                            <MoreHorizontal className="h-4 w-4" />
	                          </Button>
	                        </div>
	                      ) : null}
	                    </div>

	                    <div className="min-w-0">
	                      {selectedLead ? (
	                        <>
	                          <h1 className="max-w-full truncate text-[1.875rem] font-bold leading-tight tracking-[-0.035em] text-[#102033] sm:text-[2.25rem] lg:text-[2.5rem]" title={selectedLeadDisplayName}>
	                            {selectedLeadDisplayName}
	                          </h1>
	                          <div className="mt-2 flex flex-wrap items-center gap-2">
	                            <span className="rounded-full bg-[#edf4fb] px-2.5 py-1 text-[0.72rem] font-semibold text-[#244f70]">
	                              {selectedLeadIsSeller ? 'Seller Lead' : 'Buyer Lead'}
	                            </span>
	                            <span className="rounded-full bg-[#eef8f2] px-2.5 py-1 text-[0.72rem] font-semibold text-[#247345]">
	                              {selectedLeadEffectiveLifecycleStage}
	                            </span>
	                          </div>
	                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium text-[#60758b]">
	                            <span className="inline-flex min-w-0 items-center gap-2">
	                              <Home className="h-4 w-4 shrink-0 text-[#8aa0b7]" />
	                              <span className="truncate">{selectedLeadPropertyLabel}</span>
	                            </span>
	                            <span className="hidden h-1 w-1 rounded-full bg-[#c8d4e0] sm:block" />
	                            <span className="inline-flex min-w-0 items-center gap-2">
	                              <UserRound className="h-4 w-4 shrink-0 text-[#8aa0b7]" />
	                              <span className="truncate">{selectedLeadAssignedAgentLabel}</span>
	                            </span>
	                            <span className="hidden h-1 w-1 rounded-full bg-[#c8d4e0] sm:block" />
	                            <span>{selectedLeadIsSeller ? 'Seller relationship' : 'Buyer relationship'}</span>
	                          </div>
	                        </>
	                      ) : (
	                        <h1 className="text-[1.875rem] font-bold leading-tight tracking-[-0.035em] text-[#102033] sm:text-[2.25rem] lg:text-[2.5rem]">
	                          Lead Workspace
	                        </h1>
	                      )}
	                    </div>
	                  </div>

                  {selectedLead ? (
                    <div className="mt-6 grid overflow-hidden rounded-[22px] border border-[#dbe7f2] bg-[#fbfdff] sm:grid-cols-2 xl:grid-cols-4">
                      {(selectedLeadIsSeller
                        ? (selectedSellerReadiness.kpis || selectedSellerJourney.workspaceKpis || selectedSellerJourney.kpis).slice(0, 4).map((item, index) => [
                            item.label,
                            item.type === 'currency' ? formatCurrency(item.value) : item.suffix ? `${item.value} ${item.suffix}` : item.value,
                            [Home, TrendingUp, CheckSquare, Columns3][index] || Home,
                          ])
                        : [
                            ['Activities', selectedLeadUnifiedTimeline.length, MessageCircle],
                            ['Appointments', selectedLeadAppointments.length, CalendarDays],
                            ['Offers', selectedLeadOfferSummary.total, CheckSquare],
                            ['Lead Health', `${selectedLeadWorkflowHealth.percent}%`, TrendingUp],
                          ]).map(([label, value, Icon]) => (
                        <div key={label} className="flex items-center gap-3 border-b border-[#e2ebf4] px-4 py-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-white text-[#315b7a] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
	                            {createElement(Icon, { className: 'h-4 w-4' })}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[0.7rem] font-semibold uppercase text-[#7d93aa]">{label}</p>
                            <p className="mt-0.5 truncate text-[1.35rem] font-semibold tracking-[-0.04em] text-[#102033]" title={String(value)}>{value}</p>
                          </div>
                          {!selectedLeadIsSeller && label === 'Lead Health' ? (
                            <div className="ml-auto h-10 w-10 shrink-0 rounded-full bg-[conic-gradient(#2f7b9e_var(--lead-health),#e2ebf4_0)] p-1" style={{ '--lead-health': `${selectedLeadWorkflowHealth.percent}%` }}>
                              <div className="h-full w-full rounded-full bg-white" />
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                {selectedLead ? (
                  <div className="overflow-x-auto border-t border-[#e3ebf4] bg-[#fbfdff]" role="tablist" aria-label="Lead workspace sections">
                    <div className="grid min-w-[640px] grid-cols-4">
                      {(selectedLeadIsSeller ? [
                        { key: 'overview', label: 'Overview', meta: '' },
                        { key: 'activity', label: 'Timeline', meta: selectedLeadUnifiedTimeline.length },
                        { key: 'documents', label: 'Documents', meta: '' },
                        { key: 'listing_journey', label: 'Listing Journey', meta: '' },
                      ] : [
                        { key: 'overview', label: 'Overview', meta: '' },
                        { key: 'activity', label: 'Timeline', meta: selectedLeadUnifiedTimeline.length },
                        { key: 'appointments', label: 'Appointments', meta: selectedLeadAppointments.length },
                        { key: 'offers', label: 'Offers', meta: selectedLeadOfferSummary.total },
                      ]).map((tab) => {
                        const isActive = leadWorkspaceTab === tab.key
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setLeadWorkspaceTab(tab.key)}
                            role="tab"
                            aria-selected={isActive}
                            className={`relative flex min-h-[64px] items-center justify-center gap-2 whitespace-nowrap px-4 text-sm transition ${
                              isActive
                                ? 'font-semibold text-[#123955]'
                                : 'font-medium text-[#60758b] hover:text-[#163247]'
                            }`}
                          >
                            <span>{tab.label}</span>
                            {tab.meta !== '' ? (
                              <span className={`rounded-full px-2 py-0.5 text-[0.72rem] ${isActive ? 'bg-[#e8f2fb] text-[#1f5f8a]' : 'bg-white text-[#8aa0b7]'}`}>{tab.meta}</span>
                            ) : null}
                            <span className={`absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-[#2f7b9e] transition ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
                </>
                )}
              </section>
              {selectedLead && !selectedLeadIsSeller ? (
                <>
                  <section className="rounded-[20px] border border-[#dce7f2] bg-white p-5 shadow-[0_10px_30px_rgba(31,54,78,0.045)] sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-[18px] font-semibold uppercase tracking-[0.08em] text-[#102033]">Deal Journey</h2>
                      <span className="rounded-full border border-[#d8e5f1] bg-[#fbfdff] px-3 py-1 text-[12px] font-semibold text-[#60758b]">
                        {selectedLeadEffectiveLifecycleStage || 'Lead captured'}
                      </span>
                    </div>
                    <div className="mt-6 overflow-x-auto pb-2">
                      <div className="grid min-w-[820px] grid-cols-6 items-start">
                        {selectedLeadBuyerJourneyStages.map((stage, index) => {
                          const isSelected = buyerJourneyActionStage === stage.key
                          const isCompleted = stage.state === 'completed'
                          const isCurrent = stage.state === 'current'
                          return (
                            <button
                              key={stage.key}
                              type="button"
                              className="group relative flex min-w-0 flex-col items-center gap-3 px-2 text-center"
                              onClick={() => setBuyerJourneyActionStage(stage.key)}
                            >
                              {index > 0 ? <span className={`absolute right-1/2 top-[17px] h-0.5 w-full ${isCompleted ? 'bg-[#1f6feb]' : 'bg-[#d7e1ec]'}`} /> : null}
                              <span className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border-2 bg-white transition ${
                                isCompleted
                                  ? 'border-[#1f6feb] bg-[#1f6feb] text-white'
                                  : isCurrent
                                    ? 'border-[#1f6feb] text-[#1f6feb] ring-4 ring-[#e8f2ff]'
                                    : 'border-[#cfd9e6] text-[#7d91a8]'
                              } ${isSelected ? 'shadow-[0_0_0_5px_rgba(31,111,235,0.08)]' : ''}`}>
                                {isCompleted ? <CheckSquare className="h-4 w-4" /> : stage.key === 'transaction' ? <ArrowUpRight className="h-4 w-4" /> : <span className="h-2.5 w-2.5 rounded-full bg-current" />}
                              </span>
                              <span className="min-w-0">
                                <span className={`block truncate text-sm font-semibold ${isCurrent || isCompleted ? 'text-[#123955]' : 'text-[#60758b]'}`}>{stage.label}</span>
                                <span className="mt-1 block truncate text-[12px] font-medium text-[#7d91a8]">{stage.detail}</span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="mt-5 rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">Stage Actions</p>
                          <h3 className="mt-1 text-base font-semibold text-[#18324b]">
                            {selectedLeadBuyerJourneyStages.find((stage) => stage.key === buyerJourneyActionStage)?.label || 'Qualification'}
                          </h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {buyerJourneyActionStage === 'contacted' ? (
                            <>
                              <Button type="button" size="sm" onClick={() => void handleUpdateLeadStage(selectedLead.leadId, 'Contacted', { successMessage: 'Buyer marked as contacted.' })}>Mark Reached Out</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => handleBuyerJourneyQuickActivity('Call')}>Log Call</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => handleBuyerJourneyQuickActivity('WhatsApp')}>Log WhatsApp</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => handleBuyerJourneyQuickActivity('Email')}>Log Email</Button>
                            </>
                          ) : buyerJourneyActionStage === 'viewing' ? (
                            <>
                              <Button type="button" size="sm" onClick={() => handleOpenAppointmentModal()}>Schedule Viewing</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => setLeadWorkspaceTab('activity')}>Manage Viewings</Button>
                            </>
                          ) : buyerJourneyActionStage === 'offer' ? (
                            <>
                              <Button type="button" size="sm" onClick={() => void handleCreateBuyerOfferDraft()}>Create Offer</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => setLeadWorkspaceTab('offers')}>View Offers</Button>
                            </>
                          ) : buyerJourneyActionStage === 'transaction' ? (
                            <>
                              <Button type="button" size="sm" onClick={handleBuyerCommandConvertToTransaction}>Convert To Transaction</Button>
                              {selectedLeadLinkedTransactionId ? (
                                <Button type="button" size="sm" variant="secondary" onClick={() => navigate(`/transactions/${selectedLeadLinkedTransactionId}`)}>Open Transaction</Button>
                              ) : null}
                            </>
                          ) : buyerJourneyActionStage === 'qualification' ? (
                            <>
                              <Button type="button" size="sm" onClick={() => void handleUpdateLeadStage(selectedLead.leadId, 'Qualified', { successMessage: 'Buyer marked as qualified.' })}>Mark Qualified</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => setLeadWorkspaceTab('overview')}>Update Brief</Button>
                            </>
                          ) : (
                            <>
                              <Button type="button" size="sm" onClick={() => void handleUpdateLeadStage(selectedLead.leadId, 'Contacted', { successMessage: 'Buyer journey started.' })}>Start Outreach</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => handleBuyerJourneyQuickActivity('Call')}>Log Call</Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr_0.9fr]">
                    <div className="rounded-[20px] border border-[#dce7f2] bg-white p-5 shadow-[0_10px_30px_rgba(31,54,78,0.045)]">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-[18px] font-semibold text-[#102033]">Next Best Action</h2>
                        <Zap className="h-4 w-4 text-[#1f6feb]" />
                      </div>
                      <div className="mt-4 rounded-[16px] border border-[#dceafe] bg-[#f8fbff] p-4">
                        <p className="text-sm font-semibold text-[#18324b]">
                          {selectedLeadOpenActions.nextDueAction?.label || selectedLeadFinanceReadinessSummary.nextRecommendedAction || 'Keep buyer momentum warm'}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[#60758b]">
                          {selectedLeadOpenActions.nextDueAction?.meta ||
                            selectedLeadFinanceInsights.recommendations?.[0] ||
                            'Review the buyer brief, send matching listings, or schedule the next viewing.'}
                        </p>
                      </div>
                      <div className="mt-4 grid gap-2">
                        {[
                          ['Call Buyer', Phone, () => {
                            const phone = normalizeText(selectedLeadContact?.phone || selectedLead?.phone).replace(/[^\d+]/g, '')
                            if (phone && typeof window !== 'undefined') window.location.href = `tel:${phone}`
                          }],
                          ['Schedule Viewing', CalendarDays, () => handleOpenAppointmentModal()],
                          ['Send Listings', Send, handleBuyerCommandSendListings],
                          ['Create Task', CheckSquare, () => {
                            setLeadWorkspaceTab('activity')
                            setActivityComposerMode('task')
                          }],
                        ].map(([label, Icon, onClick]) => (
                          <button
                            key={label}
                            type="button"
                            className="flex w-full items-center gap-3 rounded-[12px] border border-[#dbe6f2] bg-white px-3 py-2.5 text-left text-sm font-semibold text-[#20364c] transition hover:border-[#b9cade] hover:bg-[#fbfdff]"
                            onClick={onClick}
                          >
                            {createElement(Icon, { className: 'h-4 w-4 text-[#315b7a]' })}
                            <span className="min-w-0 flex-1">{label}</span>
                            <ChevronRight className="h-4 w-4 text-[#9aacbf]" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-[#dce7f2] bg-white p-5 shadow-[0_10px_30px_rgba(31,54,78,0.045)]">
                      <h2 className="text-[18px] font-semibold text-[#102033]">Buyer Intelligence</h2>
                      <div className="mt-4 grid overflow-hidden rounded-[16px] border border-[#e4edf6] sm:grid-cols-2">
                        {[
                          ['Budget', selectedLeadBuyerBudgetLabel, Home],
                          ['Financing', selectedLeadFinanceReadinessSummary.confidenceLabel || selectedLead?.financeType || 'Not captured', CheckSquare],
                          ['Property Type', selectedLead?.propertyInterest || 'House, Townhouse', Home],
                          ['Bedrooms', selectedLead?.bedrooms || '3+', BedDouble],
                          ['Preferred Areas', selectedLead?.areaInterest || selectedLeadPropertyLabel || 'Not captured', Columns3],
                          ['Urgency', selectedLeadBuyerUrgency, Zap],
                          ['Match Score', `${selectedLeadBuyerMatchScore}%`, TrendingUp],
                        ].map(([label, value, Icon]) => (
                          <div key={label} className="flex min-h-[74px] items-center gap-3 border-b border-[#e4edf6] px-4 py-3 even:sm:border-l last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[12px] ${label === 'Urgency' ? getBuyerUrgencyClassName(selectedLeadBuyerUrgency) : 'bg-[#eef5fb] text-[#315b7a]'}`}>
                              {createElement(Icon, { className: 'h-4 w-4' })}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold text-[#60758b]">{label}</p>
                              <p className="mt-1 truncate text-sm font-semibold text-[#20364c]" title={String(value)}>{value}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-[#dce7f2] bg-white p-5 shadow-[0_10px_30px_rgba(31,54,78,0.045)]">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-[18px] font-semibold text-[#102033]">Recent Activity</h2>
                        <button type="button" className="text-xs font-semibold text-[#1f6feb]" onClick={() => setLeadWorkspaceTab('activity')}>View all</button>
                      </div>
                      <div className="mt-4 space-y-1">
                        {selectedLeadUnifiedTimeline.slice(0, 4).length ? selectedLeadUnifiedTimeline.slice(0, 4).map((item) => {
                          const presentation = getLeadActivityPresentation(`${item.sourceLabel} ${item.title} ${item.sourceType}`)
                          const ActivityIcon = presentation.Icon
                          return (
                            <button key={item.id} type="button" className="flex w-full items-start gap-3 rounded-[14px] px-2 py-3 text-left transition hover:bg-[#f8fbff]" onClick={() => setLeadWorkspaceTab('activity')}>
                              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${presentation.rail}`}>
                                <ActivityIcon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-[#20364c]">{item.title}</span>
                                <span className="mt-0.5 block truncate text-xs text-[#60758b]">{item.description || item.sourceLabel}</span>
                              </span>
                              <span className="shrink-0 text-xs font-medium text-[#7d91a8]">{formatRelativeTime(item.timestamp || item.dueDate)}</span>
                            </button>
                          )
                        }) : (
                          <div className="rounded-[14px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] p-5 text-sm text-[#6a8098]">
                            No recent activity yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="overflow-x-auto rounded-[20px] border border-[#dce7f2] bg-white shadow-[0_10px_30px_rgba(31,54,78,0.045)]" role="tablist" aria-label="Buyer workspace sections">
                    <div className="grid min-w-[880px] grid-cols-7">
                      {[
                        { key: 'overview', label: 'Overview', meta: '' },
                        { key: 'properties', label: 'Properties', meta: selectedLeadBuyerRecommendations.length },
                        { key: 'activity', label: 'Activities', meta: selectedLeadUnifiedTimeline.length },
                        { key: 'documents', label: 'Documents', meta: '' },
                        { key: 'offers', label: 'Offers', meta: selectedLeadOfferSummary.total },
                        { key: 'insights', label: 'Insights', meta: '' },
                        { key: 'mapping', label: 'Mapping', meta: '' },
                      ].map((tab) => {
                        const isActive = resolveBuyerWorkspaceTabKey(leadWorkspaceTab) === tab.key
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setLeadWorkspaceTab(tab.key)}
                            role="tab"
                            aria-selected={isActive}
                            className={`relative flex min-h-[64px] items-center justify-center gap-2 whitespace-nowrap px-4 text-sm transition ${
                              isActive ? 'font-semibold text-[#123955]' : 'font-medium text-[#60758b] hover:text-[#163247]'
                            }`}
                          >
                            <span>{tab.label}</span>
                            {tab.meta !== '' ? (
                              <span className={`rounded-full px-2 py-0.5 text-[0.72rem] ${isActive ? 'bg-[#e8f2fb] text-[#1f5f8a]' : 'bg-[#f6f9fc] text-[#8aa0b7]'}`}>{tab.meta}</span>
                            ) : null}
                            <span className={`absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-[#2f7b9e] transition ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                          </button>
                        )
                      })}
                    </div>
                  </section>
                </>
              ) : null}
              {selectedLeadHasSyncIssue ? (
                <section className="flex flex-col gap-4 rounded-[24px] border border-[#f3d7a4] bg-[#fff8ea] px-5 py-4 text-[#5d4618] shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ffe7b4] text-[#9a6416]">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#4f3a13]">Lead sync needs attention</p>
                      <p className="mt-1 text-sm leading-6 text-[#755b25]">
                        This buyer lead is not fully linked to Supabase yet. Viewings, offer portals, and submitted offers will be blocked until the lead is repaired.
                        {selectedLeadSyncError ? ` ${selectedLeadSyncError}` : ''}
                      </p>
                    </div>
                  </div>
                  <Button type="button" variant="secondary" size="sm" className="shrink-0 border-[#e6c984] bg-white text-[#5d4618] hover:bg-[#fffdf7]" onClick={() => void handleRepairSelectedLeadSync()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry Sync
                  </Button>
                </section>
              ) : null}
              {selectedLead ? (
                <div className={`mt-6 grid gap-6 ${leadWorkspaceTab === 'overview' || leadWorkspaceTab === 'activity' ? 'xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]' : ''}`}>
                  <div className="space-y-6">
                  {leadWorkspaceTab === 'overview' ? (
                  <div className="space-y-6">
                    {selectedLeadIsSeller ? (
                      <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.06)] sm:p-8" data-testid="seller-journey-overview">
                        <div className="flex flex-wrap items-start justify-between gap-5">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Seller Journey</p>
                            <h2 className="mt-2 text-[1.45rem] font-semibold tracking-[-0.035em] text-[#102033]">
                              {selectedSellerJourney.status.summary || 'Contacted'}
                            </h2>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60758b]">
                              Stage is derived from seller appointments, mandate state, and linked listing state.
                            </p>
                          </div>
                          <span className="rounded-full border border-[#cfe4d8] bg-[#edf8f1] px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-[#237348]">
                            {selectedSellerJourney.stage.label}
                          </span>
                        </div>

                        <div className="mt-6 grid gap-3 lg:grid-cols-6" data-testid="seller-journey-rail">
                          {selectedSellerJourney.steps.map((step) => (
                            <div
                              key={step.key}
                              className={`rounded-[16px] border px-3 py-3 ${
                                step.state === 'current'
                                  ? 'border-[#87c7a0] bg-[#f0fbf4]'
                                  : step.state === 'completed'
                                    ? 'border-[#d7eadf] bg-[#fbfefc]'
                                    : 'border-[#e1eaf4] bg-[#fbfdff]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${step.state === 'upcoming' ? 'bg-[#cfdbe8]' : 'bg-[#2f9b69]'}`} />
                                <span className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-[#5f7389]">
                                  {step.state === 'current' ? 'Current' : step.state === 'completed' ? 'Completed' : 'Upcoming'}
                                </span>
                              </div>
                              <p className="mt-2 min-h-[38px] text-sm font-semibold leading-5 text-[#203a54]">{step.label}</p>
                              {step.status ? <p className="mt-1 text-xs font-semibold text-[#60758b]">{step.status}</p> : null}
                            </div>
                          ))}
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" data-testid="seller-readiness-card">
                          <div className={`rounded-[18px] border px-4 py-4 ${
                            selectedSellerReadiness.readiness === 'completed'
                              ? 'border-[#cfe4d8] bg-[#edf8f1]'
                              : selectedSellerReadiness.readiness === 'blocked'
                                ? 'border-[#f1d0cb] bg-[#fff5f3]'
                                : selectedSellerReadiness.readiness === 'action_required'
                                  ? 'border-[#f1dcae] bg-[#fff9ed]'
                                  : 'border-[#cfe4d8] bg-[#f4fbf6]'
                          }`}>
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">Readiness</p>
                            <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[#18324b]">{selectedSellerReadiness.readinessLabel}</h3>
                            <p className="mt-2 text-sm leading-6 text-[#60758b]">
                              Next best action: <span className="font-semibold text-[#203a54]">{selectedSellerReadiness.nextAction?.label || 'Review seller journey'}</span>
                            </p>
                          </div>
                          <div className="rounded-[18px] border border-[#e1eaf4] bg-[#fbfdff] px-4 py-4" data-testid="seller-blockers-list">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">Blockers</p>
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#60758b]">{selectedSellerReadiness.blockers.length}</span>
                            </div>
                            <div className="mt-3 grid gap-2">
                              {selectedSellerReadiness.blockers.length ? selectedSellerReadiness.blockers.slice(0, 4).map((blocker) => (
                                <div key={blocker.id} className="flex items-start gap-2 rounded-[12px] border border-[#e6eef7] bg-white px-3 py-2">
                                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${blocker.severity === 'blocked' ? 'bg-[#d96b5f]' : 'bg-[#d79d3f]'}`} />
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[#203a54]">{blocker.label}</p>
                                    <p className="mt-0.5 text-xs text-[#6a8098]">{blocker.category.replace(/_/g, ' ')}</p>
                                  </div>
                                </div>
                              )) : (
                                <p className="rounded-[12px] border border-[#d7eadf] bg-white px-3 py-3 text-sm font-semibold text-[#237348]">No blockers found.</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-7" data-testid="seller-kpi-cards">
                          {(selectedSellerReadiness.kpis || selectedSellerJourney.workspaceKpis || selectedSellerJourney.kpis).map((item) => {
                            const value = item.type === 'currency'
                              ? formatCurrency(item.value)
                              : item.suffix
                                ? `${item.value} ${item.suffix}`
                                : item.value
                            return (
                              <div key={item.key} className="rounded-[16px] border border-[#e6eef7] bg-[#fbfdff] px-3 py-3">
                                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#8496aa]">{item.label}</p>
                                <p className="mt-1 truncate text-sm font-semibold text-[#203a54]" title={String(value)}>{value}</p>
                              </div>
                            )
                          })}
                        </div>

                        {selectedSellerJourney.listingCreated ? (
                          <div className="mt-6 rounded-[18px] border border-[#e1eaf4] bg-[#fbfdff] p-4" data-testid="seller-listing-readiness">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <h3 className="text-base font-semibold text-[#18324b]">Listing Readiness</h3>
                                <p className="mt-1 text-xs text-[#6a8098]">Uses the linked listing fields already captured in Bridge.</p>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-[#315b7a]">
                                {selectedSellerReadiness.listingReadiness.percent}% complete
                              </span>
                            </div>
                            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                              {selectedSellerReadiness.listingReadiness.items.map((item) => (
                                <div key={item.key} className={`rounded-[14px] border px-3 py-3 ${item.complete ? 'border-[#d7eadf] bg-white' : 'border-[#f1dcae] bg-[#fffaf0]'}`}>
                                  <p className="text-sm font-semibold text-[#203a54]">{item.label}</p>
                                  <p className={`mt-1 text-xs font-semibold ${item.complete ? 'text-[#237348]' : 'text-[#9a6416]'}`}>{item.complete ? 'Complete' : 'Incomplete'}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-6 rounded-[18px] border border-[#e1eaf4] bg-[#fbfdff] p-4" data-testid="seller-actions-panel">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h3 className="text-base font-semibold text-[#18324b]">Seller Actions</h3>
                              <p className="mt-1 text-xs text-[#6a8098]">Actions reuse the existing appointment, mandate, listing, and portal flows.</p>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {selectedSellerReadiness.actions.map((action) => (
                              <Button
                                key={action.id}
                                type="button"
                                size="sm"
                                variant={action.primary ? 'primary' : 'secondary'}
                                disabled={action.disabled}
                                title={action.disabled ? action.reason : action.label}
                                onClick={() => handleSellerJourneyAction(action.id)}
                              >
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </section>
                    ) : null}

                    <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.06)] sm:p-8">
                      <div className="flex flex-wrap items-start justify-between gap-6">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Lead Summary</p>
                          <h2 className="mt-2 text-[1.45rem] font-semibold tracking-[-0.035em] text-[#102033]">Relationship Overview</h2>
                        </div>
                        <div className="w-full sm:w-60">
                          <Field
                            as="select"
                            value={LEAD_STAGES.includes(selectedLeadEffectiveLifecycleStage) ? selectedLeadEffectiveLifecycleStage : selectedLead.stage}
                            onChange={(event) => handleUpdateLeadStage(selectedLead.leadId, event.target.value)}
                          >
                            {LEAD_STAGES.map((stage) => (
                              <option key={stage} value={stage}>
                                {stage}
                              </option>
                            ))}
                          </Field>
                        </div>
                      </div>
                      <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
                        {[
                          ['Name', selectedLeadDisplayName],
                          ['Phone', selectedLeadContact?.phone || 'No phone'],
                          ['Email', selectedLeadContact?.email || 'No email'],
                          ['Lead source', selectedLead.leadSource || 'Not captured'],
                          ['Lead channel', selectedLead.leadDirection || 'Not captured'],
                          ['Property', selectedLeadPropertyLabel],
                          ['Budget', selectedLead.budget ? formatCurrency(selectedLead.budget) : 'Not captured'],
                          ['Pipeline value', selectedLead.estimatedValue ? formatCurrency(selectedLead.estimatedValue) : formatCurrency(selectedLead.budget)],
                          ['Lead score', selectedLead.priority || selectedLead.leadScore || 'Standard'],
                          ['Follow up', selectedLeadNextStep || 'No next action'],
                          ['Lifecycle stage', selectedLeadEffectiveLifecycleStage],
                          [
                            'Linked appointment',
                            selectedLeadLinkedAppointment
                              ? `${getAppointmentTypeLabel(selectedLeadLinkedAppointment?.appointmentType) || 'Appointment'} · ${formatDate(selectedLeadLinkedAppointment?.dateTime || selectedLeadLinkedAppointment?.createdAt)}`
                              : 'Not linked yet',
                          ],
                          ['Linked transaction', selectedLeadLinkedTransactionId || 'Not linked yet'],
                        ].map(([label, value]) => (
                          <div key={label} className="border-b border-[#eef3f7] pb-4">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#8aa0b7]">{label}</p>
                            <p className="mt-2 truncate text-[1rem] font-semibold text-[#20364c]" title={String(value)}>
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 grid gap-4 rounded-[20px] bg-[#f8fbfd] p-4 text-sm sm:grid-cols-4">
                        {[
                          ['Status', selectedLeadEffectiveLifecycleStage],
                          ['Last Activity', formatRelativeTime(selectedLeadActivities[0]?.activityDate || selectedLeadActivities[0]?.createdAt || selectedLead.updatedAt || selectedLead.createdAt)],
                          ['Created', formatDate(selectedLead.createdAt)],
                          ['Stage', selectedLeadEffectiveLifecycleStage || 'Not set'],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8aa0b7]">{label}</p>
                            <p className="mt-1 font-semibold text-[#20364c]">{value}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    {selectedLeadShowFinanceReadiness ? (
                      <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.06)] sm:p-8">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Buyer Readiness</p>
                            <h3 className="mt-2 text-[1.35rem] font-semibold tracking-[-0.035em] text-[#102033]">Finance Readiness</h3>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60758b]">
                              Estimate buyer preparedness before the full bond intake moves forward. This is a transaction-readiness view, not a bank decision.
                            </p>
                          </div>
                          <div className="rounded-[20px] border border-[#dbe8f2] bg-[#f8fbff] px-4 py-3 text-right">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Readiness Score</p>
                            <p className="mt-1 text-3xl font-bold tracking-[-0.05em] text-[#102033]">{selectedLeadFinanceReadinessSummary.readinessScore.score}%</p>
                            <p className="text-sm font-semibold text-[#2f6f8f]">{selectedLeadFinanceReadinessSummary.readinessScore.label} Readiness</p>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
                          <div className="grid gap-4 sm:grid-cols-2">
                            {[
                              ['Estimated Affordability', `${formatCurrency(selectedLeadFinanceReadinessSummary.affordabilityEstimate.estimatedPurchaseRangeMin)} - ${formatCurrency(selectedLeadFinanceReadinessSummary.affordabilityEstimate.estimatedPurchaseRangeMax)}`],
                              ['Estimated Monthly Repayment', `~${formatCurrency(selectedLeadFinanceReadinessSummary.repaymentEstimate)}/month`],
                              ['Deposit Position', selectedLeadFinanceReadinessSummary.depositStrength],
                              ['Confidence', selectedLeadFinanceReadinessSummary.confidenceLabel],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] p-4">
                                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#8aa0b7]">{label}</p>
                                <p className="mt-2 text-base font-semibold text-[#20364c]">{value}</p>
                              </div>
                            ))}
                          </div>

                          <div className="rounded-[20px] border border-[#edf2f7] bg-[#fbfdff] p-4">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#8aa0b7]">Transaction Confidence Meter</p>
                            <p className="mt-2 text-4xl font-bold tracking-[-0.05em] text-[#102033]">{selectedLeadTransactionConfidence}%</p>
                            <p className="mt-1 text-sm font-semibold text-[#2f6f8f]">Transaction Confidence</p>
                            <div className="mt-4 grid gap-2 text-xs text-[#60758b]">
                              <span>Estimated approval confidence: {selectedLeadApprovalConfidence.score}% · {selectedLeadApprovalConfidence.probabilityBand}</span>
                              <span>Operational risk: {selectedLeadOperationalRisk.riskScore}% · {selectedLeadOperationalRisk.riskLevel}</span>
                              <span>Velocity: {selectedLeadVelocity.velocityScore}% · {selectedLeadVelocity.expectedApprovalDays}d estimated approval path</span>
                            </div>
                            <div className="my-4 h-px bg-[#e4edf6]" />
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#8aa0b7]">Next Recommended Action</p>
                            <p className="mt-2 text-lg font-semibold text-[#102033]">{selectedLeadFinanceReadinessSummary.nextRecommendedAction}</p>
                            <p className="mt-2 text-sm leading-6 text-[#60758b]">
                              {selectedLeadFinanceInsights.recommendations?.[0] || selectedLeadFinanceInsights.operationalWarnings?.[0] || 'Keep buyer readiness and documents moving.'}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button type="button" size="sm" onClick={handleSaveFinanceReadinessDraft} disabled={!selectedLeadLinkedTransactionId || isFinanceReadinessSaving}>
                                {isFinanceReadinessSaving ? 'Saving...' : 'Save Draft'}
                              </Button>
                              {selectedLeadShowBondReadinessCta ? (
                                <>
                                  <Button type="button" variant="secondary" size="sm" onClick={() => void handleSendBuyerOnboardingFromLead()}>
                                    Send Finance Form
                                  </Button>
                                  <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/bond/pipeline?view=new')}>
                                    Open Bond Workflow
                                  </Button>
                                  <Button type="button" variant="secondary" size="sm" onClick={() => setMessage('Request income proof, bank statements, ID, and deposit confirmation from this buyer.')}>
                                    Request Documents
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <form className="mt-6 rounded-[22px] border border-[#edf2f7] bg-[#fbfdff] p-4" onSubmit={handleSaveFinanceReadinessDraft}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="text-base font-semibold text-[#172b3f]">Bond Readiness Form</h4>
                              <p className="mt-1 text-xs text-[#6d839b]">Lightweight affordability inputs for buyer or agent-assisted completion.</p>
                            </div>
                            <Button type="submit" size="sm" disabled={!selectedLeadLinkedTransactionId || isFinanceReadinessSaving}>
                              {isFinanceReadinessSaving ? 'Saving...' : 'Save Finance Readiness'}
                            </Button>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <Field type="number" placeholder="Monthly income" value={financeReadinessForm.monthlyIncome} onChange={(event) => updateFinanceReadinessField('monthlyIncome', event.target.value)} />
                            <Field type="number" placeholder="Other income" value={financeReadinessForm.otherIncome} onChange={(event) => updateFinanceReadinessField('otherIncome', event.target.value)} />
                            <Field type="number" placeholder="Monthly debt" value={financeReadinessForm.monthlyDebt} onChange={(event) => updateFinanceReadinessField('monthlyDebt', event.target.value)} />
                            <Field type="number" placeholder="Monthly expenses" value={financeReadinessForm.monthlyExpenses} onChange={(event) => updateFinanceReadinessField('monthlyExpenses', event.target.value)} />
                            <Field type="number" placeholder="Deposit available" value={financeReadinessForm.deposit} onChange={(event) => updateFinanceReadinessField('deposit', event.target.value)} />
                            <Field type="number" placeholder="Dependants" value={financeReadinessForm.dependants} onChange={(event) => updateFinanceReadinessField('dependants', event.target.value)} />
                            <Field as="select" value={financeReadinessForm.employmentType} onChange={(event) => updateFinanceReadinessField('employmentType', event.target.value)}>
                              {['Permanent', 'Contract', 'Self-employed', 'Commission', 'Other'].map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </Field>
                            <Field type="number" placeholder="Employment duration months" value={financeReadinessForm.employmentDurationMonths} onChange={(event) => updateFinanceReadinessField('employmentDurationMonths', event.target.value)} />
                            <Field type="number" placeholder="Estimated purchase range" value={financeReadinessForm.estimatedPurchaseRange} onChange={(event) => updateFinanceReadinessField('estimatedPurchaseRange', event.target.value)} />
                          </div>
                        </form>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <div className="rounded-[18px] border border-[#e6f0e8] bg-[#f8fcf9] p-4">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#6b8f78]">Strengths</p>
                            <ul className="mt-3 space-y-2 text-sm text-[#284c38]">
                              {(selectedLeadFinanceReadinessSummary.strengths.length ? selectedLeadFinanceReadinessSummary.strengths : ['Finance readiness inputs are being collected.']).slice(0, 4).map((item) => (
                                <li key={item}>✓ {item}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-[18px] border border-[#f0dfb8] bg-[#fffaf0] p-4">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#9a711c]">Risk Flags</p>
                            <ul className="mt-3 space-y-2 text-sm text-[#6a4b13]">
                              {(selectedLeadFinanceReadinessSummary.riskFlags.length ? selectedLeadFinanceReadinessSummary.riskFlags : ['No finance readiness risks captured yet.']).slice(0, 4).map((item) => (
                                <li key={item}>Attention: {item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <p className="mt-5 rounded-[16px] border border-[#dbe5f0] bg-[#f8fbff] px-4 py-3 text-xs leading-5 text-[#60758b]">
                          {FINANCE_READINESS_DISCLAIMER}
                        </p>
                        <p className="mt-3 rounded-[16px] border border-[#dbe5f0] bg-[#f8fbff] px-4 py-3 text-xs leading-5 text-[#60758b]">
                          {FINANCE_INTELLIGENCE_DISCLAIMER}
                        </p>
                      </section>
                    ) : null}

                    <form className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)] sm:p-8" onSubmit={handleSaveLeadDetails}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-xl font-semibold tracking-[-0.025em] text-[#172b3f]">Editable Details</h4>
                          <p className="mt-1 text-sm text-[#6d839b]">Operational edits stay here, away from the executive summary.</p>
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

                  {leadWorkspaceTab === 'properties' ? (
                  <div className="space-y-6">
                    <section className="rounded-[20px] border border-[#dce7f2] bg-white p-5 shadow-[0_10px_30px_rgba(31,54,78,0.045)] sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-[18px] font-semibold text-[#102033]">Recommended For {selectedLeadContactName}</h2>
                          <p className="mt-1 text-sm text-[#60758b]">Property match and saved-search signals are presented together for fast buyer action.</p>
                        </div>
                        <Button type="button" size="sm" variant="secondary" onClick={handleBuyerCommandSendListings}>
                          <Send className="h-4 w-4" />
                          Send Listings
                        </Button>
                      </div>
                      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {selectedLeadBuyerRecommendations.map((property) => (
                          <article key={property.id} className="overflow-hidden rounded-[16px] border border-[#e0e8f2] bg-white shadow-[0_10px_22px_rgba(31,54,78,0.045)]">
                            <div className="relative aspect-[4/3] overflow-hidden bg-[#edf4fb]">
                              <img src={property.image} alt={property.title} className="h-full w-full object-cover" />
                              <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-[#17643a] shadow-sm">
                                {property.match}% Match
                              </span>
                              <button type="button" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-[#60758b] shadow-sm" title="Save property">
                                <Bookmark className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="p-4">
                              <p className="text-lg font-semibold text-[#102033]">{property.price}</p>
                              <p className="mt-1 truncate text-sm font-medium text-[#60758b]" title={property.area}>{property.area}</p>
                              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-[#29435d]">
                                <span className="inline-flex items-center gap-1"><BedDouble className="h-4 w-4 text-[#7890a8]" />{property.bedrooms}</span>
                                <span className="inline-flex items-center gap-1"><Bath className="h-4 w-4 text-[#7890a8]" />{property.bathrooms}</span>
                                <span className="inline-flex items-center gap-1"><Home className="h-4 w-4 text-[#7890a8]" />{property.parking}</span>
                              </div>
                              <div className="mt-4 flex gap-2">
                                <Button type="button" size="sm" variant="secondary" className="flex-1" onClick={() => handleOpenAppointmentModal()}>
                                  View
                                </Button>
                                {property.id ? (
                                  <Button type="button" size="sm" variant="ghost" className="h-9 px-2" onClick={() => navigate(`/listings/${property.id}`)} title="Open listing">
                                    <ArrowUpRight className="h-4 w-4" />
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[20px] border border-[#dce7f2] bg-white p-5 shadow-[0_10px_30px_rgba(31,54,78,0.045)] sm:p-6">
                      <h2 className="text-[18px] font-semibold text-[#102033]">Saved Searches</h2>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        {(leadAppointmentOfferListingOptions.length ? leadAppointmentOfferListingOptions : selectedLeadBuyerRecommendations).slice(0, 6).map((item) => (
                          <div key={`saved-${item.id}`} className="rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                            <p className="truncate text-sm font-semibold text-[#20364c]" title={item.label || item.title}>{item.label || item.title}</p>
                            <p className="mt-1 text-xs font-medium text-[#7d91a8]">{item.source || 'Recommended'} · {selectedLeadBuyerBudgetLabel}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                  ) : null}

                  {leadWorkspaceTab === 'insights' ? (
                  <div className="space-y-6">
                    <section className="rounded-[20px] border border-[#dce7f2] bg-white p-5 shadow-[0_10px_30px_rgba(31,54,78,0.045)] sm:p-6">
                      <h2 className="text-[18px] font-semibold text-[#102033]">Behavioural Insights</h2>
                      <div className="mt-5 grid gap-4 md:grid-cols-3">
                        {[
                          ['Highly engaged', `${selectedLeadActivityInsights.responseRate} response signal`, MessageCircle],
                          ['Price range fit', `${selectedLeadBuyerMatchScore}% property fit`, TrendingUp],
                          ['Best contact time', selectedLeadActivities.length ? 'Based on recent activity' : 'Weekdays 9am - 11am', Clock3],
                        ].map(([title, detail, Icon]) => (
                          <div key={title} className="rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                            <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-white text-[#315b7a] shadow-sm">
                              {createElement(Icon, { className: 'h-4 w-4' })}
                            </span>
                            <p className="mt-4 text-sm font-semibold text-[#20364c]">{title}</p>
                            <p className="mt-1 text-sm leading-6 text-[#60758b]">{detail}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-[20px] border border-[#dce7f2] bg-white p-5 shadow-[0_10px_30px_rgba(31,54,78,0.045)] sm:p-6">
                      <h2 className="text-[18px] font-semibold text-[#102033]">Finance Signals</h2>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {(selectedLeadFinanceInsights.recommendations?.length ? selectedLeadFinanceInsights.recommendations : ['Capture finance readiness details to sharpen buyer guidance.']).slice(0, 4).map((item) => (
                          <div key={item} className="rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] p-4 text-sm font-medium leading-6 text-[#29435d]">{item}</div>
                        ))}
                      </div>
                    </section>
                  </div>
                  ) : null}

                  {leadWorkspaceTab === 'mapping' ? (
                  <div className="space-y-6">
                    <section className="rounded-[20px] border border-[#dce7f2] bg-white p-5 shadow-[0_10px_30px_rgba(31,54,78,0.045)] sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-[18px] font-semibold text-[#102033]">Buyer Area Map</h2>
                          <p className="mt-1 text-sm text-[#60758b]">Preferred areas, viewed listings, and recommended stock in one planning surface.</p>
                        </div>
                        <Button type="button" size="sm" variant="secondary" onClick={() => setLeadWorkspaceTab('properties')}>Open Properties</Button>
                      </div>
                      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                        <div className="relative min-h-[360px] overflow-hidden rounded-[18px] border border-[#dce7f2] bg-[#f5f9fc]">
                          <div className="absolute inset-0 opacity-70" style={{ backgroundImage: 'linear-gradient(#dce7f2 1px, transparent 1px), linear-gradient(90deg, #dce7f2 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
                          {(selectedLeadBuyerRecommendations.length ? selectedLeadBuyerRecommendations : [{ id: 'area', area: selectedLeadPropertyLabel, match: selectedLeadBuyerMatchScore }]).slice(0, 5).map((property, index) => (
                            <button
                              key={`map-${property.id}-${index}`}
                              type="button"
                              className="absolute rounded-full border border-white bg-[#1f6feb] px-3 py-1 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(31,111,235,0.2)]"
                              style={{ left: `${18 + (index * 14) % 62}%`, top: `${22 + (index * 17) % 58}%` }}
                              onClick={() => setLeadWorkspaceTab('properties')}
                            >
                              {property.match}% Match
                            </button>
                          ))}
                        </div>
                        <div className="space-y-3">
                          {selectedLeadBuyerRecommendations.slice(0, 5).map((property) => (
                            <div key={`map-list-${property.id}`} className="rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                              <p className="truncate text-sm font-semibold text-[#20364c]">{property.area}</p>
                              <p className="mt-1 text-xs text-[#60758b]">{property.price} · {property.match}% match</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  </div>
                  ) : null}

                  {leadWorkspaceTab === 'activity' ? (
                  <div className="space-y-6">
                    <section className="rounded-[28px] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.06)] sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Activity Composer</p>
                          <h4 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#102033]">Add to the relationship feed</h4>
                        </div>
                        {editingActivityId || editingTaskId ? (
                          <Button type="button" variant="ghost" size="sm" className="h-9 px-3 text-xs" onClick={() => { resetActivityComposer(); resetTaskComposer() }}>
                            <X className="h-4 w-4" />
                            Cancel edit
                          </Button>
                        ) : null}
                      </div>

                      <div className="mt-5 flex gap-1 overflow-x-auto rounded-full bg-[#f3f7fb] p-1">
                        {LEAD_ACTIVITY_COMPOSER_MODES.map((mode) => {
                          const active = activityComposerMode === mode.key
                          return (
                            <button
                              key={mode.key}
                              type="button"
                              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-white text-[#123955] shadow-[0_6px_16px_rgba(31,54,78,0.08)]' : 'text-[#60758b] hover:text-[#123955]'}`}
                              onClick={() => handleActivityComposerModeChange(mode.key)}
                            >
                              {mode.label}
                            </button>
                          )
                        })}
                      </div>

                      <form className="mt-5 space-y-4" onSubmit={handleUnifiedActivitySubmit}>
                        {activityComposerMode === 'activity' ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field as="select" value={activityForm.activityType} onChange={(event) => setActivityForm((previous) => ({ ...previous, activityType: event.target.value }))}>
                              {ACTIVITY_TYPES.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </Field>
                            <Field as="select" value={activityForm.outcome} onChange={(event) => setActivityForm((previous) => ({ ...previous, outcome: event.target.value }))}>
                              {activityOutcomeOptions.map((option) => (
                                <option key={option || 'empty-outcome'} value={option}>
                                  {option || 'Outcome'}
                                </option>
                              ))}
                            </Field>
                          </div>
                        ) : null}

                        {activityComposerMode === 'follow_up' || activityComposerMode === 'task' ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field
                              placeholder={activityComposerMode === 'follow_up' ? 'Follow-up title' : 'Task title'}
                              value={taskForm.title}
                              onChange={(event) => setTaskForm((previous) => ({ ...previous, title: event.target.value }))}
                            />
                            <Field type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((previous) => ({ ...previous, dueDate: event.target.value }))} />
                            {activityComposerMode === 'task' && agentOptions.length ? (
                              <Field as="select" value={taskForm.assignedAgentId} onChange={(event) => setTaskForm((previous) => ({ ...previous, assignedAgentId: event.target.value }))}>
                                <option value="">Assigned agent</option>
                                {agentOptions.map((agent) => (
                                  <option key={`${agent.id}:${agent.email}:task`} value={agent.id || agent.email}>
                                    {agent.name}
                                  </option>
                                ))}
                              </Field>
                            ) : null}
                            <Field as="select" value={taskForm.priority} onChange={(event) => setTaskForm((previous) => ({ ...previous, priority: event.target.value }))}>
                              {TASK_PRIORITIES.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </Field>
                          </div>
                        ) : null}

                        {activityComposerMode === 'note' ? (
                          <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#60758b]">
                            <span className="rounded-full bg-[#eef5fb] px-3 py-1">Internal</span>
                            <span className="rounded-full bg-[#f3f7fb] px-3 py-1 text-[#8aa0b7]">Shared visibility coming later</span>
                          </div>
                        ) : null}

                        {activityComposerMode === 'activity' || activityComposerMode === 'note' ? (
                          <div className="overflow-hidden rounded-[22px] bg-[#f8fbfd] ring-1 ring-[#e6edf5] transition focus-within:bg-white focus-within:ring-[#b9d5eb]">
                            <Field
                              as="textarea"
                              rows={5}
                              className="min-h-[150px] border-0 bg-transparent px-4 py-4 text-[15px] leading-6 shadow-none outline-none ring-0 focus:ring-0"
                              placeholder={activityComposerMode === 'note' ? 'Write an internal note...' : 'What happened with this lead?'}
                              value={activityForm.activityNote}
                              onChange={(event) => setActivityForm((previous) => ({ ...previous, activityNote: event.target.value }))}
                            />
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8eef5] px-3 py-3">
                              <div className="flex items-center gap-1 text-[#7d92a8]">
                                {[
                                  [Bold, 'Bold'],
                                  [Italic, 'Italic'],
                                  [List, 'Bullet list'],
                                  [Link2, 'Link'],
                                  [Smile, 'Emoji'],
                                  [Paperclip, 'Attachment'],
                                ].map(([icon, label]) => (
                                  <button key={label} type="button" className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white hover:text-[#244f70]" title={label}>
                                    {createElement(icon, { className: 'h-4 w-4' })}
                                  </button>
                                ))}
                              </div>
                              <Button type="submit" size="sm" className="px-4">
                                {editingActivityId ? 'Save Activity' : activityComposerMode === 'note' ? 'Add Note' : 'Log Activity'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="overflow-hidden rounded-[22px] bg-[#f8fbfd] ring-1 ring-[#e6edf5] transition focus-within:bg-white focus-within:ring-[#b9d5eb]">
                            <Field
                              as="textarea"
                              rows={4}
                              className="min-h-[120px] border-0 bg-transparent px-4 py-4 text-[15px] leading-6 shadow-none outline-none ring-0 focus:ring-0"
                              placeholder={activityComposerMode === 'follow_up' ? 'Add context for this follow-up...' : 'Add task notes...'}
                              value={taskForm.description}
                              onChange={(event) => setTaskForm((previous) => ({ ...previous, description: event.target.value }))}
                            />
                            <div className="flex justify-end border-t border-[#e8eef5] px-3 py-3">
                              <Button type="submit" size="sm" className="px-4">
                                {editingTaskId ? 'Save Task' : activityComposerMode === 'follow_up' ? 'Create Follow-up' : 'Create Task'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </form>

                      {activityComposerMode === 'activity' || activityComposerMode === 'note' ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {LEAD_ACTIVITY_SUGGESTION_CHIPS.map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              className="rounded-full bg-[#f2f6fa] px-3 py-1.5 text-xs font-semibold text-[#557089] transition hover:bg-[#e7f0f8] hover:text-[#244f70]"
                              onClick={() => handleAppendActivitySuggestion(chip)}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </section>

                    <section className="rounded-[28px] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)] sm:p-6">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Relationship Timeline</p>
                          <h4 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#102033]">Activity history</h4>
                        </div>
                        <span className="rounded-full bg-[#eef5fb] px-3 py-1 text-xs font-semibold text-[#315b7a]">
                          {selectedLeadFilteredTimeline.length} / {selectedLeadUnifiedTimeline.length} records
                        </span>
                      </div>

                      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
                        {LEAD_ACTIVITY_FILTERS.map((filter) => {
                          const active = activityTimelineFilter === filter.key
                          return (
                            <button
                              key={filter.key}
                              type="button"
                              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-[#123955] text-white shadow-[0_8px_18px_rgba(18,57,85,0.16)]' : 'bg-[#f3f7fb] text-[#60758b] hover:bg-[#e7f0f8] hover:text-[#123955]'}`}
                              onClick={() => setActivityTimelineFilter(filter.key)}
                            >
                              {filter.label}
                            </button>
                          )
                        })}
                      </div>

                      <div className="mt-6 space-y-8">
                        {selectedLeadActivityGroups.length ? (
                          selectedLeadActivityGroups.map((group) => (
                            <div key={group.key}>
                              <div className="mb-4 flex items-center gap-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">{group.label}</p>
                                <span className="h-px flex-1 bg-[#edf2f7]" />
                              </div>
                              <div className="space-y-0">
                                {group.rows.map((item, index) => {
                                  const presentation = getLeadActivityPresentation(`${item.sourceLabel} ${item.title} ${item.sourceType}`)
                                  const ActivityIcon = presentation.Icon
                                  const isSystemActivity = item.sourceType === 'system'
                                  const note = normalizeText(item.description)
                                  const isTaskItem = item.sourceType === 'task' || item.sourceType === 'follow_up'
                                  const taskRecord = isTaskItem ? item.original : null
                                  return (
                                    <article key={item.id || `${group.key}-${index}`} className="relative grid grid-cols-[42px_minmax(0,1fr)] gap-4 pb-6 last:pb-0">
                                      {index < group.rows.length - 1 ? <span className="absolute left-[20px] top-10 bottom-0 w-px bg-[#edf2f7]" /> : null}
                                      <div className="relative z-10">
                                        <span className={`grid h-10 w-10 place-items-center rounded-full ${presentation.rail}`}>
                                          <ActivityIcon className="h-4 w-4" />
                                        </span>
                                      </div>
                                      <div className="min-w-0 border-b border-[#eef3f7] pb-5 last:border-b-0 last:pb-0">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                          <div className="flex min-w-0 items-center gap-3">
                                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f3f7fb] text-xs font-bold text-[#315b7a]">
                                              {isSystemActivity ? 'SY' : getInitials(item.actorName)}
                                            </span>
                                            <div className="min-w-0">
                                              <p className="truncate text-sm font-semibold text-[#102033]">{item.actorName}</p>
                                              <p className="mt-0.5 text-sm font-semibold text-[#29435d]">{item.sourceLabel || 'Lead update'}</p>
                                              <p className="mt-0.5 text-sm text-[#60758b]">{item.title}</p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <span className="hidden text-xs font-medium text-[#8aa0b7] sm:inline">{formatRelativeTime(item.timestamp || item.dueDate)}</span>
                                            {item.original?.activityId ? (
                                              <>
                                                <Button type="button" variant="ghost" size="sm" className="h-8 px-2" title="Edit activity" onClick={() => handleEditActivity(item.original)}>
                                                  <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-[#a94442]" title="Delete activity" onClick={() => void handleDeleteActivity(item.original)}>
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </>
                                            ) : null}
                                            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" title="More activity actions">
                                              <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                        {note ? (
                                          <p className="mt-3 text-[15px] leading-6 text-[#4f6680]">"{note}"</p>
                                        ) : (
                                          <p className="mt-3 text-sm text-[#8aa0b7]">No note captured.</p>
                                        )}
                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                          <span className={`rounded-full px-2.5 py-1 font-semibold ${presentation.pill}`}>{presentation.label}</span>
                                          {normalizeText(item.outcome) ? (
                                            <span className="rounded-full bg-[#f4f8fb] px-2.5 py-1 font-semibold text-[#637b94]">Outcome: {item.outcome}</span>
                                          ) : null}
                                          {normalizeText(item.status) ? (
                                            <span className="rounded-full bg-[#f4f8fb] px-2.5 py-1 font-semibold text-[#637b94]">Status: {item.status}</span>
                                          ) : null}
                                          {normalizeText(item.dueDate) ? (
                                            <span className="rounded-full bg-[#fff8ec] px-2.5 py-1 font-semibold text-[#9b651a]">Due: {formatDateShort(item.dueDate)}</span>
                                          ) : null}
                                          {normalizeText(item.priority) ? (
                                            <span className="rounded-full bg-[#f4f8fb] px-2.5 py-1 font-semibold text-[#637b94]">{item.priority} Priority</span>
                                          ) : null}
                                          <span className="text-[#8aa0b7] sm:hidden">{formatRelativeTime(item.timestamp || item.dueDate)}</span>
                                          <span className="text-[#8aa0b7]">{formatDate(item.timestamp || item.dueDate)}</span>
                                        </div>
                                        {isTaskItem ? (
                                          <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <Button type="button" size="sm" variant="secondary" className="h-8 px-2 text-xs" onClick={() => void handleTaskStatusToggle(taskRecord)}>
                                              <CheckSquare className="h-4 w-4" />
                                              {normalizeText(taskRecord?.status) === 'Completed' ? 'Reopen' : 'Complete'}
                                            </Button>
                                            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" title="Edit task" onClick={() => handleEditTask(taskRecord)}>
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-[#a94442]" title="Delete task" onClick={() => void handleDeleteTask(taskRecord)}>
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        ) : null}
                                      </div>
                                    </article>
                                  )
                                })}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[22px] bg-[#f8fbfd] px-5 py-10 text-center">
                            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#eaf3fb] text-[#285b7d]">
                              <MessageCircle className="h-5 w-5" />
                            </span>
                            <p className="mt-3 text-sm font-semibold text-[#29435d]">No activity logged yet.</p>
                            <p className="mt-1 text-sm text-[#6d839b]">Calls, notes, viewings, offers, and system updates will appear here.</p>
                          </div>
                        )}
                      </div>
                    </section>
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
                  <div className="space-y-4">
                    <section className="rounded-[18px] border border-[#e1eaf4] bg-white p-4 shadow-[0_12px_30px_rgba(31,54,78,0.05)]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">Viewing Workspace</p>
                          <h4 className="mt-1 text-lg font-semibold text-[#18324b]">Appointment Summary</h4>
                          <p className="mt-1 text-sm text-[#6a8098]">Book viewings, record outcomes, and move the buyer into offer flow from one place.</p>
                        </div>
                        {selectedLeadActiveViewing ? (
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getAppointmentStatusTone(selectedLeadActiveViewing.status)}`}>
                            {getAppointmentStatusLabel(selectedLeadActiveViewing.status)}
                          </span>
                        ) : null}
                      </div>

                      {selectedLeadActiveViewing ? (
                        <div className="mt-4 rounded-[14px] border border-[#e6eef7] bg-[#fbfdff] p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[#243f5a]">{getAppointmentTypeLabel(selectedLeadActiveViewing.appointmentType) || 'Viewing'}</p>
                              <p className="mt-1 text-xs text-[#607891]">{resolveAppointmentListingLabel(selectedLeadActiveViewing.listingId) || 'No property selected'}</p>
                              <p className="mt-1 text-xs text-[#607891]">{formatDate(selectedLeadActiveViewing.dateTime)} · {formatAppointmentTimeRange(selectedLeadActiveViewing)}</p>
                            </div>
                            <div className="text-right text-xs text-[#607891]">
                              <p className="font-semibold text-[#243f5a]">{selectedLeadContactName}</p>
                              <p>{selectedLeadContact?.phone || selectedLead?.phone || 'No phone'}</p>
                              <p>{selectedLeadContact?.email || selectedLead?.email || 'No email'}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {[
                              ['Assigned agent', resolveAgentById(selectedLeadActiveViewing.assignedAgentId || selectedLeadActiveViewing.assignedAgentEmail || currentAgent.id)?.name || currentAgent.fullName],
                              ['Location', selectedLeadActiveViewing.location || 'To be confirmed'],
                              ['Outcome', selectedLeadActiveViewing.outcomeSummary || 'Pending'],
                              ['Last activity', formatRelativeTime(selectedLeadActiveViewing.updatedAt || selectedLeadActiveViewing.createdAt)],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-[12px] border border-[#e6eef7] bg-white px-3 py-2">
                                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#8496aa]">{label}</p>
                                <p className="mt-1 text-sm font-semibold text-[#253f59]">{value}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button type="button" size="sm" onClick={() => void handleOpenLeadCompletionPanel(selectedLeadActiveViewing)} disabled={normalizeText(selectedLeadActiveViewing.status).toLowerCase() === 'completed'}>
                              <CheckSquare className="h-4 w-4" />
                              Mark as Completed
                            </Button>
                            <Button type="button" size="sm" variant="secondary" onClick={() => handleOpenAppointmentModal(selectedLeadActiveViewing)}>
                              <CalendarDays className="h-4 w-4" />
                              Reschedule
                            </Button>
                            <Button type="button" size="sm" variant="secondary" onClick={() => void handleCancelLeadViewing(selectedLeadActiveViewing)}>
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => setOfferLinkForm((previous) => ({
                                ...previous,
                                appointmentId: selectedLeadActiveViewing.appointmentId,
                                listingId: normalizeText(selectedLeadActiveViewing.listingId || previous.listingId),
                              }))}
                            >
                              <Mail className="h-4 w-4" />
                              Send Offer Link
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-[14px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] p-4 text-sm text-[#6a8098]">
                          No viewing has been booked for this lead yet.
                        </div>
                      )}

                      <form className="mt-4 rounded-[14px] border border-[#e6eef7] bg-[#fbfdff] p-3" onSubmit={handleCreateAppointment}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-[#243f5a]">Book a Viewing</p>
                            <p className="text-xs text-[#6f849a]">A new viewing updates the buyer stage to Viewing Scheduled.</p>
                          </div>
                          <Button type="button" size="sm" variant="secondary" onClick={() => handleOpenAppointmentModal()}>
                            Open Full Form
                          </Button>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <Field as="select" value={appointmentForm.listingId} onChange={(event) => handleAppointmentListingChange(event.target.value)}>
                            <option value="">Select property</option>
                            {leadAppointmentOfferListingOptions.map((listing) => (
                              <option key={listing.id} value={listing.id}>{listing.label}</option>
                            ))}
                          </Field>
                          <Field placeholder="Location" value={appointmentForm.location} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, location: event.target.value }))} />
                          <Field type="date" value={appointmentForm.date} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, date: event.target.value }))} />
                          <Field type="time" value={appointmentForm.startTime} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, startTime: event.target.value }))} />
                        </div>
                        <Field className="mt-2" placeholder="Viewing notes" value={appointmentForm.notes} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, notes: event.target.value, appointmentType: 'viewing', title: previous.title || 'Viewing' }))} />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="submit">Book Viewing</Button>
                        </div>
                      </form>
                    </section>

                    {leadCompletionAppointmentId ? (
                      <section className="rounded-[18px] border border-[#dfe9f4] bg-white p-4 shadow-[0_10px_24px_rgba(31,54,78,0.04)]">
	                        <div className="flex flex-wrap items-start justify-between gap-3">
	                          <div>
	                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">Post Viewing</p>
	                            <h4 className="mt-1 text-lg font-semibold text-[#18324b]">Complete Viewing Outcome</h4>
	                          </div>
	                          <Button type="button" size="sm" variant="ghost" onClick={() => setLeadCompletionAppointmentId('')}>Close</Button>
	                        </div>
	                        <div className="mt-4 rounded-[14px] border border-[#e5edf6] bg-[#fbfdff] p-3">
	                          <div className="flex flex-wrap items-center justify-between gap-2">
	                            <div>
	                              <p className="text-sm font-semibold text-[#243f5a]">Viewed Properties</p>
	                              <p className="text-xs text-[#6f849a]">{(leadViewingCompletionForm.viewedListings || []).length} selected for this viewing</p>
	                            </div>
	                            <div className="flex min-w-[260px] flex-1 flex-wrap items-center justify-end gap-2">
	                              <Field
	                                as="select"
	                                className="min-w-[220px] flex-1"
	                                value={leadViewingCompletionForm.propertyDraftListingId}
	                                onChange={(event) => setLeadViewingCompletionForm((previous) => ({ ...previous, propertyDraftListingId: event.target.value }))}
	                              >
	                                <option value="">Add viewed property</option>
	                                {leadAppointmentOfferListingOptions
	                                  .filter((listing) => !(leadViewingCompletionForm.viewedListings || []).some((row) => normalizeText(row?.listingId) === normalizeText(listing.id)))
	                                  .map((listing) => (
	                                    <option key={listing.id} value={listing.id}>{listing.label}</option>
	                                  ))}
	                              </Field>
	                              <Button type="button" size="sm" variant="secondary" onClick={handleAddViewedListingToCompletion}>
	                                Add Property
	                              </Button>
	                            </div>
	                          </div>
	                          <div className="mt-3 space-y-2">
	                            {(leadViewingCompletionForm.viewedListings || []).length ? (
	                              (leadViewingCompletionForm.viewedListings || []).map((row) => (
	                                <div key={row.listingId} className="rounded-[13px] border border-[#e5edf6] bg-white p-3">
	                                  <div className="flex flex-wrap items-start justify-between gap-2">
	                                    <div>
	                                      <p className="text-sm font-semibold text-[#243f5a]">{resolveAppointmentListingLabel(row.listingId) || `Listing ${row.listingId}`}</p>
	                                      <p className="mt-0.5 text-xs text-[#7b8ea4]">Viewed {formatDate(row.viewedAt)}</p>
	                                    </div>
	                                    <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[#9f3a2f]" onClick={() => handleRemoveViewedListingFromCompletion(row.listingId)}>
	                                      Remove
	                                    </Button>
	                                  </div>
	                                  <div className="mt-3 grid gap-2 md:grid-cols-3">
	                                    <Field
	                                      as="select"
	                                      value={row.outcome || leadViewingCompletionForm.outcome}
	                                      onChange={(event) => handleUpdateViewedListingCompletion(row.listingId, { outcome: event.target.value })}
	                                    >
	                                      {VIEWING_OUTCOME_OPTIONS.map((option) => (
	                                        <option key={option} value={option}>{option}</option>
	                                      ))}
	                                    </Field>
	                                    <Field
	                                      as="textarea"
	                                      rows={2}
	                                      placeholder="Buyer feedback for this property"
	                                      value={row.buyerFeedback || ''}
	                                      onChange={(event) => handleUpdateViewedListingCompletion(row.listingId, { buyerFeedback: event.target.value })}
	                                    />
	                                    <Field
	                                      as="textarea"
	                                      rows={2}
	                                      placeholder="Agent notes for this property"
	                                      value={row.agentNotes || ''}
	                                      onChange={(event) => handleUpdateViewedListingCompletion(row.listingId, { agentNotes: event.target.value })}
	                                    />
	                                  </div>
	                                </div>
	                              ))
	                            ) : (
	                              <div className="rounded-[12px] border border-dashed border-[#d8e4f0] bg-white px-3 py-3 text-sm text-[#6a8098]">
	                                Select at least one property viewed during this appointment.
	                              </div>
	                            )}
	                          </div>
	                        </div>
	                        <div className="mt-3 grid gap-2 md:grid-cols-2">
	                          <Field as="select" value={leadViewingCompletionForm.outcome} onChange={(event) => setLeadViewingCompletionForm((previous) => ({ ...previous, outcome: event.target.value }))}>
	                            {VIEWING_OUTCOME_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </Field>
                          <Field as="select" value={leadViewingCompletionForm.nextStep} onChange={(event) => setLeadViewingCompletionForm((previous) => ({ ...previous, nextStep: event.target.value }))}>
                            {VIEWING_NEXT_STEP_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </Field>
                          <Field type="date" value={leadViewingCompletionForm.followUpDate} onChange={(event) => setLeadViewingCompletionForm((previous) => ({ ...previous, followUpDate: event.target.value }))} />
                          {leadViewingCompletionForm.nextStep === 'send_offer_link' ? (
                            <Field
                              as="select"
                              value={leadViewingCompletionForm.clientIntakePreference}
                              onChange={(event) => setLeadViewingCompletionForm((previous) => ({ ...previous, clientIntakePreference: event.target.value }))}
                            >
                              {CLIENT_INTAKE_PREFERENCE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </Field>
                          ) : null}
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <Field as="textarea" rows={3} placeholder="Agent notes" value={leadViewingCompletionForm.agentNotes} onChange={(event) => setLeadViewingCompletionForm((previous) => ({ ...previous, agentNotes: event.target.value }))} />
                          <Field as="textarea" rows={3} placeholder="Buyer feedback" value={leadViewingCompletionForm.buyerFeedback} onChange={(event) => setLeadViewingCompletionForm((previous) => ({ ...previous, buyerFeedback: event.target.value }))} />
                        </div>
                        <div className="mt-3 rounded-[14px] border border-[#e5edf6] bg-[#fbfdff] p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[#243f5a]">Completion readiness</p>
                              <p className="mt-1 text-xs text-[#6f849a]">
                                {leadViewingCompletionBlockers.length
                                  ? `${leadViewingCompletionBlockers.length} item${leadViewingCompletionBlockers.length === 1 ? '' : 's'} still need attention`
                                  : leadViewingCompletionForm.nextStep === 'send_offer_link'
                                    ? 'Ready to complete the viewing and generate the offer link immediately.'
                                    : 'Ready to complete the viewing and record the next action.'}
                              </p>
                            </div>
                            {leadViewingCompletionForm.nextStep === 'send_offer_link' ? (
                              <span className="rounded-full border border-[#d8e6f6] bg-white px-3 py-1 text-xs font-semibold text-[#2c5a89]">
                                {getClientIntakePreferenceLabel(leadViewingCompletionForm.clientIntakePreference)}
                              </span>
                            ) : null}
                          </div>
                          {leadViewingCompletionBlockers.length ? (
                            <div className="mt-3 space-y-2">
                              {leadViewingCompletionBlockers.map((blocker) => (
                                <div key={blocker} className="rounded-[12px] border border-[#f1dfb8] bg-[#fff8e8] px-3 py-2 text-sm text-[#8a641d]">
                                  {blocker}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="button" onClick={() => void handleCompleteLeadViewing()} disabled={isOfferLinkSending}>
                            {isOfferLinkSending && leadViewingCompletionForm.nextStep === 'send_offer_link'
                              ? 'Completing & Sending...'
                              : leadViewingCompletionForm.nextStep === 'send_offer_link'
                                ? 'Complete & Send Offer Link'
                                : 'Save Completion'}
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => setLeadCompletionAppointmentId('')}>Cancel</Button>
                        </div>
                      </section>
                    ) : null}

                    <section className="rounded-[18px] border border-[#dfe9f4] bg-white p-4 shadow-[0_10px_24px_rgba(31,54,78,0.04)]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">Offer CTA</p>
                          <h4 className="mt-1 text-lg font-semibold text-[#18324b]">Ready to make an offer?</h4>
                          <p className="mt-1 text-sm text-[#6a8098]">Choose the correct property before sending. Buyers may have viewed more than one.</p>
                        </div>
                      </div>
                      <form className="mt-3 grid gap-2" onSubmit={handleSendOfferLinkFromAppointment}>
                        <div className="grid gap-2 md:grid-cols-2">
                          <Field as="select" value={offerLinkForm.listingId} onChange={(event) => setOfferLinkForm((previous) => ({ ...previous, listingId: event.target.value }))}>
                            <option value="">Select property/listing</option>
                            {leadAppointmentOfferListingOptions.map((listing) => (
                              <option key={listing.id} value={listing.id}>{listing.label}</option>
                            ))}
                          </Field>
                          <Field type="date" value={offerLinkForm.expiryDate} onChange={(event) => setOfferLinkForm((previous) => ({ ...previous, expiryDate: event.target.value }))} />
                          <Field placeholder="Buyer name" value={offerLinkForm.buyerName} onChange={(event) => setOfferLinkForm((previous) => ({ ...previous, buyerName: event.target.value }))} />
                          <Field placeholder="Buyer email" value={offerLinkForm.buyerEmail} onChange={(event) => setOfferLinkForm((previous) => ({ ...previous, buyerEmail: event.target.value }))} />
                          <Field placeholder="Buyer phone" value={offerLinkForm.buyerPhone} onChange={(event) => setOfferLinkForm((previous) => ({ ...previous, buyerPhone: event.target.value }))} />
                          <Field as="select" value={offerLinkForm.clientIntakePreference} onChange={(event) => setOfferLinkForm((previous) => ({ ...previous, clientIntakePreference: event.target.value }))}>
                            {CLIENT_INTAKE_PREFERENCE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </Field>
                          <Field as="select" value={offerLinkForm.appointmentId} onChange={(event) => setOfferLinkForm((previous) => ({ ...previous, appointmentId: event.target.value }))}>
                            <option value="">Link to appointment</option>
                            {selectedLeadViewingAppointments.map((appointment) => (
                              <option key={appointment.appointmentId} value={appointment.appointmentId}>
                                {formatDate(appointment.dateTime)} · {resolveAppointmentListingLabel(appointment.listingId) || 'Viewing'}
                              </option>
                            ))}
                          </Field>
                        </div>
                        <Field as="textarea" rows={2} placeholder="Optional note to buyer" value={offerLinkForm.note} onChange={(event) => setOfferLinkForm((previous) => ({ ...previous, note: event.target.value }))} />
                        {offerLinkForm.lastOfferLink ? (
                          <div className="rounded-[12px] border border-[#cde7d5] bg-[#f2fbf5] px-3 py-2 text-xs text-[#286b43]">
                            Offer link ready: {offerLinkForm.lastOfferLink}
                          </div>
                        ) : null}
                        {selectedLeadActiveOfferPortalStatus ? (
                          <div className={`rounded-[12px] border px-3 py-2 text-xs ${selectedLeadActiveOfferPortalStatus.tone}`}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold">{selectedLeadActiveOfferPortalStatus.label}</p>
                                <p className="mt-0.5 opacity-80">{selectedLeadActiveOfferPortalStatus.detail || 'Timestamp pending'}</p>
                              </div>
                              <div className="text-right font-semibold opacity-80">
                                {selectedLeadActiveOfferPortalStatus.submittedAt
                                  ? `Submitted ${formatDate(selectedLeadActiveOfferPortalStatus.submittedAt)}`
                                  : selectedLeadActiveOfferPortalStatus.openedAt
                                    ? `Opened ${formatDate(selectedLeadActiveOfferPortalStatus.openedAt)}`
                                    : ''}
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" disabled={isOfferLinkSending}>{isOfferLinkSending ? 'Creating...' : 'Send Offer Link'}</Button>
                        </div>
                      </form>
                    </section>

                    <section className="rounded-[18px] border border-[#dfe9f4] bg-white p-4 shadow-[0_10px_24px_rgba(31,54,78,0.04)]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">History</p>
                          <h4 className="mt-1 text-lg font-semibold text-[#18324b]">Appointment History</h4>
                        </div>
                        <span className="rounded-full bg-[#f3f7fb] px-3 py-1 text-xs font-semibold text-[#607891]">{selectedLeadAppointments.length} records</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {selectedLeadAppointments.length ? (
                          selectedLeadAppointments.map((appointment) => {
                            const latestPortalSession = selectedLeadOfferPortalSessionByAppointmentId.get(normalizeText(appointment.appointmentId))
                            const portalStatusKey = normalizeText(latestPortalSession?.status).toLowerCase()
                            const portalStatusLabel = latestPortalSession
                              ? latestPortalSession.submittedAt || portalStatusKey === 'submitted'
                                ? 'Offer submitted'
                                : latestPortalSession.viewedAt || portalStatusKey === 'viewed'
                                  ? 'Offer opened'
                                  : 'Offer link sent'
                              : ''
                            return (
                              <button
                                key={appointment.appointmentId}
                                type="button"
                                onClick={() => handleOpenAppointmentModal(appointment)}
                                className="w-full rounded-[14px] border border-[#e6eef7] bg-[#fbfdff] px-3 py-3 text-left transition hover:border-[#cbd9e8] hover:bg-white"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-[#243f5a]">{resolveAppointmentListingLabel(appointment.listingId) || getAppointmentTypeLabel(appointment.appointmentType)}</p>
                                    <p className="mt-1 text-xs text-[#607891]">{formatDate(appointment.dateTime)} · {formatAppointmentTimeRange(appointment)}</p>
                                    <p className="mt-1 line-clamp-1 text-xs text-[#7b8ea4]">{appointment.outcomeSummary || appointment.notes || 'Outcome pending'}</p>
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    <span className={`rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold ${getAppointmentStatusTone(appointment.status)}`}>
                                      {getAppointmentStatusLabel(appointment.status)}
                                    </span>
                                    {portalStatusLabel ? (
                                      <span className="text-[0.68rem] font-semibold text-[#2f7b9e]">{portalStatusLabel}</span>
                                    ) : appointment.offerInviteId ? (
                                      <span className="text-[0.68rem] font-semibold text-[#2f7b9e]">Offer link sent</span>
                                    ) : null}
                                  </div>
                                </div>
                              </button>
                            )
                          })
                        ) : (
                          <div className="rounded-[14px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] p-4 text-sm text-[#6a8098]">
                            Previous viewings and appointments will appear here.
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                  ) : null}

                  {leadWorkspaceTab === 'offers' ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#eef5ff] text-[#0b63f6]">
                          <Tag className="h-5 w-5" />
                        </span>
                        <div>
                          <h3 className="text-2xl font-semibold text-[#0c2440]">Offer Centre</h3>
                          <p className="mt-1 text-sm text-[#5f7690]">Send a secure offer link for any property to this buyer.</p>
                        </div>
                      </div>
                      <Button type="button" size="sm" variant="secondary" className="rounded-[12px]" onClick={() => setLeadWorkspaceTab('overview')}>
                        <Settings className="h-4 w-4" />
                        Offer Settings
                      </Button>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
                      <div className="space-y-5">
                        <section className="rounded-[20px] border border-[#dfe9f4] bg-white p-5 shadow-[0_16px_34px_rgba(31,54,78,0.05)]">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[#edf5ff] text-sm font-semibold text-[#0b63f6]">1</span>
                              <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#18324b]">Property Selected for Offer</h4>
                            </div>
                            <Button type="button" size="sm" variant="secondary" className="rounded-[12px]" onClick={() => setOfferPropertySelectorOpen(true)}>
                              <Pencil className="h-4 w-4" />
                              Change Property
                            </Button>
                          </div>

                          {selectedLeadOfferCentreProperty ? (
                            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(280px,42%)_1fr]">
                              <div className="relative overflow-hidden rounded-[18px] bg-[#f3f7fb]">
                                <img
                                  src={selectedLeadOfferCentreProperty.image}
                                  alt={selectedLeadOfferCentreProperty.title}
                                  className="h-full min-h-[260px] w-full object-cover"
                                />
                                <span className="absolute bottom-4 left-4 rounded-full border border-[#bfe7d0] bg-white/95 px-3 py-1 text-xs font-semibold text-[#13733e] shadow-[0_8px_20px_rgba(12,36,64,0.12)]">
                                  {selectedLeadOfferCentreProperty.match || selectedLeadBuyerMatchScore}% Match
                                </span>
                              </div>
                              <div className="flex min-w-0 flex-col justify-between gap-5">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-[#edf9f1] px-3 py-1 text-xs font-semibold text-[#17643a]">For Sale</span>
                                    <span className="rounded-full border border-[#dbe6f2] bg-white px-3 py-1 text-xs font-semibold text-[#607891]">
                                      {selectedLead?.propertyInterest || 'House'}
                                    </span>
                                  </div>
                                  <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <h4 className="text-xl font-semibold text-[#102942]">{selectedLeadOfferCentreProperty.title}</h4>
                                      <p className="mt-1 max-w-[520px] text-sm leading-6 text-[#607891]">{selectedLeadOfferCentreProperty.address}</p>
                                      {selectedLeadOfferCentreProperty.suburb ? (
                                        <p className="mt-0.5 text-sm text-[#607891]">{selectedLeadOfferCentreProperty.suburb}</p>
                                      ) : null}
                                    </div>
                                    <div className="text-left sm:text-right">
                                      <p className="text-2xl font-semibold text-[#0c2440]">{selectedLeadOfferCentreProperty.price}</p>
                                      <p className="mt-1 text-xs font-medium text-[#7b8fa5]">Estimated Value</p>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-4">
                                  {[
                                    [BedDouble, selectedLeadOfferCentreProperty.bedrooms || '—', 'Beds'],
                                    [Bath, selectedLeadOfferCentreProperty.bathrooms || '—', 'Baths'],
                                    [Car, selectedLeadOfferCentreProperty.parking || '—', 'Garages'],
                                    [Ruler, selectedLeadOfferCentreProperty.sizeLabel, 'Size'],
                                  ].map(([Icon, value, label]) => (
                                    <div key={label} className="rounded-[14px] border border-[#e6eef7] bg-[#fbfdff] px-3 py-3">
                                      {createElement(Icon, { className: 'h-4 w-4 text-[#5f7893]' })}
                                      <p className="mt-2 text-sm font-semibold text-[#203a54]">{value}</p>
                                      <p className="mt-0.5 text-xs text-[#7b8fa5]">{label}</p>
                                    </div>
                                  ))}
                                </div>

                                <div className="grid gap-3 border-t border-[#edf2f7] pt-4 sm:grid-cols-3">
                                  <div>
                                    <p className="text-xs font-semibold text-[#7b8fa5]">Viewing context</p>
                                    <p className="mt-1 text-sm font-semibold text-[#203a54]">{selectedLeadOfferCentreProperty.viewingStatusLabel}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-[#7b8fa5]">Viewing outcome</p>
                                    <p className="mt-1 text-sm font-semibold text-[#203a54]">{selectedLeadOfferCentreProperty.viewing ? selectedLeadOfferCentreProperty.viewingOutcome : 'Offer link still available'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-[#7b8fa5]">Days on market</p>
                                    <p className="mt-1 text-sm font-semibold text-[#203a54]">{selectedLeadOfferCentreProperty.daysOnMarket}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-4 rounded-[16px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] p-5 text-sm text-[#6a8098]">
                              Select a property to generate the buyer offer link.
                            </div>
                          )}

                          <div className="mt-4 rounded-[16px] border border-[#cfe8dc] bg-[#f5fcf8] p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#13733e]">Why this property?</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(selectedLeadOfferReasons.length ? selectedLeadOfferReasons : ['Recommended for buyer profile']).map((reason) => (
                                <span key={reason} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#2d6b4a] ring-1 ring-[#cfe8dc]">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {reason}
                                </span>
                              ))}
                            </div>
                          </div>
                        </section>

                        <section className="rounded-[20px] border border-[#dfe9f4] bg-white p-5 shadow-[0_16px_34px_rgba(31,54,78,0.05)]">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[#edf5ff] text-sm font-semibold text-[#0b63f6]">2</span>
                            <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#18324b]">Send Offer</h4>
                          </div>
                          <form className="mt-4 grid gap-4" data-offer-centre="true" onSubmit={handleSendOfferLinkFromAppointment}>
                            <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
                              <label className="grid gap-1">
                                <span className="text-xs font-semibold text-[#6f849b]">Recipient</span>
                                <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#dfe9f4] bg-[#fbfdff] px-4 py-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#eef5ff] text-[#0b63f6]">
                                      <UserRound className="h-5 w-5" />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-[#18324b]">{offerLinkForm.buyerName || selectedLeadContactName}</p>
                                      <p className="truncate text-xs text-[#6f849b]">{offerLinkForm.buyerEmail || selectedLeadContact?.email || selectedLead?.email || 'Email pending'}</p>
                                    </div>
                                  </div>
                                  <ChevronDown className="h-4 w-4 text-[#8aa0b6]" />
                                </div>
                              </label>
                              <label className="grid gap-1">
                                <span className="text-xs font-semibold text-[#6f849b]">Offer Link Expiry</span>
                                <Field type="date" value={offerLinkForm.expiryDate} onChange={(event) => setOfferLinkForm((previous) => ({ ...previous, expiryDate: event.target.value }))} />
                                <span className="text-[0.68rem] text-[#7b8fa5]">Link will expire at 23:59 on this date</span>
                              </label>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
                              <label className="grid gap-1">
                                <span className="text-xs font-semibold text-[#6f849b]">Buyer Intake Mode</span>
                                <Field
                                  as="select"
                                  value={offerLinkForm.clientIntakePreference}
                                  onChange={(event) => setOfferLinkForm((previous) => ({ ...previous, clientIntakePreference: event.target.value }))}
                                >
                                  {CLIENT_INTAKE_PREFERENCE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </Field>
                                <span className="text-[0.68rem] text-[#7b8fa5]">Carry this through if the buyer wants portal, assisted capture, or hard-copy paperwork.</span>
                              </label>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
                              <label className="grid gap-1">
                                <span className="text-xs font-semibold text-[#6f849b]">Personal Message (Optional)</span>
                                <Field
                                  as="textarea"
                                  rows={3}
                                  placeholder="Add a personal message for the buyer..."
                                  value={offerLinkForm.note}
                                  onChange={(event) => setOfferLinkForm((previous) => ({ ...previous, note: event.target.value }))}
                                />
                              </label>
                              <div className="rounded-[14px] border border-[#dfe9f4] bg-white p-4">
                                <p className="text-xs font-semibold text-[#6f849b]">Send via</p>
                                <div className="mt-3 grid gap-2">
                                  {[
                                    ['email', Mail, 'Email'],
                                    ['sms', MessageCircle, 'SMS'],
                                    ['whatsapp', Phone, 'WhatsApp'],
                                  ].map(([key, Icon, label]) => (
                                    <label key={key} className="flex items-center gap-2 text-sm font-medium text-[#203a54]">
                                      <input
                                        type="checkbox"
                                        checked={offerLinkChannels[key] === true}
                                        onChange={(event) => setOfferLinkChannels((previous) => ({ ...previous, [key]: event.target.checked }))}
                                        className="h-4 w-4 rounded border-[#cbd8e6] text-[#0b63f6]"
                                      />
                                      {createElement(Icon, { className: 'h-4 w-4 text-[#5f7893]' })}
                                      {label}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {offerLinkForm.lastOfferLink ? (
                              <div className="rounded-[14px] border border-[#cde7d5] bg-[#f2fbf5] px-4 py-3 text-sm text-[#286b43]">
                                Offer link ready: {offerLinkForm.lastOfferLink}
                              </div>
                            ) : null}

                            {selectedLeadActiveOfferPortalStatus ? (
                              <div className={`rounded-[14px] border px-4 py-3 text-sm ${selectedLeadActiveOfferPortalStatus.tone}`}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold">{selectedLeadActiveOfferPortalStatus.label}</p>
                                    <p className="mt-1 text-xs opacity-80">{selectedLeadActiveOfferPortalStatus.detail || 'Timestamp pending'}</p>
                                  </div>
                                  <div className="text-right text-xs font-semibold opacity-80">
                                    {selectedLeadActiveOfferPortalStatus.openedAt ? <p>Opened {formatDate(selectedLeadActiveOfferPortalStatus.openedAt)}</p> : null}
                                    {selectedLeadActiveOfferPortalStatus.submittedAt ? <p>Submitted {formatDate(selectedLeadActiveOfferPortalStatus.submittedAt)}</p> : null}
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-3">
                              <Button type="submit" disabled={isOfferLinkSending || !selectedLeadOfferCentreProperty} className="rounded-[12px] bg-[#061d3b] hover:bg-[#0a2a52]">
                                <Send className="h-4 w-4" />
                                {isOfferLinkSending ? 'Creating...' : 'Send Offer Link'}
                              </Button>
                              <button
                                type="button"
                                onClick={() => void handleCreateBuyerOfferDraft()}
                                className="text-sm font-semibold text-[#0b63f6] hover:text-[#084fbf]"
                              >
                                Save as draft
                              </button>
                            </div>
                          </form>
                        </section>

                        <section className="rounded-[20px] border border-[#dfe9f4] bg-white p-5 shadow-[0_16px_34px_rgba(31,54,78,0.05)]">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#18324b]">Offer History</h4>
                            <button type="button" className="text-xs font-semibold text-[#0b63f6]" onClick={() => setLeadWorkspaceTab('activity')}>
                              View full timeline
                            </button>
                          </div>
                          <div className="mt-5 overflow-x-auto pb-2">
                            <div className="grid min-w-[760px] grid-cols-6 gap-0">
                              {selectedLeadOfferHistoryStages.map((stage, index) => {
                                const Icon = stage.icon
                                return (
                                  <div key={stage.key} className="relative px-2">
                                    {index < selectedLeadOfferHistoryStages.length - 1 ? (
                                      <div className={`absolute left-[50%] right-[-50%] top-5 h-0.5 ${stage.done ? 'bg-[#0b63f6]' : 'bg-[#dce6f2]'}`} />
                                    ) : null}
                                    <div className="relative z-10 flex flex-col items-center text-center">
                                      <span className={`flex h-10 w-10 items-center justify-center rounded-full border ${stage.done ? 'border-[#0b63f6] bg-[#0b63f6] text-white' : 'border-[#d5e1ee] bg-white text-[#8aa0b6]'}`}>
                                        <Icon className="h-4 w-4" />
                                      </span>
                                      <p className="mt-3 text-xs font-semibold text-[#203a54]">{stage.label}</p>
                                      <p className="mt-1 text-[0.68rem] text-[#7b8fa5]">{stage.done ? formatDateShort(stage.detail) : '—'}</p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {selectedLeadOffersError ? (
                            <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">{selectedLeadOffersError}</div>
                          ) : null}

                          <div className="mt-5 space-y-3">
                            {selectedLeadOffersLoading ? (
                              <div className="rounded-[14px] border border-[#e6eef7] bg-[#fbfdff] p-4 text-sm text-[#6a8098]">Loading offers...</div>
                            ) : selectedLeadOffers.length ? (
                              selectedLeadOffers.map((offer) => {
                                const statusKey = normalizeText(offer.status).toLowerCase()
                                const localSellerListing = normalizeText(offer.listingId || selectedLead?.listingId)
                                  ? readAgentPrivateListings().find((listing) => normalizeText(listing?.id || listing?.listingId || listing?.listing_id) === normalizeText(offer.listingId || selectedLead?.listingId)) || null
                                  : null
                                const sellerReviewPreparation = buildSellerOfferReviewPreparation({
                                  listing: localSellerListing,
                                  offer,
                                  deliveryMode: normalizeSellerReviewDeliveryMode(
                                    sellerReviewDeliveryModeByOfferId?.[offer.id],
                                    {
                                      sellerEmail: resolveSellerEmailFromListing(localSellerListing),
                                      sellerPhone: resolveSellerPhoneFromListing(localSellerListing),
                                    },
                                  ),
                                  sellerEmail: resolveSellerEmailFromListing(localSellerListing),
                                  sellerPhone: resolveSellerPhoneFromListing(localSellerListing),
                                  sellerName: resolveSellerNameFromListing(localSellerListing),
                                  sellerLeadId: offer.sellerLeadId || localSellerListing?.sellerLeadId || localSellerListing?.leadId,
                                  sellerContactId: offer.sellerContactId || localSellerListing?.sellerContactId,
                                })
                                const sellerReviewPreparationSummary = describeSellerReviewPreparation(sellerReviewPreparation)
                                const sellerReviewDeliveryMode = sellerReviewPreparation.deliveryMode
                                const statusTone = statusKey === 'accepted' || statusKey === 'converted_to_transaction'
                                  ? 'border-[#cfe8dc] bg-[#eefbf4] text-[#17643a]'
                                  : statusKey === 'rejected' || statusKey === 'withdrawn' || statusKey === 'expired'
                                    ? 'border-[#f4d4d4] bg-[#fff5f5] text-[#b42318]'
                                    : ['submitted', 'agent_review', 'under_review', 'sent_to_seller', 'seller_viewed', 'sent_to_buyer'].includes(statusKey)
                                      ? 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]'
                                      : statusKey === 'changes_requested' || statusKey === 'countered'
                                        ? 'border-[#f1dfb8] bg-[#fff8e8] text-[#8a641d]'
                                        : 'border-[#dbe6f2] bg-white text-[#35546c]'
                                const offerToken = normalizeText(offer.offerToken || offer.id)
                                const offerLink = offerToken && typeof window !== 'undefined' ? `${window.location.origin}/offers/${encodeURIComponent(offerToken)}` : ''
                                return (
                                  <article key={offer.id} className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                      <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="text-base font-semibold text-[#203a54]">{formatCurrency(offer.offerAmount)}</p>
                                          <span className={`rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold capitalize ${statusTone}`}>
                                            {statusKey.replaceAll('_', ' ') || 'draft'}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-sm text-[#607891]">
                                          {resolveAppointmentListingLabel(offer.listingId) || offer.listingId || 'Listing not linked'} · {offer.financeType || 'Finance type pending'}
                                        </p>
                                        <p className="mt-1 text-xs text-[#7b8ea4]">
                                          Submitted {formatDate(offer.submittedAt)} · Expires {formatDate(offer.expiryDate)}
                                        </p>
                                        {(offer.buyerViewedAt || offer.buyerSubmittedAt) ? (
                                          <p className="mt-1 text-xs font-semibold text-[#35546c]">
                                            {offer.buyerSubmittedAt
                                              ? `Buyer submitted ${formatDate(offer.buyerSubmittedAt)}`
                                              : `Buyer opened ${formatDate(offer.buyerViewedAt)}`}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {offer.listingId ? (
                                          <Button type="button" size="sm" variant="secondary" onClick={() => navigate(`/listings/${offer.listingId}`)}>Open Listing</Button>
                                        ) : null}
                                        {offerLink ? (
                                          <Button type="button" size="sm" variant="secondary" onClick={() => {
                                            if (typeof navigator !== 'undefined') void navigator.clipboard?.writeText(offerLink)
                                            setMessage('Offer link copied.')
                                          }}>Copy Link</Button>
                                        ) : null}
                                        {offer.transactionId ? (
                                          <Button type="button" size="sm" onClick={() => navigate(`/transactions/${offer.transactionId}`)}>Open Transaction</Button>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto]">
                                      <Field
                                        value={canonicalOfferNotesById[offer.id] || ''}
                                        onChange={(event) => setCanonicalOfferNotesById((previous) => ({ ...previous, [offer.id]: event.target.value }))}
                                        placeholder="Optional note for the offer timeline"
                                      />
                                      <div className="flex flex-wrap gap-2">
                                        {['submitted', 'draft', 'buyer_viewed', 'sent_to_buyer'].includes(statusKey) ? (
                                          <Button type="button" size="sm" variant="secondary" disabled={canonicalOfferActionId === `${offer.id}:agent_review`} onClick={() => void handleLeadCanonicalOfferStatus(offer, 'agent_review', 'Agent review started')}>
                                            Start Review
                                          </Button>
                                        ) : null}
                                        {!['accepted', 'converted_to_transaction', 'rejected', 'withdrawn', 'expired'].includes(statusKey) ? (
                                          <>
                                            {['submitted', 'agent_review', 'changes_requested', 'countered', 'sent_to_seller', 'seller_viewed'].includes(statusKey) ? (
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
                                                <Button type="button" size="sm" disabled={canonicalOfferActionId === `${offer.id}:sent_to_seller`} onClick={() => void handleLeadCanonicalOfferSendToSeller(offer)}>
                                                  {['sent_to_seller', 'seller_viewed'].includes(statusKey) ? 'Resend to Seller' : 'Send to Seller'}
                                                </Button>
                                              </>
                                            ) : null}
                                            <Button type="button" size="sm" variant="secondary" disabled={canonicalOfferActionId === `${offer.id}:changes_requested`} onClick={() => void handleLeadCanonicalOfferStatus(offer, 'changes_requested', 'Buyer changes requested')}>
                                              Request Changes
                                            </Button>
                                          </>
                                        ) : null}
                                        {statusKey === 'accepted' || (statusKey === 'converted_to_transaction' && offer.transactionId) ? (
                                          <Button type="button" size="sm" disabled={canonicalOfferActionId === `${offer.id}:convert`} onClick={() => void handleLeadCanonicalOfferConversion(offer)}>
                                            {statusKey === 'converted_to_transaction' ? 'Resend Onboarding' : 'Create Transaction'}
                                          </Button>
                                        ) : null}
                                      </div>
                                    </div>
                                    {sellerReviewPreparationSummary.blockers.length ? (
                                      <div className="mt-3 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">
                                        {sellerReviewPreparationSummary.blockerText}
                                      </div>
                                    ) : null}
                                    {!sellerReviewPreparationSummary.blockers.length && sellerReviewPreparationSummary.warnings.length ? (
                                      <div className="mt-3 rounded-[14px] border border-[#f5d6a8] bg-[#fff8ed] px-3 py-2 text-sm text-[#9a5b11]">
                                        {sellerReviewPreparationSummary.warningText}
                                      </div>
                                    ) : null}
                                  </article>
                                )
                              })
                            ) : (
                              <div className="rounded-[16px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] p-5 text-sm text-[#6a8098]">
                                No offers have been sent yet. Select a property above and send a secure offer link when the buyer is ready.
                              </div>
                            )}
                          </div>
                        </section>
                      </div>

                      <aside className="space-y-5">
                        <section className="rounded-[20px] border border-[#dfe9f4] bg-white p-5 shadow-[0_16px_34px_rgba(31,54,78,0.05)]">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-[#385977]" />
                            <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#18324b]">Buyer Preview</h4>
                          </div>
                          <div className="mx-auto mt-5 max-w-[330px] rounded-[18px] border border-[#dfe9f4] bg-white p-4 shadow-[0_18px_40px_rgba(12,36,64,0.09)]">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-lg font-semibold text-[#0c2440]">{organisationName || 'Harcourts'}</p>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#5f7690]">
                                Secure Offer <ShieldCheck className="h-4 w-4 text-[#1c9f5c]" />
                              </span>
                            </div>
                            {selectedLeadOfferCentreProperty ? (
                              <>
                                <img src={selectedLeadOfferCentreProperty.image} alt="" className="mt-4 h-40 w-full rounded-[12px] object-cover" />
                                <h5 className="mt-4 text-lg font-semibold text-[#102942]">{selectedLeadOfferCentreProperty.title}</h5>
                                <p className="mt-1 text-sm leading-5 text-[#607891]">{selectedLeadOfferCentreProperty.address}</p>
                                <p className="mt-4 text-xl font-semibold text-[#0c2440]">{selectedLeadOfferCentreProperty.price}</p>
                                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[0.68rem] font-semibold text-[#5f7893]">
                                  <span>{selectedLeadOfferCentreProperty.bedrooms || '—'} Beds</span>
                                  <span>{selectedLeadOfferCentreProperty.bathrooms || '—'} Baths</span>
                                  <span>{selectedLeadOfferCentreProperty.parking || '—'} Garages</span>
                                  <span>{selectedLeadOfferCentreProperty.sizeLabel}</span>
                                </div>
                              </>
                            ) : null}
                            <div className="mt-4 flex items-center gap-3 rounded-[14px] bg-[#f5f8fb] p-3">
                              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#061d3b] text-sm font-semibold text-white">
                                {getInitials(selectedLead?.assignedAgentName || currentAgent.fullName || currentAgent.email)}
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-[#203a54]">{selectedLead?.assignedAgentName || currentAgent.fullName || 'Assigned agent'}</p>
                                <p className="text-xs text-[#6f849b]">Your Harcourts Agent</p>
                              </div>
                            </div>
                            <button type="button" className="mt-4 w-full rounded-[12px] bg-[#061d3b] px-4 py-3 text-sm font-semibold text-white">View Offer</button>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button type="button" className="rounded-[12px] border border-[#dfe9f4] px-3 py-2 text-xs font-semibold text-[#385977]">Request Info</button>
                              <button type="button" className="rounded-[12px] border border-[#dfe9f4] px-3 py-2 text-xs font-semibold text-[#385977]">Decline Offer</button>
                            </div>
                            <p className="mt-4 flex items-center justify-center gap-2 text-center text-[0.68rem] font-semibold text-[#8aa0b6]">
                              <Lock className="h-3.5 w-3.5" />
                              This link is unique to you and secure
                            </p>
                          </div>
                        </section>

                        <section className="rounded-[20px] border border-[#dfe9f4] bg-white p-5 shadow-[0_16px_34px_rgba(31,54,78,0.05)]">
                          <div className="flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 text-[#385977]" />
                            <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#18324b]">Transaction Conversion</h4>
                          </div>
                          <div className={`mt-4 rounded-[16px] border p-4 ${selectedLeadAcceptedOffer ? 'border-[#cfe8dc] bg-[#f2fbf5]' : 'border-[#f1dfb8] bg-[#fff8e8]'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-semibold text-[#5f7690]">Status</span>
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedLeadAcceptedOffer ? 'bg-[#dff5e8] text-[#17643a]' : 'bg-[#ffe9bd] text-[#9a6416]'}`}>
                                {selectedLeadAcceptedOffer ? 'Offer Accepted' : 'Awaiting Acceptance'}
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-[#5f7690]">
                              {selectedLeadAcceptedOffer ? 'Ready to create transaction.' : 'Once the buyer accepts the offer, you can create the transaction.'}
                            </p>
                          </div>
                          <Button
                            type="button"
                            disabled={!selectedLeadAcceptedOffer || canonicalOfferActionId === `${selectedLeadAcceptedOffer?.id}:convert`}
                            className="mt-4 w-full rounded-[12px] bg-[#061d3b] hover:bg-[#0a2a52]"
                            onClick={() => selectedLeadAcceptedOffer ? void handleLeadCanonicalOfferConversion(selectedLeadAcceptedOffer) : null}
                          >
                            Create Transaction
                          </Button>
                          {selectedLeadLifecycleDiagnosticError ? (
                            <div className="mt-3 rounded-[12px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">
                              {selectedLeadLifecycleDiagnosticError}
                            </div>
                          ) : null}
                          <div className="mt-4 grid gap-2">
                            {[
                              ['Offer converted', selectedLeadLifecycleDiagnostic?.checks?.offerConverted],
                              ['Transaction linked', selectedLeadLifecycleDiagnostic?.checks?.transactionLinked],
                              ['Onboarding ready', selectedLeadLifecycleDiagnostic?.checks?.onboardingReady],
                            ].map(([label, isDone]) => (
                              <div key={label} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e6eef7] bg-[#fbfdff] px-3 py-2">
                                <span className="text-xs font-semibold text-[#607891]">{label}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${isDone ? 'bg-[#eaf7ef] text-[#1e7a46]' : 'bg-[#f3f6f9] text-[#7b8fa5]'}`}>
                                  {selectedLeadLifecycleDiagnosticLoading ? 'Checking' : isDone ? 'OK' : 'Open'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </section>
                      </aside>
                    </div>
                  </div>
                  ) : null}

                  {leadWorkspaceTab === 'documents' ? (
                  <div className="space-y-4">
                    <section className="rounded-[18px] border border-[#e1eaf4] bg-white p-5 shadow-[0_12px_30px_rgba(31,54,78,0.05)]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">{selectedLeadIsSeller ? 'Seller Documents' : 'Buyer Documents'}</p>
                          <h4 className="mt-1 text-lg font-semibold text-[#18324b]">Documents</h4>
                          <p className="mt-1 text-sm text-[#6a8098]">{selectedLeadDisplayName}</p>
                        </div>
                        <Upload className="h-4 w-4 text-[#7890a8]" />
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        {(selectedLeadIsSeller ? [
                          ['Mandate', selectedSellerJourney.kpis.find((item) => item.key === 'mandate')?.value || 'Not started'],
                          ['Onboarding status', normalizeText(selectedLead?.sellerOnboardingStatus || selectedLead?.seller_onboarding_status) || 'Not started'],
                          ['Listing', selectedSellerJourney.kpis.find((item) => item.key === 'listing')?.value || 'Not created'],
                        ] : [
                          ['Buyer uploads', selectedLeadBuyerOnboardingSubmitted ? 'Submitted' : 'Pending'],
                          ['FICA', selectedLeadBuyerOnboardingSubmitted ? 'In review' : 'Not requested'],
                          ['Pre-approval docs', selectedLeadShowBondReadinessCta ? 'Ready to request' : selectedLeadFinanceReadinessSummary.confidenceLabel || 'Not captured'],
                        ]).map(([label, value]) => (
                          <div key={label} className="rounded-[14px] border border-[#e6eef7] bg-[#fbfdff] px-3 py-3">
                            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#8496aa]">{label}</p>
                            <p className="mt-1 break-all text-sm font-semibold text-[#203a54]">{value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-2" data-testid="seller-documents-list">
                        {(selectedLeadIsSeller ? selectedSellerJourney.documents : [
                          { id: 'buyer-upload', label: 'Buyer upload pack', status: selectedLeadBuyerOnboardingSubmitted ? 'Submitted' : 'Pending' },
                          { id: 'fica', label: 'FICA documents', status: selectedLeadBuyerOnboardingSubmitted ? 'In review' : 'Not requested' },
                          { id: 'otp', label: 'OTP / offer documents', status: selectedLeadOfferSummary.total ? `${selectedLeadOfferSummary.total} offer records` : 'No offer yet' },
                          { id: 'preapproval', label: 'Pre-approval documents', status: selectedLeadFinanceReadinessSummary.confidenceLabel || 'Not captured' },
                        ]).map((document) => (
                          <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e6eef7] bg-[#fbfdff] px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#203a54]">{document.label}</p>
                              <p className="mt-0.5 text-xs font-medium text-[#6a8098]">{document.status || 'Not uploaded'}</p>
                            </div>
                            {document.url ? (
                              <a href={document.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center justify-center rounded-[10px] border border-[#dbe4ee] bg-white px-3 text-xs font-semibold text-[#315b7a] hover:border-[#b9cde3]">
                                Open
                              </a>
                            ) : (
                              <span className="rounded-full bg-[#eef3f7] px-2.5 py-1 text-xs font-semibold text-[#7b8ca2]">Pending</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                  ) : null}

                  {leadWorkspaceTab === 'listing_journey' ? (
                  <div className="space-y-4">
                    <section className="rounded-[18px] border border-[#e1eaf4] bg-white p-5 shadow-[0_12px_30px_rgba(31,54,78,0.05)]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">Seller Flow</p>
                          <h4 className="mt-1 text-lg font-semibold text-[#18324b]">Listing Journey</h4>
                          <p className="mt-1 text-sm text-[#6a8098]">{selectedLeadPropertyLabel}</p>
                        </div>
                        {selectedSellerJourney.listingCreated ? (
                          <Button type="button" size="sm" variant="secondary" onClick={() => handleSellerJourneyAction('open_listing')}>
                            Open Listing
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {[
                          ['Listing Address', selectedSellerJourney.kpis.find((item) => item.key === 'property')?.value || selectedLeadPropertyLabel],
                          ['Listing Status', selectedSellerJourney.kpis.find((item) => item.key === 'listing')?.value || 'Not created'],
                          ['Visibility', normalizeText(selectedLeadLinkedListing?.listingVisibility || selectedLeadLinkedListing?.listing_visibility || selectedLeadLinkedListing?.visibility) || 'Internal'],
                          ['Created Date', formatDate(selectedLeadLinkedListing?.createdAt || selectedLeadLinkedListing?.created_at || selectedLead?.updatedAt || selectedLead?.createdAt)],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-[14px] border border-[#e6eef7] bg-[#fbfdff] px-3 py-3">
                            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#8496aa]">{label}</p>
                            <p className="mt-1 break-words text-sm font-semibold text-[#203a54]">{value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 rounded-[16px] border border-[#e6eef7] bg-[#fbfdff] p-4">
                        <div className="grid gap-3 md:grid-cols-5" data-testid="listing-journey-card">
                          {selectedSellerJourney.listingJourney.map((step) => {
                            return (
                              <div key={step.key} className={`flex items-center gap-2 rounded-[12px] border px-3 py-2 ${step.state === 'current' ? 'border-[#87c7a0] bg-[#f0fbf4]' : 'border-[#e0e8f2] bg-white'}`}>
                                <span className={`h-2.5 w-2.5 rounded-full ${step.state === 'upcoming' ? 'bg-[#cfdbe8]' : 'bg-[#2f9b69]'}`} />
                                <span className="text-sm font-semibold text-[#203a54]">{step.label}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </section>
                  </div>
                  ) : null}

                  </div>

                  {leadWorkspaceTab === 'activity' ? (
                  <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
                    <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Relationship Health</p>
                          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#102033]">{selectedLeadActivityInsights.healthLabel}</h3>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          selectedLeadActivityInsights.healthLabel === 'Strong Engagement'
                            ? 'bg-[#e8f7f1] text-[#1d7a52]'
                            : selectedLeadActivityInsights.healthLabel === 'Warm'
                              ? 'bg-[#fff4e5] text-[#b76a12]'
                              : 'bg-[#eef3f7] text-[#687c91]'
                        }`}>
                          {selectedLeadActivityInsights.temperature}
                        </span>
                      </div>
                      <div className="mt-5 space-y-4">
                        {[
                          ['Last Contacted', selectedLeadActivityInsights.lastContacted ? formatRelativeTime(selectedLeadActivityInsights.lastContacted) : 'No contact yet'],
                          ['Response Rate', selectedLeadActivityInsights.responseRate],
                          ['Lead Temperature', selectedLeadActivityInsights.temperature],
                        ].map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between gap-4 border-b border-[#eef3f7] pb-3 text-sm last:border-b-0 last:pb-0">
                            <span className="font-semibold text-[#8aa0b7]">{label}</span>
                            <span className="font-semibold text-[#20364c]">{value}</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[28px] bg-[#102033] p-6 text-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_44px_rgba(16,32,51,0.18)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a8bfd3]">Next Best Action</p>
                      <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">Send OTP before interest cools down.</h3>
                      <p className="mt-3 text-sm leading-6 text-[#c7d5e2]">
                        {selectedLeadWorkflowHealth.missing?.[0]?.label
                          ? `${selectedLeadWorkflowHealth.missing[0].label} is still open in this relationship.`
                          : 'This lead is moving cleanly. Keep the momentum visible in the timeline.'}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-5 bg-white text-[#102033] hover:bg-[#edf4fa]"
                        onClick={() => void handleCreateBuyerOfferDraft()}
                        disabled={selectedLeadIsSeller}
                      >
                        Generate OTP
                      </Button>
                      {!selectedLeadIsSeller ? (
                        <Button
                          type="button"
                          size="sm"
                          className="ml-2 mt-5"
                          disabled={canonicalOfferActionId === `lead:${selectedLead?.leadId}:buyer-onboarding`}
                          onClick={() => void handleSendBuyerOnboardingFromLead()}
                        >
                          {selectedLeadBuyerOnboardingActionLabel}
                        </Button>
                      ) : null}
                    </section>

                    <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Open Actions</p>
                          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#102033]">{selectedLeadOpenActions.pendingTasks.length} pending</h3>
                        </div>
                        {selectedLeadOpenActions.overdueCount ? (
                          <span className="rounded-full bg-[#fff1f0] px-3 py-1 text-xs font-semibold text-[#b42318]">
                            {selectedLeadOpenActions.overdueCount} overdue
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#eef8f2] px-3 py-1 text-xs font-semibold text-[#247345]">On track</span>
                        )}
                      </div>
                      <div className="mt-4 space-y-3">
                        {selectedLeadOpenActions.pendingTasks.slice(0, 3).length ? (
                          selectedLeadOpenActions.pendingTasks.slice(0, 3).map((action) => (
                            <div key={action.id} className="rounded-[18px] bg-[#f8fbfd] px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#20364c]">{action.label}</p>
                                  <p className={`mt-1 text-xs font-semibold ${action.overdue ? 'text-[#b42318]' : 'text-[#7b8fa5]'}`}>{action.meta}</p>
                                </div>
                                <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => void handleTaskStatusToggle(action.original)}>
                                  <CheckSquare className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[18px] bg-[#f8fbfd] px-4 py-4 text-sm text-[#6d839b]">
                            No pending tasks or follow-ups.
                          </div>
                        )}
                        {selectedLeadOpenActions.upcomingAppointment ? (
                          <button
                            type="button"
                            className="w-full rounded-[18px] bg-[#f3f7fb] px-4 py-3 text-left transition hover:bg-[#e7f0f8]"
                            onClick={() => handleOpenAppointmentModal(selectedLeadOpenActions.upcomingAppointment)}
                          >
                            <p className="text-sm font-semibold text-[#20364c]">Upcoming appointment</p>
                            <p className="mt-1 text-xs font-semibold text-[#7b8fa5]">
                              {formatDate(selectedLeadOpenActions.upcomingAppointment.dateTime || selectedLeadOpenActions.upcomingAppointment.date)}
                            </p>
                          </button>
                        ) : null}
                      </div>
                    </section>

                    <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Quick Actions</p>
                      <div className="mt-4 divide-y divide-[#eef3f7]">
                        {[
                          {
                            label: 'Schedule Viewing',
                            Icon: CalendarDays,
                            disabled: false,
                            onClick: () => handleOpenAppointmentModal(),
                          },
                          {
                            label: 'Generate OTP',
                            Icon: CheckSquare,
                            disabled: selectedLeadIsSeller,
                            onClick: () => void handleCreateBuyerOfferDraft(),
                          },
                          {
                            label: 'Send WhatsApp',
                            Icon: MessageCircle,
                            disabled: !normalizeText(selectedLeadContact?.phone || selectedLead?.phone),
                            onClick: () => {
                              const phone = normalizeText(selectedLeadContact?.phone || selectedLead?.phone).replace(/[^\d+]/g, '')
                              if (phone && typeof window !== 'undefined') window.open(`https://wa.me/${phone.replace(/^\+/, '')}`, '_blank', 'noopener,noreferrer')
                            },
                          },
                          {
                            label: 'Create Offer',
                            Icon: ArrowUpRight,
                            disabled: selectedLeadIsSeller,
                            onClick: () => void handleCreateBuyerOfferDraft(),
                          },
                          {
                            label: 'Assign Agent',
                            Icon: UserRound,
                            disabled: true,
                            onClick: () => {},
                          },
                        ].map(({ label, Icon: icon, disabled, onClick }) => (
                          <button
                            key={label}
                            type="button"
                            disabled={disabled}
                            onClick={onClick}
                            className="flex w-full items-center gap-3 py-3 text-left text-sm font-semibold text-[#29435d] transition hover:text-[#16395a] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#f3f7fb] text-[#315b7a]">
                              {createElement(icon, { className: 'h-4 w-4' })}
                            </span>
                            <span className="min-w-0 flex-1">{label}</span>
                            <ChevronRight className="h-4 w-4 text-[#9aacbf]" />
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Communication Snapshot</p>
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        {[
                          ['Calls', selectedLeadActivityInsights.counts.calls, Phone],
                          ['Meetings', selectedLeadActivityInsights.counts.meetings, CalendarDays],
                          ['Emails', selectedLeadActivityInsights.counts.emails, Mail],
                          ['WhatsApps', selectedLeadActivityInsights.counts.whatsapps, MessageCircle],
                        ].map(([label, value, icon]) => (
                          <div key={label} className="rounded-[18px] bg-[#f8fbfd] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8aa0b7]">{label}</span>
                              {createElement(icon, { className: 'h-4 w-4 text-[#7f96ad]' })}
                            </div>
                            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#102033]">{value}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </aside>
                  ) : null}

                  {leadWorkspaceTab === 'overview' ? (
                  <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
	                    <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.06)]">
	                      <div className="flex items-start justify-between gap-4">
	                        <div>
	                          <p className="text-xs font-semibold uppercase text-[#8aa0b7]">Workflow Progress</p>
	                          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#102033]">
	                            {selectedLeadWorkflowHealth.percent}%
	                          </p>
	                          <p className="mt-1 text-sm text-[#60758b]">{selectedLeadWorkflowHealth.completed}/{selectedLeadWorkflowHealth.total} lifecycle steps complete</p>
	                        </div>
	                        <span className="rounded-full bg-[#eef7f1] px-3 py-1 text-xs font-semibold text-[#247345]">
	                          {selectedLeadEffectiveLifecycleStage}
	                        </span>
	                      </div>
	                      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#e3ebf4]">
	                        <span className="block h-full rounded-full bg-[#2f7b9e] transition-all duration-500" style={{ width: `${selectedLeadWorkflowHealth.percent}%` }} />
	                      </div>
	                    </section>

	                    <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Linked Contact</p>
                      <div className="mt-5 flex items-center gap-4">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#eaf3fb] text-sm font-bold text-[#244f70]">
                          {getInitials(selectedLeadDisplayName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold text-[#102033]">{selectedLeadDisplayName}</p>
                          <p className="mt-1 text-sm text-[#60758b]">{selectedLeadIsSeller ? 'Seller contact' : 'Buyer contact'}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {selectedLeadContact?.phone ? (
                            <a href={`tel:${selectedLeadContact.phone}`} className="grid h-9 w-9 place-items-center rounded-full bg-[#f3f7fb] text-[#315b7a] transition hover:bg-[#e7f0f8]" title="Call contact">
                              <Phone className="h-4 w-4" />
                            </a>
                          ) : null}
                          {selectedLeadContact?.email ? (
                            <a href={`mailto:${selectedLeadContact.email}`} className="grid h-9 w-9 place-items-center rounded-full bg-[#f3f7fb] text-[#315b7a] transition hover:bg-[#e7f0f8]" title="Email contact">
                              <Mail className="h-4 w-4" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </section>

                    <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Lifecycle Timeline</p>
                      <div className="mt-5 space-y-4">
                        {selectedLeadWorkflowHealth.items?.map((item, index) => (
                          <div key={item.key} className="flex gap-3">
                            <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.done ? 'bg-[#2f9b69]' : index === selectedLeadWorkflowHealth.completed ? 'bg-[#2f7b9e]' : 'bg-[#d7e1ea]'}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-[#20364c]">{item.label}</p>
                                <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${item.done ? 'bg-[#eaf7ef] text-[#1e7a46]' : 'bg-[#f3f6f9] text-[#7b8fa5]'}`}>
                                  {item.done ? 'Done' : 'Open'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Linked Records</p>
                      <div className="mt-5 space-y-4">
                        {[
                          ['Listing', selectedLead.listingId || selectedLead.propertyInterest || selectedLead.sellerPropertyAddress || 'Not linked yet'],
                          ['Transaction', selectedLeadLinkedTransactionId || 'Not linked yet'],
                          ['Appointment', selectedLeadLinkedAppointment ? getAppointmentTypeLabel(selectedLeadLinkedAppointment.appointmentType) : 'Not linked yet'],
                        ].map(([label, value]) => (
                          <div key={label} className="flex items-start justify-between gap-4 border-b border-[#eef3f7] pb-3 text-sm last:border-b-0 last:pb-0">
                            <span className="font-semibold text-[#8aa0b7]">{label}</span>
                            <span className="max-w-[62%] text-right font-semibold text-[#20364c]">{value}</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">
                        {selectedLeadIsSeller ? 'Mandate / Listing' : 'Offers / Transaction'}
                      </p>
                      {selectedLeadIsSeller ? (
                        <div className="mt-5 space-y-4 text-sm">
                          <div>
                            <p className="font-semibold text-[#8aa0b7]">Mandate ID</p>
                            <p className="mt-1 break-all font-semibold text-[#20364c]">{normalizeText(selectedLead?.mandatePacketId || selectedLead?.mandatePacket?.id) || 'Not generated yet'}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#8aa0b7]">Listing ID</p>
                            <p className="mt-1 break-all font-semibold text-[#20364c]">{normalizeText(selectedLead?.listingId || selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress) || 'Not linked yet'}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-5 space-y-4 text-sm">
                          <div>
                            <p className="font-semibold text-[#8aa0b7]">Offers</p>
                            <p className="mt-1 font-semibold text-[#20364c]">{selectedLeadLinkedTransaction ? 'Offer linked to transaction' : 'No accepted offer linked yet'}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#8aa0b7]">Transaction</p>
                            <p className="mt-1 break-all font-semibold text-[#20364c]">{selectedLeadLinkedTransactionId || 'Not created yet'}</p>
                            {selectedLeadLinkedTransactionId ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="mt-3"
                                onClick={() => navigate(`/transactions/${selectedLeadLinkedTransactionId}`)}
                              >
                                Open Transaction
                                <ArrowUpRight className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8aa0b7]">Notes / Comments</p>
                      <div className="mt-4 text-sm leading-6 text-[#5f7590]">
                        {selectedLeadNotes || 'No notes yet.'}
                      </div>
                    </section>
                  </aside>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 rounded-[14px] border border-dashed border-[#d7e2ef] bg-[#f9fbfe] px-4 py-5 text-sm text-[#6f839c]">
                  {routeLeadId ? 'Opening this lead workspace. We are fetching the lead record and latest activity.' : 'Select a lead from the pipeline board to open the CRM workspace.'}
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
                onClick={() => updateLeadFormField('leadCategory', 'buyer')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  normalizeLeadCategory(leadForm.leadCategory, 'other') === 'buyer'
                    ? 'bg-[#1f4f78] text-white'
                    : 'text-[#51667f] hover:text-[#1f4f78]'
                }`}
              >
                Buyer Lead
              </button>
              <button
                type="button"
                onClick={() => setLeadForm((previous) => ({ ...previous, leadCategory: 'seller', linkedListing: '' }))}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  normalizeLeadCategory(leadForm.leadCategory, 'other') === 'seller'
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

          {normalizeLeadCategory(leadForm.leadCategory, 'other') === 'seller' ? (
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
        open={offerPropertySelectorOpen}
        onClose={() => {
          setOfferPropertySelectorOpen(false)
          setOfferPropertySearch('')
        }}
        title="Change Property"
        subtitle="Select the property this buyer should receive an offer link for."
        className="max-w-[980px]"
      >
        <div className="grid gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa0b6]" />
            <Field
              value={offerPropertySearch}
              onChange={(event) => setOfferPropertySearch(event.target.value)}
              placeholder="Search matched, saved, viewed, or active properties..."
              className="pl-9"
            />
          </div>

          <div className="grid max-h-[62vh] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
            {selectedLeadOfferPropertyOptions.length ? (
              selectedLeadOfferPropertyOptions.map((property) => {
                const isSelected = normalizeText(property.id) === normalizeText(offerLinkForm.listingId)
                return (
                  <button
                    key={property.id}
                    type="button"
                    onClick={() => {
                      setOfferLinkForm((previous) => ({
                        ...previous,
                        listingId: property.id,
                        appointmentId: '',
                        lastOfferLink: '',
                      }))
                      setOfferPropertySelectorOpen(false)
                      setOfferPropertySearch('')
                    }}
                    className={`grid grid-cols-[118px_1fr] gap-3 rounded-[18px] border bg-white p-3 text-left transition hover:border-[#9fb7d4] hover:shadow-[0_12px_28px_rgba(31,54,78,0.08)] ${
                      isSelected ? 'border-[#0b63f6] ring-2 ring-[#d9e8ff]' : 'border-[#dfe9f4]'
                    }`}
                  >
                    <img src={property.image} alt="" className="h-[104px] w-full rounded-[14px] object-cover" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#eef5ff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#0b63f6]">{property.source}</span>
                        <span className="rounded-full bg-[#edf9f1] px-2.5 py-1 text-[0.68rem] font-semibold text-[#17643a]">{property.match || selectedLeadBuyerMatchScore}% Match</span>
                      </div>
                      <h4 className="mt-2 truncate text-sm font-semibold text-[#18324b]">{property.title}</h4>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#607891]">{property.address}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-[#5f7893]">
                        <span>{property.price}</span>
                        <span>{property.bedrooms || '—'} Bed</span>
                        <span>{property.bathrooms || '—'} Bath</span>
                        <span>{property.parking || '—'} Garage</span>
                      </div>
                    </div>
                  </button>
                )
              })
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#d8e4f0] bg-[#fbfdff] p-6 text-sm text-[#6a8098] md:col-span-2">
                No properties match this search. Active listing data will appear here when available.
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={appointmentModalOpen}
        onClose={() => {
          setAppointmentModalOpen(false)
          setAppointmentSchedulingError('')
          setAppointmentSchedulingLoading(false)
        }}
        title={selectedAppointmentId ? 'Appointment Details' : 'Create Appointment'}
        subtitle={selectedAppointmentId ? 'Update appointment details.' : 'Quickly schedule an appointment.'}
        className="max-w-[900px]"
      >
        <form className="grid gap-4" onSubmit={handleSaveAppointmentDetail}>
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

          <section className="border-b border-[#e2eaf4] pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f839c]">Appointment Details</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold text-[#60758d]">
                Appointment title *
                <Field
                  placeholder="Property Viewing - 15 Ocean View Drive"
                  value={appointmentForm.title}
                  onChange={(event) => setAppointmentForm((previous) => ({ ...previous, title: event.target.value }))}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-[#60758d]">
                Appointment type *
                <Field as="select" value={appointmentForm.appointmentType} onChange={(event) => handleAppointmentTypeChange(event.target.value)}>
                  <option value="">Select appointment type</option>
                  {APPOINTMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Field>
              </label>
              {appointmentForm.appointmentType === 'other' ? (
                <label className="grid gap-1.5 text-xs font-semibold text-[#60758d]">
                  Custom type label
                  <Field
                    placeholder="Custom appointment type"
                    value={appointmentForm.customTypeLabel}
                    onChange={(event) => setAppointmentForm((previous) => ({ ...previous, customTypeLabel: event.target.value }))}
                  />
                </label>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_0.9fr_0.9fr_0.5fr]">
              <label className="grid gap-1.5 text-xs font-semibold text-[#60758d]">
                Date *
                <Field type="date" value={appointmentForm.date} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, date: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-[#60758d]">
                Start time *
                <Field type="time" value={appointmentForm.startTime} disabled={appointmentForm.allDay} onChange={(event) => handleAppointmentStartTimeChange(event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-[#60758d]">
                End time *
                <Field type="time" value={appointmentForm.endTime} disabled={appointmentForm.allDay} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, endTime: event.target.value }))} />
              </label>
              <div className="flex items-end pb-3 text-sm font-semibold text-[#6f839c]">{selectedAppointmentTemplate.defaultDurationMinutes} min</div>
            </div>
            <label className="mt-3 grid gap-1.5 text-xs font-semibold text-[#60758d]">
              {appointmentForm.locationType === 'phone_call' ? 'Phone number *' : appointmentForm.locationType === 'video_call' ? 'Meeting link *' : 'Location / meeting link *'}
              <div className="relative">
                <Field
                  className="pr-10"
                  placeholder={appointmentForm.locationType === 'phone_call' ? 'Phone number' : appointmentForm.locationType === 'video_call' ? 'https://meet.google.com/...' : '15 Ocean View Drive, Camps Bay, Cape Town'}
                  value={appointmentForm.locationType === 'video_call' ? appointmentForm.meetingUrl : appointmentForm.location}
                  onChange={(event) =>
                    setAppointmentForm((previous) => appointmentForm.locationType === 'video_call'
                      ? { ...previous, meetingUrl: event.target.value }
                      : { ...previous, location: event.target.value })
                  }
                />
                {(appointmentForm.location || appointmentForm.meetingUrl) ? (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6f839c]"
                    aria-label="Clear location"
                    onClick={() => setAppointmentForm((previous) => ({ ...previous, location: '', meetingUrl: '' }))}
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
            </label>
          </section>

          <section className="border-b border-[#e2eaf4] pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f839c]">Link Appointment</p>
            <div className="mt-3 flex gap-2">
              <Field as="select" value={selectedAppointmentLinkValue} onChange={(event) => handleAppointmentLinkChange(event.target.value)}>
                <option value="">Link to Lead / Listing / Transaction</option>
                {appointmentLinkOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.primaryLabel}{option.secondaryLabel ? ` · ${option.secondaryLabel}` : ''}
                  </option>
                ))}
              </Field>
              <button
                type="button"
                className="ui-icon-button h-12 w-12 shrink-0"
                onClick={() => handleAppointmentLinkChange('')}
                aria-label="Clear linked appointment record"
              >
                <X size={16} />
              </button>
            </div>
            {selectedAppointmentLinkOption ? (
              <p className="mt-2 text-xs text-[#6f839c]">{selectedAppointmentLinkOption.secondaryLabel || selectedAppointmentLinkOption.primaryLabel}</p>
            ) : null}
          </section>

          <section className="border-b border-[#e2eaf4] pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f839c]">Participants</p>
                <p className="mt-1 text-xs text-[#60758d]">Suggested from {selectedAppointmentLinkOption?.entityType || 'this appointment'}.</p>
              </div>
              <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0052cc]" onClick={() => setAppointmentManualParticipantOpen((previous) => !previous)}>
                <Plus size={16} /> Add other participant
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {appointmentSuggestedParticipants.length ? (
                appointmentSuggestedParticipants.map((participant) => {
                  const selected = !appointmentDeselectedParticipantKeys.includes(participant.suggestionKey)
                  return (
                    <button
                      key={participant.suggestionKey}
                      type="button"
                      onClick={() => handleToggleSuggestedAppointmentParticipant(participant)}
                      className={`flex min-w-0 items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition ${selected ? 'border-[#b9d5ff] bg-[#f4f8ff]' : 'border-[#dce6f2] bg-white'}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dce8fb] text-xs font-bold text-[#173b68]">{getInitials(participant.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#10233d]">{participant.name}</span>
                        <span className="block truncate text-xs text-[#60758d]">{participant.participantRole}</span>
                      </span>
                      <input type="checkbox" readOnly checked={selected} className="h-4 w-4 accent-[#0052cc]" aria-label={`${selected ? 'Remove' : 'Select'} ${participant.name}`} />
                    </button>
                  )
                })
              ) : (
                <p className="rounded-[10px] border border-dashed border-[#d5e1ee] bg-[#fbfdff] px-3 py-3 text-xs text-[#6f839c] md:col-span-3">
                  Link a record to suggest buyers, sellers, agents, and service providers automatically.
                </p>
              )}
            </div>
            {appointmentManualParticipantOpen ? (
              <div className="mt-3 rounded-[12px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                <div className="grid gap-2 md:grid-cols-4">
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
                </div>
                <div className="mt-2 flex justify-end">
                  <Button type="button" variant="secondary" onClick={handleAddParticipantToDraft}>
                    Add Participant
                  </Button>
                </div>
              </div>
            ) : null}
            {(appointmentForm.participants || []).length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {(appointmentForm.participants || []).map((participant, index) => (
                  <button
                    key={`${participant.participantId || participant.email || participant.name || index}`}
                    type="button"
                    onClick={() => handleRemoveParticipantFromDraft(index)}
                    className="rounded-full border border-[#dce6f2] bg-white px-3 py-1 text-xs font-semibold text-[#35546c]"
                  >
                    {participant.name || participant.email || 'Participant'} · Remove
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f839c]">Notes / Agenda (Optional)</p>
            <Field
              as="textarea"
              rows={3}
              placeholder="View property with the buyer and discuss offer strategy."
              value={appointmentForm.notes}
              onChange={(event) => setAppointmentForm((previous) => ({ ...previous, notes: event.target.value.slice(0, 500) }))}
              className="mt-3 min-h-[86px]"
            />
            <p className="mt-1 text-right text-xs text-[#7a8da3]">{normalizeText(appointmentForm.notes).length}/500</p>
          </section>

          <details className="rounded-[12px] border border-transparent">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#10233d]">
              Advanced options <ChevronRight size={16} />
            </summary>
            <div className="mt-3 grid gap-3 rounded-[14px] border border-[#e4ebf4] bg-[#fbfdff] p-3">
              <div className="grid gap-2 md:grid-cols-4">
                <Field as="select" value={appointmentForm.locationType} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, locationType: event.target.value }))}>
                  <option value="physical_address">Physical address</option>
                  <option value="video_call">Google Meet / Video Call</option>
                  <option value="phone_call">Phone Call</option>
                  <option value="to_be_confirmed">To be confirmed</option>
                </Field>
                <Field value={appointmentForm.timezone} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, timezone: event.target.value }))} />
                <Field as="select" value={appointmentForm.status} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, status: event.target.value }))}>
                  {APPOINTMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {APPOINTMENT_STATUS_LABELS[status] || status}
                    </option>
                  ))}
                </Field>
                <Field as="select" value={appointmentForm.visibility || selectedAppointmentTemplate.defaultVisibility} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, visibility: event.target.value }))}>
                  <option value="internal_only">Internal only</option>
                  <option value="client_visible">Client visible</option>
                  <option value="shared_role_players">Team visible</option>
                </Field>
                <Field as="select" value={appointmentForm.resourceId} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, resourceId: event.target.value }))}>
                  <option value="">No room/resource selected</option>
                  {appointmentResources.map((resource) => (
                    <option key={resource.resourceId} value={resource.resourceId}>
                      {safeDisplayText(resource.resourceName, 'Room / resource')}
                    </option>
                  ))}
                </Field>
                <Field placeholder="Recipient email" value={appointmentForm.recipientEmail || ''} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, recipientEmail: event.target.value }))} />
                <label className="flex items-center gap-2 rounded-[10px] border border-[#dce6f2] bg-white px-3 py-2 text-xs text-[#33536d]">
                  <input type="checkbox" checked={appointmentForm.allDay === true} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, allDay: event.target.checked }))} />
                  All-day appointment
                </label>
                <label className="flex items-center gap-2 rounded-[10px] border border-[#dce6f2] bg-white px-3 py-2 text-xs text-[#33536d]">
                  <input type="checkbox" checked={appointmentForm.participantDraft?.isRequired !== false} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, participantDraft: { ...previous.participantDraft, isRequired: event.target.checked } }))} />
                  Required attendee
                </label>
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
                {selectedAppointmentId ? (
                  <Button type="button" variant="secondary" onClick={handleOpenAppointmentRelatedRecord}>
                    Open Related Record
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-[10px] border border-[#e2eaf4] bg-white px-3 py-2">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Appointment Purpose</p>
                  <p className="mt-1 text-sm font-semibold text-[#203a52]">{selectedAppointmentTemplate.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[#5f7690]">{selectedAppointmentTemplate.description}</p>
                </div>
                <div className="rounded-[10px] border border-[#e2eaf4] bg-white px-3 py-2">
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
              <Field as="textarea" rows={2} placeholder="Client instructions" value={appointmentForm.instructions || ''} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, instructions: event.target.value }))} className="min-h-[72px]" />
              <div className="rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#28435e]">Availability & Conflict Checks</p>
                  {appointmentSchedulingLoading ? (
                    <span className="text-xs text-[#5f7690]">Checking availability...</span>
                  ) : (
                    <span className="text-xs text-[#5f7690]">Last checked: {appointmentSchedulingIntegrity?.checkedAt ? formatCompactDate(appointmentSchedulingIntegrity.checkedAt) : '—'}</span>
                  )}
                </div>
                {appointmentSchedulingError ? <div className="mt-2 rounded-[10px] border border-[#f2d0ce] bg-[#fff5f4] px-3 py-2 text-xs text-[#9f3028]">{appointmentSchedulingError}</div> : null}
                {appointmentHasHardConflicts ? (
                  <div className="mt-2 space-y-2">
                    {(appointmentSchedulingIntegrity?.hardConflicts || []).map((conflict, index) => (
                      <div key={`hard-${conflict.type || index}-${conflict.appointmentId || index}`} className={`rounded-[10px] border px-3 py-2 text-xs ${getConflictLevelTone(conflict.level)}`}>
                        <p className="font-semibold">Hard conflict: {conflict.message || 'Scheduling conflict detected.'}</p>
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
                        <p className="font-semibold text-[#28435e]">{availability?.name || availability?.email || availability?.role || 'Participant'}</p>
                        <p className={`mt-1 ${availability?.isAvailable ? 'text-[#1c7c4f]' : 'text-[#b26d22]'}`}>
                          {availability?.isAvailable ? 'Available in selected slot' : 'Potential overlap detected'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {Array.isArray(appointmentSchedulingIntegrity?.suggestedSlots) && appointmentSchedulingIntegrity.suggestedSlots.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {appointmentSchedulingIntegrity.suggestedSlots.slice(0, 4).map((slot) => (
                      <button
                        key={slot.start}
                        type="button"
                        onClick={() => setAppointmentForm((previous) => ({ ...previous, date: String(slot.start).slice(0, 10), startTime: String(slot.start).slice(11, 16), endTime: String(slot.end).slice(11, 16) }))}
                        className="rounded-full border border-[#dce6f2] bg-white px-3 py-1 text-xs font-semibold text-[#35546c]"
                      >
                        {slot.label || formatCompactDate(slot.start)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {selectedAppointmentId && (appointmentForm.participants || []).length ? (
                <div className="rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                  <p className="text-sm font-semibold text-[#28435e]">Participant RSVP</p>
                  <div className="mt-2 space-y-2">
                    {(appointmentForm.participants || []).map((participant, index) => (
                      <div key={`${participant.participantId || participant.email || participant.name || index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#e5ecf5] bg-[#fbfdff] px-3 py-2 text-xs">
                        <div>
                          <p className="font-semibold text-[#223f59]">{participant.name || participant.email || 'Participant'}</p>
                          <p className="mt-0.5 text-[#5e748d]">{participant.participantRole} · {participant.rsvpStatus} · {participant.isRequired === false ? 'Optional' : 'Required'}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {participant.participantId ? (
                            APPOINTMENT_RSVP_STATUSES.map((statusOption) => (
                              <button
                                key={statusOption}
                                type="button"
                                onClick={() => handleUpdateParticipantRsvp(participant, statusOption)}
                                className="rounded-full border border-[#dce6f2] px-2 py-0.5 text-[0.68rem] font-semibold text-[#35546c]"
                              >
                                {statusOption}
                              </button>
                            ))
                          ) : null}
                          <button type="button" className="rounded-full border border-[#dce6f2] px-2 py-0.5 text-[0.68rem] font-semibold text-[#35546c]" onClick={() => handleRemoveParticipantFromDraft(index)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedAppointmentId ? (
                <div className="rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                  <p className="text-sm font-semibold text-[#28435e]">Outcome & Follow-up</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <Field placeholder="Outcome summary" value={appointmentOutcomeForm.outcomeSummary} onChange={(event) => setAppointmentOutcomeForm((previous) => ({ ...previous, outcomeSummary: event.target.value }))} />
                    <Field placeholder="Client feedback" value={appointmentOutcomeForm.clientFeedback} onChange={(event) => setAppointmentOutcomeForm((previous) => ({ ...previous, clientFeedback: event.target.value }))} />
                    <Field placeholder="Next step" value={appointmentOutcomeForm.nextStep} onChange={(event) => setAppointmentOutcomeForm((previous) => ({ ...previous, nextStep: event.target.value }))} />
                    <Field type="date" value={appointmentOutcomeForm.followUpDate} onChange={(event) => setAppointmentOutcomeForm((previous) => ({ ...previous, followUpDate: event.target.value }))} />
                  </div>
                  <Field as="textarea" rows={2} placeholder="Agent notes" value={appointmentOutcomeForm.agentNotes} onChange={(event) => setAppointmentOutcomeForm((previous) => ({ ...previous, agentNotes: event.target.value }))} className="mt-2 min-h-[72px]" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={handleSaveAppointmentOutcome} disabled={!selectedAppointmentId}>
                      Save Outcome
                    </Button>
                    <Button type="button" variant="secondary" onClick={handleCreateFollowUpTaskFromAppointment} disabled={!selectedAppointment?.leadId}>
                      Create Follow-up Task
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </details>

          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#6f839c]">
              {selectedSuggestedAppointmentParticipants.length} participant{selectedSuggestedAppointmentParticipants.length === 1 ? '' : 's'} selected
            </span>
            <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAppointmentModalOpen(false)
                setAppointmentSchedulingError('')
                setAppointmentSchedulingLoading(false)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!appointmentCanSave}>
              {selectedAppointmentId ? 'Save Appointment' : 'Create Appointment'}
            </Button>
            </div>
          </div>
        </form>
      </Modal>

      <LegalDocumentWorkspace
        open={legalWorkspaceOpen}
        onClose={() => setLegalWorkspaceOpen(false)}
        transactionId={selectedLeadLinkedTransactionId}
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
        onViewSigned={handleWorkspaceViewSignedMandate}
        onRefreshContext={async () => {
          if (!organisationId) return
          await reloadRecords(organisationId)
        }}
      />
    </section>
  )
}

export default AgencyPipelinePage
