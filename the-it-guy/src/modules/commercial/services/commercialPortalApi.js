import { createScopedSupabaseClient, invokeEdgeFunction, isSupabaseConfigured, supabase } from '../../../lib/supabaseClient'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import { buildCommercialTransactions } from './commercialPlatformApi'

const PORTAL_HEADER = 'x-bridge-commercial-portal-token'
const PORTAL_ACCESS_TABLE = 'commercial_portal_access'
const PORTAL_CONTACTS_TABLE = 'commercial_portal_contacts'
const PORTAL_MESSAGES_TABLE = 'commercial_portal_messages'
const PORTAL_NOTIFICATIONS_TABLE = 'commercial_portal_notifications'
const PORTAL_AUDIT_TABLE = 'commercial_portal_audit_events'
const COMMERCIAL_DOCUMENTS_TABLE = 'commercial_documents'
const COMMERCIAL_DOCUMENT_REQUESTS_TABLE = 'commercial_document_requests'
const COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES = ['documents', 'transaction-documents', 'private-listing-documents']

export const COMMERCIAL_PORTAL_ROLES = {
  tenant: 'tenant',
  landlord: 'landlord',
  buyer: 'buyer',
  seller: 'seller',
  investor: 'investor',
  propertyManager: 'property_manager',
  corporateContact: 'corporate_contact',
}

const ROLE_LABELS = {
  tenant: 'Tenant Portal',
  landlord: 'Landlord Portal',
  buyer: 'Buyer Portal',
  seller: 'Seller Portal',
  investor: 'Investor Portal',
  property_manager: 'Property Manager Portal',
  corporate_contact: 'Corporate Contact Portal',
}

export const COMMERCIAL_PORTAL_ROLE_OPTIONS = [
  { value: COMMERCIAL_PORTAL_ROLES.landlord, label: 'Landlord' },
  { value: COMMERCIAL_PORTAL_ROLES.tenant, label: 'Tenant' },
  { value: COMMERCIAL_PORTAL_ROLES.buyer, label: 'Buyer' },
  { value: COMMERCIAL_PORTAL_ROLES.seller, label: 'Seller' },
  { value: COMMERCIAL_PORTAL_ROLES.investor, label: 'Investor' },
  { value: COMMERCIAL_PORTAL_ROLES.propertyManager, label: 'Property Manager' },
  { value: COMMERCIAL_PORTAL_ROLES.corporateContact, label: 'Corporate Contact' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function addDays(days = 30) {
  const date = new Date()
  date.setDate(date.getDate() + Number(days || 30))
  return date.toISOString()
}

function buildAbsoluteUrl(path = '') {
  const normalizedPath = normalizeText(path)
  if (!normalizedPath) return ''
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath
  if (typeof window === 'undefined' || !window.location?.origin) return normalizedPath
  return `${window.location.origin}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`
}

function isMissingPortalTable(error, table = '') {
  if (!error) return false
  const code = normalizeText(error.code).toUpperCase()
  const message = normalizeLower(error.message)
  return code === '42P01' || code === 'PGRST205' || message.includes(table) || message.includes('does not exist')
}

function createPortalToken() {
  const bytes = new Uint8Array(24)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

function safeFileName(value = '') {
  return normalizeText(value || 'document')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'document'
}

function getPortalClient(token = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Commercial portal token is required.')
  const client = createScopedSupabaseClient({ [PORTAL_HEADER]: normalizedToken })
  if (!client) throw new Error('Supabase is not configured.')
  return client
}

function requireInternalClient() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function normalizePortalRole(value = '') {
  const normalized = normalizeLower(value).replace(/-/g, '_')
  if (normalized === 'landlord') return COMMERCIAL_PORTAL_ROLES.landlord
  if (normalized === 'buyer') return COMMERCIAL_PORTAL_ROLES.buyer
  if (normalized === 'seller') return COMMERCIAL_PORTAL_ROLES.seller
  if (normalized === 'investor') return COMMERCIAL_PORTAL_ROLES.investor
  if (normalized === 'property_manager' || normalized === 'manager') return COMMERCIAL_PORTAL_ROLES.propertyManager
  if (normalized === 'corporate_contact' || normalized === 'client' || normalized === 'representative') return COMMERCIAL_PORTAL_ROLES.corporateContact
  return COMMERCIAL_PORTAL_ROLES.tenant
}

function portalRoleLabel(role = '') {
  return ROLE_LABELS[normalizePortalRole(role)] || ROLE_LABELS.tenant
}

function defaultVisibility(role = 'tenant') {
  const normalizedRole = normalizePortalRole(role)
  const base = {
    documents: true,
    timeline: true,
    messages: true,
    lease: true,
    properties: true,
    requirements: true,
    viewings: true,
    transactions: true,
    reports: normalizedRole === 'investor',
    internalNotes: false,
    commissions: false,
    managementReporting: false,
  }
  if (['buyer', 'seller', 'investor'].includes(normalizedRole)) base.lease = false
  return base
}

function getTransactionPrimaryIds(transaction = {}) {
  return {
    commercial_transaction_id: transaction.id || null,
    deal_id: transaction.deal?.id || null,
    heads_of_terms_id: transaction.hot?.id || null,
    lease_id: transaction.lease?.id || null,
    requirement_id: transaction.requirement?.id || null,
    tenant_id: transaction.tenant?.id || null,
    landlord_id: transaction.landlord?.id || null,
    property_id: transaction.property?.id || null,
    vacancy_id: transaction.vacancy?.id || null,
    listing_id: transaction.listing?.id || null,
    company_id: transaction.company?.id || transaction.company_id || null,
    commercial_contact_id: transaction.contact?.id || transaction.contact_id || null,
  }
}

function entityPairsFromAccess(access = {}) {
  return [
    ['commercial_transaction', access.commercial_transaction_id],
    ['commercial_deal', access.deal_id],
    ['commercial_heads_of_terms', access.heads_of_terms_id],
    ['commercial_lease', access.lease_id],
    ['commercial_requirement', access.requirement_id],
    ['commercial_tenant', access.tenant_id],
    ['commercial_landlord', access.landlord_id],
    ['commercial_property', access.property_id],
    ['commercial_vacancy', access.vacancy_id],
    ['commercial_listing', access.listing_id],
    ['commercial_company', access.company_id],
    ['commercial_contact', access.commercial_contact_id],
  ].filter(([, id]) => normalizeText(id))
}

function roleEntityType(role = '') {
  const normalizedRole = normalizePortalRole(role)
  if (['landlord', 'seller', 'property_manager'].includes(normalizedRole)) return 'commercial_landlord'
  if (['buyer', 'tenant', 'investor', 'corporate_contact'].includes(normalizedRole)) return 'commercial_company'
  return 'commercial_company'
}

async function fetchPortalAccess(client, token) {
  const { data, error } = await client
    .from(PORTAL_ACCESS_TABLE)
    .select('*')
    .eq('token', normalizeText(token))
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    if (isMissingPortalTable(error, PORTAL_ACCESS_TABLE)) throw new Error('Commercial portal access is not configured.')
    throw error
  }
  if (!data) throw new Error('Commercial portal link is invalid or inactive.')
  const expiry = asDate(data.expires_at)
  if (expiry && expiry < new Date()) throw new Error('Commercial portal link has expired.')
  return data
}

async function fetchContact(client, contactId) {
  if (!contactId) return null
  const { data, error } = await client
    .from(PORTAL_CONTACTS_TABLE)
    .select('*')
    .eq('id', contactId)
    .maybeSingle()
  if (error) {
    if (isMissingPortalTable(error, PORTAL_CONTACTS_TABLE)) return null
    throw error
  }
  return data || null
}

async function fetchRowsByIds(client, table, ids = []) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
  if (!uniqueIds.length) return []
  const { data, error } = await client.from(table).select('*').in('id', uniqueIds)
  if (error) {
    if (isMissingPortalTable(error, table)) return []
    throw error
  }
  return data || []
}

async function fetchPortalViewings(client, access = {}) {
  const { data, error } = await client
    .from('commercial_viewings')
    .select('*')
    .eq('organisation_id', access.organisation_id)
    .order('viewing_date', { ascending: false })

  if (error) {
    if (isMissingPortalTable(error, 'commercial_viewings')) return []
    throw error
  }

  const keys = new Set([
    `requirement_id:${access.requirement_id}`,
    `property_id:${access.property_id}`,
    `vacancy_id:${access.vacancy_id}`,
    `listing_id:${access.listing_id}`,
    `company_id:${access.company_id}`,
    `contact_id:${access.commercial_contact_id}`,
  ].filter((key) => !key.endsWith(':')))

  return (data || []).filter((row) => [
    `requirement_id:${row.requirement_id}`,
    `property_id:${row.property_id}`,
    `vacancy_id:${row.vacancy_id}`,
    `listing_id:${row.listing_id}`,
    `company_id:${row.company_id}`,
    `contact_id:${row.contact_id}`,
  ].some((key) => keys.has(key)))
}

async function fetchRelatedPortalRows(client, access = {}) {
  const [transactions, deals, headsOfTerms, leases, requirements, companies, contacts, tenants, landlords, properties, vacancies, listings, viewings] = await Promise.all([
    fetchRowsByIds(client, 'commercial_transactions', [access.commercial_transaction_id]),
    fetchRowsByIds(client, 'commercial_deals', [access.deal_id]),
    fetchRowsByIds(client, 'commercial_heads_of_terms', [access.heads_of_terms_id]),
    fetchRowsByIds(client, 'commercial_leases', [access.lease_id]),
    fetchRowsByIds(client, 'commercial_requirements', [access.requirement_id]),
    fetchRowsByIds(client, 'commercial_companies', [access.company_id]),
    fetchRowsByIds(client, 'commercial_contacts', [access.commercial_contact_id]),
    fetchRowsByIds(client, 'commercial_tenants', [access.tenant_id]),
    fetchRowsByIds(client, 'commercial_landlords', [access.landlord_id]),
    fetchRowsByIds(client, 'commercial_properties', [access.property_id]),
    fetchRowsByIds(client, 'commercial_vacancies', [access.vacancy_id]),
    fetchRowsByIds(client, 'commercial_listings', [access.listing_id]),
    fetchPortalViewings(client, access),
  ])

  return { transactions, deals, headsOfTerms, leases, requirements, companies, contacts, tenants, landlords, properties, vacancies, listings, viewings }
}

async function fetchPortalDocuments(client, access = {}) {
  const pairs = entityPairsFromAccess(access)
  if (!pairs.length) return []
  const { data, error } = await client
    .from(COMMERCIAL_DOCUMENTS_TABLE)
    .select('*')
    .eq('organisation_id', access.organisation_id)
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingPortalTable(error, COMMERCIAL_DOCUMENTS_TABLE)) return []
    throw error
  }
  const keys = new Set(pairs.map(([type, id]) => `${type}:${id}`))
  return (data || []).filter((row) => keys.has(`${row.entity_type}:${row.entity_id}`))
}

async function fetchPortalDocumentRequests(client, access = {}) {
  const pairs = entityPairsFromAccess(access)
  if (!pairs.length) return []
  const { data, error } = await client
    .from(COMMERCIAL_DOCUMENT_REQUESTS_TABLE)
    .select('*')
    .eq('organisation_id', access.organisation_id)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingPortalTable(error, COMMERCIAL_DOCUMENT_REQUESTS_TABLE)) return []
    throw error
  }
  const keys = new Set(pairs.map(([type, id]) => `${type}:${id}`))
  return (data || []).filter((row) => keys.has(`${row.entity_type}:${row.entity_id}`))
}

async function fetchPortalMessages(client, access = {}) {
  const { data, error } = await client
    .from(PORTAL_MESSAGES_TABLE)
    .select('*')
    .eq('access_id', access.id)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingPortalTable(error, PORTAL_MESSAGES_TABLE)) return []
    throw error
  }
  return data || []
}

async function fetchPortalNotifications(client, access = {}) {
  const { data, error } = await client
    .from(PORTAL_NOTIFICATIONS_TABLE)
    .select('*')
    .eq('access_id', access.id)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingPortalTable(error, PORTAL_NOTIFICATIONS_TABLE)) return []
    throw error
  }
  return data || []
}

function portalStatusLabel(entity, status = '') {
  const normalized = normalizeLower(status)
  if (entity === 'lease' && normalized === 'pending_signature') return 'Awaiting Signature'
  if (normalized === 'hot_draft') return 'Draft'
  if (normalized === 'hot_sent') return 'Sent'
  if (normalized === 'under_review') return 'Under Review'
  if (normalized === 'lease_pending') return 'Lease In Progress'
  if (normalized === 'converted') return 'Finalised'
  return titleize(normalized || 'in_progress')
}

function buildPortalProgress(transaction = {}) {
  const hasRequirement = Boolean(transaction.requirement?.id)
  const hasDeal = Boolean(transaction.deal?.id)
  const hasHot = Boolean(transaction.hot?.id)
  const hasLease = Boolean(transaction.lease?.id)
  const hasTransaction = Boolean(transaction.id)
  return [
    { key: 'requirement', label: 'Requirement', status: hasRequirement ? 'completed' : 'pending', detail: hasRequirement ? 'Submitted' : 'Pending' },
    { key: 'deal', label: 'Deal', status: hasDeal ? 'completed' : 'pending', detail: hasDeal ? 'Created' : 'Pending' },
    { key: 'transaction', label: 'Transaction', status: hasTransaction ? 'in_progress' : 'pending', detail: portalStatusLabel('transaction', transaction.status || transaction.currentStage || '') },
    { key: 'hot', label: 'Heads of Terms', status: hasHot ? 'completed' : 'pending', detail: portalStatusLabel('hot', transaction.hot?.status || '') },
    { key: 'lease', label: 'Lease', status: hasLease ? (normalizeLower(transaction.lease?.status) === 'active' ? 'completed' : 'in_progress') : 'pending', detail: portalStatusLabel('lease', transaction.lease?.status || '') },
  ]
}

function buildClientSafeTimeline(transaction = {}, documents = [], viewings = [], messages = []) {
  const rows = []
  if (transaction.requirement?.id) rows.push({ id: 'requirement', title: 'Requirement Submitted', detail: 'Your requirement has been captured.', date: transaction.requirement.created_at })
  if (transaction.id) rows.push({ id: 'transaction', title: 'Transaction Created', detail: 'A commercial transaction workspace has been opened.', date: transaction.createdAt || transaction.created_at })
  if (transaction.vacancy?.id) rows.push({ id: 'vacancy', title: 'Property Selected', detail: transaction.property?.property_name || 'A property has been linked.', date: transaction.vacancy.updated_at || transaction.vacancy.created_at })
  viewings.slice(0, 8).forEach((viewing) => {
    const status = normalizeLower(viewing.status)
    const title = status === 'completed' ? 'Viewing Completed' : status === 'cancelled' ? 'Viewing Cancelled' : 'Viewing Scheduled'
    rows.push({
      id: `viewing-${viewing.id}`,
      title,
      detail: [transaction.property?.property_name, viewing.vacancy_name || transaction.vacancy?.vacancy_name || transaction.vacancy?.unit_or_floor].filter(Boolean).join(' · ') || 'Commercial viewing update',
      date: viewing.viewing_date || viewing.created_at,
    })
  })
  if (transaction.deal?.id) rows.push({ id: 'deal', title: 'Deal Created', detail: 'The commercial deal workspace is open.', date: transaction.deal.created_at })
  if (transaction.hot?.id) rows.push({ id: 'hot', title: 'Heads of Terms Sent', detail: 'Heads of Terms are being progressed.', date: transaction.hot.sent_at || transaction.hot.created_at })
  if (transaction.hot?.signed_at || normalizeLower(transaction.hot?.status) === 'signed') rows.push({ id: 'hot-signed', title: 'Heads of Terms Signed', detail: 'Heads of Terms have been signed.', date: transaction.hot.signed_at || transaction.hot.updated_at })
  if (transaction.lease?.id) rows.push({ id: 'lease', title: 'Lease Generated', detail: 'Lease documentation is in progress.', date: transaction.lease.created_at })
  if (normalizeLower(transaction.lease?.status) === 'active') rows.push({ id: 'lease-active', title: 'Lease Active', detail: 'The commercial lease is active.', date: transaction.lease.lease_start_date || transaction.lease.updated_at })
  if (normalizeLower(transaction.status) === 'completed') rows.push({ id: 'completed', title: 'Transaction Completed', detail: 'The commercial transaction has been completed.', date: transaction.actualCloseDate || transaction.updatedAt })
  documents.slice(0, 6).forEach((document) => {
    rows.push({ id: `document-${document.id}`, title: 'Document Uploaded', detail: document.document_name || document.file_name || 'Document received', date: document.uploaded_at || document.created_at })
  })
  messages.slice(0, 4).forEach((message) => {
    rows.push({ id: `message-${message.id}`, title: 'Message Sent', detail: 'A portal message was added.', date: message.created_at })
  })
  return rows.filter((row) => row.date).sort((left, right) => asDate(right.date) - asDate(left.date))
}

function buildRenewalVisibility(transaction = {}) {
  const expiry = asDate(transaction.lease?.lease_end_date)
  if (!expiry) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
  if (days < 0) return { label: 'Lease expired', detail: `Expired on ${formatDate(expiry)}`, daysToExpiry: days }
  if (days <= 180) return { label: `Lease expires in ${days} days`, detail: 'Renewal awareness is active.', daysToExpiry: days }
  return { label: 'Lease renewal monitored', detail: `Lease expiry: ${formatDate(expiry)}`, daysToExpiry: days }
}

function buildPortalSummary({ transaction = {}, access = {}, contact = null, documents = [], documentRequests = [], viewings = [] } = {}) {
  const role = normalizePortalRole(access.portal_role)
  const outstandingRequests = documentRequests.filter((row) => !['approved', 'completed', 'archived'].includes(normalizeLower(row.status)))
  const completedViewings = viewings.filter((row) => normalizeLower(row.status) === 'completed')
  const activeDeals = transaction.deal?.id ? 1 : 0
  const activeTransactions = transaction.id && !['completed', 'lost', 'cancelled'].includes(normalizeLower(transaction.status)) ? 1 : 0
  const availableArea = toNumber(transaction.vacancy?.available_area_m2 || transaction.property?.available_space_m2)
  const totalGla = toNumber(transaction.property?.gla_m2)
  const vacancyRate = totalGla ? Math.round((availableArea / totalGla) * 1000) / 10 : toNumber(transaction.property?.vacancy_percentage)
  const occupancyRate = totalGla ? Math.max(0, Math.min(100, Math.round((100 - vacancyRate) * 10) / 10)) : Math.max(0, 100 - vacancyRate)
  return {
    portalRole: role,
    portalLabel: portalRoleLabel(role),
    contactName: contact?.contact_name || contact?.company_name || 'Client',
    companyName: transaction.company?.company_name || contact?.company_name || transaction.tenant?.name || transaction.landlord?.name || 'Company pending',
    transactionTitle: transaction.title || 'Commercial transaction',
    status: transaction.status || 'In Progress',
    broker: transaction.brokerName || 'Commercial broker',
    property: transaction.property?.property_name || 'Property pending',
    tenant: transaction.tenant?.name || 'Tenant pending',
    landlord: transaction.landlord?.name || 'Landlord pending',
    unit: transaction.vacancy?.unit_or_floor || transaction.vacancy?.vacancy_name || '-',
    outstandingDocuments: outstandingRequests.length,
    receivedDocuments: documents.length,
    activeDeals,
    activeTransactions,
    viewings: viewings.length,
    completedViewings: completedViewings.length,
    occupancyRate,
    vacancyRate,
    availableSpace: availableArea,
    pipelineValue: transaction.value || 0,
    importantDates: [
      ['Heads of Terms Sent', formatDate(transaction.hot?.sent_at)],
      ['Heads of Terms Signed', formatDate(transaction.hot?.signed_at)],
      ['Occupation', formatDate(transaction.lease?.occupation_date || transaction.hot?.beneficial_occupation_date)],
      ['Lease Start', formatDate(transaction.lease?.lease_start_date)],
      ['Lease Expiry', formatDate(transaction.lease?.lease_end_date)],
    ],
  }
}

function buildRoleDashboard({ transaction = {}, access = {}, documents = [], documentRequests = [], viewings = [] } = {}) {
  const summary = buildPortalSummary({ transaction, access, documents, documentRequests, viewings })
  const role = normalizePortalRole(access.portal_role)
  if (['landlord', 'seller', 'property_manager'].includes(role)) {
    return {
      title: role === 'seller' ? 'Asset Disposal Dashboard' : 'Asset Performance Dashboard',
      cards: [
        { label: 'Occupancy', value: `${formatNumber(summary.occupancyRate || 0)}%`, detail: 'Current property occupancy' },
        { label: 'Vacancy', value: `${formatNumber(summary.vacancyRate || 0)}%`, detail: 'Current available exposure' },
        { label: 'Viewings', value: formatNumber(summary.viewings || 0), detail: `${formatNumber(summary.completedViewings || 0)} completed` },
        { label: 'Transactions', value: formatNumber(summary.activeTransactions || 0), detail: 'Active commercial execution' },
      ],
    }
  }
  if (role === 'investor') {
    return {
      title: 'Investment Pipeline',
      cards: [
        { label: 'Pipeline Value', value: formatCurrency(summary.pipelineValue || 0), detail: 'Current acquisition value' },
        { label: 'Transactions', value: formatNumber(summary.activeTransactions || 0), detail: 'Active acquisition progress' },
        { label: 'Documents', value: formatNumber(summary.receivedDocuments || 0), detail: `${formatNumber(summary.outstandingDocuments || 0)} outstanding` },
        { label: 'Stage', value: titleize(summary.status), detail: 'Current transaction status' },
      ],
    }
  }
  return {
    title: role === 'buyer' ? 'Acquisition Progress' : 'Requirement Progress',
    cards: [
      { label: 'Requirement', value: transaction.requirement?.requirement_name || 'Captured', detail: portalStatusLabel('requirement', transaction.requirement?.stage || transaction.requirement?.status || 'active') },
      { label: 'Viewings', value: formatNumber(summary.viewings || 0), detail: `${formatNumber(summary.completedViewings || 0)} completed` },
      { label: 'Transaction', value: titleize(summary.status), detail: formatCurrency(summary.pipelineValue || 0) },
      { label: 'Documents', value: formatNumber(summary.receivedDocuments || 0), detail: `${formatNumber(summary.outstandingDocuments || 0)} outstanding` },
    ],
  }
}

function buildLeaseSummary(transaction = {}) {
  const lease = transaction.lease || {}
  const hot = transaction.hot || {}
  return {
    status: portalStatusLabel('lease', lease.status || (lease.id ? 'draft' : 'pending')),
    monthlyRental: formatCurrency(lease.monthly_rental || hot.monthly_rental),
    escalation: `${formatNumber(lease.escalation_percentage || hot.escalation_percentage || 0)}%`,
    deposit: formatCurrency(lease.deposit_amount || hot.deposit_amount),
    occupationDate: formatDate(lease.occupation_date || hot.beneficial_occupation_date),
    term: lease.lease_term_months || hot.lease_term_months ? `${formatNumber(lease.lease_term_months || hot.lease_term_months)} months` : '-',
    startDate: formatDate(lease.lease_start_date),
    expiryDate: formatDate(lease.lease_end_date),
  }
}

function mapDocumentRequest(row = {}) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.document_name || row.category || 'Requested document',
    category: row.category || 'Supporting Documentation',
    dueDate: row.due_date || '',
    priority: row.priority || 'normal',
    notes: row.notes || '',
    status: portalStatusLabel('document', row.status || 'requested'),
    rawStatus: row.status || 'requested',
  }
}

function mapDocument(row = {}) {
  return {
    id: row.id,
    title: row.document_name || row.file_name || 'Commercial document',
    category: row.category || 'Supporting Documentation',
    status: portalStatusLabel('document', row.status || 'uploaded'),
    uploadedAt: row.uploaded_at || row.created_at,
    entityType: row.entity_type,
    entityId: row.entity_id,
    filePath: row.file_path || '',
    fileBucket: row.file_bucket || 'documents',
  }
}

function mapProperty(row = {}) {
  return {
    id: row.id,
    title: row.property_name || 'Commercial property',
    type: row.property_type || '',
    location: [row.suburb, row.city, row.province].filter(Boolean).join(', '),
    gla: row.gla_m2,
    availableSpace: row.available_space_m2,
    vacancyRate: row.vacancy_percentage,
    status: row.status || 'active',
  }
}

function mapVacancy(row = {}) {
  return {
    id: row.id,
    title: row.vacancy_name || row.unit_or_floor || 'Commercial vacancy',
    unit: row.unit_or_floor || '',
    area: row.available_area_m2,
    rental: row.asking_rental,
    availabilityDate: row.availability_date,
    status: row.status || 'available',
  }
}

function mapListing(row = {}) {
  return {
    id: row.id,
    title: row.title || 'Commercial listing',
    type: row.listing_type || '',
    category: row.listing_category || '',
    status: row.listing_status || row.status || 'draft',
    pricing: row.pricing || '',
    availableFrom: row.available_from || '',
  }
}

function mapViewing(row = {}) {
  return {
    id: row.id,
    date: row.viewing_date || '',
    time: row.viewing_time || '',
    status: row.status || 'scheduled',
    notes: row.notes || '',
    feedback: row.feedback || '',
  }
}

function mapMessage(row = {}) {
  return {
    id: row.id,
    senderName: row.sender_name || (row.sender_role === 'broker' ? 'Broker' : 'You'),
    senderRole: row.sender_role || 'external',
    body: row.message_body || '',
    status: row.status || 'open',
    createdAt: row.created_at,
  }
}

function mapNotification(row = {}) {
  return {
    id: row.id,
    title: row.title || 'Commercial update',
    description: row.description || '',
    type: row.notification_type || 'update',
    status: row.status || 'unread',
    priority: row.priority || 'normal',
    actionRoute: row.action_route || 'documents',
    createdAt: row.created_at,
  }
}

async function recordPortalAuditEvent(client, {
  access = {},
  contact = null,
  eventType = 'portal_event',
  eventTitle = '',
  relatedEntityType = '',
  relatedEntityId = '',
  actorType = 'portal_user',
  metadata = {},
} = {}) {
  if (!access?.id) return null
  const payload = {
    organisation_id: access.organisation_id || access.organisationId,
    access_id: access.id,
    contact_id: access.contact_id || access.contactId || null,
    company_id: access.company_id || contact?.company_id || null,
    commercial_contact_id: access.commercial_contact_id || contact?.commercial_contact_id || null,
    commercial_transaction_id: access.commercial_transaction_id || access.commercialTransactionId || null,
    portal_role: normalizePortalRole(access.portal_role || access.role),
    event_type: normalizeText(eventType),
    event_title: normalizeText(eventTitle) || titleize(eventType),
    related_entity_type: normalizeText(relatedEntityType) || null,
    related_entity_id: normalizeText(relatedEntityId) || null,
    actor_type: normalizeText(actorType) || 'portal_user',
    metadata,
  }
  const { data, error } = await client.from(PORTAL_AUDIT_TABLE).insert(payload).select('*').maybeSingle()
  if (error) {
    if (isMissingPortalTable(error, PORTAL_AUDIT_TABLE)) return null
    throw error
  }
  return data || null
}

async function updatePortalAccessActivity(client, accessId, patch = {}) {
  if (!accessId) return null
  const { data, error } = await client
    .from(PORTAL_ACCESS_TABLE)
    .update({ last_activity_at: new Date().toISOString(), ...patch })
    .eq('id', accessId)
    .select('*')
    .maybeSingle()
  if (error) {
    if (isMissingPortalTable(error, PORTAL_ACCESS_TABLE)) return null
    throw error
  }
  return data || null
}

export function buildCommercialPortalWorkspace({ access = {}, contact = null, transaction = {}, documents = [], documentRequests = [], messages = [], notifications = [], relatedRows = {} } = {}) {
  const role = normalizePortalRole(access.portal_role)
  const visibility = { ...defaultVisibility(role), ...(access.visibility || {}) }
  const safeDocuments = visibility.documents ? documents.map(mapDocument) : []
  const safeRequests = visibility.documents ? documentRequests.map(mapDocumentRequest) : []
  const viewings = relatedRows.viewings || []
  const properties = relatedRows.properties || (transaction.property?.id ? [transaction.property] : [])
  const vacancies = relatedRows.vacancies || (transaction.vacancy?.id ? [transaction.vacancy] : [])
  const listings = relatedRows.listings || (transaction.listing?.id ? [transaction.listing] : [])
  return {
    access: {
      id: access.id,
      organisationId: access.organisation_id,
      token: access.token,
      role,
      portalLabel: portalRoleLabel(access.portal_role),
      expiresAt: access.expires_at || '',
      status: access.status || 'active',
      visibility,
      commercialTransactionId: access.commercial_transaction_id,
      deal_id: access.deal_id,
      heads_of_terms_id: access.heads_of_terms_id,
      lease_id: access.lease_id,
      requirement_id: access.requirement_id,
      tenant_id: access.tenant_id,
      landlord_id: access.landlord_id,
      property_id: access.property_id,
      vacancy_id: access.vacancy_id,
      listing_id: access.listing_id,
      company_id: access.company_id,
      commercial_contact_id: access.commercial_contact_id,
      acceptedAt: access.accepted_at || '',
      passwordSetAt: access.password_set_at || '',
      lastActivityAt: access.last_activity_at || access.last_opened_at || '',
    },
    contact: {
      name: contact?.contact_name || '',
      email: contact?.contact_email || '',
      phone: contact?.contact_phone || '',
      company: contact?.company_name || '',
      companyId: contact?.company_id || access.company_id || '',
      commercialContactId: contact?.commercial_contact_id || access.commercial_contact_id || '',
    },
    summary: buildPortalSummary({ transaction, access, contact, documents: safeDocuments, documentRequests: safeRequests, viewings }),
    roleDashboard: buildRoleDashboard({ transaction, access, documents: safeDocuments, documentRequests: safeRequests, viewings }),
    progress: buildPortalProgress(transaction),
    timeline: visibility.timeline ? buildClientSafeTimeline(transaction, documents, viewings, messages) : [],
    properties: visibility.properties ? properties.map(mapProperty) : [],
    vacancies: visibility.properties ? vacancies.map(mapVacancy) : [],
    listings: visibility.properties ? listings.map(mapListing) : [],
    viewings: visibility.viewings ? viewings.map(mapViewing) : [],
    transaction: {
      id: transaction.id,
      title: transaction.title,
      type: transaction.transactionType || transaction.transaction_type || '',
      status: transaction.status || '',
      value: transaction.value || transaction.target_value || 0,
      expectedCloseDate: transaction.expectedCloseDate || transaction.expected_close_date || '',
      actualCloseDate: transaction.actualCloseDate || transaction.actual_close_date || '',
    },
    requirement: transaction.requirement ? {
      id: transaction.requirement.id,
      title: transaction.requirement.requirement_name || transaction.requirement.title || 'Requirement',
      status: transaction.requirement.stage || transaction.requirement.status || '',
      type: transaction.requirement.requirement_type || '',
      propertyType: transaction.requirement.property_type || '',
      budget: [transaction.requirement.budget_min, transaction.requirement.budget_max].filter(Boolean).join(' - '),
      size: [transaction.requirement.min_size_m2, transaction.requirement.max_size_m2].filter(Boolean).join(' - '),
    } : null,
    documents: safeDocuments,
    documentRequests: safeRequests,
    messages: visibility.messages ? messages.map(mapMessage) : [],
    notifications: notifications.map(mapNotification),
    lease: visibility.lease ? buildLeaseSummary(transaction) : null,
    renewal: buildRenewalVisibility(transaction),
  }
}

export async function getCommercialPortalWorkspaceData(token) {
  const client = getPortalClient(token)
  const access = await fetchPortalAccess(client, token)
  const [contact, relatedRows, documents, documentRequests, messages, notifications] = await Promise.all([
    fetchContact(client, access.contact_id),
    fetchRelatedPortalRows(client, access),
    fetchPortalDocuments(client, access),
    fetchPortalDocumentRequests(client, access),
    fetchPortalMessages(client, access),
    fetchPortalNotifications(client, access),
  ])
  const [transaction] = buildCommercialTransactions({
    organisationId: access.organisation_id,
    transactions: relatedRows.transactions,
    companies: relatedRows.companies,
    contacts: relatedRows.contacts,
    landlords: relatedRows.landlords,
    tenants: relatedRows.tenants,
    properties: relatedRows.properties,
    requirements: relatedRows.requirements,
    deals: relatedRows.deals,
    listings: relatedRows.listings,
    leases: relatedRows.leases,
    vacancies: relatedRows.vacancies,
    headsOfTerms: relatedRows.headsOfTerms,
    documents,
    documentRequests,
  })
  if (!transaction) throw new Error('Commercial portal transaction could not be loaded.')
  await updatePortalAccessActivity(client, access.id, { last_opened_at: new Date().toISOString() }).catch(() => null)
  await recordPortalAuditEvent(client, {
    access,
    contact,
    eventType: 'login',
    eventTitle: 'Portal opened',
    metadata: { source: 'commercial_portal_workspace' },
  }).catch(() => null)
  return buildCommercialPortalWorkspace({ access, contact, transaction, documents, documentRequests, messages, notifications, relatedRows })
}

export async function listCommercialPortalAccessForTransaction(organisationId, transactionId) {
  const client = requireInternalClient()
  if (!organisationId || !transactionId) return []
  const { data, error } = await client
    .from(PORTAL_ACCESS_TABLE)
    .select(`*, contact:${PORTAL_CONTACTS_TABLE}(*)`)
    .eq('organisation_id', organisationId)
    .eq('commercial_transaction_id', transactionId)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingPortalTable(error, PORTAL_ACCESS_TABLE)) return []
    throw error
  }
  return data || []
}

export async function listCommercialPortalAccessForOrganisation(organisationId) {
  const client = requireInternalClient()
  if (!organisationId) return []
  const { data, error } = await client
    .from(PORTAL_ACCESS_TABLE)
    .select(`*, contact:${PORTAL_CONTACTS_TABLE}(*), audit:${PORTAL_AUDIT_TABLE}(id, event_type, event_title, created_at)`)
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingPortalTable(error, PORTAL_ACCESS_TABLE)) return []
    throw error
  }
  return data || []
}

export async function listCommercialPortalAuditEvents(organisationId, limit = 80) {
  const client = requireInternalClient()
  if (!organisationId) return []
  const { data, error } = await client
    .from(PORTAL_AUDIT_TABLE)
    .select('*')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingPortalTable(error, PORTAL_AUDIT_TABLE)) return []
    throw error
  }
  return data || []
}

export function buildCommercialPortalAdoption(accessRows = [], auditRows = []) {
  const activeRows = accessRows.filter((row) => normalizeLower(row.status) === 'active')
  const pendingRows = activeRows.filter((row) => !row.accepted_at && !row.password_set_at)
  const activeUsers = activeRows.filter((row) => row.accepted_at || row.password_set_at || row.last_activity_at || row.last_opened_at)
  const recentUploads = auditRows.filter((row) => normalizeLower(row.event_type) === 'document_upload').slice(0, 6)
  const roleCounts = accessRows.reduce((counts, row) => {
    const role = normalizePortalRole(row.portal_role)
    counts[role] = (counts[role] || 0) + 1
    return counts
  }, {})
  return {
    totalAccess: accessRows.length,
    activeAccess: activeRows.length,
    activeUsers: activeUsers.length,
    pendingInvitations: pendingRows.length,
    revokedAccess: accessRows.filter((row) => ['revoked', 'disabled'].includes(normalizeLower(row.status))).length,
    recentUploads,
    recentActivity: auditRows.slice(0, 10),
    roleCounts,
  }
}

export async function createCommercialPortalInvitation({ organisationId, transaction = {}, portalRole = 'tenant', contact = {}, expiryDays = 30 } = {}) {
  const client = requireInternalClient()
  const role = normalizePortalRole(portalRole)
  const ids = getTransactionPrimaryIds(transaction)
  const fallbackContact = transaction.contact || {}
  const fallbackCompany = transaction.company || {}
  const contactName = normalizeText(contact.name || contact.contact_name || contact.contactName) ||
    normalizeText(fallbackContact.name || fallbackContact.first_name || fallbackContact.email) ||
    (['landlord', 'seller', 'property_manager'].includes(role) ? transaction.landlord?.contact_person || transaction.landlord?.name : transaction.tenant?.contact_person || transaction.tenant?.name) ||
    'Commercial contact'
  const contactEmail = normalizeText(contact.email || contact.contact_email || contact.contactEmail) ||
    normalizeText(fallbackContact.email) ||
    normalizeText(fallbackCompany.email) ||
    (['landlord', 'seller', 'property_manager'].includes(role) ? transaction.landlord?.email : transaction.tenant?.email)
  if (!organisationId || !transaction.id) throw new Error('A commercial transaction is required.')
  if (!contactEmail) throw new Error('A contact email is required for portal access.')

  const contactPayload = {
    organisation_id: organisationId,
    commercial_transaction_id: transaction.id,
    portal_role: role,
    company_id: ids.company_id,
    commercial_contact_id: ids.commercial_contact_id,
    entity_type: roleEntityType(role),
    entity_id: roleEntityType(role) === 'commercial_landlord' ? ids.landlord_id : (ids.company_id || ids.tenant_id),
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: normalizeText(contact.phone || contact.contact_phone || contact.contactPhone || fallbackContact.mobile || fallbackContact.phone) || null,
    company_name: normalizeText(contact.company || contact.company_name || contact.companyName) || fallbackCompany.company_name || fallbackCompany.name || (['landlord', 'seller', 'property_manager'].includes(role) ? transaction.landlord?.name : transaction.tenant?.name) || null,
    status: 'active',
    invitation_status: 'invited',
    metadata: { source: 'commercial_transaction_workspace', role },
  }
  const { data: savedContact, error: contactError } = await client.from(PORTAL_CONTACTS_TABLE).insert(contactPayload).select('*').single()
  if (contactError) throw contactError

  const accessPayload = {
    organisation_id: organisationId,
    contact_id: savedContact.id,
    commercial_transaction_id: transaction.id,
    portal_role: role,
    token: createPortalToken(),
    status: 'active',
    expires_at: addDays(expiryDays),
    invitation_sent_at: new Date().toISOString(),
    visibility: defaultVisibility(role),
    ...ids,
  }
  const { data: access, error: accessError } = await client.from(PORTAL_ACCESS_TABLE).insert(accessPayload).select('*').single()
  if (accessError) throw accessError

  await client.from(PORTAL_NOTIFICATIONS_TABLE).insert({
    organisation_id: organisationId,
    access_id: access.id,
    commercial_transaction_id: transaction.id,
    portal_role: role,
    notification_type: 'portal_invitation',
    title: `${portalRoleLabel(role)} enabled`,
    description: 'Secure commercial portal access has been created.',
    priority: 'normal',
    status: 'unread',
    action_route: 'dashboard',
  }).throwOnError()

  await recordPortalAuditEvent(client, {
    access,
    contact: savedContact,
    eventType: 'invitation_created',
    eventTitle: `${portalRoleLabel(role)} invitation created`,
    actorType: 'broker',
    metadata: { contactEmail, expiryDays },
  }).catch(() => null)

  const portalUrl = `/commercial/portal/${access.token}`
  let emailDeliveryStatus = 'skipped'
  try {
    const response = await invokeEdgeFunction('send-email', {
      body: {
        type: 'client_portal_link',
        to: contactEmail,
        clientName: contactName,
        recipientName: contactName,
        portalUrl: buildAbsoluteUrl(portalUrl),
        onboardingUrl: buildAbsoluteUrl(portalUrl),
        actionLink: buildAbsoluteUrl(portalUrl),
        transactionId: transaction.id,
        transactionTitle: transaction.title || transaction.transaction_name || 'Commercial transaction',
        organisationName: transaction.organisationName || 'Arch9 Commercial',
        subject: `${portalRoleLabel(role)} access for ${transaction.title || 'your commercial workspace'}`,
      },
    })
    const sendError = response?.error || response?.data?.error
    emailDeliveryStatus = sendError ? 'failed' : 'sent'
  } catch {
    emailDeliveryStatus = 'failed'
  }

  await client
    .from(PORTAL_ACCESS_TABLE)
    .update({ email_delivery_status: emailDeliveryStatus, email_last_sent_at: new Date().toISOString() })
    .eq('id', access.id)
    .throwOnError()
    .catch(() => null)

  return {
    ...access,
    contact: savedContact,
    emailDeliveryStatus,
    portalUrl,
  }
}

export async function revokeCommercialPortalAccess(accessId) {
  const client = requireInternalClient()
  const { data, error } = await client
    .from(PORTAL_ACCESS_TABLE)
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', accessId)
    .select('*')
    .single()
  if (error) throw error
  await recordPortalAuditEvent(client, {
    access: data,
    eventType: 'access_revoked',
    eventTitle: 'Portal access revoked',
    actorType: 'broker',
  }).catch(() => null)
  return data || null
}

export async function disableCommercialPortalAccess(accessId) {
  const client = requireInternalClient()
  const { data, error } = await client
    .from(PORTAL_ACCESS_TABLE)
    .update({ status: 'disabled', disabled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', accessId)
    .select('*')
    .single()
  if (error) throw error
  await recordPortalAuditEvent(client, {
    access: data,
    eventType: 'access_disabled',
    eventTitle: 'Portal access disabled',
    actorType: 'broker',
  }).catch(() => null)
  return data || null
}

export async function resendCommercialPortalInvitation(accessId) {
  const client = requireInternalClient()
  const { data: row, error } = await client
    .from(PORTAL_ACCESS_TABLE)
    .select(`*, contact:${PORTAL_CONTACTS_TABLE}(*)`)
    .eq('id', accessId)
    .single()
  if (error) throw error
  const contactEmail = row?.contact?.contact_email
  if (!contactEmail) throw new Error('Portal contact email is missing.')
  const portalUrl = `/commercial/portal/${row.token}`
  let emailDeliveryStatus = 'sent'
  try {
    const response = await invokeEdgeFunction('send-email', {
      body: {
        type: 'client_portal_link',
        to: contactEmail,
        clientName: row.contact?.contact_name || 'Commercial client',
        recipientName: row.contact?.contact_name || 'Commercial client',
        portalUrl: buildAbsoluteUrl(portalUrl),
        onboardingUrl: buildAbsoluteUrl(portalUrl),
        actionLink: buildAbsoluteUrl(portalUrl),
        transactionId: row.commercial_transaction_id,
        transactionTitle: 'Commercial portal access',
        organisationName: 'Arch9 Commercial',
        subject: `${portalRoleLabel(row.portal_role)} access reminder`,
      },
    })
    const sendError = response?.error || response?.data?.error
    emailDeliveryStatus = sendError ? 'failed' : 'sent'
  } catch {
    emailDeliveryStatus = 'failed'
  }
  const { data: updated, error: updateError } = await client
    .from(PORTAL_ACCESS_TABLE)
    .update({ invitation_sent_at: new Date().toISOString(), email_last_sent_at: new Date().toISOString(), email_delivery_status: emailDeliveryStatus })
    .eq('id', accessId)
    .select('*')
    .single()
  if (updateError) throw updateError
  await recordPortalAuditEvent(client, {
    access: updated,
    contact: row.contact,
    eventType: 'invitation_resent',
    eventTitle: 'Portal invitation resent',
    actorType: 'broker',
    metadata: { emailDeliveryStatus },
  }).catch(() => null)
  return { ...updated, contact: row.contact, portalUrl, emailDeliveryStatus }
}

export async function activateCommercialPortalAccess({ token = '', displayName = '', password = '' } = {}) {
  const client = getPortalClient(token)
  const access = await fetchPortalAccess(client, token)
  const contact = await fetchContact(client, access.contact_id)
  const now = new Date().toISOString()
  let authUserId = null
  const email = normalizeText(contact?.contact_email)
  if (email && password && client.auth?.signUp) {
    const { data: authData, error: authError } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: normalizeText(displayName) || contact?.contact_name || '',
          portal_role: normalizePortalRole(access.portal_role),
          commercial_portal_access_id: access.id,
          commercial_company_id: access.company_id || contact?.company_id || null,
          commercial_contact_id: access.commercial_contact_id || contact?.commercial_contact_id || null,
        },
      },
    })
    if (authError && !/already|registered|exists/i.test(String(authError.message || ''))) throw authError
    authUserId = authData?.user?.id || null
  }
  await client
    .from(PORTAL_CONTACTS_TABLE)
    .update({
      invitation_status: 'accepted',
      accepted_at: now,
      password_set_at: password ? now : null,
      updated_at: now,
      contact_name: normalizeText(displayName) || contact?.contact_name,
      metadata: { ...(contact?.metadata || {}), authUserId },
    })
    .eq('id', access.contact_id)
    .throwOnError()
    .catch(() => null)
  await updatePortalAccessActivity(client, access.id, { accepted_at: access.accepted_at || now, password_set_at: password ? now : access.password_set_at })
  await recordPortalAuditEvent(client, {
    access,
    contact,
    eventType: 'invitation_accepted',
    eventTitle: 'Portal invitation accepted',
    metadata: { passwordCreated: Boolean(password), authUserId },
  }).catch(() => null)
  return getCommercialPortalWorkspaceData(token)
}

function chooseUploadTarget(workspace = {}, { category = '', documentRequestId = '' } = {}) {
  const access = workspace.access || {}
  const request = (workspace.documentRequests || []).find((row) => row.id === documentRequestId)
  if (request?.entityType && request?.entityId) return { entityType: request.entityType, entityId: request.entityId }
  const normalized = normalizeLower(category)
  if (normalized.includes('lease') && access.lease_id) return { entityType: 'commercial_lease', entityId: access.lease_id }
  if (normalized.includes('hot') && access.heads_of_terms_id) return { entityType: 'commercial_heads_of_terms', entityId: access.heads_of_terms_id }
  if (workspace.access?.role === 'landlord' && access.landlord_id) return { entityType: 'commercial_landlord', entityId: access.landlord_id }
  if (access.tenant_id) return { entityType: 'commercial_tenant', entityId: access.tenant_id }
  if (access.property_id) return { entityType: 'commercial_property', entityId: access.property_id }
  return { entityType: 'commercial_deal', entityId: access.deal_id }
}

async function uploadPortalFile(client, { accessId, file }) {
  if (!file) return { bucket: '', path: '' }
  const objectPath = ['commercial-portal', safeFileName(accessId), `${Date.now()}-${safeFileName(file.name || 'document')}`].join('/')
  for (const bucket of COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES) {
    const { error } = await client.storage.from(bucket).upload(objectPath, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    })
    if (!error) return { bucket, path: objectPath }
    if (!/bucket|not found|does not exist/i.test(String(error.message || ''))) throw error
  }
  throw new Error('Commercial portal document storage is not configured.')
}

export async function uploadCommercialPortalDocument({ token = '', file = null, category = 'Supporting Documentation', documentRequestId = '', notes = '' } = {}) {
  const client = getPortalClient(token)
  const workspace = await getCommercialPortalWorkspaceData(token)
  const uploaded = await uploadPortalFile(client, { accessId: workspace.access.id, file })
  const target = chooseUploadTarget(workspace, { category, documentRequestId })
  if (!target.entityType || !target.entityId) throw new Error('This portal link cannot upload to the selected record.')
  const payload = {
    organisation_id: workspace.access.organisationId || null,
    entity_type: target.entityType,
    entity_id: target.entityId,
    document_name: normalizeText(file?.name) || normalizeText(category) || 'Portal upload',
    category: normalizeText(category) || 'Supporting Documentation',
    status: 'under_review',
    notes: normalizeText(notes) || null,
    file_name: normalizeText(file?.name) || null,
    file_path: uploaded.path || null,
    file_bucket: uploaded.bucket || 'documents',
    file_size: Number.isFinite(Number(file?.size)) ? Number(file.size) : null,
    mime_type: normalizeText(file?.type) || null,
    uploaded_at: new Date().toISOString(),
    version_number: 1,
  }
  payload.organisation_id = payload.organisation_id || (await fetchPortalAccess(client, token)).organisation_id
  const { data, error } = await client.from(COMMERCIAL_DOCUMENTS_TABLE).insert(payload).select('*').single()
  if (error) throw error
  if (documentRequestId) {
    await client
      .from(COMMERCIAL_DOCUMENT_REQUESTS_TABLE)
      .update({ status: 'uploaded', completed_document_id: data.id, updated_at: new Date().toISOString() })
      .eq('id', documentRequestId)
      .throwOnError()
  }
  await client.from(PORTAL_NOTIFICATIONS_TABLE).insert({
    organisation_id: payload.organisation_id,
    access_id: workspace.access.id,
    commercial_transaction_id: workspace.access.commercialTransactionId || '',
    portal_role: workspace.access.role,
    notification_type: 'document_uploaded',
    title: 'Document uploaded',
    description: `${payload.document_name} was uploaded for broker review.`,
    priority: 'normal',
    status: 'unread',
    action_route: 'documents',
    related_entity_type: target.entityType,
    related_entity_id: target.entityId,
  }).throwOnError()
  await recordPortalAuditEvent(client, {
    access: { ...workspace.access, organisation_id: payload.organisation_id, portal_role: workspace.access.role },
    eventType: 'document_upload',
    eventTitle: 'Portal document uploaded',
    relatedEntityType: target.entityType,
    relatedEntityId: target.entityId,
    metadata: { documentId: data.id, documentRequestId, category: payload.category, fileName: payload.file_name },
  }).catch(() => null)
  await updatePortalAccessActivity(client, workspace.access.id).catch(() => null)
  return data || null
}

export async function getCommercialPortalDocumentDownloadUrl({ token = '', document = null } = {}) {
  const client = getPortalClient(token)
  const workspace = await getCommercialPortalWorkspaceData(token)
  const targetDocument = document?.id
    ? document
    : (workspace.documents || []).find((row) => row.id === document)
  const path = normalizeText(targetDocument?.filePath || targetDocument?.file_path)
  const bucket = normalizeText(targetDocument?.fileBucket || targetDocument?.file_bucket || 'documents')
  if (!path) throw new Error('Document file path is missing.')
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60 * 10)
  if (error) throw error
  await recordPortalAuditEvent(client, {
    access: { ...workspace.access, organisation_id: workspace.access.organisationId, portal_role: workspace.access.role },
    eventType: 'document_download',
    eventTitle: 'Portal document downloaded',
    relatedEntityType: targetDocument.entityType,
    relatedEntityId: targetDocument.entityId,
    metadata: { documentId: targetDocument.id, category: targetDocument.category },
  }).catch(() => null)
  await updatePortalAccessActivity(client, workspace.access.id).catch(() => null)
  return data?.signedUrl || ''
}

export async function sendCommercialPortalMessage({ token = '', message = '', linkedEntityType = '', linkedEntityId = '' } = {}) {
  const client = getPortalClient(token)
  const access = await fetchPortalAccess(client, token)
  const contact = await fetchContact(client, access.contact_id)
  const body = normalizeText(message)
  if (!body) throw new Error('Message is required.')
  const payload = {
    organisation_id: access.organisation_id,
    access_id: access.id,
    commercial_transaction_id: access.commercial_transaction_id,
    company_id: access.company_id || null,
    commercial_contact_id: access.commercial_contact_id || null,
    requirement_id: access.requirement_id || null,
    deal_id: access.deal_id || null,
    transaction_id: /^[0-9a-f-]{36}$/i.test(access.commercial_transaction_id || '') ? access.commercial_transaction_id : null,
    portal_role: normalizePortalRole(access.portal_role),
    sender_role: 'external',
    sender_name: contact?.contact_name || contact?.company_name || 'Portal user',
    sender_email: contact?.contact_email || '',
    message_body: body,
    status: 'open',
    visibility: 'broker_visible',
    linked_entity_type: normalizeText(linkedEntityType) || null,
    linked_entity_id: normalizeText(linkedEntityId) || null,
    metadata: { source: 'commercial_external_portal' },
  }
  const { data, error } = await client.from(PORTAL_MESSAGES_TABLE).insert(payload).select('*').single()
  if (error) throw error
  await client.from(PORTAL_NOTIFICATIONS_TABLE).insert({
    organisation_id: access.organisation_id,
    access_id: access.id,
    commercial_transaction_id: access.commercial_transaction_id,
    portal_role: normalizePortalRole(access.portal_role),
    company_id: access.company_id || null,
    commercial_contact_id: access.commercial_contact_id || null,
    notification_type: 'message_sent',
    title: 'Portal message sent',
    description: body.slice(0, 180),
    priority: 'normal',
    status: 'unread',
    action_route: 'messages',
    related_entity_type: normalizeText(linkedEntityType) || 'commercial_transaction',
    related_entity_id: normalizeText(linkedEntityId) || (payload.transaction_id || null),
  }).throwOnError().catch(() => null)
  await recordPortalAuditEvent(client, {
    access,
    contact,
    eventType: 'message_sent',
    eventTitle: 'Portal message sent',
    relatedEntityType: normalizeText(linkedEntityType) || 'commercial_transaction',
    relatedEntityId: normalizeText(linkedEntityId) || payload.transaction_id || '',
    metadata: { messageId: data?.id },
  }).catch(() => null)
  await updatePortalAccessActivity(client, access.id).catch(() => null)
  return mapMessage(data || payload)
}
