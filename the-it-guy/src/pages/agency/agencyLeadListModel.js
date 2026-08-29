import { inferLeadCategoryFromRecord } from '../../lib/leadCategory'
import { BUYER_LEAD_LIST_STAGES, resolveAgencyLeadListLifecycle } from './agencyLeadListLifecycle'

export const LEAD_LIST_PAGE_SIZE = 12

export const DEFAULT_AGENCY_LEAD_FILTERS = Object.freeze({
  search: '',
  source: 'all',
  stage: 'all',
  agent: 'all',
  sort: 'newest',
})

export const AGENCY_LEAD_CATEGORY_TABS = Object.freeze([
  { key: 'buyer', label: 'Buyer Leads' },
  { key: 'seller', label: 'Seller Leads' },
  { key: 'archived', label: 'Archived' },
])

const BUYER_STAGE_META = Object.freeze({
  captured: 'New buyer leads needing first contact.',
  contacted: 'Buyers with logged contact.',
  qualified: 'Intent, budget, finance and timing confirmed.',
  viewing: 'Viewings planned or completed.',
  transaction_setup: 'Buyer and transaction setup in progress.',
  offer: 'Offer preparation or review in progress.',
  transaction: 'Transaction opened from an accepted offer.',
  on_hold: 'Paused buyers who are not lost.',
  lost: 'Buyers marked lost before transaction.',
  closed_won: 'Completed buyer transactions.',
  closed_lost: 'Buyer transactions that fell through.',
})

const SELLER_STAGES = Object.freeze([
  ['lead', 'Lead', 'Lead', 'New seller leads needing qualification.'],
  ['valuation_scheduled', 'Valuation Scheduled', 'Appointment Scheduled', 'Valuation booked or being arranged.'],
  ['mandate_signed', 'Mandate Signed', 'Mandate Signed', 'Mandate signed and ready to list.'],
  ['listing_active', 'Listing Active', 'Converted To Listing', 'Property listed and being marketed.'],
  ['offer_received', 'Offer Received', 'Offer Submitted', 'Offer received from a buyer.'],
  ['deal_otp', 'Deal / OTP', 'Deal Created', 'Deal created or OTP in motion.'],
  ['transfer', 'Transfer', 'Transfer', 'Transfer process in progress.'],
  ['registered', 'Registered', 'Registered / Closed', 'Transaction successfully registered.'],
  ['lost', 'Lost', 'Lost', 'Lead closed or no longer active.'],
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase()
}

function leadIdOf(row = {}) {
  return normalizeText(row?.leadId || row?.lead_id || row?.id)
}

export function isAgencyLeadArchived(row = {}) {
  const lifecycle = [row?.lifecycleState, row?.archiveStatus, row?.status, row?.stage]
    .map(normalizeKey)
  return Boolean(row?.archivedAt || row?.archived_at || row?.isArchived || row?.is_archived) ||
    lifecycle.some((value) => ['archived', 'deleted', 'closed_lost'].includes(value))
}

export function getAgencyLeadCategory(row = {}) {
  return inferLeadCategoryFromRecord(row, 'buyer')
}

export function getAgencyLeadColumns(category = 'buyer') {
  if (category === 'seller') {
    return SELLER_STAGES.map(([id, label, stageValue, description]) => ({ id, label, stageValue, description }))
  }
  return BUYER_LEAD_LIST_STAGES.map(([key, label, description]) => ({
    id: key,
    label,
    stageValue: label,
    description: description || BUYER_STAGE_META[key] || '',
  }))
}

export function getAgencyLeadStageOptions(category = 'buyer') {
  return getAgencyLeadColumns(category).map(({ label, stageValue }) => ({ label, value: stageValue }))
}

function buildContactById(contacts = []) {
  return new Map(contacts.map((contact) => [normalizeText(contact?.contactId || contact?.contact_id), contact]))
}

function groupRowsByLeadId(rows = []) {
  const grouped = new Map()
  for (const row of rows) {
    const leadId = leadIdOf(row)
    if (!leadId) continue
    if (!grouped.has(leadId)) grouped.set(leadId, [])
    grouped.get(leadId).push(row)
  }
  return grouped
}

function formatRelativeTime(value = '') {
  const timestamp = new Date(value || 0).getTime()
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'No activity'
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getLeadName(lead = {}, contact = {}) {
  return normalizeText(
    lead?.name ||
    [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') ||
    [lead?.sellerName, lead?.sellerSurname].filter(Boolean).join(' '),
  ) || 'Unnamed lead'
}

function getPropertyPresentation(lead = {}) {
  const title = normalizeText(
    lead?.sellerPropertyAddress ||
    lead?.enquiredPropertyTitle ||
    lead?.enquiredPropertyAddress ||
    lead?.formattedAddress ||
    lead?.streetAddress ||
    lead?.propertyInterest ||
    lead?.areaInterest,
  )
  const subtitle = [lead?.suburb, lead?.city, lead?.province].map(normalizeText).filter(Boolean).join(', ')
  return {
    title: title || 'No property address yet',
    subtitle: subtitle || 'Property details pending',
  }
}

function getNextOpenTask(tasks = []) {
  return tasks
    .filter((task) => normalizeKey(task?.status) !== 'completed')
    .sort((left, right) => new Date(left?.dueDate || left?.createdAt || 0) - new Date(right?.dueDate || right?.createdAt || 0))[0]
}

export function buildAgencyLeadListModel({ leads = [], contacts = [], activities = [], tasks = [], category = 'buyer', filters = {} } = {}) {
  const resolvedFilters = { ...DEFAULT_AGENCY_LEAD_FILTERS, ...filters }
  const contactById = buildContactById(contacts)
  const activitiesByLead = groupRowsByLeadId(activities)
  const tasksByLead = groupRowsByLeadId(tasks)
  const categoryCounts = { buyer: 0, seller: 0, archived: 0 }

  for (const lead of leads) {
    if (isAgencyLeadArchived(lead)) categoryCounts.archived += 1
    else categoryCounts[getAgencyLeadCategory(lead)] = (categoryCounts[getAgencyLeadCategory(lead)] || 0) + 1
  }

  const filtered = leads.filter((lead) => {
    const archived = isAgencyLeadArchived(lead)
    const leadCategory = getAgencyLeadCategory(lead)
    if (category === 'archived' ? !archived : archived || leadCategory !== category) return false
    const contact = contactById.get(normalizeText(lead?.contactId)) || {}
    const presentation = resolveAgencyLeadListLifecycle(lead)
    const openTask = getNextOpenTask(tasksByLead.get(leadIdOf(lead)) || [])
    const searchValue = [
      getLeadName(lead, contact), contact?.phone, contact?.email, lead?.phone, lead?.email,
      lead?.leadSource, lead?.assignedAgentName, lead?.assignedAgentEmail,
      lead?.sellerPropertyAddress, lead?.enquiredPropertyTitle, lead?.enquiredPropertyAddress,
      lead?.propertyInterest, lead?.areaInterest, lead?.suburb, lead?.city,
      openTask?.title, openTask?.description,
    ].join(' ').toLowerCase()
    const searchMatches = !resolvedFilters.search || searchValue.includes(normalizeKey(resolvedFilters.search))
    const sourceMatches = resolvedFilters.source === 'all' || normalizeKey(lead?.leadSource) === normalizeKey(resolvedFilters.source)
    const stageMatches = resolvedFilters.stage === 'all' || [presentation.label, lead?.stage, lead?.status]
      .some((value) => normalizeKey(value) === normalizeKey(resolvedFilters.stage))
    const agentMatches = resolvedFilters.agent === 'all' || [lead?.assignedAgentId, lead?.assignedUserId, lead?.assignedAgentEmail]
      .some((value) => normalizeKey(value) === normalizeKey(resolvedFilters.agent))
    return searchMatches && sourceMatches && stageMatches && agentMatches
  })

  filtered.sort((left, right) => {
    if (resolvedFilters.sort === 'stage') {
      return resolveAgencyLeadListLifecycle(left).label.localeCompare(resolveAgencyLeadListLifecycle(right).label)
    }
    if (resolvedFilters.sort === 'next_follow_up') {
      const leftTask = getNextOpenTask(tasksByLead.get(leadIdOf(left)) || [])
      const rightTask = getNextOpenTask(tasksByLead.get(leadIdOf(right)) || [])
      return new Date(leftTask?.dueDate || 8640000000000000) - new Date(rightTask?.dueDate || 8640000000000000)
    }
    return new Date(right?.updatedAt || right?.createdAt || 0) - new Date(left?.updatedAt || left?.createdAt || 0)
  })

  const rows = filtered.map((lead) => {
    const id = leadIdOf(lead)
    const contact = contactById.get(normalizeText(lead?.contactId)) || {}
    const leadActivities = activitiesByLead.get(id) || []
    const leadTasks = tasksByLead.get(id) || []
    const latestActivity = [...leadActivities]
      .sort((left, right) => new Date(right?.activityDate || right?.createdAt || 0) - new Date(left?.activityDate || left?.createdAt || 0))[0]
    const nextTask = getNextOpenTask(leadTasks)
    const lifecycle = resolveAgencyLeadListLifecycle(lead)
    const property = getPropertyPresentation(lead)
    return {
      id,
      name: getLeadName(lead, contact),
      phone: normalizeText(contact?.phone || lead?.phone || lead?.sellerPhone),
      email: normalizeText(contact?.email || lead?.email || lead?.sellerEmail),
      source: normalizeText(lead?.leadSource) || 'Unknown source',
      propertyTitle: property.title,
      propertySubtitle: property.subtitle,
      stage: lifecycle.label,
      columnId: lifecycle.columnId,
      assignedAgent: normalizeText(lead?.assignedAgentName || lead?.assignedAgentEmail) || 'Unassigned',
      lastActivity: formatRelativeTime(latestActivity?.activityDate || latestActivity?.createdAt || lead?.updatedAt || lead?.createdAt),
      nextStep: normalizeText(nextTask?.title || nextTask?.description) || 'No follow-up scheduled',
      raw: lead,
    }
  })

  const columns = getAgencyLeadColumns(category).map((column) => ({ ...column, cards: [] }))
  const columnById = new Map(columns.map((column) => [column.id, column]))
  for (const row of rows) (columnById.get(row.columnId) || columns[0])?.cards.push(row)

  return { rows, columns, categoryCounts }
}

function isSameDay(value, target = new Date()) {
  const date = new Date(value || 0)
  return Number.isFinite(date.getTime()) && date.toDateString() === target.toDateString()
}

export function buildAgencyLeadListSummary({ leads = [], tasks = [] } = {}) {
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const openTasks = tasks.filter((task) => normalizeKey(task?.status) !== 'completed')
  const overdueTasks = openTasks.filter((task) => new Date(task?.dueDate || 0).getTime() < now.getTime())
  const activeLeads = leads.filter((lead) => !isAgencyLeadArchived(lead))
  const converted = leads.filter((lead) => {
    const stage = normalizeKey(`${lead?.stage} ${lead?.status}`)
    return new Date(lead?.updatedAt || lead?.createdAt || 0) >= monthStart && (stage.includes('converted') || stage.includes('listing active') || stage.includes('deal created'))
  })
  const sellerLeads = activeLeads.filter((lead) => getAgencyLeadCategory(lead) === 'seller')
  const showDayLeads = activeLeads.filter((lead) => normalizeKey(lead?.leadSource).replace(/[^a-z0-9]/g, '').includes('showday'))

  return {
    metrics: {
      newLeads: activeLeads.filter((lead) => isSameDay(lead?.createdAt)).length,
      newThisWeek: activeLeads.filter((lead) => new Date(lead?.createdAt || 0) >= weekStart).length,
      needAttention: new Set(overdueTasks.map(leadIdOf)).size,
      overdue: overdueTasks.length,
      followUpsToday: openTasks.filter((task) => isSameDay(task?.dueDate)).length,
      overdueTasks: overdueTasks.length,
      convertedMtd: converted.length,
      active: activeLeads.length,
    },
    operationalSummary: {
      total: activeLeads.length,
      needAttention: new Set(overdueTasks.map(leadIdOf)).size,
      overdue: overdueTasks.length,
    },
    sellerJourneyMetrics: {
      sellerLeads: sellerLeads.length,
      mandatesSigned: sellerLeads.filter((lead) => normalizeKey(`${lead?.stage} ${lead?.status}`).includes('mandate signed')).length,
      listingsLive: sellerLeads.filter((lead) => normalizeKey(`${lead?.stage} ${lead?.status}`).includes('listing live') || normalizeKey(`${lead?.stage} ${lead?.status}`).includes('listing active')).length,
    },
    showDaySummary: {
      captured: showDayLeads.length,
      viewed: showDayLeads.filter((lead) => normalizeKey(`${lead?.stage} ${lead?.status}`).includes('view')).length,
      due: openTasks.filter((task) => showDayLeads.some((lead) => leadIdOf(lead) === leadIdOf(task)) && new Date(task?.dueDate || 0) <= now).length,
      offerReady: showDayLeads.filter((lead) => normalizeKey(`${lead?.stage} ${lead?.status}`).includes('offer')).length,
      queue: [],
    },
  }
}
