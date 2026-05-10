import { Mail, MessageCircle, Phone, Plus, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import { useWorkspace } from '../context/WorkspaceContext'
import { createAgencyLead } from '../lib/agencyPipelineService'
import { fetchOrganisationSettings } from '../lib/settingsApi'

const PROSPECT_TYPES = [
  'Seller Prospect',
  'Buyer Prospect',
  'Landlord Prospect',
  'Tenant Prospect',
  'Investor Prospect',
  'Other',
]

const CANVASSING_METHODS = [
  'Cold Call',
  'Door Knock',
  'Area Farming',
  'Expired Listing',
  'Database Reactivation',
  'WhatsApp Outreach',
  'Email Outreach',
  'Referral Follow-Up',
  'Valuation Campaign',
  'Other',
]

const PROSPECT_STATUSES = [
  'New',
  'Contacted',
  'Interested',
  'Follow-Up Later',
  'Not Interested',
  'Converted to Lead',
]

const ACTIVITY_TYPES = ['Call', 'WhatsApp', 'Email', 'Door Knock', 'Note', 'Follow-Up']
const STORAGE_PREFIX = 'itg:agency-canvassing:v1'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function getStorageKey(organisationId) {
  const id = normalizeText(organisationId) || 'default'
  return `${STORAGE_PREFIX}:${id}`
}

function readStore(organisationId) {
  if (typeof window === 'undefined') {
    return { prospects: [], activities: [] }
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(organisationId))
    if (!raw) return { prospects: [], activities: [] }
    const parsed = JSON.parse(raw)
    return {
      prospects: Array.isArray(parsed?.prospects) ? parsed.prospects : [],
      activities: Array.isArray(parsed?.activities) ? parsed.activities : [],
    }
  } catch {
    return { prospects: [], activities: [] }
  }
}

function writeStore(organisationId, store) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getStorageKey(organisationId), JSON.stringify(store))
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-ZA')
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function splitProspectName(prospect = {}) {
  const firstName = normalizeText(prospect?.firstName)
  const lastName = normalizeText(prospect?.lastName)
  return {
    firstName: firstName || 'Prospect',
    lastName,
  }
}

function resolveLeadCategoryFromProspect(prospectType, fallback = 'Buyer') {
  const normalized = normalizeText(prospectType).toLowerCase()
  if (normalized.includes('seller')) return 'Seller'
  if (normalized.includes('buyer')) return 'Buyer'
  return fallback
}

function resolveDefaultLeadCategory(prospect) {
  const type = normalizeText(prospect?.prospectType).toLowerCase()
  if (type.includes('seller')) return 'Seller'
  return 'Buyer'
}

function PipelineCanvassingPage() {
  const { profile } = useWorkspace()
  const [organisationId, setOrganisationId] = useState('')
  const [organisationName, setOrganisationName] = useState('Organisation')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [prospects, setProspects] = useState([])
  const [activities, setActivities] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedProspectId, setSelectedProspectId] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [filters, setFilters] = useState({ search: '', method: 'all', status: 'all', sort: 'newest' })
  const [prospectForm, setProspectForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    prospectType: 'Seller Prospect',
    area: '',
    propertyType: '',
    canvassingMethod: 'Cold Call',
    status: 'New',
    nextFollowUpDate: '',
    followUpPriority: 'Medium',
    followUpNote: '',
    estimatedValue: '',
    notes: '',
  })
  const [activityForm, setActivityForm] = useState({ activityType: 'Call', activityNote: '', outcome: '' })
  const [convertLeadType, setConvertLeadType] = useState('Buyer')

  const currentAgent = useMemo(
    () => ({
      id: normalizeText(profile?.id || profile?.email),
      email: normalizeText(profile?.email).toLowerCase(),
      fullName:
        normalizeText(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')) || 'Current Agent',
    }),
    [profile?.email, profile?.firstName, profile?.fullName, profile?.id, profile?.lastName],
  )

  const loadData = useCallback(
    async (orgIdParam = '') => {
      const targetOrgId = normalizeText(orgIdParam || organisationId)
      if (!targetOrgId) return
      const store = readStore(targetOrgId)
      setProspects(Array.isArray(store.prospects) ? store.prospects : [])
      setActivities(Array.isArray(store.activities) ? store.activities : [])
    },
    [organisationId],
  )

  useEffect(() => {
    let active = true

    async function loadContext() {
      try {
        setLoading(true)
        setError('')
        const context = await fetchOrganisationSettings()
        if (!active) return
        const orgId = normalizeText(context?.organisation?.id || 'default')
        setOrganisationId(orgId)
        setOrganisationName(normalizeText(context?.organisation?.displayName || context?.organisation?.name || 'Organisation'))
        const store = readStore(orgId)
        setProspects(Array.isArray(store.prospects) ? store.prospects : [])
        setActivities(Array.isArray(store.activities) ? store.activities : [])
      } catch (contextError) {
        if (!active) return
        setError(contextError?.message || 'Unable to load canvassing workspace.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadContext()
    return () => {
      active = false
    }
  }, [])

  const scopedProspects = useMemo(() => {
    const agentKey = normalizeKey(currentAgent.id || currentAgent.email)
    return prospects.filter((prospect) => {
      const assignedId = normalizeKey(prospect?.assignedAgentId)
      const assignedEmail = normalizeKey(prospect?.assignedAgentEmail)
      return assignedId === agentKey || assignedEmail === agentKey
    })
  }, [currentAgent.email, currentAgent.id, prospects])

  const scopedActivities = useMemo(() => {
    const scopedIds = new Set(scopedProspects.map((prospect) => normalizeText(prospect?.id)))
    return activities.filter((activity) => scopedIds.has(normalizeText(activity?.prospectId)))
  }, [activities, scopedProspects])

  const filteredProspects = useMemo(() => {
    const rows = scopedProspects.filter((prospect) => {
      const searchMatch = filters.search
        ? [
            prospect?.firstName,
            prospect?.lastName,
            prospect?.phone,
            prospect?.email,
            prospect?.area,
            prospect?.propertyType,
            prospect?.canvassingMethod,
            prospect?.status,
          ]
            .join(' ')
            .toLowerCase()
            .includes(filters.search.toLowerCase())
        : true
      const methodMatch = filters.method === 'all' ? true : normalizeText(prospect?.canvassingMethod) === filters.method
      const statusMatch = filters.status === 'all' ? true : normalizeText(prospect?.status) === filters.status
      return searchMatch && methodMatch && statusMatch
    })

    return rows.sort((left, right) => {
      if (filters.sort === 'next_follow_up') {
        const leftDate = new Date(left?.nextFollowUpDate || 8640000000000000).getTime()
        const rightDate = new Date(right?.nextFollowUpDate || 8640000000000000).getTime()
        return leftDate - rightDate
      }
      if (filters.sort === 'status') {
        return normalizeText(left?.status).localeCompare(normalizeText(right?.status))
      }
      const leftTime = new Date(left?.createdAt || 0).getTime()
      const rightTime = new Date(right?.createdAt || 0).getTime()
      return rightTime - leftTime
    })
  }, [filters.method, filters.search, filters.sort, filters.status, scopedProspects])

  const prospectById = useMemo(() => {
    const map = new Map()
    for (const prospect of scopedProspects) {
      map.set(normalizeText(prospect?.id), prospect)
    }
    return map
  }, [scopedProspects])

  const selectedProspect = useMemo(() => {
    if (!selectedProspectId) return null
    return prospectById.get(normalizeText(selectedProspectId)) || null
  }, [prospectById, selectedProspectId])

  const selectedProspectActivities = useMemo(() => {
    if (!selectedProspect) return []
    return scopedActivities
      .filter((activity) => normalizeText(activity?.prospectId) === normalizeText(selectedProspect?.id))
      .sort((a, b) => new Date(b?.activityDate || b?.createdAt || 0) - new Date(a?.activityDate || a?.createdAt || 0))
  }, [scopedActivities, selectedProspect])

  const metrics = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const callsLogged = scopedActivities.filter((activity) => normalizeText(activity?.activityType) === 'Call').length
    const doorKnocks = scopedActivities.filter((activity) => normalizeText(activity?.activityType) === 'Door Knock').length
    const followUpsDue = scopedProspects.filter((prospect) => {
      const due = new Date(prospect?.nextFollowUpDate || '')
      if (Number.isNaN(due.getTime())) return false
      due.setHours(0, 0, 0, 0)
      const status = normalizeText(prospect?.status)
      return due.getTime() <= today.getTime() && status !== 'Converted to Lead'
    }).length
    const convertedToLeads = scopedProspects.filter(
      (prospect) => normalizeText(prospect?.status) === 'Converted to Lead' || normalizeText(prospect?.convertedLeadId),
    ).length

    return {
      prospectsAdded: scopedProspects.length,
      callsLogged,
      doorKnocks,
      followUpsDue,
      convertedToLeads,
    }
  }, [scopedActivities, scopedProspects])

  const availableMethods = useMemo(() => {
    return Array.from(new Set(scopedProspects.map((prospect) => normalizeText(prospect?.canvassingMethod)).filter(Boolean)))
  }, [scopedProspects])

  function resetProspectForm() {
    setProspectForm({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      prospectType: 'Seller Prospect',
      area: '',
      propertyType: '',
      canvassingMethod: 'Cold Call',
      status: 'New',
      nextFollowUpDate: '',
      followUpPriority: 'Medium',
      followUpNote: '',
      estimatedValue: '',
      notes: '',
    })
  }

  function handleOpenProspectDetail(prospect) {
    const next = prospectById.get(normalizeText(prospect?.id))
    if (!next) return
    setSelectedProspectId(next.id)
    setConvertLeadType(resolveDefaultLeadCategory(next))
    setDetailOpen(true)
    setError('')
  }

  function handleCreateProspect(event) {
    event.preventDefault()
    if (!organisationId) return
    if (!normalizeText(prospectForm.firstName) || (!normalizeText(prospectForm.phone) && !normalizeText(prospectForm.email))) {
      setError('Prospect name and one contact method are required.')
      return
    }

    const created = {
      id: createId('prospect'),
      organisationId,
      assignedAgentId: currentAgent.id || null,
      assignedAgentName: currentAgent.fullName || null,
      assignedAgentEmail: currentAgent.email || null,
      firstName: normalizeText(prospectForm.firstName),
      lastName: normalizeText(prospectForm.lastName),
      phone: normalizeText(prospectForm.phone),
      email: normalizeText(prospectForm.email).toLowerCase(),
      prospectType: normalizeText(prospectForm.prospectType) || 'Other',
      area: normalizeText(prospectForm.area),
      propertyType: normalizeText(prospectForm.propertyType),
      canvassingMethod: normalizeText(prospectForm.canvassingMethod) || 'Other',
      status: normalizeText(prospectForm.status) || 'New',
      nextFollowUpDate: normalizeText(prospectForm.nextFollowUpDate),
      followUpPriority: normalizeText(prospectForm.followUpPriority) || 'Medium',
      followUpNote: normalizeText(prospectForm.followUpNote),
      estimatedValue: Number(prospectForm.estimatedValue || 0) || 0,
      notes: normalizeText(prospectForm.notes),
      convertedLeadId: null,
      createdBy: currentAgent.id || currentAgent.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const store = readStore(organisationId)
    store.prospects = [created, ...(Array.isArray(store.prospects) ? store.prospects : [])]
    writeStore(organisationId, store)

    setProspects(store.prospects)
    setMessage('Prospect added.')
    setError('')
    setShowCreateModal(false)
    resetProspectForm()
  }

  function handleSaveProspectDetail(event) {
    event.preventDefault()
    if (!organisationId || !selectedProspect) return

    const store = readStore(organisationId)
    store.prospects = (store.prospects || []).map((row) => {
      if (normalizeText(row?.id) !== normalizeText(selectedProspect.id)) return row
      return {
        ...row,
        firstName: normalizeText(selectedProspect.firstName),
        lastName: normalizeText(selectedProspect.lastName),
        phone: normalizeText(selectedProspect.phone),
        email: normalizeText(selectedProspect.email).toLowerCase(),
        prospectType: normalizeText(selectedProspect.prospectType) || 'Other',
        area: normalizeText(selectedProspect.area),
        propertyType: normalizeText(selectedProspect.propertyType),
        canvassingMethod: normalizeText(selectedProspect.canvassingMethod) || 'Other',
        status: normalizeText(selectedProspect.status) || 'New',
        nextFollowUpDate: normalizeText(selectedProspect.nextFollowUpDate),
        followUpPriority: normalizeText(selectedProspect.followUpPriority) || 'Medium',
        followUpNote: normalizeText(selectedProspect.followUpNote),
        estimatedValue: Number(selectedProspect.estimatedValue || 0) || 0,
        notes: normalizeText(selectedProspect.notes),
        updatedAt: new Date().toISOString(),
      }
    })
    writeStore(organisationId, store)
    setProspects(store.prospects)
    setMessage('Prospect updated.')
  }

  function handleUpdateSelectedProspect(field, value) {
    setProspects((previous) =>
      previous.map((row) => {
        if (normalizeText(row?.id) !== normalizeText(selectedProspectId)) return row
        return {
          ...row,
          [field]: value,
        }
      }),
    )
  }

  function handleLogActivity(event) {
    event.preventDefault()
    if (!organisationId || !selectedProspect) return
    if (!normalizeText(activityForm.activityNote)) {
      setError('Add an activity note before logging.')
      return
    }

    const nextActivity = {
      id: createId('canvassing_activity'),
      organisationId,
      prospectId: selectedProspect.id,
      agentId: currentAgent.id || null,
      agentName: currentAgent.fullName || null,
      activityType: normalizeText(activityForm.activityType) || 'Note',
      activityNote: normalizeText(activityForm.activityNote),
      outcome: normalizeText(activityForm.outcome),
      activityDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: currentAgent.id || currentAgent.email,
    }

    const store = readStore(organisationId)
    store.activities = [nextActivity, ...(Array.isArray(store.activities) ? store.activities : [])]
    writeStore(organisationId, store)

    setActivities(store.activities)
    setActivityForm({ activityType: 'Call', activityNote: '', outcome: '' })
    setError('')
    setMessage('Activity logged.')
  }

  function handleQuickLogActivity(prospect, type) {
    if (!organisationId || !prospect) return
    const nextActivity = {
      id: createId('canvassing_activity'),
      organisationId,
      prospectId: prospect.id,
      agentId: currentAgent.id || null,
      agentName: currentAgent.fullName || null,
      activityType: type,
      activityNote: `${type} action logged`,
      outcome: '',
      activityDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: currentAgent.id || currentAgent.email,
    }

    const store = readStore(organisationId)
    store.activities = [nextActivity, ...(Array.isArray(store.activities) ? store.activities : [])]
    writeStore(organisationId, store)
    setActivities(store.activities)
    setMessage(`${type} logged.`)
  }

  async function handleConvertProspectToLead() {
    if (!organisationId || !selectedProspect) return
    if (normalizeText(selectedProspect?.convertedLeadId)) {
      setMessage(`Prospect already converted to lead (${selectedProspect.convertedLeadId}).`)
      setError('')
      return
    }
    try {
      const { firstName, lastName } = splitProspectName(selectedProspect)
      const leadCategory = resolveLeadCategoryFromProspect(convertLeadType, resolveDefaultLeadCategory(selectedProspect))
      const createdLead = createAgencyLead(
        organisationId,
        {
          contact: {
            firstName,
            lastName,
            phone: normalizeText(selectedProspect.phone),
            email: normalizeText(selectedProspect.email),
            notes: normalizeText(selectedProspect.notes),
            contactType: leadCategory,
          },
          assignedAgent: {
            id: selectedProspect.assignedAgentId || currentAgent.id,
            fullName: selectedProspect.assignedAgentName || currentAgent.fullName,
            email: selectedProspect.assignedAgentEmail || currentAgent.email,
          },
          leadCategory,
          leadDirection: 'Outbound',
          leadSource: 'Canvassing',
          stage: 'New Lead',
          priority: normalizeText(selectedProspect.followUpPriority) || 'Medium',
          budget: Number(selectedProspect.estimatedValue || 0) || 0,
          estimatedValue: Number(selectedProspect.estimatedValue || 0) || 0,
          areaInterest: normalizeText(selectedProspect.area),
          propertyInterest: normalizeText(selectedProspect.propertyType),
          sellerPropertyAddress: leadCategory === 'Seller' ? normalizeText(selectedProspect.area) : '',
          canvassingProspectId: selectedProspect.id,
          notes: [
            normalizeText(selectedProspect.notes),
            `Canvassing Method: ${normalizeText(selectedProspect.canvassingMethod) || 'Other'}`,
            `Canvassing Prospect ID: ${selectedProspect.id}`,
          ]
            .filter(Boolean)
            .join(' | '),
        },
        {
          actor: {
            id: currentAgent.id,
            name: currentAgent.fullName,
            email: currentAgent.email,
          },
        },
      )

      const store = readStore(organisationId)
      store.prospects = (store.prospects || []).map((row) => {
        if (normalizeText(row?.id) !== normalizeText(selectedProspect.id)) return row
        return {
          ...row,
          status: 'Converted to Lead',
          convertedLeadId: createdLead?.leadId || null,
          updatedAt: new Date().toISOString(),
        }
      })
      store.activities = [
        {
          id: createId('canvassing_activity'),
          organisationId,
          prospectId: selectedProspect.id,
          agentId: currentAgent.id || null,
          agentName: currentAgent.fullName || null,
          activityType: 'Note',
          activityNote: `Prospect converted to ${leadCategory} lead`,
          outcome: createdLead?.leadId || '',
          activityDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: currentAgent.id || currentAgent.email,
        },
        ...(Array.isArray(store.activities) ? store.activities : []),
      ]
      writeStore(organisationId, store)
      setProspects(store.prospects)
      setActivities(store.activities)
      setMessage('Prospect converted to lead.')
      setError('')
      await loadData(organisationId)
    } catch (convertError) {
      setError(convertError?.message || 'Unable to convert prospect to lead.')
    }
  }

  if (loading) {
    return (
      <section className="rounded-[20px] border border-[#dde4ee] bg-white p-6">
        <p className="text-sm text-[#61758f]">Loading canvassing workspace...</p>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <header className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.72rem] uppercase tracking-[0.11em] text-[#6f8299]">{organisationName}</p>
            <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.02em] text-[#162233]">Canvassing</h2>
            <p className="mt-1 text-sm text-[#5d728a]">
              Track prospecting activity and convert interested prospects into leads.
            </p>
          </div>
          <Button type="button" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} />
            Add Prospect
          </Button>
        </div>
      </header>

      {error ? <div className="rounded-[18px] border border-[#f6d4d4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f1d1d]">{error}</div> : null}
      {message ? <div className="rounded-[18px] border border-[#d4e8dc] bg-[#eef9f1] px-4 py-3 text-sm text-[#1a6e3a]">{message}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Prospects Added', value: metrics.prospectsAdded },
          { label: 'Calls Logged', value: metrics.callsLogged },
          { label: 'Door Knocks', value: metrics.doorKnocks },
          { label: 'Follow-Ups Due', value: metrics.followUpsDue },
          { label: 'Converted to Leads', value: metrics.convertedToLeads },
        ].map((metric) => (
          <article key={metric.label} className="rounded-[18px] border border-[#dce6f1] bg-white px-4 py-3 shadow-[0_8px_16px_rgba(15,23,42,0.03)]">
            <span className="text-[0.7rem] uppercase tracking-[0.09em] text-[#768aa1]">{metric.label}</span>
            <strong className="mt-2 block text-[1.4rem] font-semibold tracking-[-0.03em] text-[#132437]">{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field
            placeholder="Search prospects"
            value={filters.search}
            onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
          />
          <Field
            as="select"
            value={filters.method}
            onChange={(event) => setFilters((previous) => ({ ...previous, method: event.target.value }))}
          >
            <option value="all">All Methods</option>
            {availableMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Field>
          <Field
            as="select"
            value={filters.status}
            onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))}
          >
            <option value="all">All Statuses</option>
            {PROSPECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Field>
          <Field
            as="select"
            value={filters.sort}
            onChange={(event) => setFilters((previous) => ({ ...previous, sort: event.target.value }))}
          >
            <option value="newest">Sort: Newest</option>
            <option value="next_follow_up">Sort: Next Follow-Up</option>
            <option value="status">Sort: Status</option>
          </Field>
        </div>

        <div className="mt-4 overflow-x-auto rounded-[14px] border border-[#e4ebf4]">
          <table className="min-w-[1320px] w-full text-sm">
            <thead className="bg-[#f7faff] text-left text-[0.7rem] uppercase tracking-[0.08em] text-[#6f839a]">
              <tr>
                <th className="px-3 py-2">Prospect Name</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Prospect Type</th>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2">Property Type</th>
                <th className="px-3 py-2">Canvassing Method</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last Activity</th>
                <th className="px-3 py-2">Next Follow-Up</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProspects.length ? (
                filteredProspects.map((prospect) => {
                  const lastActivity = scopedActivities
                    .filter((row) => normalizeText(row?.prospectId) === normalizeText(prospect?.id))
                    .sort((a, b) => new Date(b?.activityDate || b?.createdAt || 0) - new Date(a?.activityDate || a?.createdAt || 0))[0]

                  return (
                    <tr
                      key={prospect.id}
                      className="cursor-pointer border-t border-[#e8eef5] text-[#2d4560] transition hover:bg-[#f8fbff]"
                      onClick={() => handleOpenProspectDetail(prospect)}
                    >
                      <td className="px-3 py-2">{[prospect.firstName, prospect.lastName].filter(Boolean).join(' ') || 'Prospect'}</td>
                      <td className="px-3 py-2">{prospect.phone || '—'}</td>
                      <td className="px-3 py-2">{prospect.email || '—'}</td>
                      <td className="px-3 py-2">{prospect.prospectType || '—'}</td>
                      <td className="px-3 py-2">{prospect.area || '—'}</td>
                      <td className="px-3 py-2">{prospect.propertyType || '—'}</td>
                      <td className="px-3 py-2">{prospect.canvassingMethod || '—'}</td>
                      <td className="px-3 py-2">{prospect.status || 'New'}</td>
                      <td className="px-3 py-2">{lastActivity ? formatDate(lastActivity.activityDate || lastActivity.createdAt) : 'No activity yet'}</td>
                      <td className="px-3 py-2">{prospect.nextFollowUpDate || 'No follow-up set'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="rounded-full border border-[#dce6f2] px-2 py-0.5 text-[0.66rem] font-semibold text-[#35546c]"
                            onClick={() => handleQuickLogActivity(prospect, 'Call')}
                          >
                            Call
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[#dce6f2] px-2 py-0.5 text-[0.66rem] font-semibold text-[#35546c]"
                            onClick={() => handleQuickLogActivity(prospect, 'WhatsApp')}
                          >
                            WhatsApp
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[#dce6f2] px-2 py-0.5 text-[0.66rem] font-semibold text-[#35546c]"
                            onClick={() => handleQuickLogActivity(prospect, 'Email')}
                          >
                            Email
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[#dce6f2] px-2 py-0.5 text-[0.66rem] font-semibold text-[#35546c]"
                            onClick={() => handleOpenProspectDetail(prospect)}
                          >
                            Convert to Lead
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-3 py-6 text-sm text-[#6f839c]" colSpan={11}>
                    No canvassing prospects yet. Add prospects from outbound activity and convert interested contacts into leads.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          resetProspectForm()
        }}
        title="Add Canvassing Prospect"
        subtitle="Capture outbound prospecting contacts and set follow-up actions."
        className="max-w-3xl"
      >
        <form className="grid gap-3" onSubmit={handleCreateProspect}>
          <div className="grid gap-2 md:grid-cols-2">
            <Field
              placeholder="First name"
              value={prospectForm.firstName}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, firstName: event.target.value }))}
            />
            <Field
              placeholder="Last name"
              value={prospectForm.lastName}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, lastName: event.target.value }))}
            />
            <Field
              placeholder="Phone"
              value={prospectForm.phone}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, phone: event.target.value }))}
            />
            <Field
              placeholder="Email"
              value={prospectForm.email}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, email: event.target.value }))}
            />
            <Field
              as="select"
              value={prospectForm.prospectType}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, prospectType: event.target.value }))}
            >
              {PROSPECT_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Field>
            <Field
              as="select"
              value={prospectForm.canvassingMethod}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, canvassingMethod: event.target.value }))}
            >
              {CANVASSING_METHODS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Field>
            <Field
              placeholder="Area"
              value={prospectForm.area}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, area: event.target.value }))}
            />
            <Field
              placeholder="Property type"
              value={prospectForm.propertyType}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, propertyType: event.target.value }))}
            />
            <Field
              type="date"
              value={prospectForm.nextFollowUpDate}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, nextFollowUpDate: event.target.value }))}
            />
            <Field
              as="select"
              value={prospectForm.followUpPriority}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, followUpPriority: event.target.value }))}
            >
              {['Low', 'Medium', 'High', 'Urgent'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Field>
            <Field
              placeholder="Estimated value"
              value={prospectForm.estimatedValue}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, estimatedValue: event.target.value }))}
            />
            <Field
              as="select"
              value={prospectForm.status}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, status: event.target.value }))}
            >
              {PROSPECT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Field>
          </div>
          <Field
            as="textarea"
            rows={2}
            placeholder="Follow-up note"
            value={prospectForm.followUpNote}
            onChange={(event) => setProspectForm((previous) => ({ ...previous, followUpNote: event.target.value }))}
          />
          <Field
            as="textarea"
            rows={3}
            placeholder="Notes"
            value={prospectForm.notes}
            onChange={(event) => setProspectForm((previous) => ({ ...previous, notes: event.target.value }))}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Prospect</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Prospect Detail"
        subtitle="Review outbound activity and convert this prospect to a lead when qualified."
        className="max-w-5xl"
      >
        {selectedProspect ? (
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <form className="space-y-3" onSubmit={handleSaveProspectDetail}>
              <div className="grid gap-2 md:grid-cols-2">
                <Field value={selectedProspect.firstName || ''} onChange={(event) => handleUpdateSelectedProspect('firstName', event.target.value)} />
                <Field value={selectedProspect.lastName || ''} onChange={(event) => handleUpdateSelectedProspect('lastName', event.target.value)} />
                <Field value={selectedProspect.phone || ''} onChange={(event) => handleUpdateSelectedProspect('phone', event.target.value)} />
                <Field value={selectedProspect.email || ''} onChange={(event) => handleUpdateSelectedProspect('email', event.target.value)} />
                <Field
                  as="select"
                  value={selectedProspect.prospectType || 'Other'}
                  onChange={(event) => handleUpdateSelectedProspect('prospectType', event.target.value)}
                >
                  {PROSPECT_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Field>
                <Field
                  as="select"
                  value={selectedProspect.canvassingMethod || 'Other'}
                  onChange={(event) => handleUpdateSelectedProspect('canvassingMethod', event.target.value)}
                >
                  {CANVASSING_METHODS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Field>
                <Field value={selectedProspect.area || ''} onChange={(event) => handleUpdateSelectedProspect('area', event.target.value)} />
                <Field value={selectedProspect.propertyType || ''} onChange={(event) => handleUpdateSelectedProspect('propertyType', event.target.value)} />
                <Field
                  type="date"
                  value={selectedProspect.nextFollowUpDate || ''}
                  onChange={(event) => handleUpdateSelectedProspect('nextFollowUpDate', event.target.value)}
                />
                <Field
                  as="select"
                  value={selectedProspect.followUpPriority || 'Medium'}
                  onChange={(event) => handleUpdateSelectedProspect('followUpPriority', event.target.value)}
                >
                  {['Low', 'Medium', 'High', 'Urgent'].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Field>
                <Field
                  as="select"
                  value={selectedProspect.status || 'New'}
                  onChange={(event) => handleUpdateSelectedProspect('status', event.target.value)}
                >
                  {PROSPECT_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Field>
                <Field
                  value={selectedProspect.estimatedValue || ''}
                  onChange={(event) => handleUpdateSelectedProspect('estimatedValue', event.target.value)}
                />
              </div>

              <Field
                as="textarea"
                rows={2}
                value={selectedProspect.followUpNote || ''}
                onChange={(event) => handleUpdateSelectedProspect('followUpNote', event.target.value)}
              />
              <Field
                as="textarea"
                rows={3}
                value={selectedProspect.notes || ''}
                onChange={(event) => handleUpdateSelectedProspect('notes', event.target.value)}
              />

              <div className="rounded-[12px] border border-[#dce6f2] bg-[#f8fbff] px-3 py-2 text-xs text-[#4f6780]">
                <p><span className="font-semibold text-[#233f58]">Estimated Value:</span> {formatCurrency(selectedProspect.estimatedValue)}</p>
                <p className="mt-1"><span className="font-semibold text-[#233f58]">Converted Lead ID:</span> {selectedProspect.convertedLeadId || 'Not converted yet'}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit">Save Prospect</Button>
                <Field as="select" value={convertLeadType} onChange={(event) => setConvertLeadType(event.target.value)}>
                  {['Buyer', 'Seller'].map((option) => (
                    <option key={option} value={option}>
                      {option} Lead
                    </option>
                  ))}
                </Field>
                <Button type="button" variant="secondary" onClick={handleConvertProspectToLead}>
                  <UserPlus size={14} />
                  Convert to Lead
                </Button>
              </div>
            </form>

            <div className="space-y-3">
              <div className="rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                <h4 className="text-sm font-semibold text-[#28435e]">Log Activity</h4>
                <form className="mt-2 grid gap-2" onSubmit={handleLogActivity}>
                  <Field
                    as="select"
                    value={activityForm.activityType}
                    onChange={(event) => setActivityForm((previous) => ({ ...previous, activityType: event.target.value }))}
                  >
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
                  <Field
                    placeholder="Outcome"
                    value={activityForm.outcome}
                    onChange={(event) => setActivityForm((previous) => ({ ...previous, outcome: event.target.value }))}
                  />
                  <Button type="submit">Log Activity</Button>
                </form>
              </div>

              <div className="rounded-[14px] border border-[#e4ebf4] bg-white p-3">
                <h4 className="text-sm font-semibold text-[#28435e]">Activity Timeline</h4>
                <div className="mt-2 max-h-64 space-y-2 overflow-auto">
                  {selectedProspectActivities.length ? (
                    selectedProspectActivities.map((activity) => (
                      <article key={activity.id} className="rounded-[10px] border border-[#e7edf5] bg-[#fbfdff] px-2.5 py-2 text-xs">
                        <p className="font-semibold text-[#29435d]">{activity.activityType}</p>
                        <p className="mt-0.5 text-[#587089]">{activity.activityNote || 'No note'}</p>
                        <p className="mt-0.5 text-[#7a8ea5]">{activity.outcome || 'No outcome'}</p>
                        <p className="mt-0.5 text-[#7a8ea5]">{formatDate(activity.activityDate || activity.createdAt)}</p>
                      </article>
                    ))
                  ) : (
                    <p className="text-xs text-[#6d839b]">No canvassing activity logged yet.</p>
                  )}
                </div>
              </div>

              <div className="rounded-[14px] border border-[#e4ebf4] bg-[#fbfdff] p-3">
                <p className="text-sm font-semibold text-[#28435e]">Quick Actions</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-[#dce6f2] px-2.5 py-1 text-xs font-semibold text-[#35546c]"
                    onClick={() => handleQuickLogActivity(selectedProspect, 'Call')}
                  >
                    <Phone size={12} className="inline-block mr-1" />
                    Call
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#dce6f2] px-2.5 py-1 text-xs font-semibold text-[#35546c]"
                    onClick={() => handleQuickLogActivity(selectedProspect, 'WhatsApp')}
                  >
                    <MessageCircle size={12} className="inline-block mr-1" />
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#dce6f2] px-2.5 py-1 text-xs font-semibold text-[#35546c]"
                    onClick={() => handleQuickLogActivity(selectedProspect, 'Email')}
                  >
                    <Mail size={12} className="inline-block mr-1" />
                    Email
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#6d839b]">Select a prospect row to open details.</p>
        )}
      </Modal>
    </section>
  )
}

export default PipelineCanvassingPage
