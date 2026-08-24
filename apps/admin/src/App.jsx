import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Headphones,
  Home,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  LogOut,
  NotebookPen,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Target,
  UploadCloud,
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

const ARCH9_PUBLIC_URL = String(APP_ENV.VITE_ARCH9_PUBLIC_URL || 'https://app.arch9.co.za').trim().replace(/\/+$/, '')

const PROSPECT_DEMO_COLOUR_CONTROLS = [
  { key: 'primaryColour', payloadKey: 'primary_colour', label: 'Primary', fallback: '#274C69', description: 'Buttons and header surfaces' },
  { key: 'secondaryColour', payloadKey: 'secondary_colour', label: 'Secondary', fallback: '#10273A', description: 'Dark supporting UI' },
  { key: 'accentColour', payloadKey: 'accent_colour', label: 'Accent', fallback: '#F7CF22', description: 'Links, highlights and badges' },
]

const PROSPECT_DEMO_SELECT = [
  'slug',
  'agency_name',
  'logo_url',
  'logo_light_url',
  'logo_dark_url',
  'primary_colour',
  'secondary_colour',
  'accent_colour',
  'sample_property_image_url',
  'sample_property_address',
  'created_at',
  'updated_at',
].join(', ')

function normalizeDemoSlug(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildDemoLink(slug = '', suffix = 'buyer') {
  const normalizedSlug = normalizeDemoSlug(slug)
  if (!normalizedSlug) return ''
  return `${ARCH9_PUBLIC_URL}/demo/${normalizedSlug}/${suffix}`
}

function mapProspectDemoConfig(row = {}) {
  const logoUrl = String(row.logoUrl || row.logo_url || '').trim()
  const logoLightUrl = String(row.logoLightUrl || row.logo_light_url || logoUrl).trim()
  const logoDarkUrl = String(row.logoDarkUrl || row.logo_dark_url || logoUrl).trim()
  return {
    slug: normalizeDemoSlug(row.slug || row.slug_key || ''),
    agencyName: String(row.agencyName || row.agency_name || '').trim(),
    logoUrl: logoUrl || logoLightUrl || logoDarkUrl,
    logoLightUrl,
    logoDarkUrl,
    primaryColour: normalizeHexColour(row.primaryColour || row.primary_colour, '#274C69'),
    secondaryColour: normalizeHexColour(row.secondaryColour || row.secondary_colour, '#10273A'),
    accentColour: normalizeHexColour(row.accentColour || row.accent_colour, '#F7CF22'),
    samplePropertyImageUrl: String(row.samplePropertyImageUrl || row.sample_property_image_url || '').trim(),
    samplePropertyAddress: String(row.samplePropertyAddress || row.sample_property_address || '').trim(),
    createdAt: row.createdAt || row.created_at || '',
    updatedAt: row.updatedAt || row.updated_at || '',
  }
}

function normalizeHexColour(value = '', fallback = '#274C69') {
  const text = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback
}

async function readFileAsDataUrl(file) {
  if (!file) return ''
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read the uploaded image.'))
    reader.readAsDataURL(file)
  })
}

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

const AGENCY_ONBOARDING_STATUS_OPTIONS = [
  { id: 'not_started', label: 'Awaiting submission' },
  { id: 'sent', label: 'Link sent' },
  { id: 'opened', label: 'Opened' },
  { id: 'in_progress', label: 'Onboarding in progress' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'approved', label: 'Approved' },
  { id: 'active', label: 'Active' },
  { id: 'expired', label: 'Expired' },
  { id: 'cancelled', label: 'Cancelled' },
]

const AGENCY_ONBOARDING_STEP_KEYS = ['agency_details', 'principal', 'setup', 'agreement']
const AGENCY_ONBOARDING_STEP_LABELS = ['Agency details', 'Principal', 'Agency setup', 'Agreement']
const AGENCY_ONBOARDING_AGREEMENT_ID = 'arch9-agency-services-agreement'
const AGENCY_ONBOARDING_AGREEMENT_VERSION = '2026.08-v1'
const AGENCY_ONBOARDING_AGREEMENT_TITLE = 'Arch9 Agency Services Agreement'
const AGENCY_ONBOARDING_AGREEMENT_PARAGRAPHS = [
  'This agreement confirms that the person completing onboarding is authorised to act for the agency and to provide information on its behalf.',
  'Arch9 may use the information supplied during onboarding to configure the agency workspace, route communications, and support the agency setup process.',
  'The agency confirms that the information provided is accurate to the best of its knowledge and agrees to keep Arch9 informed of material changes.',
  'Electronic acceptance of this agreement carries the same effect as a handwritten signature for the purpose of internal Arch9 onboarding records.',
]
const AGENCY_ONBOARDING_AGREEMENT_TEXT = [
  AGENCY_ONBOARDING_AGREEMENT_TITLE,
  '',
  ...AGENCY_ONBOARDING_AGREEMENT_PARAGRAPHS.map((paragraph, index) => `${index + 1}. ${paragraph}`),
].join('\n')
const AGENCY_ONBOARDING_PLAN_KEYS = ['plan_name', 'planName', 'package_name', 'packageName', 'plan_summary', 'planSummary']
const AGENCY_ONBOARDING_ADDRESS_KEYS = ['address', 'addressLine1', 'address_line_1', 'main_office_address', 'mainOfficeAddress']
const AGENCY_ONBOARDING_AGENT_RANGE_OPTIONS = ['1-5', '6-10', '11-20', '21-50', '50+']
const AGENCY_ONBOARDING_BRANCH_OPTIONS = ['1', '2', '3', '4', '5+']

const NAV_ICONS = {
  dashboard: Home,
  inboundLeads: Target,
  organisations: Building2,
  reports: BarChart3,
  transactions: FileText,
  users: UsersRound,
  prospects: NotebookPen,
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

function formatAgencyOnboardingStatus(status = '') {
  return AGENCY_ONBOARDING_STATUS_OPTIONS.find((item) => item.id === status)?.label || normalizeStageLabel(status)
}

function getAgencyOnboardingTone(status = '') {
  if (['approved', 'active'].includes(status)) return 'success'
  if (['submitted'].includes(status)) return 'accent'
  if (['opened', 'in_progress', 'sent'].includes(status)) return 'warm'
  if (['expired', 'cancelled'].includes(status)) return 'danger'
  return 'neutral'
}

function getAgencyOnboardingStepIndex(currentStep = '') {
  const step = normalizeText(currentStep)
  const index = AGENCY_ONBOARDING_STEP_KEYS.indexOf(step)
  return index >= 0 ? index : 0
}

function buildAgencyOnboardingUrl(token = '') {
  if (!token) return ''
  if (typeof window === 'undefined') return `/onboarding/agency/${token}`
  return `${window.location.origin}/onboarding/agency/${encodeURIComponent(token)}`
}

function buildAgencyOnboardingPath(token = '') {
  return token ? `/onboarding/agency/${encodeURIComponent(token)}` : ''
}

function formatAgencyOnboardingStep(step = '') {
  return AGENCY_ONBOARDING_STEP_LABELS[getAgencyOnboardingStepIndex(step)] || normalizeStageLabel(step)
}

function getAgencyOnboardingTokenFromPath(pathname = '') {
  const match = String(pathname || '').match(/^\/onboarding\/agency\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1] || '') : ''
}

function getAgencyPlanInfo(lead = {}) {
  const values = [
    lead.agencyOnboarding?.planName,
    lead.agencyOnboarding?.packageName,
    lead.agencyOnboarding?.formData?.plan_name,
    lead.agencyOnboarding?.formData?.planName,
    lead.agencyOnboarding?.formData?.package_name,
    lead.agencyOnboarding?.formData?.packageName,
    lead.agencyOnboarding?.formData?.plan_summary,
    lead.agencyOnboarding?.formData?.planSummary,
    lead.source_payload?.plan_name,
    lead.source_payload?.package_name,
    lead.source_payload?.plan_summary,
  ]
  const planName = values.find((value) => normalizeText(value))
  const summary = normalizeText(
    lead.agencyOnboarding?.formData?.plan_summary ||
      lead.agencyOnboarding?.formData?.planSummary ||
      lead.source_payload?.plan_summary ||
      lead.source_payload?.planSummary ||
      '',
  )
  return {
    hasPlan: Boolean(normalizeText(planName)),
    name: normalizeText(planName),
    summary,
  }
}

function normalizeInboundLead(row = {}) {
  const businessMetrics = row.business_metrics || row.businessMetrics || {}
  const selectedInterests = row.selected_interests || row.selectedInterests || []
  const agencyOnboardingFormData = row.agency_onboarding_form_data || row.agencyOnboardingFormData || {}
  const agencyOnboarding = {
    activatedAt: row.agency_onboarding_activated_at || row.agencyOnboardingActivatedAt || '',
    agreementAcceptedAt: row.agency_onboarding_agreement_accepted_at || row.agencyOnboardingAgreementAcceptedAt || '',
    agreementAcceptedByEmail: row.agency_onboarding_agreement_accepted_by_email || row.agencyOnboardingAgreementAcceptedByEmail || '',
    agreementAcceptedByName: row.agency_onboarding_agreement_accepted_by_name || row.agencyOnboardingAgreementAcceptedByName || '',
    agreementAuditJson: row.agency_onboarding_agreement_audit_json || row.agencyOnboardingAgreementAuditJson || {},
    agreementId: row.agency_onboarding_agreement_id || row.agencyOnboardingAgreementId || '',
    agreementSnapshotJson: row.agency_onboarding_agreement_snapshot_json || row.agencyOnboardingAgreementSnapshotJson || {},
    agreementText: row.agency_onboarding_agreement_text || row.agencyOnboardingAgreementText || '',
    agreementVersion: row.agency_onboarding_agreement_version || row.agencyOnboardingAgreementVersion || '',
    approvedAt: row.agency_onboarding_approved_at || row.agencyOnboardingApprovedAt || '',
    cancelledAt: row.agency_onboarding_cancelled_at || row.agencyOnboardingCancelledAt || '',
    contactEmail: row.agency_onboarding_contact_email || row.agencyOnboardingContactEmail || '',
    contactFirstName: row.agency_onboarding_contact_first_name || row.agencyOnboardingContactFirstName || '',
    contactLastName: row.agency_onboarding_contact_last_name || row.agencyOnboardingContactLastName || '',
    contactPhone: row.agency_onboarding_contact_phone || row.agencyOnboardingContactPhone || '',
    contactPosition: row.agency_onboarding_contact_position || row.agencyOnboardingContactPosition || '',
    currentStep: row.agency_onboarding_current_step || row.agencyOnboardingCurrentStep || 'agency_details',
    expiresAt: row.agency_onboarding_expires_at || row.agencyOnboardingExpiresAt || '',
    firstOpenedAt: row.agency_onboarding_first_opened_at || row.agencyOnboardingFirstOpenedAt || '',
    formData: agencyOnboardingFormData,
    lastOpenedAt: row.agency_onboarding_last_opened_at || row.agencyOnboardingLastOpenedAt || '',
    leadId: row.id,
    linkCreatedAt: row.agency_onboarding_link_created_at || row.agencyOnboardingLinkCreatedAt || '',
    linkSentAt: row.agency_onboarding_link_sent_at || row.agencyOnboardingLinkSentAt || '',
    startedAt: row.agency_onboarding_started_at || row.agencyOnboardingStartedAt || '',
    status: row.agency_onboarding_status || row.agencyOnboardingStatus || 'not_started',
    submittedAt: row.agency_onboarding_submitted_at || row.agencyOnboardingSubmittedAt || '',
    token: row.agency_onboarding_token || row.agencyOnboardingToken || '',
  }
  return {
    ...row,
    businessMetrics,
    convertedAt: row.converted_at || row.convertedAt || '',
    agencyOnboarding,
    agencyOnboardingToken: agencyOnboarding.token,
    agencyOnboardingStatus: agencyOnboarding.status,
    agencyOnboardingCurrentStep: agencyOnboarding.currentStep,
    agencyOnboardingFormData: agencyOnboarding.formData,
    agencyOnboardingContactFirstName: agencyOnboarding.contactFirstName,
    agencyOnboardingContactLastName: agencyOnboarding.contactLastName,
    agencyOnboardingContactEmail: agencyOnboarding.contactEmail,
    agencyOnboardingContactPhone: agencyOnboarding.contactPhone,
    agencyOnboardingContactPosition: agencyOnboarding.contactPosition,
    fullName: [row.first_name || row.firstName, row.last_name || row.lastName].filter(Boolean).join(' '),
    id: row.id,
    organisationName: row.organisation_name || row.organisationName || '',
    notes: row.notes || '',
    ownerId: row.owner_id || row.ownerId || '',
    ownerLabel: row.owner_name || row.owner_email || '',
    roleType: row.role_type || row.roleType || 'agency',
    selectedInterests,
    services: row.services || [],
    source: row.source || 'other',
    status: row.status || 'new',
    createdAt: row.created_at || row.createdAt || '',
    updatedAt: row.updated_at || row.updatedAt || '',
    agencyOnboardingAgreementAcceptedAt: agencyOnboarding.agreementAcceptedAt,
    agencyOnboardingAgreementAcceptedByEmail: agencyOnboarding.agreementAcceptedByEmail,
    agencyOnboardingAgreementAcceptedByName: agencyOnboarding.agreementAcceptedByName,
    agencyOnboardingAgreementId: agencyOnboarding.agreementId,
    agencyOnboardingAgreementText: agencyOnboarding.agreementText,
    agencyOnboardingAgreementVersion: agencyOnboarding.agreementVersion,
    agencyOnboardingActivatedAt: agencyOnboarding.activatedAt,
    agencyOnboardingApprovedAt: agencyOnboarding.approvedAt,
    agencyOnboardingCancelledAt: agencyOnboarding.cancelledAt,
    agencyOnboardingExpiresAt: agencyOnboarding.expiresAt,
    agencyOnboardingFirstOpenedAt: agencyOnboarding.firstOpenedAt,
    agencyOnboardingLastOpenedAt: agencyOnboarding.lastOpenedAt,
    agencyOnboardingLinkCreatedAt: agencyOnboarding.linkCreatedAt,
    agencyOnboardingLinkSentAt: agencyOnboarding.linkSentAt,
    agencyOnboardingStartedAt: agencyOnboarding.startedAt,
    agencyOnboardingSubmittedAt: agencyOnboarding.submittedAt,
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

function getLeadJourneyTone(status = '') {
  if (status === 'live') return 'success'
  if (status === 'not_proceeding') return 'danger'
  if (['demo_booked', 'trial_setup', 'onboarding'].includes(status)) return 'accent'
  if (status === 'contacted') return 'warm'
  return 'neutral'
}

function buildLeadJourneySteps(lead = {}, activities = []) {
  const sortedActivities = [...activities]
    .filter((activity) => activity.inbound_lead_id === lead.id || activity.inboundLeadId === lead.id)
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
  const latestActivity = sortedActivities[0] || null
  const interests = (lead.selectedInterests || []).slice(0, 3)
  const scaleLines = getLeadScaleLines(lead)

  return [
    {
      id: 'capture',
      label: 'Capture',
      value: formatDateTime(lead.created_at || lead.createdAt),
      detail: [formatSource(lead.source), lead.utmSource ? `UTM ${lead.utmSource}` : ''].filter(Boolean).join(' · ') || 'Platform entry point',
      tone: 'accent',
    },
    {
      id: 'profile',
      label: 'Profile',
      value: [lead.fullName, lead.position].filter(Boolean).join(' · ') || 'Lead profile',
      detail: lead.organisationName || 'Organisation not captured yet',
      tone: 'neutral',
    },
    {
      id: 'fit',
      label: 'Fit',
      value: formatRoleType(lead.roleType),
      detail: scaleLines.join(' · ') || 'No scale signals captured yet',
      tone: interests.length ? 'success' : 'neutral',
    },
    {
      id: 'ownership',
      label: 'Ownership',
      value: lead.ownerLabel || 'Unassigned',
      detail: formatInboundStatus(lead.status),
      tone: getLeadJourneyTone(lead.status),
    },
    {
      id: 'engagement',
      label: 'Latest touch',
      value: latestActivity ? normalizeStageLabel(latestActivity.event_type || latestActivity.eventType) : 'No activity yet',
      detail: latestActivity
        ? `${formatDateTime(latestActivity.created_at)}${latestActivity.actor_name || latestActivity.actor_email ? ` · ${latestActivity.actor_name || latestActivity.actor_email}` : ''}`
        : 'Add a note or log activity to continue the journey.',
      tone: latestActivity ? 'success' : 'neutral',
    },
    {
      id: 'outcome',
      label: 'Outcome',
      value: lead.status === 'live' ? 'Live' : 'In progress',
      detail: lead.status === 'live' ? 'Converted to a live platform lead.' : 'Waiting for conversion.',
      tone: lead.status === 'live' ? 'success' : lead.status === 'not_proceeding' ? 'danger' : 'neutral',
    },
  ]
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

async function startAgencyOnboarding(leadId, patch = {}) {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_admin_start_agency_onboarding', {
    p_lead_id: leadId,
    p_patch: patch,
  })
  return { data: data ? normalizeInboundLead(data) : null, error: error?.message || '' }
}

async function sendAgencyOnboardingLink(leadId, patch = {}) {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_admin_send_agency_onboarding_link', {
    p_lead_id: leadId,
    p_patch: patch,
  })
  return { data: data ? normalizeInboundLead(data) : null, error: error?.message || '' }
}

async function replaceAgencyOnboardingLink(leadId) {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_admin_replace_agency_onboarding_link', {
    p_lead_id: leadId,
  })
  return { data: data ? normalizeInboundLead(data) : null, error: error?.message || '' }
}

async function updateAgencyOnboardingStatus(leadId, status) {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_admin_update_agency_onboarding_status', {
    p_lead_id: leadId,
    p_status: status,
  })
  return { data: data ? normalizeInboundLead(data) : null, error: error?.message || '' }
}

async function activateAgencyOnboarding(leadId) {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_admin_activate_agency_onboarding', {
    p_lead_id: leadId,
  })
  return { data: data ? normalizeInboundLead(data) : null, error: error?.message || '' }
}

async function loadAgencyOnboardingState(token) {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_agency_onboarding_public_state', {
    p_token: token,
  })
  return { data: data ? normalizeInboundLead(data) : null, error: error?.message || '' }
}

async function saveAgencyOnboardingProgress(token, payload = {}, currentStep = '') {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_agency_onboarding_save', {
    p_current_step: currentStep || null,
    p_payload: payload,
    p_token: token,
  })
  return { data: data ? normalizeInboundLead(data) : null, error: error?.message || '' }
}

async function submitAgencyOnboarding(token, payload = {}) {
  if (!supabase) return { data: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('arch9_agency_onboarding_submit', {
    p_payload: payload,
    p_token: token,
  })
  return { data: data ? normalizeInboundLead(data) : null, error: error?.message || '' }
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

async function sendAgencyOnboardingEmail(lead = {}) {
  if (!supabase?.functions?.invoke) return { error: 'Supabase functions are not configured.' }

  const onboarding = lead.agencyOnboarding || {}
  const token = onboarding.token || ''
  const recipientEmail =
    normalizeText(onboarding.contactEmail) ||
    normalizeText(lead.email) ||
    normalizeText(lead.source_payload?.email)
  const recipientName =
    normalizeText(
      [onboarding.contactFirstName, onboarding.contactLastName].filter(Boolean).join(' '),
    ) ||
    normalizeText(lead.fullName) ||
    normalizeText(lead.organisationName)
  const payload = {
    type: 'agency_onboarding',
    to: recipientEmail,
    recipientName,
    agencyName: lead.organisationName || onboarding.formData?.agencyName || recipientName,
    legalEntityName: onboarding.formData?.legalEntityName || lead.organisationName || '',
    principalName: recipientName,
    principalEmail: recipientEmail,
    principalPhone: onboarding.contactPhone || lead.mobile || '',
    secureLink: buildAgencyOnboardingUrl(token),
    onboardingLink: buildAgencyOnboardingUrl(token),
    actionLink: buildAgencyOnboardingUrl(token),
    messageKind: onboarding.status === 'sent' ? 'reminder' : 'initial_request',
    planName: onboarding.formData?.planName || onboarding.formData?.plan_name || '',
    planSummary: onboarding.formData?.planSummary || onboarding.formData?.plan_summary || '',
  }

  const { error } = await supabase.functions.invoke('send-email', { body: payload })
  return { error: error?.message || '' }
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

function IntakeProgress({ step, labels = ['Choose your role', 'About you', 'Business', 'Interests', 'Confirmation'] }) {
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

function buildAgencyOnboardingDefaultForm(lead = {}) {
  const formData = lead.agencyOnboarding?.formData || {}
  const principalName = [lead.agencyOnboarding?.contactFirstName, lead.agencyOnboarding?.contactLastName]
    .filter(Boolean)
    .join(' ')
  return {
    agencyName: normalizeText(
      formData.agency_name ||
        formData.agencyName ||
        lead.organisationName ||
        '',
    ),
    legalEntityName: normalizeText(formData.legal_entity_name || formData.legalEntityName || ''),
    companyRegistrationNumber: normalizeText(formData.company_registration_number || formData.companyRegistrationNumber || ''),
    ffcNumber: normalizeText(formData.ffc_number || formData.ffcNumber || ''),
    vatNumber: normalizeText(formData.vat_number || formData.vatNumber || ''),
    physicalAddress: normalizeText(
      formData.physical_address ||
        formData.physicalAddress ||
        formData.address ||
        lead.address ||
        '',
    ),
    principalFirstName: normalizeText(formData.principal_first_name || formData.principalFirstName || lead.agencyOnboarding?.contactFirstName || ''),
    principalSurname: normalizeText(formData.principal_last_name || formData.principalSurname || lead.agencyOnboarding?.contactLastName || ''),
    principalPosition: normalizeText(formData.principal_position || formData.principalPosition || lead.agencyOnboarding?.contactPosition || ''),
    principalEmail: normalizeText(formData.principal_email || formData.principalEmail || lead.agencyOnboarding?.contactEmail || ''),
    principalMobile: normalizeText(formData.principal_phone || formData.principalPhone || lead.agencyOnboarding?.contactPhone || ''),
    authorisedConfirmation: Boolean(formData.authorised_confirmation || formData.authorisedConfirmation),
    agentCountRange: normalizeText(formData.agent_count_range || formData.agentCountRange || ''),
    branchCount: normalizeText(formData.branch_count || formData.branchCount || ''),
    planName: normalizeText(
      formData.plan_name ||
        formData.planName ||
        formData.package_name ||
        formData.packageName ||
        lead.source_payload?.plan_name ||
        lead.source_payload?.package_name ||
        '',
    ),
    planSummary: normalizeText(formData.plan_summary || formData.planSummary || lead.source_payload?.plan_summary || ''),
    agreementAccepted: Boolean(formData.agreement_accepted || formData.agreementAccepted),
    agreementAuthorityConfirmed: Boolean(formData.agreement_authority_confirmed || formData.agreementAuthorityConfirmed),
    agreementFullName: normalizeText(
      formData.agreement_full_name ||
        formData.agreementFullName ||
        principalName ||
        '',
    ),
    agreementId: lead.agencyOnboarding?.agreementId || AGENCY_ONBOARDING_AGREEMENT_ID,
    agreementPosition: normalizeText(formData.agreement_position || formData.agreementPosition || lead.agencyOnboarding?.contactPosition || ''),
    agreementText: lead.agencyOnboarding?.agreementText || AGENCY_ONBOARDING_AGREEMENT_TEXT,
    agreementVersion: lead.agencyOnboarding?.agreementVersion || AGENCY_ONBOARDING_AGREEMENT_VERSION,
    currentStep: lead.agencyOnboarding?.currentStep || 'agency_details',
    termsAccepted: Boolean(formData.terms_accepted || formData.termsAccepted),
  }
}

function buildAgencyOnboardingPayload(form = {}, extras = {}) {
  const { includeAgreementSnapshot, ...restExtras } = extras
  const agencyName = normalizeText(form.agencyName)
  const legalEntityName = normalizeText(form.legalEntityName)
  const principalFirstName = normalizeText(form.principalFirstName)
  const principalSurname = normalizeText(form.principalSurname)
  const principalEmail = normalizeText(form.principalEmail)
  const principalMobile = normalizeText(form.principalMobile)
  const principalPosition = normalizeText(form.principalPosition)
  const agreementFullName = normalizeText(form.agreementFullName || [principalFirstName, principalSurname].filter(Boolean).join(' '))
  const agreementPosition = normalizeText(form.agreementPosition || principalPosition)
  const planName = normalizeText(form.planName)
  const planSummary = normalizeText(form.planSummary)
  const address = normalizeText(form.physicalAddress)
  const payload = {
    agreement_authority_confirmed: Boolean(form.agreementAuthorityConfirmed),
    agreement_full_name: agreementFullName,
    agreement_id: form.agreementId || AGENCY_ONBOARDING_AGREEMENT_ID,
    agreement_position: agreementPosition,
    agreement_text: form.agreementText || AGENCY_ONBOARDING_AGREEMENT_TEXT,
    agreement_version: form.agreementVersion || AGENCY_ONBOARDING_AGREEMENT_VERSION,
    agency_name: agencyName,
    agent_count_range: normalizeText(form.agentCountRange),
    branch_count: normalizeText(form.branchCount),
    company_registration_number: normalizeText(form.companyRegistrationNumber),
    contact_email: principalEmail,
    contact_first_name: principalFirstName,
    contact_last_name: principalSurname,
    contact_phone: principalMobile,
    contact_position: principalPosition,
    current_step: extras.currentStep || form.currentStep || 'agency_details',
    ffc_number: normalizeText(form.ffcNumber),
    form_data: {
      agencyName,
      legalEntityName,
      companyRegistrationNumber: normalizeText(form.companyRegistrationNumber),
      ffcNumber: normalizeText(form.ffcNumber),
      vatNumber: normalizeText(form.vatNumber),
      physicalAddress: address,
      principalFirstName,
      principalSurname,
      principalPosition,
      principalEmail,
      principalMobile,
      authorisedConfirmation: Boolean(form.authorisedConfirmation),
      agentCountRange: normalizeText(form.agentCountRange),
      branchCount: normalizeText(form.branchCount),
      planName,
      planSummary,
      agreementAuthorityConfirmed: Boolean(form.agreementAuthorityConfirmed),
      agreementFullName,
      agreementId: form.agreementId || AGENCY_ONBOARDING_AGREEMENT_ID,
      agreementPosition,
      agreementText: form.agreementText || AGENCY_ONBOARDING_AGREEMENT_TEXT,
      agreementVersion: form.agreementVersion || AGENCY_ONBOARDING_AGREEMENT_VERSION,
      agreementAccepted: Boolean(form.agreementAccepted),
      termsAccepted: Boolean(form.termsAccepted),
    },
    legal_entity_name: legalEntityName,
    plan_name: planName,
    plan_summary: planSummary,
    principal_email: principalEmail,
    principal_first_name: principalFirstName,
    principal_last_name: principalSurname,
    principal_mobile: principalMobile,
    principal_name: agreementFullName,
    principal_phone: principalMobile,
    principal_position: principalPosition,
    terms_accepted: Boolean(form.termsAccepted),
    timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || '' : '',
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent || '' : '',
    vat_number: normalizeText(form.vatNumber),
    ...restExtras,
  }
  if (includeAgreementSnapshot !== false) {
    payload.agreement_snapshot = {
      agreement_id: form.agreementId || AGENCY_ONBOARDING_AGREEMENT_ID,
      agreement_text: form.agreementText || AGENCY_ONBOARDING_AGREEMENT_TEXT,
      agreement_version: form.agreementVersion || AGENCY_ONBOARDING_AGREEMENT_VERSION,
      accepted_by_email: principalEmail,
      accepted_by_name: agreementFullName,
      accepted_at: new Date().toISOString(),
      accepted_by_position: agreementPosition,
      onboarding_id: extras.onboardingId || null,
    }
  }
  return payload
}

function getAgencyOnboardingResumeStep(lead = {}) {
  const status = lead.agencyOnboarding?.status || 'not_started'
  if (['submitted', 'approved', 'active'].includes(status)) return 5
  const hasSavedProgress = Boolean(
    lead.agencyOnboarding?.startedAt ||
      lead.agencyOnboarding?.submittedAt ||
      lead.agencyOnboarding?.firstOpenedAt ||
      lead.agencyOnboarding?.lastOpenedAt ||
      normalizeText(lead.agencyOnboarding?.contactEmail) ||
      normalizeText(lead.agencyOnboarding?.formData?.agencyName) ||
      normalizeText(lead.agencyOnboarding?.formData?.legalEntityName),
  )
  if (!hasSavedProgress && status === 'not_started') return 0
  return Math.min(4, AGENCY_ONBOARDING_STEP_KEYS.indexOf(lead.agencyOnboarding?.currentStep || 'agency_details') + 1)
}

function buildAgencyOnboardingJourneySteps(lead = {}) {
  const onboarding = lead.agencyOnboarding || {}
  const status = onboarding.status || 'not_started'
  const agencyName = normalizeText(onboarding.formData?.agencyName || onboarding.formData?.agency_name || lead.organisationName || 'Agency')
  const principalName = normalizeText(
    onboarding.contactFirstName || onboarding.contactLastName
      ? [onboarding.contactFirstName, onboarding.contactLastName].filter(Boolean).join(' ')
      : onboarding.formData?.principalFirstName || onboarding.formData?.principalSurname || '',
  )
  const planInfo = getAgencyPlanInfo(lead)
  return [
    {
      id: 'created',
      label: 'Link created',
      value: formatDateTime(onboarding.linkCreatedAt),
      detail: onboarding.token ? 'Secure token generated for this lead.' : 'Waiting for onboarding start.',
      tone: onboarding.linkCreatedAt ? 'accent' : 'neutral',
    },
    {
      id: 'sent',
      label: 'Link sent',
      value: formatDateTime(onboarding.linkSentAt),
      detail: onboarding.contactEmail || principalName || 'No recipient yet',
      tone: onboarding.linkSentAt ? 'success' : 'neutral',
    },
    {
      id: 'opened',
      label: 'First opened',
      value: formatDateTime(onboarding.firstOpenedAt),
      detail: onboarding.lastOpenedAt ? `Last opened ${formatDateTime(onboarding.lastOpenedAt)}` : 'Awaiting first open.',
      tone: onboarding.firstOpenedAt ? 'success' : 'neutral',
    },
    {
      id: 'started',
      label: 'Started',
      value: formatDateTime(onboarding.startedAt),
      detail: onboarding.currentStep ? `Current step: ${formatAgencyOnboardingStep(onboarding.currentStep)}` : 'No saved progress yet.',
      tone: onboarding.startedAt || status === 'in_progress' ? 'accent' : 'neutral',
    },
    {
      id: 'submitted',
      label: 'Submitted',
      value: formatDateTime(onboarding.submittedAt),
      detail: agencyName,
      tone: onboarding.submittedAt || ['submitted', 'approved', 'active'].includes(status) ? 'success' : 'neutral',
    },
    {
      id: 'agreement',
      label: 'Agreement',
      value: formatDateTime(onboarding.agreementAcceptedAt),
      detail: principalName || planInfo.name || 'Awaiting acceptance.',
      tone: onboarding.agreementAcceptedAt ? 'success' : 'neutral',
    },
    {
      id: 'approved',
      label: 'Approved',
      value: formatDateTime(onboarding.approvedAt),
      detail: formatAgencyOnboardingStatus(status),
      tone: ['approved', 'active'].includes(status) ? 'success' : 'neutral',
    },
    {
      id: 'active',
      label: 'Active',
      value: formatDateTime(onboarding.activatedAt),
      detail: 'Organisation is ready for access.',
      tone: status === 'active' ? 'success' : 'neutral',
    },
  ]
}

function buildAgencyOnboardingAdminPatch(lead = {}) {
  const defaults = buildAgencyOnboardingDefaultForm(lead)
  return {
    agency_name: defaults.agencyName,
    agreement_id: defaults.agreementId,
    agreement_text: defaults.agreementText,
    agreement_version: defaults.agreementVersion,
    company_registration_number: defaults.companyRegistrationNumber,
    contact_email: defaults.principalEmail || lead.email || '',
    contact_first_name: defaults.principalFirstName,
    contact_last_name: defaults.principalSurname,
    contact_phone: defaults.principalMobile,
    contact_position: defaults.principalPosition,
    current_step: lead.agencyOnboarding?.currentStep || 'agency_details',
    ffc_number: defaults.ffcNumber,
    form_data: {
      agencyName: defaults.agencyName,
      agentCountRange: defaults.agentCountRange,
      branchCount: defaults.branchCount,
      companyRegistrationNumber: defaults.companyRegistrationNumber,
      ffcNumber: defaults.ffcNumber,
      legalEntityName: defaults.legalEntityName,
      physicalAddress: defaults.physicalAddress,
      planName: defaults.planName,
      planSummary: defaults.planSummary,
      principalEmail: defaults.principalEmail,
      principalFirstName: defaults.principalFirstName,
      principalMobile: defaults.principalMobile,
      principalPosition: defaults.principalPosition,
      principalSurname: defaults.principalSurname,
      vatNumber: defaults.vatNumber,
    },
    legal_entity_name: defaults.legalEntityName,
    principal_email: defaults.principalEmail || lead.email || '',
    principal_first_name: defaults.principalFirstName,
    principal_last_name: defaults.principalSurname,
    principal_mobile: defaults.principalMobile,
    principal_position: defaults.principalPosition,
    vat_number: defaults.vatNumber,
  }
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

function AgencyOnboardingPage() {
  const [token] = useState(() =>
    getAgencyOnboardingTokenFromPath(typeof window === 'undefined' ? '' : window.location.pathname),
  )
  const [lead, setLead] = useState(null)
  const [form, setForm] = useState(() => buildAgencyOnboardingDefaultForm())
  const [step, setStep] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isComplete, setIsComplete] = useState(false)

  const stepLabels = [...AGENCY_ONBOARDING_STEP_LABELS, 'Complete']
  const onboarding = lead?.agencyOnboarding || {}
  const planInfo = getAgencyPlanInfo(lead || {})
  const agencyName = normalizeText(form.agencyName || onboarding.formData?.agencyName || lead?.organisationName)
  const principalName = normalizeText([form.principalFirstName, form.principalSurname].filter(Boolean).join(' ')) ||
    normalizeText([onboarding.contactFirstName, onboarding.contactLastName].filter(Boolean).join(' '))
  const onboardingSummary = [
    ['Status', formatAgencyOnboardingStatus(onboarding.status || (isComplete ? 'submitted' : 'not_started'))],
    ['Current step', isComplete ? 'Complete' : formatAgencyOnboardingStep(onboarding.currentStep || AGENCY_ONBOARDING_STEP_KEYS[Math.min(step, 3)])],
    ['Agency', agencyName || 'Not captured'],
    ['Principal', principalName || 'Not captured'],
    ['Plan', planInfo.name || 'No plan captured'],
    ['Opened', formatDateTime(onboarding.lastOpenedAt || onboarding.firstOpenedAt)],
  ]

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!token) {
        setError('This agency onboarding link is missing its secure token.')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      const result = await loadAgencyOnboardingState(token)
      if (cancelled) return

      if (result.error || !result.data) {
        setLead(null)
        setError(result.error || 'This agency onboarding link is invalid or has expired.')
        setIsLoading(false)
        return
      }

      const nextLead = result.data
      const onboardingState = nextLead.agencyOnboarding || {}
      const resumeStep = getAgencyOnboardingResumeStep(nextLead)
      setLead(nextLead)
      setForm(buildAgencyOnboardingDefaultForm(nextLead))
      setStep(Math.min(4, Math.max(0, resumeStep - 1)))
      setIsComplete(['submitted', 'approved', 'active'].includes(onboardingState.status))
      setError('')
      setSuccess(onboardingState.status === 'submitted' ? 'This onboarding has already been submitted.' : '')
      setIsLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function validateStep(targetStep = step) {
    if (targetStep === 0) {
      return Boolean(
        normalizeText(form.agencyName) &&
          normalizeText(form.legalEntityName) &&
          normalizeText(form.companyRegistrationNumber) &&
          normalizeText(form.physicalAddress),
      )
    }
    if (targetStep === 1) {
      return Boolean(
        normalizeText(form.principalFirstName) &&
          normalizeText(form.principalSurname) &&
          isValidEmail(form.principalEmail) &&
          isValidSaMobile(form.principalMobile) &&
          normalizeText(form.principalPosition),
      )
    }
    if (targetStep === 2) {
      return Boolean(normalizeText(form.agentCountRange) && normalizeText(form.branchCount))
    }
    if (targetStep === 3) {
      return Boolean(
        normalizeText(form.agreementFullName) &&
          normalizeText(form.agreementPosition) &&
          form.agreementAuthorityConfirmed &&
          form.agreementAccepted,
      )
    }
    return true
  }

  async function persistProgress(nextStep = step) {
    if (!token) return null
    setError('')
    setSuccess('')
    setIsSaving(true)
    const currentStep = AGENCY_ONBOARDING_STEP_KEYS[Math.min(nextStep, AGENCY_ONBOARDING_STEP_KEYS.length - 1)] || 'agency_details'
    const payload = buildAgencyOnboardingPayload({
      ...form,
      currentStep,
    }, { currentStep, includeAgreementSnapshot: false })
    const result = await saveAgencyOnboardingProgress(token, payload, currentStep)
    setIsSaving(false)

    if (result.error || !result.data) {
      setError(result.error || 'We could not save this onboarding draft.')
      return null
    }

    setLead(result.data)
    setForm(buildAgencyOnboardingDefaultForm(result.data))
    setSuccess('Progress saved.')
    return result.data
  }

  async function continueFlow() {
    if (!validateStep()) {
      setError('Please complete the highlighted step before continuing.')
      return
    }

    if (step < 3) {
      const savedLead = await persistProgress(step)
      if (!savedLead) return
      setStep(step + 1)
      return
    }

    setError('')
    setSuccess('')
    setIsSaving(true)
    const payload = buildAgencyOnboardingPayload(form, {
      currentStep: 'complete',
      onboardingId: lead?.id || '',
      referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
    })
    const result = await submitAgencyOnboarding(token, payload)
    setIsSaving(false)

    if (result.error || !result.data) {
      setError(result.error || 'We could not submit this onboarding yet.')
      return
    }

    setLead(result.data)
    setForm(buildAgencyOnboardingDefaultForm(result.data))
    setStep(4)
    setIsComplete(true)
    setSuccess('Your agency onboarding has been submitted.')
  }

  async function goBack() {
    if (step <= 0) return
    await persistProgress(step)
    setStep((current) => Math.max(0, current - 1))
  }

  async function copyLink() {
    if (!token || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(buildAgencyOnboardingUrl(token))
    setSuccess('Onboarding link copied.')
  }

  if (isLoading) {
    return (
      <main className="center-shell">
        <Loader2 className="spin" size={26} />
      </main>
    )
  }

  if (!token) {
    return (
      <main className="public-intake-shell">
        <section className="intake-card confirmation-card">
          <Notice tone="danger" text={error || 'This agency onboarding link is missing its secure token.'} />
        </section>
      </main>
    )
  }

  const statusTone = getAgencyOnboardingTone(onboarding.status || (isComplete ? 'submitted' : 'not_started'))
  const progressStep = isComplete ? 4 : step

  return (
    <main className={`public-intake-shell${progressStep === 0 ? ' landing-mode' : ' form-mode'}`}>
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
          <p>Agency onboarding,<br />kept <span>secure.</span></p>
        </div>
        <div className="intake-hero-copy">
          <h1>Complete your <span>agency setup.</span></h1>
          <i aria-hidden="true" />
          <p>We’ll capture the information Arch9 needs to activate your agency and send your team the right access.</p>
        </div>
      </section>

      <section className={`intake-card${progressStep === 0 ? ' role-selection-card' : ''}${isComplete ? ' confirmation-card' : ''}`}>
        {isComplete ? (
          <div className="confirmation-content">
            <div className="intake-mini-brand confirmation-mini-brand" aria-label="Arch9">
              <strong>Arch9</strong>
            </div>
            <h1>Submission received.</h1>
            <p>Thanks, {principalName || agencyName || 'there'}.<br />Your agency onboarding has been received and queued for review.</p>
            {success ? <Notice tone="success" text={success} /> : null}
            <div className="lead-detail-section" id="agency-onboarding-summary">
              <h3>Submission summary</h3>
              <dl>
                {onboardingSummary.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {onboarding.agreementText ? (
              <div className="lead-detail-section" id="agency-onboarding-agreement">
                <h3>Agreement snapshot</h3>
                <pre className="agreement-text">{onboarding.agreementText}</pre>
              </div>
            ) : null}
            <div className="confirmation-actions">
              <a className="secondary-button" href={ARCH9_EXPLORE_URL}>Return to Arch9 <ChevronRight size={18} /></a>
            </div>
            <div className="confirmation-note">
              <CheckCircle2 size={18} />
              <span>Reference your secure link if we need to revisit the draft.</span>
            </div>
            <div className="confirmation-arc" aria-hidden="true" />
          </div>
        ) : (
          <>
            <IntakeProgress labels={stepLabels} step={progressStep} />

            <div className="intake-stack">
              <div className="lead-detail-section">
                <h3>Agency onboarding status</h3>
                <dl>
                  {onboardingSummary.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                {planInfo.summary ? <p className={`status-badge ${statusTone}`}>{planInfo.summary}</p> : null}
              </div>

              {progressStep === 0 ? (
                <div>
                  <h1>Tell us about the agency.</h1>
                  <p>We’ll use this to create the agency record and activate the onboarding journey.</p>
                </div>
              ) : null}

              {step === 0 ? (
                <div className="intake-field-grid">
                  <label className="intake-field wide">
                    <span>Agency name</span>
                    <input onChange={(event) => setValue('agencyName', event.target.value)} value={form.agencyName} />
                  </label>
                  <label className="intake-field wide">
                    <span>Legal entity name</span>
                    <input onChange={(event) => setValue('legalEntityName', event.target.value)} value={form.legalEntityName} />
                  </label>
                  <label className="intake-field">
                    <span>Company registration number</span>
                    <input onChange={(event) => setValue('companyRegistrationNumber', event.target.value)} value={form.companyRegistrationNumber} />
                  </label>
                  <label className="intake-field">
                    <span>FFC number <small>optional</small></span>
                    <input onChange={(event) => setValue('ffcNumber', event.target.value)} value={form.ffcNumber} />
                  </label>
                  <label className="intake-field">
                    <span>VAT number <small>optional</small></span>
                    <input onChange={(event) => setValue('vatNumber', event.target.value)} value={form.vatNumber} />
                  </label>
                  <label className="intake-field wide">
                    <span>Physical address</span>
                    <input onChange={(event) => setValue('physicalAddress', event.target.value)} value={form.physicalAddress} />
                  </label>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="intake-field-grid">
                  <label className="intake-field">
                    <span>Principal first name</span>
                    <input autoComplete="given-name" onChange={(event) => setValue('principalFirstName', event.target.value)} value={form.principalFirstName} />
                  </label>
                  <label className="intake-field">
                    <span>Principal surname</span>
                    <input autoComplete="family-name" onChange={(event) => setValue('principalSurname', event.target.value)} value={form.principalSurname} />
                  </label>
                  <label className="intake-field wide">
                    <span>Work email</span>
                    <input autoComplete="email" inputMode="email" onChange={(event) => setValue('principalEmail', event.target.value)} value={form.principalEmail} />
                  </label>
                  <label className="intake-field wide">
                    <span>Mobile number</span>
                    <input autoComplete="tel" inputMode="tel" onChange={(event) => setValue('principalMobile', event.target.value)} placeholder="082 123 4567" value={form.principalMobile} />
                  </label>
                  <label className="intake-field wide">
                    <span>Position</span>
                    <select onChange={(event) => setValue('principalPosition', event.target.value)} value={form.principalPosition}>
                      <option value="">Select</option>
                      {['Principal', 'Director / Owner', 'Manager', 'Agent', 'Administrator', 'Other'].map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="intake-field-grid">
                  <label className="intake-field">
                    <span>Approximate number of agents</span>
                    <select onChange={(event) => setValue('agentCountRange', event.target.value)} value={form.agentCountRange}>
                      <option value="">Select</option>
                      {AGENCY_ONBOARDING_AGENT_RANGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="intake-field">
                    <span>Branch count</span>
                    <select onChange={(event) => setValue('branchCount', event.target.value)} value={form.branchCount}>
                      <option value="">Select</option>
                      {AGENCY_ONBOARDING_BRANCH_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="intake-field wide">
                    <span>Plan name <small>optional</small></span>
                    <input onChange={(event) => setValue('planName', event.target.value)} value={form.planName} />
                  </label>
                  <label className="intake-field wide">
                    <span>Plan summary <small>optional</small></span>
                    <textarea onChange={(event) => setValue('planSummary', event.target.value)} rows={3} value={form.planSummary} />
                  </label>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="intake-stack">
                  <div>
                    <h1>Sign the agency services agreement.</h1>
                    <p>Please confirm your authority and sign the secure agreement below.</p>
                  </div>
                  <div className="lead-detail-section" id="agency-onboarding-agreement">
                    <h3>{AGENCY_ONBOARDING_AGREEMENT_TITLE}</h3>
                    <pre className="agreement-text">{form.agreementText || AGENCY_ONBOARDING_AGREEMENT_TEXT}</pre>
                  </div>
                  <div className="intake-field-grid">
                    <label className="intake-field wide">
                      <span>Full legal name</span>
                      <input onChange={(event) => setValue('agreementFullName', event.target.value)} value={form.agreementFullName} />
                    </label>
                    <label className="intake-field wide">
                      <span>Position / title</span>
                      <input onChange={(event) => setValue('agreementPosition', event.target.value)} value={form.agreementPosition} />
                    </label>
                  </div>
                  <div className="intake-check-grid two-col">
                    <button className={form.agreementAuthorityConfirmed ? 'selected' : ''} onClick={() => setValue('agreementAuthorityConfirmed', !form.agreementAuthorityConfirmed)} type="button">
                      <CheckCircle2 size={16} />
                      <span>I confirm I am authorised to sign for this agency.</span>
                    </button>
                    <button className={form.agreementAccepted ? 'selected' : ''} onClick={() => setValue('agreementAccepted', !form.agreementAccepted)} type="button">
                      <CheckCircle2 size={16} />
                      <span>I accept the Arch9 Agency Services Agreement.</span>
                    </button>
                  </div>
                </div>
              ) : null}

              {error ? <Notice tone="danger" text={error} /> : null}
              {success ? <Notice tone="success" text={success} /> : null}

              <div className="intake-actions">
                {step > 0 ? (
                  <button className="secondary-button" disabled={isSaving} onClick={goBack} type="button">
                    Back
                  </button>
                ) : (
                  <button className="secondary-button" disabled={isSaving} onClick={copyLink} type="button">
                    Copy Link
                  </button>
                )}
                <button
                  aria-disabled={!validateStep()}
                  className={`primary-button${!validateStep() ? ' is-soft-disabled' : ''}`}
                  disabled={isSaving}
                  onClick={continueFlow}
                  type="button"
                >
                  <span>{isSaving ? 'Saving...' : step === 3 ? 'Submit onboarding' : 'Continue'}</span>
                </button>
              </div>
            </div>
          </>
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
  const showDataControls = activeView !== 'prospects'
  const title =
    activeView === 'support'
      ? 'Support Queue'
      : activeView === 'inboundLeads'
        ? 'Leads'
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
                  : activeView === 'prospects'
                    ? 'Prospect Demo Generator'
                  : 'Operating Dashboard'

  const subtitle =
    activeView === 'dashboard'
      ? 'Platform performance and transaction activity.'
      : activeView === 'support'
        ? 'Open support work and operational exceptions.'
        : activeView === 'inboundLeads'
          ? 'Manage and convert platform leads.'
        : activeView === 'search'
          ? 'Find organisations, users, and transactions.'
          : activeView === 'settings'
            ? 'Access, environment, and data-contract status.'
            : activeView === 'prospects'
              ? 'Create a branded buyer onboarding and buyer portal demo.'
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
      {showDataControls ? (
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
      ) : null}
    </header>
  )
}

function ProspectColourField({ colour, description, label, onChange }) {
  const safeColour = normalizeHexColour(colour)

  return (
    <label className="prospect-colour-field">
      <span className="prospect-colour-swatch" style={{ backgroundColor: safeColour }} aria-hidden="true" />
      <span className="prospect-colour-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="prospect-colour-inputs">
        <input
          aria-label={`${label} hex colour`}
          className="prospect-hex-input"
          onChange={(event) => onChange(event.target.value)}
          value={colour}
        />
        <input
          aria-label={`${label} colour picker`}
          className="prospect-picker-input"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={safeColour}
        />
      </span>
    </label>
  )
}

function ProspectUploadField({ accept = 'image/*', helper, id, label, onFile, previewUrl }) {
  return (
    <label className={`prospect-upload-card${previewUrl ? ' has-preview' : ''}`} htmlFor={id}>
      <span className="prospect-upload-preview">
        {previewUrl ? (
          <img alt="" src={previewUrl} />
        ) : (
          <ImageIcon size={22} />
        )}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{helper}</small>
      </span>
      <span className="prospect-upload-action">
        <UploadCloud size={15} />
        {previewUrl ? 'Replace' : 'Upload'}
      </span>
      <input
        accept={accept}
        className="prospect-file-input"
        id={id}
        onChange={(event) => {
          const file = event.target.files?.[0] || null
          if (file) void onFile(file)
          event.target.value = ''
        }}
        type="file"
      />
    </label>
  )
}

function ProspectDemoPreview({ config }) {
  const agencyName = config.agencyName || 'Hello Group'
  const primaryColour = normalizeHexColour(config.primaryColour, '#274C69')
  const secondaryColour = normalizeHexColour(config.secondaryColour, '#10273A')
  const accentColour = normalizeHexColour(config.accentColour, '#F7CF22')
  const logoDarkUrl = config.logoDarkUrl || config.logoUrl || config.logoLightUrl || ''
  const logoLightUrl = config.logoLightUrl || config.logoUrl || config.logoDarkUrl || ''
  const propertyAddress = config.samplePropertyAddress || '12 Example Road, Sea Point'

  return (
    <aside className="prospect-preview-card" style={{ '--prospect-primary': primaryColour, '--prospect-secondary': secondaryColour, '--prospect-accent': accentColour }}>
      <div className="prospect-preview-hero">
        <div className="prospect-preview-brand">
          <span>
            {logoDarkUrl ? <img alt="" src={logoDarkUrl} /> : agencyName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{agencyName}</strong>
            <small>Buyer onboarding preview</small>
          </div>
        </div>
        <div className="prospect-preview-property">
          {config.samplePropertyImageUrl ? (
            <img alt="" src={config.samplePropertyImageUrl} />
          ) : (
            <div>
              <ImageIcon size={22} />
              <span>Property image</span>
            </div>
          )}
        </div>
      </div>
      <div className="prospect-preview-body">
        <span className="prospect-preview-pill">Demo mode</span>
        <h3>Let’s get your property purchase started.</h3>
        <p>{propertyAddress}</p>
        <button type="button">Start buyer onboarding</button>
      </div>
      <div className="prospect-preview-steps" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="prospect-logo-strip" aria-label="Logo variants">
        <span>
          <small>Light surface</small>
          {logoLightUrl ? <img alt="" src={logoLightUrl} /> : <b>Missing</b>}
        </span>
        <span className="dark">
          <small>Dark surface</small>
          {logoDarkUrl ? <img alt="" src={logoDarkUrl} /> : <b>Missing</b>}
        </span>
      </div>
    </aside>
  )
}

function ProspectLinkCard({ copied, label, link, onCopy }) {
  return (
    <article className="prospect-link-card">
      <div>
        <h3>{label}</h3>
        <p>{link}</p>
      </div>
      <div className="prospect-link-actions">
        <button className="secondary-button compact" disabled={!link} onClick={() => window.open(link, '_blank', 'noopener,noreferrer')} type="button">
          <ExternalLink size={15} />
          <span>Preview</span>
        </button>
        <button className="secondary-button compact" disabled={!link} onClick={onCopy} type="button">
          <Copy size={15} />
          <span>{copied ? 'Copied' : 'Copy Link'}</span>
        </button>
      </div>
    </article>
  )
}

function ProspectGeneratedDemoCard({ config, copiedKey, onCopy, onEdit }) {
  const onboardingLink = buildDemoLink(config.slug, 'onboarding')
  const buyerLink = buildDemoLink(config.slug, 'buyer')
  const logoUrl = config.logoDarkUrl || config.logoUrl || config.logoLightUrl

  return (
    <article className="prospect-history-card">
      <div className="prospect-history-main">
        <span className="prospect-history-logo">
          {logoUrl ? <img alt="" src={logoUrl} /> : (config.agencyName || config.slug || 'A').slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h3>{config.agencyName || config.slug || 'Prospect demo'}</h3>
          <p>{config.slug ? `/demo/${config.slug}/...` : 'No slug'}</p>
          <small>{config.updatedAt ? `Updated ${formatDate(config.updatedAt)}` : 'Generated demo'}</small>
        </div>
      </div>
      <div className="prospect-history-palette">
        {PROSPECT_DEMO_COLOUR_CONTROLS.map((control) => (
          <i
            aria-label={`${control.label} colour`}
            key={control.key}
            style={{ backgroundColor: config[control.key] || control.fallback }}
          />
        ))}
      </div>
      <div className="prospect-history-links">
        <ProspectLinkCard
          copied={copiedKey === `${config.slug}-onboarding`}
          label="Buyer Onboarding"
          link={onboardingLink}
          onCopy={() => void onCopy(`${config.slug}-onboarding`, onboardingLink)}
        />
        <ProspectLinkCard
          copied={copiedKey === `${config.slug}-buyer`}
          label="Buyer Portal"
          link={buyerLink}
          onCopy={() => void onCopy(`${config.slug}-buyer`, buyerLink)}
        />
      </div>
      <button className="secondary-button compact" onClick={() => onEdit(config)} type="button">
        <NotebookPen size={15} />
        <span>Use as form</span>
      </button>
    </article>
  )
}

function ProspectDemoGeneratorView() {
  const [form, setForm] = useState({
    agencyName: '',
    slug: '',
    primaryColour: '#274C69',
    secondaryColour: '#10273A',
    accentColour: '#F7CF22',
    logoUrl: '',
    logoLightUrl: '',
    logoDarkUrl: '',
    samplePropertyImageUrl: '',
    samplePropertyAddress: '',
  })
  const [activeTab, setActiveTab] = useState('create')
  const [generatedDemos, setGeneratedDemos] = useState([])
  const [isLoadingDemos, setIsLoadingDemos] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [savedConfig, setSavedConfig] = useState(null)
  const [slugTouched, setSlugTouched] = useState(false)
  const [copiedKey, setCopiedKey] = useState('')

  const activeSlug = normalizeDemoSlug(form.slug || form.agencyName || savedConfig?.slug)
  const buyerOnboardingLink = buildDemoLink(activeSlug, 'onboarding')
  const buyerPortalLink = buildDemoLink(activeSlug, 'buyer')
  const generatedConfig = {
    slug: activeSlug,
    agencyName: form.agencyName.trim(),
    logoUrl: form.logoUrl.trim() || form.logoLightUrl.trim() || form.logoDarkUrl.trim(),
    logoLightUrl: form.logoLightUrl.trim() || form.logoUrl.trim(),
    logoDarkUrl: form.logoDarkUrl.trim() || form.logoUrl.trim(),
    primaryColour: normalizeHexColour(form.primaryColour, '#274C69'),
    secondaryColour: normalizeHexColour(form.secondaryColour, '#10273A'),
    accentColour: normalizeHexColour(form.accentColour, '#F7CF22'),
    samplePropertyImageUrl: form.samplePropertyImageUrl.trim(),
    samplePropertyAddress: form.samplePropertyAddress.trim(),
  }
  const showLinks = Boolean(savedConfig?.slug)

  useEffect(() => {
    if (!supabase) return
    void loadGeneratedDemos()
  }, [])

  async function loadGeneratedDemos() {
    if (!supabase) return
    setIsLoadingDemos(true)
    try {
      const { data, error: loadError } = await supabase
        .from('prospect_demo_configs')
        .select(PROSPECT_DEMO_SELECT)
        .order('updated_at', { ascending: false })
        .limit(100)

      if (loadError) throw loadError
      setGeneratedDemos((data || []).map(mapProspectDemoConfig))
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load generated demos.')
    } finally {
      setIsLoadingDemos(false)
    }
  }

  async function copyLink(key, value) {
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((current) => (current === key ? '' : current)), 1200)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const slug = normalizeDemoSlug(form.slug || form.agencyName)
    if (!slug) {
      setError('Add an agency name or slug first.')
      return
    }

    if (!form.logoLightUrl.trim() || !form.logoDarkUrl.trim()) {
      setError('Upload both light and dark agency logos before generating the demo.')
      return
    }

    if (!supabase) {
      setError(getSupabaseConfigStatus().message)
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        slug,
        agency_name: form.agencyName.trim(),
        logo_url: form.logoLightUrl.trim() || form.logoDarkUrl.trim(),
        logo_light_url: form.logoLightUrl.trim(),
        logo_dark_url: form.logoDarkUrl.trim(),
        primary_colour: normalizeHexColour(form.primaryColour, '#274C69'),
        secondary_colour: normalizeHexColour(form.secondaryColour, '#10273A'),
        accent_colour: normalizeHexColour(form.accentColour, '#F7CF22'),
        sample_property_image_url: form.samplePropertyImageUrl.trim(),
        sample_property_address: form.samplePropertyAddress.trim(),
      }
      const { error: upsertError } = await supabase
        .from('prospect_demo_configs')
        .upsert(payload, { onConflict: 'slug' })

      if (upsertError) {
        throw upsertError
      }

      setSavedConfig({
        ...mapProspectDemoConfig(payload),
        updatedAt: new Date().toISOString(),
      })
      setGeneratedDemos((previous) => {
        const nextConfig = {
          ...mapProspectDemoConfig(payload),
          updatedAt: new Date().toISOString(),
        }
        return [nextConfig, ...previous.filter((item) => item.slug !== nextConfig.slug)]
      })
      setSuccess('Prospect demo generated. Copy the links below and send them to the prospect.')
      setActiveTab('create')
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save the prospect demo.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleImageUpload(field, file) {
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setForm((previous) => ({
        ...previous,
        [field]: dataUrl,
      }))
    } catch (fileError) {
      setError(fileError?.message || 'Unable to read the uploaded file.')
    }
  }

  function handleEditGeneratedDemo(config) {
    const nextConfig = mapProspectDemoConfig(config)
    setForm({
      agencyName: nextConfig.agencyName,
      slug: nextConfig.slug,
      primaryColour: nextConfig.primaryColour,
      secondaryColour: nextConfig.secondaryColour,
      accentColour: nextConfig.accentColour,
      logoUrl: nextConfig.logoUrl,
      logoLightUrl: nextConfig.logoLightUrl || nextConfig.logoUrl,
      logoDarkUrl: nextConfig.logoDarkUrl || nextConfig.logoUrl,
      samplePropertyImageUrl: nextConfig.samplePropertyImageUrl,
      samplePropertyAddress: nextConfig.samplePropertyAddress,
    })
    setSavedConfig(nextConfig)
    setSlugTouched(true)
    setError('')
    setSuccess('')
    setActiveTab('create')
  }

  return (
    <div className="prospect-demo-page">
      <section className="prospect-demo-panel">
        <div className="prospect-demo-panel-header">
          <div>
            <span className="prospect-demo-kicker">Internal utility</span>
            <h2>Create prospect demo links</h2>
            <p>Generate personalised buyer onboarding and buyer portal demos from existing Arch9 client experiences.</p>
          </div>
          <span className="prospect-demo-mode">Demo mode only</span>
        </div>

        <div className="prospect-demo-tabs" role="tablist" aria-label="Prospect demo generator">
          <button
            aria-selected={activeTab === 'create'}
            className={activeTab === 'create' ? 'active' : ''}
            onClick={() => setActiveTab('create')}
            role="tab"
            type="button"
          >
            <Plus size={15} />
            <span>Add prospect</span>
          </button>
          <button
            aria-selected={activeTab === 'generated'}
            className={activeTab === 'generated' ? 'active' : ''}
            onClick={() => {
              setActiveTab('generated')
              void loadGeneratedDemos()
            }}
            role="tab"
            type="button"
          >
            <ListChecks size={15} />
            <span>Generated demos</span>
            <small>{generatedDemos.length}</small>
          </button>
        </div>

        {activeTab === 'create' ? (
        <div className="prospect-demo-grid">
          <form className="prospect-demo-form" onSubmit={handleSubmit}>
            {error ? <Notice tone="danger" text={error} /> : null}
            {success ? <Notice tone="success" text={success} /> : null}
            {!isSupabaseConfigured ? <Notice tone="warning" text={getSupabaseConfigStatus().message} /> : null}

            <div className="prospect-form-section">
              <div className="prospect-section-heading">
                <Building2 size={17} />
                <div>
                  <h3>Prospect</h3>
                  <p>Name the agency and confirm the public URL slug.</p>
                </div>
              </div>
              <div className="prospect-field-grid">
                <label className="prospect-field">
                  <span>Agency name</span>
                  <input
                    onChange={(event) => {
                      const value = event.target.value
                      setForm((previous) => ({
                        ...previous,
                        agencyName: value,
                        slug: slugTouched ? previous.slug : normalizeDemoSlug(value),
                      }))
                    }}
                    placeholder="Hello Group"
                    value={form.agencyName}
                  />
                </label>
                <label className="prospect-field">
                  <span>URL slug</span>
                  <input
                    onChange={(event) => {
                      setSlugTouched(true)
                      setForm((previous) => ({ ...previous, slug: normalizeDemoSlug(event.target.value) }))
                    }}
                    placeholder="hello-group"
                    value={form.slug}
                  />
                  <small>{activeSlug ? `/demo/${activeSlug}/buyer` : 'Used in both demo links'}</small>
                </label>
              </div>
            </div>

            <div className="prospect-form-section">
              <div className="prospect-section-heading">
                <Palette size={17} />
                <div>
                  <h3>Brand palette</h3>
                  <p>Matches Organisation Settings: primary, secondary and accent colours.</p>
                </div>
              </div>
              <div className="prospect-colour-grid">
                {PROSPECT_DEMO_COLOUR_CONTROLS.map((control) => (
                  <ProspectColourField
                    key={control.key}
                    colour={form[control.key]}
                    description={control.description}
                    label={control.label}
                    onChange={(value) => setForm((previous) => ({ ...previous, [control.key]: value }))}
                  />
                ))}
              </div>
            </div>

            <div className="prospect-form-section">
              <div className="prospect-section-heading">
                <ImageIcon size={17} />
                <div>
                  <h3>Demo assets</h3>
                  <p>Upload both logo variants, matching Organisation Settings. Property details are optional.</p>
                </div>
              </div>
              <div className="prospect-upload-grid">
                <ProspectUploadField
                  helper="For documents and light UI surfaces"
                  id="prospect-logo-light-upload"
                  label="Light logo"
                  onFile={(file) => handleImageUpload('logoLightUrl', file)}
                  previewUrl={form.logoLightUrl}
                />
                <ProspectUploadField
                  helper="For dark headers and branded hero areas"
                  id="prospect-logo-dark-upload"
                  label="Dark logo"
                  onFile={(file) => handleImageUpload('logoDarkUrl', file)}
                  previewUrl={form.logoDarkUrl}
                />
                <ProspectUploadField
                  helper="Optional hero image for the sample property"
                  id="prospect-property-upload"
                  label="Property image"
                  onFile={(file) => handleImageUpload('samplePropertyImageUrl', file)}
                  previewUrl={form.samplePropertyImageUrl}
                />
              </div>
              <label className="prospect-field">
                <span>Sample property address</span>
                <input
                  onChange={(event) => setForm((previous) => ({ ...previous, samplePropertyAddress: event.target.value }))}
                  placeholder="12 Example Road, Sea Point"
                  value={form.samplePropertyAddress}
                />
              </label>
            </div>

            <div className="prospect-submit-row">
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                <span>Generate Demo</span>
              </button>
              <p>No buyers, transactions, notifications or workflow actions are created.</p>
            </div>
          </form>

          <div className="prospect-preview-column">
            <ProspectDemoPreview config={generatedConfig} />
            <div className="prospect-link-preview">
              <span>Link preview</span>
              <strong>{activeSlug ? `${ARCH9_PUBLIC_URL}/demo/${activeSlug}/...` : 'Add an agency name to preview links'}</strong>
            </div>
          </div>
        </div>
        ) : (
          <section className="prospect-history-panel">
            {error ? <Notice tone="danger" text={error} /> : null}
            <div className="prospect-history-toolbar">
              <div>
                <h3>Generated prospect demos</h3>
                <p>Reopen, preview or copy previously generated buyer demo links.</p>
              </div>
              <button className="secondary-button compact" disabled={isLoadingDemos} onClick={() => void loadGeneratedDemos()} type="button">
                {isLoadingDemos ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
                <span>Refresh</span>
              </button>
            </div>
            {isLoadingDemos ? (
              <div className="prospect-history-empty">
                <Loader2 className="spin" size={20} />
                <p>Loading generated demos...</p>
              </div>
            ) : generatedDemos.length ? (
              <div className="prospect-history-grid">
                {generatedDemos.map((config) => (
                  <ProspectGeneratedDemoCard
                    config={config}
                    copiedKey={copiedKey}
                    key={config.slug}
                    onCopy={copyLink}
                    onEdit={handleEditGeneratedDemo}
                  />
                ))}
              </div>
            ) : (
              <div className="prospect-history-empty">
                <ListChecks size={22} />
                <p>No demos generated yet. Add a prospect and the saved links will appear here.</p>
              </div>
            )}
          </section>
        )}
      </section>

      {showLinks && activeTab === 'create' ? (
        <section className="prospect-links-panel">
          <div className="prospect-demo-panel-header compact">
            <div>
              <span className="prospect-demo-kicker">Ready for outreach</span>
              <h2>Generated links</h2>
              <p>{generatedConfig.agencyName || generatedConfig.slug || 'Prospect demo'}</p>
            </div>
          </div>

          <div className="prospect-generated-summary">
            <span>{generatedConfig.slug}</span>
            {PROSPECT_DEMO_COLOUR_CONTROLS.map((control) => (
              <small key={control.key}>
                <i style={{ backgroundColor: generatedConfig[control.key] || control.fallback }} />
                {control.label}: {generatedConfig[control.key] || control.fallback}
              </small>
            ))}
          </div>

          <div className="prospect-links-grid">
            <ProspectLinkCard
              copied={copiedKey === 'onboarding'}
              label="Buyer Onboarding"
              link={buyerOnboardingLink}
              onCopy={() => void copyLink('onboarding', buyerOnboardingLink)}
            />
            <ProspectLinkCard
              copied={copiedKey === 'buyer'}
              label="Buyer Portal"
              link={buyerPortalLink}
              onCopy={() => void copyLink('buyer', buyerPortalLink)}
            />
          </div>
        </section>
      ) : null}
    </div>
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

function DashboardView({ inboundSnapshot, isLoading, snapshot, support, onOpenLeads }) {
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

  const leads = (inboundSnapshot?.leads || [])
    .slice()
    .sort((left, right) => new Date(right.created_at || right.createdAt || 0) - new Date(left.created_at || left.createdAt || 0))

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
        <LeadsSnapshotCard
          leads={leads}
          onOpenLeads={onOpenLeads}
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

function LeadsSnapshotCard({ leads = [], onOpenLeads }) {
  return (
    <section className="dashboard-card leads-card">
      <div className="panel-title">
        <div>
          <h2>Leads</h2>
          <span>{formatCount(leads.length)} captured leads</span>
        </div>
        <button className="text-button" onClick={onOpenLeads} type="button">View leads</button>
      </div>
      <div className="lead-preview-list">
        {leads.length ? leads.slice(0, 4).map((lead) => {
          const interests = (lead.selectedInterests || []).slice(0, 2)
          const scale = getLeadScaleLines(lead)
          return (
            <button className="lead-preview-row" key={lead.id} onClick={onOpenLeads} type="button">
              <div className="lead-preview-main">
                <div className="lead-preview-heading">
                  <span className="lead-preview-initials">{getInitials(lead.fullName)}</span>
                  <div>
                    <strong>{lead.fullName || 'Untitled lead'}</strong>
                    <small>{lead.organisationName || lead.position || 'No organisation captured'}</small>
                  </div>
                </div>
                <div className="lead-preview-tags">
                  <span className={`status-badge ${lead.status}`}>{formatInboundStatus(lead.status)}</span>
                  <span>{formatSource(lead.source)}</span>
                  <span>{formatDate(lead.created_at || lead.createdAt)}</span>
                </div>
              </div>
              <div className="lead-preview-side">
                {scale.slice(0, 2).map((item) => <span key={item}>{item}</span>)}
                {interests.length ? <small>{interests.join(' · ')}</small> : <small>No interests yet</small>}
              </div>
            </button>
          )
        }) : <p className="empty-state">Platform leads will appear here once the inbound RPC returns rows.</p>}
      </div>
    </section>
  )
}

function LeadJourney({ lead = {}, activities = [] }) {
  const isAgencyLead = lead.roleType === 'agency' || Boolean(lead.agencyOnboarding?.token)
  const steps = isAgencyLead ? buildAgencyOnboardingJourneySteps(lead) : buildLeadJourneySteps(lead, activities)

  return (
    <div className="lead-journey">
      <div className="panel-title compact">
        <div>
          <h3>{isAgencyLead ? 'Agency Journey' : 'Buyer Journey'}</h3>
          <span>Vertical view for mobile</span>
        </div>
        <span className={`status-badge ${lead.status}`}>{isAgencyLead ? formatAgencyOnboardingStatus(lead.agencyOnboarding?.status || 'not_started') : formatInboundStatus(lead.status)}</span>
      </div>
      <div className="journey-stack">
        {steps.map((step) => (
          <article className={`journey-step ${step.tone}`} key={step.id}>
            <div className="journey-rail" aria-hidden="true">
              <span className="journey-dot" />
              <span className="journey-line" />
            </div>
            <div className="journey-copy">
              <small>{step.label}</small>
              <strong>{step.value}</strong>
              <span>{step.detail}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function AgencyOnboardingSection({ lead, onRefresh }) {
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const onboarding = lead.agencyOnboarding || {}
  const status = onboarding.status || 'not_started'
  const token = onboarding.token || ''
  const onboardingUrl = buildAgencyOnboardingUrl(token)
  const planInfo = getAgencyPlanInfo(lead)
  const agencyName = normalizeText(onboarding.formData?.agencyName || lead.organisationName || '')
  const principalName = normalizeText(
    [onboarding.contactFirstName, onboarding.contactLastName].filter(Boolean).join(' '),
  ) || normalizeText([lead.firstName, lead.lastName].filter(Boolean).join(' '))
  const agreementRows = [
    ['Status', formatAgencyOnboardingStatus(status)],
    ['Current step', formatAgencyOnboardingStep(onboarding.currentStep || 'agency_details')],
    ['Link', onboardingUrl || 'Not generated'],
    ['Created', formatDateTime(onboarding.linkCreatedAt)],
    ['Sent', formatDateTime(onboarding.linkSentAt)],
    ['Opened', formatDateTime(onboarding.lastOpenedAt || onboarding.firstOpenedAt)],
    ['Started', formatDateTime(onboarding.startedAt)],
    ['Submitted', formatDateTime(onboarding.submittedAt)],
    ['Agreement accepted', formatDateTime(onboarding.agreementAcceptedAt)],
    ['Approved', formatDateTime(onboarding.approvedAt)],
    ['Activated', formatDateTime(onboarding.activatedAt)],
    ['Cancelled', formatDateTime(onboarding.cancelledAt)],
    ['Expires', formatDateTime(onboarding.expiresAt)],
  ]
  const mutationLocked = isBusy || ['active', 'expired', 'cancelled'].includes(status)

  async function refreshLead(result) {
    if (result?.data) {
      await onRefresh?.()
      return result.data
    }
    await onRefresh?.()
    return null
  }

  async function startOnboarding() {
    setError('')
    setIsBusy(true)
    const result = await startAgencyOnboarding(lead.id, buildAgencyOnboardingAdminPatch(lead))
    setIsBusy(false)
    if (result.error || !result.data) {
      setError(result.error || 'Unable to start agency onboarding.')
      return
    }
    await refreshLead(result)
  }

  async function sendOnboardingLink() {
    setError('')
    setIsBusy(true)
    const sendResult = await sendAgencyOnboardingLink(lead.id, buildAgencyOnboardingAdminPatch(lead))
    if (sendResult.error || !sendResult.data) {
      setIsBusy(false)
      setError(sendResult.error || 'Unable to prepare the onboarding link.')
      return
    }

    const emailResult = await sendAgencyOnboardingEmail(sendResult.data)
    setIsBusy(false)
    if (emailResult.error) {
      setError(emailResult.error || 'Onboarding link created, but the email could not be sent.')
      await refreshLead(sendResult)
      return
    }

    await refreshLead(sendResult)
  }

  async function replaceLink() {
    setError('')
    setIsBusy(true)
    const result = await replaceAgencyOnboardingLink(lead.id)
    setIsBusy(false)
    if (result.error || !result.data) {
      setError(result.error || 'Unable to replace the onboarding link.')
      return
    }
    await refreshLead(result)
  }

  async function cancelOnboarding() {
    setError('')
    setIsBusy(true)
    const result = await updateAgencyOnboardingStatus(lead.id, 'cancelled')
    setIsBusy(false)
    if (result.error || !result.data) {
      setError(result.error || 'Unable to cancel the onboarding.')
      return
    }
    await refreshLead(result)
  }

  async function activateOnboarding() {
    setError('')
    setIsBusy(true)
    const result = await activateAgencyOnboarding(lead.id)
    setIsBusy(false)
    if (result.error || !result.data) {
      setError(result.error || 'Unable to activate the agency.')
      return
    }
    await refreshLead(result)
  }

  async function copyLink() {
    if (!onboardingUrl || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(onboardingUrl)
  }

  function openLink() {
    if (!onboardingUrl || typeof window === 'undefined') return
    window.open(onboardingUrl, '_blank', 'noopener,noreferrer')
  }

  function viewSection(id) {
    if (typeof document === 'undefined') return
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isSubmitted = ['submitted', 'approved', 'active'].includes(status)

  return (
    <section className="lead-detail-section" id="agency-onboarding-summary">
      <h3>Agency Onboarding</h3>
      {error ? <Notice tone="danger" text={error} /> : null}
      <dl>
        {agreementRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>Agency</dt>
          <dd>{agencyName || 'Not captured'}</dd>
        </div>
        <div>
          <dt>Principal</dt>
          <dd>{principalName || 'Not captured'}</dd>
        </div>
        <div>
          <dt>Plan</dt>
          <dd>{planInfo.name || 'No plan captured'}</dd>
        </div>
      </dl>

      {onboarding.agreementText ? (
        <div className="lead-detail-section" id="agency-onboarding-agreement">
          <h4>Agreement</h4>
          <pre className="agreement-text">{onboarding.agreementText}</pre>
        </div>
      ) : null}

      <div className="lead-workspace-controls">
        {!token ? (
          <button className="secondary-button" disabled={mutationLocked} onClick={startOnboarding} type="button">
            <Plus size={16} />
            <span>Start Agency Onboarding</span>
          </button>
        ) : null}
        <button className="secondary-button" disabled={!token || mutationLocked} onClick={sendOnboardingLink} type="button">
          <RefreshCw size={16} />
          <span>Send Onboarding Link</span>
        </button>
        <button className="secondary-button" disabled={!token} onClick={copyLink} type="button">
          <Copy size={16} />
          <span>Copy Onboarding Link</span>
        </button>
        <button className="secondary-button" disabled={!token} onClick={openLink} type="button">
          <Search size={16} />
          <span>Open Onboarding Page</span>
        </button>
        <button className="secondary-button" disabled={!token || mutationLocked} onClick={replaceLink} type="button">
          <RefreshCw size={16} />
          <span>Replace Link</span>
        </button>
        <button className="secondary-button" disabled={!token || mutationLocked} onClick={cancelOnboarding} type="button">
          <X size={16} />
          <span>Cancel Onboarding</span>
        </button>
        {isSubmitted ? (
          <>
            <button className="secondary-button" onClick={() => viewSection('agency-onboarding-summary')} type="button">
              <ListChecks size={16} />
              <span>View Submission</span>
            </button>
            <button className="secondary-button" onClick={() => viewSection('agency-onboarding-agreement')} type="button">
              <NotebookPen size={16} />
              <span>View Agreement</span>
            </button>
            <button className="secondary-button" onClick={() => window.open(pathForView('organisations'), '_blank', 'noopener,noreferrer')} type="button">
              <Building2 size={16} />
              <span>Open Agency</span>
            </button>
            <button className="primary-button compact" disabled={mutationLocked || status === 'active'} onClick={activateOnboarding} type="button">
              <CheckCircle2 size={16} />
              <span>{status === 'active' ? 'Agency Active' : 'Activate Agency'}</span>
            </button>
          </>
        ) : null}
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
          <>
            <table className="inbound-leads-table desktop-leads-table">
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
                      <td>{formatDate(lead.created_at || lead.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="mobile-leads-list" aria-label="Inbound leads">
              {leads.map((lead) => {
                const scale = getLeadScaleLines(lead)
                const interests = lead.selectedInterests || []
                return (
                  <button
                    className={`mobile-lead-card ${selectedLeadId === lead.id ? 'selected-row' : ''}`}
                    key={lead.id}
                    onClick={() => onSelect(lead)}
                    type="button"
                  >
                    <div className="mobile-lead-card-head">
                      <div className="lead-name-cell">
                        <b>{getInitials(lead.fullName)}</b>
                        <span>
                          <strong>{lead.fullName}</strong>
                          <small>{lead.position || 'No position'}</small>
                        </span>
                      </div>
                      <span className={`status-badge ${lead.status}`}>{formatInboundStatus(lead.status)}</span>
                    </div>
                    <div className="mobile-lead-card-grid">
                      <div>
                        <span>Organisation</span>
                        <strong>{lead.organisationName || 'Not captured'}</strong>
                      </div>
                      <div>
                        <span>Contact</span>
                        <strong>{lead.email}</strong>
                        <small>{lead.mobile}</small>
                      </div>
                      <div>
                        <span>Source</span>
                        <strong>{formatSource(lead.source)}</strong>
                      </div>
                      <div>
                        <span>Owner</span>
                        <strong>{lead.ownerLabel || 'Unassigned'}</strong>
                      </div>
                    </div>
                    <div className="mobile-lead-card-foot">
                      <div className="mobile-lead-lines">
                        {scale.length ? scale.map((item) => <span key={item}>{item}</span>) : <span>No scale yet</span>}
                      </div>
                      <div className="chip-list mobile-chip-list">
                        {interests.slice(0, 3).map((interest) => <span key={interest}>{interest}</span>)}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
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
  const isAgencyLead = lead.roleType === 'agency' || Boolean(lead.agencyOnboarding?.token)

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

      {isAgencyLead ? <AgencyOnboardingSection lead={lead} onRefresh={onRefresh} /> : null}

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

      <LeadJourney activities={leadActivities} lead={lead} />
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

  if (pathname === '/onboarding/agency' || pathname === '/onboarding/agency/' || pathname.startsWith('/onboarding/agency/')) {
    return <AgencyOnboardingPage />
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
        {view === 'dashboard' ? <DashboardView inboundSnapshot={inbound} isLoading={isLoading} onOpenLeads={() => navigate('inboundLeads')} snapshot={dashboard} support={support} /> : null}
        {view === 'inboundLeads' ? <InboundLeadsView onRefresh={() => refreshData()} snapshot={inbound} /> : null}
        {['organisations', 'transactions', 'users', 'reports'].includes(view) ? (
          <AdminWorkspaceView snapshot={dashboard} type={view} />
        ) : null}
        {view === 'prospects' ? <ProspectDemoGeneratorView /> : null}
        {view === 'support' ? <SupportView dashboard={dashboard} snapshot={support} /> : null}
        {view === 'search' ? <SearchView /> : null}
        {view === 'settings' ? <SettingsView access={access} profile={profile} /> : null}
      </main>
    </div>
  )
}
