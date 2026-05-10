import { CalendarDays, CheckSquare, ClipboardList, Plus, TrendingUp, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import AppointmentCalendarActions from '../../components/appointments/AppointmentCalendarActions'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  ACTIVITY_TYPES,
  APPOINTMENT_PARTICIPANT_ROLES,
  APPOINTMENT_RSVP_STATUSES,
  APPOINTMENT_STATUSES,
  LEAD_PRIORITIES,
  LEAD_STAGES,
  TASK_PRIORITIES,
  addAppointmentOutcomeAsync,
  buildAppointmentsDashboardSummary,
  buildPipelineMetrics,
  buildPrincipalReporting,
  convertLeadToDealRecord,
  createAppointmentAsync,
  createAgencyLead,
  createLeadTask,
  getAgencyCrmUpdatedEventName,
  getAgencyPipelineSnapshot,
  checkAppointmentSchedulingIntegrityAsync,
  listAppointmentsAsync,
  listAppointmentResourcesAsync,
  recoverAgencyPipelineStoreForOrganisation,
  updateAppointmentAsync,
  updateAppointmentParticipantRsvpAsync,
  updateAgencyLead,
  updateLeadTask,
  addLeadActivity,
} from '../../lib/agencyPipelineService'
import { listOrganisationUsers, fetchOrganisationSettings } from '../../lib/settingsApi'
import { canAccessPrincipalExperience, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import Modal from '../../components/ui/Modal'
import {
  buildSellerWorkspaceLink,
  buildSellerOnboardingLink,
  createAgentSellerLead,
  createListingDraftFromSellerLead,
  generateSellerOnboardingToken,
  LISTING_STATUS,
  SELLER_ONBOARDING_STATUS,
  updateAgentSellerLead,
  updateSellerWorkflowRecordByToken,
} from '../../lib/agentListingStorage'
import { MOCK_DATA_ENABLED } from '../../lib/mockData'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { createPrivateListing, createPrivateListingActivity, sendSellerOnboarding, updatePrivateListing } from '../../services/privateListingService'
import { generatePacketVersion, generateSigningLinks, listPacketTemplates, prepareSigningFields } from '../../core/documents/packetService'
import { createDocumentPacket } from '../../lib/documentPacketsApi'
import { getAppointmentTypeLabel, getAppointmentTypeOptions } from '../../lib/appointmentTypeDefinitions'
import {
  applyAppointmentTemplate,
  getAppointmentRequiredPrep,
  getAppointmentTemplateInstructions,
  getAppointmentTypeTemplate,
} from '../../services/appointmentTemplateService'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
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

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-ZA')
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

function toWhatsappHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  const normalized = digits.startsWith('27') ? digits : digits.startsWith('0') ? `27${digits.slice(1)}` : digits
  return `https://wa.me/${normalized}`
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

function isMissingSchemaOrTableError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message).toLowerCase()
  return code === '42P01' || code === 'PGRST204' || code === 'PGRST205' || message.includes('schema cache')
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
  const template = getAppointmentTypeTemplate(type)
  const mergedSeed = {
    ...LEAD_DETAIL_DEFAULT_APPOINTMENT,
    ...seed,
    appointmentType: template.type,
  }
  const withTemplate = applyAppointmentTemplate(template.type, mergedSeed)

  const startTime = normalizeText(withTemplate.startTime || withTemplate.start_time || mergedSeed.startTime)
  const defaultDuration = Number(template.defaultDurationMinutes || 45)
  const computedEnd = (() => {
    const startMinutes = parseTimeToMinutes(startTime)
    if (!Number.isFinite(startMinutes)) return normalizeText(withTemplate.endTime || mergedSeed.endTime)
    return formatMinutesToTime(startMinutes + defaultDuration)
  })()

  return {
    ...mergedSeed,
    appointmentType: template.type,
    title: normalizeText(withTemplate.title) || template.label,
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
  const dateTimeCandidate = appointment?.dateTime ? new Date(appointment.dateTime) : null
  if (dateTimeCandidate && !Number.isNaN(dateTimeCandidate.getTime())) {
    return dateTimeCandidate
  }
  if (appointment?.date) {
    const dateCandidate = new Date(`${appointment.date}T00:00:00`)
    if (!Number.isNaN(dateCandidate.getTime())) {
      return dateCandidate
    }
  }
  return null
}

function formatCalendarPeriodLabel(view, anchorDate) {
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
  appointmentType: 'viewing',
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  location: '',
  visibility: 'client_visible',
  linkedWorkflow: '',
  linkedWorkflowStage: '',
  completionBehavior: '',
  instructions: '',
  internalInstructions: '',
  requiredDocuments: [],
  reminderRules: [],
  workflowCompletionEffect: {},
  status: 'Pending Confirmation',
  listingId: '',
  transactionId: '',
  contactId: '',
  resourceId: '',
  allowOutsideBusinessHours: false,
  schedulingOverrideReason: '',
  notes: '',
  participants: [],
  participantDraft: {
    name: '',
    email: '',
    phone: '',
    participantRole: 'Buyer',
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
  stage: 'New Lead',
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

function AgencyPipelinePage({ initialViewMode = 'pipeline' } = {}) {
  const navigate = useNavigate()
  const { leadId: routeLeadIdParam = '' } = useParams()
  const routeLeadId = normalizeText(routeLeadIdParam)
  const isLeadWorkspaceRoute = !initialViewMode || (initialViewMode !== 'calendar' && routeLeadId.length > 0)
  const { role, profile } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [organisationId, setOrganisationId] = useState('')
  const [users, setUsers] = useState([])
  const [records, setRecords] = useState({
    contacts: [],
    leads: [],
    leadActivities: [],
    tasks: [],
    appointments: [],
    deals: [],
  })
  const isCalendarMode = initialViewMode === 'calendar'
  const isOverviewMode = initialViewMode === 'overview'
  const [leadTypeView, setLeadTypeView] = useState('buyer')
  const [leadFilter, setLeadFilter] = useState({
    search: '',
    source: 'all',
    stage: 'all',
    agent: 'all',
    sort: 'newest',
  })
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [leadForm, setLeadForm] = useState(NEW_LEAD_DEFAULTS)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [activityForm, setActivityForm] = useState(LEAD_DETAIL_DEFAULT_ACTIVITY)
  const [taskForm, setTaskForm] = useState(LEAD_DETAIL_DEFAULT_TASK)
  const [appointmentForm, setAppointmentForm] = useState(() => buildDefaultAppointmentFormForType('viewing', LEAD_DETAIL_DEFAULT_APPOINTMENT))
  const [calendarView, setCalendarView] = useState('week')
  const [calendarCursorDate, setCalendarCursorDate] = useState(() => new Date())
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
  const [appointmentSchedulingIntegrity, setAppointmentSchedulingIntegrity] = useState(null)
  const [appointmentSchedulingLoading, setAppointmentSchedulingLoading] = useState(false)
  const [appointmentSchedulingError, setAppointmentSchedulingError] = useState('')
  const [isMandateGenerating, setIsMandateGenerating] = useState(false)

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

  const buildAppointmentDraftForIntegrity = useCallback(() => {
    const selectedAppointmentForDraft = selectedAppointmentId
      ? (records.appointments.find(
          (appointment) => normalizeText(appointment?.appointmentId) === normalizeText(selectedAppointmentId),
        ) || null)
      : null

    const selectedLeadForDraft = (() => {
      if (selectedLeadId) {
        const byLeadId = records.leads.find((lead) => normalizeText(lead?.leadId) === normalizeText(selectedLeadId))
        if (byLeadId) return byLeadId
      }
      const linkedLeadId = normalizeText(selectedAppointmentForDraft?.leadId)
      if (linkedLeadId) {
        return records.leads.find((lead) => normalizeText(lead?.leadId) === linkedLeadId) || null
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
      const snapshot = getAgencyPipelineSnapshot(orgId)
      let mergedSnapshot = snapshot
      if (isSupabaseConfigured && supabase && isUuidLike(orgId)) {
        try {
          const [leadResult, contactResult] = await Promise.all([
            supabase
              .from('leads')
              .select('lead_id, organisation_id, assigned_agent_id, contact_id, lead_category, lead_direction, lead_source, stage, status, priority, budget, area_interest, property_interest, seller_property_address, estimated_value, notes, converted_transaction_id, created_at, updated_at')
              .eq('organisation_id', orgId)
              .order('updated_at', { ascending: false }),
            supabase
              .from('contacts')
              .select('contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, created_at, updated_at')
              .eq('organisation_id', orgId)
              .order('updated_at', { ascending: false }),
          ])

          const leadError = leadResult?.error || null
          const contactError = contactResult?.error || null
          const leadBlocked = leadError && (isPermissionDeniedError(leadError) || isMissingSchemaOrTableError(leadError))
          const contactBlocked = contactError && (isPermissionDeniedError(contactError) || isMissingSchemaOrTableError(contactError))
          if (leadError && !leadBlocked) throw leadError
          if (contactError && !contactBlocked) throw contactError

          const supabaseContacts = Array.isArray(contactResult?.data)
            ? contactResult.data.map((row) => ({
                contactId: normalizeText(row?.contact_id),
                organisationId: normalizeText(row?.organisation_id),
                assignedAgentId: normalizeText(row?.assigned_agent_id),
                assignedAgentName: '',
                assignedAgentEmail: '',
                firstName: normalizeText(row?.first_name),
                lastName: normalizeText(row?.last_name),
                phone: normalizeText(row?.phone),
                email: normalizeText(row?.email).toLowerCase(),
                contactType: normalizeText(row?.contact_type) || 'Lead',
                notes: normalizeText(row?.notes),
                createdAt: row?.created_at || new Date().toISOString(),
                updatedAt: row?.updated_at || new Date().toISOString(),
              }))
            : []

          const supabaseLeads = Array.isArray(leadResult?.data)
            ? leadResult.data.map((row) => ({
                leadId: normalizeText(row?.lead_id),
                organisationId: normalizeText(row?.organisation_id),
                assignedAgentId: normalizeText(row?.assigned_agent_id),
                assignedAgentName: '',
                assignedAgentEmail: '',
                contactId: normalizeText(row?.contact_id),
                leadCategory: normalizeText(row?.lead_category) || 'Buyer',
                leadDirection: normalizeText(row?.lead_direction) || 'Inbound',
                leadSource: normalizeText(row?.lead_source) || 'Other',
                stage: normalizeText(row?.stage) || 'New Lead',
                status: normalizeText(row?.status) || normalizeText(row?.stage) || 'New Lead',
                priority: normalizeText(row?.priority) || 'Medium',
                budget: Number(row?.budget || 0) || 0,
                areaInterest: normalizeText(row?.area_interest),
                propertyInterest: normalizeText(row?.property_interest),
                sellerPropertyAddress: normalizeText(row?.seller_property_address),
                estimatedValue: Number(row?.estimated_value || 0) || 0,
                notes: normalizeText(row?.notes),
                sellerOnboardingToken: '',
                sellerOnboardingLink: '',
                sellerOnboardingStatus: '',
                sellerWorkflowLeadId: '',
                mandatePacketId: '',
                listingId: '',
                createdAt: row?.created_at || new Date().toISOString(),
                updatedAt: row?.updated_at || new Date().toISOString(),
                convertedDealId: normalizeText(row?.converted_transaction_id) || null,
                convertedTransactionId: normalizeText(row?.converted_transaction_id) || null,
              }))
            : []

          mergedSnapshot = {
            ...snapshot,
            contacts: dedupeByKey([...(snapshot.contacts || []), ...supabaseContacts], (row) => row?.contactId),
            leads: dedupeByKey([...(snapshot.leads || []), ...supabaseLeads], (row) => row?.leadId),
          }
        } catch (dbLoadError) {
          console.warn('[PIPELINE] supabase lead/contact load failed; using local snapshot only.', dbLoadError)
        }
      }
      const agentKey = normalizeKey(currentAgent.id || currentAgent.email)

      // Demo-stability mode: keep lead visibility org-wide until assignment scoping is fully stabilized.
      const scopedLeads = mergedSnapshot.leads

      const scopedLeadIds = new Set(scopedLeads.map((lead) => normalizeText(lead?.leadId)))
      const scopedTasks = mergedSnapshot.tasks.filter((task) => scopedLeadIds.has(normalizeText(task?.leadId)))
      const appointmentRows = await listAppointmentsAsync(orgId, {
        includeAll: isPrincipal,
        agentId: isPrincipal ? '' : normalizeText(currentAgent.id || currentAgent.email),
      })
      const scopedAppointments = appointmentRows.filter((row) => {
        if (isPrincipal) return true
        const linkedLeadId = normalizeText(row?.leadId)
        if (linkedLeadId && scopedLeadIds.has(linkedLeadId)) return true
        const assignedId = normalizeKey(row?.assignedAgentId)
        const assignedEmail = normalizeKey(row?.assignedAgentEmail)
        return assignedId === agentKey || assignedEmail === agentKey
      })
      const scopedActivities = mergedSnapshot.leadActivities.filter((row) => scopedLeadIds.has(normalizeText(row?.leadId)))
      const scopedDeals = mergedSnapshot.deals.filter((row) => scopedLeadIds.has(normalizeText(row?.leadId)))

      setRecords({
        contacts: mergedSnapshot.contacts,
        leads: scopedLeads,
        leadActivities: scopedActivities,
        tasks: scopedTasks,
        appointments: scopedAppointments,
        deals: scopedDeals,
      })
    },
    [currentAgent.email, currentAgent.id, isPrincipal],
  )

  const loadContext = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [contextResult, usersResult] = await Promise.allSettled([fetchOrganisationSettings(), listOrganisationUsers()])
      const contextError = contextResult.status === 'rejected' ? contextResult.reason : null
      const usersError = usersResult.status === 'rejected' ? usersResult.reason : null
      const contextDenied = isPermissionDeniedError(contextError)
      const usersDenied = isPermissionDeniedError(usersError)

      if (contextError && !contextDenied) {
        throw contextError
      }
      if (usersError && !usersDenied) {
        throw usersError
      }

      const context = contextResult.status === 'fulfilled' ? contextResult.value : null
      const organisationUsers = usersResult.status === 'fulfilled' ? usersResult.value : []
      const rawOrganisationId = normalizeText(context?.organisation?.id)
      const resolvedOrgId = isUuidLike(rawOrganisationId) ? rawOrganisationId : ''
      const storageOrgId = resolvedOrgId || 'default'
      const fallbackMembershipRole = role === 'agent' ? 'agent' : 'viewer'
      const resolvedMembershipRole = normalizeText(context?.membershipRole || fallbackMembershipRole) || fallbackMembershipRole

      setOrganisationId(resolvedOrgId)
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
      await reloadRecords(storageOrgId)
      if (!resolvedOrgId) {
        setError('Organisation membership is not active for this account yet. Add/accept your organisation membership, then refresh.')
      }
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load agency pipeline data.')
    } finally {
      setLoading(false)
    }
  }, [currentAgent.email, currentAgent.fullName, currentAgent.id, profile?.firstName, profile?.lastName, reloadRecords, role])

  useEffect(() => {
    void loadContext()
  }, [loadContext])

  useEffect(() => {
    if (!organisationId) return
    const eventName = getAgencyCrmUpdatedEventName()
    const handler = () => {
      void reloadRecords(organisationId)
    }
    window.addEventListener(eventName, handler)
    return () => {
      window.removeEventListener(eventName, handler)
    }
  }, [organisationId, reloadRecords])

  useEffect(() => {
    if (!organisationId) return
    const handler = (event) => {
      const token = normalizeText(event?.detail?.token)
      if (!token) return
      const lead = records.leads.find((row) => normalizeText(row?.sellerOnboardingToken) === token)
      if (!lead?.leadId) return

      updateAgencyLead(organisationId, lead.leadId, {
        stage: 'Onboarding Completed',
        status: 'Onboarding Completed',
        sellerOnboardingStatus: 'completed',
      })
      addLeadActivity(organisationId, lead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Seller Onboarding Submitted',
        activityNote: 'seller_onboarding_submitted',
        outcome: 'Onboarding completed',
      })
      setMessage('Seller onboarding submitted. Lead moved to onboarding completed.')
      void reloadRecords(organisationId)
    }

    window.addEventListener('itg:seller-onboarding-submitted', handler)
    return () => {
      window.removeEventListener('itg:seller-onboarding-submitted', handler)
    }
  }, [currentAgent.email, currentAgent.fullName, currentAgent.id, organisationId, records.leads, reloadRecords])

  useEffect(() => {
    if (!organisationId) return
    const handler = (event) => {
      const token = normalizeText(event?.detail?.token)
      if (!token) return
      const lead = records.leads.find((row) => normalizeText(row?.sellerOnboardingToken) === token)
      if (!lead?.leadId) return

      updateAgencyLead(organisationId, lead.leadId, {
        stage: 'Mandate Signed',
        status: 'Mandate Signed',
      })
      addLeadActivity(organisationId, lead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Mandate Signed',
        activityNote: 'mandate_signed',
        outcome: event?.detail?.listingActivated ? 'Listing activated' : 'Signed',
      })
      setMessage(
        event?.detail?.listingActivated
          ? 'Mandate signed. Listing is now ready for active workflow.'
          : 'Mandate signed.',
      )
      void reloadRecords(organisationId)
    }

    window.addEventListener('itg:seller-mandate-signed', handler)
    return () => {
      window.removeEventListener('itg:seller-mandate-signed', handler)
    }
  }, [currentAgent.email, currentAgent.fullName, currentAgent.id, organisationId, records.leads, reloadRecords])

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
  }, [routeLeadId])

  useEffect(() => {
    if (!routeLeadId || !records.leads.length) return
    const routeLead = records.leads.find((row) => normalizeText(row?.leadId) === routeLeadId)
    if (!routeLead) return
    const category = normalizeText(routeLead?.leadCategory).toLowerCase() === 'seller' ? 'seller' : 'buyer'
    if (leadTypeView !== category) {
      setLeadTypeView(category)
    }
  }, [leadTypeView, records.leads, routeLeadId])

  useEffect(() => {
    if (isLeadWorkspaceRoute) {
      if (selectedLeadId && !records.leads.some((row) => row.leadId === selectedLeadId)) {
        setSelectedLeadId('')
      }
      return
    }
    if (!selectedLeadId && records.leads.length) {
      setSelectedLeadId(records.leads[0].leadId)
    }
    if (selectedLeadId && !records.leads.some((row) => row.leadId === selectedLeadId)) {
      setSelectedLeadId(records.leads[0]?.leadId || '')
    }
  }, [isLeadWorkspaceRoute, records.leads, selectedLeadId])

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
      const contact = records.contacts.find((row) => normalizeText(row?.contactId) === normalizeText(lead?.contactId))
      const categoryMatch = normalizeText(lead?.leadCategory).toLowerCase() === categoryValue
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
      const stageMatch = leadFilter.stage === 'all' ? true : normalizeText(lead?.stage) === leadFilter.stage
      const agentMatch =
        leadFilter.agent === 'all'
          ? true
          : normalizeKey(lead?.assignedAgentId) === normalizeKey(leadFilter.agent) ||
            normalizeKey(lead?.assignedAgentEmail) === normalizeKey(leadFilter.agent)

      return categoryMatch && searchMatch && sourceMatch && stageMatch && agentMatch
    })

    return visibleRows.sort((left, right) => {
      if (leadFilter.sort === 'stage') {
        return normalizeText(left?.stage).localeCompare(normalizeText(right?.stage))
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
  }, [leadFilter.agent, leadFilter.search, leadFilter.source, leadFilter.sort, leadFilter.stage, leadTypeView, records.contacts, records.leads, records.tasks])

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
    if (selectedLeadId && !filteredLeads.some((row) => row.leadId === selectedLeadId)) {
      setSelectedLeadId(filteredLeads[0]?.leadId || '')
    }
  }, [filteredLeads, isLeadWorkspaceRoute, selectedLeadId])

  const allLeadById = useMemo(() => {
    const map = new Map()
    for (const lead of records.leads) {
      map.set(lead.leadId, lead)
    }
    return map
  }, [records.leads])

  const leadById = useMemo(() => {
    const map = new Map()
    for (const lead of filteredLeads) {
      map.set(lead.leadId, lead)
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

  const selectedLead = selectedLeadId ? (allLeadById.get(selectedLeadId) || leadById.get(selectedLeadId) || null) : null

  const selectedLeadContact = useMemo(() => {
    if (!selectedLead) return null
    return records.contacts.find((contact) => normalizeText(contact?.contactId) === normalizeText(selectedLead.contactId)) || null
  }, [records.contacts, selectedLead])

  const selectedLeadActivities = useMemo(() => {
    if (!selectedLead) return []
    return records.leadActivities
      .filter((row) => normalizeText(row?.leadId) === normalizeText(selectedLead.leadId))
      .sort((a, b) => new Date(b.activityDate || b.createdAt || 0) - new Date(a.activityDate || a.createdAt || 0))
  }, [records.leadActivities, selectedLead])

  const selectedLeadTasks = useMemo(() => {
    if (!selectedLead) return []
    return records.tasks
      .filter((row) => normalizeText(row?.leadId) === normalizeText(selectedLead.leadId))
      .sort((a, b) => new Date(a.dueDate || a.createdAt || 0) - new Date(b.dueDate || b.createdAt || 0))
  }, [records.tasks, selectedLead])

  const selectedLeadAppointments = useMemo(() => {
    if (!selectedLead) return []
    return records.appointments
      .filter((row) => normalizeText(row?.leadId) === normalizeText(selectedLead.leadId))
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
        .filter((row) => normalizeText(row?.leadId) === normalizeText(selectedLead?.leadId))
        .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0] || null
    )
  }, [records.deals, selectedLead])

  const selectedLeadNotes = useMemo(() => {
    if (!selectedLead) return ''
    return normalizeText(selectedLead.notes || selectedLead.internalNotes || selectedLead.nextFollowUpNote || '')
  }, [selectedLead])

  const selectedLeadIsSeller = normalizeText(selectedLead?.leadCategory).toLowerCase() === 'seller'
  const selectedLeadStageKey = normalizeText(selectedLead?.stage).toLowerCase()
  const selectedLeadPropertyArea = normalizeText(selectedLead?.sellerPropertyAddress || selectedLead?.areaInterest)
  const selectedLeadPropertyType = normalizeText(selectedLead?.propertyInterest)
  const selectedLeadHasMandateData = Boolean(
    selectedLead &&
      selectedLeadContact &&
      normalizeText(selectedLeadContact?.firstName || selectedLeadContact?.lastName) &&
      normalizeText(selectedLeadContact?.phone) &&
      (selectedLeadPropertyArea || normalizeText(selectedLead?.propertyInterest || selectedLead?.listingId)),
  )
  const selectedLeadOnboardingCompleted = selectedLeadStageKey.includes('onboarding completed')
  const selectedLeadMandateSigned = selectedLeadStageKey.includes('mandate signed')

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
    const hasMandate = Boolean(normalizeText(selectedLead?.mandatePacketId || selectedLead?.mandatePacket?.id))
    const mandateSigned = stage.includes('mandate signed') || hasListing
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
  }, [selectedLead, selectedLeadAppointments, selectedLeadLinkedTransaction])

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
    return buildAppointmentsDashboardSummary(records.appointments, { now: new Date() })
  }, [organisationId, records.appointments])

  const selectedAppointment = useMemo(() => {
    if (!selectedAppointmentId) return null
    return records.appointments.find((appointment) => normalizeText(appointment?.appointmentId) === normalizeText(selectedAppointmentId)) || null
  }, [records.appointments, selectedAppointmentId])

  const selectedAppointmentTemplate = useMemo(
    () => getAppointmentTypeTemplate(appointmentForm.appointmentType || 'viewing'),
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
    return getAppointmentRequiredPrep(appointmentForm.appointmentType || 'viewing', transactionContext)
  }, [appointmentForm.appointmentType, appointmentForm.requiredDocuments])

  const calendarAppointmentsByDate = useMemo(() => {
    const groups = new Map()
    for (const appointment of records.appointments) {
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
  }, [records.appointments])

  const weekDays = useMemo(() => getWeekDays(calendarCursorDate), [calendarCursorDate])
  const monthDays = useMemo(() => getMonthGridDays(calendarCursorDate), [calendarCursorDate])
  const visibleCalendarDays = calendarView === 'month' ? monthDays : weekDays
  const calendarPeriodLabel = useMemo(
    () => formatCalendarPeriodLabel(calendarView, calendarCursorDate),
    [calendarCursorDate, calendarView],
  )

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

  function updateLeadFormField(key, value) {
    setLeadForm((previous) => ({ ...previous, [key]: value }))
  }

  async function handleCreateLead(event) {
    event.preventDefault()
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
    if (normalizeText(leadForm.leadCategory).toLowerCase() === 'seller') {
      if (!normalizeText(leadForm.propertyArea) || !normalizeText(leadForm.propertyType)) {
        setError('Property area and property type are required for seller leads.')
        return
      }
    }

    const assignedAgent = resolveAgentById(selectedAgentId || currentAgent.id)
    try {
      const createdLead = createAgencyLead(
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
          budget: Number(leadForm.budget || 0) || 0,
          estimatedValue: Number(leadForm.estimatedValue || 0) || 0,
          areaInterest: normalizeText(leadForm.areaInterest || leadForm.propertyArea),
          propertyInterest: normalizeText(leadForm.propertyInterest || leadForm.linkedListing || leadForm.propertyType),
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
      if (normalizeText(leadForm.nextFollowUpDate)) {
        createLeadTask(
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
        )
      }
      addLeadActivity(organisationId, createdLead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Lead Created',
        activityNote: 'lead_created',
        outcome: 'Manual lead captured',
        activityDate: new Date().toISOString(),
      })
      if (isSupabaseConfigured && supabase && isUuidLike(organisationId)) {
        try {
          const createdContact = normalizeText(createdLead?.contactId)
            ? (records.contacts || []).find((row) => normalizeText(row?.contactId) === normalizeText(createdLead.contactId))
            : null
          if (normalizeText(createdLead?.contactId)) {
            await supabase.from('contacts').upsert({
              contact_id: normalizeText(createdLead.contactId),
              organisation_id: organisationId,
              assigned_agent_id: normalizeText(createdLead?.assignedAgentId) || null,
              first_name: normalizeText(createdContact?.firstName || leadForm.firstName),
              last_name: normalizeText(createdContact?.lastName || leadForm.lastName),
              phone: normalizeText(createdContact?.phone || leadForm.phone) || null,
              email: normalizeText(createdContact?.email || leadForm.email).toLowerCase() || null,
              contact_type: normalizeText(createdContact?.contactType || leadForm.leadCategory) || 'Lead',
              notes: normalizeText(createdContact?.notes || leadForm.notes) || null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'contact_id' })
          }

          const dbLeadId = normalizeLeadUuid(createdLead?.leadId)
          if (dbLeadId) {
            await supabase.from('leads').upsert({
              lead_id: dbLeadId,
              organisation_id: organisationId,
              assigned_agent_id: normalizeText(createdLead?.assignedAgentId) || null,
              contact_id: normalizeText(createdLead?.contactId) || null,
              lead_category: normalizeText(createdLead?.leadCategory || leadForm.leadCategory) || 'Buyer',
              lead_direction: normalizeText(createdLead?.leadDirection || leadForm.leadDirection) || 'Inbound',
              lead_source: normalizeText(createdLead?.leadSource || leadForm.leadSource) || 'Other',
              stage: normalizeText(createdLead?.stage || leadForm.stage) || 'New Lead',
              status: normalizeText(createdLead?.status || leadForm.stage) || 'New Lead',
              priority: normalizeText(createdLead?.priority || leadForm.priority) || 'Medium',
              budget: Number(createdLead?.budget || leadForm.budget || 0) || 0,
              area_interest: normalizeText(createdLead?.areaInterest || leadForm.areaInterest || leadForm.propertyArea) || null,
              property_interest: normalizeText(createdLead?.propertyInterest || leadForm.propertyInterest || leadForm.propertyType) || null,
              seller_property_address: normalizeText(createdLead?.sellerPropertyAddress || leadForm.sellerPropertyAddress || leadForm.propertyArea) || null,
              estimated_value: Number(createdLead?.estimatedValue || leadForm.estimatedValue || 0) || 0,
              notes: normalizeText(createdLead?.notes || leadForm.notes) || null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'lead_id' })
          }
        } catch (supabaseLeadWriteError) {
          console.warn('[PIPELINE] non-blocking lead/contact sync failed', supabaseLeadWriteError)
        }
      }
      setError('')
      setMessage('Lead created.')
      setLeadTypeView(normalizeText(createdLead?.leadCategory).toLowerCase() === 'seller' ? 'seller' : 'buyer')
      setSelectedLeadId(createdLead?.leadId || '')
      clearLeadForm()
      setShowLeadForm(false)
      void reloadRecords(organisationId)
    } catch (createError) {
      setError(createError?.message || 'Unable to create lead right now.')
    }
  }

  async function handleUpdateLeadStage(leadId, stage) {
    if (!organisationId || !leadId) return
    updateAgencyLead(organisationId, leadId, { stage, status: stage })
    addLeadActivity(
      organisationId,
      leadId,
      {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Stage Change',
        activityNote: `Pipeline stage moved to ${stage}`,
        outcome: stage,
      },
      { actor: currentAgent },
    )
    const dbLeadId = normalizeLeadUuid(leadId)
    if (isSupabaseConfigured && supabase && isUuidLike(organisationId) && dbLeadId) {
      try {
        await supabase
          .from('leads')
          .update({ stage: normalizeText(stage), status: normalizeText(stage), updated_at: new Date().toISOString() })
          .eq('organisation_id', organisationId)
          .eq('lead_id', dbLeadId)
      } catch (syncError) {
        console.warn('[PIPELINE] non-blocking stage sync failed', syncError)
      }
    }
    await reloadRecords(organisationId)
  }

  function handleAddActivity(event) {
    event.preventDefault()
    if (!selectedLead || !organisationId) return
    if (!normalizeText(activityForm.activityNote)) {
      setError('Add an activity note before saving.')
      return
    }
    addLeadActivity(organisationId, selectedLead.leadId, {
      agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      activityType: activityForm.activityType,
      activityNote: activityForm.activityNote,
      outcome: activityForm.outcome,
      activityDate: new Date().toISOString(),
    })
    setActivityForm(LEAD_DETAIL_DEFAULT_ACTIVITY)
    setError('')
    setMessage('Activity logged.')
    void reloadRecords(organisationId)
  }

  function handleCreateTask(event) {
    event.preventDefault()
    if (!selectedLead || !organisationId) return
    if (!normalizeText(taskForm.title)) {
      setError('Task title is required.')
      return
    }
    const assignedAgent = resolveAgentById(selectedLead.assignedAgentId || selectedLead.assignedAgentEmail || currentAgent.id)
    createLeadTask(
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
    setTaskForm(LEAD_DETAIL_DEFAULT_TASK)
    setError('')
    setMessage('Follow-up task created.')
    void reloadRecords(organisationId)
  }

  function handleTaskStatusToggle(task) {
    if (!organisationId || !task?.taskId) return
    const nextStatus = normalizeText(task?.status) === 'Completed' ? 'Pending' : 'Completed'
    updateLeadTask(
      organisationId,
      task.taskId,
      { status: nextStatus },
      {
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      },
    )
    void reloadRecords(organisationId)
  }

  function handleAppointmentTypeChange(nextType) {
    const template = getAppointmentTypeTemplate(nextType)
    setAppointmentForm((previous) => {
      const previousTemplate = getAppointmentTypeTemplate(previous?.appointmentType || 'viewing')
      const nextForm = buildDefaultAppointmentFormForType(template.type, {
        ...previous,
        appointmentType: template.type,
      })
      const keepCustomTitle = normalizeText(previous.title) && normalizeText(previous.title) !== normalizeText(previousTemplate.label)
      return {
        ...nextForm,
        title: keepCustomTitle ? previous.title : normalizeText(nextForm.title || template.label),
      }
    })
  }

  async function handleCreateAppointment(event) {
    event.preventDefault()
    if (!organisationId) return
    if (appointmentModalOpen && !appointmentCanSave) {
      setError('Resolve hard scheduling conflicts before saving this appointment.')
      return
    }
    if (!normalizeText(appointmentForm.date) || !normalizeText(appointmentForm.startTime)) {
      setError('Appointment date and start time are required.')
      return
    }
    const linkedLead = selectedLead || null
    const assignedAgent = resolveAgentById(
      normalizeText(linkedLead?.assignedAgentId || linkedLead?.assignedAgentEmail || currentAgent.id),
    )
    const appointmentPayload = applyAppointmentTemplate(appointmentForm.appointmentType, {
      title: normalizeText(appointmentForm.title) || getAppointmentTypeLabel(appointmentForm.appointmentType),
      appointmentType: appointmentForm.appointmentType,
      date: appointmentForm.date,
      startTime: appointmentForm.startTime,
      endTime: appointmentForm.endTime,
      location: appointmentForm.location,
      status: appointmentForm.status,
      leadId: normalizeLeadUuid(linkedLead?.leadId) || null,
      contactId: normalizeText(appointmentForm.contactId || linkedLead?.contactId) || null,
      listingId: normalizeText(appointmentForm.listingId) || null,
      transactionId: normalizeText(appointmentForm.transactionId) || null,
      resourceId: normalizeText(appointmentForm.resourceId) || null,
      allowOutsideBusinessHours: isPrincipal && appointmentForm.allowOutsideBusinessHours === true,
      schedulingOverrideReason: isPrincipal ? normalizeText(appointmentForm.schedulingOverrideReason) || null : null,
      notes: appointmentForm.notes,
      participants: appointmentForm.participants,
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
    })
    try {
      const created = await createAppointmentAsync(
        organisationId,
        appointmentPayload,
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      setAppointmentForm(buildDefaultAppointmentFormForType('viewing', {
        ...LEAD_DETAIL_DEFAULT_APPOINTMENT,
        date: getTomorrowIsoDate(),
        startTime: getCurrentTimeValue(),
      }))
      setAppointmentSchedulingIntegrity(created?.schedulingIntegrity || null)
      setAppointmentSchedulingError('')
      setError('')
      setMessage('Appointment added.')
      setAppointmentModalOpen(false)
      if (created?.appointmentId) {
        setSelectedAppointmentId(created.appointmentId)
      }
      if (linkedLead && normalizeText(linkedLead.leadCategory).toLowerCase() === 'seller') {
        updateAgencyLead(organisationId, linkedLead.leadId, {
          stage: 'Appointment Scheduled',
          status: 'Appointment Scheduled',
        })
        const sellerEmail = normalizeText(selectedLeadContact?.email)
        if (isSupabaseConfigured && isValidEmail(sellerEmail)) {
          try {
            await invokeEdgeFunction('send-email', {
              body: {
                type: 'appointment_scheduled',
                to: sellerEmail,
                participantRole: 'seller',
                sellerName: [selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ').trim() || 'Seller',
                appointmentType: getAppointmentTypeLabel(appointmentForm.appointmentType) || 'Appointment',
                appointmentDate: normalizeText(appointmentForm.date),
                appointmentTime: normalizeText(appointmentForm.startTime),
                location: normalizeText(appointmentForm.location) || 'To be confirmed',
                agentName: normalizeText(linkedLead?.assignedAgentName || currentAgent.fullName),
              },
            })
          } catch {
            // Keep appointment flow non-blocking if notification delivery fails.
          }
        }
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
          rsvpStatus: previous.participantDraft?.rsvpStatus || 'Pending',
        },
      ],
      participantDraft: {
        name: '',
        email: '',
        phone: '',
        participantRole: 'Buyer',
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
        title: appointment.title || appointment.appointmentType || '',
        date: appointment.date || (appointment.dateTime ? String(appointment.dateTime).slice(0, 10) : ''),
        startTime: appointment.startTime || (appointment.dateTime ? String(appointment.dateTime).slice(11, 16) : ''),
        endTime: appointment.endTime || '',
        location: appointment.location || '',
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
        status: appointment.status || 'Pending Confirmation',
        listingId: appointment.listingId || '',
        transactionId: appointment.transactionId || '',
        contactId: appointment.contactId || '',
        resourceId: appointment.resourceId || '',
        allowOutsideBusinessHours: appointment.allowOutsideBusinessHours === true,
        schedulingOverrideReason: appointment.schedulingOverrideReason || '',
        notes: appointment.notes || '',
        participants: Array.isArray(appointment.participants)
          ? appointment.participants.map((row) => ({
              name: row.name || '',
              email: row.email || '',
              phone: row.phone || '',
              participantRole: row.participantRole || 'Other Contact',
              rsvpStatus: row.rsvpStatus || 'Pending',
              participantId: row.participantId || '',
            }))
          : [],
        participantDraft: {
          name: '',
          email: '',
          phone: '',
          participantRole: 'Buyer',
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
        date: getTomorrowIsoDate(),
        startTime: getCurrentTimeValue(),
        contactId: normalizeText(selectedLead?.contactId) || '',
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
    if (!organisationId) {
      setError('Organisation membership is not active yet. Reload and ensure this principal account is linked to an organisation.')
      return
    }
    if (!selectedLeadIsSeller) return

    try {
      const sellerName = [selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ').trim() || 'Seller'
      const sellerEmail = normalizeText(selectedLeadContact?.email)
      if (!isValidEmail(sellerEmail)) {
        setError('Seller email is required to send onboarding.')
        return
      }

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
            sellerLeadId: normalizeLeadUuid(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId),
            originatingCrmLeadId: normalizeLeadUuid(selectedLead?.leadId),
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
          sellerLeadId: normalizeLeadUuid(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId),
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

      updateAgencyLead(organisationId, selectedLead.leadId, {
        stage: 'Onboarding Sent',
        status: 'Onboarding Sent',
        sellerOnboardingToken: token,
        sellerOnboardingLink: onboardingLink,
        sellerOnboardingStatus: 'sent',
        sellerWorkflowLeadId: normalizeText(sellerWorkflowLead?.sellerLeadId || sellerWorkflowLead?.id || selectedLead.leadId),
        listingId: canonicalListingId || normalizeText(selectedLead?.listingId),
      })
      addLeadActivity(organisationId, selectedLead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Seller Onboarding Sent',
        activityNote: 'seller_onboarding_sent',
        outcome: 'Onboarding link sent',
        activityDate: new Date().toISOString(),
      })

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
          console.log('[Seller Onboarding] sending seller onboarding email', {
            leadId: selectedLead?.leadId || null,
            listingId: canonicalListingId || null,
            recipient: sellerEmail || null,
            payloadType: onboardingEmailPayload.type,
            hasOnboardingLink: Boolean(onboardingEmailPayload.onboardingLink),
          })
          const { data: emailResult, error: emailError } = await invokeEdgeFunction('send-email', {
            body: {
              ...onboardingEmailPayload,
            },
          })
          if (emailError) {
            console.error('[Seller Onboarding] email send failed', {
              leadId: selectedLead?.leadId || null,
              listingId: canonicalListingId || null,
              recipient: sellerEmail || null,
              error: emailError,
            })
          } else {
            const routedType = normalizeText(emailResult?.type).toLowerCase()
            if (routedType && !['seller_onboarding', 'seller_onboarding_link'].includes(routedType)) {
              console.error('[Seller Onboarding] unexpected email template route', {
                leadId: selectedLead?.leadId || null,
                listingId: canonicalListingId || null,
                recipient: sellerEmail || null,
                responseType: routedType,
              })
            }
            console.log('[Seller Onboarding] email send completed', {
              leadId: selectedLead?.leadId || null,
              listingId: canonicalListingId || null,
              recipient: sellerEmail || null,
              responseType: emailResult?.type || null,
              emailId: emailResult?.emailId || null,
              ok: Boolean(emailResult?.ok),
            })
          }
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
    }
  }

  async function handleGenerateMandateFromSellerLead() {
    if (!selectedLead || !organisationId) return
    if (!selectedLeadIsSeller) return
    if (!selectedLeadHasMandateData) {
      setError('Missing seller or property details. Capture contact and property information first.')
      return
    }

    setIsMandateGenerating(true)
    try {
      const packetTitle = `Mandate - ${[selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ') || 'Seller'}`
      const templates = await listPacketTemplates({ packetType: 'mandate', moduleType: 'agency', includeInactive: false })
      const template = Array.isArray(templates) ? templates[0] : null

      let packet = null
      let fallbackPacketId = ''
      try {
        const scopedAssignedAgentId = isUuidLike(currentAgent.id) ? currentAgent.id : ''
        const dbLeadId = normalizeLeadUuid(selectedLead.leadId)
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
          },
        })
      } catch (packetError) {
        if (!['PACKETS_SCHEMA_MISSING', 'PACKETS_RLS_DENIED'].includes(packetError?.code)) {
          throw packetError
        }
        fallbackPacketId = `local-mandate-${Date.now()}`
      }

      if (packet?.id) {
        try {
          await generatePacketVersion({
            packetId: packet.id,
            packetType: 'mandate',
            template,
            allowWarnings: true,
            forceGenerate: true,
            context: {
              organisationId,
              generatedByRole: 'agent',
              generatedByUserId: normalizeText(currentAgent.id),
              generatedByName: normalizeText(currentAgent.fullName),
              generatedByUserEmail: normalizeText(currentAgent.email),
              agentEmail: normalizeText(selectedLead?.assignedAgentEmail || currentAgent.email),
              lead: {
                id: normalizeLeadUuid(selectedLead.leadId) || null,
                lead_id: normalizeLeadUuid(selectedLead.leadId) || null,
                name: [selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ').trim(),
                sellerName: normalizeText(selectedLeadContact?.firstName),
                sellerSurname: normalizeText(selectedLeadContact?.lastName),
                sellerEmail: normalizeText(selectedLeadContact?.email),
                sellerPhone: normalizeText(selectedLeadContact?.phone),
                propertyAddress: normalizeText(selectedLead?.sellerPropertyAddress || selectedLeadPropertyArea),
                propertyType: normalizeText(selectedLeadPropertyType) || 'House',
                listingTitle: normalizeText(selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress || selectedLeadPropertyArea),
                assignedAgentName: normalizeText(selectedLead?.assignedAgentName || currentAgent.fullName),
                assignedAgentEmail: normalizeText(selectedLead?.assignedAgentEmail || currentAgent.email),
                sellerOnboarding: {
                  formData: selectedLead?.sellerOnboarding?.formData || {},
                },
              },
              mandateDraft: {
                mandateType: 'sole',
                askingPrice: Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0,
                specialConditions: '',
              },
            },
          })
        } catch (generationError) {
          console.warn('[MANDATE] packet version generation failed; continuing with signing fallback', generationError)
        }
      }

      updateAgencyLead(organisationId, selectedLead.leadId, {
        stage: 'Mandate Generated',
        status: 'Mandate Generated',
        mandatePacketId: normalizeText(packet?.id) || fallbackPacketId,
      })
      addLeadActivity(organisationId, selectedLead.leadId, {
        agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        activityType: 'Mandate Generated',
        activityNote: 'mandate_generated',
        outcome: 'Mandate packet created',
      })
      setError('')
      setMessage(
        normalizeText(packet?.id)
          ? 'Mandate packet generated for this seller lead.'
          : 'Mandate generated. Packet tracking is running in fallback mode until packet schema/permissions are fully enabled.',
      )
      await reloadRecords(organisationId)
    } catch (mandateError) {
      setError(mandateError?.message || 'Unable to generate mandate from this lead right now.')
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
        sellerLeadId: normalizeLeadUuid(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId),
        originatingCrmLeadId: normalizeLeadUuid(selectedLead?.leadId),
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
          sellerLeadId: normalizeLeadUuid(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId),
          id: normalizeLeadUuid(selectedLead?.sellerWorkflowLeadId || selectedLead?.leadId),
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

    updateAgencyLead(organisationId, selectedLead.leadId, {
      stage: 'Converted To Listing',
      status: 'Converted To Listing',
      listingId: createdListingId,
    })
    addLeadActivity(organisationId, selectedLead.leadId, {
      agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      activityType: 'Listing Created',
      activityNote: hasMandateSigned ? 'listing_created_after_mandate' : 'listing_created_before_mandate',
      outcome: hasMandateSigned ? 'Mandate signed' : 'Manual override',
    })

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
    try {
      const updatePayload = applyAppointmentTemplate(appointmentForm.appointmentType, {
        title: normalizeText(appointmentForm.title) || getAppointmentTypeLabel(appointmentForm.appointmentType),
        appointmentType: appointmentForm.appointmentType,
        date: appointmentForm.date,
        startTime: appointmentForm.startTime,
        endTime: appointmentForm.endTime,
        location: appointmentForm.location,
        status: appointmentForm.status,
        listingId: normalizeText(appointmentForm.listingId) || null,
        transactionId: normalizeText(appointmentForm.transactionId) || null,
        contactId: normalizeText(appointmentForm.contactId) || null,
        resourceId: normalizeText(appointmentForm.resourceId) || null,
        allowOutsideBusinessHours: isPrincipal && appointmentForm.allowOutsideBusinessHours === true,
        schedulingOverrideReason: isPrincipal ? normalizeText(appointmentForm.schedulingOverrideReason) || null : null,
        notes: appointmentForm.notes,
        participants: appointmentForm.participants,
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

    const sellerName = [selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ').trim() || 'Seller'
    const propertyTitle = normalizeText(selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress || 'your property')
    const onboardingToken = normalizeText(selectedLead?.sellerOnboardingToken)
    const sellerWorkspaceBaseLink = buildSellerWorkspaceLink(onboardingToken)
    const sellerMandatePortalLink = sellerWorkspaceBaseLink ? `${sellerWorkspaceBaseLink}/mandate` : ''
    const sentAtIso = new Date().toISOString()
    let sellerSigningLink = ''

    if (isSupabaseConfigured && isUuidLike(mandatePacketId)) {
      try {
        await prepareSigningFields({
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

        const linkResult = await generateSigningLinks({
          packetId: mandatePacketId,
          organisationId,
          expiresInHours: 168,
          baseUrl:
            (typeof window !== 'undefined' && window.location?.origin)
              ? window.location.origin
              : 'https://app.bridgenine.co.za',
        })
        sellerSigningLink = resolveSellerSignerLink(linkResult?.signers, sellerEmail)
      } catch (linkError) {
        console.warn('[MANDATE] unable to prepare signer link; continuing with seller portal link', linkError)
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

    const outboundMandateLink = sellerSigningLink || sellerMandatePortalLink
    if (!sellerSigningLink) {
      setError('Mandate signer link could not be generated yet. Please click Generate Mandate again, then Send Mandate.')
      return
    }

    if (isSupabaseConfigured) {
      try {
        await invokeEdgeFunction('send-email', {
          body: {
            type: 'seller_mandate_sent',
            to: sellerEmail,
            sellerName,
            propertyTitle,
            mandateType: 'Mandate',
            mandateStartDate: '',
            mandateEndDate: '',
            askingPrice: formatCurrency(Number(selectedLead?.estimatedValue || selectedLead?.budget || 0) || 0),
            portalLink: outboundMandateLink,
          },
        })
      } catch {
        // Status update should still persist even if notification fails.
      }
    }

    updateAgencyLead(organisationId, selectedLead.leadId, {
      stage: 'Mandate Sent',
      status: 'Mandate Sent',
      mandateStatus: 'sent',
      mandateSentAt: sentAtIso,
      mandateSigningLink: sellerSigningLink,
    })
    if (onboardingToken) {
      updateSellerWorkflowRecordByToken(onboardingToken, (row) => ({
        ...row,
        mandateStatus: 'sent',
        mandate: {
          ...(row?.mandate || {}),
          status: 'sent',
          sentAt: sentAtIso,
          signerLink: sellerSigningLink || row?.mandate?.signerLink || '',
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
        await updatePrivateListing(listingId, {
          listingStatus: 'mandate_sent',
          mandateStatus: 'sent',
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

    addLeadActivity(organisationId, selectedLead.leadId, {
      agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      activityType: 'Mandate Sent',
      activityNote: 'mandate_sent',
      outcome: 'Mandate sent to seller',
    })
    setError('')
    setMessage('Mandate sent to seller.')
    await reloadRecords(organisationId)
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
          status: appointmentForm.status === 'Cancelled' ? 'Cancelled' : 'Completed',
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

  function handleCreateFollowUpTaskFromAppointment() {
    if (!organisationId || !selectedAppointment || !normalizeText(selectedAppointment.leadId)) return
    const dueDate = normalizeText(appointmentOutcomeForm.followUpDate) || getTodayIsoDate()
    createLeadTask(
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

  async function handleConvertLeadToDeal() {
    if (!selectedLead || !organisationId) return
    try {
      await convertLeadToDealRecord(
        organisationId,
        selectedLead.leadId,
        {
          title: `${selectedLead.leadCategory} Opportunity`,
          dealValue: Number(selectedLead.estimatedValue || selectedLead.budget || 0) || 0,
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      setError('')
      setMessage('Lead converted to transaction.')
      await reloadRecords(organisationId)
    } catch (convertError) {
      setError(convertError?.message || 'Unable to convert lead.')
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
    <section className="space-y-5">

      {error ? <div className="rounded-[18px] border border-[#f6d4d4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f1d1d]">{error}</div> : null}
      {message ? <div className="rounded-[18px] border border-[#d4e8dc] bg-[#eef9f1] px-4 py-3 text-sm text-[#1a6e3a]">{message}</div> : null}

      {!isCalendarMode ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            { label: 'New Leads', value: metrics.newLeads, icon: UserRound },
            { label: 'Follow-ups Today', value: metrics.followUpsDueToday, icon: CheckSquare },
            { label: 'Appointments This Week', value: metrics.appointmentsThisWeek, icon: CalendarDays },
            { label: 'Active Opportunities', value: metrics.activeOpportunities, icon: TrendingUp },
            { label: 'Transactions Created', value: metrics.dealsCreated, icon: ClipboardList },
            { label: 'Overdue Tasks', value: metrics.overdueTasks, icon: CheckSquare },
          ].map((metric) => {
            const Icon = metric.icon
            return (
              <article key={metric.label} className="rounded-[18px] border border-[#dce6f1] bg-white px-4 py-3 shadow-[0_8px_16px_rgba(15,23,42,0.03)]">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[0.7rem] uppercase tracking-[0.09em] text-[#768aa1]">{metric.label}</span>
                  <Icon size={14} className="text-[#5f7894]" />
                </div>
                <strong className="mt-2 block text-[1.4rem] font-semibold tracking-[-0.03em] text-[#132437]">{metric.value}</strong>
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
                <Button type="button" onClick={() => handleOpenAppointmentModal()} className="whitespace-nowrap">
                  <Plus size={14} />
                  <span>Schedule Appointment</span>
                </Button>
                {[
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
              <div className="grid grid-cols-7 gap-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                  <div key={label} className="rounded-[10px] bg-[#f5f8fc] px-2 py-1 text-center text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#75889d]">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {visibleCalendarDays.map((day) => {
                  const key = toDateOnlyIso(day)
                  const rows = calendarAppointmentsByDate.get(key) || []
                  const inActiveMonth = day.getMonth() === calendarCursorDate.getMonth()
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
                        {shownRows.map((appointment) => (
                          <button
                            key={appointment.appointmentId}
                            type="button"
                            onClick={() => handleOpenAppointmentModal(appointment)}
                            className="w-full rounded-[8px] border border-[#dce6f2] bg-[#f8fbff] px-2 py-1 text-left transition hover:border-[#c5d7ea]"
                          >
                            <p className="truncate text-[0.68rem] font-semibold text-[#203a52]">{formatAppointmentTimeRange(appointment)}</p>
                            <p className="truncate text-[0.66rem] text-[#5f748d]">{appointment.title || getAppointmentTypeLabel(appointment.appointmentType)}</p>
                          </button>
                        ))}
                        {hiddenCount > 0 ? (
                          <p className="px-1 text-[0.66rem] font-semibold text-[#5f7894]">+{hiddenCount} more</p>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </article>
        </section>
      ) : isPrincipal && principalView === 'reporting' ? (
        <section className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
            <h3 className="text-base font-semibold text-[#20344b]">Lead Source Reporting</h3>
            <p className="mt-1 text-sm text-[#60758d]">Inbound and outbound source volume across your full organisation.</p>
            <div className="mt-4 space-y-2">
              {principalReporting.leadSourceRows.length ? (
                principalReporting.leadSourceRows.map((row) => (
                  <div key={row.source} className="flex items-center justify-between rounded-[12px] border border-[#e4ecf5] bg-[#fbfdff] px-3 py-2 text-sm">
                    <span className="text-[#2f4b65]">{row.source}</span>
                    <strong className="text-[#102539]">{row.count}</strong>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#6c8097]">No source data yet.</p>
              )}
            </div>
          </article>

          <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
            <h3 className="text-base font-semibold text-[#20344b]">Agent Productivity</h3>
            <p className="mt-1 text-sm text-[#60758d]">Calls, door knocks, follow-ups, appointments, and conversion per agent.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.08em] text-[#7a8da3]">
                    <th className="pb-2">Agent</th>
                    <th className="pb-2">Calls</th>
                    <th className="pb-2">Door Knocks</th>
                    <th className="pb-2">Follow-ups</th>
                    <th className="pb-2">Appointments</th>
                    <th className="pb-2">Transactions</th>
                    <th className="pb-2">Conv %</th>
                  </tr>
                </thead>
                <tbody>
                  {principalReporting.activityRows.length ? (
                    principalReporting.activityRows.map((row) => (
                      <tr key={row.agent} className="border-t border-[#e8eef5] text-[#2d4560]">
                        <td className="py-2 pr-3">{row.agent}</td>
                        <td className="py-2 pr-3">{row.calls}</td>
                        <td className="py-2 pr-3">{row.doorKnocks}</td>
                        <td className="py-2 pr-3">{row.followUps}</td>
                        <td className="py-2 pr-3">{row.appointmentsBooked}</td>
                        <td className="py-2 pr-3">{row.dealsCreated}</td>
                        <td className="py-2 pr-3">{row.conversionRate}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-3 text-[#6c8097]" colSpan={7}>
                        No activity logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
            <h3 className="text-base font-semibold text-[#20344b]">Appointment Mix</h3>
            <p className="mt-1 text-sm text-[#60758d]">Appointment status and type activity across the organisation.</p>
            <div className="mt-4 space-y-2">
              {principalReporting.appointmentStatusRows.length ? (
                principalReporting.appointmentStatusRows.map((row) => (
                  <div key={row.status} className="flex items-center justify-between rounded-[12px] border border-[#e4ecf5] bg-[#fbfdff] px-3 py-2 text-sm">
                    <span className="text-[#2f4b65]">{row.status}</span>
                    <strong className="text-[#102539]">{row.count}</strong>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#6c8097]">No appointment status data yet.</p>
              )}
            </div>
            <div className="mt-4 space-y-2">
              {principalReporting.appointmentTypeRows.length ? (
                principalReporting.appointmentTypeRows.slice(0, 5).map((row) => (
                  <div key={row.type} className="flex items-center justify-between rounded-[12px] border border-[#e4ecf5] bg-white px-3 py-2 text-sm">
                    <span className="text-[#2f4b65]">{row.type}</span>
                    <strong className="text-[#102539]">{row.count}</strong>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#6c8097]">No appointment type data yet.</p>
              )}
            </div>
          </article>
        </section>
      ) : (
        <>
          <section className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Field
                placeholder="Search leads"
                value={leadFilter.search}
                onChange={(event) => setLeadFilter((previous) => ({ ...previous, search: event.target.value }))}
              />
              <Field as="select" value={leadFilter.source} onChange={(event) => setLeadFilter((previous) => ({ ...previous, source: event.target.value }))}>
                <option value="all">All Sources</option>
                {availableLeadSources.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Field>
              <Field as="select" value={leadFilter.stage} onChange={(event) => setLeadFilter((previous) => ({ ...previous, stage: event.target.value }))}>
                <option value="all">All Stages</option>
                {LEAD_STAGES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Field>
              <Field as="select" value={leadFilter.sort} onChange={(event) => setLeadFilter((previous) => ({ ...previous, sort: event.target.value }))}>
                <option value="newest">Sort: Newest</option>
                <option value="next_follow_up">Sort: Next Follow-up</option>
                <option value="stage">Sort: Stage</option>
              </Field>
              {isPrincipal ? (
                <Field as="select" value={leadFilter.agent} onChange={(event) => setLeadFilter((previous) => ({ ...previous, agent: event.target.value }))}>
                  <option value="all">All Agents</option>
                  {agentOptions.map((agent) => (
                    <option key={`${agent.id}:${agent.email}`} value={agent.id || agent.email}>
                      {agent.name}
                    </option>
                  ))}
                </Field>
              ) : (
                <div className="rounded-[12px] border border-[#dde6f1] bg-[#f8fbff] px-3 py-2 text-sm text-[#5f7390]">
                  Pipeline value: <strong className="ml-1 text-[#1a344e]">{formatCurrency(metrics.pipelineValue)}</strong>
                </div>
              )}
            </div>
          </section>

          <section className={isLeadWorkspaceRoute ? 'grid gap-4' : 'grid gap-4'}>
            {!isLeadWorkspaceRoute ? (
            <article className="rounded-[22px] border border-[#dde4ee] bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-[#20344b]">Leads</h3>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center rounded-full border border-[#dbe4ee] bg-[#f6f9fc] p-1">
                    <button
                      type="button"
                      onClick={() => setLeadTypeView('buyer')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        leadTypeView === 'buyer' ? 'bg-[#1f4f78] text-white' : 'text-[#51667f] hover:text-[#1f4f78]'
                      }`}
                    >
                      Buyer Leads
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeadTypeView('seller')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        leadTypeView === 'seller' ? 'bg-[#1f4f78] text-white' : 'text-[#51667f] hover:text-[#1f4f78]'
                      }`}
                    >
                      Seller Leads
                    </button>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      clearLeadForm()
                      setLeadForm((previous) => ({
                        ...previous,
                        leadCategory: leadTypeView === 'seller' ? 'Seller' : 'Buyer',
                      }))
                      setShowLeadForm(true)
                    }}
                  >
                    <Plus size={14} />
                    <span>New Lead</span>
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[14px] border border-[#e4ebf4]">
                <table className="min-w-[720px] w-full text-sm">
                  <thead className="bg-[#f7faff] text-left text-[0.7rem] uppercase tracking-[0.08em] text-[#6f839a]">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length ? (
                      filteredLeads.map((lead) => {
                        const leadContact = contactById.get(normalizeText(lead.contactId))
                        const linkedAppointment = records.appointments
                          .filter((row) => normalizeText(row?.leadId) === normalizeText(lead?.leadId))
                          .sort((a, b) => new Date(b?.dateTime || b?.createdAt || 0) - new Date(a?.dateTime || a?.createdAt || 0))[0]
                        const linkedTransaction = records.deals
                          .filter((row) => normalizeText(row?.leadId) === normalizeText(lead?.leadId))
                          .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0]
                        const listingLabel = normalizeText(lead?.listingId || lead?.propertyInterest || lead?.sellerPropertyAddress)
                        const mandatePacketLabel = normalizeText(lead?.mandatePacketId || lead?.mandatePacket?.id)
                        const appointmentLabel = linkedAppointment
                          ? `${getAppointmentTypeLabel(linkedAppointment?.appointmentType) || 'Appointment'} · ${formatDate(linkedAppointment?.dateTime || linkedAppointment?.createdAt)}`
                          : ''
                        const transactionLabel = linkedTransaction
                          ? `Transaction · ${normalizeText(linkedTransaction?.transactionId || linkedTransaction?.dealId || linkedTransaction?.title) || 'Linked'}`
                          : ''
                        const resolvedLink =
                          leadTypeView === 'seller'
                            ? listingLabel
                              ? `Listing · ${listingLabel}`
                              : mandatePacketLabel
                                ? `Mandate · ${mandatePacketLabel}`
                                : appointmentLabel || 'No link yet'
                            : listingLabel
                              ? `Listing · ${listingLabel}`
                              : appointmentLabel || transactionLabel || 'No link yet'
                        const isActive = selectedLeadId === lead.leadId && isLeadWorkspaceRoute

                        return (
                          <tr
                            key={lead.leadId}
                            className={`cursor-pointer border-t border-[#e8eef5] text-[#2d4560] transition hover:bg-[#f8fbff] ${isActive ? 'bg-[#eef6ff]' : 'bg-white'}`}
                            onClick={() => {
                              setSelectedLeadId(lead.leadId)
                              navigate(`/pipeline/leads/${lead.leadId}`)
                            }}
                          >
                            <td className="px-3 py-2">
                              {[leadContact?.firstName, leadContact?.lastName].filter(Boolean).join(' ') || '—'}
                            </td>
                            <td className="px-3 py-2">{leadContact?.phone || '—'}</td>
                            <td className="px-3 py-2">{leadContact?.email || '—'}</td>
                            <td className="px-3 py-2">{lead.leadSource || '—'}</td>
                            <td className="px-3 py-2">
                              <span className="line-clamp-2 text-[#4f6782]">{resolvedLink}</span>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td className="px-3 py-5 text-sm text-[#6f839c]" colSpan={5}>
                          {leadTypeView === 'seller'
                            ? 'No seller leads yet. Add a seller lead or convert a canvassing prospect into a lead.'
                            : 'No buyer leads yet. Add a buyer lead or wait for enquiries from your listings.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
            ) : null}

            {isLeadWorkspaceRoute ? (
            <article className="rounded-[22px] border border-[#dde4ee] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e6edf5] pb-3">
                <div className="space-y-1">
                  <button
                    type="button"
                    className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f7894]"
                    onClick={() => navigate('/pipeline/leads')}
                  >
                    ← Back to Leads
                  </button>
                  <h3 className="text-base font-semibold text-[#20344b]">Lead Workspace</h3>
                  {selectedLead ? (
                    <p className="text-sm text-[#5f7590]">
                      {[selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ') || 'Lead Contact'} • {selectedLead.leadCategory} • {selectedLead.stage}
                    </p>
                  ) : null}
                </div>
                {selectedLead ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedLeadContact?.phone ? (
                      <a
                        href={`tel:${selectedLeadContact.phone}`}
                        className="inline-flex items-center rounded-[10px] border border-[#d8e3f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#2c4964]"
                      >
                        Call
                      </a>
                    ) : null}
                    {selectedLeadContact?.phone ? (
                      <a
                        href={toWhatsappHref(selectedLeadContact.phone)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-[10px] border border-[#d8e3f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#2c4964]"
                      >
                        WhatsApp
                      </a>
                    ) : null}
                    {selectedLeadContact?.email ? (
                      <a
                        href={`mailto:${selectedLeadContact.email}`}
                        className="inline-flex items-center rounded-[10px] border border-[#d8e3f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#2c4964]"
                      >
                        Email
                      </a>
                    ) : null}
                    {selectedLeadIsSeller ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleSendSellerOnboarding}
                          disabled={selectedLeadOnboardingCompleted}
                        >
                          {selectedLeadOnboardingCompleted ? 'Onboarding Completed' : 'Send Seller Onboarding'}
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={handleScheduleSellerAppointment}>
                          Schedule Appointment
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleGenerateMandateFromSellerLead}
                          disabled={!selectedLeadHasMandateData || isMandateGenerating}
                          title={selectedLeadHasMandateData ? '' : 'Seller/property details are still incomplete'}
                        >
                          {isMandateGenerating ? 'Generating…' : 'Generate Mandate'}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleSendMandateToSeller}
                          disabled={!normalizeText(selectedLead?.mandatePacketId)}
                          title={normalizeText(selectedLead?.mandatePacketId) ? '' : 'Generate mandate first'}
                        >
                          Send Mandate
                        </Button>
                        <Button type="button" size="sm" onClick={handleCreateListingFromSellerLead}>
                          {selectedLeadMandateSigned ? 'Create Listing' : 'Create Listing (Override)'}
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
                          onClick={handleConvertLeadToDeal}
                          disabled={Boolean(selectedLead.convertedTransactionId || selectedLead.convertedDealId)}
                        >
                          {selectedLead.convertedTransactionId || selectedLead.convertedDealId ? 'Transaction Created' : 'Convert To Transaction'}
                        </Button>
                        <Button type="button" variant="secondary" size="sm" disabled title="OTP generation is available once a transaction is linked.">
                          Generate OTP
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
              {selectedLead ? (
                <div className="mt-3 grid gap-4 xl:grid-cols-[1.65fr_0.95fr]">
                  <div className="space-y-4">
                  <div className="rounded-[14px] border border-[#e4ebf4] bg-[#f8fbff] p-3">
                    <div className="mb-2 grid gap-2">
                      <Field as="select" value={selectedLead.stage} onChange={(event) => handleUpdateLeadStage(selectedLead.leadId, event.target.value)}>
                        {LEAD_STAGES.map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </Field>
                    </div>
                    <p className="text-sm font-semibold text-[#1f3850]">
                      {[selectedLeadContact?.firstName, selectedLeadContact?.lastName].filter(Boolean).join(' ') || 'Lead Contact'}
                    </p>
                    <p className="mt-1 text-xs text-[#5b728b]">{selectedLeadContact?.phone || 'No phone'} • {selectedLeadContact?.email || 'No email'}</p>
                    <p className="mt-1 text-xs text-[#5b728b]">{selectedLead.leadCategory} • {selectedLead.leadDirection} • {selectedLead.leadSource}</p>
                    <p className="mt-1 text-xs text-[#5b728b]">Pipeline value: {formatCurrency(selectedLead.estimatedValue || selectedLead.budget)}</p>
                    <p className="mt-1 text-xs text-[#5b728b]">Agent: {selectedLead.assignedAgentName || selectedLead.assignedAgentEmail || 'Unassigned'}</p>
                    <p className="mt-1 text-xs text-[#5b728b]">
                      Linked listing/property: {selectedLead.listingId || selectedLead.sellerPropertyAddress || selectedLead.propertyInterest || 'Not linked yet'}
                    </p>
                    <p className="mt-1 text-xs text-[#5b728b]">
                      Linked appointment:{' '}
                      {selectedLeadLinkedAppointment
                        ? `${getAppointmentTypeLabel(selectedLeadLinkedAppointment?.appointmentType) || 'Appointment'} (${formatDate(selectedLeadLinkedAppointment?.dateTime || selectedLeadLinkedAppointment?.createdAt)})`
                        : 'Not linked yet'}
                    </p>
                    <p className="mt-1 text-xs text-[#5b728b]">
                      Linked transaction: {selectedLeadLinkedTransaction?.transactionId || selectedLeadLinkedTransaction?.dealId || 'Not linked yet'}
                    </p>
                    <div className="mt-3 inline-flex items-center rounded-full border border-[#dbe5f1] bg-white px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#50708f]">
                      {selectedLeadIsSeller ? 'Seller Workflow' : 'Buyer Workflow'}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                    <h4 className="text-sm font-semibold text-[#28435e]">Activities</h4>
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
                      <Button type="submit">Log Activity</Button>
                    </form>
                    <div className="max-h-44 space-y-2 overflow-auto pt-1">
                      {selectedLeadActivities.length ? (
                        selectedLeadActivities.map((row) => (
                          <div key={row.activityId} className="rounded-[10px] border border-[#e7edf5] bg-[#fbfdff] px-2.5 py-2 text-xs">
                            <p className="font-semibold text-[#29435d]">{row.activityType}</p>
                            <p className="mt-0.5 text-[#587089]">{row.activityNote || 'No note'}</p>
                            <p className="mt-0.5 text-[#7a8ea5]">{formatDate(row.activityDate || row.createdAt)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[#6d839b]">No activity logged yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                    <h4 className="text-sm font-semibold text-[#28435e]">Tasks / Follow-ups</h4>
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
                      <Button type="submit">Create Task</Button>
                    </form>
                    <div className="max-h-40 space-y-2 overflow-auto pt-1">
                      {selectedLeadTasks.length ? (
                        selectedLeadTasks.map((task) => (
                          <button
                            key={task.taskId}
                            type="button"
                            onClick={() => handleTaskStatusToggle(task)}
                            className="w-full rounded-[10px] border border-[#e7edf5] bg-[#fbfdff] px-2.5 py-2 text-left text-xs"
                          >
                            <p className="font-semibold text-[#29435d]">{task.title}</p>
                            <p className="mt-0.5 text-[#587089]">Due: {task.dueDate || 'No date'} • {task.priority}</p>
                            <p className="mt-0.5 text-[#7a8ea5]">Status: {task.status}</p>
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-[#6d839b]">No follow-up tasks yet.</p>
                      )}
                    </div>
                  </div>

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

                  <div className="space-y-2 rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                    <h4 className="text-sm font-semibold text-[#28435e]">Documents</h4>
                    <p className="text-xs text-[#5f7590]">
                      Generated packets and signed documents for this lead will appear here as document workflows are linked.
                    </p>
                    <div className="rounded-[10px] border border-dashed border-[#d6e1ee] bg-[#fbfdff] px-3 py-2 text-xs text-[#6f839c]">
                      No linked documents yet.
                    </div>
                  </div>
                  </div>

                  <aside className="space-y-3">
                    <div className="rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Workflow Health</p>
                      <p className="mt-2 text-sm font-semibold text-[#1f3850]">
                        {selectedLeadWorkflowHealth.completed}/{selectedLeadWorkflowHealth.total} steps complete
                      </p>
                      <div className="mt-2 h-2 rounded-full bg-[#e3ebf4]">
                        <span className="block h-full rounded-full bg-[#2f7b9e]" style={{ width: `${selectedLeadWorkflowHealth.percent}%` }} />
                      </div>
                      <div className="mt-2 space-y-1">
                        {selectedLeadWorkflowHealth.items?.map((item) => (
                          <div key={item.key} className="flex items-center justify-between text-xs">
                            <span className="text-[#5f7590]">{item.label}</span>
                            <span className={item.done ? 'text-[#1e7a46]' : 'text-[#b26d22]'}>{item.done ? 'Done' : 'Missing'}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Linked Records</p>
                      <p className="mt-2 text-xs text-[#5f7590]">Listing: {selectedLead.listingId || selectedLead.propertyInterest || selectedLead.sellerPropertyAddress || 'Not linked yet'}</p>
                      <p className="mt-1 text-xs text-[#5f7590]">
                        Transaction: {selectedLeadLinkedTransaction?.transactionId || selectedLeadLinkedTransaction?.dealId || 'Not linked yet'}
                      </p>
                      <p className="mt-1 text-xs text-[#5f7590]">
                        Appointment: {selectedLeadLinkedAppointment ? getAppointmentTypeLabel(selectedLeadLinkedAppointment.appointmentType) : 'Not linked yet'}
                      </p>
                    </div>

                    <div className="rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">
                        {normalizeText(selectedLead.leadCategory).toLowerCase() === 'seller' ? 'Mandate / Listing' : 'Offers / Transaction'}
                      </p>
                      {normalizeText(selectedLead.leadCategory).toLowerCase() === 'seller' ? (
                        <div className="mt-2 space-y-1 text-xs text-[#5f7590]">
                          <p>Mandate: {normalizeText(selectedLead?.mandatePacketId || selectedLead?.mandatePacket?.id) || 'Not generated yet'}</p>
                          <p>Listing: {normalizeText(selectedLead?.listingId || selectedLead?.propertyInterest || selectedLead?.sellerPropertyAddress) || 'Not linked yet'}</p>
                        </div>
                      ) : (
                        <div className="mt-2 space-y-1 text-xs text-[#5f7590]">
                          <p>Offers: {selectedLeadLinkedTransaction ? 'Offer linked to transaction' : 'No accepted offer linked yet'}</p>
                          <p>Transaction: {selectedLeadLinkedTransaction?.transactionId || selectedLeadLinkedTransaction?.dealId || 'Not created yet'}</p>
                        </div>
                      )}
                    </div>

                    <div className="rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Notes / Comments</p>
                      <p className="mt-2 text-xs text-[#5f7590]">{selectedLeadNotes || 'No notes yet.'}</p>
                    </div>
                  </aside>
                </div>
              ) : (
                <p className="mt-3 rounded-[14px] border border-dashed border-[#d7e2ef] bg-[#f9fbfe] px-4 py-5 text-sm text-[#6f839c]">
                  Select a lead from the pipeline board to open the CRM workspace.
                </p>
              )}
            </article>
            ) : null}
          </section>
        </>
      )}

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
                onClick={() => updateLeadFormField('leadCategory', 'Seller')}
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
              <Field placeholder="Linked Listing (optional)" value={leadForm.linkedListing} onChange={(event) => updateLeadFormField('linkedListing', event.target.value)} />
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
              onClick={() => {
                setShowLeadForm(false)
                clearLeadForm()
              }}
            >
              Cancel
            </Button>
            <Button type="submit">Create Lead</Button>
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
              <h4 className="text-sm font-semibold text-[#1f3952]">Appointment Snapshot</h4>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">Who:</span> {selectedAppointment.participants?.map((person) => person?.name || person?.email).filter(Boolean).join(', ') || (selectedAppointment.assignedAgentName || selectedAppointment.assignedAgentEmail || 'Unassigned')}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">What:</span> {selectedAppointment.title || getAppointmentTypeLabel(selectedAppointment.appointmentType) || 'Appointment'}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">When:</span> {formatDate(selectedAppointment.dateTime)}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">Where:</span> {selectedAppointment.location || 'Location pending'}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">Why:</span> {getAppointmentTypeLabel(selectedAppointment.appointmentType) || selectedAppointment.nextStep || 'Meeting follow-up'}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">Status:</span> {selectedAppointment.status || 'Pending Confirmation'}</p>
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

          <div className="grid gap-2 md:grid-cols-2">
            <Field
              placeholder="Title"
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
            <Field type="date" value={appointmentForm.date} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, date: event.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Field type="time" value={appointmentForm.startTime} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, startTime: event.target.value }))} />
              <Field type="time" value={appointmentForm.endTime} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, endTime: event.target.value }))} />
            </div>
            <Field placeholder="Location" value={appointmentForm.location} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, location: event.target.value }))} />
            <Field as="select" value={appointmentForm.status} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, status: event.target.value }))}>
              {APPOINTMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Field>
            <Field placeholder="Linked listing id (optional)" value={appointmentForm.listingId} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, listingId: event.target.value }))} />
            <Field placeholder="Linked transaction id (optional)" value={appointmentForm.transactionId} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, transactionId: event.target.value }))} />
            <Field placeholder="Linked contact id (optional)" value={appointmentForm.contactId} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, contactId: event.target.value }))} />
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
                <p><span className="font-semibold text-[#233f58]">Default visibility:</span> {selectedAppointmentTemplate.defaultVisibility}</p>
                <p><span className="font-semibold text-[#233f58]">Linked workflow:</span> {selectedAppointmentTemplate.linkedWorkflow || '—'}</p>
                <p><span className="font-semibold text-[#233f58]">Linked stage:</span> {selectedAppointmentTemplate.linkedWorkflowStage || '—'}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Field
                as="select"
                value={appointmentForm.visibility || selectedAppointmentTemplate.defaultVisibility}
                onChange={(event) => setAppointmentForm((previous) => ({ ...previous, visibility: event.target.value }))}
              >
                <option value="client_visible">client_visible</option>
                <option value="shared_role_players">shared_role_players</option>
                <option value="internal_only">internal_only</option>
              </Field>
              <Field
                placeholder="Linked workflow"
                value={appointmentForm.linkedWorkflow || ''}
                onChange={(event) => setAppointmentForm((previous) => ({ ...previous, linkedWorkflow: event.target.value }))}
              />
              <Field
                placeholder="Linked workflow stage"
                value={appointmentForm.linkedWorkflowStage || ''}
                onChange={(event) => setAppointmentForm((previous) => ({ ...previous, linkedWorkflowStage: event.target.value }))}
              />
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

          <div className="grid gap-2 md:grid-cols-2">
            <label className="flex items-center gap-2 rounded-[10px] border border-[#dce6f2] bg-[#f8fbff] px-3 py-2 text-xs text-[#33536d]">
              <input
                type="checkbox"
                checked={appointmentForm.allowOutsideBusinessHours === true}
                disabled={!isPrincipal}
                onChange={(event) => setAppointmentForm((previous) => ({ ...previous, allowOutsideBusinessHours: event.target.checked }))}
              />
              Allow outside business hours
            </label>
            {isPrincipal ? (
              <Field
                placeholder="Override reason (optional)"
                value={appointmentForm.schedulingOverrideReason}
                onChange={(event) => setAppointmentForm((previous) => ({ ...previous, schedulingOverrideReason: event.target.value }))}
              />
            ) : (
              <div className="rounded-[10px] border border-[#e4ebf4] bg-[#f8fbff] px-3 py-2 text-xs text-[#5f7690]">
                Outside-hours overrides require principal permissions.
              </div>
            )}
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
                      <p className="mt-0.5 text-[#5e748d]">{participant.participantRole} • {participant.rsvpStatus}</p>
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
                <p className="text-xs text-[#6f839c]">No participants added yet.</p>
              )}
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
    </section>
  )
}

export default AgencyPipelinePage
