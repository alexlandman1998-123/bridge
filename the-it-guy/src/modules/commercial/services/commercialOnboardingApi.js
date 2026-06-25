import { createScopedSupabaseClient, invokeEdgeFunction, isSupabaseConfigured, supabase } from '../../../lib/supabaseClient'
import { titleize } from '../commercialFormatters'
import { listCommercialPortalAccessForOrganisation } from './commercialPortalApi'
import {
  buildCommercialOnboardingCompletion,
  buildCommercialOnboardingPlan,
  normalizeAssetCategory,
  normalizeClientType,
  normalizeCommercialOnboardingResponses,
  normalizeEntityType,
} from './commercialOnboardingRules'

const PORTAL_HEADER = 'x-bridge-commercial-portal-token'
const PORTAL_ACCESS_TABLE = 'commercial_portal_access'
const PORTAL_CONTACTS_TABLE = 'commercial_portal_contacts'
const PORTAL_NOTIFICATIONS_TABLE = 'commercial_portal_notifications'
const PORTAL_AUDIT_TABLE = 'commercial_portal_audit_events'
const COMMERCIAL_DOCUMENTS_TABLE = 'commercial_documents'
const COMMERCIAL_DOCUMENT_REQUESTS_TABLE = 'commercial_document_requests'
const COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES = ['documents', 'transaction-documents', 'private-listing-documents']
const ONBOARDING_WORKFLOW_KEY = 'commercial_onboarding'
const ONBOARDING_ENTITY_TYPE = 'commercial_onboarding'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function buildAbsoluteUrl(path = '') {
  const normalizedPath = normalizeText(path)
  if (!normalizedPath) return ''
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath
  if (typeof window === 'undefined' || !window.location?.origin) return normalizedPath
  return `${window.location.origin}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`
}

function createPortalToken() {
  const bytes = new Uint8Array(24)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
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

function requireInternalClient() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function getPortalClient(token = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Commercial onboarding token is required.')
  const client = createScopedSupabaseClient({ [PORTAL_HEADER]: normalizedToken })
  if (!client) throw new Error('Supabase is not configured.')
  return client
}

function safeFileName(value = '') {
  return normalizeText(value || 'document')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'document'
}

function isMissingPortalTable(error, table = '') {
  if (!error) return false
  const code = normalizeText(error.code).toUpperCase()
  const message = normalizeLower(error.message)
  return code === '42P01' || code === 'PGRST205' || message.includes(table) || message.includes('does not exist')
}

function extractRecordContext(record = {}, kind = '') {
  const source = record && typeof record === 'object' ? record : {}
  const normalizedKind = normalizeLower(kind)
  const propertyId = normalizeText(source.property_id || source.propertyId)
  const vacancyId = normalizeText(source.vacancy_id || source.vacancyId)
  const listingId = normalizeText(source.listing_id || source.listingId)
  const dealId = normalizeText(source.deal_id || source.dealId)
  const transactionId = normalizeText(source.transaction_id || source.transactionId || source.commercial_transaction_id)
  const tenantId = normalizeText(source.tenant_id || source.tenantId)
  const landlordId = normalizeText(source.landlord_id || source.landlordId)
  const companyId = normalizeText(source.company_id || source.companyId)
  const contactId = normalizeText(source.contact_id || source.contactId || source.commercial_contact_id)
  const title = normalizeText(
    source.property_name ||
      source.vacancy_name ||
      source.title ||
      source.deal_name ||
      source.transaction_name ||
      source.requirement_name ||
      source.name,
  ) || 'Commercial record'

  const propertyName = normalizeText(source.property_name || source.title || source.name || title)
  const vacancyName = normalizeText(source.vacancy_name || source.unit_or_floor || title)
  const listingName = normalizeText(source.title || source.listing_title || title)

  return {
    recordKind: normalizedKind,
    sourceRecord: {
      id: normalizeText(source.id),
      kind: normalizedKind,
      title,
      propertyId,
      vacancyId,
      listingId,
      dealId,
      transactionId,
      tenantId,
      landlordId,
      companyId,
      contactId,
      propertyName,
      vacancyName,
      listingName,
      organisationName: normalizeText(source.organisation_name || source.organisationName),
      brokerName: normalizeText(source.broker_name || source.brokerName),
      brokerEmail: normalizeText(source.broker_email || source.brokerEmail),
      contactName: normalizeText(source.contact_person || source.contact_name || source.contactName || source.seller_name || source.tenant_name),
      contactEmail: normalizeText(source.email || source.contact_email || source.contactEmail),
      contactPhone: normalizeText(source.phone || source.mobile || source.contact_phone || source.contactPhone),
    },
  }
}

function resolveInvitationContact({ clientType = 'tenant', sourceRecord = {}, contact = {} } = {}) {
  const entityName = normalizeText(contact.name || contact.contact_name || contact.contactName) ||
    normalizeText(sourceRecord.contactName) ||
    normalizeText(sourceRecord.propertyName || sourceRecord.vacancyName || sourceRecord.listingName || sourceRecord.title) ||
    (clientType === 'seller' ? 'Seller' : 'Tenant')
  const email = normalizeText(contact.email || contact.contact_email || contact.contactEmail) ||
    normalizeText(sourceRecord.contactEmail) ||
    normalizeText(sourceRecord.brokerEmail)
  const phone = normalizeText(contact.phone || contact.mobile || contact.contact_phone || contact.contactPhone) ||
    normalizeText(sourceRecord.contactPhone)
  const company = normalizeText(contact.company || contact.company_name || contact.companyName) ||
    normalizeText(sourceRecord.companyName || sourceRecord.organisationName || sourceRecord.propertyName || sourceRecord.vacancyName || sourceRecord.listingName)
  return { name: entityName, email, phone, company }
}

function buildOnboardingVisibility() {
  return {
    documents: true,
    timeline: true,
    messages: false,
    lease: false,
    properties: false,
    requirements: false,
    viewings: false,
    transactions: false,
    reports: false,
    internalNotes: false,
    commissions: false,
    managementReporting: false,
  }
}

function onboardingSubject({ clientType = 'tenant', sourceRecord = {}, mode = 'sent' } = {}) {
  const propertyLabel = normalizeText(sourceRecord.propertyName || sourceRecord.vacancyName || sourceRecord.listingName || sourceRecord.title)
  const prefix = clientType === 'seller' ? 'Complete your seller onboarding' : 'Complete your tenant onboarding'
  if (mode === 'reminder') return `${prefix} for ${propertyLabel || 'your commercial record'}`
  if (mode === 'missing_documents') return `Missing documents for ${propertyLabel || 'your commercial onboarding'}`
  if (mode === 'completion') return `${clientType === 'seller' ? 'Seller' : 'Tenant'} onboarding complete for ${propertyLabel || 'your commercial record'}`
  return `${prefix} for ${propertyLabel || 'your commercial record'}`
}

function onboardingMessage({ clientType = 'tenant', sourceRecord = {}, mode = 'sent', missingFields = [], missingDocuments = [] } = {}) {
  const propertyLabel = normalizeText(sourceRecord.propertyName || sourceRecord.vacancyName || sourceRecord.listingName || sourceRecord.title) || 'your commercial record'
  const leadText = clientType === 'seller' ? 'seller' : 'tenant'
  if (mode === 'reminder') {
    return `Your ${leadText} onboarding for ${propertyLabel} is still waiting. Please open the secure link and continue where you left off.`
  }
  if (mode === 'missing_documents') {
    const missing = [...missingFields, ...missingDocuments].slice(0, 8).map((item) => item.label || item.title || item.name).filter(Boolean)
    return missing.length
      ? `We still need: ${missing.join(', ')}. Please upload the missing items through your secure commercial onboarding link.`
      : `A few details or documents are still missing for ${propertyLabel}. Please reopen the secure link and finish the form.`
  }
  if (mode === 'completion') {
    return `Thank you. Your ${leadText} onboarding for ${propertyLabel} is complete and ready for broker review.`
  }
  return `Please complete your ${leadText} onboarding for ${propertyLabel} using the secure link below.`
}

function buildOnboardingEmailPayload({
  clientType = 'tenant',
  organisationName = 'Arch9 Commercial',
  sourceRecord = {},
  contact = {},
  portalUrl = '',
  mode = 'sent',
  missingFields = [],
  missingDocuments = [],
} = {}) {
  const subject = onboardingSubject({ clientType, sourceRecord, mode })
  const message = onboardingMessage({ clientType, sourceRecord, mode, missingFields, missingDocuments })
  const title = clientType === 'seller'
    ? (mode === 'completion' ? 'Seller onboarding complete' : 'Seller onboarding')
    : (mode === 'completion' ? 'Tenant onboarding complete' : 'Tenant onboarding')
  return {
    subject,
    message,
    title,
    clientName: contact.name,
    recipientName: contact.name,
    organisationName,
    actionLink: buildAbsoluteUrl(portalUrl),
    onboardingUrl: buildAbsoluteUrl(portalUrl),
    portalUrl: buildAbsoluteUrl(portalUrl),
    propertyTitle: sourceRecord.propertyName || sourceRecord.vacancyName || sourceRecord.listingName || sourceRecord.title || 'Commercial record',
    propertyType: sourceRecord.assetCategory || sourceRecord.propertyType || '',
    sellerName: contact.name,
    tenantName: contact.name,
    agentName: sourceRecord.brokerName || 'Commercial broker',
    supportEmail: sourceRecord.supportEmail || '',
    supportPhone: sourceRecord.supportPhone || '',
    transactionReference: sourceRecord.transactionReference || sourceRecord.reference || '',
    to: contact.email,
  }
}

async function recordAuditEvent(client, {
  access = {},
  contact = null,
  eventType = 'portal_event',
  eventTitle = '',
  relatedEntityType = '',
  relatedEntityId = '',
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
    portal_role: normalizeLower(access.portal_role || access.role),
    event_type: normalizeText(eventType),
    event_title: normalizeText(eventTitle) || titleize(eventType),
    related_entity_type: normalizeText(relatedEntityType) || null,
    related_entity_id: normalizeText(relatedEntityId) || null,
    actor_type: 'broker',
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

async function fetchOnboardingAccess(client, token) {
  const { data, error } = await client
    .from(PORTAL_ACCESS_TABLE)
    .select('*')
    .eq('token', normalizeText(token))
    .eq('status', 'active')
    .maybeSingle()
  if (error) {
    if (isMissingPortalTable(error, PORTAL_ACCESS_TABLE)) throw new Error('Commercial onboarding access is not configured.')
    throw error
  }
  if (!data) throw new Error('Commercial onboarding link is invalid or inactive.')
  const expiry = asDate(data.expires_at)
  if (expiry && expiry < new Date()) throw new Error('Commercial onboarding link has expired.')
  return data
}

async function fetchOnboardingContact(client, contactId) {
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

async function fetchOnboardingRowsByIds(client, table, ids = []) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
  if (!uniqueIds.length) return []
  const { data, error } = await client.from(table).select('*').in('id', uniqueIds)
  if (error) {
    if (isMissingPortalTable(error, table)) return []
    throw error
  }
  return data || []
}

async function fetchOnboardingDocuments(client, access = {}) {
  const { data, error } = await client
    .from(COMMERCIAL_DOCUMENTS_TABLE)
    .select('*')
    .eq('organisation_id', access.organisation_id)
    .eq('entity_type', ONBOARDING_ENTITY_TYPE)
    .eq('entity_id', access.id)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingPortalTable(error, COMMERCIAL_DOCUMENTS_TABLE)) return []
    throw error
  }
  return data || []
}

async function fetchOnboardingDocumentRequests(client, access = {}) {
  const { data, error } = await client
    .from(COMMERCIAL_DOCUMENT_REQUESTS_TABLE)
    .select('*')
    .eq('organisation_id', access.organisation_id)
    .eq('entity_type', ONBOARDING_ENTITY_TYPE)
    .eq('entity_id', access.id)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingPortalTable(error, COMMERCIAL_DOCUMENT_REQUESTS_TABLE)) return []
    throw error
  }
  return data || []
}

function buildOnboardingRelatedRows(access = {}) {
  const metadata = access.metadata || {}
  const onboarding = metadata.onboarding || {}
  const sourceRecord = onboarding.sourceRecord || {}
  return {
    propertyIds: [access.property_id, sourceRecord.propertyId].filter(Boolean),
    vacancyIds: [access.vacancy_id, sourceRecord.vacancyId].filter(Boolean),
    listingIds: [access.listing_id, sourceRecord.listingId].filter(Boolean),
    dealIds: [access.deal_id, sourceRecord.dealId].filter(Boolean),
    transactionIds: [access.commercial_transaction_id, sourceRecord.transactionId].filter(Boolean),
    tenantIds: [access.tenant_id, sourceRecord.tenantId].filter(Boolean),
    landlordIds: [access.landlord_id, sourceRecord.landlordId].filter(Boolean),
    companyIds: [access.company_id, sourceRecord.companyId].filter(Boolean),
    contactIds: [access.commercial_contact_id, sourceRecord.contactId].filter(Boolean),
  }
}

async function fetchOnboardingRelatedRows(client, access = {}) {
  const related = buildOnboardingRelatedRows(access)
  const [transactions, deals, companies, contacts, tenants, landlords, properties, vacancies, listings] = await Promise.all([
    fetchOnboardingRowsByIds(client, 'commercial_transactions', related.transactionIds),
    fetchOnboardingRowsByIds(client, 'commercial_deals', related.dealIds),
    fetchOnboardingRowsByIds(client, 'commercial_companies', related.companyIds),
    fetchOnboardingRowsByIds(client, 'commercial_contacts', related.contactIds),
    fetchOnboardingRowsByIds(client, 'commercial_tenants', related.tenantIds),
    fetchOnboardingRowsByIds(client, 'commercial_landlords', related.landlordIds),
    fetchOnboardingRowsByIds(client, 'commercial_properties', related.propertyIds),
    fetchOnboardingRowsByIds(client, 'commercial_vacancies', related.vacancyIds),
    fetchOnboardingRowsByIds(client, 'commercial_listings', related.listingIds),
  ])
  return { transactions, deals, companies, contacts, tenants, landlords, properties, vacancies, listings }
}

function mapOnboardingDocument(row = {}) {
  return {
    id: row.id,
    title: row.document_name || row.file_name || 'Commercial document',
    category: row.category || 'Supporting Documentation',
    status: row.status || 'uploaded',
    uploadedAt: row.uploaded_at || row.created_at,
    entityType: row.entity_type,
    entityId: row.entity_id,
    filePath: row.file_path || '',
    fileBucket: row.file_bucket || 'documents',
  }
}

function mapOnboardingDocumentRequest(row = {}) {
  return {
    id: row.id,
    title: row.document_name || row.category || 'Requested document',
    category: row.category || 'Supporting Documentation',
    requestedFrom: row.requested_from || '',
    dueDate: row.due_date || '',
    priority: row.priority || 'normal',
    notes: row.notes || '',
    status: row.status || 'requested',
    completedDocumentId: row.completed_document_id || '',
  }
}

function buildCompletionSummary({ plan = {}, responses = {}, documents = [], documentRequests = [] } = {}) {
  const completion = buildCommercialOnboardingCompletion({ plan, responses, documents, documentRequests })
  return {
    ...completion,
    pendingItems: [...completion.missingFields, ...completion.missingDocuments].length,
  }
}

async function ensureOnboardingDocumentRequests(client, access = {}, plan = {}) {
  const requiredDocs = (plan.documents || []).filter((doc) => doc.required)
  if (!requiredDocs.length) return []
  const existing = await fetchOnboardingDocumentRequests(client, access)
  const existingKeys = new Set(existing.map((row) => normalizeText(row.category || row.document_name).toLowerCase()))
  const missing = requiredDocs.filter((doc) => !existingKeys.has(normalizeText(doc.label || doc.key).toLowerCase()))
  if (!missing.length) return existing
  const inserts = missing.map((doc) => ({
    organisation_id: access.organisation_id,
    entity_type: ONBOARDING_ENTITY_TYPE,
    entity_id: access.id,
    document_name: doc.label,
    category: doc.label,
    requested_from: 'onboarding_recipient',
    priority: 'normal',
    notes: doc.notes || '',
    status: 'requested',
  }))
  const { error } = await client.from(COMMERCIAL_DOCUMENT_REQUESTS_TABLE).insert(inserts)
  if (error && !isMissingPortalTable(error, COMMERCIAL_DOCUMENT_REQUESTS_TABLE)) throw error
  return fetchOnboardingDocumentRequests(client, access)
}

async function sendOnboardingEmail({
  clientType = 'tenant',
  mode = 'sent',
  contact = {},
  sourceRecord = {},
  organisationName = 'Arch9 Commercial',
  portalUrl = '',
  missingFields = [],
  missingDocuments = [],
}) {
  const payload = buildOnboardingEmailPayload({ clientType, organisationName, sourceRecord, contact, portalUrl, mode, missingFields, missingDocuments })
  if (!payload.to) throw new Error('A contact email is required for onboarding access.')

  if (clientType === 'seller' && mode === 'sent') {
    return invokeEdgeFunction('send-email', {
      body: {
        type: 'seller_onboarding',
        to: payload.to,
        organisationId: sourceRecord.organisationId || '',
        sellerName: payload.sellerName,
        propertyTitle: payload.propertyTitle,
        propertyType: payload.propertyType,
        onboardingLink: payload.onboardingUrl,
        transactionReference: payload.transactionReference,
        agentName: payload.agentName,
        organisationName: payload.organisationName,
        supportEmail: payload.supportEmail,
        supportPhone: payload.supportPhone,
        subject: payload.subject,
      },
    })
  }

  return invokeEdgeFunction('send-email', {
    body: {
      type: 'commercial_access_notification',
      to: payload.to,
      recipientName: payload.recipientName,
      requesterName: clientType === 'seller' ? payload.sellerName : payload.tenantName,
      requesterEmail: payload.to,
      organisationName: payload.organisationName,
      actionLink: payload.actionLink,
      message: payload.message,
      subject: payload.subject,
      eventKind: mode === 'reminder' ? 'reminder' : 'request',
      decision: mode === 'completion' ? 'approved' : '',
      requestId: sourceRecord.id || '',
    },
  })
}

async function updateAccessMetadata(client, access = {}, patch = {}) {
  const nowIso = new Date().toISOString()
  const metadata = {
    ...(access.metadata || {}),
    onboarding: {
      ...((access.metadata || {}).onboarding || {}),
      ...patch,
      responses: {
        ...(((access.metadata || {}).onboarding || {}).responses || {}),
        ...(patch.responses || {}),
      },
      sourceRecord: {
        ...((access.metadata || {}).onboarding || {}).sourceRecord,
        ...(patch.sourceRecord || {}),
      },
      emailEvents: [
        ...(((access.metadata || {}).onboarding || {}).emailEvents || []),
        ...(patch.emailEvents || []),
      ],
    },
  }
  const { data, error } = await client
    .from(PORTAL_ACCESS_TABLE)
    .update({
      metadata,
      updated_at: nowIso,
      last_activity_at: nowIso,
      ...(patch.lastEmailSentAt || patch.last_email_sent_at ? { email_last_sent_at: patch.lastEmailSentAt || patch.last_email_sent_at } : {}),
      ...(patch.lastOpenedAt || patch.last_opened_at ? { last_opened_at: patch.lastOpenedAt || patch.last_opened_at } : {}),
      ...(patch.submittedAt || patch.submitted_at ? { submitted_at: patch.submittedAt || patch.submitted_at } : {}),
    })
    .eq('id', access.id)
    .select('*')
    .maybeSingle()
  if (error) {
    if (isMissingPortalTable(error, PORTAL_ACCESS_TABLE)) return null
    throw error
  }
  return data || access
}

function buildAccessSummary(access = {}, contact = null, plan = {}, documents = [], documentRequests = []) {
  const onboarding = (access.metadata || {}).onboarding || {}
  const responses = normalizeCommercialOnboardingResponses(onboarding.responses || {})
  const completion = buildCompletionSummary({ plan, responses, documents, documentRequests })
  return {
    status: onboarding.status || 'not_sent',
    completionPercentage: completion.completionPercentage,
    missingFields: completion.missingFields,
    missingDocuments: completion.missingDocuments,
    lastEmailSentAt: access.email_last_sent_at || onboarding.lastEmailSentAt || '',
    lastOpenedAt: access.last_opened_at || onboarding.lastOpenedAt || '',
    lastSubmittedAt: onboarding.submittedAt || '',
    brokerName: onboarding.brokerName || access.contact?.contact_name || 'Commercial broker',
    portalUrl: `/commercial/onboarding/${access.token}`,
    propertyName: onboarding.sourceRecord?.propertyName || onboarding.sourceRecord?.vacancyName || onboarding.sourceRecord?.listingName || onboarding.sourceRecord?.title || contact?.company_name || 'Commercial record',
  }
}

async function refreshWorkspace(client, access, contact, relatedRows, documents, documentRequests) {
  const onboarding = (access.metadata || {}).onboarding || {}
  const responses = normalizeCommercialOnboardingResponses(onboarding.responses || {})
  const plan = buildCommercialOnboardingPlan({
    clientType: onboarding.clientType || access.portal_role || 'tenant',
    assetCategory: onboarding.assetCategory || 'office',
    entityType: onboarding.entityType || responses.entityType || '',
    vatRegistered: Boolean(responses.vatRegistered),
    existingBond: Boolean(responses.existingBond),
    existingTenants: Boolean(responses.existingTenants),
  })
  const summary = buildAccessSummary(access, contact, plan, documents, documentRequests)
  const sourceRecord = onboarding.sourceRecord || {}
  const relatedProperty = relatedRows.properties?.[0] || null
  const relatedVacancy = relatedRows.vacancies?.[0] || null
  const relatedListing = relatedRows.listings?.[0] || null
  const relatedDeal = relatedRows.deals?.[0] || null
  const relatedTransaction = relatedRows.transactions?.[0] || null

  return {
    access: {
      id: access.id,
      organisationId: access.organisation_id,
      token: access.token,
      role: access.portal_role || 'tenant',
      portalLabel: titleize(access.portal_role || 'tenant'),
      expiresAt: access.expires_at || '',
      status: access.status || 'active',
      visibility: access.visibility || buildOnboardingVisibility(),
      acceptedAt: access.accepted_at || '',
      passwordSetAt: access.password_set_at || '',
      lastActivityAt: access.last_activity_at || access.last_opened_at || '',
      lastEmailSentAt: access.email_last_sent_at || onboarding.lastEmailSentAt || '',
      lastOpenedAt: access.last_opened_at || onboarding.lastOpenedAt || '',
      workflowStatus: onboarding.status || 'sent',
      completionPercentage: summary.completionPercentage,
      clientType: onboarding.clientType || 'tenant',
      transactionType: onboarding.transactionType || 'lease',
      assetCategory: onboarding.assetCategory || 'office',
      entityType: onboarding.entityType || responses.entityType || '',
      submittedAt: onboarding.submittedAt || '',
      sourceRecord,
      property_id: access.property_id || sourceRecord.propertyId || '',
      vacancy_id: access.vacancy_id || sourceRecord.vacancyId || '',
      listing_id: access.listing_id || sourceRecord.listingId || '',
      deal_id: access.deal_id || sourceRecord.dealId || '',
      commercial_transaction_id: access.commercial_transaction_id || sourceRecord.transactionId || '',
      tenant_id: access.tenant_id || sourceRecord.tenantId || '',
      landlord_id: access.landlord_id || sourceRecord.landlordId || '',
      company_id: access.company_id || sourceRecord.companyId || '',
      commercial_contact_id: access.commercial_contact_id || sourceRecord.contactId || '',
    },
    contact: {
      id: contact?.id || '',
      name: contact?.contact_name || contact?.name || '',
      email: contact?.contact_email || contact?.email || '',
      phone: contact?.contact_phone || contact?.phone || '',
      company: contact?.company_name || contact?.company || '',
      companyId: contact?.company_id || access.company_id || '',
      commercialContactId: contact?.commercial_contact_id || access.commercial_contact_id || '',
      metadata: contact?.metadata || {},
    },
    onboarding: {
      clientType: onboarding.clientType || 'tenant',
      transactionType: onboarding.transactionType || 'lease',
      assetCategory: onboarding.assetCategory || 'office',
      entityType: onboarding.entityType || responses.entityType || '',
      responses,
      status: onboarding.status || 'sent',
      completionPercentage: summary.completionPercentage,
      missingFields: summary.missingFields,
      missingDocuments: summary.missingDocuments,
      lastEmailSentAt: access.email_last_sent_at || onboarding.lastEmailSentAt || '',
      lastOpenedAt: access.last_opened_at || onboarding.lastOpenedAt || '',
      lastSubmittedAt: onboarding.submittedAt || '',
      sourceRecord,
    },
    summary,
    plan,
    documents: documents.map(mapOnboardingDocument),
    documentRequests: documentRequests.map(mapOnboardingDocumentRequest),
    relatedRows: {
      properties: relatedRows.properties || (relatedProperty ? [relatedProperty] : []),
      vacancies: relatedRows.vacancies || (relatedVacancy ? [relatedVacancy] : []),
      listings: relatedRows.listings || (relatedListing ? [relatedListing] : []),
      deals: relatedRows.deals || (relatedDeal ? [relatedDeal] : []),
      transactions: relatedRows.transactions || (relatedTransaction ? [relatedTransaction] : []),
    },
  }
}

export function buildCommercialOnboardingInviteDraft({ kind = '', record = {}, lookups = {} } = {}) {
  const source = extractRecordContext(record, kind)
  const normalizedKind = normalizeLower(kind)
  const recordTransactionType = normalizeLower(record.transaction_type || record.deal_type || record.listing_type)
  const maybeSale = recordTransactionType === 'sale' || recordTransactionType === 'investment'
    ? 'sale'
    : recordTransactionType === 'lease'
      ? 'lease'
      : normalizedKind.includes('sale') ||
          normalizedKind === 'property' ||
          normalizedKind === 'properties' ||
          normalizedKind === 'listing' ||
          normalizedKind === 'listings' ||
          normalizedKind === 'deals' ||
          normalizedKind === 'transactions'
        ? 'sale'
        : normalizedKind.includes('lease') ||
            normalizedKind === 'vacancy' ||
            normalizedKind === 'vacancies' ||
            normalizedKind === 'tenants' ||
            normalizedKind === 'requirement' ||
            normalizedKind === 'requirements'
          ? 'lease'
          : 'lease'
  const clientType = maybeSale === 'sale' ? 'seller' : 'tenant'
  const assetCategory = normalizeAssetCategory(
    record.property_category || record.property_type || record.listing_category || record.asset_category || record.type || 'office',
  )
  const contact = resolveInvitationContact({ clientType, sourceRecord: source.sourceRecord, contact: record })
  return {
    clientType,
    transactionType: maybeSale,
    assetCategory,
    sourceRecord: {
      ...source.sourceRecord,
      assetCategory,
      transactionType: maybeSale,
      recordKind: normalizedKind,
      lookups: {
        propertyName: lookups.properties?.find((row) => row.value === record.property_id)?.label || source.sourceRecord.propertyName || '',
        vacancyName: lookups.vacancies?.find((row) => row.value === record.vacancy_id)?.label || source.sourceRecord.vacancyName || '',
        listingName: lookups.listings?.find((row) => row.value === record.listing_id)?.label || source.sourceRecord.listingName || '',
      },
    },
    contact,
    label: clientType === 'seller' ? 'Send Seller Onboarding' : 'Send Tenant Onboarding',
    title: clientType === 'seller' ? 'Seller onboarding' : 'Tenant onboarding',
    description: clientType === 'seller'
      ? 'Invite the legal owner or seller entity to complete commercial sales onboarding.'
      : 'Invite the occupier to complete commercial leasing onboarding.',
  }
}

export async function createCommercialOnboardingInvitation({
  organisationId,
  clientType = 'tenant',
  transactionType = 'lease',
  assetCategory = 'office',
  sourceRecord = {},
  contact = {},
  expiryDays = 30,
} = {}) {
  const client = requireInternalClient()
  const normalizedClientType = normalizeClientType(clientType)
  const normalizedTransactionType = normalizeLower(transactionType) === 'sale' ? 'sale' : 'lease'
  const normalizedAssetCategory = normalizeAssetCategory(assetCategory)
  const resolvedContact = resolveInvitationContact({ clientType: normalizedClientType, sourceRecord, contact })
  if (!organisationId) throw new Error('An organisation is required.')
  if (!resolvedContact.email) throw new Error('A contact email is required for onboarding access.')

  const contactPayload = {
    organisation_id: organisationId,
    portal_role: normalizedClientType,
    contact_name: resolvedContact.name,
    contact_email: resolvedContact.email,
    contact_phone: resolvedContact.phone || null,
    company_name: resolvedContact.company || null,
    status: 'active',
    invitation_status: 'invited',
    metadata: {
      workflow: ONBOARDING_WORKFLOW_KEY,
      clientType: normalizedClientType,
      transactionType: normalizedTransactionType,
      assetCategory: normalizedAssetCategory,
      sourceRecord,
    },
  }
  const { data: savedContact, error: contactError } = await client.from(PORTAL_CONTACTS_TABLE).insert(contactPayload).select('*').single()
  if (contactError) throw contactError

  const metadata = {
    workflow: ONBOARDING_WORKFLOW_KEY,
    onboarding: {
      clientType: normalizedClientType,
      transactionType: normalizedTransactionType,
      assetCategory: normalizedAssetCategory,
      entityType: normalizeEntityType(sourceRecord.entityType || ''),
      responses: {},
      status: 'sent',
      completionPercentage: 0,
      lastEmailSentAt: new Date().toISOString(),
      sourceRecord: {
        ...sourceRecord,
        assetCategory: normalizedAssetCategory,
        transactionType: normalizedTransactionType,
        clientType: normalizedClientType,
      },
      emailEvents: [{ type: 'onboarding_sent', at: new Date().toISOString() }],
    },
  }

  const { data: access, error: accessError } = await client.from(PORTAL_ACCESS_TABLE).insert({
    organisation_id: organisationId,
    contact_id: savedContact.id,
    portal_role: normalizedClientType,
    token: createPortalToken(),
    status: 'active',
    expires_at: addDays(expiryDays),
    invitation_sent_at: new Date().toISOString(),
    last_opened_at: null,
    email_last_sent_at: new Date().toISOString(),
    email_delivery_status: 'pending',
    visibility: buildOnboardingVisibility(),
    company_id: sourceRecord.companyId || null,
    commercial_contact_id: sourceRecord.contactId || null,
    commercial_transaction_id: sourceRecord.transactionId || null,
    deal_id: sourceRecord.dealId || null,
    property_id: sourceRecord.propertyId || null,
    vacancy_id: sourceRecord.vacancyId || null,
    listing_id: sourceRecord.listingId || null,
    tenant_id: sourceRecord.tenantId || null,
    landlord_id: sourceRecord.landlordId || null,
    metadata,
  }).select('*').single()
  if (accessError) throw accessError

  const portalUrl = `/commercial/onboarding/${access.token}`
  let emailDeliveryStatus = 'sent'
  try {
    const response = await sendOnboardingEmail({
      clientType: normalizedClientType,
      mode: 'sent',
      contact: resolvedContact,
      sourceRecord,
      organisationName: sourceRecord.organisationName || resolvedContact.company || 'Arch9 Commercial',
      portalUrl,
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

  await recordAuditEvent(client, {
    access,
    contact: savedContact,
    eventType: 'onboarding_sent',
    eventTitle: `${titleize(normalizedClientType)} onboarding sent`,
    metadata: { emailDeliveryStatus, clientType: normalizedClientType, transactionType: normalizedTransactionType, assetCategory: normalizedAssetCategory },
  }).catch(() => null)

  return {
    ...access,
    contact: savedContact,
    emailDeliveryStatus,
    portalUrl,
  }
}

export async function getCommercialOnboardingWorkspaceData(token) {
  const client = getPortalClient(token)
  const access = await fetchOnboardingAccess(client, token)
  const [contact, relatedRows, documents, documentRequests] = await Promise.all([
    fetchOnboardingContact(client, access.contact_id),
    fetchOnboardingRelatedRows(client, access),
    fetchOnboardingDocuments(client, access),
    fetchOnboardingDocumentRequests(client, access),
  ])
  const onboarding = (access.metadata || {}).onboarding || {}
  const plan = buildCommercialOnboardingPlan({
    clientType: onboarding.clientType || access.portal_role || 'tenant',
    assetCategory: onboarding.assetCategory || 'office',
    entityType: onboarding.entityType || '',
    vatRegistered: Boolean(onboarding.responses?.vatRegistered),
    existingBond: Boolean(onboarding.responses?.existingBond),
    existingTenants: Boolean(onboarding.responses?.existingTenants),
  })
  const responses = normalizeCommercialOnboardingResponses(onboarding.responses || {})
  const completion = buildCompletionSummary({ plan, responses, documents, documentRequests })
  const nextDocumentRequests = await ensureOnboardingDocumentRequests(client, access, plan)
  const refreshedDocumentRequests = nextDocumentRequests.length ? nextDocumentRequests : documentRequests
  const summary = buildAccessSummary(access, contact, plan, documents, refreshedDocumentRequests)
  await updatePortalAccessActivity(client, access.id, { last_opened_at: new Date().toISOString() }).catch(() => null)
  await recordAuditEvent(client, {
    access,
    contact,
    eventType: 'onboarding_opened',
    eventTitle: 'Onboarding opened',
    metadata: { source: 'commercial_onboarding_workspace' },
  }).catch(() => null)
  const workspace = await refreshWorkspace(client, access, contact, relatedRows, documents, refreshedDocumentRequests)
  return {
    ...workspace,
    onboarding: {
      ...workspace.onboarding,
      responses,
      completionPercentage: completion.completionPercentage,
      missingFields: completion.missingFields,
      missingDocuments: completion.missingDocuments,
    },
    summary,
    documentRequests: refreshedDocumentRequests.map(mapOnboardingDocumentRequest),
  }
}

export async function updateCommercialOnboardingProgress(token, patch = {}) {
  const client = getPortalClient(token)
  const access = await fetchOnboardingAccess(client, token)
  const onboarding = (access.metadata || {}).onboarding || {}
  const existingResponses = normalizeCommercialOnboardingResponses(onboarding.responses || {})
  const nextResponses = normalizeCommercialOnboardingResponses(patch.responses || {})
  const mergedResponses = {
    ...existingResponses,
    ...nextResponses,
  }
  const nextEntityType = normalizeEntityType(patch.entityType || mergedResponses.entityType || onboarding.entityType || '')
  if (nextEntityType) mergedResponses.entityType = nextEntityType
  const nextClientType = normalizeClientType(patch.clientType || onboarding.clientType || access.portal_role || 'tenant')
  const nextAssetCategory = normalizeAssetCategory(patch.assetCategory || onboarding.assetCategory || 'office')
  const plan = buildCommercialOnboardingPlan({
    clientType: nextClientType,
    assetCategory: nextAssetCategory,
    entityType: nextEntityType || onboarding.entityType || '',
    vatRegistered: Boolean(mergedResponses.vatRegistered),
    existingBond: Boolean(mergedResponses.existingBond),
    existingTenants: Boolean(mergedResponses.existingTenants),
  })
  const documents = await fetchOnboardingDocuments(client, access)
  const documentRequests = await fetchOnboardingDocumentRequests(client, access)
  const completion = buildCompletionSummary({ plan, responses: mergedResponses, documents, documentRequests })
  const nextStatus = patch.status || onboarding.status || (completion.completionPercentage > 0 ? 'in_progress' : 'sent')
  const updatedAccess = await updateAccessMetadata(client, access, {
    clientType: nextClientType,
    transactionType: patch.transactionType || onboarding.transactionType || 'lease',
    assetCategory: nextAssetCategory,
    entityType: nextEntityType || '',
    status: nextStatus,
    completionPercentage: completion.completionPercentage,
    lastSavedAt: new Date().toISOString(),
    responses: mergedResponses,
    sourceRecord: patch.sourceRecord || onboarding.sourceRecord || {},
    ...(patch.lastEmailSentAt ? { lastEmailSentAt: patch.lastEmailSentAt } : {}),
    ...(patch.lastOpenedAt ? { lastOpenedAt: patch.lastOpenedAt } : {}),
    ...(patch.submittedAt ? { submittedAt: patch.submittedAt } : {}),
  })
  if (nextEntityType) {
    await ensureOnboardingDocumentRequests(client, updatedAccess || access, plan).catch(() => null)
  }
  await recordAuditEvent(client, {
    access: updatedAccess || access,
    eventType: 'onboarding_started',
    eventTitle: 'Onboarding progress updated',
    metadata: { completionPercentage: completion.completionPercentage },
  }).catch(() => null)
  return getCommercialOnboardingWorkspaceData(token)
}

export async function submitCommercialOnboarding(token) {
  const client = getPortalClient(token)
  const workspace = await getCommercialOnboardingWorkspaceData(token)
  const access = workspace.access || {}
  const onboarding = workspace.onboarding || {}
  const missingFields = onboarding.missingFields || []
  const missingDocuments = onboarding.missingDocuments || []
  const mode = missingFields.length || missingDocuments.length ? 'missing_documents' : 'completion'
  const nextStatus = mode === 'completion' ? 'complete' : 'missing_information'
  await updateAccessMetadata(client, { ...access, metadata: (access.metadata || {}) }, {
    status: nextStatus,
    submittedAt: new Date().toISOString(),
    responses: onboarding.responses || {},
    sourceRecord: onboarding.sourceRecord || {},
    completionPercentage: onboarding.completionPercentage || 0,
  })
  const payload = buildOnboardingEmailPayload({
    clientType: onboarding.clientType || 'tenant',
    mode,
    contact: workspace.contact || {},
    sourceRecord: onboarding.sourceRecord || {},
    portalUrl: `/commercial/onboarding/${access.token}`,
    organisationName: onboarding.sourceRecord?.organisationName || workspace.contact?.company || 'Arch9 Commercial',
    missingFields,
    missingDocuments,
  })
  try {
    await sendOnboardingEmail({
      clientType: onboarding.clientType || 'tenant',
      mode,
      contact: workspace.contact || {},
      sourceRecord: onboarding.sourceRecord || {},
      organisationName: onboarding.sourceRecord?.organisationName || workspace.contact?.company || 'Arch9 Commercial',
      portalUrl: `/commercial/onboarding/${access.token}`,
      missingFields,
      missingDocuments,
    })
  } catch {
    // email failures should not block submission state
  }
  await recordAuditEvent(client, {
    access,
    contact: workspace.contact || null,
    eventType: mode === 'completion' ? 'onboarding_completed' : 'onboarding_missing_documents',
    eventTitle: mode === 'completion' ? 'Onboarding completed' : 'Onboarding missing documents',
    metadata: { missingFields, missingDocuments, emailSubject: payload.subject },
  }).catch(() => null)
  return getCommercialOnboardingWorkspaceData(token)
}

export async function resendCommercialOnboardingInvitation(accessId, mode = 'reminder') {
  const client = requireInternalClient()
  const { data: row, error } = await client
    .from(PORTAL_ACCESS_TABLE)
    .select(`*, contact:${PORTAL_CONTACTS_TABLE}(*)`)
    .eq('id', accessId)
    .single()
  if (error) throw error
  const onboarding = (row.metadata || {}).onboarding || {}
  const contact = row.contact || {}
  const portalUrl = `/commercial/onboarding/${row.token}`
  let emailDeliveryStatus = 'sent'
  try {
    const response = await sendOnboardingEmail({
      clientType: onboarding.clientType || row.portal_role || 'tenant',
      mode,
      contact: {
        name: contact.contact_name || contact.name || '',
        email: contact.contact_email || contact.email || '',
        phone: contact.contact_phone || contact.phone || '',
        company: contact.company_name || contact.company || '',
      },
      sourceRecord: onboarding.sourceRecord || {},
      organisationName: onboarding.sourceRecord?.organisationName || contact.company_name || 'Arch9 Commercial',
      portalUrl,
      missingFields: onboarding.missingFields || [],
      missingDocuments: onboarding.missingDocuments || [],
    })
    const sendError = response?.error || response?.data?.error
    emailDeliveryStatus = sendError ? 'failed' : 'sent'
  } catch {
    emailDeliveryStatus = 'failed'
  }
  const { data: updated, error: updateError } = await client
    .from(PORTAL_ACCESS_TABLE)
    .update({
      invitation_sent_at: new Date().toISOString(),
      email_last_sent_at: new Date().toISOString(),
      email_delivery_status: emailDeliveryStatus,
      metadata: {
        ...(row.metadata || {}),
        onboarding: {
          ...onboarding,
          lastEmailSentAt: new Date().toISOString(),
          emailEvents: [...(onboarding.emailEvents || []), { type: mode === 'reminder' ? 'onboarding_reminder_sent' : 'onboarding_sent', at: new Date().toISOString() }],
        },
      },
    })
    .eq('id', accessId)
    .select('*')
    .single()
  if (updateError) throw updateError
  await recordAuditEvent(client, {
    access: updated,
    contact,
    eventType: mode === 'reminder' ? 'onboarding_reminder_sent' : 'onboarding_sent',
    eventTitle: mode === 'reminder' ? 'Onboarding reminder sent' : 'Onboarding link resent',
    metadata: { emailDeliveryStatus, mode },
  }).catch(() => null)
  return { ...updated, contact, portalUrl, emailDeliveryStatus }
}

export async function listCommercialOnboardingAccessForOrganisation(organisationId) {
  const accessRows = await listCommercialPortalAccessForOrganisation(organisationId)
  return accessRows.filter((row) => normalizeLower(row?.metadata?.workflow) === ONBOARDING_WORKFLOW_KEY)
}

export async function fetchCommercialOnboardingAccessRows(organisationId) {
  return listCommercialOnboardingAccessForOrganisation(organisationId)
}

async function uploadCommercialOnboardingPortalFile(client, { accessId, file }) {
  if (!file) return { bucket: '', path: '' }
  const objectPath = ['commercial-onboarding', safeFileName(accessId), `${Date.now()}-${safeFileName(file.name || 'document')}`].join('/')
  for (const bucket of COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES) {
    const { error } = await client.storage.from(bucket).upload(objectPath, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    })
    if (!error) return { bucket, path: objectPath }
    if (!/bucket|not found|does not exist/i.test(String(error.message || ''))) throw error
  }
  throw new Error('Commercial onboarding document storage is not configured.')
}

export async function uploadCommercialOnboardingDocument({ token = '', file = null, category = 'Supporting Documentation', documentRequestId = '', notes = '' } = {}) {
  const client = getPortalClient(token)
  const workspace = await getCommercialOnboardingWorkspaceData(token)
  const uploaded = await uploadCommercialOnboardingPortalFile(client, { accessId: workspace.access.id, file })
  const payload = {
    organisation_id: workspace.access.organisationId || workspace.access.organisation_id || null,
    entity_type: ONBOARDING_ENTITY_TYPE,
    entity_id: workspace.access.id,
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
  const { data, error } = await client.from(COMMERCIAL_DOCUMENTS_TABLE).insert(payload).select('*').single()
  if (error) throw error
  if (documentRequestId) {
    await client
      .from(COMMERCIAL_DOCUMENT_REQUESTS_TABLE)
      .update({ status: 'uploaded', completed_document_id: data.id, updated_at: new Date().toISOString() })
      .eq('id', documentRequestId)
      .throwOnError()
      .catch(() => null)
  }
  await client.from(PORTAL_NOTIFICATIONS_TABLE).insert({
    organisation_id: payload.organisation_id,
    access_id: workspace.access.id,
    portal_role: workspace.access.role,
    notification_type: 'document_uploaded',
    title: 'Document uploaded',
    description: `${payload.document_name} was uploaded for broker review.`,
    priority: 'normal',
    status: 'unread',
    action_route: 'documents',
    related_entity_type: ONBOARDING_ENTITY_TYPE,
    related_entity_id: workspace.access.id,
  }).throwOnError().catch(() => null)
  await recordAuditEvent(client, {
    access: workspace.access,
    contact: workspace.contact,
    eventType: 'document_upload',
    eventTitle: 'Onboarding document uploaded',
    relatedEntityType: ONBOARDING_ENTITY_TYPE,
    relatedEntityId: workspace.access.id,
    metadata: { documentId: data.id, documentRequestId, category: payload.category, fileName: payload.file_name },
  }).catch(() => null)
  await updatePortalAccessActivity(client, workspace.access.id).catch(() => null)
  return data || null
}

export async function getCommercialOnboardingDocumentDownloadUrl({ token = '', document = null } = {}) {
  const client = getPortalClient(token)
  const workspace = await getCommercialOnboardingWorkspaceData(token)
  const targetDocument = document?.id
    ? document
    : (workspace.documents || []).find((row) => row.id === document)
  const path = normalizeText(targetDocument?.filePath || targetDocument?.file_path)
  const bucket = normalizeText(targetDocument?.fileBucket || targetDocument?.file_bucket || 'documents')
  if (!path) throw new Error('Document file path is missing.')
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60 * 10)
  if (error) throw error
  await updatePortalAccessActivity(client, workspace.access.id).catch(() => null)
  return data?.signedUrl || ''
}

export function buildCommercialOnboardingBrokerSummary(accessRow = {}) {
  const onboarding = accessRow?.metadata?.onboarding || {}
  const responses = normalizeCommercialOnboardingResponses(onboarding.responses || {})
  const plan = buildCommercialOnboardingPlan({
    clientType: onboarding.clientType || accessRow.portal_role || 'tenant',
    assetCategory: onboarding.assetCategory || 'office',
    entityType: onboarding.entityType || responses.entityType || '',
    vatRegistered: Boolean(responses.vatRegistered),
    existingBond: Boolean(responses.existingBond),
    existingTenants: Boolean(responses.existingTenants),
  })
  const completion = buildCommercialOnboardingCompletion({
    plan,
    responses,
    documents: accessRow.documents || [],
    documentRequests: accessRow.documentRequests || [],
  })
  return {
    id: accessRow.id,
    token: accessRow.token,
    status: onboarding.status || 'sent',
    clientType: onboarding.clientType || 'tenant',
    assetCategory: onboarding.assetCategory || 'office',
    entityType: onboarding.entityType || responses.entityType || '',
    completionPercentage: completion.completionPercentage,
    missingFields: completion.missingFields,
    missingDocuments: completion.missingDocuments,
    lastEmailSentAt: accessRow.email_last_sent_at || onboarding.lastEmailSentAt || '',
    lastOpenedAt: accessRow.last_opened_at || onboarding.lastOpenedAt || '',
    lastSubmittedAt: onboarding.submittedAt || '',
    portalUrl: `/commercial/onboarding/${accessRow.token}`,
    contactName: accessRow.contact?.contact_name || accessRow.contact?.company_name || 'Commercial client',
    contactEmail: accessRow.contact?.contact_email || '',
    brokerLabel: titleize(accessRow.portal_role || 'tenant'),
    propertyName: onboarding.sourceRecord?.propertyName || onboarding.sourceRecord?.vacancyName || onboarding.sourceRecord?.listingName || onboarding.sourceRecord?.title || 'Commercial record',
    summaryText: completion.isComplete ? 'Complete' : `${completion.missingFields.length + completion.missingDocuments.length} items outstanding`,
  }
}
