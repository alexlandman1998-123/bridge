import { createScopedSupabaseClient, isSupabaseConfigured, supabase } from '../../../lib/supabaseClient'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import { buildCommercialTransactions } from './commercialPlatformApi'

const PORTAL_HEADER = 'x-bridge-commercial-portal-token'
const PORTAL_ACCESS_TABLE = 'commercial_portal_access'
const PORTAL_CONTACTS_TABLE = 'commercial_portal_contacts'
const PORTAL_MESSAGES_TABLE = 'commercial_portal_messages'
const PORTAL_NOTIFICATIONS_TABLE = 'commercial_portal_notifications'
const COMMERCIAL_DOCUMENTS_TABLE = 'commercial_documents'
const COMMERCIAL_DOCUMENT_REQUESTS_TABLE = 'commercial_document_requests'
const COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES = ['documents', 'transaction-documents', 'private-listing-documents']

export const COMMERCIAL_PORTAL_ROLES = {
  tenant: 'tenant',
  landlord: 'landlord',
  propertyManager: 'property_manager',
  corporateContact: 'corporate_contact',
}

const ROLE_LABELS = {
  tenant: 'Tenant Portal',
  landlord: 'Landlord Portal',
  property_manager: 'Property Manager Portal',
  corporate_contact: 'Corporate Contact Portal',
}

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
  if (normalized === 'property_manager' || normalized === 'manager') return COMMERCIAL_PORTAL_ROLES.propertyManager
  if (normalized === 'corporate_contact' || normalized === 'client' || normalized === 'representative') return COMMERCIAL_PORTAL_ROLES.corporateContact
  return COMMERCIAL_PORTAL_ROLES.tenant
}

function portalRoleLabel(role = '') {
  return ROLE_LABELS[normalizePortalRole(role)] || ROLE_LABELS.tenant
}

function defaultVisibility() {
  return {
    documents: true,
    timeline: true,
    messages: true,
    lease: true,
    internalNotes: false,
    commissions: false,
    managementReporting: false,
  }
}

function getTransactionPrimaryIds(transaction = {}) {
  return {
    deal_id: transaction.deal?.id || null,
    heads_of_terms_id: transaction.hot?.id || null,
    lease_id: transaction.lease?.id || null,
    requirement_id: transaction.requirement?.id || null,
    tenant_id: transaction.tenant?.id || null,
    landlord_id: transaction.landlord?.id || null,
    property_id: transaction.property?.id || null,
    vacancy_id: transaction.vacancy?.id || null,
  }
}

function entityPairsFromAccess(access = {}) {
  return [
    ['commercial_deal', access.deal_id],
    ['commercial_heads_of_terms', access.heads_of_terms_id],
    ['commercial_lease', access.lease_id],
    ['commercial_requirement', access.requirement_id],
    ['commercial_tenant', access.tenant_id],
    ['commercial_landlord', access.landlord_id],
    ['commercial_property', access.property_id],
    ['commercial_vacancy', access.vacancy_id],
  ].filter(([, id]) => normalizeText(id))
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

async function fetchRelatedPortalRows(client, access = {}) {
  const [deals, headsOfTerms, leases, requirements, tenants, landlords, properties, vacancies] = await Promise.all([
    fetchRowsByIds(client, 'commercial_deals', [access.deal_id]),
    fetchRowsByIds(client, 'commercial_heads_of_terms', [access.heads_of_terms_id]),
    fetchRowsByIds(client, 'commercial_leases', [access.lease_id]),
    fetchRowsByIds(client, 'commercial_requirements', [access.requirement_id]),
    fetchRowsByIds(client, 'commercial_tenants', [access.tenant_id]),
    fetchRowsByIds(client, 'commercial_landlords', [access.landlord_id]),
    fetchRowsByIds(client, 'commercial_properties', [access.property_id]),
    fetchRowsByIds(client, 'commercial_vacancies', [access.vacancy_id]),
  ])

  return { deals, headsOfTerms, leases, requirements, tenants, landlords, properties, vacancies }
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
  return [
    { key: 'requirement', label: 'Requirement', status: hasRequirement ? 'completed' : 'pending', detail: hasRequirement ? 'Submitted' : 'Pending' },
    { key: 'deal', label: 'Deal', status: hasDeal ? 'completed' : 'pending', detail: hasDeal ? 'Created' : 'Pending' },
    { key: 'hot', label: 'HOT', status: hasHot ? 'completed' : 'pending', detail: portalStatusLabel('hot', transaction.hot?.status || '') },
    { key: 'lease', label: 'Lease', status: hasLease ? (normalizeLower(transaction.lease?.status) === 'active' ? 'completed' : 'in_progress') : 'pending', detail: portalStatusLabel('lease', transaction.lease?.status || '') },
  ]
}

function buildClientSafeTimeline(transaction = {}, documents = []) {
  const rows = []
  if (transaction.requirement?.id) rows.push({ id: 'requirement', title: 'Requirement Submitted', detail: 'Your requirement has been captured.', date: transaction.requirement.created_at })
  if (transaction.vacancy?.id) rows.push({ id: 'vacancy', title: 'Property Selected', detail: transaction.property?.property_name || 'A property has been linked.', date: transaction.vacancy.updated_at || transaction.vacancy.created_at })
  if (transaction.deal?.id) rows.push({ id: 'deal', title: 'Deal Created', detail: 'The commercial deal workspace is open.', date: transaction.deal.created_at })
  if (transaction.hot?.id) rows.push({ id: 'hot', title: 'HOT Sent', detail: 'Heads of Terms are being progressed.', date: transaction.hot.sent_at || transaction.hot.created_at })
  if (transaction.hot?.signed_at || normalizeLower(transaction.hot?.status) === 'signed') rows.push({ id: 'hot-signed', title: 'HOT Signed', detail: 'Heads of Terms have been signed.', date: transaction.hot.signed_at || transaction.hot.updated_at })
  if (transaction.lease?.id) rows.push({ id: 'lease', title: 'Lease Generated', detail: 'Lease documentation is in progress.', date: transaction.lease.created_at })
  if (normalizeLower(transaction.lease?.status) === 'active') rows.push({ id: 'lease-active', title: 'Lease Active', detail: 'The commercial lease is active.', date: transaction.lease.lease_start_date || transaction.lease.updated_at })
  documents.slice(0, 6).forEach((document) => {
    rows.push({ id: `document-${document.id}`, title: 'Document Uploaded', detail: document.document_name || document.file_name || 'Document received', date: document.uploaded_at || document.created_at })
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

function buildPortalSummary({ transaction = {}, access = {}, contact = null, documents = [], documentRequests = [] } = {}) {
  const role = normalizePortalRole(access.portal_role)
  const outstandingRequests = documentRequests.filter((row) => !['approved', 'completed', 'archived'].includes(normalizeLower(row.status)))
  return {
    portalRole: role,
    portalLabel: portalRoleLabel(role),
    contactName: contact?.contact_name || contact?.company_name || 'Client',
    transactionTitle: transaction.title || 'Commercial transaction',
    status: transaction.status || 'In Progress',
    broker: transaction.brokerName || 'Commercial broker',
    property: transaction.property?.property_name || 'Property pending',
    tenant: transaction.tenant?.name || 'Tenant pending',
    landlord: transaction.landlord?.name || 'Landlord pending',
    unit: transaction.vacancy?.unit_or_floor || transaction.vacancy?.vacancy_name || '-',
    outstandingDocuments: outstandingRequests.length,
    receivedDocuments: documents.length,
    importantDates: [
      ['HOT Sent', formatDate(transaction.hot?.sent_at)],
      ['HOT Signed', formatDate(transaction.hot?.signed_at)],
      ['Occupation', formatDate(transaction.lease?.occupation_date || transaction.hot?.beneficial_occupation_date)],
      ['Lease Start', formatDate(transaction.lease?.lease_start_date)],
      ['Lease Expiry', formatDate(transaction.lease?.lease_end_date)],
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

export function buildCommercialPortalWorkspace({ access = {}, contact = null, transaction = {}, documents = [], documentRequests = [], messages = [], notifications = [] } = {}) {
  const visibility = { ...defaultVisibility(), ...(access.visibility || {}) }
  const safeDocuments = visibility.documents ? documents.map(mapDocument) : []
  const safeRequests = visibility.documents ? documentRequests.map(mapDocumentRequest) : []
  return {
    access: {
      id: access.id,
      organisationId: access.organisation_id,
      token: access.token,
      role: normalizePortalRole(access.portal_role),
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
    },
    contact: {
      name: contact?.contact_name || '',
      email: contact?.contact_email || '',
      phone: contact?.contact_phone || '',
      company: contact?.company_name || '',
    },
    summary: buildPortalSummary({ transaction, access, contact, documents: safeDocuments, documentRequests: safeRequests }),
    progress: buildPortalProgress(transaction),
    timeline: visibility.timeline ? buildClientSafeTimeline(transaction, documents) : [],
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
    landlords: relatedRows.landlords,
    tenants: relatedRows.tenants,
    properties: relatedRows.properties,
    requirements: relatedRows.requirements,
    deals: relatedRows.deals,
    leases: relatedRows.leases,
    vacancies: relatedRows.vacancies,
    headsOfTerms: relatedRows.headsOfTerms,
    documents,
    documentRequests,
  })
  if (!transaction) throw new Error('Commercial portal transaction could not be loaded.')
  return buildCommercialPortalWorkspace({ access, contact, transaction, documents, documentRequests, messages, notifications })
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

export async function createCommercialPortalInvitation({ organisationId, transaction = {}, portalRole = 'tenant', contact = {}, expiryDays = 30 } = {}) {
  const client = requireInternalClient()
  const role = normalizePortalRole(portalRole)
  const ids = getTransactionPrimaryIds(transaction)
  const contactName = normalizeText(contact.name || contact.contact_name || contact.contactName) ||
    (role === 'landlord' ? transaction.landlord?.contact_person || transaction.landlord?.name : transaction.tenant?.contact_person || transaction.tenant?.name) ||
    'Commercial contact'
  const contactEmail = normalizeText(contact.email || contact.contact_email || contact.contactEmail) ||
    (role === 'landlord' ? transaction.landlord?.email : transaction.tenant?.email)
  if (!organisationId || !transaction.id) throw new Error('A commercial transaction is required.')
  if (!contactEmail) throw new Error('A contact email is required for portal access.')

  const contactPayload = {
    organisation_id: organisationId,
    commercial_transaction_id: transaction.id,
    portal_role: role,
    entity_type: role === 'landlord' ? 'commercial_landlord' : 'commercial_tenant',
    entity_id: role === 'landlord' ? ids.landlord_id : ids.tenant_id,
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: normalizeText(contact.phone || contact.contact_phone || contact.contactPhone) || null,
    company_name: normalizeText(contact.company || contact.company_name || contact.companyName) || (role === 'landlord' ? transaction.landlord?.name : transaction.tenant?.name) || null,
    status: 'active',
    metadata: { source: 'commercial_transaction_workspace' },
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
    visibility: defaultVisibility(),
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

  return {
    ...access,
    contact: savedContact,
    portalUrl: `/commercial/portal/${access.token}`,
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
  return data || null
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

async function uploadPortalFile(client, { token, accessId, file }) {
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
  const uploaded = await uploadPortalFile(client, { token, accessId: workspace.access.id, file })
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
  return data || null
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
  return mapMessage(data || payload)
}
