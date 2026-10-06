import { getAgentDemoTransactionRowsFromStorage } from '../lib/agentDemoTransactionStorage.js'
import { resolveMobileRoleCategory } from '../config/mobileShell'
import { fetchDashboardOverview, fetchTransactionsByParticipantSummary, fetchTransactionsListSummary } from '../domains/reporting/api.js'
import {
  getDashboardPipelineValue,
  getScopedDashboardTransactions,
} from '../lib/dashboardTransactionIntegrity'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { deriveResidentialDashboardMetrics } from './residentialDashboardService'
import { getAgentPrivateListings } from './privateListingService'
import { buildMobileToday } from './mobileTodayModel.js'
import { getAppointmentDashboardData } from './appointmentDashboardService.js'
import { AGENCY_CRM_UPDATED_EVENT } from '../lib/agencyCrmUpdateBus.js'
import { sastDayStart } from '../core/appointments/attorneyCalendarModel.js'

const DEFAULT_EMPTY = Object.freeze([])
const MOBILE_DASHBOARD_CACHE_TTL_MS = 30_000
const MOBILE_DASHBOARD_PREVIEW_TTL_MS = 5 * 60_000
const dashboardCache = new Map()
const pendingDashboards = new Map()
export const MOBILE_DASHBOARD_UPDATED_EVENTS = [AGENCY_CRM_UPDATED_EVENT, 'itg:transaction-updated', 'itg:transaction-created']

function dashboardCacheKey({ workspace = {}, organisation = null } = {}) {
  const userId = normalizeText(workspace.profile?.id || workspace.profile?.userId)
  const organisationId = getOrganisationId(workspace, organisation)
  if (!userId || !organisationId) return ''
  return JSON.stringify([
    userId, workspace.profile?.email || '', organisationId,
    resolveMobileRoleCategory(workspace), workspace.role || workspace.baseRole || '',
    workspace.workspaceRole || '', workspace.organisationMembershipRole || '', workspace.currentMembership?.id || '',
    workspace.currentWorkspace?.id || '', workspace.workspace?.id || '', workspace.workspaceType || '',
    sastDayStart(new Date()).getTime(),
  ])
}

function readDashboardCache(options, { allowStale = false } = {}) {
  const key = dashboardCacheKey(options)
  const entry = dashboardCache.get(key)
  if (!entry) return null
  if (entry.previewExpiresAt <= Date.now()) {
    dashboardCache.delete(key)
    return null
  }
  if (!allowStale && entry.expiresAt <= Date.now()) return null
  return entry
}

export function getCachedMobileDashboardSnapshot({ allowStale = false, ...options } = {}) {
  return readDashboardCache(options, { allowStale })?.snapshot || null
}

export function clearMobileDashboardCache() {
  dashboardCache.clear()
  // Requests started before an update must not repopulate the cleared cache.
  pendingDashboards.clear()
}

if (typeof window !== 'undefined') {
  const events = [...MOBILE_DASHBOARD_UPDATED_EVENTS, 'bridge:workspace-scoped-cache-cleared']
  events.forEach((event) => window.addEventListener(event, clearMobileDashboardCache))
  if (import.meta.hot) import.meta.hot.dispose(() => {
    events.forEach((event) => window.removeEventListener(event, clearMobileDashboardCache))
    clearMobileDashboardCache()
  })
}

function getDisplayName(workspace = {}) {
  const profile = workspace.profile || {}
  return profile.firstName || String(profile.fullName || '').split(' ').filter(Boolean)[0] || 'there'
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}

function normalizeText(value = '', fallback = '') {
  const text = String(value || '').trim()
  return text || fallback
}

function formatCurrencyShort(value = 0) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R0'
  if (amount >= 1000000) return `R${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}m`
  if (amount >= 1000) return `R${Math.round(amount / 1000)}k`
  return `R${Math.round(amount)}`
}

function getDaysSince(value = null) {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 0
  return Math.max(Math.floor((Date.now() - timestamp) / 86400000), 0)
}

function getOrganisationId(workspace = {}, organisation = null) {
  return normalizeText(
    organisation?.id ||
      organisation?.organisationId ||
      organisation?.organisation_id ||
      organisation?.workspaceId ||
      workspace.currentWorkspace?.organisationId ||
      workspace.currentWorkspace?.organisation_id ||
      workspace.currentWorkspace?.id ||
      workspace.workspace?.id,
  )
}

function getWorkspaceDevelopmentId(workspace = {}) {
  const id = normalizeText(workspace.workspace?.id)
  if (!id || id === 'all') return null
  return id
}

function getTransactionFromRow(row = {}) {
  return row?.transaction && typeof row.transaction === 'object' ? row.transaction : row
}

function getRowUpdatedAt(row = {}) {
  const transaction = getTransactionFromRow(row)
  return transaction.updated_at || transaction.last_meaningful_activity_at || row.updated_at || row.created_at || null
}

function getRowAddress(row = {}, fallback = 'Transaction') {
  const transaction = getTransactionFromRow(row)
  const unit = row.unit || {}
  const development = row.development || {}
  const unitNumber = normalizeText(unit.unit_number || unit.unitNumber)
  const developmentName = normalizeText(development.name || row.developmentName)
  return normalizeText(
    transaction.property_address_line_1 ||
      transaction.propertyAddress ||
      transaction.address ||
      row.address ||
      row.title ||
      unit.address ||
      (developmentName && unitNumber ? `${developmentName} · Unit ${unitNumber}` : '') ||
      developmentName,
    fallback,
  )
}

function getRowBuyerName(row = {}) {
  const transaction = getTransactionFromRow(row)
  const buyer = row.buyer || transaction.buyer || {}
  return normalizeText(
    buyer.fullName ||
      buyer.name ||
      transaction.buyer_name ||
      transaction.client_name ||
      row.clientName,
    'Client pending',
  )
}

function getRowStage(row = {}) {
  const transaction = getTransactionFromRow(row)
  return normalizeText(
    transaction.current_main_stage ||
      transaction.current_sub_stage_summary ||
      row.mainStage ||
      transaction.stage ||
      row.stage,
    'In progress',
  )
}

function getRowValue(row = {}) {
  const transaction = getTransactionFromRow(row)
  return Number(
    transaction.purchase_price ||
      transaction.sales_price ||
      transaction.sale_price ||
      row.valueRaw ||
      row.value ||
      row.unit?.price ||
      0,
  )
}

function getListingValue(row = {}) {
  const amount = Number(
    row.askingPrice ||
      row.asking_price ||
      row.estimatedValue ||
      row.estimated_value ||
      row.price ||
      row.value ||
      0,
  )
  return Number.isFinite(amount) ? amount : 0
}

function getListingStatusText(row = {}) {
  return normalizeText([
    row.listingStatus,
    row.listing_status,
    row.status,
    row.mandateStatus,
    row.mandate_status,
    row.visibility,
    row.listing_visibility,
  ].join(' ')).toLowerCase()
}

function isActiveListing(row = {}) {
  const text = getListingStatusText(row)
  return !['archived', 'deleted', 'withdrawn', 'cancelled', 'canceled', 'expired'].some((term) => text.includes(term))
}

export function buildResidentialActiveWork(rows = [], { includeUnitIdentity = false } = {}) {
  return rows.map((row, index) => {
    const transaction = getTransactionFromRow(row)
    const transactionId = normalizeText(transaction.id || row.id)
    const updatedAt = getRowUpdatedAt(row)
    const value = getRowValue(row)
    const stage = getRowStage(row)
    const unit = row.unit || transaction.property_unit || transaction.propertyUnit || {}
    const unitNumber = normalizeText(unit.unit_number || unit.unitNumber || unit.unit_label || unit.unitLabel || transaction.unit_number || transaction.unitNumber)
    const tenure = [
      transaction.property_title_type, transaction.propertyTitleType,
      transaction.property_tenure, transaction.propertyTenure, transaction.property_type,
      unit.property_title_type, unit.propertyTitleType, unit.property_type,
    ].map((value) => normalizeText(value).toLowerCase().replaceAll('_', ' ')).join(' ')
    const preferUnitTitle = includeUnitIdentity || tenure.includes('sectional') || tenure.includes('body corporate')
    const showUnitIdentity = preferUnitTitle || Boolean(unit.id || transaction.unit_id)
    const unitLabel = unitNumber && showUnitIdentity ? `${/^unit\b/i.test(unitNumber) ? '' : 'Unit '}${unitNumber}` : ''
    const address = getRowAddress(row, `Transaction ${index + 1}`)
    const propertyTitle = preferUnitTitle && unitLabel ? normalizeText(row.development?.name || transaction.property_development?.name || transaction.propertyDevelopment?.name, address) : address
    const unitTitle = preferUnitTitle && unitLabel ? `${propertyTitle} · ${unitLabel}` : ''
    return {
      id: transactionId || `residential-work-${index}`,
      title: unitTitle || address,
      propertyTitle,
      unitLabel,
      eyebrow: getRowBuyerName(row),
      stage,
      status: normalizeText(transaction.next_action || transaction.status || transaction.lifecycle_state, stage),
      nextAction: normalizeText(transaction.next_action),
      progress: Math.min(92, Math.max(18, 24 + index * 13)),
      meta: updatedAt ? `${getDaysSince(updatedAt)} days in stage` : 'Recently updated',
      value: value > 0 ? formatCurrencyShort(value) : '',
      valueRaw: value,
      developmentId: normalizeText(row.development?.id || row.unit?.development_id || transaction.development_id),
      imageUrl: normalizeText(
        transaction.property_image_url || transaction.listing_image_url || transaction.primary_image_url ||
        transaction.cover_image_url || transaction.hero_image_url || transaction.image_url || transaction.thumbnail_url ||
        row.unit?.image_url || row.unit?.cover_image_url || row.unit?.primary_image_url || row.unit?.thumbnail_url ||
        row.unit?.imageUrl || row.unit?.propertyImage || row.development?.cover_image_url,
      ),
      location: [...new Set([transaction.suburb, transaction.city].map((part) => normalizeText(part)).filter(Boolean))].join(', ') || (unitTitle ? normalizeText(transaction.property_address_line_1 || row.development?.location) : ''),
      propertyType: normalizeText(transaction.property_type).replaceAll('_', ' '),
      reference: normalizeText(transaction.transaction_reference || transaction.matter_number),
      to: transactionId ? `/mobile/transaction/${transactionId}` : '/mobile/transactions',
    }
  })
}

function buildResidentialRecentActivity(rows = []) {
  return rows.slice(0, 10).map((row, index) => {
    const transaction = getTransactionFromRow(row)
    const updatedAt = getRowUpdatedAt(row)
    return {
      id: transaction.id ? `${transaction.id}-activity` : `residential-activity-${index}`,
      title: normalizeText(transaction.next_action || transaction.current_sub_stage_summary || getRowStage(row), 'Transaction updated'),
      body: getRowAddress(row, 'Workspace item updated'),
      time: updatedAt ? `${getDaysSince(updatedAt)}d ago` : index === 0 ? 'Now' : `${index + 1}h ago`,
    }
  })
}

function buildResidentialSummaryCards({ category, metrics = {}, taskCount = 0 } = {}) {
  const cardsByKey = new Map((metrics.kpis || []).map((item) => [item.key, item]))
  const activeTransactions = cardsByKey.get('active_transactions')
  const activeListings = cardsByKey.get('active_listings')
  const pipelineValue = cardsByKey.get('pipeline_value')
  const commissionForecast = cardsByKey.get('commission_forecast')

  return [
    {
      key: 'active',
      label: activeTransactions?.label || (category === 'principal' ? 'Active Transactions' : 'My Active Transactions'),
      value: activeTransactions?.compactValue || activeTransactions?.value || 0,
      tone: 'green',
    },
    {
      key: 'listings',
      label: activeListings?.label || (category === 'principal' ? 'Active Listings / Mandates' : 'My Active Listings / Mandates'),
      value: activeListings?.compactValue || activeListings?.value || 0,
      tone: 'blue',
    },
    {
      key: 'pipeline',
      label: pipelineValue?.label || 'Pipeline Value',
      value: pipelineValue?.compactValue || pipelineValue?.value || 'R0',
      tone: 'navy',
    },
    {
      key: 'tasks',
      label: 'Tasks Due',
      value: taskCount,
      tone: 'amber',
      supportingValue: commissionForecast?.compactValue || commissionForecast?.value || '',
    },
  ]
}

function toResidentialMetricRow(row = {}) {
  const transaction = getTransactionFromRow(row)
  return {
    ...row,
    id: transaction.id || row.id,
    transactionId: transaction.id || row.id,
    address: getRowAddress(row, ''),
    title: getRowAddress(row, ''),
    stage: getRowStage(row),
    status: transaction.status || transaction.lifecycle_state || row.status || getRowStage(row),
    value: getRowValue(row),
    valueRaw: getRowValue(row),
    sales_price: transaction.sales_price,
    purchase_price: transaction.purchase_price,
    buyerName: getRowBuyerName(row),
    clientName: getRowBuyerName(row),
    developmentName: row.development?.name || '',
    updated_at: getRowUpdatedAt(row),
    current_main_stage: transaction.current_main_stage,
    current_sub_stage_summary: transaction.current_sub_stage_summary,
    next_action: transaction.next_action,
    lifecycle_state: transaction.lifecycle_state,
    operational_state: transaction.operational_state,
    finance_status: transaction.finance_status,
    onboarding_status: transaction.onboarding_status,
  }
}

async function getResidentialRows({ category, workspace = {}, organisationId = '' } = {}) {
  const role = normalizeText(workspace.role || workspace.baseRole)
  const profile = workspace.profile || {}
  if (role === 'agent' || category === 'agent' || category === 'principal') {
    if (category === 'principal') {
      return fetchTransactionsListSummary({
        developmentId: null,
        activeTransactionsOnly: false,
        organisationId,
      })
    }
    if (!profile.id) return []
    return fetchTransactionsByParticipantSummary({
      userId: profile.id,
      roleType: 'agent',
      organisationId,
    })
  }

  const overview = await fetchDashboardOverview({
    developmentId: getWorkspaceDevelopmentId(workspace),
    organisationId,
  })
  return overview.rows || []
}

async function getResidentialListings({ category, workspace = {}, organisationId = '' } = {}) {
  if (category === 'developer') return []
  const profile = workspace.profile || {}
  if (!profile.id && !profile.email) return []
  try {
    const rows = await getAgentPrivateListings(profile.id || '', {
      organisationId,
      includeAllOrganisationListings: category === 'principal',
      assignedAgentEmail: profile.email || '',
    })
    return (Array.isArray(rows) ? rows : []).filter(isActiveListing)
  } catch (error) {
    console.warn('[mobile-dashboard] Unable to load private listings.', error)
    return []
  }
}

export async function getMobileDeveloperTransactionSnapshotAsync({ workspace = {}, organisation = null, transactionId = '' } = {}) {
  if (resolveMobileRoleCategory(workspace) !== 'developer') throw new Error('Select a developer workspace to load this transaction.')
  const organisationId = getOrganisationId(workspace, organisation)
  if (!organisationId) throw new Error('Select a developer workspace to load this transaction.')
  if (!isSupabaseConfigured) throw new Error('Transaction data is unavailable while offline.')
  const overview = readDashboardCache({ workspace, organisation })?.overview || await fetchDashboardOverview({ developmentId: null, organisationId, includeSecondaryData: false })
  const row = (overview.rows || []).find((item) => item.transaction?.id === transactionId)
  if (!row) return null
  const [item] = buildResidentialActiveWork([row], { includeUnitIdentity: true })
  return {
    item,
    financeType: normalizeText(row.transaction.finance_type, 'Not recorded'),
    updatedAt: row.transaction.updated_at || null,
    documentSummary: row.documentSummary || null,
  }
}

export async function getMobileCalendarSnapshotAsync({ workspace = {}, organisation = null, dateRange } = {}) {
  const organisationId = getOrganisationId(workspace, organisation)
  const category = resolveMobileRoleCategory(workspace)
  const profile = workspace.profile || {}
  const includeAll = category === 'principal'
  const userId = profile.id || profile.userId || ''
  const userEmail = profile.email || ''
  if (!organisationId || (!includeAll && !userId && !userEmail)) throw new Error('Select a workspace to load your calendar.')
  if (!isSupabaseConfigured) throw new Error('Calendar data is unavailable while offline.')
  if (!dateRange?.from || !dateRange?.to || !Number.isFinite(Date.parse(dateRange.from)) || !Number.isFinite(Date.parse(dateRange.to)) || Date.parse(dateRange.to) < Date.parse(dateRange.from)) throw new Error('Select a valid calendar week.')
  return getAppointmentDashboardData({
    organisationId, includeAll, userId, userEmail, dateRange,
    module: { developer: 'developer', attorney: 'attorney', bond_originator: 'bond', commercial: 'commercial', principal: 'default' }[category] || 'agent',
  })
}

export async function getMobileDashboardSnapshotAsync({ workspace = {}, organisation = null, force = false } = {}) {
  const options = { workspace, organisation }
  const category = resolveMobileRoleCategory(workspace)
  if (!isSupabaseConfigured || !['agent', 'principal', 'developer', 'default'].includes(category)) {
    return getMobileDashboardSnapshot({ workspace })
  }
  const key = dashboardCacheKey(options)
  if (force) dashboardCache.delete(key)
  const cached = readDashboardCache(options)
  if (cached) return cached.snapshot
  if (key && pendingDashboards.has(key)) return pendingDashboards.get(key).promise

  const request = {}
  request.promise = loadMobileDashboardSnapshot(options)
    .then((result) => {
      if (key && pendingDashboards.get(key) === request) {
        dashboardCache.set(key, {
          ...result,
          expiresAt: Date.now() + MOBILE_DASHBOARD_CACHE_TTL_MS,
          previewExpiresAt: Date.now() + MOBILE_DASHBOARD_PREVIEW_TTL_MS,
        })
        if (dashboardCache.size > 20) dashboardCache.delete(dashboardCache.keys().next().value)
      }
      return result.snapshot
    })
    .finally(() => {
      if (key && pendingDashboards.get(key) === request) pendingDashboards.delete(key)
    })
  if (key) pendingDashboards.set(key, request)
  return request.promise
}

async function loadMobileDashboardSnapshot({ workspace, organisation }) {
  const category = resolveMobileRoleCategory(workspace)
  const copy = ROLE_COPY[category] || ROLE_COPY.agent
  const organisationId = getOrganisationId(workspace, organisation)
  if (category === 'developer' && !organisationId) throw new Error('Select a developer workspace to load your portfolio.')
  const profile = workspace.profile || {}
  const includeAll = category === 'principal'
  const todaySources = Promise.allSettled([
    import('../lib/agencyCrmRepository.js').then(({ listAgencyCrmLeadContacts }) => listAgencyCrmLeadContacts(organisationId, { includeLocalFallback: false })),
    getAppointmentDashboardData({
      organisationId, module: category === 'developer' ? 'developer' : includeAll ? 'default' : 'agent', includeAll,
      userId: profile.id || profile.userId || '', userEmail: profile.email || '',
    }),
  ])
  const [workData, listingRows, [crmResult, appointmentResult]] = await Promise.all([
    category === 'developer'
      ? fetchDashboardOverview({ developmentId: null, organisationId, includeSecondaryData: false })
      : getResidentialRows({ category, workspace, organisationId }),
    getResidentialListings({ category, workspace, organisationId }),
    todaySources,
  ])
  const rawRows = Array.isArray(workData) ? workData : workData.rows || []
  // The developer reader authorises connected developments, including deals
  // owned by a linked selling agency. Only actual transactions enter the list.
  const transactionRows = category === 'developer' ? rawRows.filter((row) => row.transaction?.id) : rawRows
  const transactionScope = category === 'developer' ? {} : { organisationId }
  const scopedRows = getScopedDashboardTransactions(transactionRows, { ...transactionScope, activeOnly: false })
  const activeRows = getScopedDashboardTransactions(scopedRows, transactionScope)
  const activeWork = buildResidentialActiveWork(activeRows, { includeUnitIdentity: category === 'developer' })
  const units = category === 'developer' ? rawRows.map((row) => ({
    id: row.unit?.id,
    developmentId: normalizeText(row.development?.id || row.unit?.development_id),
    title: getRowAddress(row, 'Unit'),
    unitLabel: normalizeText(row.unit?.unit_number || row.unit?.unitNumber) ? `${/^unit\b/i.test(normalizeText(row.unit?.unit_number || row.unit?.unitNumber)) ? '' : 'Unit '}${normalizeText(row.unit?.unit_number || row.unit?.unitNumber)}` : '',
    propertyTitle: normalizeText(row.development?.name),
    value: Number(row.unit?.price || 0),
    available: !row.transaction?.id || ['available', 'avail'].includes(normalizeText(row.stage || row.transaction?.current_main_stage).toLowerCase()),
  })) : []
  const developments = category === 'developer' ? (workData.developmentSummaries || []).map((item) => {
    const developmentUnits = units.filter((unit) => unit.developmentId === item.id)
    return {
      id: item.id, title: item.name, location: item.location || '', imageUrl: item.coverImageUrl || '',
      status: normalizeText(item.phase, 'Active').replaceAll('_', ' '),
      totalUnits: item.totalUnits || developmentUnits.length,
      availableUnits: developmentUnits.filter((unit) => unit.available).length,
      activeDeals: activeWork.filter((deal) => deal.developmentId === item.id).length,
      registeredUnits: Number(item.unitsRegistered || 0),
      to: `/mobile/development/${encodeURIComponent(item.id)}`,
    }
  }) : []
  const crm = crmResult.status === 'fulfilled' ? crmResult.value : {}
  const today = buildMobileToday({
    ...crm, profile, category, deals: activeWork,
    appointments: appointmentResult.status === 'fulfilled' ? appointmentResult.value.appointments : [],
    availability: { followUps: crmResult.status === 'fulfilled' && crm.tasksAvailable !== false, appointments: appointmentResult.status === 'fulfilled' },
  })
  const activeMetricRows = activeRows.map(toResidentialMetricRow)
  const listingValue = listingRows.reduce((sum, row) => sum + getListingValue(row), 0)
  const transactionPipelineValue = category === 'developer' ? activeRows.reduce((sum, row) => sum + getRowValue(row), 0) : getDashboardPipelineValue(activeRows)
  const pipelineValue = transactionPipelineValue + listingValue
  const allListings = listingRows.map((row, index) => ({
    id: row.id || `listing-${index}`,
    title: normalizeText(row.title || row.propertyAddress || row.addressLine1 || row.address_line_1, 'Property listing'),
    address: normalizeText(row.propertyAddress || row.addressLine1 || row.address_line_1 || row.address),
    status: normalizeText(row.listingStatus || row.listing_status || row.status, 'Active mandate').replaceAll('_', ' '),
    value: getListingValue(row) > 0 ? formatCurrencyShort(getListingValue(row)) : '',
    valueRaw: getListingValue(row),
  }))
  const estimatedCommission = Math.round(pipelineValue * 0.035)
  const metrics = deriveResidentialDashboardMetrics({
    scope: category === 'principal' ? 'principal' : 'agent',
    mode: 'sales',
    branchId: workspace.workspace?.id || '',
    currentUserId: workspace.profile?.id || workspace.profile?.userId || '',
    source: {
      kpis: {
        activeTransactions: activeRows.length,
        activeListings: listingRows.length,
        mandates: listingRows.length,
        pipelineValue,
        expectedCommission: estimatedCommission,
        trends: {
          activeTransactions: null,
          activeListings: null,
          pipelineValue: null,
          expectedCommission: null,
        },
      },
      activeTransactions: activeMetricRows,
      recentTransactions: activeMetricRows,
      transactionFlow: activeMetricRows,
      residentialTransactionFlow: activeMetricRows,
      listingCount: listingRows.length,
      activeListings: listingRows.length,
      commissionForecastValue: estimatedCommission,
      revenue: { forecast: { expectedCommission: estimatedCommission } },
      pipeline: {
        totalValue: pipelineValue,
        mandateInsights: { active_mandates: listingRows.length },
      },
    },
  })

  const snapshot = {
    category,
    displayName: getDisplayName(workspace),
    greeting: getGreeting(),
    generatedAt: new Date().toISOString(),
    summaryCards: category === 'developer' ? [
      { key: 'active', label: 'Active Transactions', value: activeRows.length, tone: 'green' },
      { key: 'developments', label: 'Developments', value: developments.length, tone: 'blue' },
      { key: 'pipeline', label: 'Pipeline Value', value: formatCurrencyShort(pipelineValue), tone: 'navy' },
      { key: 'available', label: 'Units Available', value: units.filter((unit) => unit.available).length, tone: 'green' },
    ] : buildResidentialSummaryCards({ category, metrics, taskCount: today.counts.followUps ?? '—' }),
    activeWork: activeWork.slice(0, 5),
    transactions: activeWork,
    developments,
    units,
    today,
    listings: allListings.slice(0, 5),
    allListings,
    tasks: today.items.followUps,
    recentActivity: buildResidentialRecentActivity(activeRows),
    quickActions: copy.quickActions,
    insight: pipelineValue > 0
      ? { label: 'Pipeline Snapshot', value: `${formatCurrencyShort(pipelineValue)} Pipeline`, body: `${activeRows.length} active transaction${activeRows.length === 1 ? '' : 's'} and ${listingRows.length} active listing${listingRows.length === 1 ? '' : 's'}.` }
      : null,
    copy,
    notifications: { unreadCount: 0 },
    metrics,
  }
  return { overview: category === 'developer' ? workData : null, snapshot }
}

function getAgentRows() {
  return getAgentDemoTransactionRowsFromStorage().filter((row) => {
    const stage = String(row?.stage || row?.transaction?.stage || '').toLowerCase()
    return !stage.includes('registered') && !row?.transaction?.registered_at
  })
}

function buildAgentActiveWork(rows = []) {
  return rows.slice(0, 5).map((row, index) => {
    const transaction = row.transaction || row
    const unit = row.unit || {}
    const buyer = row.buyer || transaction.buyer || {}
    const address = normalizeText(
      transaction.property_address_line_1 ||
        transaction.propertyAddress ||
        unit.address ||
        unit.name ||
        row.property ||
        row.address,
      `Transaction ${index + 1}`,
    )
    const stage = normalizeText(transaction.current_main_stage || transaction.stage || row.stage, 'In progress')
    const updatedAt = transaction.updated_at || transaction.last_meaningful_activity_at || row.updated_at || row.created_at
    const price = Number(transaction.sales_price || transaction.purchase_price || unit.price || 0)
    return {
      id: transaction.id || row.id || `agent-work-${index}`,
      title: address,
      eyebrow: normalizeText(buyer.fullName || buyer.name || transaction.buyer_name, 'Buyer pending'),
      stage,
      status: normalizeText(transaction.next_action || transaction.status, 'Moving'),
      nextAction: normalizeText(transaction.next_action),
      progress: Math.min(90, Math.max(18, 20 + index * 14)),
      meta: `${getDaysSince(updatedAt)} days in stage`,
      value: price ? formatCurrencyShort(price) : '',
      to: transaction.id ? `/mobile/transaction/${transaction.id}` : '/mobile/transactions',
    }
  })
}

function buildRecentActivity(rows = [], label = 'Workspace update') {
  return rows.slice(0, 10).map((row, index) => {
    const transaction = row.transaction || row
    return {
      id: transaction.id ? `${transaction.id}-activity` : `activity-${index}`,
      title: normalizeText(transaction.next_action || transaction.current_sub_stage_summary || transaction.stage, label),
      body: normalizeText(transaction.property_address_line_1 || row.property || row.address, 'Workspace item updated'),
      time: index === 0 ? 'Now' : `${index + 1}h ago`,
    }
  })
}

const ROLE_COPY = {
  developer: {
    workloadLabel: 'Active Transactions', workTitle: 'Your development portfolio',
    workEmptyTitle: 'No active transactions yet.', workEmptyBody: 'Development transactions will appear here as sales move forward.',
    taskEmptyTitle: 'No follow-ups due today.', taskEmptyBody: 'Your recorded follow-ups will appear here.',
    activityEmptyTitle: 'No recent activity yet.', activityEmptyBody: 'Development updates will appear here as work moves.',
    quickActions: [
      { key: 'open_developments', label: 'Developments', to: '/mobile/developments' },
      { key: 'open_transactions', label: 'Transactions', to: '/mobile/transactions' },
      { key: 'open_leads', label: 'Leads', to: '/mobile/developer/leads' },
    ],
  },
  agent: {
    workloadLabel: 'Active Transactions',
    workTitle: 'My Active Work',
    workEmptyTitle: 'No active transactions yet.',
    workEmptyBody: 'Create a lead or open transactions when work starts moving.',
    taskEmptyTitle: 'No tasks due today.',
    taskEmptyBody: 'Time-sensitive transaction work will appear here.',
    activityEmptyTitle: 'No recent activity yet.',
    activityEmptyBody: 'Updates will appear as transactions move.',
    quickActions: [
      { key: 'create_lead', label: 'Create Lead', to: '/mobile/leads' },
      { key: 'create_listing', label: 'Create Listing', to: '/mobile/listings' },
      { key: 'open_transactions', label: 'Open Transactions', to: '/mobile/transactions' },
      { key: 'upload_document', label: 'Upload Document', to: '/mobile/documents' },
      { key: 'send_onboarding', label: 'Send Onboarding', to: '/mobile/leads' },
    ],
  },
  principal: {
    workloadLabel: 'Active Transactions',
    workTitle: 'Team Snapshot',
    workEmptyTitle: 'No active agency work yet.',
    workEmptyBody: 'New leads, mandates, and transactions will surface here as the team moves.',
    taskEmptyTitle: 'No management tasks due today.',
    taskEmptyBody: 'Agency follow-ups will appear here.',
    activityEmptyTitle: 'No agency activity yet.',
    activityEmptyBody: 'Recent team updates will appear here.',
    quickActions: [
      { key: 'add_lead', label: 'Add Lead', to: '/mobile/leads?create=lead' },
      { key: 'scan_mandate', label: 'Scan Mandate', to: '/mobile/documents?create=document' },
      { key: 'create_transaction', label: 'Create Transaction', to: '/mobile/transactions?create=transaction' },
      { key: 'follow_up', label: 'Follow Up', to: '/mobile/tasks?create=follow-up' },
    ],
  },
  attorney: {
    workloadLabel: 'Active Matters',
    workTitle: 'Active Matters',
    workEmptyTitle: 'No active matters yet.',
    workEmptyBody: 'Assigned matters will appear here once available.',
    taskEmptyTitle: 'No legal tasks due today.',
    taskEmptyBody: 'Document and milestone work will appear here.',
    activityEmptyTitle: 'No matter activity yet.',
    activityEmptyBody: 'Matter updates will appear as work moves.',
    quickActions: [
      { key: 'upload_document', label: 'Upload Document', to: '/mobile/documents' },
      { key: 'update_milestone', label: 'Update Milestone', to: '/mobile/matters' },
      { key: 'open_matters', label: 'Open Matters', to: '/mobile/matters' },
      { key: 'view_tasks', label: 'View Tasks', to: '/mobile/home' },
    ],
  },
  bond_originator: {
    workloadLabel: 'Active Applications',
    workTitle: 'Active Applications',
    workEmptyTitle: 'No active applications yet.',
    workEmptyBody: 'Bond applications will appear here once created.',
    taskEmptyTitle: 'No application tasks due today.',
    taskEmptyBody: 'Bank and document follow-ups will appear here.',
    activityEmptyTitle: 'No application activity yet.',
    activityEmptyBody: 'Bank responses and uploads will appear here.',
    quickActions: [
      { key: 'create_application', label: 'Create Application', to: '/mobile/applications' },
      { key: 'upload_document', label: 'Upload Document', to: '/mobile/documents' },
      { key: 'view_applications', label: 'View Applications', to: '/mobile/applications' },
      { key: 'view_tasks', label: 'View Tasks', to: '/mobile/home' },
    ],
  },
  commercial: {
    workloadLabel: 'Active Deals',
    workTitle: 'Active Deals',
    workEmptyTitle: 'No active deals yet.',
    workEmptyBody: 'Sales and leasing deals will appear here once active.',
    taskEmptyTitle: 'No commercial tasks due today.',
    taskEmptyBody: 'Requirements and deal follow-ups will appear here.',
    activityEmptyTitle: 'No commercial activity yet.',
    activityEmptyBody: 'Pipeline, listing, and deal updates will appear here.',
    quickActions: [
      { key: 'create_lead', label: 'Create Lead', to: '/mobile/pipeline' },
      { key: 'create_deal', label: 'Create Deal', to: '/mobile/deals' },
      { key: 'create_listing', label: 'Create Listing', to: '/mobile/listings' },
      { key: 'open_pipeline', label: 'Open Pipeline', to: '/mobile/pipeline' },
    ],
  },
}

function buildSummaryCards({ category, activeCount, pipelineValue }) {
  if (category === 'principal') {
    return [
      { key: 'active', label: 'Active Transactions', value: activeCount, tone: 'green' },
      { key: 'listings', label: 'Active Listings', value: 0, tone: 'blue' },
      { key: 'pipeline', label: 'Pipeline Value', value: formatCurrencyShort(pipelineValue), tone: 'navy' },
      { key: 'tasks', label: 'Tasks Due', value: 0, tone: 'amber' },
    ]
  }
  if (category === 'bond_originator') {
    return [
      { key: 'active', label: 'Active Applications', value: activeCount, tone: 'green' },
      { key: 'bank_responses', label: 'Bank Responses Pending', value: 0, tone: 'blue' },
      { key: 'tasks', label: 'Tasks Due', value: 0, tone: 'amber' },
      { key: 'notifications', label: 'Notifications', value: 0, tone: 'navy' },
    ]
  }
  if (category === 'commercial') {
    return [
      { key: 'active', label: 'Active Deals', value: activeCount, tone: 'green' },
      { key: 'vacancies', label: 'Vacancies', value: 0, tone: 'blue' },
      { key: 'requirements', label: 'Requirements', value: 0, tone: 'navy' },
      { key: 'tasks', label: 'Tasks Due', value: 0, tone: 'amber' },
    ]
  }
  const label = ROLE_COPY[category]?.workloadLabel || ROLE_COPY.agent.workloadLabel
  return [
    { key: 'active', label, value: activeCount, tone: 'green' },
    { key: 'tasks', label: 'Tasks Due Today', value: 0, tone: 'amber' },
    { key: 'documents', label: category === 'attorney' ? 'Documents Pending' : 'Documents Awaiting Review', value: 0, tone: 'blue' },
    { key: 'notifications', label: 'Unread Notifications', value: 0, tone: 'navy' },
  ]
}

export function getMobileDashboardSnapshot({ workspace = {} } = {}) {
  const category = resolveMobileRoleCategory(workspace)
  const copy = ROLE_COPY[category] || ROLE_COPY.agent
  const agentRows = category === 'agent' || category === 'principal' ? getAgentRows() : DEFAULT_EMPTY
  const activeWork = category === 'agent' ? buildAgentActiveWork(agentRows) : DEFAULT_EMPTY
  const pipelineValue = agentRows.reduce((sum, row) => {
    const transaction = row.transaction || row
    const value = Number(transaction.sales_price || transaction.purchase_price || row.unit?.price || 0)
    return Number.isFinite(value) ? sum + value : sum
  }, 0)

  return {
    category,
    displayName: getDisplayName(workspace),
    greeting: getGreeting(),
    generatedAt: new Date().toISOString(),
    summaryCards: buildSummaryCards({ category, activeCount: activeWork.length, pipelineValue }),
    activeWork,
    today: buildMobileToday({ availability: { appointments: false, followUps: false, deals: false } }),
    tasks: DEFAULT_EMPTY,
    recentActivity: buildRecentActivity(agentRows, `${copy.workloadLabel} updated`),
    quickActions: copy.quickActions,
    insight: category === 'agent' && pipelineValue > 0
      ? { label: 'Commission Pipeline', value: `${formatCurrencyShort(pipelineValue)} Pipeline`, body: 'Estimated transaction value currently moving.' }
      : null,
    copy,
    notifications: { unreadCount: 0 },
  }
}
