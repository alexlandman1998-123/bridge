import { CalendarDays, CheckSquare, ClipboardList, Plus, TrendingUp, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  ACTIVITY_TYPES,
  APPOINTMENT_PARTICIPANT_ROLES,
  APPOINTMENT_RSVP_STATUSES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  LEAD_CATEGORIES,
  LEAD_DIRECTIONS,
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
  getLeadSourceOptions,
  listAppointmentsAsync,
  updateAppointmentAsync,
  updateAppointmentParticipantRsvpAsync,
  updateAgencyLead,
  updateLeadTask,
  addLeadActivity,
} from '../../lib/agencyPipelineService'
import { listOrganisationUsers, fetchOrganisationSettings } from '../../lib/settingsApi'
import { canAccessPrincipalExperience, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import Modal from '../../components/ui/Modal'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
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

function getAppointmentStatusTone(status) {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'confirmed') return 'border-[#d8ebdf] bg-[#eefbf3] text-[#1f7d44]'
  if (normalized === 'completed') return 'border-[#d8e3f5] bg-[#eff5ff] text-[#274e81]'
  if (normalized === 'needs reschedule') return 'border-[#f2debf] bg-[#fdf5e8] text-[#976427]'
  if (normalized === 'cancelled') return 'border-[#f1ced2] bg-[#fff2f4] text-[#a0383f]'
  return 'border-[#dce6f2] bg-[#f7fbff] text-[#35546c]'
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
  appointmentType: 'Viewing',
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  location: '',
  status: 'Pending Confirmation',
  listingId: '',
  transactionId: '',
  contactId: '',
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

const NEW_LEAD_DEFAULTS = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  leadCategory: 'Buyer',
  leadDirection: 'Inbound',
  leadSource: 'Property24',
  stage: 'New Lead',
  priority: 'Medium',
  budget: '',
  estimatedValue: '',
  areaInterest: '',
  propertyInterest: '',
  sellerPropertyAddress: '',
  notes: '',
}

function AgencyPipelinePage({ initialViewMode = 'pipeline' } = {}) {
  const { role, profile } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [organisationId, setOrganisationId] = useState('')
  const [organisationName, setOrganisationName] = useState('Organisation')
  const [users, setUsers] = useState([])
  const [records, setRecords] = useState({
    contacts: [],
    leads: [],
    leadActivities: [],
    tasks: [],
    appointments: [],
    deals: [],
  })
  const [principalView, setPrincipalView] = useState('operational')
  const [leadFilter, setLeadFilter] = useState({
    search: '',
    category: 'all',
    direction: 'all',
    stage: 'all',
    agent: 'all',
  })
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [leadForm, setLeadForm] = useState(NEW_LEAD_DEFAULTS)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [activityForm, setActivityForm] = useState(LEAD_DETAIL_DEFAULT_ACTIVITY)
  const [taskForm, setTaskForm] = useState(LEAD_DETAIL_DEFAULT_TASK)
  const [appointmentForm, setAppointmentForm] = useState(LEAD_DETAIL_DEFAULT_APPOINTMENT)
  const [pipelineViewMode, setPipelineViewMode] = useState(
    initialViewMode === 'calendar' ? 'calendar' : 'pipeline',
  )
  const [calendarView, setCalendarView] = useState('week')
  const [calendarCursorDate, setCalendarCursorDate] = useState(() => new Date())
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false)
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('')
  const [appointmentOutcomeForm, setAppointmentOutcomeForm] = useState({
    outcomeSummary: '',
    clientFeedback: '',
    agentNotes: '',
    nextStep: '',
    followUpDate: '',
  })

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

  const reloadRecords = useCallback(
    async (orgId) => {
      const snapshot = getAgencyPipelineSnapshot(orgId)
      const agentKey = normalizeKey(currentAgent.id || currentAgent.email)

      const scopedLeads = isPrincipal
        ? snapshot.leads
        : snapshot.leads.filter((lead) => {
            const assignedId = normalizeKey(lead?.assignedAgentId)
            const assignedEmail = normalizeKey(lead?.assignedAgentEmail)
            return assignedId === agentKey || assignedEmail === agentKey
          })

      const scopedLeadIds = new Set(scopedLeads.map((lead) => normalizeText(lead?.leadId)))
      const scopedTasks = snapshot.tasks.filter((task) => scopedLeadIds.has(normalizeText(task?.leadId)))
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
      const scopedActivities = snapshot.leadActivities.filter((row) => scopedLeadIds.has(normalizeText(row?.leadId)))
      const scopedDeals = snapshot.deals.filter((row) => scopedLeadIds.has(normalizeText(row?.leadId)))

      setRecords({
        contacts: snapshot.contacts,
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
      const [context, organisationUsers] = await Promise.all([fetchOrganisationSettings(), listOrganisationUsers()])
      const resolvedOrgId = normalizeText(context?.organisation?.id || 'default')
      setOrganisationId(resolvedOrgId)
      setOrganisationName(normalizeText(context?.organisation?.displayName || context?.organisation?.name || 'Organisation'))
      setMembershipRole(context?.membershipRole || 'viewer')
      setUsers(organisationUsers || [])
      setSelectedAgentId((previous) => previous || normalizeText(currentAgent.id || currentAgent.email))
      await reloadRecords(resolvedOrgId)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load agency pipeline data.')
    } finally {
      setLoading(false)
    }
  }, [currentAgent.email, currentAgent.id, reloadRecords])

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
    const options = getLeadSourceOptions({
      leadDirection: leadForm.leadDirection,
      leadCategory: leadForm.leadCategory,
    })
    if (!options.includes(leadForm.leadSource)) {
      setLeadForm((previous) => ({
        ...previous,
        leadSource: options[0] || 'Other',
      }))
    }
  }, [leadForm.leadCategory, leadForm.leadDirection, leadForm.leadSource])

  useEffect(() => {
    if (!selectedLeadId && records.leads.length) {
      setSelectedLeadId(records.leads[0].leadId)
    }
    if (selectedLeadId && !records.leads.some((row) => row.leadId === selectedLeadId)) {
      setSelectedLeadId(records.leads[0]?.leadId || '')
    }
  }, [records.leads, selectedLeadId])

  useEffect(() => {
    if (!selectedAppointmentId) return
    if (!records.appointments.some((appointment) => normalizeText(appointment?.appointmentId) === normalizeText(selectedAppointmentId))) {
      setSelectedAppointmentId('')
    }
  }, [records.appointments, selectedAppointmentId])

  const leadSourceOptions = useMemo(
    () =>
      getLeadSourceOptions({
        leadDirection: leadForm.leadDirection,
        leadCategory: leadForm.leadCategory,
      }),
    [leadForm.leadCategory, leadForm.leadDirection],
  )

  const filteredLeads = useMemo(() => {
    return records.leads.filter((lead) => {
      const searchMatch = leadFilter.search
        ? [
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
      const categoryMatch = leadFilter.category === 'all' ? true : normalizeText(lead?.leadCategory) === leadFilter.category
      const directionMatch = leadFilter.direction === 'all' ? true : normalizeText(lead?.leadDirection) === leadFilter.direction
      const stageMatch = leadFilter.stage === 'all' ? true : normalizeText(lead?.stage) === leadFilter.stage
      const agentMatch =
        leadFilter.agent === 'all'
          ? true
          : normalizeKey(lead?.assignedAgentId) === normalizeKey(leadFilter.agent) ||
            normalizeKey(lead?.assignedAgentEmail) === normalizeKey(leadFilter.agent)

      return searchMatch && categoryMatch && directionMatch && stageMatch && agentMatch
    })
  }, [leadFilter.agent, leadFilter.category, leadFilter.direction, leadFilter.search, leadFilter.stage, records.leads])

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

  const selectedLead = selectedLeadId ? leadById.get(selectedLeadId) || null : null

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

  const groupedLeads = useMemo(() => {
    return LEAD_STAGES.map((stage) => ({
      stage,
      rows: filteredLeads.filter((lead) => normalizeText(lead?.stage) === stage),
    }))
  }, [filteredLeads])

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

  function clearLeadForm() {
    setLeadForm({
      ...NEW_LEAD_DEFAULTS,
      leadSource: getLeadSourceOptions({ leadDirection: 'Inbound', leadCategory: 'Buyer' })[0] || 'Other',
    })
    setSelectedAgentId(normalizeText(currentAgent.id || currentAgent.email))
  }

  function updateLeadFormField(key, value) {
    setLeadForm((previous) => ({ ...previous, [key]: value }))
  }

  function handleCreateLead(event) {
    event.preventDefault()
    if (!organisationId) return
    if (!normalizeText(leadForm.firstName) || !normalizeText(leadForm.phone || leadForm.email)) {
      setError('Lead first name and at least one contact method are required.')
      return
    }

    const assignedAgent = resolveAgentById(selectedAgentId || currentAgent.id)
    const fullName = [normalizeText(leadForm.firstName), normalizeText(leadForm.lastName)].filter(Boolean).join(' ').trim()
    try {
      createAgencyLead(
        organisationId,
        {
          contact: {
            firstName: fullName || 'Lead',
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
          areaInterest: leadForm.areaInterest,
          propertyInterest: leadForm.propertyInterest,
          sellerPropertyAddress: leadForm.sellerPropertyAddress,
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
      setError('')
      setMessage('Lead created.')
      clearLeadForm()
      setShowLeadForm(false)
      void reloadRecords(organisationId)
    } catch (createError) {
      setError(createError?.message || 'Unable to create lead right now.')
    }
  }

  function handleUpdateLeadStage(leadId, stage) {
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
    void reloadRecords(organisationId)
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

  async function handleCreateAppointment(event) {
    event.preventDefault()
    if (!organisationId) return
    if (!normalizeText(appointmentForm.date) || !normalizeText(appointmentForm.startTime)) {
      setError('Appointment date and start time are required.')
      return
    }
    const linkedLead = selectedLead || null
    const assignedAgent = resolveAgentById(
      normalizeText(linkedLead?.assignedAgentId || linkedLead?.assignedAgentEmail || currentAgent.id),
    )
    try {
      const created = await createAppointmentAsync(
        organisationId,
        {
          title: normalizeText(appointmentForm.title) || appointmentForm.appointmentType,
          appointmentType: appointmentForm.appointmentType,
          date: appointmentForm.date,
          startTime: appointmentForm.startTime,
          endTime: appointmentForm.endTime,
          location: appointmentForm.location,
          status: appointmentForm.status,
          leadId: normalizeText(linkedLead?.leadId) || null,
          contactId: normalizeText(appointmentForm.contactId || linkedLead?.contactId) || null,
          listingId: normalizeText(appointmentForm.listingId) || null,
          transactionId: normalizeText(appointmentForm.transactionId) || null,
          notes: appointmentForm.notes,
          participants: appointmentForm.participants,
          assignedAgent,
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      setAppointmentForm({
        ...LEAD_DETAIL_DEFAULT_APPOINTMENT,
        date: getTomorrowIsoDate(),
        startTime: getCurrentTimeValue(),
      })
      setError('')
      setMessage('Appointment added.')
      setAppointmentModalOpen(false)
      if (created?.appointmentId) {
        setSelectedAppointmentId(created.appointmentId)
      }
      await reloadRecords(organisationId)
    } catch (createError) {
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
      setAppointmentForm({
        appointmentType: appointment.appointmentType || 'Viewing',
        title: appointment.title || appointment.appointmentType || '',
        date: appointment.date || (appointment.dateTime ? String(appointment.dateTime).slice(0, 10) : ''),
        startTime: appointment.startTime || (appointment.dateTime ? String(appointment.dateTime).slice(11, 16) : ''),
        endTime: appointment.endTime || '',
        location: appointment.location || '',
        status: appointment.status || 'Pending Confirmation',
        listingId: appointment.listingId || '',
        transactionId: appointment.transactionId || '',
        contactId: appointment.contactId || '',
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
      })
      setSelectedAppointmentId(appointment.appointmentId)
      setAppointmentOutcomeForm({
        outcomeSummary: appointment.outcomeSummary || '',
        clientFeedback: appointment.clientFeedback || '',
        agentNotes: appointment.agentNotes || '',
        nextStep: appointment.nextStep || '',
        followUpDate: appointment.followUpDate || '',
      })
    } else {
      setSelectedAppointmentId('')
      setAppointmentForm({
        ...LEAD_DETAIL_DEFAULT_APPOINTMENT,
        date: getTomorrowIsoDate(),
        startTime: getCurrentTimeValue(),
        contactId: normalizeText(selectedLead?.contactId) || '',
      })
      setAppointmentOutcomeForm({
        outcomeSummary: '',
        clientFeedback: '',
        agentNotes: '',
        nextStep: '',
        followUpDate: '',
      })
    }
    setError('')
    setAppointmentModalOpen(true)
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
    if (!selectedAppointmentId) {
      await handleCreateAppointment(event)
      return
    }
    try {
      await updateAppointmentAsync(
        organisationId,
        selectedAppointmentId,
        {
          title: normalizeText(appointmentForm.title) || appointmentForm.appointmentType,
          appointmentType: appointmentForm.appointmentType,
          date: appointmentForm.date,
          startTime: appointmentForm.startTime,
          endTime: appointmentForm.endTime,
          location: appointmentForm.location,
          status: appointmentForm.status,
          listingId: normalizeText(appointmentForm.listingId) || null,
          transactionId: normalizeText(appointmentForm.transactionId) || null,
          contactId: normalizeText(appointmentForm.contactId) || null,
          notes: appointmentForm.notes,
          participants: appointmentForm.participants,
        },
        {
          actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
        },
      )
      setMessage('Appointment updated.')
      setAppointmentModalOpen(false)
      await reloadRecords(organisationId)
    } catch (updateError) {
      setError(updateError?.message || 'Unable to update appointment right now.')
    }
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

  function handleConvertLeadToDeal() {
    if (!selectedLead || !organisationId) return
    try {
      convertLeadToDealRecord(
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
      setMessage('Lead converted to deal.')
      void reloadRecords(organisationId)
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
      <header className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.72rem] uppercase tracking-[0.11em] text-[#6f8299]">{organisationName}</p>
            <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.02em] text-[#162233]">Agency CRM Pipeline</h2>
            <p className="mt-1 text-sm text-[#5d728a]">
              {isPrincipal
                ? 'Organisation-owned CRM with full visibility across agents, lead sources, activity, and conversion.'
                : 'Operational CRM focused on your leads, follow-ups, appointments, and deal progression.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-[#d8e3ef] bg-[#f8fbff] p-1">
              {[
                { key: 'pipeline', label: 'Pipeline' },
                { key: 'calendar', label: 'Calendar' },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPipelineViewMode(option.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    pipelineViewMode === option.key ? 'bg-[#1f4f78] text-white' : 'text-[#36516b]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {isPrincipal ? (
              <div className="inline-flex rounded-full border border-[#d8e3ef] bg-[#f8fbff] p-1">
                {[
                  { key: 'operational', label: 'Operational' },
                  { key: 'reporting', label: 'Management Reporting' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setPrincipalView(option.key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      principalView === option.key ? 'bg-[#1f4f78] text-white' : 'text-[#36516b]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => handleOpenAppointmentModal()}>
              <CalendarDays size={14} />
              New Appointment
            </Button>
            <Button type="button" onClick={() => setShowLeadForm((previous) => !previous)}>
              <Plus size={14} />
              {showLeadForm ? 'Close New Lead' : 'New Lead'}
            </Button>
          </div>
        </div>
      </header>

      {error ? <div className="rounded-[18px] border border-[#f6d4d4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f1d1d]">{error}</div> : null}
      {message ? <div className="rounded-[18px] border border-[#d4e8dc] bg-[#eef9f1] px-4 py-3 text-sm text-[#1a6e3a]">{message}</div> : null}

      {showLeadForm && pipelineViewMode === 'pipeline' ? (
        <form className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_20px_rgba(15,23,42,0.04)]" onSubmit={handleCreateLead}>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#2f4b65]">
            <ClipboardList size={15} />
            <span>Create Lead</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field placeholder="First name" value={leadForm.firstName} onChange={(event) => updateLeadFormField('firstName', event.target.value)} />
            <Field placeholder="Last name" value={leadForm.lastName} onChange={(event) => updateLeadFormField('lastName', event.target.value)} />
            <Field placeholder="Phone" value={leadForm.phone} onChange={(event) => updateLeadFormField('phone', event.target.value)} />
            <Field placeholder="Email" value={leadForm.email} onChange={(event) => updateLeadFormField('email', event.target.value)} />
            <Field as="select" value={leadForm.leadCategory} onChange={(event) => updateLeadFormField('leadCategory', event.target.value)}>
              {LEAD_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Field>
            <Field as="select" value={leadForm.leadDirection} onChange={(event) => updateLeadFormField('leadDirection', event.target.value)}>
              {LEAD_DIRECTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Field>
            <Field as="select" value={leadForm.leadSource} onChange={(event) => updateLeadFormField('leadSource', event.target.value)}>
              {leadSourceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Field>
            <Field as="select" value={leadForm.stage} onChange={(event) => updateLeadFormField('stage', event.target.value)}>
              {LEAD_STAGES.map((option) => (
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
            <Field
              as="select"
              value={selectedAgentId}
              onChange={(event) => setSelectedAgentId(event.target.value)}
              disabled={!isPrincipal}
            >
              {agentOptions.map((agent) => (
                <option key={`${agent.id}:${agent.email}`} value={agent.id || agent.email}>
                  {agent.name}
                </option>
              ))}
            </Field>
            <Field placeholder="Budget (optional)" value={leadForm.budget} onChange={(event) => updateLeadFormField('budget', event.target.value)} />
            <Field
              placeholder="Estimated value (optional)"
              value={leadForm.estimatedValue}
              onChange={(event) => updateLeadFormField('estimatedValue', event.target.value)}
            />
            <Field placeholder="Area interest" value={leadForm.areaInterest} onChange={(event) => updateLeadFormField('areaInterest', event.target.value)} />
            <Field
              placeholder="Property interest"
              value={leadForm.propertyInterest}
              onChange={(event) => updateLeadFormField('propertyInterest', event.target.value)}
            />
            <div className="md:col-span-2 xl:col-span-4">
              <Field
                placeholder="Seller property address (for seller leads)"
                value={leadForm.sellerPropertyAddress}
                onChange={(event) => updateLeadFormField('sellerPropertyAddress', event.target.value)}
              />
            </div>
            <div className="md:col-span-2 xl:col-span-4">
              <Field as="textarea" rows={3} placeholder="Notes" value={leadForm.notes} onChange={(event) => updateLeadFormField('notes', event.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="submit">Create Lead</Button>
          </div>
        </form>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: 'New Leads', value: metrics.newLeads, icon: UserRound },
          { label: 'Follow-ups Today', value: metrics.followUpsDueToday, icon: CheckSquare },
          { label: 'Appointments This Week', value: metrics.appointmentsThisWeek, icon: CalendarDays },
          { label: 'Active Opportunities', value: metrics.activeOpportunities, icon: TrendingUp },
          { label: 'Deals Created', value: metrics.dealsCreated, icon: ClipboardList },
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

      {pipelineViewMode === 'calendar' ? (
        <section className="space-y-4">
          <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#20344b]">Agent Calendar</h3>
                <p className="mt-1 text-sm text-[#60758d]">Schedule, confirm, and complete internal appointments linked to leads, contacts, listings, and transactions.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                            <p className="truncate text-[0.66rem] text-[#5f748d]">{appointment.title || appointment.appointmentType}</p>
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
                    <th className="pb-2">Deals</th>
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
              <Field as="select" value={leadFilter.category} onChange={(event) => setLeadFilter((previous) => ({ ...previous, category: event.target.value }))}>
                <option value="all">All Categories</option>
                {LEAD_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Field>
              <Field as="select" value={leadFilter.direction} onChange={(event) => setLeadFilter((previous) => ({ ...previous, direction: event.target.value }))}>
                <option value="all">All Directions</option>
                {LEAD_DIRECTIONS.map((option) => (
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

          <section className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
            <article className="rounded-[22px] border border-[#dde4ee] bg-white p-4">
              <h3 className="mb-3 text-base font-semibold text-[#20344b]">CRM Pipeline</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {groupedLeads.map((column) => (
                  <div key={column.stage} className="rounded-[16px] border border-[#e4ebf4] bg-[#fbfdff] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.09em] text-[#6d8199]">{column.stage}</p>
                      <span className="rounded-full border border-[#d8e2ee] bg-white px-2 py-0.5 text-xs font-semibold text-[#3a5671]">
                        {column.rows.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {column.rows.length ? (
                        column.rows.map((lead) => {
                          const active = selectedLeadId === lead.leadId
                          const nextTask = records.tasks.find((task) => normalizeText(task?.leadId) === normalizeText(lead.leadId) && normalizeText(task?.status) !== 'Completed')
                          const leadContact = contactById.get(normalizeText(lead.contactId))
                          return (
                            <button
                              key={lead.leadId}
                              type="button"
                              onClick={() => setSelectedLeadId(lead.leadId)}
                              className={`w-full rounded-[12px] border px-3 py-2 text-left transition ${
                                active ? 'border-[#2a5f8b] bg-[#edf5fc]' : 'border-[#dfE8f2] bg-white hover:border-[#c8d7e8]'
                              }`}
                            >
                              <p className="text-sm font-semibold text-[#1f3850]">
                                {[leadContact?.firstName, leadContact?.lastName].filter(Boolean).join(' ') || lead.leadCategory}
                              </p>
                              <p className="mt-1 text-xs text-[#5b728b]">{lead.leadDirection} • {lead.leadSource}</p>
                              <p className="mt-1 text-xs text-[#5b728b]">Agent: {lead.assignedAgentName || lead.assignedAgentEmail || 'Unassigned'}</p>
                              <p className="mt-1 text-xs text-[#5b728b]">Priority: {lead.priority}</p>
                              <p className="mt-1 text-xs text-[#5b728b]">Next task: {nextTask?.title || 'None'}</p>
                            </button>
                          )
                        })
                      ) : (
                        <p className="rounded-[10px] border border-dashed border-[#d7e3ef] bg-white px-3 py-4 text-xs text-[#70849c]">
                          No leads in this stage.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[22px] border border-[#dde4ee] bg-white p-4">
              <h3 className="text-base font-semibold text-[#20344b]">Lead Workspace</h3>
              {selectedLead ? (
                <div className="mt-3 space-y-4">
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" onClick={handleConvertLeadToDeal} disabled={Boolean(selectedLead.convertedDealId)}>
                        {selectedLead.convertedDealId ? 'Deal Created' : 'Convert To Deal'}
                      </Button>
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
                        onChange={(event) => setAppointmentForm((previous) => ({ ...previous, appointmentType: event.target.value }))}
                      >
                        {APPOINTMENT_TYPES.map((option) => (
                          <option key={option} value={option}>
                            {option}
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
                            <p className="font-semibold text-[#29435d]">{appointment.appointmentType}</p>
                            <p className="mt-0.5 text-[#587089]">{formatDate(appointment.dateTime)} • {appointment.status}</p>
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-[#6d839b]">No appointments yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 rounded-[14px] border border-dashed border-[#d7e2ef] bg-[#f9fbfe] px-4 py-5 text-sm text-[#6f839c]">
                  Select a lead from the pipeline board to open the CRM workspace.
                </p>
              )}
            </article>
          </section>
        </>
      )}

      <Modal
        open={appointmentModalOpen}
        onClose={() => setAppointmentModalOpen(false)}
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
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">What:</span> {selectedAppointment.title || selectedAppointment.appointmentType || 'Appointment'}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">When:</span> {formatDate(selectedAppointment.dateTime)}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">Where:</span> {selectedAppointment.location || 'Location pending'}</p>
                <p className="text-xs text-[#4f6780]"><span className="font-semibold text-[#233f58]">Why:</span> {selectedAppointment.appointmentType || selectedAppointment.nextStep || 'Meeting follow-up'}</p>
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
              onChange={(event) => setAppointmentForm((previous) => ({ ...previous, appointmentType: event.target.value }))}
            >
              {APPOINTMENT_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
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
          </div>

          <Field
            as="textarea"
            rows={3}
            placeholder="Notes"
            value={appointmentForm.notes}
            onChange={(event) => setAppointmentForm((previous) => ({ ...previous, notes: event.target.value }))}
          />

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
            <Button type="button" variant="secondary" onClick={() => setAppointmentModalOpen(false)}>
              Close
            </Button>
            <Button type="submit">
              {selectedAppointmentId ? 'Save Appointment' : 'Create Appointment'}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}

export default AgencyPipelinePage
