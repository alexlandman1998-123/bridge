import { buildConveyancerMatterActionQueue } from '../../services/attorneyWorkflow/conveyancerMatterActionQueue.js'

export const CONVEYANCER_NOTIFICATION_VERSION = 'conveyancer_notification_p4_v1'
export const CONVEYANCER_NOTIFICATION_MODES = Object.freeze({
  disabled: 'disabled', observe: 'observe', pilot: 'pilot', live: 'live',
})
export const CONVEYANCER_NOTIFICATION_KINDS = Object.freeze({
  actionReady: 'action_ready', reviewRequired: 'review_required', blockerOpened: 'blocker_opened',
  dueSoon: 'due_soon', overdue: 'overdue', escalation: 'escalation',
})

const OWNER_MEMBER_ROLES = Object.freeze({
  conveyancer: ['transfer_attorney'], transfer_attorney: ['transfer_attorney'],
  secretary: ['conveyancing_secretary'], firm_manager: ['firm_admin', 'director_partner'],
  accounts: ['admin_staff', 'firm_admin', 'director_partner'], bond_attorney: ['bond_attorney'],
  cancellation_attorney: ['cancellation_attorney'],
})
const MANAGER_ROLES = new Set(['firm_admin', 'director_partner'])

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function addHours(value, hours) { const date = new Date(value); date.setTime(date.getTime() + (Number(hours) * 60 * 60 * 1000)); return date.toISOString() }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {}) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }

export function buildConveyancerNotificationControl(input = {}) {
  const control = {
    version: CONVEYANCER_NOTIFICATION_VERSION,
    organisationId: text(input.organisationId || input.organisation_id),
    attorneyFirmId: text(input.attorneyFirmId || input.attorney_firm_id),
    mode: key(input.mode) || CONVEYANCER_NOTIFICATION_MODES.disabled,
    channels: [...new Set((input.channels || ['in_app']).map(key).filter((channel) => channel === 'in_app'))].sort(),
    pilotTransactionIds: [...new Set((input.pilotTransactionIds || input.pilot_transaction_ids || []).map(text).filter(Boolean))].sort(),
    dueSoonHours: Math.max(1, Math.min(168, Number(input.dueSoonHours ?? input.due_soon_hours ?? 24))),
    escalationHours: Math.max(1, Math.min(336, Number(input.escalationHours ?? input.escalation_hours ?? 24))),
    killSwitchEnabled: (input.killSwitchEnabled ?? input.kill_switch_enabled) !== false,
    reason: text(input.reason),
  }
  control.fingerprint = fnv(control)
  return freeze(control)
}

export function evaluateConveyancerNotificationGate(control = {}, transactionId = '') {
  if (control.version !== CONVEYANCER_NOTIFICATION_VERSION || !control.organisationId || !control.attorneyFirmId) return freeze({ allowed: false, observeOnly: false, reason: 'notification_control_invalid' })
  if (control.killSwitchEnabled) return freeze({ allowed: false, observeOnly: false, reason: 'notification_kill_switch_enabled' })
  if (control.mode === CONVEYANCER_NOTIFICATION_MODES.disabled) return freeze({ allowed: false, observeOnly: false, reason: 'notifications_disabled' })
  if (!Object.values(CONVEYANCER_NOTIFICATION_MODES).includes(control.mode)) return freeze({ allowed: false, observeOnly: false, reason: 'notification_mode_invalid' })
  if (control.mode === CONVEYANCER_NOTIFICATION_MODES.pilot && !control.pilotTransactionIds.includes(text(transactionId))) return freeze({ allowed: false, observeOnly: false, reason: 'matter_outside_notification_pilot' })
  return freeze({ allowed: true, observeOnly: control.mode === CONVEYANCER_NOTIFICATION_MODES.observe, reason: control.mode === CONVEYANCER_NOTIFICATION_MODES.observe ? 'observe_only' : 'allowed' })
}

function recipientsFor(item, members, actor, managersOnly = false) {
  const expectedRoles = managersOnly ? null : OWNER_MEMBER_ROLES[key(item.owner?.role)] || []
  const selected = members.filter((member) => member.status === 'active' && (managersOnly ? MANAGER_ROLES.has(key(member.role)) : expectedRoles.includes(key(member.role))))
  if (!managersOnly && expectedRoles.length && !selected.length && text(actor.userId)) selected.push({ userId: text(actor.userId), role: key(actor.role) || 'transfer_attorney', status: 'active' })
  return [...new Map(selected.map((member) => [text(member.userId || member.user_id), { userId: text(member.userId || member.user_id), role: key(member.role) }])).values()].filter((member) => member.userId)
}

function copyFor(kindValue, item) {
  const label = text(item.label) || 'Matter action'
  if (kindValue === CONVEYANCER_NOTIFICATION_KINDS.reviewRequired) return { title: 'Legal review required', message: `${label} needs an authorised review before the matter can progress.` }
  if (kindValue === CONVEYANCER_NOTIFICATION_KINDS.blockerOpened) return { title: 'Matter action blocked', message: `${label} is blocked and needs attention.` }
  if (kindValue === CONVEYANCER_NOTIFICATION_KINDS.dueSoon) return { title: 'Matter action due soon', message: `${label} is approaching its due date.` }
  if (kindValue === CONVEYANCER_NOTIFICATION_KINDS.overdue) return { title: 'Matter action overdue', message: `${label} is overdue and remains incomplete.` }
  if (kindValue === CONVEYANCER_NOTIFICATION_KINDS.escalation) return { title: 'Matter escalation requires attention', message: `${label} remains overdue after the escalation window.` }
  return { title: 'Matter action ready', message: `${label} is ready to progress.` }
}

function intent({ kind: intentKind, item, recipient, channel, availableAt, plan, planRevision }) {
  const copy = copyFor(intentKind, item)
  const windowKey = availableAt.slice(0, 13)
  const dedupeKey = `p4:${text(plan.planId)}:${planRevision}:${item.actionKey}:${intentKind}:${channel}:${recipient.userId}:${windowKey}`
  const result = {
    kind: intentKind, channel, recipientUserId: recipient.userId, recipientRole: recipient.role,
    actionKey: item.actionKey, actionRevision: Number(item.runtimeRevision || 0), availableAt,
    title: copy.title, message: copy.message, dedupeKey,
    metadata: { bucket: item.bucket, dueAt: item.dueAt || null, planId: plan.planId, planVersion: plan.version },
  }
  result.fingerprint = fnv(result)
  return result
}

export function buildConveyancerNotificationIntents({ plan = {}, planRevision = 0, control: controlInput = {}, members = [], actor = {}, asOf = '' } = {}) {
  const control = buildConveyancerNotificationControl(controlInput)
  const gate = evaluateConveyancerNotificationGate(control, plan.transactionId)
  if (!gate.allowed) return freeze({ version: CONVEYANCER_NOTIFICATION_VERSION, ok: true, skipped: true, reason: gate.reason, control, intents: [], fingerprint: fnv([]) })
  const generatedAt = iso(asOf)
  if (!generatedAt || !plan.planId || !plan.transactionId) return freeze({ version: CONVEYANCER_NOTIFICATION_VERSION, ok: false, skipped: true, reason: 'notification_plan_identity_invalid', control, intents: [], fingerprint: fnv([]) })
  const queue = buildConveyancerMatterActionQueue({ plan, actor, asOf: generatedAt })
  if (!queue.valid) return freeze({ version: CONVEYANCER_NOTIFICATION_VERSION, ok: false, skipped: true, reason: 'notification_queue_invalid', errors: queue.blockers, control, intents: [], fingerprint: fnv([]) })
  const intents = []
  for (const item of queue.items) {
    if (!['do_now', 'review', 'blocked', 'waiting'].includes(item.bucket)) continue
    const recipients = recipientsFor(item, members, actor)
    const immediateKind = item.bucket === 'review' ? CONVEYANCER_NOTIFICATION_KINDS.reviewRequired : item.bucket === 'blocked' ? CONVEYANCER_NOTIFICATION_KINDS.blockerOpened : item.bucket === 'do_now' ? CONVEYANCER_NOTIFICATION_KINDS.actionReady : null
    for (const channel of control.channels) for (const recipient of recipients) {
      if (immediateKind) intents.push(intent({ kind: immediateKind, item, recipient, channel, availableAt: generatedAt, plan, planRevision }))
      if (item.dueAt) {
        const dueSoonAt = addHours(item.dueAt, -control.dueSoonHours)
        if (new Date(dueSoonAt) > new Date(generatedAt)) intents.push(intent({ kind: CONVEYANCER_NOTIFICATION_KINDS.dueSoon, item, recipient, channel, availableAt: dueSoonAt, plan, planRevision }))
        intents.push(intent({ kind: CONVEYANCER_NOTIFICATION_KINDS.overdue, item, recipient, channel, availableAt: item.dueAt, plan, planRevision }))
      }
    }
    if (item.dueAt) for (const manager of recipientsFor(item, members, actor, true)) for (const channel of control.channels) {
      intents.push(intent({ kind: CONVEYANCER_NOTIFICATION_KINDS.escalation, item, recipient: manager, channel, availableAt: addHours(item.dueAt, control.escalationHours), plan, planRevision }))
    }
  }
  const unique = [...new Map(intents.map((item) => [item.dedupeKey, item])).values()].sort((left, right) => left.availableAt.localeCompare(right.availableAt) || left.dedupeKey.localeCompare(right.dedupeKey)).slice(0, 50)
  return freeze({ version: CONVEYANCER_NOTIFICATION_VERSION, ok: true, skipped: gate.observeOnly, reason: gate.reason, control, intents: unique, fingerprint: fnv(unique) })
}

function missingP4(error) { return ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code) || /conveyancer_notification_(controls|outbox)|bridge_enqueue_conveyancer_notifications/i.test(error?.message || '') }

export async function loadConveyancerNotificationContext(client, { organisationId = '', attorneyFirmId = '' } = {}) {
  if (!client?.from) return freeze({ available: false, reason: 'query_client_unavailable', control: null, members: [] })
  try {
    const [controlResponse, memberResponse] = await Promise.all([
      client.from('conveyancer_notification_controls').select('*').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).order('revision', { ascending: false }).limit(1),
      client.from('attorney_firm_members').select('user_id, role, status').eq('firm_id', attorneyFirmId).eq('status', 'active'),
    ])
    if (controlResponse?.error) throw controlResponse.error
    if (memberResponse?.error) throw memberResponse.error
    const row = controlResponse?.data?.[0]
    if (!row) return freeze({ available: true, reason: 'notification_control_missing', control: buildConveyancerNotificationControl({ organisationId, attorneyFirmId, reason: 'No P4 control exists.' }), members: memberResponse?.data || [] })
    return freeze({
      available: true, reason: 'loaded',
      control: buildConveyancerNotificationControl(row),
      members: (memberResponse?.data || []).map((member) => ({ userId: member.user_id, role: member.role, status: member.status })),
    })
  } catch (error) {
    if (missingP4(error)) return freeze({ available: false, reason: 'p4_not_installed', control: null, members: [] })
    throw error
  }
}

export async function persistConveyancerNotificationIntents(client, { organisationId = '', attorneyFirmId = '', transactionId = '', planRecordId = '', planRevision = 0, projection = {}, generatedAt = '' } = {}) {
  if (!projection.ok || projection.skipped || !projection.intents.length) return freeze({ ok: projection.ok === true, skipped: true, reason: projection.reason || 'no_notification_intents', data: null })
  if (!client?.rpc) return freeze({ ok: true, skipped: true, reason: 'rpc_client_unavailable', data: null })
  const response = await client.rpc('bridge_enqueue_conveyancer_notifications', { payload: {
    version: CONVEYANCER_NOTIFICATION_VERSION, organisationId, attorneyFirmId, transactionId,
    planRecordId, planRevision, generatedAt, projectionFingerprint: projection.fingerprint, intents: projection.intents,
  } })
  if (response?.error) {
    if (missingP4(response.error)) return freeze({ ok: true, skipped: true, reason: 'p4_not_installed', data: null })
    throw response.error
  }
  return freeze({ ok: true, skipped: false, reason: 'queued', data: response?.data || null })
}

export async function persistConveyancerNotificationControl(client, controlInput = {}) {
  if (!client?.rpc) throw new Error('A Supabase-compatible RPC client is required.')
  const control = buildConveyancerNotificationControl(controlInput)
  const response = await client.rpc('bridge_set_conveyancer_notification_control', { payload: control })
  if (response?.error) throw response.error
  return freeze({ ok: true, control, data: response?.data || null })
}

export async function runConveyancerNotificationCycle(client, { plan = {}, planRecordId = '', planRevision = 0, organisationId = '', attorneyFirmId = '', transactionId = '', actor = {}, asOf = '' } = {}) {
  const context = await loadConveyancerNotificationContext(client, { organisationId, attorneyFirmId })
  if (!context.available) return freeze({ ok: true, skipped: true, reason: context.reason, projection: null, persistence: null })
  const projection = buildConveyancerNotificationIntents({ plan, planRevision, control: context.control, members: context.members, actor, asOf })
  const persistence = await persistConveyancerNotificationIntents(client, { organisationId, attorneyFirmId, transactionId, planRecordId, planRevision, projection, generatedAt: asOf })
  return freeze({ ok: projection.ok && persistence.ok, skipped: persistence.skipped, reason: persistence.reason, projection, persistence })
}

export async function loadConveyancerNotificationSummary(client, { organisationId = '', attorneyFirmId = '', transactionId = '' } = {}) {
  if (!client?.from) return freeze({ available: false, reason: 'query_client_unavailable', control: null, counts: {}, latest: null })
  try {
    const context = await loadConveyancerNotificationContext(client, { organisationId, attorneyFirmId })
    if (!context.available) return freeze({ available: false, reason: context.reason, control: null, counts: {}, latest: null })
    const response = await client.from('conveyancer_notification_outbox').select('id, status, notification_kind, available_at, delivered_at, created_at').eq('organisation_id', organisationId).eq('attorney_firm_id', attorneyFirmId).eq('transaction_id', transactionId).order('created_at', { ascending: false }).limit(100)
    if (response?.error) throw response.error
    const rows = response?.data || []
    const counts = rows.reduce((result, row) => { result[row.status] = (result[row.status] || 0) + 1; return result }, {})
    return freeze({ available: true, reason: 'loaded', control: context.control, counts, latest: rows[0] || null })
  } catch (error) {
    if (missingP4(error)) return freeze({ available: false, reason: 'p4_not_installed', control: null, counts: {}, latest: null })
    throw error
  }
}
