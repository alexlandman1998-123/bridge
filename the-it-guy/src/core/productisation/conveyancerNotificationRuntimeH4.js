import {
  CONVEYANCER_APPLICATION_H2_EVENT_TYPES,
  loadConveyancerApplicationContext,
  runConveyancerApplicationEvent,
} from './conveyancerApplicationOrchestratorH2.js'
import {
  CONVEYANCER_NOTIFICATION_KINDS,
  evaluateConveyancerNotificationGate,
  loadConveyancerNotificationContext,
} from './conveyancerNotificationDelivery.js'

export const CONVEYANCER_NOTIFICATION_H4_VERSION = 'conveyancer_notification_runtime_h4_v1'

export const CONVEYANCER_NOTIFICATION_H4_CONTROLS = Object.freeze({
  actionReminderBoundary: 'P4_durable_notification_outbox',
  runtimeSignalBoundary: 'bridge_enqueue_conveyancer_notification_signal',
  deliveryBoundary: 'bridge_dispatch_conveyancer_notifications',
  channels: Object.freeze(['in_app']),
  directOutboxWritesAllowed: false,
  legalTruthMutationAllowed: false,
  externalMessagingRequired: false,
  manualFallbackRequired: true,
  sourceReceiptRequired: true,
  recipientFirmMembershipRechecked: true,
  dispatchControlsRechecked: true,
})

const EVENT_POLICIES = Object.freeze({
  [CONVEYANCER_APPLICATION_H2_EVENT_TYPES.exceptionObserved]: Object.freeze({ signalType: 'exception_attention', kind: CONVEYANCER_NOTIFICATION_KINDS.blockerOpened, roles: Object.freeze(['firm_admin', 'director_partner', 'transfer_attorney']) }),
  [CONVEYANCER_APPLICATION_H2_EVENT_TYPES.coordinationRecorded]: Object.freeze({ signalType: 'coordination_attention', kind: CONVEYANCER_NOTIFICATION_KINDS.blockerOpened, roles: Object.freeze(['firm_admin', 'director_partner', 'transfer_attorney']) }),
  [CONVEYANCER_APPLICATION_H2_EVENT_TYPES.evidenceCaptured]: Object.freeze({ signalType: 'evidence_review', kind: CONVEYANCER_NOTIFICATION_KINDS.reviewRequired, roles: Object.freeze(['transfer_attorney', 'conveyancing_secretary']) }),
  [CONVEYANCER_APPLICATION_H2_EVENT_TYPES.financialSnapshotRecorded]: Object.freeze({ signalType: 'financial_reconciliation', kind: CONVEYANCER_NOTIFICATION_KINDS.reviewRequired, roles: Object.freeze(['admin_staff', 'firm_admin', 'director_partner']) }),
  [CONVEYANCER_APPLICATION_H2_EVENT_TYPES.closeoutAssessed]: Object.freeze({ signalType: 'closeout_review', kind: CONVEYANCER_NOTIFICATION_KINDS.reviewRequired, roles: Object.freeze(['firm_admin', 'director_partner', 'transfer_attorney']) }),
})

const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
const freeze = (value) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, item) => { result[item] = stable(value[item]); return result }, {}) }
function fingerprint(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }

function normalizeEvent(input = {}) {
  const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {}
  return {
    eventId: text(input.eventId || input.event_id),
    type: key(input.type),
    organisationId: text(input.organisationId || input.organisation_id),
    attorneyFirmId: text(input.attorneyFirmId || input.attorney_firm_id),
    transactionId: text(input.transactionId || input.transaction_id),
    occurredAt: iso(input.occurredAt || input.occurred_at),
    notificationState: key(input.notificationState || payload.coordination?.status || payload.financialModel?.status || payload.financial_model?.status),
  }
}

function eventNeedsAttention(event) {
  if (event.type === CONVEYANCER_APPLICATION_H2_EVENT_TYPES.coordinationRecorded) return ['blocked', 'action_required'].includes(event.notificationState)
  if (event.type === CONVEYANCER_APPLICATION_H2_EVENT_TYPES.financialSnapshotRecorded) return ['under_review', 'reconciliation_required'].includes(event.notificationState)
  return true
}

export function buildConveyancerRuntimeNotificationSignals({ event: inputEvent = {}, notificationContext = {}, actor = {} } = {}) {
  const event = normalizeEvent(inputEvent)
  const policy = EVENT_POLICIES[event.type]
  if (!policy) return freeze({ version: CONVEYANCER_NOTIFICATION_H4_VERSION, ok: true, skipped: true, reason: 'event_has_no_runtime_notification_policy', event, signals: [], fingerprint: fingerprint([]) })
  if (!eventNeedsAttention(event)) return freeze({ version: CONVEYANCER_NOTIFICATION_H4_VERSION, ok: true, skipped: true, reason: 'runtime_event_does_not_need_attention', event, signals: [], fingerprint: fingerprint([]) })
  const control = notificationContext.control || {}
  const gate = evaluateConveyancerNotificationGate(control, event.transactionId)
  if (!gate.allowed || gate.observeOnly) return freeze({ version: CONVEYANCER_NOTIFICATION_H4_VERSION, ok: true, skipped: true, reason: gate.reason, event, signals: [], fingerprint: fingerprint([]) })
  if (!event.eventId || !event.organisationId || !event.attorneyFirmId || !event.transactionId || !event.occurredAt) return freeze({ version: CONVEYANCER_NOTIFICATION_H4_VERSION, ok: false, skipped: true, reason: 'runtime_notification_event_identity_invalid', event, signals: [], fingerprint: fingerprint([]) })
  const members = (notificationContext.members || []).filter((member) => member.status === 'active' && policy.roles.includes(key(member.role)))
  const uniqueMembers = [...new Map(members.map((member) => [text(member.userId || member.user_id), { userId: text(member.userId || member.user_id), role: key(member.role) }])).values()].filter((member) => member.userId)
  const actorUserId = text(actor.userId || actor.user_id)
  if (!uniqueMembers.length && actorUserId && (notificationContext.members || []).some((member) => text(member.userId || member.user_id) === actorUserId && member.status === 'active')) uniqueMembers.push({ userId: actorUserId, role: key(actor.role) })
  const signals = uniqueMembers.slice(0, 20).map((recipient) => {
    const signal = {
      signalType: policy.signalType,
      notificationKind: policy.kind,
      eventId: event.eventId,
      eventType: event.type,
      recipientUserId: recipient.userId,
      recipientRole: recipient.role,
      availableAt: event.occurredAt,
      dedupeKey: `h4:${event.attorneyFirmId}:${event.eventId}:${policy.signalType}:${recipient.userId}`,
      metadata: { source: 'conveyancer_h4', eventType: event.type, signalType: policy.signalType, legalTruth: false, humanReviewRequired: true },
    }
    signal.fingerprint = fingerprint(signal)
    return signal
  })
  return freeze({
    version: CONVEYANCER_NOTIFICATION_H4_VERSION,
    ok: true,
    skipped: signals.length === 0,
    reason: signals.length ? 'ready' : 'no_eligible_current_firm_recipients',
    event,
    signals,
    fingerprint: fingerprint(signals),
  })
}

export async function persistConveyancerRuntimeNotificationSignals(client, projection = {}) {
  if (!projection?.ok || projection.skipped || !projection.signals?.length) return freeze({ ok: projection?.ok === true, skipped: true, reason: projection?.reason || 'no_runtime_notification_signals', data: null })
  if (!client?.rpc) return freeze({ ok: true, skipped: true, reason: 'rpc_client_unavailable', data: null })
  const response = await client.rpc('bridge_enqueue_conveyancer_notification_signal', { payload: {
    version: CONVEYANCER_NOTIFICATION_H4_VERSION,
    organisationId: projection.event.organisationId,
    attorneyFirmId: projection.event.attorneyFirmId,
    transactionId: projection.event.transactionId,
    eventId: projection.event.eventId,
    eventType: projection.event.type,
    projectionFingerprint: projection.fingerprint,
    signals: projection.signals,
  } })
  if (response?.error) {
    if (['42P01', 'PGRST202', 'PGRST205'].includes(response.error.code) || /bridge_enqueue_conveyancer_notification_signal/i.test(response.error.message || '')) return freeze({ ok: true, skipped: true, reason: 'h4_runtime_not_installed', data: null })
    throw response.error
  }
  return freeze({ ok: true, skipped: false, reason: response?.data?.queued ? 'queued' : 'idempotent_replay', data: response?.data || null })
}

export async function runConveyancerRuntimeNotificationCycle(client, { event = {}, actor = {} } = {}) {
  const normalized = normalizeEvent(event)
  const notificationContext = await loadConveyancerNotificationContext(client, { organisationId: normalized.organisationId, attorneyFirmId: normalized.attorneyFirmId })
  if (!notificationContext.available) return freeze({ ok: true, skipped: true, reason: notificationContext.reason, projection: null, persistence: null })
  const projection = buildConveyancerRuntimeNotificationSignals({ event: normalized, notificationContext, actor })
  const persistence = await persistConveyancerRuntimeNotificationSignals(client, projection)
  return freeze({ ok: projection.ok && persistence.ok, skipped: persistence.skipped, reason: persistence.reason, projection, persistence })
}

export async function runConveyancerApplicationEventH4(client, { event = {}, actor = {}, context = null } = {}) {
  const normalized = normalizeEvent(event)
  const resolved = context || await loadConveyancerApplicationContext(client, { organisationId: normalized.organisationId, attorneyFirmId: normalized.attorneyFirmId, transactionId: normalized.transactionId })
  const outcome = await runConveyancerApplicationEvent(client, { event, actor, context: resolved })
  if (!outcome.ok || outcome.application?.route === 'p2') return outcome
  if (outcome.persistence?.skipped) return freeze({ ...outcome, notifications: { ok: true, skipped: true, reason: outcome.persistence.reason || 'application_not_committed' } })
  try {
    const notifications = await runConveyancerRuntimeNotificationCycle(client, { event: normalized, actor })
    return freeze({ ...outcome, notifications })
  } catch (error) {
    return freeze({ ...outcome, notifications: { ok: true, skipped: true, reason: 'notification_delivery_unavailable', error: text(error?.message) } })
  }
}
