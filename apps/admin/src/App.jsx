import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Headphones,
  Home,
  ListChecks,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatAdminLevelLabel, resolveAdminAccess } from './lib/adminAccess'
import {
  ADMIN_NAV_ITEMS,
  getAllowedAdminViews,
  pathForView,
  resolveAdminViewFromPath,
} from './lib/adminRoutes'
import { getSupabaseConfigStatus, isSupabaseConfigured, supabase } from './lib/supabaseClient'

const RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'month', label: 'This Month' },
]

const NAV_ICONS = {
  dashboard: Home,
  organisations: Building2,
  reports: BarChart3,
  transactions: FileText,
  users: UsersRound,
  support: Headphones,
  search: Search,
  settings: Settings,
}

const ARCH9_LISTING_PIPELINE_FEE = 1500

const EMPTY_DASHBOARD = {
  attention: [],
  drilldowns: {
    activeAgents: [],
    activeListings: [],
    activeTransactions: [],
    activeOrganisations: [],
  },
  generatedAt: '',
  kpis: {
    activeAgents: 0,
    activeListings: 0,
    activeTransactions: 0,
    activeOrganisations: 0,
    pipelineRevenue: 0,
    registeredRevenueThisMonth: 0,
    registeredThisMonth: 0,
    sellerSignedBuyerSigned: 0,
    stalledTransactions: 0,
  },
  pipeline: [],
  range: {},
  registered: [],
  revenue: {},
  warnings: [],
}

const EMPTY_SUPPORT = {
  generatedAt: '',
  queue: [],
  range: {},
  summary: {
    missingRevenueItems: 0,
    openTickets: 0,
    stalledTransactions: 0,
    totalItems: 0,
    urgentTickets: 0,
  },
  warnings: [],
}

function getRangeWindow(rangeId = '30d') {
  const end = new Date()
  const start = new Date(end)

  if (rangeId === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (rangeId === '7d') {
    start.setDate(end.getDate() - 7)
  } else if (rangeId === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  } else {
    start.setDate(end.getDate() - 30)
  }

  return {
    end: end.toISOString(),
    start: start.toISOString(),
  }
}

function formatMoney(value = 0) {
  return new Intl.NumberFormat('en-ZA', {
    currency: 'ZAR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value) || 0)
}

function formatCount(value = 0) {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(Number(value) || 0)
}

function formatShortMoney(value = 0) {
  const amount = Number(value) || 0
  const abs = Math.abs(amount)
  const formatter = new Intl.NumberFormat('en-ZA', {
    maximumFractionDigits: abs >= 1_000_000 ? 1 : 0,
    minimumFractionDigits: 0,
  })

  if (abs >= 1_000_000_000) return `R${formatter.format(amount / 1_000_000_000)}bn`
  if (abs >= 1_000_000) return `R${formatter.format(amount / 1_000_000)}m`
  if (abs >= 1_000) return `R${formatter.format(amount / 1_000)}k`
  return formatMoney(amount)
}

function formatDate(value = '') {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatDateTime(value = '') {
  if (!value) return 'No activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No activity'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date)
}

function formatUpdatedStamp(value = '') {
  if (!value) return 'Waiting for data'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Waiting for data'
  const time = new Intl.DateTimeFormat('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  const day = new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
  return `Updated ${time} · ${day}`
}

function formatAge(value = '') {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
  if (days <= 0) return 'Today'
  return `${days}d`
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function compactList(values = []) {
  return values.filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
}

function uniqueCount(values = []) {
  return new Set(compactList(values).map((value) => String(value))).size
}

function countMissingRevenue(rows = [], warnings = []) {
  const missingRows = rows.filter((row) => row?.revenueMissing).map((row) => row.id || row.reference)
  const missingWarnings = warnings
    .filter((warning) => warning?.type === 'missing_revenue')
    .map((warning) => warning.id || warning.reference)
  return uniqueCount([...missingRows, ...missingWarnings])
}

function normalizePriority(value = '') {
  const priority = String(value || 'normal').toLowerCase()
  if (['urgent', 'critical', 'p0', 'p1'].includes(priority)) return 'urgent'
  if (priority === 'high') return 'high'
  if (priority === 'medium') return 'medium'
  return 'normal'
}

function priorityRank(value = '') {
  const priority = normalizePriority(value)
  if (priority === 'urgent') return 0
  if (priority === 'high') return 1
  if (priority === 'medium') return 2
  return 3
}

function supportTypeLabel(value = '') {
  const type = String(value || '').replace(/_/g, ' ')
  if (!type) return 'Support item'
  return type.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function supportItemTitle(item = {}) {
  return item.title || item.reference || item.id || 'Support item'
}

function supportItemKey(item = {}) {
  return `${item.type || 'item'}:${item.id || item.title || item.reference || 'unknown'}`
}

function normalizeDashboardToken(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function collectDashboardTokens(row = {}, keys = []) {
  return keys.map((key) => normalizeDashboardToken(row?.[key])).filter(Boolean).join(' ')
}

function firstDashboardValue(row = {}, keys = [], fallback = '') {
  for (const key of keys) {
    const value = normalizeText(row?.[key])
    if (value) return value
  }
  return fallback
}

function isInactiveDashboardStatus(value = '') {
  return /(^|_)(inactive|archived|deleted|suspended|disabled|false|invited|pending)(_|$)/.test(normalizeDashboardToken(value))
}

function isAgentModulePerson(row = {}) {
  const status = firstDashboardValue(row, ['status', 'membership_status', 'profile_status', 'is_active'], 'active')
  if (isInactiveDashboardStatus(status)) return false

  const tokens = collectDashboardTokens(row, [
    'role',
    'app_role',
    'system_role',
    'workspace_role',
    'organisation_role',
    'organization_role',
    'portal_role',
    'commercial_role',
    'module_context',
    'workspace_kind',
  ])

  return /(^|_)(agent|agency|principal|broker|consultant|manager|admin|property_practitioner|estate_agent|realtor|real_estate)(_|$)/.test(tokens)
}

function isActiveListingRow(row = {}) {
  const tokens = collectDashboardTokens(row, [
    'listing_status',
    'status',
    'publication_status',
    'marketing_status',
    'listing_visibility',
    'bridge_listing_status',
    'property24_status',
    'private_property_status',
    'mandate_status',
  ])
  const isFlaggedActive = ['is_active', 'active'].some((key) => {
    const value = normalizeDashboardToken(row?.[key])
    return ['true', 't', 'yes', 'y', '1', 'active', 'live', 'published'].includes(value)
  })
  const hasActiveSignal =
    isFlaggedActive ||
    /(mandate_signed|listing_active|active_market|under_offer|transaction_created|published|live|active|signed_external_pending_upload|signed_uploaded|uploaded_signed|current_listing)/.test(tokens)
  const hasTerminalSignal = /(^|_)(inactive|archived|withdrawn|deleted|disabled|registered|sold|sold_archived)(_|$)/.test(tokens)

  return hasActiveSignal && !hasTerminalSignal
}

function mapDirectAgent(row = {}, fallbackRole = 'agent_module') {
  const id = firstDashboardValue(row, ['user_id', 'profile_id', 'id', 'email'])
  return {
    id,
    name: firstDashboardValue(row, ['full_name', 'name', 'display_name', 'email'], 'Agent module user'),
    email: firstDashboardValue(row, ['email', 'email_address']),
    phone: firstDashboardValue(row, ['phone', 'mobile', 'cellphone']),
    role: firstDashboardValue(row, ['workspace_role', 'organisation_role', 'organization_role', 'role', 'commercial_role'], fallbackRole),
    status: firstDashboardValue(row, ['status', 'membership_status', 'profile_status'], 'active'),
    organisationId: firstDashboardValue(row, ['organisation_id', 'organization_id', 'agency_id', 'company_id']),
    createdAt: firstDashboardValue(row, ['created_at', 'inserted_at']),
    updatedAt: firstDashboardValue(row, ['last_active_at', 'updated_at', 'created_at']),
  }
}

function mapDirectListing(row = {}) {
  return {
    id: firstDashboardValue(row, ['id', 'listing_id', 'reference']),
    reference: firstDashboardValue(row, ['reference', 'listing_reference', 'code', 'id'], 'Listing'),
    title: firstDashboardValue(row, ['title', 'property_title', 'name', 'reference'], 'Listing'),
    location: firstDashboardValue(row, ['location', 'suburb', 'city', 'area']),
    address: firstDashboardValue(row, ['address', 'property_address', 'address_line_1']),
    status: firstDashboardValue(row, ['listing_status', 'status', 'bridge_listing_status'], 'active'),
    organisationId: firstDashboardValue(row, ['organisation_id', 'organization_id', 'agency_id', 'company_id']),
    agentId: firstDashboardValue(row, ['assigned_agent_id', 'agent_id', 'assigned_user_id', 'owner_user_id']),
    price: Number(firstDashboardValue(row, ['price', 'asking_price', 'listing_price', 'purchase_price'], 0)) || 0,
    createdAt: firstDashboardValue(row, ['created_at', 'inserted_at']),
    updatedAt: firstDashboardValue(row, ['updated_at', 'last_activity_at', 'created_at']),
  }
}

async function fetchAdminRows(table, select = '*') {
  if (!supabase) return { rows: [], warning: `${table}: Supabase is not configured.` }
  try {
    const { data, error } = await supabase.from(table).select(select).limit(10000)
    if (error) return { rows: [], warning: `${table}: ${error.message}` }
    return { rows: Array.isArray(data) ? data : [], warning: '' }
  } catch (error) {
    return { rows: [], warning: `${table}: ${error?.message || 'Direct read failed'}` }
  }
}

async function enhanceDashboardSnapshotWithDirectData(snapshot = EMPTY_DASHBOARD) {
  const [profilesResult, orgUsersResult, listingsResult] = await Promise.all([
    fetchAdminRows('profiles'),
    fetchAdminRows('organisation_users'),
    fetchAdminRows('private_listings'),
  ])

  const agentMap = new Map()
  for (const row of [...profilesResult.rows, ...orgUsersResult.rows]) {
    if (!isAgentModulePerson(row)) continue
    const agent = mapDirectAgent(row)
    if (agent.id && !agentMap.has(agent.id)) agentMap.set(agent.id, agent)
  }

  const activeListings = listingsResult.rows.filter(isActiveListingRow).map(mapDirectListing)
  for (const listing of activeListings) {
    if (listing.agentId && !agentMap.has(listing.agentId)) {
      agentMap.set(listing.agentId, {
        id: listing.agentId,
        name: 'Assigned agent',
        email: '',
        phone: '',
        role: 'assigned_agent',
        status: 'active_work',
        organisationId: listing.organisationId,
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
      })
    }
  }

  const directAgents = Array.from(agentMap.values())
  const warnings = [profilesResult.warning, orgUsersResult.warning, listingsResult.warning]
    .filter(Boolean)
    .map((message) => ({ message, type: 'admin_direct_data' }))

  return {
    ...snapshot,
    drilldowns: {
      ...(snapshot?.drilldowns || {}),
      activeAgents: directAgents.length ? directAgents : snapshot?.drilldowns?.activeAgents || [],
      activeListings: activeListings.length ? activeListings : snapshot?.drilldowns?.activeListings || [],
    },
    kpis: {
      ...(snapshot?.kpis || {}),
      activeAgents: Math.max(Number(snapshot?.kpis?.activeAgents) || 0, directAgents.length),
      activeListings: Math.max(Number(snapshot?.kpis?.activeListings) || 0, activeListings.length),
    },
    warnings: [...(snapshot?.warnings || []), ...warnings],
  }
}

function getOrgKey(row = {}) {
  return row.organisationId || row.organizationId || row.agencyId || row.companyId || 'unassigned'
}

function getOrgDisplayName(row = {}) {
  return row.name || row.tradingName || row.organisationName || row.organisationId || 'Organisation'
}

function getInitials(value = '') {
  const words = String(value || 'A9').trim().split(/\s+/).filter(Boolean)
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'A9'
}

function getTransactionTitle(row = {}) {
  return row.title || row.propertyAddress || row.address || row.reference || row.id || 'Transaction'
}

function getTransactionParties(row = {}) {
  return [row.buyer, row.seller].filter(Boolean).join(' / ') || row.agentId || 'No parties'
}

function normalizeStageLabel(value = '') {
  const stage = String(value || '').trim().replace(/[_-]+/g, ' ')
  if (!stage) return 'In Transfer'
  return stage.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function resolveStageBucket(row = {}) {
  const text = `${row.stage || ''} ${row.status || ''}`.toLowerCase()
  if (text.includes('register')) return 'registered'
  if (text.includes('stall')) return 'stalled'
  if (text.includes('transfer') || text.includes('attorney') || text.includes('convey')) return 'transfer'
  return 'otp'
}

function buildActivitySeries(rows = [], range = {}) {
  const counts = new Map()
  for (const row of rows) {
    const date = new Date(row.registeredAt || row.lastActivityAt || row.createdAt || '')
    if (Number.isNaN(date.getTime())) continue
    const key = date.toISOString().slice(0, 10)
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  const start = new Date(range.start || Date.now() - 29 * 86_400_000)
  const end = new Date(range.end || Date.now())
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []

  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000))
  const buckets = days > 45 ? Math.min(8, Math.ceil(days / 7)) : Math.min(10, days)
  return Array.from({ length: buckets }, (_, index) => {
    const bucketStart = new Date(start)
    bucketStart.setDate(start.getDate() + Math.floor((days / buckets) * index))
    const bucketEnd = new Date(start)
    bucketEnd.setDate(start.getDate() + Math.floor((days / buckets) * (index + 1)))
    let value = 0
    for (const [key, count] of counts.entries()) {
      const date = new Date(`${key}T00:00:00Z`)
      if (date >= bucketStart && date < bucketEnd) value += count
    }
    return {
      label: new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short' }).format(bucketStart),
      value,
    }
  })
}

function buildAreaPath(points = [], width = 360, height = 96) {
  if (!points.length) return { area: '', line: '' }
  const max = Math.max(...points.map((point) => point.value), 1)
  const step = points.length > 1 ? width / (points.length - 1) : width
  const coords = points.map((point, index) => {
    const x = points.length > 1 ? index * step : width / 2
    const y = height - (point.value / max) * (height - 14) - 7
    return [x, y]
  })
  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L ${width} ${height} L 0 ${height} Z`
  return { area, line }
}

function buildOrganisationActivity(snapshot = EMPTY_DASHBOARD) {
  const drilldowns = snapshot?.drilldowns || EMPTY_DASHBOARD.drilldowns
  const organisations = drilldowns.activeOrganisations || []
  const agents = drilldowns.activeAgents || []
  const listings = drilldowns.activeListings || []
  const rows = new Map()

  for (const org of organisations) {
    const key = org.id || org.name || 'unassigned'
    rows.set(key, {
      id: key,
      agents: 0,
      listings: 0,
      name: getOrgDisplayName(org),
      transactions: 0,
      trend: 0,
    })
  }

  for (const agent of agents) {
    const key = getOrgKey(agent)
    const entry = rows.get(key) || { id: key, agents: 0, listings: 0, name: key === 'unassigned' ? 'Unassigned' : key, transactions: 0, trend: 0 }
    entry.agents += 1
    rows.set(key, entry)
  }

  for (const listing of listings) {
    const key = getOrgKey(listing)
    const entry = rows.get(key) || { id: key, agents: 0, listings: 0, name: key === 'unassigned' ? 'Unassigned' : key, transactions: 0, trend: 0 }
    entry.listings += 1
    rows.set(key, entry)
  }

  for (const row of [...(snapshot?.pipeline || []), ...(snapshot?.registered || [])]) {
    const key = getOrgKey(row)
    const entry = rows.get(key) || { id: key, agents: 0, listings: 0, name: key === 'unassigned' ? 'Unassigned' : key, transactions: 0, trend: 0 }
    entry.transactions += 1
    entry.trend += row.registeredAt ? 1 : 0
    rows.set(key, entry)
  }

  return Array.from(rows.values())
    .sort((left, right) => right.transactions - left.transactions || right.listings - left.listings || right.agents - left.agents)
    .slice(0, 5)
}

function buildNeedsAttention(snapshot = EMPTY_DASHBOARD, support = EMPTY_SUPPORT) {
  const attentionRows = snapshot?.attention || []
  const supportSummary = support?.summary || EMPTY_SUPPORT.summary
  const supportItems = buildSupportItems(support, snapshot)
  const missingRevenue = countMissingRevenue([...(snapshot?.pipeline || []), ...(snapshot?.registered || [])], snapshot?.warnings || [])
  const items = compactList([
    (snapshot?.kpis?.stalledTransactions || attentionRows.length)
      ? {
          action: 'No activity for 14+ days',
          count: snapshot?.kpis?.stalledTransactions || attentionRows.length,
          key: 'stalled',
          label: 'stalled transactions',
          tone: 'critical',
        }
      : null,
    missingRevenue
      ? {
          action: 'Add operating revenue',
          count: missingRevenue,
          key: 'revenue',
          label: 'transactions missing revenue',
          tone: 'warning',
        }
      : null,
    supportSummary.openTickets || supportItems.length
      ? {
          action: 'Require response',
          count: supportSummary.openTickets || supportItems.length,
          key: 'support',
          label: 'open support requests',
          tone: 'info',
        }
      : null,
    (snapshot?.warnings || []).length
      ? {
          action: 'Review data contract warnings',
          count: (snapshot?.warnings || []).length,
          key: 'warnings',
          label: 'data warnings',
          tone: 'warning',
        }
      : null,
  ])

  return items
}

function buildSupportItems(snapshot = EMPTY_SUPPORT, dashboard = EMPTY_DASHBOARD) {
  const queueItems = (snapshot.queue || []).map((item) => ({
    ...item,
    priority: normalizePriority(item.priority),
    source: 'support',
  }))
  const dashboardWarnings = (dashboard.warnings || [])
    .filter((warning) => warning?.type === 'missing_revenue')
    .map((warning) => ({
      id: warning.id || warning.reference,
      lastActivityAt: dashboard.generatedAt,
      priority: 'high',
      source: 'dashboard',
      status: warning.context || 'missing_revenue',
      suggestedAction: warning.message || 'Add the Arch9 operating revenue amount.',
      title: warning.reference || warning.id || 'Missing revenue',
      type: 'missing_revenue',
    }))

  const keyed = new Map()
  for (const item of [...queueItems, ...dashboardWarnings]) {
    const key = `${item.type || 'item'}:${item.id || item.title || item.reference}`
    if (!keyed.has(key)) keyed.set(key, item)
  }

  return Array.from(keyed.values()).sort((left, right) => {
    const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority)
    if (priorityDelta) return priorityDelta
    return new Date(right.lastActivityAt || 0).getTime() - new Date(left.lastActivityAt || 0).getTime()
  })
}

function getDashboardDrilldowns(snapshot = EMPTY_DASHBOARD, support = EMPTY_SUPPORT) {
  const kpis = snapshot?.kpis || EMPTY_DASHBOARD.kpis
  const drilldowns = snapshot?.drilldowns || EMPTY_DASHBOARD.drilldowns
  const pipelineRows = snapshot?.pipeline || []
  const registeredRows = snapshot?.registered || []
  const attentionRows = snapshot?.attention || []
  const activeTransactionRows = snapshot?.activeTransactions || snapshot?.drilldowns?.activeTransactions || []
  const missingRevenueRows = [...pipelineRows, ...registeredRows].filter((row) => row.revenueMissing)
  const supportItems = buildSupportItems(support, snapshot)

  return {
    activeOrganisations: {
      empty: 'No active organisations returned by the current data contract.',
      meta: `${formatCount(kpis.activeOrganisations)} active`,
      rows: drilldowns.activeOrganisations || [],
      title: 'Active Organisations',
      type: 'organisations',
    },
    activeAgents: {
      empty: 'No active agents returned by the current data contract.',
      meta: `${formatCount(kpis.activeAgents)} active`,
      rows: drilldowns.activeAgents || [],
      title: 'Active Agents',
      type: 'agents',
    },
    activeListings: {
      empty: 'No active listings returned by the current data contract.',
      meta: `${formatCount(kpis.activeListings)} active`,
      rows: drilldowns.activeListings || [],
      title: 'Active Listings',
      type: 'listings',
    },
    pipeline: {
      empty: 'No seller/buyer signed pipeline items yet.',
      meta: `${formatCount(pipelineRows.length)} sampled`,
      rows: pipelineRows,
      title: 'Seller + Buyer Signed Pipeline',
      type: 'transactions',
    },
    activeTransactions: {
      empty: 'No active transaction rows returned by the current data contract.',
      meta: `${formatCount(activeTransactionRows.length)} sampled`,
      rows: activeTransactionRows,
      title: 'Active Transactions',
      type: 'transactions',
    },
    registered: {
      empty: 'No registrations in this range.',
      meta: `${formatCount(registeredRows.length)} sampled`,
      rows: registeredRows,
      title: 'Registered This Month',
      type: 'transactions',
    },
    stalled: {
      empty: 'No stalled transactions in the current data contract.',
      meta: `${formatCount(attentionRows.length)} sampled`,
      rows: attentionRows,
      title: 'Stalled Transactions',
      type: 'queue',
    },
    missingRevenue: {
      empty: 'No signed or registered transactions are missing Arch9 revenue.',
      meta: `${formatCount(missingRevenueRows.length)} missing`,
      rows: missingRevenueRows,
      title: 'Missing Revenue',
      type: 'transactions',
    },
    support: {
      empty: 'No support items returned yet.',
      meta: `${formatCount(supportItems.length)} open`,
      rows: supportItems,
      title: 'Support Queue',
      type: 'support',
    },
  }
}

async function loadAdminProfile(userId) {
  if (!supabase || !userId) return null

  const attempts = [
    () => supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    () => supabase.from('users').select('*').eq('id', userId).maybeSingle(),
    () => supabase.from('staff_profiles').select('*').eq('user_id', userId).maybeSingle(),
  ]

  for (const query of attempts) {
    try {
      const { data, error } = await query()
      if (data && !error) return data
    } catch {
      // Try the next known profile table.
    }
  }

  return null
}

async function loadDashboardSnapshot(rangeId) {
  if (!supabase) return { data: EMPTY_DASHBOARD, error: 'Supabase is not configured.' }
  const range = getRangeWindow(rangeId)
  const { data, error } = await supabase.rpc('arch9_admin_dashboard_snapshot', {
    p_range_end: range.end,
    p_range_start: range.start,
  })
  const snapshot = await enhanceDashboardSnapshotWithDirectData(data || EMPTY_DASHBOARD)
  return {
    data: snapshot,
    error: error?.message || '',
  }
}

async function loadSupportSnapshot(rangeId) {
  if (!supabase) return { data: EMPTY_SUPPORT, error: 'Supabase is not configured.' }
  const range = getRangeWindow(rangeId)
  const { data, error } = await supabase.rpc('arch9_admin_support_snapshot', {
    p_range_end: range.end,
    p_range_start: range.start,
  })
  return {
    data: data || EMPTY_SUPPORT,
    error: error?.message || '',
  }
}

async function searchAdminData(term = '') {
  const query = normalizeText(term)
  if (!supabase || !query) return { results: [], warnings: [] }

  const searches = [
    {
      label: 'Profile',
      run: () =>
        supabase
          .from('profiles')
          .select('id, full_name, email, role, status, updated_at')
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(8),
    },
    {
      label: 'Organisation',
      run: () =>
        supabase
          .from('organisations')
          .select('id, name, trading_name, status, updated_at')
          .or(`name.ilike.%${query}%,trading_name.ilike.%${query}%`)
          .limit(8),
    },
    {
      label: 'Transaction',
      run: () =>
        supabase
          .from('transactions')
          .select('id, reference, matter_number, buyer_name, seller_name, status, stage, updated_at')
          .or(`reference.ilike.%${query}%,matter_number.ilike.%${query}%,buyer_name.ilike.%${query}%,seller_name.ilike.%${query}%`)
          .limit(8),
    },
  ]

  const settled = await Promise.all(
    searches.map(async (searchConfig) => {
      try {
        const { data, error } = await searchConfig.run()
        if (error) return { error: error.message, label: searchConfig.label, rows: [] }
        return { error: '', label: searchConfig.label, rows: Array.isArray(data) ? data : [] }
      } catch (error) {
        return { error: error?.message || 'Search failed', label: searchConfig.label, rows: [] }
      }
    }),
  )

  return {
    results: settled.flatMap((group) =>
      group.rows.map((row) => ({
        id: row.id,
        label: group.label,
        meta: row.email || row.status || row.stage || '',
        time: row.updated_at,
        title:
          row.full_name ||
          row.name ||
          row.trading_name ||
          row.reference ||
          row.matter_number ||
          [row.buyer_name, row.seller_name].filter(Boolean).join(' / ') ||
          row.id,
      })),
    ),
    warnings: settled.filter((group) => group.error).map((group) => `${group.label}: ${group.error}`),
  }
}

function LoginScreen({ authError, onMagicLink, onSignIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const configStatus = getSupabaseConfigStatus()

  async function submit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    await onSignIn({ email, password })
    setIsSubmitting(false)
  }

  async function sendMagicLink() {
    setIsSubmitting(true)
    await onMagicLink({ email })
    setIsSubmitting(false)
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">A9</div>
          <div>
            <p>Arch9 Internal</p>
            <h1>Operating Console</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@arch9.co.za"
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              value={password}
            />
          </label>

          {authError ? <Notice tone="danger" text={authError} /> : null}
          {!configStatus.ok ? <Notice tone="warning" text={configStatus.message} /> : null}

          <button className="primary-button" disabled={!isSupabaseConfigured || isSubmitting} type="submit">
            <ShieldCheck size={18} />
            <span>{isSubmitting ? 'Signing in...' : 'Sign in'}</span>
          </button>
          <button
            className="secondary-button"
            disabled={!isSupabaseConfigured || !email || isSubmitting}
            onClick={sendMagicLink}
            type="button"
          >
            Send magic link
          </button>
        </form>
      </section>
    </main>
  )
}

function Notice({ text, tone = 'neutral' }) {
  return (
    <div className={`notice ${tone}`}>
      <AlertTriangle size={16} />
      <span>{text}</span>
    </div>
  )
}

function Sidebar({ access, activeView, onNavigate, onSignOut, profile }) {
  const items = ADMIN_NAV_ITEMS.filter((item) => item.levels.includes(access.level))

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden="true">A9</div>
        <div>
          <strong>Arch9</strong>
          <span>Operating Console</span>
        </div>
      </div>

      <nav className="nav-list" aria-label="Admin navigation">
        {items.map((item) => {
          const Icon = NAV_ICONS[item.id]
          return (
            <a
              className={activeView === item.id ? 'active' : ''}
              href={pathForView(item.id)}
              key={item.id}
              onClick={(event) => {
                event.preventDefault()
                onNavigate(item.id)
              }}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </a>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div>
          <strong>{profile?.full_name || profile?.name || profile?.email || 'Arch9 user'}</strong>
          <span>{formatAdminLevelLabel(access.level)}</span>
        </div>
        <button className="icon-button" onClick={onSignOut} title="Sign out" type="button">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  )
}

function Topbar({ activeView, generatedAt, isLoading, onRefresh, rangeId, setRangeId }) {
  const title =
    activeView === 'support'
      ? 'Support Queue'
      : activeView === 'search'
        ? 'Search'
        : activeView === 'settings'
          ? 'Settings'
          : activeView === 'organisations'
            ? 'Organisations'
            : activeView === 'transactions'
              ? 'Transactions'
              : activeView === 'users'
                ? 'Users'
                : activeView === 'reports'
                  ? 'Reports'
                  : 'Operating Dashboard'

  const subtitle =
    activeView === 'dashboard'
      ? 'Platform performance and transaction activity.'
      : activeView === 'support'
        ? 'Open support work and operational exceptions.'
        : activeView === 'search'
          ? 'Find organisations, users, and transactions.'
          : activeView === 'settings'
            ? 'Access, environment, and data-contract status.'
            : 'Existing admin data, filtered into a focused workspace.'

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Arch9 Admin</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
        {activeView === 'dashboard' ? (
          <div className="freshness-line">
            <span aria-hidden="true" />
            <strong>{isLoading ? 'Refreshing dashboard' : formatUpdatedStamp(generatedAt)}</strong>
          </div>
        ) : null}
      </div>
      <div className="topbar-actions">
        <label className="range-select">
          <CalendarDays size={16} />
          <select aria-label="Date range" onChange={(event) => setRangeId(event.target.value)} value={rangeId}>
            {RANGE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <button className="primary-button compact" onClick={onRefresh} type="button">
          {isLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          <span>Refresh</span>
        </button>
      </div>
    </header>
  )
}

function MetricCard({ active = false, context = '', icon: Icon, label, meta = '', onClick, tone = 'green', value }) {
  const className = `metric-card ${tone}${onClick ? ' interactive' : ''}${active ? ' active' : ''}`
  const content = (
    <>
      <div className="metric-icon">
        <Icon size={20} />
      </div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {meta ? <small className="positive-metric">{meta}</small> : null}
        {context ? <small>{context}</small> : null}
      </div>
    </>
  )

  if (onClick) {
    return (
      <button className={className} onClick={onClick} type="button">
        {content}
      </button>
    )
  }

  return (
    <article className={className}>
      {content}
    </article>
  )
}

function StatusStrip({ dashboard, isLoading, support }) {
  const warnings = dashboard?.warnings || []
  const range = dashboard?.range || {}
  const generatedAt = dashboard?.generatedAt || ''
  const supportSummary = support?.summary || EMPTY_SUPPORT.summary

  const items = [
    ['Generated', generatedAt ? formatDateTime(generatedAt) : isLoading ? 'Refreshing' : 'Waiting for data'],
    ['Range', range.start && range.end ? `${formatDate(range.start)} - ${formatDate(range.end)}` : 'Selected range'],
    ['Data warnings', formatCount(warnings.length)],
    ['Support queue', formatCount(supportSummary.totalItems)],
  ]

  return (
    <section className="status-strip" aria-label="Dashboard status">
      {items.map(([label, value]) => (
        <div className="status-pill" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  )
}

function RevenuePath({ activeKey = '', onSelect, snapshot }) {
  const kpis = snapshot?.kpis || EMPTY_DASHBOARD.kpis
  const revenue = snapshot?.revenue || {}
  const pipeline = revenue.pipeline || {}
  const registered = revenue.registeredThisMonth || {}
  const warnings = snapshot?.warnings || []
  const missingRevenue = countMissingRevenue([...(snapshot?.pipeline || []), ...(snapshot?.registered || [])], warnings)

  const steps = [
    {
      label: 'Seller + Buyer Signed',
      drilldown: 'pipeline',
      meta: 'Registration pending',
      value: formatCount(kpis.sellerSignedBuyerSigned || pipeline.count),
    },
    {
      label: 'Pipeline Revenue',
      drilldown: 'pipeline',
      meta: 'Arch9 operating revenue',
      value: formatMoney(kpis.pipelineRevenue || pipeline.amount),
    },
    {
      label: 'Registered This Month',
      drilldown: 'registered',
      meta: `${formatCount(kpis.registeredThisMonth || registered.count)} registrations`,
      value: formatMoney(kpis.registeredRevenueThisMonth || registered.amount),
    },
    {
      label: 'Missing Revenue',
      drilldown: 'missingRevenue',
      meta: 'Needs cleanup',
      value: formatCount(missingRevenue),
      tone: missingRevenue ? 'warning' : 'success',
    },
  ]

  return (
    <section className="funnel-panel">
      <div className="panel-title">
        <h2>Revenue Path</h2>
        <span>Signed to registered</span>
      </div>
      <div className="funnel-steps">
        {steps.map((step) => (
          <button
            className={`funnel-step ${step.tone || ''}${activeKey === step.drilldown ? ' active' : ''}`}
            key={step.label}
            onClick={() => onSelect?.(step.drilldown)}
            type="button"
          >
            <span>{step.label}</span>
            <strong>{step.value}</strong>
            <small>{step.meta}</small>
          </button>
        ))}
      </div>
    </section>
  )
}

function SupportBrief({ onSelect, support }) {
  const summary = support?.summary || EMPTY_SUPPORT.summary
  const queue = support?.queue || []
  const urgentRows = queue.filter((item) => ['urgent', 'critical', 'high', 'p0', 'p1'].includes(String(item.priority || '').toLowerCase()))

  return (
    <section className="support-brief">
      <div className="panel-title">
        <h2>Support At A Glance</h2>
        <span>{formatCount(summary.totalItems)} open</span>
      </div>
      <div className="brief-metrics">
        <div>
          <span>Open tickets</span>
          <strong>{formatCount(summary.openTickets)}</strong>
        </div>
        <div>
          <span>Urgent</span>
          <strong>{formatCount(summary.urgentTickets)}</strong>
        </div>
        <div>
          <span>Stalled</span>
          <strong>{formatCount(summary.stalledTransactions)}</strong>
        </div>
        <div>
          <span>Revenue gaps</span>
          <strong>{formatCount(summary.missingRevenueItems)}</strong>
        </div>
      </div>
      <div className="brief-list">
        {(urgentRows.length ? urgentRows : queue).slice(0, 3).map((item) => (
          <button key={`${item.type}-${item.id}`} onClick={() => onSelect?.('support')} type="button">
            <strong>{item.title || item.reference || item.id}</strong>
            <span>{item.suggestedAction || item.status || 'Review item'}</span>
          </button>
        ))}
        {!queue.length ? <p className="empty-state">No support items returned yet.</p> : null}
      </div>
    </section>
  )
}

function DashboardView({ isLoading, snapshot, support }) {
  const [drilldownKey, setDrilldownKey] = useState('pipeline')
  const kpis = snapshot?.kpis || EMPTY_DASHBOARD.kpis
  const warnings = snapshot?.warnings || []
  const pipelineRows = snapshot?.pipeline || []
  const registeredRows = snapshot?.registered || []
  const attentionRows = snapshot?.attention || []
  const missingRevenue = countMissingRevenue([...pipelineRows, ...registeredRows], warnings)
  const drilldowns = useMemo(() => getDashboardDrilldowns(snapshot, support), [snapshot, support])
  const selectedDrilldown = drilldowns[drilldownKey]
  const listingRows = snapshot?.drilldowns?.activeListings || []
  const organisationRows = snapshot?.drilldowns?.activeOrganisations || []
  const agentRows = snapshot?.drilldowns?.activeAgents || []
  const activeTransactionRows = snapshot?.activeTransactions || snapshot?.drilldowns?.activeTransactions || []
  const liveRows = (activeTransactionRows.length ? activeTransactionRows : [...pipelineRows, ...attentionRows]).slice(0, 5)
  const totalInventorySample = listingRows.reduce((total, row) => total + (Number(row.price) || 0), 0)
  const listingPipelineRevenue = (Number(kpis.activeListings) || 0) * ARCH9_LISTING_PIPELINE_FEE
  const organisationActivity = useMemo(() => buildOrganisationActivity(snapshot), [snapshot])
  const attentionItems = useMemo(() => buildNeedsAttention(snapshot, support), [snapshot, support])
  const activitySeries = useMemo(
    () => buildActivitySeries([...pipelineRows, ...registeredRows], snapshot?.range || {}),
    [pipelineRows, registeredRows, snapshot?.range],
  )
  const registeredSeries = useMemo(
    () => buildActivitySeries(registeredRows, snapshot?.range || {}),
    [registeredRows, snapshot?.range],
  )
  const stageBuckets = pipelineRows.reduce(
    (totals, row) => {
      totals[resolveStageBucket(row)] += 1
      return totals
    },
    { otp: 0, registered: registeredRows.length, stalled: kpis.stalledTransactions || attentionRows.length, transfer: 0 },
  )
  const pipelineCount = kpis.sellerSignedBuyerSigned || pipelineRows.length
  const activeTransactionCount = Number(kpis.activeTransactions) || activeTransactionRows.length || pipelineCount
  const feeContext =
    pipelineCount && kpis.pipelineRevenue
      ? `${formatCount(pipelineCount)} signed transactions`
      : 'Configured fee values from transaction records'

  const metrics = [
    {
      drilldown: 'activeOrganisations',
      icon: Building2,
      label: 'Organisations',
      meta: organisationRows.length ? `Across ${formatCount(uniqueCount(organisationRows.map((row) => row.status || 'active')))} status group` : '',
      context: 'Enabled workspaces',
      value: formatCount(kpis.activeOrganisations),
    },
    {
      drilldown: 'activeAgents',
      icon: UserRoundCheck,
      label: 'Agents',
      meta: agentRows.length ? `Across ${formatCount(uniqueCount(agentRows.map((row) => row.organisationId)))} organisations` : '',
      context: 'Associated active agent users',
      value: formatCount(kpis.activeAgents),
    },
    {
      drilldown: 'activeListings',
      icon: Home,
      label: 'Active Listings',
      meta: totalInventorySample ? `${formatShortMoney(totalInventorySample)} sampled inventory` : '',
      context: 'Live listing base',
      value: formatCount(kpis.activeListings),
    },
    {
      drilldown: 'activeListings',
      icon: CircleDollarSign,
      label: 'Listing Pipeline',
      meta: `${formatCount(kpis.activeListings)} listings x R1,500`,
      context: 'Projected Arch9 fee potential',
      value: formatMoney(listingPipelineRevenue),
    },
    {
      drilldown: 'activeTransactions',
      icon: ListChecks,
      label: 'Active Transactions',
      meta: pipelineCount ? `${formatCount(pipelineCount)} signed pipeline` : '',
      context: 'Open, not completed or registered',
      value: formatCount(activeTransactionCount),
    },
  ]

  return (
    <div className="view-stack operating-dashboard">
      <section className="metric-grid platform-kpis" aria-label="Platform KPIs">
        {metrics.map((metric) => (
          <MetricCard
            active={drilldownKey === metric.drilldown}
            context={metric.context}
            icon={metric.icon}
            key={metric.label}
            label={metric.label}
            meta={metric.meta}
            onClick={() => setDrilldownKey(metric.drilldown)}
            tone={metric.tone}
            value={metric.value}
          />
        ))}
      </section>

      {selectedDrilldown ? (
        <DrilldownPanel
          config={selectedDrilldown}
          onClose={() => setDrilldownKey('')}
        />
      ) : null}

      <section className="dashboard-primary-row">
        <TransactionActivityCard
          activitySeries={activitySeries}
          isLoading={isLoading}
          onSelect={setDrilldownKey}
          stageBuckets={stageBuckets}
        />
        <RevenuePerformanceCard
          feeContext={feeContext}
          missingRevenue={missingRevenue}
          onSelect={setDrilldownKey}
          pipelineCount={pipelineCount}
          registeredSeries={registeredSeries}
          snapshot={snapshot}
        />
      </section>

      <section className="dashboard-bottom-row">
        <OrganisationActivityCard
          onSelect={() => setDrilldownKey('activeOrganisations')}
          rows={organisationActivity}
        />
        <NeedsAttentionCard items={attentionItems} onSelect={setDrilldownKey} />
        <LiveTransactionPipelineCard rows={liveRows} />
      </section>
    </div>
  )
}

function MiniAreaChart({ label = 'Activity chart', points = [] }) {
  const { area, line } = buildAreaPath(points)
  const total = points.reduce((sum, point) => sum + point.value, 0)

  return (
    <div className="mini-chart" aria-label={label}>
      <svg role="img" viewBox="0 0 360 96">
        <path className="chart-area" d={area} />
        <path className="chart-line" d={line} />
        {points.map((point, index) => {
          const max = Math.max(...points.map((item) => item.value), 1)
          const x = points.length > 1 ? (index * 360) / (points.length - 1) : 180
          const y = 96 - (point.value / max) * 82 - 7
          return <circle cx={x} cy={y} key={`${point.label}-${index}`} r="2.5" />
        })}
      </svg>
      <div className="chart-axis">
        {points.slice(0, 5).map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
      {!total ? <p className="chart-empty">No dated activity returned for this range.</p> : null}
    </div>
  )
}

function TransactionActivityCard({ activitySeries = [], isLoading = false, onSelect, stageBuckets = {} }) {
  const stages = [
    { key: 'otp', label: 'OTP Signed', value: stageBuckets.otp || 0, icon: FileText },
    { key: 'transfer', label: 'In Transfer', value: stageBuckets.transfer || 0, icon: RefreshCw },
    { key: 'registered', label: 'Registered', value: stageBuckets.registered || 0, icon: CheckCircle2 },
    { key: 'stalled', label: 'Stalled', value: stageBuckets.stalled || 0, icon: AlertTriangle, tone: 'danger' },
  ]

  return (
    <section className="dashboard-card transaction-activity-card">
      <div className="panel-title">
        <h2>Transaction Activity</h2>
        <span>{isLoading ? 'Refreshing' : 'Live snapshot'}</span>
      </div>
      <div className="stage-flow">
        {stages.map((stage, index) => {
          const Icon = stage.icon
          return (
            <button
              className={`stage-node ${stage.tone || ''}`}
              key={stage.key}
              onClick={() => onSelect?.(stage.key === 'registered' ? 'registered' : stage.key === 'stalled' ? 'stalled' : 'pipeline')}
              type="button"
            >
              <div>
                <Icon size={20} />
              </div>
              <span>{stage.label}</span>
              <strong>{formatCount(stage.value)}</strong>
              <small>{stage.key === 'stalled' ? 'Exception queue' : 'Current snapshot'}</small>
              {index < stages.length - 1 ? <ChevronRight className="stage-arrow" size={18} /> : null}
            </button>
          )
        })}
      </div>
      <div className="chart-block">
        <div>
          <h3>Transaction Activity</h3>
          <span>Based on dated pipeline and registration rows in the selected range</span>
        </div>
        <MiniAreaChart points={activitySeries} />
      </div>
    </section>
  )
}

function RevenuePerformanceCard({ feeContext, missingRevenue = 0, onSelect, pipelineCount = 0, registeredSeries = [], snapshot }) {
  const kpis = snapshot?.kpis || EMPTY_DASHBOARD.kpis
  const revenue = snapshot?.revenue || {}
  const registered = revenue.registeredThisMonth || {}
  const pipeline = revenue.pipeline || {}
  const registeredAmount = kpis.registeredRevenueThisMonth || registered.amount || 0
  const pipelineAmount = kpis.pipelineRevenue || pipeline.amount || 0
  const displayedPipelineCount = pipelineCount || pipeline.count || 0
  const revenueRows = [
    ['Signed pipeline', pipelineAmount, `${formatCount(displayedPipelineCount)} transactions`],
    ['Registered this period', registeredAmount, `${formatCount(kpis.registeredThisMonth || registered.count || 0)} registrations`],
    ['Revenue gaps', missingRevenue, 'Need operating fee values'],
  ]

  return (
    <section className="dashboard-card revenue-performance-card">
      <div className="panel-title">
        <h2>Revenue Performance</h2>
        <span>Arch9 fees</span>
      </div>
      <div className="revenue-split">
        <button className="revenue-primary" onClick={() => onSelect?.('registered')} type="button">
          <span>Registered Revenue</span>
          <strong>{formatMoney(registeredAmount)}</strong>
          <small>{formatCount(kpis.registeredThisMonth || registered.count || 0)} registered in range</small>
          <MiniAreaChart label="Registered revenue trend" points={registeredSeries} />
        </button>
        <button className="revenue-primary compact-revenue" onClick={() => onSelect?.('pipeline')} type="button">
          <span>Pipeline Revenue</span>
          <strong>{formatMoney(pipelineAmount)}</strong>
          <small>{feeContext}</small>
          <div className="revenue-breakdown">
            {revenueRows.map(([label, amount, detail]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{typeof amount === 'number' && label === 'Revenue gaps' ? formatCount(amount) : formatMoney(amount)}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </div>
        </button>
      </div>
      <div className="fee-strip">
        <CircleDollarSign size={16} />
        <span>Arch9 fee context is read from transaction revenue fields where present.</span>
      </div>
    </section>
  )
}

function OrganisationActivityCard({ onSelect, rows = [] }) {
  return (
    <section className="dashboard-card organisation-activity-card">
      <div className="panel-title">
        <h2>Organisation Activity</h2>
        <button className="text-button" onClick={onSelect} type="button">View all</button>
      </div>
      <div className="org-table compact-table">
        <div className="compact-table-head">
          <span>Organisation</span>
          <span>Agents</span>
          <span>Listings</span>
          <span>Tx</span>
        </div>
        {rows.length ? rows.map((row) => (
          <button className="compact-table-row" key={row.id || row.name} onClick={onSelect} type="button">
            <span className="org-name-cell">
              <b>{getInitials(row.name)}</b>
              <strong>{row.name}</strong>
            </span>
            <span>{formatCount(row.agents)}</span>
            <span>{formatCount(row.listings)}</span>
            <span className="trend-value">+{formatCount(row.transactions)}</span>
          </button>
        )) : <p className="empty-state">Organisation activity will appear once the dashboard RPC returns rows.</p>}
      </div>
    </section>
  )
}

function NeedsAttentionCard({ items = [], onSelect }) {
  if (!items.length) {
    return (
      <section className="dashboard-card needs-attention-card">
        <div className="panel-title">
          <h2>Needs Attention</h2>
          <span>Healthy</span>
        </div>
        <div className="healthy-state">
          <CheckCircle2 size={20} />
          <strong>All systems operational</strong>
          <span>No items currently require attention.</span>
        </div>
      </section>
    )
  }

  return (
    <section className="dashboard-card needs-attention-card">
      <div className="panel-title">
        <h2>Needs Attention</h2>
        <span>{formatCount(items.length)} queues</span>
      </div>
      <div className="attention-list">
        {items.slice(0, 4).map((item) => (
          <button className={`attention-item ${item.tone}`} key={item.key} onClick={() => onSelect?.(item.key === 'warnings' ? 'missingRevenue' : item.key)} type="button">
            <span>{formatCount(item.count)}</span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.action}</small>
            </div>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </section>
  )
}

function LiveTransactionPipelineCard({ rows = [] }) {
  return (
    <section className="dashboard-card live-pipeline-card">
      <div className="panel-title">
        <h2>Live Transaction Pipeline</h2>
        <span>{formatCount(rows.length)} shown</span>
      </div>
      <div className="table-shell live-table-shell">
        {rows.length ? (
          <table className="live-pipeline-table">
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Agency</th>
                <th>Agent</th>
                <th>Stage</th>
                <th>Age</th>
                <th>Arch9 Fee</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.type || 'tx'}-${row.id || row.reference}`}>
                  <td>
                    <strong>{getTransactionTitle(row)}</strong>
                    <span>{getTransactionParties(row)}</span>
                  </td>
                  <td>{row.organisationId || 'No agency'}</td>
                  <td>{row.agentId || 'No agent'}</td>
                  <td>
                    <span className={`stage-pill ${resolveStageBucket(row)}`}>{normalizeStageLabel(row.stage || row.status)}</span>
                  </td>
                  <td>{formatAge(row.lastActivityAt || row.registeredAt)}</td>
                  <td>{row.revenueMissing ? <span className="missing">Missing</span> : formatMoney(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">No live pipeline rows returned by the current dashboard contract.</p>
        )}
      </div>
    </section>
  )
}

function DrilldownPanel({ config, onClose }) {
  const rows = config?.rows || []

  return (
    <section className="drilldown-panel">
      <div className="panel-title">
        <div>
          <h2>{config.title}</h2>
          <span>{config.meta}</span>
        </div>
        {onClose ? (
          <button className="icon-button" onClick={onClose} title="Close drilldown" type="button">
            <X size={16} />
          </button>
        ) : null}
      </div>
      <div className="table-shell">
        {rows.length ? <DrilldownTable rows={rows} type={config.type} /> : <p className="empty-state">{config.empty}</p>}
      </div>
    </section>
  )
}

function DrilldownTable({ rows = [], type = '' }) {
  if (type === 'organisations') {
    return (
      <table>
        <thead>
          <tr>
            <th>Organisation</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row) => (
            <tr key={row.id || row.name}>
              <td>
                <strong>{row.name || row.tradingName || row.id || 'Organisation'}</strong>
                <span>{row.tradingName || row.id || 'No secondary name'}</span>
              </td>
              <td>{row.status || 'active'}</td>
              <td>{row.ownerId || row.accountOwnerId || 'No owner'}</td>
              <td>{formatDateTime(row.updatedAt || row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (type === 'agents') {
    return (
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Role</th>
            <th>Organisation</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row) => (
            <tr key={row.id || row.email || row.name}>
              <td>
                <strong>{row.name || row.email || row.id || 'Agent'}</strong>
                <span>{row.email || row.phone || 'No contact detail'}</span>
              </td>
              <td>{row.role || 'agent'}</td>
              <td>{row.organisationId || 'No organisation'}</td>
              <td>{formatDateTime(row.updatedAt || row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (type === 'listings') {
    return (
      <table>
        <thead>
          <tr>
            <th>Listing</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row) => (
            <tr key={row.id || row.reference || row.title}>
              <td>
                <strong>{row.title || row.reference || row.id || 'Listing'}</strong>
                <span>{row.location || row.address || 'No location'}</span>
              </td>
              <td>{row.status || 'active'}</td>
              <td>
                <strong>{row.organisationId || 'No organisation'}</strong>
                <span>{row.agentId || 'No agent'}</span>
              </td>
              <td>{row.price ? formatMoney(row.price) : 'No value'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (type === 'support') {
    return (
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Context</th>
            <th>Priority</th>
            <th>Next action</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row) => (
            <tr key={supportItemKey(row)}>
              <td>
                <strong>{supportItemTitle(row)}</strong>
                <span>{supportTypeLabel(row.type)}</span>
              </td>
              <td>
                <strong>{row.organisationId || row.ownerId || 'No owner context'}</strong>
                <span>{row.status || row.source || 'No status'}</span>
              </td>
              <td>{normalizePriority(row.priority)}</td>
              <td>{row.suggestedAction || 'Review item.'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (type === 'queue') {
    return (
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Stage</th>
            <th>Priority</th>
            <th>Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row) => (
            <tr key={row.id || row.reference}>
              <td>
                <strong>{row.title || row.reference || row.id || 'Transaction'}</strong>
                <span>{row.suggestedAction || 'Review item'}</span>
              </td>
              <td>{row.stage || row.status || 'No stage'}</td>
              <td>{normalizePriority(row.priority)}</td>
              <td>{formatDateTime(row.lastActivityAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Reference</th>
          <th>People</th>
          <th>Date</th>
          <th>Revenue</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 50).map((row) => (
          <tr key={row.id || row.reference}>
            <td>
              <strong>{row.reference || row.title || row.id || 'Transaction'}</strong>
              <span>{row.stage || row.status || 'No stage'}</span>
            </td>
            <td>
              <strong>{[row.buyer, row.seller].filter(Boolean).join(' / ') || 'No names'}</strong>
              <span>{row.organisationId || row.agentId || 'No owner context'}</span>
            </td>
            <td>{formatDate(row.registeredAt || row.lastActivityAt)}</td>
            <td>
              <strong>{formatMoney(row.revenue)}</strong>
              {row.revenueMissing ? <span className="missing">Missing revenue</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SupportLane({ items = [], onSelectItem, selectedItemKey = '', title }) {
  return (
    <section className="support-lane">
      <div className="panel-title">
        <h2>{title}</h2>
        <span>{formatCount(items.length)}</span>
      </div>
      <div className="queue-list">
        {items.length ? (
          items.slice(0, 6).map((item) => (
            <button
              className={`queue-item ${item.priority || 'normal'}${selectedItemKey === supportItemKey(item) ? ' active' : ''}`}
              key={`${title}-${item.type}-${item.id || item.title}`}
              onClick={() => onSelectItem?.(item)}
              type="button"
            >
              <div>
                <strong>{supportItemTitle(item)}</strong>
                <span>{item.suggestedAction || item.status || 'Review item'}</span>
              </div>
              <div>
                <b>{supportTypeLabel(item.type)}</b>
                <span>{formatDateTime(item.lastActivityAt)}</span>
              </div>
            </button>
          ))
        ) : (
          <p className="empty-state">No items in this lane.</p>
        )}
      </div>
    </section>
  )
}

function SupportQueueTable({ items = [], onSelectItem, selectedItemKey = '' }) {
  return (
    <section className="data-panel">
      <div className="panel-title">
        <h2>Work Queue</h2>
        <span>{formatCount(items.length)}</span>
      </div>
      <div className="table-shell">
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Context</th>
                <th>Priority</th>
                <th>Last activity</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 30).map((item) => (
                <tr
                  className={selectedItemKey === supportItemKey(item) ? 'selected-row' : ''}
                  key={`support-row-${item.type}-${item.id || item.title}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelectItem?.(item)
                  }}
                  onClick={() => onSelectItem?.(item)}
                  tabIndex={0}
                >
                  <td>
                    <strong>{supportItemTitle(item)}</strong>
                    <span>{supportTypeLabel(item.type)}</span>
                  </td>
                  <td>
                    <strong>{item.organisationId || item.ownerId || 'No owner context'}</strong>
                    <span>{item.status || item.source || 'No status'}</span>
                  </td>
                  <td>
                    <strong>{normalizePriority(item.priority)}</strong>
                  </td>
                  <td>{formatDateTime(item.lastActivityAt)}</td>
                  <td>{item.suggestedAction || 'Review item and update status.'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">No support items match this filter.</p>
        )}
      </div>
    </section>
  )
}

function SupportItemDetail({ item }) {
  if (!item) {
    return (
      <section className="detail-panel">
        <div className="panel-title">
          <h2>Item Detail</h2>
          <span>None selected</span>
        </div>
        <p className="empty-state">Select a queue item to inspect the operating context.</p>
      </section>
    )
  }

  const rows = [
    ['Type', supportTypeLabel(item.type)],
    ['Priority', normalizePriority(item.priority)],
    ['Status', item.status || 'No status'],
    ['Organisation', item.organisationId || 'No organisation'],
    ['Owner', item.ownerId || 'No owner'],
    ['Last activity', formatDateTime(item.lastActivityAt)],
    ['Source', item.source || 'support'],
    ['Next action', item.suggestedAction || 'Review item and update status.'],
  ]

  return (
    <section className="detail-panel">
      <div className="panel-title">
        <div>
          <h2>{supportItemTitle(item)}</h2>
          <span>{supportTypeLabel(item.type)}</span>
        </div>
      </div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function SupportView({ dashboard, snapshot }) {
  const [filter, setFilter] = useState('all')
  const [selectedItemKey, setSelectedItemKey] = useState('')
  const summary = snapshot?.summary || EMPTY_SUPPORT.summary
  const items = useMemo(() => buildSupportItems(snapshot, dashboard), [snapshot, dashboard])
  const urgentItems = items.filter((item) => ['urgent', 'high'].includes(normalizePriority(item.priority)))
  const stalledItems = items.filter((item) => item.type === 'stalled_transaction')
  const revenueItems = items.filter((item) => item.type === 'missing_revenue')
  const filteredItems = items.filter((item) => {
    if (filter === 'urgent') return ['urgent', 'high'].includes(normalizePriority(item.priority))
    if (filter === 'tickets') return item.type === 'support_ticket'
    if (filter === 'stalled') return item.type === 'stalled_transaction'
    if (filter === 'revenue') return item.type === 'missing_revenue'
    return true
  })
  const filters = [
    ['all', 'All'],
    ['urgent', 'Urgent'],
    ['tickets', 'Tickets'],
    ['stalled', 'Stalled'],
    ['revenue', 'Revenue Gaps'],
  ]
  const selectedItem =
    filteredItems.find((item) => supportItemKey(item) === selectedItemKey) ||
    filteredItems[0] ||
    items.find((item) => supportItemKey(item) === selectedItemKey) ||
    null

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedItemKey('')
      return
    }

    if (!filteredItems.some((item) => supportItemKey(item) === selectedItemKey)) {
      setSelectedItemKey(supportItemKey(filteredItems[0]))
    }
  }, [filteredItems, selectedItemKey])

  function selectItem(item) {
    setSelectedItemKey(supportItemKey(item))
  }

  return (
    <div className="view-stack">
      <section className="metric-grid compact-grid" aria-label="Support metrics">
        <MetricCard active={filter === 'tickets'} icon={Headphones} label="Open Tickets" meta="Unresolved issues" onClick={() => setFilter('tickets')} value={formatCount(summary.openTickets)} />
        <MetricCard active={filter === 'urgent'} icon={AlertTriangle} label="Urgent Items" meta="High-priority support" onClick={() => setFilter('urgent')} tone="red" value={formatCount(urgentItems.length || summary.urgentTickets)} />
        <MetricCard active={filter === 'stalled'} icon={Clock3} label="Stalled Transactions" meta="14+ days quiet" onClick={() => setFilter('stalled')} tone="amber" value={formatCount(summary.stalledTransactions)} />
        <MetricCard active={filter === 'revenue'} icon={CircleDollarSign} label="Revenue Gaps" meta="Missing Arch9 revenue" onClick={() => setFilter('revenue')} tone="blue" value={formatCount(summary.missingRevenueItems || revenueItems.length)} />
      </section>

      {(snapshot?.warnings || []).length ? <WarningsPanel warnings={snapshot.warnings} /> : null}

      <section className="support-lanes">
        <SupportLane items={urgentItems} onSelectItem={selectItem} selectedItemKey={selectedItemKey} title="Urgent" />
        <SupportLane items={stalledItems} onSelectItem={selectItem} selectedItemKey={selectedItemKey} title="Stalled Transactions" />
        <SupportLane items={revenueItems} onSelectItem={selectItem} selectedItemKey={selectedItemKey} title="Missing Revenue" />
      </section>

      <section className="support-filter-panel">
        <div>
          <h2>Queue Filter</h2>
          <span>{formatCount(filteredItems.length)} visible</span>
        </div>
        <div className="segmented-control" role="tablist" aria-label="Support queue filter">
          {filters.map(([id, label]) => (
            <button className={filter === id ? 'active' : ''} key={id} onClick={() => setFilter(id)} type="button">
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="support-detail-layout">
        <SupportQueueTable items={filteredItems} onSelectItem={selectItem} selectedItemKey={selectedItemKey} />
        <SupportItemDetail item={selectedItem} />
      </section>
    </div>
  )
}

function WarningsPanel({ warnings = [] }) {
  return (
    <section className="warning-panel">
      <div>
        <AlertTriangle size={18} />
        <h2>Data Warnings</h2>
      </div>
      <ul>
        {warnings.slice(0, 8).map((warning, index) => (
          <li key={`${warning?.type || warning?.table || 'warning'}-${index}`}>
            {warning?.message || warning?.table || String(warning)}
          </li>
        ))}
      </ul>
    </section>
  )
}

function DataPanel({ empty, meta = '', rows = [], title, type }) {
  return (
    <section className="data-panel">
      <div className="panel-title">
        <h2>{title}</h2>
        <span>{meta || formatCount(rows.length)}</span>
      </div>
      <div className="table-shell">
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>People</th>
                <th>{type === 'registered' ? 'Registered' : 'Activity'}</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.id || row.reference}>
                  <td>
                    <strong>{row.reference || row.id || 'Transaction'}</strong>
                    <span>{row.stage || row.status || 'No stage'}</span>
                  </td>
                  <td>
                    <strong>{[row.buyer, row.seller].filter(Boolean).join(' / ') || 'No names'}</strong>
                    <span>{row.organisationId || 'No organisation'}</span>
                  </td>
                  <td>{formatDate(type === 'registered' ? row.registeredAt : row.lastActivityAt)}</td>
                  <td>
                    <strong>{formatMoney(row.revenue)}</strong>
                    {row.revenueMissing ? <span className="missing">Missing revenue</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">{empty}</p>
        )}
      </div>
    </section>
  )
}

function QueuePanel({ empty, rows = [], title }) {
  return (
    <section className="data-panel">
      <div className="panel-title">
        <h2>{title}</h2>
        <span>{formatCount(rows.length)}</span>
      </div>
      <div className="queue-list">
        {rows.length ? (
          rows.slice(0, 20).map((row) => (
            <article className={`queue-item ${row.priority || 'medium'}`} key={`${row.type}-${row.id}`}>
              <div>
                <strong>{row.title || row.reference || row.id}</strong>
                <span>{row.suggestedAction || row.status || row.stage || 'Review item'}</span>
              </div>
              <div>
                <b>{row.priority || 'normal'}</b>
                <span>{formatDateTime(row.lastActivityAt)}</span>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state">{empty}</p>
        )}
      </div>
    </section>
  )
}

function AdminWorkspaceView({ snapshot, type }) {
  const drilldowns = getDashboardDrilldowns(snapshot, EMPTY_SUPPORT)

  if (type === 'organisations') {
    return (
      <div className="view-stack">
        <DrilldownPanel config={drilldowns.activeOrganisations} />
      </div>
    )
  }

  if (type === 'users') {
    return (
      <div className="view-stack">
        <DrilldownPanel config={drilldowns.activeAgents} />
      </div>
    )
  }

  if (type === 'transactions') {
    return (
      <div className="view-stack">
        <section className="two-column">
          <DataPanel
            empty="No seller/buyer signed pipeline items yet."
            rows={snapshot?.pipeline || []}
            title="Signed Pipeline"
            type="pipeline"
          />
          <DataPanel
            empty="No registrations in this range."
            rows={snapshot?.registered || []}
            title="Registered"
            type="registered"
          />
        </section>
        <QueuePanel empty="No stalled transactions in the current data contract." rows={snapshot?.attention || []} title="Stalled Transactions" />
      </div>
    )
  }

  if (type === 'reports') {
    return (
      <div className="view-stack">
        <section className="dashboard-overview">
          <RevenuePath snapshot={snapshot} />
          <DataPanel
            empty="No registrations in this range."
            meta={`${formatCount(snapshot?.kpis?.registeredThisMonth || 0)} registered`}
            rows={snapshot?.registered || []}
            title="Registered Revenue"
            type="registered"
          />
        </section>
        {(snapshot?.warnings || []).length ? <WarningsPanel warnings={snapshot.warnings} /> : null}
      </div>
    )
  }

  return null
}

function SearchView() {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [warnings, setWarnings] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setIsSearching(true)
    const next = await searchAdminData(term)
    setResults(next.results)
    setWarnings(next.warnings)
    setIsSearching(false)
  }

  return (
    <div className="view-stack">
      <form className="search-panel" onSubmit={submit}>
        <Search size={20} />
        <input
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search by name, email, organisation, reference..."
          value={term}
        />
        <button className="primary-button compact" disabled={!term || isSearching} type="submit">
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {warnings.length ? <WarningsPanel warnings={warnings} /> : null}

      <section className="data-panel">
        <div className="panel-title">
          <h2>Results</h2>
          <span>{formatCount(results.length)}</span>
        </div>
        <div className="queue-list">
          {results.length ? (
            results.map((result) => (
              <article className="queue-item" key={`${result.label}-${result.id}`}>
                <div>
                  <strong>{result.title}</strong>
                  <span>{result.meta || result.id}</span>
                </div>
                <div>
                  <b>{result.label}</b>
                  <span>{formatDateTime(result.time)}</span>
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">Search results will appear here.</p>
          )}
        </div>
      </section>
    </div>
  )
}

function SettingsView({ access, profile }) {
  const configStatus = getSupabaseConfigStatus()
  const rows = [
    ['Access level', formatAdminLevelLabel(access.level)],
    ['Resolved roles', access.roles.join(', ') || 'No roles'],
    ['User email', profile?.email || 'Unknown'],
    ['Supabase config', configStatus.message],
    ['Dashboard RPC', 'arch9_admin_dashboard_snapshot'],
    ['Support RPC', 'arch9_admin_support_snapshot'],
  ]

  return (
    <section className="data-panel settings-panel">
      <div className="panel-title">
        <h2>Console Settings</h2>
        <span>{configStatus.ok ? 'Connected' : 'Needs config'}</span>
      </div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function UnauthorizedScreen({ onSignOut, roles }) {
  return (
    <main className="center-shell">
      <section className="message-panel">
        <AlertTriangle size={24} />
        <h1>No admin access</h1>
        <p>Your account signed in, but it does not resolve to an Arch9 admin or support role.</p>
        <small>{roles.length ? `Resolved roles: ${roles.join(', ')}` : 'No roles were resolved.'}</small>
        <button className="secondary-button" onClick={onSignOut} type="button">
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </section>
    </main>
  )
}

export default function App() {
  const [access, setAccess] = useState({ allowed: false, level: '', roles: [] })
  const [authError, setAuthError] = useState('')
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD)
  const [profile, setProfile] = useState(null)
  const [rangeId, setRangeId] = useState('30d')
  const [session, setSession] = useState(null)
  const [support, setSupport] = useState(EMPTY_SUPPORT)
  const [isBooting, setIsBooting] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [pathname, setPathname] = useState(() => (typeof window === 'undefined' ? '/admin' : window.location.pathname))

  const allowedViews = useMemo(
    () => getAllowedAdminViews(access.level),
    [access.level],
  )

  async function refreshData(nextRange = rangeId) {
    if (!session?.user || !access.allowed) return
    setIsLoading(true)
    const [dashboardResult, supportResult] = await Promise.all([
      loadDashboardSnapshot(nextRange),
      loadSupportSnapshot(nextRange),
    ])

    setDashboard({
      ...EMPTY_DASHBOARD,
      ...(dashboardResult.data || {}),
      warnings: [
        ...((dashboardResult.data || {}).warnings || []),
        ...(dashboardResult.error ? [{ message: dashboardResult.error, type: 'dashboard_rpc' }] : []),
      ],
    })
    setSupport({
      ...EMPTY_SUPPORT,
      ...(supportResult.data || {}),
      warnings: [
        ...((supportResult.data || {}).warnings || []),
        ...(supportResult.error ? [{ message: supportResult.error, type: 'support_rpc' }] : []),
      ],
    })
    setIsLoading(false)
  }

  function navigate(viewId) {
    const nextView = allowedViews.includes(viewId)
      ? viewId
      : resolveAdminViewFromPath({ level: access.level, pathname })
    const nextPath = pathForView(nextView)
    if (typeof window !== 'undefined') {
      window.history.pushState({ adminView: nextView }, '', nextPath)
    }
    setPathname(nextPath)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    function handlePopState() {
      setPathname(window.location.pathname)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    let isMounted = true

    async function boot() {
      if (!supabase) {
        setIsBooting(false)
        return undefined
      }

      const { data } = await supabase.auth.getSession()
      if (isMounted) setSession(data.session || null)

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession)
        setAuthError('')
      })

      setIsBooting(false)
      return () => subscription.unsubscribe()
    }

    const cleanupPromise = boot()
    return () => {
      isMounted = false
      cleanupPromise.then((cleanup) => {
        if (typeof cleanup === 'function') cleanup()
      })
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function resolveAccess() {
      if (!session?.user) {
        setAccess({ allowed: false, level: '', roles: [] })
        setDashboard(EMPTY_DASHBOARD)
        setProfile(null)
        setSupport(EMPTY_SUPPORT)
        return
      }

      const nextProfile = await loadAdminProfile(session.user.id)
      if (cancelled) return

      const nextAccess = resolveAdminAccess({ profile: nextProfile, user: session.user })
      setAccess(nextAccess)
      setProfile(nextProfile || { email: session.user.email })
      if (typeof window !== 'undefined') setPathname(window.location.pathname)
    }

    resolveAccess()
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    refreshData(rangeId)
  }, [access.allowed, rangeId, session])

  useEffect(() => {
    if (typeof window === 'undefined' || !access.allowed) return
    const nextView = resolveAdminViewFromPath({ level: access.level, pathname })
    const nextPath = pathForView(nextView)
    if (window.location.pathname !== nextPath) {
      window.history.replaceState({ adminView: nextView }, '', nextPath)
      setPathname(nextPath)
    }
  }, [access.allowed, access.level, pathname])

  async function handleSignIn({ email, password }) {
    setAuthError('')
    if (!supabase) return
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
  }

  async function handleMagicLink({ email }) {
    setAuthError('')
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    setAuthError(error ? error.message : 'Magic link sent.')
  }

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut()
    setSession(null)
  }

  if (isBooting) {
    return (
      <main className="center-shell">
        <Loader2 className="spin" size={26} />
      </main>
    )
  }

  if (!session) {
    return <LoginScreen authError={authError} onMagicLink={handleMagicLink} onSignIn={handleSignIn} />
  }

  if (!access.allowed) {
    return <UnauthorizedScreen onSignOut={handleSignOut} roles={access.roles} />
  }

  const view = resolveAdminViewFromPath({ level: access.level, pathname })

  return (
    <div className="admin-shell">
      <Sidebar
        access={access}
        activeView={view}
        onNavigate={navigate}
        onSignOut={handleSignOut}
        profile={profile}
      />
      <main className="admin-main">
        <Topbar
          activeView={view}
          generatedAt={dashboard.generatedAt}
          isLoading={isLoading}
          onRefresh={() => refreshData()}
          rangeId={rangeId}
          setRangeId={setRangeId}
        />
        {view === 'dashboard' ? <DashboardView isLoading={isLoading} snapshot={dashboard} support={support} /> : null}
        {['organisations', 'transactions', 'users', 'reports'].includes(view) ? (
          <AdminWorkspaceView snapshot={dashboard} type={view} />
        ) : null}
        {view === 'support' ? <SupportView dashboard={dashboard} snapshot={support} /> : null}
        {view === 'search' ? <SearchView /> : null}
        {view === 'settings' ? <SettingsView access={access} profile={profile} /> : null}
      </main>
    </div>
  )
}
