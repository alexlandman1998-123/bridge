import { getAuthenticatedUser, isMissingTableError, requireClient } from '../attorneyFirmServiceShared.js'
import {
  ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_KEYS,
  listAttorneyClientFinancialDocumentDefaults,
  resolveAttorneyClientFinancialDocumentSettings,
} from './attorneyClientFinancialDocumentConfig.js'

const DEFINITION_KEYS = Object.freeze(Object.values(ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_KEYS))

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeOptionalText(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function normalizeOptionalAmount(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function normalizeOptionalDate(value) {
  const normalized = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function isInvoiceKey(value) {
  return [
    ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_KEYS.buyerTransferCostInvoice,
    ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_KEYS.sellerAttorneyInvoice,
  ].includes(normalizeKey(value))
}

function normalizeMetadataRow(row = {}) {
  return {
    id: row.id || null,
    organisationId: row.organisation_id || null,
    attorneyFirmId: row.attorney_firm_id || null,
    transactionId: row.transaction_id || null,
    documentDefinitionKey: normalizeKey(row.document_definition_key),
    invoiceReference: row.invoice_reference || '',
    amount: row.amount === null || row.amount === undefined ? '' : Number(row.amount),
    documentDate: row.document_date || '',
    paymentDueDate: row.payment_due_date || '',
    notes: row.notes || '',
    documentId: row.document_id || null,
    recipientRole: row.recipient_role || '',
    publicationStatus: row.publication_status || 'internal',
    publishedAt: row.published_at || null,
    publishedBy: row.published_by || null,
    withdrawnAt: row.withdrawn_at || null,
    withdrawnBy: row.withdrawn_by || null,
    updatedAt: row.updated_at || row.created_at || null,
  }
}

function normalizePublicationEvent(row = {}) {
  return {
    id: row.id || null,
    documentDefinitionKey: normalizeKey(row.document_definition_key),
    documentId: row.document_id || null,
    recipientRole: row.recipient_role || '',
    action: row.action || '',
    deliveryStatus: row.delivery_status || 'pending',
    clientNotificationId: row.client_notification_id || null,
    notificationEventId: row.notification_event_id || null,
    createdAt: row.created_at || null,
  }
}

function normalizeAccessEvent(row = {}) {
  return {
    id: row.id || null,
    publicationEventId: row.publication_event_id || null,
    documentDefinitionKey: normalizeKey(row.document_definition_key),
    documentId: row.document_id || null,
    recipientRole: row.recipient_role || '',
    eventType: row.event_type || '',
    createdAt: row.created_at || null,
  }
}

function normalizeReminderEvent(row = {}) {
  return {
    id: row.id || null,
    publicationEventId: row.publication_event_id || null,
    documentDefinitionKey: normalizeKey(row.document_definition_key),
    documentId: row.document_id || null,
    recipientRole: row.recipient_role || '',
    reminderKind: row.reminder_kind || '',
    reminderNumber: Number(row.reminder_number) || 0,
    deliveryStatus: row.delivery_status || 'pending',
    clientNotificationId: row.client_notification_id || null,
    notificationEventId: row.notification_event_id || null,
    createdAt: row.created_at || null,
  }
}

export async function fetchAttorneyClientFinancialDocumentWorkspace({ transactionId, organisationId, attorneyFirmId } = {}) {
  if (!transactionId) {
    return { settings: listAttorneyClientFinancialDocumentDefaults(), metadata: [], history: [], accessEvents: [], reminderEvents: [] }
  }

  const client = requireClient()
  const settingsQuery = organisationId && attorneyFirmId
    ? client
        .from('attorney_client_financial_document_settings')
        .select('document_definition_key, requirement_level, is_enabled, lodgement_blocking, closeout_blocking, due_business_days, upload_visibility_default, publication_required')
        .eq('organisation_id', organisationId)
        .eq('attorney_firm_id', attorneyFirmId)
        .in('document_definition_key', DEFINITION_KEYS)
    : Promise.resolve({ data: [], error: null })
  const metadataQuery = client
    .from('transaction_attorney_client_financial_document_metadata')
    .select('id, organisation_id, attorney_firm_id, transaction_id, document_definition_key, invoice_reference, amount, document_date, payment_due_date, notes, document_id, recipient_role, publication_status, published_at, published_by, withdrawn_at, withdrawn_by, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .in('document_definition_key', DEFINITION_KEYS)
  const historyQuery = client
    .from('attorney_client_financial_document_publication_events')
    .select('id, document_definition_key, document_id, recipient_role, action, delivery_status, client_notification_id, notification_event_id, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(100)
  const accessEventsQuery = client
    .from('attorney_client_financial_document_access_events')
    .select('id, publication_event_id, document_definition_key, document_id, recipient_role, event_type, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(100)
  const reminderEventsQuery = client
    .from('attorney_client_financial_document_reminder_events')
    .select('id, publication_event_id, document_definition_key, document_id, recipient_role, reminder_kind, reminder_number, delivery_status, client_notification_id, notification_event_id, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(100)

  const [settingsResult, metadataResult, historyResult, accessEventsResult, reminderEventsResult] = await Promise.all([
    settingsQuery,
    metadataQuery,
    historyQuery,
    accessEventsQuery,
    reminderEventsQuery,
  ])

  if (settingsResult.error && !isMissingTableError(settingsResult.error, 'attorney_client_financial_document_settings')) {
    throw settingsResult.error
  }
  if (metadataResult.error && !isMissingTableError(metadataResult.error, 'transaction_attorney_client_financial_document_metadata')) {
    throw metadataResult.error
  }
  if (historyResult.error && !isMissingTableError(historyResult.error, 'attorney_client_financial_document_publication_events')) {
    throw historyResult.error
  }
  if (accessEventsResult.error && !isMissingTableError(accessEventsResult.error, 'attorney_client_financial_document_access_events')) {
    throw accessEventsResult.error
  }
  if (reminderEventsResult.error && !isMissingTableError(reminderEventsResult.error, 'attorney_client_financial_document_reminder_events')) {
    throw reminderEventsResult.error
  }

  return {
    settings: resolveAttorneyClientFinancialDocumentSettings(settingsResult.data || []),
    metadata: (metadataResult.data || []).map(normalizeMetadataRow),
    history: (historyResult.data || []).map(normalizePublicationEvent),
    accessEvents: (accessEventsResult.data || []).map(normalizeAccessEvent),
    reminderEvents: (reminderEventsResult.data || []).map(normalizeReminderEvent),
  }
}

export async function saveAttorneyClientFinancialDocumentMetadata({
  transactionId,
  organisationId,
  attorneyFirmId,
  documentDefinitionKey,
  input = {},
} = {}) {
  const key = normalizeKey(documentDefinitionKey)
  if (!transactionId || !organisationId || !attorneyFirmId || !DEFINITION_KEYS.includes(key)) {
    throw new Error('Transaction, organisation, attorney firm, and a supported document type are required.')
  }

  const client = requireClient()
  const user = await getAuthenticatedUser(client)
  const invoice = isInvoiceKey(key)
  const payload = {
    organisation_id: organisationId,
    attorney_firm_id: attorneyFirmId,
    transaction_id: transactionId,
    document_definition_key: key,
    invoice_reference: invoice ? normalizeOptionalText(input.invoiceReference) : null,
    amount: invoice ? normalizeOptionalAmount(input.amount) : null,
    document_date: normalizeOptionalDate(input.documentDate),
    payment_due_date: invoice ? normalizeOptionalDate(input.paymentDueDate) : null,
    notes: normalizeOptionalText(input.notes),
    updated_by: user?.id || null,
    updated_at: new Date().toISOString(),
  }

  const result = await client
    .from('transaction_attorney_client_financial_document_metadata')
    .upsert(payload, { onConflict: 'transaction_id,document_definition_key' })
    .select('id, organisation_id, attorney_firm_id, transaction_id, document_definition_key, invoice_reference, amount, document_date, payment_due_date, notes, document_id, recipient_role, publication_status, published_at, published_by, withdrawn_at, withdrawn_by, created_at, updated_at')
    .single()

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_attorney_client_financial_document_metadata')) {
      throw new Error('Attorney client financial document metadata is not set up yet. Apply the Phase 2 database migration.')
    }
    throw result.error
  }

  return normalizeMetadataRow(result.data)
}

export async function setAttorneyClientFinancialDocumentPublication({
  transactionId,
  organisationId,
  attorneyFirmId,
  documentDefinitionKey,
  documentId,
  action,
} = {}) {
  const key = normalizeKey(documentDefinitionKey)
  const normalizedAction = normalizeKey(action)
  if (!transactionId || !organisationId || !attorneyFirmId || !documentId || !DEFINITION_KEYS.includes(key)) {
    throw new Error('A transaction, firm, supported document, and uploaded file are required.')
  }
  if (!['published', 'withdrawn'].includes(normalizedAction)) {
    throw new Error('Publication action must be published or withdrawn.')
  }

  const client = requireClient()
  const result = await client.rpc('bridge_set_attorney_client_financial_document_publication', {
    p_organisation_id: organisationId,
    p_attorney_firm_id: attorneyFirmId,
    p_transaction_id: transactionId,
    p_document_definition_key: key,
    p_document_id: documentId,
    p_action: normalizedAction,
  })
  if (result.error) {
    if (String(result.error.message || '').includes('bridge_set_attorney_client_financial_document_publication')) {
      throw new Error('Attorney document publication is not set up yet. Apply the Phase 3 database migration.')
    }
    throw result.error
  }
  return normalizeMetadataRow(result.data || {})
}

export async function sendAttorneyClientFinancialDocumentReminder({
  transactionId,
  organisationId,
  attorneyFirmId,
  documentDefinitionKey,
  documentId,
} = {}) {
  const key = normalizeKey(documentDefinitionKey)
  if (!transactionId || !organisationId || !attorneyFirmId || !documentId || !DEFINITION_KEYS.includes(key)) {
    throw new Error('A published client financial document is required for a reminder.')
  }

  const client = requireClient()
  const result = await client.rpc('bridge_send_attorney_client_financial_document_reminder', {
    p_organisation_id: organisationId,
    p_attorney_firm_id: attorneyFirmId,
    p_transaction_id: transactionId,
    p_document_definition_key: key,
    p_document_id: documentId,
  })
  if (result.error) {
    if (String(result.error.message || '').includes('bridge_send_attorney_client_financial_document_reminder')) {
      throw new Error('Financial document reminders are not set up yet. Apply the Phase 6 database migration.')
    }
    throw result.error
  }
  return normalizeReminderEvent(result.data || {})
}

export function addBusinessDays(value, days = 0) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return ''
  let remaining = Math.max(0, Number(days) || 0)
  while (remaining > 0) {
    date.setDate(date.getDate() + 1)
    const day = date.getDay()
    if (day !== 0 && day !== 6) remaining -= 1
  }
  return date.toISOString().slice(0, 10)
}

export function isRegisteredAttorneyTransaction(transaction = {}) {
  const signal = [
    transaction.lifecycle_state,
    transaction.stage,
    transaction.current_main_stage,
    transaction.attorney_stage,
  ].map((item) => String(item || '').trim().toLowerCase()).join(' ')
  return Boolean(
    transaction.registered_at ||
    transaction.registration_date ||
    /(^|\s)(registered|reg)(\s|$)/.test(signal)
  )
}

export function getAttorneyClientFinancialDocumentOperationalStatus({ available = true, document = null, published = false, dueDate = '', today = new Date() } = {}) {
  if (!available) return 'not_available'
  if (published) return 'published'
  if (document) return 'ready_to_publish'
  if (!dueDate) return 'outstanding'
  const due = new Date(`${dueDate}T00:00:00Z`)
  const current = new Date(today)
  if (Number.isNaN(due.getTime()) || Number.isNaN(current.getTime())) return 'outstanding'
  const currentDay = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate())
  const daysUntilDue = Math.ceil((due.getTime() - currentDay) / 86_400_000)
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 2) return 'due_soon'
  return 'outstanding'
}

export function getAttorneyClientFinancialDocumentAssurance({
  published = false,
  document = null,
  metadata = null,
  publicationEvent = null,
  viewReceipt = null,
} = {}) {
  if (!published) return { status: 'internal', issues: [] }

  const recipientRole = metadata?.recipientRole || metadata?.recipient_role || ''
  const issues = []
  if (!document?.id || document.id !== (metadata?.documentId || metadata?.document_id)) issues.push('document_mismatch')
  if (document?.is_client_visible === false) issues.push('visibility_mismatch')
  if (document?.client_recipient_role && document.client_recipient_role !== recipientRole) issues.push('recipient_mismatch')
  if (!publicationEvent) issues.push('publication_event_missing')
  if (publicationEvent?.deliveryStatus === 'failed') issues.push('delivery_failed')
  else if (publicationEvent && publicationEvent.deliveryStatus !== 'delivered') issues.push('delivery_unconfirmed')

  if (issues.length) return { status: 'needs_attention', issues }
  if (viewReceipt) return { status: 'viewed', issues: [] }
  return { status: 'awaiting_view', issues: [] }
}

export function getAttorneyClientFinancialDocumentReminderState({
  published = false,
  publishedAt = '',
  viewReceipt = null,
  reminderEvents = [],
  now = new Date(),
} = {}) {
  if (!published) return { status: 'inactive', canSend: false, ageDays: 0 }
  if (viewReceipt) return { status: 'completed', canSend: false, ageDays: 0 }

  const publishedDate = new Date(publishedAt || '')
  const currentDate = new Date(now)
  const ageDays = Number.isNaN(publishedDate.getTime()) || Number.isNaN(currentDate.getTime())
    ? 0
    : Math.max(0, Math.floor((currentDate.getTime() - publishedDate.getTime()) / 86_400_000))
  const deliveredReminders = reminderEvents.filter((event) => event.deliveryStatus === 'delivered')
  const latestReminder = deliveredReminders[0] || null
  const latestReminderAt = latestReminder ? new Date(latestReminder.createdAt || '') : null
  const canSend = !latestReminderAt || Number.isNaN(latestReminderAt.getTime()) || currentDate.getTime() - latestReminderAt.getTime() >= 86_400_000

  if (ageDays >= 10) return { status: 'escalated', canSend, ageDays }
  if (deliveredReminders.length) return { status: 'reminded', canSend, ageDays }
  if (ageDays >= 3) return { status: 'due', canSend, ageDays }
  return { status: 'waiting', canSend, ageDays }
}

function getRequirementKey(row = {}) {
  return normalizeKey(
    row.key ||
    row.documentKey ||
    row.document_key ||
    row.documentDefinitionKey ||
    row.document_definition_key,
  )
}

function getRequirementCanonicalId(row = {}) {
  return row.canonicalRequirementInstanceId || row.canonical_requirement_instance_id || row.id || null
}

function getDocumentKey(row = {}) {
  return normalizeKey(row.document_type || row.documentType || row.requiredDocumentKey || row.required_document_key)
}

export function buildAttorneyClientFinancialDocumentRows({
  transaction = {},
  documents = [],
  requirements = [],
  settings = [],
  metadata = [],
  history = [],
  accessEvents = [],
  reminderEvents = [],
} = {}) {
  const registered = isRegisteredAttorneyTransaction(transaction)
  const registrationDate = transaction.registered_at || transaction.registration_date || ''
  const metadataByKey = new Map(metadata.map((row) => [normalizeKey(row.documentDefinitionKey || row.document_definition_key), row]))
  const requirementByKey = new Map(requirements.map((row) => [getRequirementKey(row), row]))
  const documentsByKey = new Map()

  for (const document of [...documents].sort((left, right) => new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0))) {
    const key = getDocumentKey(document)
    if (DEFINITION_KEYS.includes(key) && !documentsByKey.has(key)) documentsByKey.set(key, document)
  }

  return resolveAttorneyClientFinancialDocumentSettings(settings).filter((setting) => setting.isEnabled !== false).map((setting) => {
    const key = setting.documentDefinitionKey
    const requirement = requirementByKey.get(key) || null
    const document = documentsByKey.get(key) || null
    const detail = metadataByKey.get(key) || null
    const finalStatement = key.endsWith('_final_statement')
    const invoice = key.endsWith('_invoice')
    const available = !finalStatement || registered
    const publicationDocumentId = detail?.documentId || detail?.document_id || null
    const dueDate = invoice
      ? detail?.paymentDueDate || detail?.payment_due_date || ''
      : registrationDate && setting.dueBusinessDays !== null
        ? addBusinessDays(registrationDate, setting.dueBusinessDays)
        : ''

    const published = (detail?.publicationStatus || detail?.publication_status) === 'published' && publicationDocumentId === document?.id
    const publishedAt = detail?.publishedAt || detail?.published_at || ''
    const publicationEvent = history.find((event) => (
      event.documentId === publicationDocumentId &&
      event.documentDefinitionKey === key &&
      event.recipientRole === setting.recipientRole &&
      event.action === 'published' &&
      (!publishedAt || new Date(event.createdAt || 0) >= new Date(publishedAt))
    )) || null
    const viewReceipt = accessEvents.find((event) => (
      event.documentId === publicationDocumentId &&
      event.documentDefinitionKey === key &&
      event.recipientRole === setting.recipientRole &&
      event.eventType === 'viewed' &&
      (!publishedAt || new Date(event.createdAt || 0) >= new Date(publishedAt))
    )) || null
    const publicationReminders = reminderEvents.filter((event) => (
      event.publicationEventId === publicationEvent?.id &&
      event.documentId === publicationDocumentId &&
      event.recipientRole === setting.recipientRole
    ))
    const deliveredReminders = publicationReminders.filter((event) => event.deliveryStatus === 'delivered')
    const reminderState = getAttorneyClientFinancialDocumentReminderState({
      published,
      publishedAt,
      viewReceipt,
      reminderEvents: publicationReminders,
    })
    const assurance = getAttorneyClientFinancialDocumentAssurance({
      published,
      document,
      metadata: detail,
      publicationEvent,
      viewReceipt,
    })
    return {
      ...setting,
      key,
      invoice,
      finalStatement,
      available,
      requirement,
      canonicalRequirementInstanceId: requirement ? getRequirementCanonicalId(requirement) : null,
      document,
      metadata: detail,
      publicationStatus: detail?.publicationStatus || detail?.publication_status || 'internal',
      published,
      publicationEvent,
      viewReceipt,
      assuranceStatus: assurance.status,
      assuranceIssues: assurance.issues,
      reminderEvents: publicationReminders,
      lastReminder: deliveredReminders[0] || null,
      reminderCount: deliveredReminders.length,
      reminderStatus: reminderState.status,
      canSendReminder: reminderState.canSend,
      publicationAgeDays: reminderState.ageDays,
      dueDate,
      status: document ? 'uploaded' : available ? 'missing' : 'not_available',
      operationalStatus: getAttorneyClientFinancialDocumentOperationalStatus({ available, document, published, dueDate }),
    }
  })
}
