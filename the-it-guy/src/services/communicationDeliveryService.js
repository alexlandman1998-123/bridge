import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { createSystemEvent } from './leadCommunicationService'
import { assessMvpTestDataProtection } from '../core/transactions/mvpTestDataProtection.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const COMMUNICATION_DELIVERY_STATUSES = ['prepared', 'queued', 'sent', 'delivered', 'failed']
export const COMMUNICATION_DELIVERY_CHANNELS = ['email', 'whatsapp', 'sms']
export const COMMUNICATION_DELIVERY_PROVIDERS = ['sendgrid', 'mailgun', 'twilio', 'meta', 'internal', 'resend']
export const COMMUNICATION_FREQUENCIES = ['immediate', 'daily', 'weekly', 'monthly']
export const COMMUNICATION_OPT_OUT_MESSAGE = 'Buyer has opted out of this communication channel.'
export const NOTIFICATION_MODE = {
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
  EMAIL_AND_WHATSAPP: 'email_and_whatsapp',
  AGENT_ASSISTED: 'agent_assisted',
}

export const CONTROLLED_TEST_NOTIFICATION_SUPPRESSION_REASON = 'controlled_test_recipient'

export const NOTIFICATION_MODE_OPTIONS = [
  { value: NOTIFICATION_MODE.EMAIL, label: 'Email' },
  { value: NOTIFICATION_MODE.WHATSAPP, label: 'WhatsApp' },
  { value: NOTIFICATION_MODE.EMAIL_AND_WHATSAPP, label: 'Email and WhatsApp' },
  { value: NOTIFICATION_MODE.AGENT_ASSISTED, label: 'Agent assisted' },
]

const NOTIFICATION_MODE_ALIASES = {
  email: NOTIFICATION_MODE.EMAIL,
  mail: NOTIFICATION_MODE.EMAIL,
  whatsapp: NOTIFICATION_MODE.WHATSAPP,
  whats_app: NOTIFICATION_MODE.WHATSAPP,
  both: NOTIFICATION_MODE.EMAIL_AND_WHATSAPP,
  email_and_whatsapp: NOTIFICATION_MODE.EMAIL_AND_WHATSAPP,
  email_whatsapp: NOTIFICATION_MODE.EMAIL_AND_WHATSAPP,
  multi_channel: NOTIFICATION_MODE.EMAIL_AND_WHATSAPP,
  agent: NOTIFICATION_MODE.AGENT_ASSISTED,
  assisted: NOTIFICATION_MODE.AGENT_ASSISTED,
  agent_assisted: NOTIFICATION_MODE.AGENT_ASSISTED,
  manual: NOTIFICATION_MODE.AGENT_ASSISTED,
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return UUID_PATTERN.test(normalizeText(value))
}

function nullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function readId(row = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(row?.[key])
    if (value) return value
  }
  return ''
}

function readDate(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key]
    if (!value) continue
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return null
}

function nowIso() {
  return new Date().toISOString()
}

function actorId(actor = null) {
  return nullableUuid(actor?.id || actor?.user_id || actor?.userId)
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before managing communication delivery records.')
  }
  return supabase
}

function normalizeChannel(value = 'email') {
  const normalized = normalizeLower(value).replace(/[-\s]+/g, '_')
  return COMMUNICATION_DELIVERY_CHANNELS.includes(normalized) ? normalized : 'email'
}

function normalizeStatus(value = 'prepared') {
  const normalized = normalizeLower(value).replace(/[-\s]+/g, '_')
  return COMMUNICATION_DELIVERY_STATUSES.includes(normalized) ? normalized : 'prepared'
}

function normalizeProvider(value = 'internal') {
  const normalized = normalizeLower(value).replace(/[-\s]+/g, '_')
  return COMMUNICATION_DELIVERY_PROVIDERS.includes(normalized) ? normalized : 'internal'
}

function normalizeFrequency(value = 'immediate') {
  const normalized = normalizeLower(value).replace(/[-\s]+/g, '_')
  return COMMUNICATION_FREQUENCIES.includes(normalized) ? normalized : 'immediate'
}

export function normalizeNotificationMode(value = '') {
  const normalized = normalizeLower(value).replace(/[-\s]+/g, '_')
  return NOTIFICATION_MODE_ALIASES[normalized] || NOTIFICATION_MODE.EMAIL
}

export function getNotificationModeLabel(value = '') {
  const mode = normalizeNotificationMode(value)
  return NOTIFICATION_MODE_OPTIONS.find((option) => option.value === mode)?.label || 'Email'
}

/**
 * A controlled pilot actor may be recorded in the outbox, but must never be
 * handed to an external delivery provider. The role bootstrap reserves the
 * `.invalid` domain and the TEST — DO NOT ACTION marker for this purpose.
 */
export function assessNotificationRecipientSafety({ email = '', recipientName = '', metadata = {} } = {}) {
  const normalizedEmail = normalizeLower(email)
  const normalizedName = normalizeLower(recipientName)
  const safeMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  const controlledTestRoleSet = normalizeText(safeMetadata.controlledTestRoleSet || safeMetadata.controlled_test_role_set)
  const testDataProtection = assessMvpTestDataProtection({
    payload: { email, recipientName },
    metadata: safeMetadata,
  })
  const blocked = normalizedEmail.endsWith('.invalid') ||
    normalizedName.includes('test — do not action') ||
    normalizedName.includes('test - do not action') ||
    Boolean(controlledTestRoleSet) ||
    testDataProtection.isTestData

  return {
    safe: !blocked,
    suppressed: blocked,
    reason: blocked ? CONTROLLED_TEST_NOTIFICATION_SUPPRESSION_REASON : '',
    message: blocked ? 'Controlled test recipient: external notification delivery is suppressed.' : '',
  }
}

export function buildNotificationModePreferencePatch(mode = '') {
  const normalizedMode = normalizeNotificationMode(mode)
  if (normalizedMode === NOTIFICATION_MODE.WHATSAPP) {
    return { emailEnabled: false, whatsappEnabled: true, preferredChannel: 'whatsapp' }
  }
  if (normalizedMode === NOTIFICATION_MODE.EMAIL_AND_WHATSAPP) {
    return { emailEnabled: true, whatsappEnabled: true, preferredChannel: 'email' }
  }
  if (normalizedMode === NOTIFICATION_MODE.AGENT_ASSISTED) {
    return { emailEnabled: false, whatsappEnabled: false, preferredChannel: 'email' }
  }
  return { emailEnabled: true, whatsappEnabled: false, preferredChannel: 'email' }
}

export function resolveNotificationModeFromPreferences(row = {}) {
  const explicitMode = normalizeText(row.notificationMode || row.notification_mode)
  if (explicitMode) return normalizeNotificationMode(explicitMode)
  const emailEnabled = boolDefault(row.emailEnabled ?? row.email_enabled, true)
  const whatsappEnabled = boolDefault(row.whatsappEnabled ?? row.whatsapp_enabled, false)
  if (emailEnabled && whatsappEnabled) return NOTIFICATION_MODE.EMAIL_AND_WHATSAPP
  if (whatsappEnabled) return NOTIFICATION_MODE.WHATSAPP
  if (emailEnabled) return NOTIFICATION_MODE.EMAIL
  return NOTIFICATION_MODE.AGENT_ASSISTED
}

/**
 * Turns a recipient's selected notification mode into an explicit dispatch
 * plan. Manual modes become a visible handoff, never a silent failed send.
 */
export function resolveNotificationDispatchPlan({ mode = '', email = '', phone = '', recipientName = '', metadata = {} } = {}) {
  const notificationMode = normalizeNotificationMode(mode)
  const recipientSafety = assessNotificationRecipientSafety({ email, recipientName, metadata })
  if (recipientSafety.suppressed) {
    return {
      mode: notificationMode,
      label: getNotificationModeLabel(notificationMode),
      channels: [],
      autoDispatch: false,
      handoffRequired: false,
      blockers: [],
      suppressed: true,
      suppressionReason: recipientSafety.reason,
      suppressionMessage: recipientSafety.message,
    }
  }
  const hasEmail = Boolean(normalizeText(email))
  const hasPhone = Boolean(normalizeText(phone))
  const requiresEmail = [NOTIFICATION_MODE.EMAIL, NOTIFICATION_MODE.EMAIL_AND_WHATSAPP].includes(notificationMode)
  const requiresWhatsApp = [NOTIFICATION_MODE.WHATSAPP, NOTIFICATION_MODE.EMAIL_AND_WHATSAPP].includes(notificationMode)
  const blockers = []
  if (requiresEmail && !hasEmail) blockers.push('Add an email address for this notification mode.')
  if (requiresWhatsApp && !hasPhone) blockers.push('Add a mobile number for this notification mode.')

  return {
    mode: notificationMode,
    label: getNotificationModeLabel(notificationMode),
    channels: [
      ...(requiresEmail && hasEmail ? ['email'] : []),
      ...(requiresWhatsApp && hasPhone ? ['whatsapp'] : []),
    ],
    autoDispatch: notificationMode !== NOTIFICATION_MODE.AGENT_ASSISTED && blockers.length === 0,
    handoffRequired: notificationMode === NOTIFICATION_MODE.AGENT_ASSISTED,
    blockers,
    suppressed: false,
    suppressionReason: '',
    suppressionMessage: '',
  }
}

function boolDefault(value, fallback) {
  return value === undefined || value === null ? fallback : Boolean(value)
}

function clipPreview(value = '', limit = 320) {
  const normalized = normalizeText(value)
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized
}

function createLocalId(prefix = 'delivery') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
}

export function normalizeLeadCommunicationPreferences(row = {}) {
  const leadId = readId(row, ['lead_id', 'leadId'])
  const preferences = {
    leadId,
    organisationId: readId(row, ['organisation_id', 'organisationId']),
    emailEnabled: boolDefault(row.emailEnabled ?? row.email_enabled, true),
    whatsappEnabled: boolDefault(row.whatsappEnabled ?? row.whatsapp_enabled, false),
    marketingOptIn: boolDefault(row.marketingOptIn ?? row.marketing_opt_in, false),
    propertyAlertsEnabled: boolDefault(row.propertyAlertsEnabled ?? row.property_alerts_enabled, true),
    preferredChannel: normalizeChannel(row.preferredChannel || row.preferred_channel),
    frequency: normalizeFrequency(row.frequency),
    unsubscribeToken: normalizeText(row.unsubscribeToken || row.unsubscribe_token),
    createdAt: readDate(row, ['createdAt', 'created_at']),
    updatedAt: readDate(row, ['updatedAt', 'updated_at']),
    raw: row,
  }
  return {
    ...preferences,
    notificationMode: resolveNotificationModeFromPreferences(preferences),
  }
}

export function buildDefaultLeadCommunicationPreferences({ organisationId = '', leadId = '' } = {}) {
  return normalizeLeadCommunicationPreferences({
    organisation_id: nullableUuid(organisationId) || normalizeText(organisationId),
    lead_id: nullableUuid(leadId) || normalizeText(leadId),
    email_enabled: true,
    whatsapp_enabled: false,
    marketing_opt_in: false,
    property_alerts_enabled: true,
    preferred_channel: 'email',
    frequency: 'immediate',
    unsubscribe_token: createLocalId('unsubscribe'),
    created_at: nowIso(),
    updated_at: nowIso(),
  })
}

function buildPreferenceDbPayload({ organisationId = '', leadId = '', updates = {} } = {}) {
  const organisationUuid = nullableUuid(organisationId)
  const leadUuid = nullableUuid(leadId)
  if (!organisationUuid || !leadUuid) throw new Error('Valid organisation and lead ids are required for communication preferences.')
  const payload = {
    organisation_id: organisationUuid,
    lead_id: leadUuid,
  }
  const modePatch = updates.notificationMode !== undefined || updates.notification_mode !== undefined
    ? buildNotificationModePreferencePatch(updates.notificationMode || updates.notification_mode)
    : null
  if (modePatch) {
    payload.email_enabled = modePatch.emailEnabled
    payload.whatsapp_enabled = modePatch.whatsappEnabled
    payload.preferred_channel = modePatch.preferredChannel
  }
  if (updates.emailEnabled !== undefined || updates.email_enabled !== undefined) payload.email_enabled = Boolean(updates.emailEnabled ?? updates.email_enabled)
  if (updates.whatsappEnabled !== undefined || updates.whatsapp_enabled !== undefined) payload.whatsapp_enabled = Boolean(updates.whatsappEnabled ?? updates.whatsapp_enabled)
  if (updates.marketingOptIn !== undefined || updates.marketing_opt_in !== undefined) payload.marketing_opt_in = Boolean(updates.marketingOptIn ?? updates.marketing_opt_in)
  if (updates.propertyAlertsEnabled !== undefined || updates.property_alerts_enabled !== undefined) payload.property_alerts_enabled = Boolean(updates.propertyAlertsEnabled ?? updates.property_alerts_enabled)
  if (updates.preferredChannel !== undefined || updates.preferred_channel !== undefined) payload.preferred_channel = normalizeChannel(updates.preferredChannel || updates.preferred_channel)
  if (updates.frequency !== undefined) payload.frequency = normalizeFrequency(updates.frequency)
  if (updates.unsubscribeToken !== undefined || updates.unsubscribe_token !== undefined) payload.unsubscribe_token = normalizeText(updates.unsubscribeToken || updates.unsubscribe_token)
  payload.updated_at = nowIso()
  return payload
}

export async function getLeadCommunicationPreferences({ organisationId = '', leadId = '' } = {}) {
  const organisationUuid = nullableUuid(organisationId)
  const leadUuid = nullableUuid(leadId)
  if (!organisationUuid || !leadUuid) return null
  const client = requireClient()
  const { data, error } = await client
    .from('lead_communication_preferences')
    .select('*')
    .eq('organisation_id', organisationUuid)
    .eq('lead_id', leadUuid)
    .maybeSingle()
  if (error) throw error
  return data ? normalizeLeadCommunicationPreferences(data) : null
}

export async function ensureLeadCommunicationPreferences({ organisationId = '', leadId = '' } = {}, { actor = null } = {}) {
  const existing = await getLeadCommunicationPreferences({ organisationId, leadId })
  if (existing) return existing
  const client = requireClient()
  const payload = buildPreferenceDbPayload({ organisationId, leadId })
  const { data, error } = await client
    .from('lead_communication_preferences')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  void actor
  return normalizeLeadCommunicationPreferences(data)
}

export async function updateLeadCommunicationPreferences({ organisationId = '', leadId = '', updates = {} } = {}, { actor = null, logEvent = true } = {}) {
  const client = requireClient()
  await ensureLeadCommunicationPreferences({ organisationId, leadId }, { actor })
  const patch = buildPreferenceDbPayload({ organisationId, leadId, updates })
  delete patch.organisation_id
  delete patch.lead_id
  const { data, error } = await client
    .from('lead_communication_preferences')
    .update(patch)
    .eq('organisation_id', nullableUuid(organisationId))
    .eq('lead_id', nullableUuid(leadId))
    .select('*')
    .single()
  if (error) throw error
  const preferences = normalizeLeadCommunicationPreferences(data)
  if (logEvent) {
    await createSystemEvent({
      organisationId,
      leadId,
      subject: 'Communication Preference Updated',
      summary: 'Communication Preference Updated',
      source: 'communication_preferences',
      status: 'updated',
      metadata: { communicationPreferenceUpdated: true, preferences },
    }, { actor, mirrorActivity: true }).catch(() => null)
  }
  return preferences
}

export async function unsubscribeLeadCommunications({ organisationId = '', leadId = '', channel = 'all' } = {}, { actor = null } = {}) {
  const normalizedChannel = normalizeLower(channel)
  const updates = {
    propertyAlertsEnabled: false,
    ...(normalizedChannel === 'email' || normalizedChannel === 'all' ? { emailEnabled: false } : {}),
    ...(normalizedChannel === 'whatsapp' || normalizedChannel === 'all' ? { whatsappEnabled: false } : {}),
  }
  const preferences = await updateLeadCommunicationPreferences({ organisationId, leadId, updates }, { actor, logEvent: false })
  await createSystemEvent({
    organisationId,
    leadId,
    subject: 'Buyer Unsubscribed',
    summary: 'Buyer Unsubscribed',
    source: 'communication_preferences',
    status: 'unsubscribed',
    metadata: { buyerUnsubscribed: true, channel: normalizedChannel || 'all', preferences },
  }, { actor, mirrorActivity: true }).catch(() => null)
  return preferences
}

export function validateCommunicationPreferences(preferences = null, { channel = 'email', communicationType = '' } = {}) {
  if (!preferences) return { ok: false, reason: 'missing_consent', message: COMMUNICATION_OPT_OUT_MESSAGE }
  const notificationMode = resolveNotificationModeFromPreferences(preferences)
  if (notificationMode === NOTIFICATION_MODE.AGENT_ASSISTED) {
    return {
      ok: false,
      reason: 'agent_assisted',
      message: 'This recipient uses agent-assisted notifications. Prepare the communication for agent handoff instead.',
      preferences,
    }
  }
  const normalizedChannel = normalizeChannel(channel)
  if (normalizedChannel === 'email' && !preferences.emailEnabled) return { ok: false, reason: 'email_disabled', message: COMMUNICATION_OPT_OUT_MESSAGE }
  if (normalizedChannel === 'whatsapp' && !preferences.whatsappEnabled) return { ok: false, reason: 'whatsapp_disabled', message: COMMUNICATION_OPT_OUT_MESSAGE }
  const type = normalizeLower(communicationType)
  if ((type.includes('property') || type.includes('listing') || type.includes('alert')) && !preferences.propertyAlertsEnabled) {
    return { ok: false, reason: 'property_alerts_disabled', message: COMMUNICATION_OPT_OUT_MESSAGE }
  }
  return { ok: true, reason: 'allowed', message: '', preferences }
}

export async function validateCommunicationSend({ organisationId = '', leadId = '', channel = 'email', communicationType = '' } = {}, { actor = null } = {}) {
  const preferences = await ensureLeadCommunicationPreferences({ organisationId, leadId }, { actor })
  return validateCommunicationPreferences(preferences, { channel, communicationType })
}

export function normalizeCommunicationDelivery(row = {}) {
  return {
    id: readId(row, ['id', 'deliveryId', 'delivery_id', 'communicationDeliveryId', 'communication_delivery_id']),
    organisationId: readId(row, ['organisation_id', 'organisationId']),
    branchId: readId(row, ['branch_id', 'branchId']),
    leadId: readId(row, ['lead_id', 'leadId']),
    listingId: readId(row, ['listing_id', 'listingId']),
    transactionId: readId(row, ['transaction_id', 'transactionId']),
    offerId: readId(row, ['offer_id', 'offerId']),
    appointmentId: readId(row, ['appointment_id', 'appointmentId']),
    portalSessionId: readId(row, ['portal_session_id', 'portalSessionId']),
    sellerReviewSessionId: readId(row, ['seller_review_session_id', 'sellerReviewSessionId']),
    retryOfId: readId(row, ['retry_of_id', 'retryOfId']),
    communicationType: normalizeText(row.communicationType || row.communication_type) || 'manual',
    channel: normalizeChannel(row.channel),
    recipient: normalizeText(row.recipient),
    recipientRole: normalizeText(row.recipientRole || row.recipient_role),
    subject: normalizeText(row.subject),
    messagePreview: normalizeText(row.messagePreview || row.message_preview),
    status: normalizeStatus(row.status),
    provider: normalizeProvider(row.provider),
    providerMessageId: normalizeText(row.providerMessageId || row.provider_message_id),
    errorMessage: normalizeText(row.errorMessage || row.error_message),
    preparedBy: readId(row, ['preparedBy', 'prepared_by']),
    sentBy: readId(row, ['sentBy', 'sent_by']),
    preparedAt: readDate(row, ['preparedAt', 'prepared_at']),
    sentAt: readDate(row, ['sentAt', 'sent_at']),
    deliveredAt: readDate(row, ['deliveredAt', 'delivered_at']),
    openedAt: readDate(row, ['openedAt', 'opened_at']),
    failedAt: readDate(row, ['failedAt', 'failed_at']),
    createdAt: readDate(row, ['createdAt', 'created_at']) || readDate(row, ['preparedAt', 'prepared_at']),
    updatedAt: readDate(row, ['updatedAt', 'updated_at']),
    agentId: readId(row, ['agentId', 'agent_id', 'sentBy', 'sent_by', 'preparedBy', 'prepared_by']),
    metadata: typeof (row.metadata || row.metadata_json) === 'object' && !Array.isArray(row.metadata || row.metadata_json)
      ? (row.metadata || row.metadata_json)
      : {},
    raw: row,
  }
}

export function buildCommunicationDeliveryPayload(payload = {}, { actor = null } = {}) {
  const organisationId = nullableUuid(payload.organisationId || payload.organisation_id)
  const leadId = nullableUuid(payload.leadId || payload.lead_id)
  const listingId = nullableUuid(payload.listingId || payload.listing_id)
  const transactionId = nullableUuid(payload.transactionId || payload.transaction_id)
  const offerId = nullableUuid(payload.offerId || payload.offer_id)
  const appointmentId = nullableUuid(payload.appointmentId || payload.appointment_id)
  const portalSessionId = nullableUuid(payload.portalSessionId || payload.portal_session_id)
  const sellerReviewSessionId = nullableUuid(payload.sellerReviewSessionId || payload.seller_review_session_id)
  if (!organisationId || (!leadId && !listingId && !transactionId && !offerId && !appointmentId && !portalSessionId && !sellerReviewSessionId)) {
    throw new Error('Communication deliveries require an organisation id and a related lead, listing, offer, appointment, or transaction.')
  }
  const channel = normalizeChannel(payload.channel)
  const recipient = normalizeText(payload.recipient)
  if (!recipient) throw new Error('A recipient is required before preparing a communication delivery.')
  const status = normalizeStatus(payload.status)
  const timestamp = payload.preparedAt || payload.prepared_at || nowIso()
  return {
    organisation_id: organisationId,
    branch_id: nullableUuid(payload.branchId || payload.branch_id),
    lead_id: leadId,
    listing_id: listingId,
    transaction_id: transactionId,
    offer_id: offerId,
    appointment_id: appointmentId,
    portal_session_id: portalSessionId,
    seller_review_session_id: sellerReviewSessionId,
    retry_of_id: nullableUuid(payload.retryOfId || payload.retry_of_id),
    communication_type: normalizeText(payload.communicationType || payload.communication_type || payload.type) || 'manual',
    channel,
    recipient,
    recipient_role: normalizeText(payload.recipientRole || payload.recipient_role) || null,
    subject: normalizeText(payload.subject) || null,
    message_preview: clipPreview(payload.messagePreview || payload.message_preview || payload.message || payload.preview?.message) || null,
    status,
    provider: normalizeProvider(payload.provider),
    provider_message_id: normalizeText(payload.providerMessageId || payload.provider_message_id) || null,
    error_message: normalizeText(payload.errorMessage || payload.error_message) || null,
    prepared_by: nullableUuid(payload.preparedBy || payload.prepared_by) || actorId(actor),
    sent_by: nullableUuid(payload.sentBy || payload.sent_by) || (['sent', 'delivered'].includes(status) ? actorId(actor) : null),
    prepared_at: new Date(timestamp).toISOString(),
    sent_at: payload.sentAt || payload.sent_at || (['sent', 'delivered'].includes(status) ? nowIso() : null),
    delivered_at: payload.deliveredAt || payload.delivered_at || (status === 'delivered' ? nowIso() : null),
    opened_at: payload.openedAt || payload.opened_at || null,
    failed_at: payload.failedAt || payload.failed_at || (status === 'failed' ? nowIso() : null),
    metadata_json: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata) ? payload.metadata : {},
  }
}

export async function createCommunicationDelivery(payload = {}, { actor = null, validateConsent = true } = {}) {
  const dbPayload = buildCommunicationDeliveryPayload(payload, { actor })
  if (validateConsent && dbPayload.lead_id) {
    const consent = await validateCommunicationSend({
      organisationId: dbPayload.organisation_id,
      leadId: dbPayload.lead_id,
      channel: dbPayload.channel,
      communicationType: dbPayload.communication_type,
    }, { actor })
    if (!consent.ok) throw new Error(consent.message)
  }
  const client = requireClient()
  const { data, error } = await client
    .from('communication_deliveries')
    .insert(dbPayload)
    .select('*')
    .single()
  if (error) throw error
  return normalizeCommunicationDelivery(data)
}

export function prepareCommunicationDelivery(payload = {}, options = {}) {
  return createCommunicationDelivery({ ...payload, status: 'prepared' }, options)
}

async function getCommunicationDeliveryById(deliveryId = '') {
  const id = nullableUuid(deliveryId)
  if (!id) throw new Error('Delivery id is required.')
  const client = requireClient()
  const { data, error } = await client
    .from('communication_deliveries')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return normalizeCommunicationDelivery(data)
}

async function updateCommunicationDeliveryStatus(deliveryId = '', updates = {}) {
  const id = nullableUuid(deliveryId)
  if (!id) throw new Error('Delivery id is required.')
  const status = normalizeStatus(updates.status)
  const patch = {
    status,
    provider: updates.provider !== undefined ? normalizeProvider(updates.provider) : undefined,
    provider_message_id: updates.providerMessageId !== undefined || updates.provider_message_id !== undefined
      ? normalizeText(updates.providerMessageId || updates.provider_message_id) || null
      : undefined,
    error_message: updates.errorMessage !== undefined || updates.error_message !== undefined
      ? normalizeText(updates.errorMessage || updates.error_message) || null
      : undefined,
    opened_at: updates.openedAt !== undefined || updates.opened_at !== undefined
      ? updates.openedAt || updates.opened_at || null
      : undefined,
    sent_by: nullableUuid(updates.sentBy || updates.sent_by),
    sent_at: updates.sentAt || updates.sent_at || (status === 'sent' ? nowIso() : undefined),
    delivered_at: updates.deliveredAt || updates.delivered_at || (status === 'delivered' ? nowIso() : undefined),
    failed_at: updates.failedAt || updates.failed_at || (status === 'failed' ? nowIso() : undefined),
  }
  Object.keys(patch).forEach((key) => {
    if (patch[key] === undefined || patch[key] === '') delete patch[key]
  })
  const client = requireClient()
  const { data, error } = await client
    .from('communication_deliveries')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return normalizeCommunicationDelivery(data)
}

export function queueCommunicationDelivery(deliveryId = '', updates = {}) {
  return updateCommunicationDeliveryStatus(deliveryId, { ...updates, status: 'queued' })
}

export function markCommunicationDeliverySent(deliveryId = '', updates = {}) {
  return updateCommunicationDeliveryStatus(deliveryId, { ...updates, status: 'sent' })
}

export function markCommunicationDeliveryDelivered(deliveryId = '', updates = {}) {
  return updateCommunicationDeliveryStatus(deliveryId, { ...updates, status: 'delivered' })
}

export function markCommunicationDeliveryFailed(deliveryId = '', updates = {}) {
  return updateCommunicationDeliveryStatus(deliveryId, { ...updates, status: 'failed' })
}

export async function listCommunicationDeliveries({ organisationId = '', leadId = '', listingId = '', transactionId = '', offerId = '', appointmentId = '', status = '', channel = '', limit = 1000 } = {}) {
  const organisationUuid = nullableUuid(organisationId)
  if (!organisationUuid) return []
  const client = requireClient()
  let query = client
    .from('communication_deliveries')
    .select('*')
    .eq('organisation_id', organisationUuid)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 1000, 3000)))
  if (nullableUuid(leadId)) query = query.eq('lead_id', nullableUuid(leadId))
  if (nullableUuid(listingId)) query = query.eq('listing_id', nullableUuid(listingId))
  if (nullableUuid(transactionId)) query = query.eq('transaction_id', nullableUuid(transactionId))
  if (nullableUuid(offerId)) query = query.eq('offer_id', nullableUuid(offerId))
  if (nullableUuid(appointmentId)) query = query.eq('appointment_id', nullableUuid(appointmentId))
  if (status && status !== 'all') query = query.eq('status', normalizeStatus(status))
  if (channel && channel !== 'all') query = query.eq('channel', normalizeChannel(channel))
  const { data, error } = await query
  if (error) throw error
  return (Array.isArray(data) ? data : []).map(normalizeCommunicationDelivery)
}

export async function retryCommunicationDelivery({ deliveryId = '' } = {}, { actor = null } = {}) {
  const original = await getCommunicationDeliveryById(deliveryId)
  if (original.status !== 'failed') throw new Error('Only failed communication deliveries can be retried.')
  const consent = await validateCommunicationSend({
    organisationId: original.organisationId,
    leadId: original.leadId,
    channel: original.channel,
    communicationType: original.communicationType,
  }, { actor })
  if (!consent.ok) throw new Error(consent.message)
  return createCommunicationDelivery({
    organisationId: original.organisationId,
    leadId: original.leadId,
    listingId: original.listingId,
    transactionId: original.transactionId,
    offerId: original.offerId,
    appointmentId: original.appointmentId,
    portalSessionId: original.portalSessionId,
    sellerReviewSessionId: original.sellerReviewSessionId,
    branchId: original.branchId,
    communicationType: original.communicationType,
    channel: original.channel,
    recipient: original.recipient,
    recipientRole: original.recipientRole,
    subject: original.subject,
    messagePreview: original.messagePreview,
    provider: original.provider || 'internal',
    status: 'prepared',
    retryOfId: original.id,
    metadata: original.metadata,
    preparedBy: actorId(actor) || original.preparedBy,
  }, { actor, validateConsent: false })
}

export function getCommunicationPerformanceMetrics(deliveries = []) {
  const rows = (Array.isArray(deliveries) ? deliveries : []).map(normalizeCommunicationDelivery)
  const sent = rows.filter((row) => ['sent', 'delivered', 'failed'].includes(row.status)).length
  const delivered = rows.filter((row) => row.status === 'delivered').length
  const failed = rows.filter((row) => row.status === 'failed').length
  const rate = (top, bottom) => bottom > 0 ? Math.round((top / bottom) * 1000) / 10 : 0
  const summarizeGroup = (keyFn, labelKey) => {
    const groups = new Map()
    rows.forEach((row) => {
      const key = normalizeText(keyFn(row)) || 'Unassigned'
      if (!groups.has(key)) groups.set(key, { [labelKey]: key, sent: 0, delivered: 0, failed: 0, communications: 0 })
      const item = groups.get(key)
      item.communications += 1
      if (['sent', 'delivered', 'failed'].includes(row.status)) item.sent += 1
      if (row.status === 'delivered') item.delivered += 1
      if (row.status === 'failed') item.failed += 1
    })
    return [...groups.values()].map((item) => ({
      ...item,
      deliveryRate: rate(item.delivered, item.sent),
      failureRate: rate(item.failed, item.sent),
    })).sort((left, right) => right.communications - left.communications)
  }
  return {
    communicationsSent: sent,
    communicationsDelivered: delivered,
    communicationsFailed: failed,
    emailSends: rows.filter((row) => row.channel === 'email' && ['sent', 'delivered', 'failed'].includes(row.status)).length,
    whatsappSends: rows.filter((row) => row.channel === 'whatsapp' && ['sent', 'delivered', 'failed'].includes(row.status)).length,
    deliveryRate: rate(delivered, sent),
    failureRate: rate(failed, sent),
    agentBreakdown: summarizeGroup((row) => row.agentId, 'agent'),
    organisationBreakdown: summarizeGroup((row) => row.branchId || row.organisationId, 'branch'),
  }
}

export function getListingDeliveryStatistics(deliveries = []) {
  const rows = (Array.isArray(deliveries) ? deliveries : []).map(normalizeCommunicationDelivery)
  return {
    timesShared: rows.length,
    uniqueBuyers: new Set(rows.map((row) => row.leadId).filter(Boolean)).size,
    sent: rows.filter((row) => ['sent', 'delivered', 'failed'].includes(row.status)).length,
    delivered: rows.filter((row) => row.status === 'delivered').length,
    failed: rows.filter((row) => row.status === 'failed').length,
  }
}

export function buildCommunicationDeliveryTimeline(deliveries = []) {
  const labels = {
    prepared: 'Communication Prepared',
    queued: 'Communication Queued',
    sent: 'Communication Sent',
    delivered: 'Communication Delivered',
    failed: 'Communication Failed',
  }
  return (Array.isArray(deliveries) ? deliveries : []).map(normalizeCommunicationDelivery).map((delivery) => ({
    id: `delivery:${delivery.id || createLocalId()}`,
    kind: 'communication_delivery',
    communicationType: delivery.channel,
    direction: 'outbound',
    title: labels[delivery.status] || 'Communication Delivery Updated',
    subject: delivery.subject,
    summary: delivery.errorMessage || delivery.messagePreview,
    message: delivery.messagePreview,
    status: delivery.status,
    source: 'communication_delivery',
    agentId: delivery.sentBy || delivery.preparedBy,
    occurredAt: delivery.deliveredAt || delivery.sentAt || delivery.failedAt || delivery.preparedAt || delivery.createdAt || nowIso(),
    metadata: {
      deliveryId: delivery.id,
      provider: delivery.provider,
      providerMessageId: delivery.providerMessageId,
      listingId: delivery.listingId,
      recipient: delivery.recipient,
    },
    raw: delivery.raw || delivery,
  }))
}

export const __communicationDeliveryServiceTestUtils = {
  buildCommunicationDeliveryPayload,
  buildDefaultLeadCommunicationPreferences,
  buildNotificationModePreferencePatch,
  buildPreferenceDbPayload,
  getNotificationModeLabel,
  getCommunicationPerformanceMetrics,
  getListingDeliveryStatistics,
  normalizeChannel,
  normalizeCommunicationDelivery,
  normalizeFrequency,
  normalizeLeadCommunicationPreferences,
  normalizeNotificationMode,
  normalizeProvider,
  normalizeStatus,
  resolveNotificationDispatchPlan,
  assessNotificationRecipientSafety,
  resolveNotificationModeFromPreferences,
  validateCommunicationPreferences,
}
