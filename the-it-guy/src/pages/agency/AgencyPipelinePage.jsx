import { CalendarDays, CheckSquare, ClipboardList, Plus, TrendingUp, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  ACTIVITY_TYPES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  LEAD_CATEGORIES,
  LEAD_DIRECTIONS,
  LEAD_PRIORITIES,
  LEAD_STAGES,
  TASK_PRIORITIES,
  buildPipelineMetrics,
  buildPrincipalReporting,
  convertLeadToDealRecord,
  createAgencyLead,
  createLeadAppointment,
  createLeadTask,
  getAgencyCrmUpdatedEventName,
  getAgencyPipelineSnapshot,
  getLeadSourceOptions,
  updateAgencyLead,
  updateLeadTask,
  addLeadActivity,
} from '../../lib/agencyPipelineService'
import { listOrganisationUsers, fetchOrganisationSettings } from '../../lib/settingsApi'
import { canAccessPrincipalExperience, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'

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
  dateTime: '',
  location: '',
  status: 'Pending',
  notes: '',
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

function AgencyPipelinePage() {
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
    (orgId) => {
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
      const scopedAppointments = snapshot.appointments.filter((row) => scopedLeadIds.has(normalizeText(row?.leadId)))
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
      reloadRecords(resolvedOrgId)
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
    const handler = () => reloadRecords(organisationId)
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
      reloadRecords(organisationId)
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
    reloadRecords(organisationId)
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
    reloadRecords(organisationId)
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
    reloadRecords(organisationId)
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
    reloadRecords(organisationId)
  }

  function handleCreateAppointment(event) {
    event.preventDefault()
    if (!selectedLead || !organisationId) return
    if (!normalizeText(appointmentForm.dateTime)) {
      setError('Appointment date/time is required.')
      return
    }
    createLeadAppointment(
      organisationId,
      selectedLead.leadId,
      {
        appointmentType: appointmentForm.appointmentType,
        dateTime: appointmentForm.dateTime,
        location: appointmentForm.location,
        status: appointmentForm.status,
        notes: appointmentForm.notes,
        agent: resolveAgentById(selectedLead.assignedAgentId || selectedLead.assignedAgentEmail || currentAgent.id),
      },
      {
        actor: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
      },
    )
    setAppointmentForm(LEAD_DETAIL_DEFAULT_APPOINTMENT)
    setError('')
    setMessage('Appointment added.')
    reloadRecords(organisationId)
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
      reloadRecords(organisationId)
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
            <Button type="button" onClick={() => setShowLeadForm((previous) => !previous)}>
              <Plus size={14} />
              {showLeadForm ? 'Close New Lead' : 'New Lead'}
            </Button>
          </div>
        </div>
      </header>

      {error ? <div className="rounded-[18px] border border-[#f6d4d4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f1d1d]">{error}</div> : null}
      {message ? <div className="rounded-[18px] border border-[#d4e8dc] bg-[#eef9f1] px-4 py-3 text-sm text-[#1a6e3a]">{message}</div> : null}

      {showLeadForm ? (
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

      {isPrincipal && principalView === 'reporting' ? (
        <section className="grid gap-4 xl:grid-cols-2">
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
                        <td className="py-2 pr-3">{row.dealsCreated}</td>
                        <td className="py-2 pr-3">{row.conversionRate}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-3 text-[#6c8097]" colSpan={6}>
                        No activity logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
                      <Field type="datetime-local" value={appointmentForm.dateTime} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, dateTime: event.target.value }))} />
                      <Field placeholder="Location" value={appointmentForm.location} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, location: event.target.value }))} />
                      <Field as="select" value={appointmentForm.status} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, status: event.target.value }))}>
                        {APPOINTMENT_STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Field>
                      <Field placeholder="Notes" value={appointmentForm.notes} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, notes: event.target.value }))} />
                      <Button type="submit">Book Appointment</Button>
                    </form>
                    <div className="max-h-36 space-y-2 overflow-auto pt-1">
                      {selectedLeadAppointments.length ? (
                        selectedLeadAppointments.map((appointment) => (
                          <div key={appointment.appointmentId} className="rounded-[10px] border border-[#e7edf5] bg-[#fbfdff] px-2.5 py-2 text-xs">
                            <p className="font-semibold text-[#29435d]">{appointment.appointmentType}</p>
                            <p className="mt-0.5 text-[#587089]">{formatDate(appointment.dateTime)} • {appointment.status}</p>
                          </div>
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
    </section>
  )
}

export default AgencyPipelinePage
