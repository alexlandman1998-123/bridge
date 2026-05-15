import {
  Archive,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Trash2,
  UserPlus,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import { useWorkspace } from '../context/WorkspaceContext'
import { createAgencyCrmLeadActivity, createAgencyCrmLeadRecord } from '../lib/agencyCrmRepository'
import { fetchOrganisationSettings } from '../lib/settingsApi'

const CANVASSING_CONTEXT_TIMEOUT_MS = 20000

function withCanvassingTimeout(task, message, timeoutMs = CANVASSING_CONTEXT_TIMEOUT_MS) {
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

const PROSPECT_PROPERTY_TYPES = [
  'House',
  'Apartment',
  'Townhouse',
  'Duplex',
  'Vacant Land',
  'Farm',
  'Commercial',
  'Industrial',
  'Development',
  'Other',
]

const PROSPECT_STATUSES = [
  'New',
  'Contacted',
  'Interested',
  'Follow-Up Later',
  'Not Interested',
  'Converted to Lead',
  'Lost',
  'Archived',
]

const PROSPECT_LOST_REASONS = [
  'No response',
  'Not interested',
  'Duplicate',
  'Wrong details',
  'Already listed elsewhere',
  'Bought/sold elsewhere',
  'Other',
]

const ACTIVITY_TYPES = ['Call', 'WhatsApp', 'Email', 'Door Knock', 'Note', 'Follow-Up']
const STORAGE_PREFIX = 'itg:agency-canvassing:v1'
const CANVASSING_UPDATED_EVENT = 'itg:agency-canvassing-updated'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function getProspectPropertyTypeOptions(value = '') {
  const current = normalizeText(value)
  if (!current || PROSPECT_PROPERTY_TYPES.includes(current)) {
    return PROSPECT_PROPERTY_TYPES
  }
  return [current, ...PROSPECT_PROPERTY_TYPES]
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
  window.dispatchEvent(new CustomEvent(CANVASSING_UPDATED_EVENT, { detail: { organisationId } }))
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

function getProspectDisplayName(prospect = {}) {
  return [prospect?.firstName, prospect?.lastName].map(normalizeText).filter(Boolean).join(' ') || 'Unnamed prospect'
}

function getProspectInitials(prospect = {}) {
  const source = getProspectDisplayName(prospect)
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'P'
}

function getStatusPillClass(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized.includes('converted')) return 'border-[#bfe3ca] bg-[#effaf2] text-[#23643c]'
  if (normalized.includes('interested')) return 'border-[#c9ddff] bg-[#f0f6ff] text-[#245b9f]'
  if (normalized.includes('follow')) return 'border-[#f1d49a] bg-[#fff7e8] text-[#8a5a12]'
  if (normalized.includes('not interested') || normalized.includes('lost') || normalized.includes('archived')) {
    return 'border-[#efc8c2] bg-[#fff4f2] text-[#96392e]'
  }
  return 'border-[#dce6f2] bg-[#f7fafd] text-[#39546d]'
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

function resolveProspectAudience(prospect = {}) {
  const type = normalizeText(prospect?.prospectType).toLowerCase()
  if (type.includes('seller') || type.includes('landlord')) return 'seller'
  if (type.includes('buyer') || type.includes('tenant') || type.includes('investor')) return 'buyer'
  return 'buyer'
}

function buildLeadPayloadFromProspect(prospect = {}, leadCategory = 'Buyer', currentAgent = {}, leadId = '') {
  const { firstName, lastName } = splitProspectName(prospect)
  const normalizedCategory = resolveLeadCategoryFromProspect(leadCategory, resolveDefaultLeadCategory(prospect))
  const notes = [
    normalizeText(prospect.notes),
    `Canvassing Method: ${normalizeText(prospect.canvassingMethod) || 'Other'}`,
    `Canvassing Prospect ID: ${prospect.id}`,
  ]
    .filter(Boolean)
    .join(' | ')

  return {
    contact: {
      firstName,
      lastName,
      phone: normalizeText(prospect.phone),
      email: normalizeText(prospect.email),
      notes: normalizeText(prospect.notes),
      contactType: normalizedCategory,
    },
    assignedAgent: {
      id: prospect.assignedAgentId || currentAgent.id,
      fullName: prospect.assignedAgentName || currentAgent.fullName,
      name: prospect.assignedAgentName || currentAgent.fullName,
      email: prospect.assignedAgentEmail || currentAgent.email,
    },
    lead: {
      leadId: normalizeText(leadId) || undefined,
    },
    leadCategory: normalizedCategory,
    leadDirection: 'Outbound',
    leadSource: 'Canvassing',
    stage: 'New Lead',
    status: 'New Lead',
    priority: normalizeText(prospect.followUpPriority) || 'Medium',
    budget: Number(prospect.estimatedValue || 0) || 0,
    estimatedValue: Number(prospect.estimatedValue || 0) || 0,
    areaInterest: normalizeText(prospect.area),
    propertyInterest: normalizeText(prospect.propertyType),
    sellerPropertyAddress: normalizedCategory === 'Seller' ? normalizeText(prospect.area) : '',
    canvassingProspectId: prospect.id,
    sellerName: firstName,
    sellerSurname: lastName,
    sellerEmail: normalizeText(prospect.email).toLowerCase(),
    sellerPhone: normalizeText(prospect.phone),
    notes,
  }
}

function PipelineCanvassingPage() {
  const navigate = useNavigate()
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
  const [prospectView, setProspectView] = useState('seller')
  const [filters, setFilters] = useState({ search: '', method: 'all', status: 'all', sort: 'newest' })
  const [archiveModal, setArchiveModal] = useState({
    open: false,
    prospectId: '',
    reason: PROSPECT_LOST_REASONS[0],
    notes: '',
  })
  const [deleteModal, setDeleteModal] = useState({
    open: false,
    prospectId: '',
    confirmText: '',
  })
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
        let context = null
        try {
          context = await withCanvassingTimeout(
            fetchOrganisationSettings(),
            'Organisation context is taking too long to load.',
          )
        } catch (contextError) {
          console.warn('[CANVASSING] organisation context load failed; using fallback workspace context.', contextError)
        }
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
      const audienceMatch = resolveProspectAudience(prospect) === prospectView
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
      const prospectStatus = normalizeText(prospect?.status)
      const convertedWithoutLead = prospectStatus === 'Converted to Lead' && !normalizeText(prospect?.convertedLeadId)
      const statusMatch = filters.status === 'all'
        ? (!['Converted to Lead', 'Archived'].includes(prospectStatus) || convertedWithoutLead)
        : prospectStatus === filters.status
      return audienceMatch && searchMatch && methodMatch && statusMatch
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
  }, [filters.method, filters.search, filters.sort, filters.status, prospectView, scopedProspects])

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

  function openArchiveProspectModal(prospectId) {
    setArchiveModal({
      open: true,
      prospectId: normalizeText(prospectId),
      reason: PROSPECT_LOST_REASONS[0],
      notes: '',
    })
  }

  function openDeleteProspectModal(prospectId) {
    setDeleteModal({
      open: true,
      prospectId: normalizeText(prospectId),
      confirmText: '',
    })
  }

  function handleArchiveProspect() {
    if (!organisationId) return
    const prospectId = normalizeText(archiveModal.prospectId)
    if (!prospectId) return
    const reason = normalizeText(archiveModal.reason) || PROSPECT_LOST_REASONS[0]
    const notes = normalizeText(archiveModal.notes)
    const existing = prospectById.get(prospectId) || null

    const store = readStore(organisationId)
    store.prospects = (store.prospects || []).map((row) => {
      if (normalizeText(row?.id) !== prospectId) return row
      return {
        ...row,
        status: 'Lost',
        notes: [normalizeText(row?.notes), `Archive reason: ${reason}`, notes].filter(Boolean).join(' | '),
        updatedAt: new Date().toISOString(),
      }
    })
    store.activities = [
      {
        id: createId('canvassing_activity'),
        organisationId,
        prospectId,
        agentId: currentAgent.id || null,
        agentName: currentAgent.fullName || null,
        activityType: 'Follow-Up',
        activityNote: `prospect_archived:${reason}`,
        outcome: notes || reason,
        activityDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: currentAgent.id || currentAgent.email,
      },
      ...(Array.isArray(store.activities) ? store.activities : []),
    ]
    writeStore(organisationId, store)
    setProspects(store.prospects)
    setActivities(store.activities)
    setArchiveModal((previous) => ({ ...previous, open: false }))
    setDetailOpen(false)
    setError('')
    setMessage(`${[existing?.firstName, existing?.lastName].filter(Boolean).join(' ') || 'Prospect'} archived with history preserved.`)
  }

  function handleDeleteProspect() {
    if (!organisationId) return
    const prospectId = normalizeText(deleteModal.prospectId)
    if (!prospectId) return
    if (normalizeText(deleteModal.confirmText).toUpperCase() !== 'DELETE') {
      setError('Type DELETE to permanently delete this canvassing prospect.')
      return
    }

    const store = readStore(organisationId)
    store.prospects = (store.prospects || []).filter((row) => normalizeText(row?.id) !== prospectId)
    store.activities = (store.activities || []).filter((row) => normalizeText(row?.prospectId) !== prospectId)
    writeStore(organisationId, store)
    setProspects(store.prospects)
    setActivities(store.activities)
    if (normalizeText(selectedProspectId) === prospectId) {
      setSelectedProspectId('')
      setDetailOpen(false)
    }
    setDeleteModal({ open: false, prospectId: '', confirmText: '' })
    setError('')
    setMessage('Canvassing prospect deleted permanently.')
  }

  async function handleConvertProspectToLead() {
    if (!organisationId || !selectedProspect) return
    const existingConvertedLeadId = normalizeText(selectedProspect?.convertedLeadId)
    try {
      const leadCategory = resolveLeadCategoryFromProspect(convertLeadType, resolveDefaultLeadCategory(selectedProspect))
      const createdLead = await createAgencyCrmLeadRecord(
        organisationId,
        buildLeadPayloadFromProspect(selectedProspect, leadCategory, currentAgent, existingConvertedLeadId),
        {
          actor: {
            id: currentAgent.id,
            name: currentAgent.fullName,
            email: currentAgent.email,
          },
        },
      )
      const targetLeadId = normalizeText(createdLead?.leadId || existingConvertedLeadId)
      if (!targetLeadId) {
        throw new Error('The lead could not be created. The prospect has not been moved.')
      }
      await createAgencyCrmLeadActivity(organisationId, targetLeadId, {
          agent: { id: currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
          activityType: 'Lead Created',
          activityNote: existingConvertedLeadId ? 'canvassing_lead_relinked' : 'canvassing_prospect_converted',
          outcome: existingConvertedLeadId ? 'Converted prospect lead repaired' : 'Converted from canvassing prospect',
          activityDate: new Date().toISOString(),
      }, { actor: currentAgent })

      const store = readStore(organisationId)
      store.prospects = (store.prospects || []).map((row) => {
        if (normalizeText(row?.id) !== normalizeText(selectedProspect.id)) return row
        return {
          ...row,
          status: 'Converted to Lead',
          convertedLeadId: targetLeadId,
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
          activityNote: existingConvertedLeadId
            ? `${leadCategory} lead link repaired from converted prospect`
            : `Prospect converted to ${leadCategory} lead`,
          outcome: targetLeadId,
          activityDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: currentAgent.id || currentAgent.email,
        },
        ...(Array.isArray(store.activities) ? store.activities : []),
      ]
      writeStore(organisationId, store)
      setProspects(store.prospects)
      setActivities(store.activities)
      setMessage(existingConvertedLeadId ? 'Converted prospect lead restored.' : 'Prospect converted to lead.')
      setError('')
      await loadData(organisationId)
      navigate(`/pipeline/leads/${targetLeadId}`)
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex items-center rounded-full border border-[#dbe4ee] bg-[#f6f9fc] p-1">
              <button
                type="button"
                onClick={() => setProspectView('buyer')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  prospectView === 'buyer' ? 'bg-[#1f4f78] text-white' : 'text-[#51667f] hover:text-[#1f4f78]'
                }`}
              >
                Buyer Prospects
              </button>
              <button
                type="button"
                onClick={() => setProspectView('seller')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  prospectView === 'seller' ? 'bg-[#1f4f78] text-white' : 'text-[#51667f] hover:text-[#1f4f78]'
                }`}
              >
                Seller Prospects
              </button>
            </div>
            <Button type="button" onClick={() => setShowCreateModal(true)}>
              <Plus size={14} />
              Add Prospect
            </Button>
          </div>
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
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="bg-[#f7faff] text-left text-[0.7rem] uppercase tracking-[0.08em] text-[#6f839a]">
              <tr>
                <th className="px-3 py-2">Prospect</th>
                <th className="px-3 py-2">Contact</th>
                {prospectView === 'buyer' ? (
                  <>
                    <th className="px-3 py-2">Budget</th>
                    <th className="px-3 py-2">Area of Interest</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-2">Property</th>
                    <th className="px-3 py-2">Estimated Value</th>
                  </>
                )}
                <th className="px-3 py-2">Next Step</th>
                <th className="px-3 py-2">Assigned Agent</th>
                <th className="px-3 py-2">Last Activity</th>
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
                      <td className="px-3 py-2">
                        <p className="font-medium text-[#2d4560]">{[prospect.firstName, prospect.lastName].filter(Boolean).join(' ') || 'Prospect'}</p>
                        <p className="text-xs text-[#6f839c]">{prospect.prospectType || 'Prospect'}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p>{prospect.phone || '—'}</p>
                        <p className="text-xs text-[#6f839c]">{prospect.email || 'No email'}</p>
                      </td>
                      {prospectView === 'buyer' ? (
                        <>
                          <td className="px-3 py-2">{formatCurrency(prospect.estimatedValue)}</td>
                          <td className="px-3 py-2">{prospect.area || 'Not set'}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2">{prospect.propertyType || prospect.area || 'Property not set'}</td>
                          <td className="px-3 py-2">{formatCurrency(prospect.estimatedValue)}</td>
                        </>
                      )}
                      <td className="px-3 py-2">{prospect.followUpNote || prospect.nextFollowUpDate || 'Follow up with prospect'}</td>
                      <td className="px-3 py-2">{prospect.assignedAgentName || prospect.assignedAgentEmail || 'Unassigned'}</td>
                      <td className="px-3 py-2">{lastActivity ? formatDate(lastActivity.activityDate || lastActivity.createdAt) : 'No activity yet'}</td>
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
                          <button
                            type="button"
                            className="rounded-full border border-[#ead5d2] bg-[#fff8f8] px-2 py-0.5 text-[0.66rem] font-semibold text-[#8a3a33]"
                            onClick={() => openArchiveProspectModal(prospect.id)}
                          >
                            Archive
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[#efc7c0] bg-[#fff3f1] px-2 py-0.5 text-[0.66rem] font-semibold text-[#a13225]"
                            onClick={() => openDeleteProspectModal(prospect.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-3 py-6 text-sm text-[#6f839c]" colSpan={8}>
                    {prospectView === 'seller'
                      ? 'No seller prospects yet. Add seller canvassing prospects to track valuation and mandate potential.'
                      : 'No buyer prospects yet. Add buyer canvassing prospects to track criteria and conversion readiness.'}
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
        <form className="grid gap-4" onSubmit={handleCreateProspect}>
          <div className="rounded-[14px] border border-[#dbe4ee] bg-[#f8fbff] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Prospect Type</p>
            <div className="mt-2 inline-flex items-center rounded-full border border-[#dbe4ee] bg-white p-1">
              <button
                type="button"
                onClick={() => setProspectForm((previous) => ({ ...previous, prospectType: 'Buyer Prospect' }))}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  resolveProspectAudience({ prospectType: prospectForm.prospectType }) === 'buyer'
                    ? 'bg-[#1f4f78] text-white'
                    : 'text-[#51667f] hover:text-[#1f4f78]'
                }`}
              >
                Buyer Prospect
              </button>
              <button
                type="button"
                onClick={() => setProspectForm((previous) => ({ ...previous, prospectType: 'Seller Prospect' }))}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  resolveProspectAudience({ prospectType: prospectForm.prospectType }) === 'seller'
                    ? 'bg-[#1f4f78] text-white'
                    : 'text-[#51667f] hover:text-[#1f4f78]'
                }`}
              >
                Seller Prospect
              </button>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#dbe4ee] bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Contact Details</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
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
            </div>
          </div>

          <div className="rounded-[14px] border border-[#dbe4ee] bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Prospecting Context</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
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
                as="select"
                value={prospectForm.propertyType}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, propertyType: event.target.value }))}
              >
                <option value="">
                  {resolveProspectAudience({ prospectType: prospectForm.prospectType }) === 'seller'
                    ? 'Select property type (optional)'
                    : 'Select preferred property type (optional)'}
                </option>
                {getProspectPropertyTypeOptions(prospectForm.propertyType).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Field>
              <Field
                placeholder={resolveProspectAudience({ prospectType: prospectForm.prospectType }) === 'seller' ? 'Property area / suburb' : 'Area of interest'}
                value={prospectForm.area}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, area: event.target.value }))}
              />
              <Field
                placeholder={resolveProspectAudience({ prospectType: prospectForm.prospectType }) === 'seller' ? 'Estimated property value' : 'Budget'}
                value={prospectForm.estimatedValue}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, estimatedValue: event.target.value }))}
              />
            </div>
          </div>

          <div className="rounded-[14px] border border-[#dbe4ee] bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Follow-Up Plan</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
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
              <Field
                as="textarea"
                rows={2}
                placeholder="Follow-up note"
                value={prospectForm.followUpNote}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, followUpNote: event.target.value }))}
              />
            </div>
            <Field
              as="textarea"
              className="mt-4"
              rows={3}
              placeholder="Notes"
              value={prospectForm.notes}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Prospect</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={archiveModal.open}
        onClose={() => setArchiveModal((previous) => ({ ...previous, open: false }))}
        title="Archive Prospect"
        subtitle="Move this prospect to Lost while preserving canvassing history."
        className="max-w-lg"
      >
        <div className="grid gap-3">
          <Field
            as="select"
            value={archiveModal.reason}
            onChange={(event) => setArchiveModal((previous) => ({ ...previous, reason: event.target.value }))}
          >
            {PROSPECT_LOST_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </Field>
          <Field
            as="textarea"
            rows={3}
            placeholder="Optional notes"
            value={archiveModal.notes}
            onChange={(event) => setArchiveModal((previous) => ({ ...previous, notes: event.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setArchiveModal((previous) => ({ ...previous, open: false }))}>
              Cancel
            </Button>
            <Button type="button" onClick={handleArchiveProspect}>
              Archive Prospect
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, prospectId: '', confirmText: '' })}
        title="Delete Prospect"
        subtitle="Permanently remove this canvassing prospect. Archive instead if you want to preserve the history."
        className="max-w-lg"
      >
        <div className="grid gap-3">
          <div className="rounded-[14px] border border-[#f1d0ca] bg-[#fff7f5] px-4 py-3 text-sm text-[#8d3529]">
            This cannot be undone. Canvassing activity for this prospect will be removed. Any lead already created from this prospect is not deleted.
          </div>
          <Field
            placeholder="Type DELETE to confirm"
            value={deleteModal.confirmText}
            onChange={(event) => setDeleteModal((previous) => ({ ...previous, confirmText: event.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteModal({ open: false, prospectId: '', confirmText: '' })}>
              Cancel
            </Button>
            <Button type="button" onClick={handleDeleteProspect} disabled={normalizeText(deleteModal.confirmText).toUpperCase() !== 'DELETE'}>
              Delete Prospect
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Prospect Detail"
        subtitle="Review outbound activity and convert this prospect to a lead when qualified."
        className="max-w-6xl overflow-hidden"
      >
        {selectedProspect ? (
          <div className="-m-5 bg-[#f5f8fb] p-4 sm:-m-6 sm:p-6">
            <div className="overflow-hidden rounded-[24px] border border-[#dce6f2] bg-white shadow-[0_24px_60px_rgba(15,35,55,0.12)]">
              <div className="bg-[#122236] px-4 py-5 text-white sm:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-white/[0.15] bg-white/10 text-lg font-semibold shadow-inner">
                      {getProspectInitials(selectedProspect)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-2xl font-semibold tracking-[-0.02em] text-white">
                          {getProspectDisplayName(selectedProspect)}
                        </h3>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusPillClass(selectedProspect.status)}`}>
                          {selectedProspect.status || 'New'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-[#c9d5e3]">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1">
                          <UserRound size={14} />
                          {selectedProspect.prospectType || 'Prospect'}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1">
                          <MapPin size={14} />
                          {selectedProspect.area || 'Area pending'}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1">
                          <WalletCards size={14} />
                          {formatCurrency(selectedProspect.estimatedValue)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:min-w-[420px]">
                    <div className="rounded-[16px] border border-white/10 bg-white/[0.08] px-3 py-2">
                      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[#9fb0c4]">Method</p>
                      <p className="mt-1 font-semibold text-white">{selectedProspect.canvassingMethod || 'Other'}</p>
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-white/[0.08] px-3 py-2">
                      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[#9fb0c4]">Priority</p>
                      <p className="mt-1 font-semibold text-white">{selectedProspect.followUpPriority || 'Medium'}</p>
                    </div>
                    <div className="col-span-2 rounded-[16px] border border-white/10 bg-white/[0.08] px-3 py-2 sm:col-span-1">
                      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[#9fb0c4]">Next follow-up</p>
                      <p className="mt-1 font-semibold text-white">
                        {selectedProspect.nextFollowUpDate || 'Not scheduled'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_390px]">
                <form className="space-y-5 p-4 sm:p-6" onSubmit={handleSaveProspectDetail}>
                  <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#8293aa]">Prospect profile</p>
                        <h4 className="mt-1 text-base font-semibold text-[#17263a]">Contact and qualification details</h4>
                      </div>
                      <span className="rounded-full border border-[#dce6f2] bg-[#f7fafd] px-3 py-1 text-xs font-semibold text-[#456176]">
                        {selectedProspect.convertedLeadId ? 'Lead linked' : 'Not converted'}
                      </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        First name
                        <Field value={selectedProspect.firstName || ''} onChange={(event) => handleUpdateSelectedProspect('firstName', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Last name
                        <Field value={selectedProspect.lastName || ''} onChange={(event) => handleUpdateSelectedProspect('lastName', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Phone
                        <Field value={selectedProspect.phone || ''} onChange={(event) => handleUpdateSelectedProspect('phone', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Email
                        <Field value={selectedProspect.email || ''} onChange={(event) => handleUpdateSelectedProspect('email', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Prospect type
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
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Canvassing method
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
                      </label>
                    </div>
                  </section>

                  <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                    <div className="mb-4">
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#8293aa]">Property opportunity</p>
                      <h4 className="mt-1 text-base font-semibold text-[#17263a]">Area, value and follow-up context</h4>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Area or address
                        <Field value={selectedProspect.area || ''} onChange={(event) => handleUpdateSelectedProspect('area', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Property type
                        <Field
                          as="select"
                          value={selectedProspect.propertyType || ''}
                          onChange={(event) => handleUpdateSelectedProspect('propertyType', event.target.value)}
                        >
                          <option value="">Select property type (optional)</option>
                          {getProspectPropertyTypeOptions(selectedProspect.propertyType).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Field>
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Next follow-up date
                        <Field
                          type="date"
                          value={selectedProspect.nextFollowUpDate || ''}
                          onChange={(event) => handleUpdateSelectedProspect('nextFollowUpDate', event.target.value)}
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Follow-up priority
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
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Prospect status
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
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Estimated value
                        <Field
                          value={selectedProspect.estimatedValue || ''}
                          onChange={(event) => handleUpdateSelectedProspect('estimatedValue', event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Follow-up note
                        <Field
                          as="textarea"
                          rows={3}
                          className="min-h-[96px]"
                          value={selectedProspect.followUpNote || ''}
                          onChange={(event) => handleUpdateSelectedProspect('followUpNote', event.target.value)}
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Internal notes
                        <Field
                          as="textarea"
                          rows={3}
                          className="min-h-[96px]"
                          value={selectedProspect.notes || ''}
                          onChange={(event) => handleUpdateSelectedProspect('notes', event.target.value)}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-[18px] border border-[#dfe8f3] bg-[#f8fbff] p-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-[14px] border border-[#dfe8f3] bg-white px-3 py-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8293aa]">Estimated value</p>
                        <p className="mt-1 text-lg font-semibold text-[#17263a]">{formatCurrency(selectedProspect.estimatedValue)}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#dfe8f3] bg-white px-3 py-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8293aa]">Lead status</p>
                        <p className="mt-1 truncate text-sm font-semibold text-[#17263a]">
                          {selectedProspect.convertedLeadId || 'Not converted yet'}
                        </p>
                      </div>
                      <Button type="submit" className="h-full min-h-[56px] w-full">
                        Save Prospect
                      </Button>
                    </div>
                  </section>
                </form>

                <aside className="border-t border-[#dfe8f3] bg-[#f8fbff] p-4 sm:p-6 xl:border-l xl:border-t-0">
                  <div className="space-y-4 xl:sticky xl:top-0">
                    <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#eaf2fb] text-[#214c6e]">
                          <CheckCircle2 size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#17263a]">Qualification</p>
                          <p className="text-xs text-[#6d839b]">Move this prospect into the lead pipeline.</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2">
                        <Field as="select" value={convertLeadType} onChange={(event) => setConvertLeadType(event.target.value)}>
                          {['Buyer', 'Seller'].map((option) => (
                            <option key={option} value={option}>
                              {option} Lead
                            </option>
                          ))}
                        </Field>
                        <Button type="button" onClick={handleConvertProspectToLead} className="w-full">
                          <UserPlus size={16} />
                          Convert to Lead
                        </Button>
                      </div>
                    </section>

                    <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#eef5ff] text-[#245b9f]">
                          <ClipboardList size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#17263a]">Log activity</p>
                          <p className="text-xs text-[#6d839b]">Capture the latest call, note or follow-up.</p>
                        </div>
                      </div>
                      <form className="mt-4 grid gap-2.5" onSubmit={handleLogActivity}>
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
                        <Button type="submit" className="w-full">Log Activity</Button>
                      </form>
                    </section>

                    <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#17263a]">Activity timeline</p>
                          <p className="text-xs text-[#6d839b]">{selectedProspectActivities.length} logged touchpoints</p>
                        </div>
                        <Clock3 size={18} className="text-[#7c91aa]" />
                      </div>
                      <div className="mt-4 max-h-72 space-y-3 overflow-auto pr-1">
                        {selectedProspectActivities.length ? (
                          selectedProspectActivities.map((activity) => (
                            <article key={activity.id} className="relative rounded-[14px] border border-[#e2eaf4] bg-[#fbfdff] px-3 py-3 text-xs">
                              <div className="flex items-start justify-between gap-3">
                                <p className="font-semibold text-[#29435d]">{activity.activityType}</p>
                                <span className="rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-semibold text-[#7a8ea5]">
                                  {formatDate(activity.activityDate || activity.createdAt)}
                                </span>
                              </div>
                              <p className="mt-2 text-[#587089]">{activity.activityNote || 'No note'}</p>
                              {activity.outcome ? <p className="mt-1 text-[#7a8ea5]">Outcome: {activity.outcome}</p> : null}
                            </article>
                          ))
                        ) : (
                          <div className="rounded-[14px] border border-dashed border-[#d8e3f0] bg-[#fbfdff] px-3 py-5 text-center">
                            <CalendarDays size={22} className="mx-auto text-[#8fa2b7]" />
                            <p className="mt-2 text-sm font-semibold text-[#344b63]">No activity yet</p>
                            <p className="mt-1 text-xs text-[#6d839b]">Log the first touchpoint to build a clear canvassing history.</p>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                      <p className="text-sm font-semibold text-[#17263a]">Quick actions</p>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                        <button
                          type="button"
                          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition hover:-translate-y-0.5 hover:border-[#b8c9dc] hover:bg-[#f8fbff]"
                          onClick={() => handleQuickLogActivity(selectedProspect, 'Call')}
                        >
                          <Phone size={15} />
                          Call
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition hover:-translate-y-0.5 hover:border-[#b8c9dc] hover:bg-[#f8fbff]"
                          onClick={() => handleQuickLogActivity(selectedProspect, 'WhatsApp')}
                        >
                          <MessageCircle size={15} />
                          WhatsApp
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition hover:-translate-y-0.5 hover:border-[#b8c9dc] hover:bg-[#f8fbff]"
                          onClick={() => handleQuickLogActivity(selectedProspect, 'Email')}
                        >
                          <Mail size={15} />
                          Email
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                        <button
                          type="button"
                          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#ead5d2] bg-[#fffaf8] px-3 py-2 text-sm font-semibold text-[#8a3a33] transition hover:-translate-y-0.5"
                          onClick={() => openArchiveProspectModal(selectedProspect.id)}
                        >
                          <Archive size={15} />
                          Archive Prospect
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#efc7c0] bg-[#fff3f1] px-3 py-2 text-sm font-semibold text-[#a13225] transition hover:-translate-y-0.5"
                          onClick={() => openDeleteProspectModal(selectedProspect.id)}
                        >
                          <Trash2 size={15} />
                          Delete Prospect
                        </button>
                      </div>
                    </section>
                  </div>
                </aside>
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
