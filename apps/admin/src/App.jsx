import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  FileText,
  Filter,
  Headphones,
  Home,
  ListChecks,
  Loader2,
  LogOut,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Target,
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

const APP_ENV = import.meta.env || {}
const ARCH9_EXPLORE_URL = APP_ENV.VITE_ARCH9_EXPLORE_URL || '/'
const ARCH9_INTAKE_NOTIFICATION_EMAIL = APP_ENV.VITE_ARCH9_INTAKE_NOTIFICATION_EMAIL || 'alex@arch9.co.za'

const RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'month', label: 'This Month' },
]

const INBOUND_STATUSES = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'demo_booked', label: 'Demo Booked' },
  { id: 'trial_setup', label: 'Trial / Setup' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'live', label: 'Live' },
  { id: 'not_proceeding', label: 'Not Proceeding' },
]

const SOURCE_OPTIONS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'website', label: 'Website' },
  { id: 'qr', label: 'QR' },
  { id: 'email', label: 'Email' },
  { id: 'direct', label: 'Direct' },
  { id: 'manual', label: 'Manual' },
  { id: 'other', label: 'Other' },
]

const ROLE_CONFIGS = {
  developer: {
    label: 'Developer',
    shortLabel: 'Developer',
    icon: Building2,
    intro: 'Manage developments, sales and transactions in one place.',
    organisationLabel: 'Developer / company name',
    positionOptions: ['Director / Owner', 'Development Manager', 'Sales Manager', 'Administrator', 'Other'],
    fields: [
      { id: 'active_developments', label: 'Number of active developments', required: true },
      { id: 'available_units', label: 'Approximate total available units', required: true },
      { id: 'monthly_sales', label: 'Approximate monthly sales', required: true },
      { id: 'bring_development', label: 'Do you currently have a development you would like to bring onto Arch9?', options: ['Yes', 'Not yet', 'I would like to learn more'], required: true },
      { id: 'development_name', label: 'Development name', showWhen: (metrics) => metrics.bring_development === 'Yes' },
    ],
    interests: [
      'Development inventory',
      'Sales team management',
      'Agent management',
      'Reservations',
      'Buyer onboarding',
      'OTPs',
      'Bond applications',
      'Transfer tracking',
      'Buyer communication',
      'Sales reporting',
      'Full development journey',
    ],
  },
  agency: {
    label: 'Estate Agency',
    shortLabel: 'Agency',
    icon: Home,
    intro: 'Connect your agents, listings, buyers and transactions.',
    organisationLabel: 'Agency name',
    positionOptions: ['Principal', 'Director / Owner', 'Manager', 'Agent', 'Administrator', 'Other'],
    fields: [
      { id: 'agent_range', label: 'Approximate number of agents', options: ['1-5', '6-15', '16-30', '31-50', '51-100', '100+'], required: true },
      { id: 'transactions_per_month', label: 'Approximate transactions per month', options: ['0-10', '11-25', '26-50', '51-100', '100+'], required: true },
    ],
    interests: [
      'Lead management',
      'Listings & seller management',
      'Buyer management',
      'Offers & OTPs',
      'Transaction tracking',
      'Bond applications',
      'Attorney communication',
      'Client experience',
      'Reporting & oversight',
      'Everything',
    ],
  },
  bond_originator: {
    label: 'Bond Originator',
    shortLabel: 'Bond Originator',
    icon: CircleDollarSign,
    intro: 'Manage applications and stay connected to every transaction.',
    organisationLabel: 'Company name',
    positionOptions: ['Principal', 'Director / Owner', 'Manager', 'Consultant', 'Administrator', 'Other'],
    fields: [
      { id: 'consultants', label: 'Number of consultants', required: true },
      { id: 'applications_per_month', label: 'Approximate applications per month', required: true },
      { id: 'agency_partners', label: 'Approximate number of estate agencies currently worked with', required: true },
      { id: 'operating_model', label: 'How do you operate?', options: ['Independently', 'Branch', 'National group'], required: true },
    ],
    interests: [
      'Receiving applications from agencies',
      'Application management',
      'Bank submissions',
      'Quotes & grants',
      'Document collection',
      'Referral partner management',
      'Reconciliation / incentives',
      'Transaction tracking',
      'Reporting',
      'Full Arch9 bond workspace',
    ],
  },
  attorney: {
    label: 'Attorney',
    shortLabel: 'Attorney',
    icon: ShieldCheck,
    intro: 'Manage matters and collaborate with every role player.',
    organisationLabel: 'Firm name',
    positionOptions: ['Director / Partner', 'Conveyancer', 'Practice Manager', 'Attorney', 'Administrator', 'Other'],
    fields: [
      { id: 'branches', label: 'Number of branches', required: true },
      { id: 'conveyancing_staff', label: 'Approximate number of conveyancing staff', required: true },
      { id: 'matters_per_month', label: 'Approximate property matters per month', required: true },
    ],
    serviceOptions: ['Property transfers', 'Bond registrations', 'Bond cancellations', 'Developments', 'Correspondent work', 'Other'],
    interests: [
      'Receiving instructions digitally',
      'Matter management',
      'Document management',
      'Client communication',
      'Agent communication',
      'Milestone tracking',
      'Reporting',
      'Partner / referral network',
      'Full Arch9 attorney workspace',
    ],
  },
}

const INTAKE_ROLE_ORDER = ['agency', 'developer', 'bond_originator', 'attorney']

const ROLE_LANDING_DETAILS = {
  agency: {
    copy: 'Connect agents, listings, buyers and transactions.',
    tag: 'Estate agencies',
  },
  developer: {
    copy: 'Manage sales, reservations and buyer progress.',
    tag: 'New developments',
  },
  bond_originator: {
    copy: 'Track applications, documents and milestones.',
    tag: 'Finance teams',
  },
  attorney: {
    copy: 'Receive cleaner instructions and keep matters moving.',
    tag: 'Transfer teams',
  },
}

const NAV_ICONS = {
  dashboard: Home,
  inboundLeads: Target,
  organisations: Building2,
  reports: BarChart3,
  transactions: FileText,
  users: UsersRound,
  support: Headphones,
  search: Search,
  settings: Settings,
}

const ARCH9_LISTING_PIPELINE_FEE = 1500

const MOCK_ORGANISATION_NAMES = new Set([
  'alex_bond',
  'alexagency',
  'bond_runtime_personal_originator',
  'bond_runtime_test_company',
  'bridge9_realty',
  'canonical_qa_attorney_firm',
  'dalawyer_lawyers',
  'meyer_partners_conveyancers',
  'northside_bond_attorneys',
])

const ACTIVE_ADMIN_STATUSES = new Set([
  'accepted',
  'active',
  'approved',
  'enabled',
  'joined',
  'live',
])

const INACTIVE_ADMIN_STATUSES = new Set([
  'archived',
  'cancelled',
  'canceled',
  'deleted',
  'disabled',
  'false',
  'inactive',
  'invited',
  'pending',
  'removed',
  'suspended',
])

const AGENT_MODULE_ROLE_TOKENS = new Set([
  'admin',
  'agency',
  'agent',
  'broker',
  'commercial_broker',
  'consultant',
  'estate_agent',
  'manager',
  'member',
  'principal',
  'property_practitioner',
  'real_estate',
  'realtor',
])

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

const EMPTY_INBOUND = {
  activities: [],
  generatedAt: '',
  leads: [],
  owners: [],
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

function normalizeToken(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
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

function normalizeAdminIdentity(value = '') {
  return normalizeDashboardToken(String(value || '').replace(/&/g, 'and').replace(/[^a-zA-Z0-9]+/g, ' '))
    .replace(/(^|_)and(_|$)/g, '_')
    .replace(/^_+|_+$/g, '')
}

function collectDashboardTokens(row = {}, keys = []) {
  return keys.map((key) => normalizeDashboardToken(row?.[key])).filter(Boolean).join(' ')
}

function dashboardTokenSet(row = {}, keys = []) {
  return new Set(keys.map((key) => normalizeDashboardToken(row?.[key])).filter(Boolean))
}

function hasAnyDashboardToken(row = {}, keys = [], acceptedTokens = []) {
  const tokens = dashboardTokenSet(row, keys)
  return acceptedTokens.some((token) => tokens.has(token))
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

function getAdminOrganisationId(row = {}) {
  return firstDashboardValue(row, ['organisationId', 'organisation_id', 'organizationId', 'organization_id', 'agencyId', 'agency_id', 'companyId', 'company_id'])
}

function getAdminOrganisationName(row = {}) {
  return firstDashboardValue(row, [
    'name',
    'tradingName',
    'trading_name',
    'displayName',
    'display_name',
    'organisationName',
    'organisation_name',
    'organizationName',
    'organization_name',
    'companyName',
    'company_name',
  ])
}

function isMockAdminOrganisation(row = {}) {
  const names = [
    getAdminOrganisationName(row),
    row?.name,
    row?.tradingName,
    row?.trading_name,
    row?.organisationName,
    row?.organisation_name,
    row?.organizationName,
    row?.organization_name,
    row?.companyName,
    row?.company_name,
  ].map(normalizeAdminIdentity).filter(Boolean)

  return names.some((name) => MOCK_ORGANISATION_NAMES.has(name))
}

function isAdminTestEmail(value = '') {
  const email = normalizeText(value).toLowerCase()
  return Boolean(email && (email.endsWith('.test') || email.includes('enterprise-pentest-')))
}

function isAdminTestPerson(row = {}) {
  const email = firstDashboardValue(row, ['email', 'email_address', 'userEmail', 'user_email'])
  if (isAdminTestEmail(email)) return true
  const name = normalizeAdminIdentity(firstDashboardValue(row, ['full_name', 'fullName', 'name', 'display_name', 'displayName']))
  return name.includes('enterprise_pentest') || name.includes('canonical_qa')
}

function isActiveAdminStatus(value = '', fallback = 'active') {
  const status = normalizeDashboardToken(value || fallback)
  if (INACTIVE_ADMIN_STATUSES.has(status)) return false
  if (ACTIVE_ADMIN_STATUSES.has(status)) return true
  return !isInactiveDashboardStatus(status)
}

function adminRoleMatchesAgentModule(row = {}) {
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
  ]).split('_').filter(Boolean)

  return tokens.some((token) => AGENT_MODULE_ROLE_TOKENS.has(token)) ||
    /(^|_)(agent|agency|principal|broker|consultant|manager|admin|member|property_practitioner|estate_agent|realtor|real_estate)(_|$)/.test(
      collectDashboardTokens(row, [
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
      ]),
    )
}

function isAgentModulePerson(row = {}) {
  const status = firstDashboardValue(row, ['status', 'membership_status', 'profile_status', 'is_active'], 'active')
  if (!isActiveAdminStatus(status)) return false
  if (isAdminTestPerson(row)) return false
  return adminRoleMatchesAgentModule(row)
}

function isActiveListingRow(row = {}) {
  const listingStatusKeys = [
    'listing_status',
    'status',
    'publication_status',
    'marketing_status',
    'listing_visibility',
    'bridge_listing_status',
    'property24_status',
    'private_property_status',
    'mandate_status',
    'listing_source',
    'stock_source',
  ]
  const tokens = collectDashboardTokens(row, listingStatusKeys)
  const isFlaggedActive = ['is_active', 'active'].some((key) => {
    const value = normalizeDashboardToken(row?.[key])
    return ['true', 't', 'yes', 'y', '1', 'active', 'live', 'published'].includes(value)
  })
  const hasActiveSignal =
    isFlaggedActive ||
    hasAnyDashboardToken(row, listingStatusKeys, [
      'mandate_signed',
      'listing_active',
      'active_market',
      'under_offer',
      'transaction_created',
      'published',
      'live',
      'active',
      'signed_external_pending_upload',
      'signed_uploaded',
      'uploaded_signed',
      'current_listing',
      'current_listing_import',
      'bulk_current_listing',
      'imported_current_listing',
      'imported_existing_listing',
    ])
  const hasTerminalSignal = /(^|_)(inactive|archived|withdrawn|deleted|disabled|registered|sold|sold_archived)(_|$)/.test(tokens)

  return hasActiveSignal && !hasTerminalSignal
}

function isActiveDevelopmentRow(row = {}) {
  const status = firstDashboardValue(row, ['status', 'development_status', 'is_active'], 'active')
  const normalized = normalizeDashboardToken(status)
  if (/(^|_)(inactive|archived|withdrawn|deleted|disabled|cancelled|canceled|complete|completed|sold_out)(_|$)/.test(normalized)) return false
  return isActiveAdminStatus(status)
}

function isActiveUnitListingRow(row = {}) {
  const tokens = collectDashboardTokens(row, [
    'status',
    'unit_status',
    'sales_status',
    'availability_status',
    'listing_status',
    'publication_status',
    'marketing_status',
  ])
  const hasTerminalSignal = /(^|_)(sold|registered|transferred|archived|withdrawn|deleted|disabled|unavailable|cancelled|canceled)(_|$)/.test(tokens)
  if (hasTerminalSignal) return false

  const hasActiveSignal =
    !tokens ||
    /(available|active|live|listed|published|launched|reserved|under_offer|pending_sale|sale_pending|in_progress)/.test(tokens)

  return hasActiveSignal
}

function mapDirectAgent(row = {}, fallbackRole = 'agent_module') {
  const id = firstDashboardValue(row, ['user_id', 'profile_id', 'id', 'email'])
  const fullName = firstDashboardValue(row, ['full_name', 'fullName', 'name', 'display_name', 'displayName'])
  const memberName = [row?.first_name || row?.firstName, row?.last_name || row?.lastName].map(normalizeText).filter(Boolean).join(' ')
  return {
    id,
    name: fullName || memberName || firstDashboardValue(row, ['email'], 'Agent module user'),
    email: firstDashboardValue(row, ['email', 'email_address']),
    phone: firstDashboardValue(row, ['phone', 'mobile', 'cellphone']),
    role: firstDashboardValue(row, ['workspace_role', 'organisation_role', 'organization_role', 'role', 'commercial_role'], fallbackRole),
    status: firstDashboardValue(row, ['status', 'membership_status', 'profile_status'], 'active'),
    organisationId: getAdminOrganisationId(row),
    createdAt: firstDashboardValue(row, ['created_at', 'inserted_at']),
    updatedAt: firstDashboardValue(row, ['last_active_at', 'updated_at', 'created_at']),
  }
}

function mapDirectListing(row = {}) {
  return {
    id: firstDashboardValue(row, ['id', 'listing_id', 'reference']),
    unitId: firstDashboardValue(row, ['unit_id', 'unitId']),
    reference: firstDashboardValue(row, ['reference', 'listing_reference', 'code', 'id'], 'Listing'),
    title: firstDashboardValue(row, ['title', 'property_title', 'name', 'reference'], 'Listing'),
    location: firstDashboardValue(row, ['location', 'suburb', 'city', 'area']),
    address: firstDashboardValue(row, ['address', 'property_address', 'address_line_1']),
    status: firstDashboardValue(row, ['listing_status', 'status', 'bridge_listing_status'], 'active'),
    organisationId: getAdminOrganisationId(row),
    agentId: firstDashboardValue(row, ['assigned_agent_id', 'agent_id', 'assigned_user_id', 'owner_user_id']),
    price: Number(firstDashboardValue(row, ['price', 'asking_price', 'listing_price', 'purchase_price'], 0)) || 0,
    createdAt: firstDashboardValue(row, ['created_at', 'inserted_at']),
    updatedAt: firstDashboardValue(row, ['updated_at', 'last_activity_at', 'created_at']),
  }
}

function mapUnitAsListing(row = {}, development = {}) {
  const unitNumber = firstDashboardValue(row, ['unit_number', 'unitNumber', 'unit_label', 'unitLabel'])
  const developmentName = getAdminOrganisationName(development) || firstDashboardValue(development, ['developmentName', 'development_name'])
  const title = [developmentName, unitNumber ? `Unit ${unitNumber}` : 'Unit'].filter(Boolean).join(' - ')

  return {
    id: firstDashboardValue(row, ['id']),
    unitId: firstDashboardValue(row, ['id', 'unit_id', 'unitId']),
    reference: unitNumber || firstDashboardValue(row, ['reference', 'code', 'id'], 'Unit'),
    title,
    location: firstDashboardValue(development, ['location', 'suburb', 'city', 'area']),
    address: firstDashboardValue(development, ['address', 'property_address', 'address_line_1']),
    status: firstDashboardValue(row, ['status', 'unit_status', 'sales_status', 'availability_status'], 'available'),
    organisationId: getAdminOrganisationId(row) || getAdminOrganisationId(development),
    agentId: firstDashboardValue(row, ['assigned_agent_id', 'agent_id', 'assigned_user_id', 'owner_user_id']),
    price: Number(firstDashboardValue(row, ['current_price', 'currentPrice', 'list_price', 'listPrice', 'price'], 0)) || 0,
    createdAt: firstDashboardValue(row, ['created_at', 'inserted_at']),
    updatedAt: firstDashboardValue(row, ['updated_at', 'last_activity_at', 'created_at']),
    source: 'unit',
    developmentId: firstDashboardValue(row, ['development_id', 'developmentId']),
  }
}

function mapDirectOrganisation(row = {}) {
  return {
    id: firstDashboardValue(row, ['id', 'organisation_id', 'organization_id']),
    name: getAdminOrganisationName(row) || 'Organisation',
    tradingName: firstDashboardValue(row, ['trading_name', 'tradingName', 'display_name', 'displayName']),
    status: firstDashboardValue(row, ['status', 'organisation_status', 'organization_status', 'is_active'], 'active'),
    ownerId: firstDashboardValue(row, ['owner_id', 'account_owner_id', 'created_by']),
    createdAt: firstDashboardValue(row, ['created_at', 'inserted_at']),
    updatedAt: firstDashboardValue(row, ['updated_at', 'last_activity_at', 'created_at']),
  }
}

function isActiveOrganisationRow(row = {}) {
  return !isMockAdminOrganisation(row) && isActiveAdminStatus(firstDashboardValue(row, ['status', 'organisation_status', 'organization_status', 'is_active'], 'active'))
}

function getProfileKey(row = {}) {
  return firstDashboardValue(row, ['id', 'user_id', 'profile_id', 'email']).toLowerCase()
}

function mergeAgentRows(membership = {}, profile = {}) {
  return {
    ...profile,
    ...membership,
    full_name: firstDashboardValue(profile, ['full_name', 'fullName', 'name', 'display_name', 'displayName']),
    email: firstDashboardValue(membership, ['email', 'email_address'], firstDashboardValue(profile, ['email', 'email_address'])),
    phone: firstDashboardValue(membership, ['phone', 'mobile', 'cellphone'], firstDashboardValue(profile, ['phone', 'mobile', 'cellphone'])),
  }
}

function isTerminalTransactionRow(row = {}) {
  const tokens = collectDashboardTokens(row, ['status', 'workflow_status', 'lifecycle_state', 'matter_status', 'stage', 'transaction_stage', 'matter_stage'])
  return /(^|_)(cancelled|canceled|closed|complete|completed|lost|deleted|archived|registered)(_|$)/.test(tokens)
}

function isActiveTransactionRow(row = {}) {
  return !isTerminalTransactionRow(row)
}

function mapDirectTransaction(row = {}) {
  const status = collectDashboardTokens(row, ['status', 'workflow_status', 'lifecycle_state', 'matter_status'])
  const stage = collectDashboardTokens(row, ['stage', 'transaction_stage', 'matter_stage', 'onboarding_status', 'current_stage', 'current_main_stage', 'stage_key'])
  return {
    id: firstDashboardValue(row, ['id']),
    reference: firstDashboardValue(row, ['reference', 'matter_number', 'transaction_reference', 'id'], 'Transaction'),
    organisationId: getAdminOrganisationId(row),
    agentId: firstDashboardValue(row, ['assigned_agent_id', 'agent_id', 'assigned_user_id', 'owner_user_id']),
    buyer: firstDashboardValue(row, ['buyer_name', 'buyer_full_name', 'buyer']),
    seller: firstDashboardValue(row, ['seller_name', 'seller_full_name', 'seller']),
    stage: stage || status || 'active',
    status: status || 'active',
    revenue: Number(firstDashboardValue(row, ['arch9_revenue_amount', 'platform_fee_amount', 'platform_fee', 'transaction_fee', 'fee_amount', 'revenue_amount'], 0)) || 0,
    revenueMissing: !['arch9_revenue_amount', 'platform_fee_amount', 'platform_fee', 'transaction_fee', 'fee_amount', 'revenue_amount'].some((key) => normalizeText(row?.[key])),
    lastActivityAt: firstDashboardValue(row, ['last_activity_at', 'updated_at', 'created_at']),
  }
}

function sanitizeDashboardRows(rows = [], mockOrganisationIds = new Set()) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const organisationId = getAdminOrganisationId(row)
    if (organisationId && mockOrganisationIds.has(organisationId)) return false
    if (isAdminTestPerson(row)) return false
    return true
  })
}

function sanitizeAdminDashboardSnapshot(snapshot = EMPTY_DASHBOARD) {
  const drilldowns = snapshot?.drilldowns || {}
  const sourceOrganisations = drilldowns.activeOrganisations || []
  const sourceAgents = drilldowns.activeAgents || []
  const sourceListings = drilldowns.activeListings || []
  const sourceActiveTransactions = snapshot?.activeTransactions || drilldowns.activeTransactions || []
  const sourcePipeline = snapshot?.pipeline || []
  const sourceRegistered = snapshot?.registered || []
  const sourceAttention = snapshot?.attention || []
  const activeOrganisations = sourceOrganisations.filter(isActiveOrganisationRow)
  const mockOrganisationIds = new Set(
    sourceOrganisations
      .filter(isMockAdminOrganisation)
      .map((row) => firstDashboardValue(row, ['id', 'organisationId', 'organisation_id']))
      .filter(Boolean),
  )
  const activeAgents = sanitizeDashboardRows(sourceAgents, mockOrganisationIds)
  const activeListings = sanitizeDashboardRows(sourceListings, mockOrganisationIds)
  const activeTransactions = sanitizeDashboardRows(sourceActiveTransactions, mockOrganisationIds)
  const pipeline = sanitizeDashboardRows(sourcePipeline, mockOrganisationIds)
  const registered = sanitizeDashboardRows(sourceRegistered, mockOrganisationIds)
  const attention = sanitizeDashboardRows(sourceAttention, mockOrganisationIds)
  const filteredCount = (sourceRows, filteredRows, fallback) => {
    const fallbackCount = Number(fallback) || 0
    if (!sourceRows.length) return fallbackCount
    return Math.max(filteredRows.length, fallbackCount)
  }

  return {
    ...snapshot,
    activeTransactions,
    attention,
    drilldowns: {
      ...drilldowns,
      activeAgents,
      activeListings,
      activeOrganisations,
      activeTransactions,
    },
    kpis: {
      ...(snapshot?.kpis || {}),
      activeAgents: filteredCount(sourceAgents, activeAgents, snapshot?.kpis?.activeAgents),
      activeListings: filteredCount(sourceListings, activeListings, snapshot?.kpis?.activeListings),
      activeOrganisations: filteredCount(sourceOrganisations, activeOrganisations, snapshot?.kpis?.activeOrganisations),
      activeTransactions: filteredCount(sourceActiveTransactions, activeTransactions, snapshot?.kpis?.activeTransactions),
      sellerSignedBuyerSigned: filteredCount(sourcePipeline, pipeline, snapshot?.kpis?.sellerSignedBuyerSigned),
      registeredThisMonth: filteredCount(sourceRegistered, registered, snapshot?.kpis?.registeredThisMonth),
      stalledTransactions: filteredCount(sourceAttention, attention, snapshot?.kpis?.stalledTransactions),
    },
    pipeline,
    registered,
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
  const [organisationsResult, profilesResult, orgUsersResult, listingsResult, transactionsResult, developmentsResult, unitsResult] = await Promise.all([
    fetchAdminRows('organisations'),
    fetchAdminRows('profiles'),
    fetchAdminRows('organisation_users'),
    fetchAdminRows('private_listings'),
    fetchAdminRows('transactions'),
    fetchAdminRows('developments'),
    fetchAdminRows('units'),
  ])

  const profileById = new Map()
  const profileByEmail = new Map()
  for (const profile of profilesResult.rows) {
    const profileId = getProfileKey(profile)
    const email = normalizeText(profile?.email || profile?.email_address).toLowerCase()
    if (profileId) profileById.set(profileId, profile)
    if (email) profileByEmail.set(email, profile)
  }

  const activeOrganisations = organisationsResult.rows
    .filter(isActiveOrganisationRow)
    .map(mapDirectOrganisation)
  const mockOrganisationIds = new Set(
    organisationsResult.rows
      .filter(isMockAdminOrganisation)
      .map((row) => firstDashboardValue(row, ['id', 'organisation_id', 'organization_id']))
      .filter(Boolean),
  )
  const developmentById = new Map()
  for (const development of developmentsResult.rows) {
    const developmentId = firstDashboardValue(development, ['id', 'development_id', 'developmentId'])
    if (developmentId) developmentById.set(developmentId, development)
  }

  const agentMap = new Map()
  for (const membership of orgUsersResult.rows) {
    const organisationId = getAdminOrganisationId(membership)
    if (organisationId && mockOrganisationIds.has(organisationId)) continue
    const profile = profileById.get(firstDashboardValue(membership, ['user_id', 'profile_id']).toLowerCase()) ||
      profileByEmail.get(normalizeText(membership?.email || membership?.email_address).toLowerCase()) ||
      {}
    const row = mergeAgentRows(membership, profile)
    if (!isAgentModulePerson(row)) continue
    const agent = mapDirectAgent(row)
    if (agent.id && !agentMap.has(agent.id)) agentMap.set(agent.id, agent)
  }

  for (const profile of profilesResult.rows) {
    const organisationId = getAdminOrganisationId(profile)
    if (organisationId && mockOrganisationIds.has(organisationId)) continue
    if (!isAgentModulePerson(profile)) continue
    const agent = mapDirectAgent(profile)
    if (agent.id && !agentMap.has(agent.id)) agentMap.set(agent.id, agent)
  }

  const privateListingRows = listingsResult.rows
    .filter((row) => {
      const organisationId = getAdminOrganisationId(row)
      return (!organisationId || !mockOrganisationIds.has(organisationId)) && isActiveListingRow(row)
    })
    .map(mapDirectListing)
  const listedUnitIds = new Set(
    privateListingRows
      .map((listing) => listing.unitId)
      .filter(Boolean),
  )
  const unitListingRows = unitsResult.rows
    .filter((row) => {
      const developmentId = firstDashboardValue(row, ['development_id', 'developmentId'])
      const development = developmentById.get(developmentId) || {}
      const organisationId = getAdminOrganisationId(row) || getAdminOrganisationId(development)
      const unitId = firstDashboardValue(row, ['id', 'unit_id', 'unitId'])
      if (unitId && listedUnitIds.has(unitId)) return false
      if (organisationId && mockOrganisationIds.has(organisationId)) return false
      if (developmentId && developmentById.has(developmentId) && !isActiveDevelopmentRow(development)) return false
      return isActiveUnitListingRow(row)
    })
    .map((row) => mapUnitAsListing(row, developmentById.get(firstDashboardValue(row, ['development_id', 'developmentId'])) || {}))
  const activeListings = [...privateListingRows, ...unitListingRows]
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

  const activeTransactions = transactionsResult.rows
    .filter((row) => {
      const organisationId = getAdminOrganisationId(row)
      return (!organisationId || !mockOrganisationIds.has(organisationId)) && isActiveTransactionRow(row)
    })
    .map(mapDirectTransaction)
  const directAgents = Array.from(agentMap.values())
  const warnings = [
    organisationsResult.warning,
    profilesResult.warning,
    orgUsersResult.warning,
    listingsResult.warning,
    transactionsResult.warning,
    developmentsResult.warning,
    unitsResult.warning,
  ]
    .filter(Boolean)
    .map((message) => ({ message, type: 'admin_direct_data' }))

  return sanitizeAdminDashboardSnapshot({
    ...snapshot,
    activeTransactions: activeTransactions.length ? activeTransactions : snapshot?.activeTransactions || [],
    drilldowns: {
      ...(snapshot?.drilldowns || {}),
      activeOrganisations: (snapshot?.drilldowns?.activeOrganisations || []).length ? snapshot.drilldowns.activeOrganisations : activeOrganisations,
      activeAgents: (snapshot?.drilldowns?.activeAgents || []).length ? snapshot.drilldowns.activeAgents : directAgents,
      activeListings: (snapshot?.drilldowns?.activeListings || []).length ? snapshot.drilldowns.activeListings : activeListings,
      activeTransactions: (snapshot?.drilldowns?.activeTransactions || []).length ? snapshot.drilldowns.activeTransactions : activeTransactions,
    },
    kpis: {
      ...(snapshot?.kpis || {}),
      activeOrganisations: Number(snapshot?.kpis?.activeOrganisations) || activeOrganisations.length || 0,
      activeAgents: Number(snapshot?.kpis?.activeAgents) || directAgents.length || 0,
      activeListings: Number(snapshot?.kpis?.activeListings) || activeListings.length || 0,
      activeTransactions: Number(snapshot?.kpis?.activeTransactions) || activeTransactions.length || 0,
    },
    warnings: [...(snapshot?.warnings || []), ...warnings],
  })
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

function getRoleConfig(roleType = '') {
  return ROLE_CONFIGS[roleType] || ROLE_CONFIGS.agency
}

function formatRoleType(roleType = '') {
  return getRoleConfig(roleType).shortLabel
}

function formatInboundStatus(status = '') {
  return INBOUND_STATUSES.find((item) => item.id === status)?.label || normalizeStageLabel(status)
}

function formatSource(source = '') {
  return SOURCE_OPTIONS.find((item) => item.id === source)?.label || normalizeStageLabel(source)
}

function normalizeInboundLead(row = {}) {
  const businessMetrics = row.business_metrics || row.businessMetrics || {}
  const selectedInterests = row.selected_interests || row.selectedInterests || []
  return {
    ...row,
    businessMetrics,
    fullName: [row.first_name || row.firstName, row.last_name || row.lastName].filter(Boolean).join(' '),
    id: row.id,
    organisationName: row.organisation_name || row.organisationName || '',
    ownerId: row.owner_id || row.ownerId || '',
    ownerLabel: row.owner_name || row.owner_email || '',
    roleType: row.role_type || row.roleType || 'agency',
    selectedInterests,
    services: row.services || [],
    source: row.source || 'other',
    status: row.status || 'new',
    utmCampaign: row.utm_campaign || row.utmCampaign || '',
    utmContent: row.utm_content || row.utmContent || '',
    utmMedium: row.utm_medium || row.utmMedium || '',
    utmSource: row.utm_source || row.utmSource || '',
  }
}

function inferSourceFromLocation() {
  if (typeof window === 'undefined') return {}
  const url = new URL(window.location.href)
  const params = url.searchParams
  return {
    landing_url: window.location.href,
    referrer: document.referrer || '',
    source: params.get('source') || '',
    utm_campaign: params.get('utm_campaign') || '',
    utm_content: params.get('utm_content') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_source: params.get('utm_source') || '',
  }
}

function buildIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `join:${crypto.randomUUID()}`
  return `join:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

function isValidEmail(value = '') {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || '').trim())
}

function isValidSaMobile(value = '') {
  const digits = String(value || '').replace(/\D+/g, '')
  if (!digits) return false
  const normalized = digits.startsWith('27') ? `0${digits.slice(2)}` : digits.length === 9 ? `0${digits}` : digits
  return /^0[6-8][0-9]{8}$/.test(normalized)
}

function getLeadScaleLines(lead = {}) {
  const metrics = lead.businessMetrics || {}
  if (lead.roleType === 'developer') {
    return compactList([
      metrics.active_developments ? `${metrics.active_developments} developments` : '',
      metrics.available_units ? `${metrics.available_units} available units` : '',
      metrics.monthly_sales ? `${metrics.monthly_sales} sales / month` : '',
    ]).slice(0, 2)
  }
  if (lead.roleType === 'bond_originator') {
    return compactList([
      metrics.consultants ? `${metrics.consultants} consultants` : '',
      metrics.applications_per_month ? `${metrics.applications_per_month} applications / month` : '',
      metrics.agency_partners ? `${metrics.agency_partners} agency partners` : '',
    ]).slice(0, 2)
  }
  if (lead.roleType === 'attorney') {
    return compactList([
      metrics.conveyancing_staff ? `${metrics.conveyancing_staff} staff` : '',
      metrics.matters_per_month ? `${metrics.matters_per_month} matters / month` : '',
      metrics.branches ? `${metrics.branches} branches` : '',
    ]).slice(0, 2)
  }
  return compactList([
    metrics.agent_range ? `${metrics.agent_range} agents` : '',
    metrics.transactions_per_month ? `${metrics.transactions_per_month} tx / month` : '',
  ]).slice(0, 2)
}

function buildInboundCsv(leads = []) {
  const headers = ['Lead', 'Role', 'Organisation', 'Email', 'Mobile', 'Source', 'Campaign', 'Status', 'Owner', 'Created']
  const rows = leads.map((lead) => [
    lead.fullName,
    formatRoleType(lead.roleType),
    lead.organisationName,
    lead.email,
    lead.mobile,
    formatSource(lead.source),
    lead.utmCampaign,
    formatInboundStatus(lead.status),
    lead.ownerLabel,
    formatDate(lead.created_at),
  ])
  return [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value || '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
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
  const activeTransactionRows = snapshot?.activeTransactions || drilldowns.activeTransactions || []
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
      empty: 'No seller/buyer signed active transactions yet.',
      meta: `${formatCount(kpis.activeTransactions || activeTransactionRows.length)} open`,
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

async function submitInboundLead(payload = {}, idempotencyKey = buildIdempotencyKey()) {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('submit_arch9_inbound_lead', {
    p_idempotency_key: idempotencyKey,
    p_payload: payload,
  })
  return { data, error: error?.message || '' }
}

function buildInboundLeadAdminUrl() {
  if (typeof window === 'undefined') return 'https://admin.arch9.co.za/admin/inbound-leads'
  return `${window.location.origin}/admin/inbound-leads`
}

async function sendInboundLeadEmails(payload = {}, leadId = '', idempotencyKey = '') {
  if (!supabase?.functions?.invoke) return

  const leadName = [payload.first_name, payload.last_name].filter(Boolean).join(' ')
  const roleLabel = formatRoleType(payload.role_type)
  const organisationName = payload.organisation_name || ''
  const interests = Array.isArray(payload.selected_interests) ? payload.selected_interests : []
  const adminUrl = buildInboundLeadAdminUrl()
  const sourceLabel = formatSource(payload.source || payload.utm_source || 'direct')
  const submittedAt = new Date().toISOString()
  const notificationPayload = {
    type: 'lead_operations_notification',
    eventKind: 'new_enquiry_unassigned_manager',
    to: ARCH9_INTAKE_NOTIFICATION_EMAIL,
    recipientName: 'Alex',
    subject: `New Arch9 intake: ${organisationName || leadName || payload.email}`,
    title: 'New Arch9 Intake',
    message: `${leadName || payload.email} submitted the Arch9 intake form as ${roleLabel || 'a new lead'}.`,
    actionLink: adminUrl,
    leadId,
    leadName,
    leadEmail: payload.email,
    leadPhone: payload.mobile,
    leadSource: sourceLabel,
    leadCategory: roleLabel,
    leadStatus: 'New',
    propertyLabel: organisationName,
    metadata: {
      actionLink: adminUrl,
      interests,
      organisationName,
      source: payload.source,
      submittedAt,
    },
  }
  const acknowledgementPayload = {
    type: 'arch9_intake_acknowledgement',
    to: payload.email,
    replyTo: ARCH9_INTAKE_NOTIFICATION_EMAIL,
    idempotencyKey: idempotencyKey ? `${idempotencyKey}:ack` : undefined,
    leadId,
    firstName: payload.first_name,
    lastName: payload.last_name,
    recipientName: leadName,
    organisationName,
    roleLabel,
    interests,
  }

  const results = await Promise.allSettled([
    supabase.functions.invoke('send-email', { body: notificationPayload }),
    supabase.functions.invoke('send-email', { body: acknowledgementPayload }),
  ])
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn('[intake] email dispatch failed', { index, error: result.reason })
      return
    }
    if (result.value?.error) console.warn('[intake] email dispatch returned error', { index, error: result.value.error })
  })
}

async function loadInboundLeadsSnapshot() {
  if (!supabase) return { data: EMPTY_INBOUND, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_admin_inbound_leads_snapshot')
  return {
    data: {
      ...EMPTY_INBOUND,
      ...(data || {}),
      leads: (data?.leads || []).map(normalizeInboundLead),
    },
    error: error?.message || '',
  }
}

async function updateInboundLead(leadId, patch) {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_admin_update_inbound_lead', {
    p_lead_id: leadId,
    p_patch: patch,
  })
  return { data: data ? normalizeInboundLead(data) : null, error: error?.message || '' }
}

async function addInboundLeadNote(leadId, note) {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_admin_add_inbound_lead_note', {
    p_lead_id: leadId,
    p_note: note,
  })
  return { data: data ? normalizeInboundLead(data) : null, error: error?.message || '' }
}

async function markInboundLeadConverted(leadId) {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_admin_mark_inbound_lead_converted', {
    p_converted_entity_id: null,
    p_lead_id: leadId,
  })
  return { data: data ? normalizeInboundLead(data) : null, error: error?.message || '' }
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

function IntakeProgress({ step }) {
  const labels = ['Choose your role', 'About you', 'Business', 'Interests', 'Confirmation']
  return (
    <div className="intake-progress" aria-label="Intake progress">
      {labels.map((label, index) => (
        <div className={index <= step ? 'active' : ''} key={label}>
          <span>{index + 1}</span>
          <strong>{label}</strong>
        </div>
      ))}
    </div>
  )
}

function IntakeField({ field, metrics, onChange }) {
  if (field.showWhen && !field.showWhen(metrics)) return null
  const value = metrics[field.id] || ''
  return (
    <label className="intake-field">
      <span>{field.label}</span>
      {field.options ? (
        <select onChange={(event) => onChange(field.id, event.target.value)} value={value}>
          <option value="">Select</option>
          {field.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input onChange={(event) => onChange(field.id, event.target.value)} value={value} />
      )}
    </label>
  )
}

function PublicIntakePage() {
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [idempotencyKey] = useState(() => buildIdempotencyKey())
  const [form, setForm] = useState(() => ({
    businessMetrics: {},
    email: '',
    firstName: '',
    lastName: '',
    location: '',
    mobile: '',
    organisationName: '',
    position: '',
    roleType: '',
    selectedInterests: [],
    services: [],
    source: inferSourceFromLocation(),
    website: '',
  }))
  const roleConfig = form.roleType ? getRoleConfig(form.roleType) : null
  const selectedRoleConfig = roleConfig || ROLE_CONFIGS.agency
  const isConfirmation = step === 4
  const canContinue = validateStep()

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function setMetric(key, value) {
    setForm((current) => ({
      ...current,
      businessMetrics: {
        ...current.businessMetrics,
        [key]: value,
      },
    }))
  }

  function toggleArray(key, value) {
    setForm((current) => {
      const values = current[key] || []
      return {
        ...current,
        [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
      }
    })
  }

  function validateStep(targetStep = step) {
    if (targetStep === 0) return Boolean(form.roleType)
    if (targetStep === 1) {
      return (
        normalizeText(form.firstName) &&
        normalizeText(form.lastName) &&
        isValidEmail(form.email) &&
        isValidSaMobile(form.mobile) &&
        normalizeText(form.position)
      )
    }
    if (targetStep === 2) {
      const requiredFields = selectedRoleConfig.fields.filter((field) => field.required && (!field.showWhen || field.showWhen(form.businessMetrics)))
      return (
        normalizeText(form.organisationName) &&
        normalizeText(form.location) &&
        requiredFields.every((field) => normalizeText(form.businessMetrics[field.id]))
      )
    }
    if (targetStep === 3) return form.selectedInterests.length > 0
    return true
  }

  async function continueFlow() {
    setError('')
    if (!validateStep()) {
      setError('Please complete the highlighted step before continuing.')
      return
    }

    if (step < 3) {
      setStep(step + 1)
      return
    }

    setIsSubmitting(true)
    const payload = {
      ...form.source,
      business_metrics: form.businessMetrics,
      email: normalizeText(form.email),
      first_name: normalizeText(form.firstName),
      last_name: normalizeText(form.lastName),
      location: normalizeText(form.location),
      mobile: normalizeText(form.mobile),
      organisation_name: normalizeText(form.organisationName),
      position: normalizeText(form.position),
      role_type: form.roleType,
      selected_interests: form.selectedInterests,
      services: form.services,
      website: normalizeText(form.website),
    }
    const result = await submitInboundLead(payload, idempotencyKey)
    setIsSubmitting(false)
    if (result.error || !result.data?.accepted) {
      setError(result.error || 'We could not send your details right now. Please try again.')
      return
    }
    setStep(4)
    void sendInboundLeadEmails(payload, result.data?.lead_id || '', idempotencyKey)
  }

  return (
    <main className={`public-intake-shell${step === 0 ? ' landing-mode' : ' form-mode'}`}>
      {step === 0 ? (
        <section className="intake-hero">
          <div className="intake-network" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="intake-hero-top">
            <div className="intake-mini-brand" aria-label="Arch9">
              <strong>Arch9</strong>
            </div>
            <p>The property transaction,<br />finally <span>connected.</span></p>
          </div>
          <div className="intake-hero-copy">
            <h1>Welcome to <span>Arch9.</span></h1>
            <i aria-hidden="true" />
            <p>Tell us where you fit in and we'll route you into the right journey.</p>
          </div>
        </section>
      ) : null}

      <section className={`intake-card${step === 0 ? ' role-selection-card' : ''}${isConfirmation ? ' confirmation-card' : ''}`}>
        {!isConfirmation ? (
          <>
            {step > 0 ? (
              <div className="intake-step-meta">
                <span>Step {step + 1} of 5</span>
                <div><b style={{ width: `${((step + 1) / 5) * 100}%` }} /></div>
              </div>
            ) : null}

            {step === 0 ? (
              <div className="intake-stack role-selection-stack">
                <div className="role-card-grid">
                  {INTAKE_ROLE_ORDER.map((roleType) => {
                    const config = ROLE_CONFIGS[roleType]
                    const Icon = config.icon
                    const details = ROLE_LANDING_DETAILS[roleType]
                    const isSelected = form.roleType === roleType
                    return (
                      <button
                        aria-pressed={isSelected}
                        className={isSelected ? 'selected' : ''}
                        key={roleType}
                        onClick={() => {
                          setError('')
                          setForm((current) => ({
                            ...current,
                            businessMetrics: {},
                            position: '',
                            roleType,
                            selectedInterests: [],
                            services: [],
                          }))
                          setStep(1)
                        }}
                        type="button"
                      >
                        <span className="role-icon-badge"><Icon size={24} /></span>
                        <strong>{config.shortLabel}</strong>
                        <span>{details.copy}</span>
                        <em>{details.tag}</em>
                        <ChevronRight className="role-card-arrow" size={20} />
                      </button>
                    )
                  })}
                </div>
                <div className="intake-personality-strip">
                  <span><UsersRound size={24} /></span>
                  <p><strong>You handle the relationship.</strong> We handle the transaction infrastructure.</p>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="intake-stack">
                <div>
                  <h1>Tell us about you.</h1>
                  <p>This helps us configure Arch9 around the way you work.</p>
                </div>
                <div className="intake-field-grid">
                  <label className="intake-field">
                    <span>First name</span>
                    <input autoComplete="given-name" onChange={(event) => setValue('firstName', event.target.value)} value={form.firstName} />
                  </label>
                  <label className="intake-field">
                    <span>Last name</span>
                    <input autoComplete="family-name" onChange={(event) => setValue('lastName', event.target.value)} value={form.lastName} />
                  </label>
                  <label className="intake-field wide">
                    <span>Work email</span>
                    <input autoComplete="email" inputMode="email" onChange={(event) => setValue('email', event.target.value)} value={form.email} />
                  </label>
                  <label className="intake-field wide">
                    <span>Mobile number</span>
                    <input autoComplete="tel" inputMode="tel" onChange={(event) => setValue('mobile', event.target.value)} placeholder="082 123 4567" value={form.mobile} />
                  </label>
                  <label className="intake-field wide">
                    <span>Your role</span>
                    <select onChange={(event) => setValue('position', event.target.value)} value={form.position}>
                      <option value="">Select</option>
                      {selectedRoleConfig.positionOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="intake-stack">
                <div>
                  <h1>Tell us about your business.</h1>
                  <p>Only the essentials for a useful first conversation.</p>
                </div>
                <div className="intake-field-grid">
                  <label className="intake-field wide">
                    <span>{selectedRoleConfig.organisationLabel}</span>
                    <input onChange={(event) => setValue('organisationName', event.target.value)} value={form.organisationName} />
                  </label>
                  <label className="intake-field">
                    <span>Website <small>optional</small></span>
                    <input inputMode="url" onChange={(event) => setValue('website', event.target.value)} value={form.website} />
                  </label>
                  <label className="intake-field">
                    <span>Primary location</span>
                    <input onChange={(event) => setValue('location', event.target.value)} value={form.location} />
                  </label>
                  {selectedRoleConfig.fields.map((field) => (
                    <IntakeField field={field} key={field.id} metrics={form.businessMetrics} onChange={setMetric} />
                  ))}
                </div>
                {selectedRoleConfig.serviceOptions ? (
                  <div className="intake-check-grid">
                    {selectedRoleConfig.serviceOptions.map((service) => (
                      <button className={form.services.includes(service) ? 'selected' : ''} key={service} onClick={() => toggleArray('services', service)} type="button">
                        <CheckCircle2 size={16} />
                        <span>{service}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="intake-stack">
                <div>
                  <h1>What are you most interested in improving?</h1>
                  <p>Select all that apply.</p>
                </div>
                <div className="intake-check-grid two-col">
                  {selectedRoleConfig.interests.map((interest) => (
                    <button className={form.selectedInterests.includes(interest) ? 'selected' : ''} key={interest} onClick={() => toggleArray('selectedInterests', interest)} type="button">
                      <CheckCircle2 size={16} />
                      <span>{interest}</span>
                    </button>
                  ))}
                </div>
                <div className="intake-note">
                  <Target size={16} />
                  <span>This helps us tailor Arch9 to what matters most to you.</span>
                </div>
              </div>
            ) : null}

            {error ? <Notice tone="danger" text={error} /> : null}

            {step > 0 ? (
              <div className="intake-actions">
                <button className="secondary-button" disabled={isSubmitting} onClick={() => setStep(Math.max(0, step - 1))} type="button">
                  Back
                </button>
                <button
                  aria-disabled={!canContinue}
                  className={`primary-button${!canContinue ? ' is-soft-disabled' : ''}`}
                  disabled={isSubmitting}
                  onClick={continueFlow}
                  type="button"
                >
                  <span>{isSubmitting ? 'Sending...' : step === 3 ? 'Submit' : 'Continue'}</span>
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="confirmation-content">
            <div className="intake-mini-brand confirmation-mini-brand" aria-label="Arch9">
              <strong>Arch9</strong>
            </div>
            <h1>You're in.</h1>
            <p>Thanks, {form.firstName || 'there'}.<br />We've got your details.</p>
            <hr />
            <p>We'll take a look and be in touch shortly to get you connected.</p>
            <div className="confirmation-actions">
              <a className="secondary-button" href={ARCH9_EXPLORE_URL}>Explore Arch9 <ChevronRight size={18} /></a>
            </div>
            <div className="confirmation-note">
              <CheckCircle2 size={18} />
              <span>One less form to fill in today.</span>
            </div>
            <div className="confirmation-arc" aria-hidden="true" />
          </div>
        )}
      </section>
    </main>
  )
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
  const isDashboard = activeView === 'dashboard'
  const title =
    activeView === 'support'
      ? 'Support Queue'
      : activeView === 'inboundLeads'
        ? 'Inbound Leads'
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
        : activeView === 'inboundLeads'
          ? 'Manage and convert inbound Arch9 enquiries.'
        : activeView === 'search'
          ? 'Find organisations, users, and transactions.'
          : activeView === 'settings'
            ? 'Access, environment, and data-contract status.'
            : 'Existing admin data, filtered into a focused workspace.'

  return (
    <header className={`topbar${isDashboard ? ' dashboard-topbar' : ''}`}>
      {!isDashboard ? (
        <div>
          <p className="eyebrow">Arch9 Admin</p>
          <h1>{title}</h1>
          <span>{subtitle}</span>
        </div>
      ) : null}
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
  const activeTransactionRows = snapshot?.activeTransactions || snapshot?.drilldowns?.activeTransactions || []
  const listingPipelineRevenue = (Number(kpis.activeListings) || 0) * ARCH9_LISTING_PIPELINE_FEE
  const organisationActivity = useMemo(() => buildOrganisationActivity(snapshot), [snapshot])
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
  const activeTransactionCount = kpis.activeTransactions || activeTransactionRows.length
  const feeContext =
    pipelineCount && kpis.pipelineRevenue
      ? `${formatCount(pipelineCount)} signed transactions`
      : 'Configured fee values from transaction records'

  const metrics = [
    {
      drilldown: 'activeOrganisations',
      icon: Building2,
      label: 'Organisations',
      value: formatCount(kpis.activeOrganisations),
    },
    {
      drilldown: 'activeAgents',
      icon: UserRoundCheck,
      label: 'Agents',
      value: formatCount(kpis.activeAgents),
    },
    {
      drilldown: 'activeListings',
      icon: Home,
      label: 'Active Listings',
      value: formatCount(kpis.activeListings),
    },
    {
      drilldown: 'activeListings',
      icon: CircleDollarSign,
      label: 'Listing Pipeline',
      value: formatMoney(listingPipelineRevenue),
    },
    {
      drilldown: 'activeTransactions',
      icon: ListChecks,
      label: 'Active Transactions',
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

function PipelineSummary({ activeStatus, leads = [], onSelect }) {
  const counts = INBOUND_STATUSES.reduce((totals, status) => {
    totals[status.id] = leads.filter((lead) => lead.status === status.id).length
    return totals
  }, {})

  return (
    <section className="inbound-pipeline-summary" aria-label="Inbound pipeline summary">
      {INBOUND_STATUSES.map((status) => (
        <button
          className={`${activeStatus === status.id ? 'active' : ''} ${status.id === 'not_proceeding' ? 'separated' : ''}`}
          key={status.id}
          onClick={() => onSelect(activeStatus === status.id ? 'all' : status.id)}
          type="button"
        >
          <span>{status.label}</span>
          <strong>{formatCount(counts[status.id] || 0)}</strong>
        </button>
      ))}
    </section>
  )
}

function InboundLeadTable({ leads = [], onSelect, selectedLeadId = '' }) {
  return (
    <section className="data-panel inbound-table-panel">
      <div className="panel-title">
        <h2>Lead Table</h2>
        <span>{formatCount(leads.length)}</span>
      </div>
      <div className="table-shell">
        {leads.length ? (
          <table className="inbound-leads-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Role</th>
                <th>Organisation</th>
                <th>Contact details</th>
                <th>Source</th>
                <th>Size / Volume</th>
                <th>Top interests</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const scale = getLeadScaleLines(lead)
                const interests = lead.selectedInterests || []
                return (
                  <tr
                    className={selectedLeadId === lead.id ? 'selected-row' : ''}
                    key={lead.id}
                    onClick={() => onSelect(lead)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') onSelect(lead)
                    }}
                    tabIndex={0}
                  >
                    <td>
                      <div className="lead-name-cell">
                        <b>{getInitials(lead.fullName)}</b>
                        <span>
                          <strong>{lead.fullName}</strong>
                          <small>{lead.position || 'No position'}</small>
                        </span>
                      </div>
                    </td>
                    <td><span className={`role-pill ${lead.roleType}`}>{formatRoleType(lead.roleType)}</span></td>
                    <td>{lead.organisationName}</td>
                    <td>
                      <strong>{lead.email}</strong>
                      <span>{lead.mobile}</span>
                    </td>
                    <td>{formatSource(lead.source)}</td>
                    <td>{scale.length ? scale.map((item) => <span key={item}>{item}</span>) : 'No scale yet'}</td>
                    <td>
                      {interests.slice(0, 3).map((interest) => <span key={interest}>{interest}</span>)}
                      {interests.length > 3 ? <small>+{interests.length - 3} more</small> : null}
                    </td>
                    <td><span className={`status-badge ${lead.status}`}>{formatInboundStatus(lead.status)}</span></td>
                    <td>{lead.ownerLabel || '-'}</td>
                    <td>{formatDate(lead.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">No inbound leads match the current filters.</p>
        )}
      </div>
    </section>
  )
}

function InboundLeadDetail({ activities = [], lead, onRefresh, owners = [] }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  if (!lead) {
    return (
      <section className="detail-panel inbound-detail-panel">
        <div className="panel-title">
          <h2>Lead Workspace</h2>
          <span>None selected</span>
        </div>
        <p className="empty-state">Select an inbound lead to manage status, owner, notes and activity.</p>
      </section>
    )
  }

  const leadActivities = activities
    .filter((activity) => activity.inbound_lead_id === lead.id || activity.inboundLeadId === lead.id)
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
  const profileRows = [
    ['Name', lead.fullName],
    ['Role', formatRoleType(lead.roleType)],
    ['Position', lead.position || 'Not captured'],
    ['Organisation', lead.organisationName],
    ['Email', lead.email],
    ['Mobile', lead.mobile],
    ['Website', lead.website || 'Not captured'],
    ['Location', lead.location || 'Not captured'],
    ['Source', formatSource(lead.source)],
    ['Campaign', lead.utmCampaign || 'No campaign'],
    ['Created', formatDateTime(lead.created_at)],
  ]
  const acquisitionRows = [
    ['Source', formatSource(lead.source)],
    ['Medium', lead.utmMedium || 'Not captured'],
    ['Campaign', lead.utmCampaign || 'Not captured'],
    ['Content', lead.utmContent || 'Not captured'],
    ['Landing page', lead.landing_url || 'Not captured'],
    ['Referrer', lead.referrer || 'Not captured'],
  ]

  async function savePatch(patch) {
    setError('')
    setIsSaving(true)
    const result = await updateInboundLead(lead.id, patch)
    setIsSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    await onRefresh?.()
  }

  async function submitNote(event) {
    event.preventDefault()
    if (!normalizeText(note)) return
    setError('')
    setIsSaving(true)
    const result = await addInboundLeadNote(lead.id, note)
    setIsSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setNote('')
    await onRefresh?.()
  }

  async function markLive() {
    setError('')
    setIsSaving(true)
    const result = await markInboundLeadConverted(lead.id)
    setIsSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    await onRefresh?.()
  }

  return (
    <section className="detail-panel inbound-detail-panel">
      <div className="panel-title">
        <div>
          <h2>{lead.fullName}</h2>
          <span>{formatRoleType(lead.roleType)}</span>
        </div>
      </div>

      {error ? <Notice tone="danger" text={error} /> : null}

      <div className="lead-workspace-controls">
        <label>
          <span>Owner</span>
          <select disabled={isSaving} onChange={(event) => savePatch({ owner_id: event.target.value || null })} value={lead.ownerId || ''}>
            <option value="">Unassigned</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>{owner.full_name || owner.email}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select disabled={isSaving} onChange={(event) => savePatch({ status: event.target.value })} value={lead.status}>
            {INBOUND_STATUSES.map((status) => (
              <option key={status.id} value={status.id}>{status.label}</option>
            ))}
          </select>
        </label>
        <button className="secondary-button" disabled={isSaving || lead.status === 'live'} onClick={markLive} type="button">
          <CheckCircle2 size={16} />
          <span>Mark Live</span>
        </button>
      </div>

      <div className="lead-detail-section">
        <h3>Overview</h3>
        <dl>
          {profileRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="lead-detail-section">
        <h3>Business Profile</h3>
        <dl>
          {Object.entries(lead.businessMetrics || {}).map(([key, value]) => (
            <div key={key}>
              <dt>{normalizeStageLabel(key)}</dt>
              <dd>{String(value || 'Not captured')}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="lead-detail-section">
        <h3>Interests</h3>
        <div className="chip-list">
          {(lead.selectedInterests || []).map((interest) => <span key={interest}>{interest}</span>)}
          {(lead.services || []).map((service) => <span key={service}>{service}</span>)}
        </div>
      </div>

      <div className="lead-detail-section">
        <h3>Acquisition</h3>
        <dl>
          {acquisitionRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <form className="lead-note-form" onSubmit={submitNote}>
        <label>
          <span>Notes</span>
          <textarea onChange={(event) => setNote(event.target.value)} placeholder="Add a note..." rows={3} value={note} />
        </label>
        <button className="primary-button compact" disabled={isSaving || !normalizeText(note)} type="submit">
          <NotebookPen size={16} />
          <span>Add note</span>
        </button>
      </form>

      <div className="lead-detail-section">
        <h3>Activity</h3>
        <div className="activity-list">
          {leadActivities.length ? leadActivities.map((activity) => (
            <article key={activity.id}>
              <strong>{normalizeStageLabel(activity.event_type || activity.eventType)}</strong>
              <span>{activity.note || 'No note'}</span>
              <small>{formatDateTime(activity.created_at)} {activity.actor_name || activity.actor_email ? `by ${activity.actor_name || activity.actor_email}` : ''}</small>
            </article>
          )) : <p className="empty-state">No activity has been logged yet.</p>}
        </div>
      </div>
    </section>
  )
}

function AddInboundLeadPanel({ onCancel, onCreated }) {
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    mobile: '',
    organisationName: '',
    position: '',
    roleType: 'agency',
  })
  const roleConfig = getRoleConfig(form.roleType)

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!form.firstName || !form.lastName || !isValidEmail(form.email) || !isValidSaMobile(form.mobile) || !form.organisationName) {
      setError('First name, last name, work email, mobile and organisation are required.')
      return
    }
    setIsSubmitting(true)
    const result = await submitInboundLead({
      business_metrics: {},
      email: form.email,
      first_name: form.firstName,
      last_name: form.lastName,
      mobile: form.mobile,
      organisation_name: form.organisationName,
      position: form.position || 'Other',
      role_type: form.roleType,
      selected_interests: [],
      services: [],
      source: 'manual',
      utm_source: 'manual',
    }, `manual:${buildIdempotencyKey()}`)
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    await onCreated?.()
  }

  return (
    <section className="data-panel add-lead-panel">
      <div className="panel-title">
        <h2>Add Lead</h2>
        <button className="icon-button" onClick={onCancel} title="Close" type="button"><X size={16} /></button>
      </div>
      <form className="add-lead-form" onSubmit={submit}>
        <label>
          <span>Role</span>
          <select onChange={(event) => setValue('roleType', event.target.value)} value={form.roleType}>
            {Object.entries(ROLE_CONFIGS).map(([id, config]) => <option key={id} value={id}>{config.label}</option>)}
          </select>
        </label>
        <label>
          <span>First name</span>
          <input onChange={(event) => setValue('firstName', event.target.value)} value={form.firstName} />
        </label>
        <label>
          <span>Last name</span>
          <input onChange={(event) => setValue('lastName', event.target.value)} value={form.lastName} />
        </label>
        <label>
          <span>Work email</span>
          <input inputMode="email" onChange={(event) => setValue('email', event.target.value)} value={form.email} />
        </label>
        <label>
          <span>Mobile number</span>
          <input inputMode="tel" onChange={(event) => setValue('mobile', event.target.value)} value={form.mobile} />
        </label>
        <label>
          <span>{roleConfig.organisationLabel}</span>
          <input onChange={(event) => setValue('organisationName', event.target.value)} value={form.organisationName} />
        </label>
        <label>
          <span>Position</span>
          <select onChange={(event) => setValue('position', event.target.value)} value={form.position}>
            <option value="">Select</option>
            {roleConfig.positionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        {error ? <Notice tone="danger" text={error} /> : null}
        <button className="primary-button" disabled={isSubmitting} type="submit">
          <Plus size={16} />
          <span>{isSubmitting ? 'Creating...' : 'Create lead'}</span>
        </button>
      </form>
    </section>
  )
}

function InboundLeadsView({ onRefresh, snapshot }) {
  const [filters, setFilters] = useState({ date: 'all', owner: 'all', role: 'all', source: 'all', status: 'all' })
  const [query, setQuery] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [showAddLead, setShowAddLead] = useState(false)
  const leads = snapshot?.leads || []
  const owners = snapshot?.owners || []
  const activities = snapshot?.activities || []
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) || leads[0] || null
  const visibleLeads = leads.filter((lead) => {
    const search = normalizeToken([lead.fullName, lead.organisationName, lead.email, lead.mobile].join(' '))
    const createdAt = new Date(lead.created_at || 0).getTime()
    const now = Date.now()
    const inDateRange =
      filters.date === 'all' ||
      (filters.date === '7d' && createdAt >= now - 7 * 86_400_000) ||
      (filters.date === '30d' && createdAt >= now - 30 * 86_400_000) ||
      (filters.date === 'month' && new Date(lead.created_at || 0).getMonth() === new Date().getMonth() && new Date(lead.created_at || 0).getFullYear() === new Date().getFullYear())
    return (
      (filters.source === 'all' || lead.source === filters.source) &&
      (filters.role === 'all' || lead.roleType === filters.role) &&
      (filters.owner === 'all' || (filters.owner === 'unassigned' ? !lead.ownerId : lead.ownerId === filters.owner)) &&
      (filters.status === 'all' || lead.status === filters.status) &&
      inDateRange &&
      (!query || search.includes(normalizeToken(query)))
    )
  })

  useEffect(() => {
    if (!leads.length) {
      setSelectedLeadId('')
      return
    }
    if (!leads.some((lead) => lead.id === selectedLeadId)) setSelectedLeadId(leads[0].id)
  }, [leads, selectedLeadId])

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function exportCsv() {
    const csv = buildInboundCsv(visibleLeads)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `arch9-inbound-leads-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="view-stack inbound-workspace">
      <section className="inbound-actions-row">
        <div className="inbound-search">
          <Search size={18} />
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search name, organisation, email or mobile..." value={query} />
        </div>
        <button className="secondary-button compact" onClick={exportCsv} type="button">
          <Download size={16} />
          <span>Export</span>
        </button>
        <button className="primary-button compact" onClick={() => setShowAddLead(true)} type="button">
          <Plus size={16} />
          <span>Add Lead</span>
        </button>
      </section>

      <section className="inbound-filters">
        <select onChange={(event) => setFilter('source', event.target.value)} value={filters.source}>
          <option value="all">All Sources</option>
          {SOURCE_OPTIONS.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
        </select>
        <select onChange={(event) => setFilter('role', event.target.value)} value={filters.role}>
          <option value="all">All Roles</option>
          {Object.entries(ROLE_CONFIGS).map(([id, config]) => <option key={id} value={id}>{config.shortLabel}</option>)}
        </select>
        <select onChange={(event) => setFilter('owner', event.target.value)} value={filters.owner}>
          <option value="all">All Owners</option>
          <option value="unassigned">Unassigned</option>
          {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.full_name || owner.email}</option>)}
        </select>
        <select onChange={(event) => setFilter('status', event.target.value)} value={filters.status}>
          <option value="all">All Statuses</option>
          {INBOUND_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
        </select>
        <select onChange={(event) => setFilter('date', event.target.value)} value={filters.date}>
          <option value="all">Date range</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="month">This month</option>
        </select>
        <button className="secondary-button compact" type="button">
          <Filter size={16} />
          <span>Filters</span>
        </button>
      </section>

      <PipelineSummary activeStatus={filters.status} leads={leads} onSelect={(status) => setFilter('status', status)} />

      {showAddLead ? <AddInboundLeadPanel onCancel={() => setShowAddLead(false)} onCreated={async () => {
        setShowAddLead(false)
        await onRefresh?.()
      }} /> : null}

      <section className="inbound-layout">
        <InboundLeadTable leads={visibleLeads} onSelect={(lead) => setSelectedLeadId(lead.id)} selectedLeadId={selectedLead?.id} />
        <InboundLeadDetail activities={activities} lead={selectedLead} onRefresh={onRefresh} owners={owners} />
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
  const [inbound, setInbound] = useState(EMPTY_INBOUND)
  const [profile, setProfile] = useState(null)
  const [rangeId, setRangeId] = useState('30d')
  const [session, setSession] = useState(null)
  const [support, setSupport] = useState(EMPTY_SUPPORT)
  const [isBooting, setIsBooting] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isResolvingAccess, setIsResolvingAccess] = useState(false)
  const [pathname, setPathname] = useState(() => (typeof window === 'undefined' ? '/admin' : window.location.pathname))

  const allowedViews = useMemo(
    () => getAllowedAdminViews(access.level),
    [access.level],
  )

  async function refreshData(nextRange = rangeId) {
    if (!session?.user || !access.allowed) return
    setIsLoading(true)
    const [dashboardResult, supportResult, inboundResult] = await Promise.all([
      loadDashboardSnapshot(nextRange),
      loadSupportSnapshot(nextRange),
      loadInboundLeadsSnapshot(),
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
    setInbound({
      ...EMPTY_INBOUND,
      ...(inboundResult.data || {}),
      warnings: [
        ...((inboundResult.data || {}).warnings || []),
        ...(inboundResult.error ? [{ message: inboundResult.error, type: 'inbound_rpc' }] : []),
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
        setIsResolvingAccess(false)
        setAccess({ allowed: false, level: '', roles: [] })
        setDashboard(EMPTY_DASHBOARD)
        setInbound(EMPTY_INBOUND)
        setProfile(null)
        setSupport(EMPTY_SUPPORT)
        return
      }

      setIsResolvingAccess(true)
      try {
        const nextProfile = await loadAdminProfile(session.user.id)
        if (cancelled) return

        const nextAccess = resolveAdminAccess({ profile: nextProfile, user: session.user })
        setAccess(nextAccess)
        setProfile(nextProfile || { email: session.user.email })
        if (typeof window !== 'undefined') setPathname(window.location.pathname)
      } finally {
        if (!cancelled) setIsResolvingAccess(false)
      }
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

  if (pathname === '/join' || pathname === '/join/') {
    return <PublicIntakePage />
  }

  if (!session) {
    return <LoginScreen authError={authError} onMagicLink={handleMagicLink} onSignIn={handleSignIn} />
  }

  if (isResolvingAccess || (!profile && !access.allowed)) {
    return (
      <main className="center-shell">
        <Loader2 className="spin" size={26} />
      </main>
    )
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
        {view === 'inboundLeads' ? <InboundLeadsView onRefresh={() => refreshData()} snapshot={inbound} /> : null}
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
