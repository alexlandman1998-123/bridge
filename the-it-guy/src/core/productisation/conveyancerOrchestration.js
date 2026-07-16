import { MATTER_PLAN_STATUSES } from '../transactions/conveyancerMatterPlanContract.js'
import { generateConveyancerMatterPlan } from '../../services/attorneyWorkflow/conveyancerMatterPlanGenerator.js'
import { previewConveyancerMatterPlanRerouting } from '../../services/attorneyWorkflow/conveyancerMatterPlanReroutingPreview.js'
import {
  MATTER_ACTION_COMMAND_TYPES,
  executeConveyancerMatterAction,
} from '../../services/attorneyWorkflow/conveyancerMatterActionExecution.js'
import { buildConveyancerMatterActionQueue } from '../../services/attorneyWorkflow/conveyancerMatterActionQueue.js'
import { buildConveyancerSharedProfessionalTimeline } from '../../services/attorneyWorkflow/conveyancerSharedProfessionalTimeline.js'
import { buildConveyancerSimultaneousLodgementReadiness } from '../../services/attorneyWorkflow/conveyancerSimultaneousLodgementReadiness.js'
import { runConveyancerNotificationCycle } from './conveyancerNotificationDelivery.js'

export const CONVEYANCER_ORCHESTRATION_VERSION = 'conveyancer_orchestration_p2_v1'

export const CONVEYANCER_ORCHESTRATION_MODES = Object.freeze({
  disabled: 'disabled', observe: 'observe', pilot: 'pilot', live: 'live',
})

export const CONVEYANCER_ORCHESTRATION_EVENT_TYPES = Object.freeze({
  instructionAccepted: 'matter_instruction_accepted',
  factsChanged: 'matter_facts_changed',
  rerouteApproved: 'matter_reroute_approved',
  actionCommandRequested: 'action_command_requested',
  externalEvidenceReceived: 'external_evidence_received',
  coordinationChanged: 'coordination_changed',
})

const EVENT_TYPES = new Set(Object.values(CONVEYANCER_ORCHESTRATION_EVENT_TYPES))

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {})
}
function clone(value) { return JSON.parse(JSON.stringify(value ?? null)) }
function fnv(value) {
  const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}
function fail(code, errors = [code]) { return freeze({ ok: false, code, decision: 'blocked', errors: [...new Set(errors)], commands: [], persistenceEnvelope: null }) }

export function buildConveyancerOrchestrationControl(input = {}) {
  const mode = key(input.mode) || CONVEYANCER_ORCHESTRATION_MODES.disabled
  const control = {
    version: CONVEYANCER_ORCHESTRATION_VERSION,
    organisationId: text(input.organisationId || input.organisation_id),
    attorneyFirmId: text(input.attorneyFirmId || input.attorney_firm_id),
    mode,
    allowedEventTypes: [...new Set((input.allowedEventTypes || []).map(key).filter((item) => EVENT_TYPES.has(item)))].sort(),
    pilotTransactionIds: [...new Set((input.pilotTransactionIds || []).map(text).filter(Boolean))].sort(),
    killSwitchEnabled: input.killSwitchEnabled !== false,
    reason: text(input.reason),
  }
  control.fingerprint = fnv(control)
  return freeze(control)
}

export function evaluateConveyancerOrchestrationGate(control = {}, event = {}) {
  const errors = []
  const type = key(event.type)
  const transactionId = text(event.transactionId || event.transaction_id)
  if (control.version !== CONVEYANCER_ORCHESTRATION_VERSION || !control.organisationId || !control.attorneyFirmId || !Object.values(CONVEYANCER_ORCHESTRATION_MODES).includes(control.mode)) errors.push('orchestration_control_invalid')
  if (control.killSwitchEnabled) return freeze({ allowed: false, observeOnly: false, reason: 'orchestration_kill_switch_enabled', errors })
  if (control.mode === CONVEYANCER_ORCHESTRATION_MODES.disabled) return freeze({ allowed: false, observeOnly: false, reason: 'orchestration_disabled', errors })
  if (control.allowedEventTypes?.length && !control.allowedEventTypes.includes(type)) return freeze({ allowed: false, observeOnly: false, reason: 'event_type_not_enabled', errors })
  if (control.mode === CONVEYANCER_ORCHESTRATION_MODES.pilot && !control.pilotTransactionIds?.includes(transactionId)) return freeze({ allowed: false, observeOnly: false, reason: 'matter_outside_pilot_cohort', errors })
  return freeze({ allowed: !errors.length, observeOnly: control.mode === CONVEYANCER_ORCHESTRATION_MODES.observe, reason: errors[0] || 'allowed', errors })
}

function normalizeEvent(input = {}) {
  return {
    eventId: text(input.eventId || input.event_id), type: key(input.type),
    organisationId: text(input.organisationId || input.organisation_id),
    attorneyFirmId: text(input.attorneyFirmId || input.attorney_firm_id),
    transactionId: text(input.transactionId || input.transaction_id),
    sourceReference: text(input.sourceReference || input.source_reference),
    occurredAt: iso(input.occurredAt || input.occurred_at),
    payload: input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? clone(input.payload) : {},
  }
}

function validateEvent(event, control) {
  const errors = []
  if (!event.eventId || !EVENT_TYPES.has(event.type) || !event.transactionId || !event.sourceReference || !event.occurredAt) errors.push('orchestration_event_identity_invalid')
  if (!event.organisationId || !event.attorneyFirmId || event.organisationId !== control.organisationId || event.attorneyFirmId !== control.attorneyFirmId) errors.push('orchestration_event_tenant_binding_invalid')
  return errors
}

function planCommand(plan, state = {}, sourcePhase = 'A2') {
  return {
    kind: 'matter_plan_revision',
    recordId: text(state.planRecordId) || null,
    revision: Number(state.planRecordRevision || 0) + 1,
    status: plan.status,
    planType: 'transfer',
    sourcePhase,
    contractVersion: plan.contractVersion,
    fingerprint: fnv(plan),
    classification: 'privileged',
    retentionPolicy: 'legal_matter_record',
    legalHold: false,
    payload: plan,
  }
}

const ACTION_EVENT_TYPES = Object.freeze({
  [MATTER_ACTION_COMMAND_TYPES.start]: 'started',
  [MATTER_ACTION_COMMAND_TYPES.markWaiting]: 'waiting',
  [MATTER_ACTION_COMMAND_TYPES.resume]: 'resumed',
  [MATTER_ACTION_COMMAND_TYPES.markBlocked]: 'blocked',
  [MATTER_ACTION_COMMAND_TYPES.submitReview]: 'submitted_for_review',
  [MATTER_ACTION_COMMAND_TYPES.complete]: 'completed',
  [MATTER_ACTION_COMMAND_TYPES.reopen]: 'reopened',
  [MATTER_ACTION_COMMAND_TYPES.cancel]: 'cancelled',
  [MATTER_ACTION_COMMAND_TYPES.recordEvidence]: 'evidence_recorded',
  [MATTER_ACTION_COMMAND_TYPES.assign]: 'reassigned',
})

function actionEventCommand(execution, state = {}) {
  return {
    kind: 'action_event', matterPlanId: text(state.currentPlanDatabaseId),
    actionId: execution.event.actionKey, eventType: ACTION_EVENT_TYPES[execution.event.commandType],
    idempotencyKey: execution.event.commandId, sourcePhase: 'A5',
    contractVersion: execution.event.version, fingerprint: fnv(execution.event),
    classification: 'privileged', retentionPolicy: 'legal_matter_record', legalHold: false,
    payload: execution.event,
  }
}

function persistenceEnvelope(event, commands, output) {
  return {
    version: CONVEYANCER_ORCHESTRATION_VERSION,
    organisationId: event.organisationId, attorneyFirmId: event.attorneyFirmId,
    transactionId: event.transactionId, eventId: event.eventId, eventType: event.type,
    sourceReference: event.sourceReference, occurredAt: event.occurredAt,
    inputFingerprint: fnv(event), outputFingerprint: fnv(output), commands,
  }
}

export function orchestrateConveyancerMatterEvent({ event: eventInput = {}, control: controlInput = {}, state = {}, actor = {} } = {}) {
  const control = buildConveyancerOrchestrationControl(controlInput)
  const event = normalizeEvent(eventInput)
  const eventErrors = validateEvent(event, control)
  if (eventErrors.length) return fail('orchestration_event_invalid', eventErrors)
  const gate = evaluateConveyancerOrchestrationGate(control, event)
  if (!gate.allowed) return freeze({ ok: true, code: gate.reason, decision: 'ignored', errors: gate.errors, event, commands: [], preview: null, persistenceEnvelope: null })

  let code = 'orchestration_event_processed'; let decision = gate.observeOnly ? 'observed' : 'committed'
  let preview = null; let commands = []; let nextPlan = state.currentPlan ? clone(state.currentPlan) : null

  if (event.type === CONVEYANCER_ORCHESTRATION_EVENT_TYPES.instructionAccepted) {
    const transaction = { ...event.payload.transaction, id: event.transactionId, organisation_id: event.organisationId }
    const generated = generateConveyancerMatterPlan({ transaction, organisationId: event.organisationId, generatedAt: event.occurredAt })
    if (!generated.valid) return fail('matter_plan_generation_failed', generated.errors)
    nextPlan = { ...clone(generated.plan), status: MATTER_PLAN_STATUSES.active, activatedAt: event.occurredAt }
    preview = { plan: nextPlan, warnings: generated.warnings, trace: generated.trace }
    commands = [planCommand(nextPlan, state, 'A2')]
  } else if (event.type === CONVEYANCER_ORCHESTRATION_EVENT_TYPES.factsChanged) {
    if (!state.currentPlan) return fail('current_plan_required')
    preview = previewConveyancerMatterPlanRerouting({ currentPlan: state.currentPlan, proposedTransaction: { ...event.payload.transaction, id: event.transactionId, organisation_id: event.organisationId }, actorRole: actor.role, changeReason: text(event.payload.changeReason), generatedAt: event.occurredAt, organisationId: event.organisationId })
    code = 'rerouting_review_required'; decision = 'requires_review'; commands = []
  } else if (event.type === CONVEYANCER_ORCHESTRATION_EVENT_TYPES.rerouteApproved) {
    if (!state.currentPlan) return fail('current_plan_required')
    preview = previewConveyancerMatterPlanRerouting({ currentPlan: state.currentPlan, proposedTransaction: { ...event.payload.transaction, id: event.transactionId, organisation_id: event.organisationId }, actorRole: actor.role, changeReason: text(event.payload.changeReason), generatedAt: event.occurredAt, organisationId: event.organisationId, acknowledgedImpactKeys: event.payload.acknowledgedImpactKeys || [] })
    if (!preview.canApply) return fail('rerouting_not_approved', preview.blockers)
    nextPlan = { ...clone(preview.candidatePlan), status: MATTER_PLAN_STATUSES.active, activatedAt: event.occurredAt }
    commands = [planCommand(nextPlan, state, 'A3')]
  } else if (event.type === CONVEYANCER_ORCHESTRATION_EVENT_TYPES.actionCommandRequested) {
    if (!state.currentPlan || !state.currentPlanDatabaseId || !state.planRecordId) return fail('persisted_current_plan_required')
    const requestedCommand = event.payload.command || {}
    const currentAction = (state.currentPlan.actions || []).find((item) => item.key === text(requestedCommand.actionKey))
    const boundCommand = {
      ...requestedCommand,
      expectedPlanId: requestedCommand.expectedPlanId || state.currentPlan.planId,
      expectedPlanVersion: requestedCommand.expectedPlanVersion ?? state.currentPlan.version,
      expectedActionRevision: requestedCommand.expectedActionRevision ?? Number(currentAction?.runtimeRevision || 0),
    }
    const execution = executeConveyancerMatterAction({ plan: state.currentPlan, command: boundCommand, actor, occurredAt: event.occurredAt, existingEvents: state.actionEvents || [], events: state.events || {}, externalDependencies: state.externalDependencies || {} })
    if (!execution.ok) return fail(execution.code, execution.errors || [execution.code])
    nextPlan = execution.plan
    preview = { actionEvent: execution.event, duplicate: execution.duplicate }
    commands = execution.duplicate ? [] : [planCommand(nextPlan, state, 'A5'), actionEventCommand(execution, state)]
    decision = execution.duplicate ? 'duplicate' : decision
  } else {
    code = event.type === CONVEYANCER_ORCHESTRATION_EVENT_TYPES.externalEvidenceReceived ? 'external_evidence_review_required' : 'projection_rebuild_required'
    decision = 'requires_review'; preview = { payloadReference: event.payload.payloadReference || null }; commands = []
  }

  const effectiveCommands = gate.observeOnly ? [] : commands
  const output = { code, decision, nextPlan, preview, commandFingerprints: effectiveCommands.map((command) => command.fingerprint) }
  return freeze({ ok: true, code, decision, errors: [], event, nextPlan, preview, commands: effectiveCommands, persistenceEnvelope: gate.observeOnly || decision === 'duplicate' ? null : persistenceEnvelope(event, effectiveCommands, output) })
}

export function buildConveyancerOperationalProjections({ plan = {}, actor = {}, asOf = '', queue = {}, timeline = null, lodgement = null } = {}) {
  const actionQueue = buildConveyancerMatterActionQueue({ plan, actor, asOf, ...queue })
  const professionalTimeline = timeline ? buildConveyancerSharedProfessionalTimeline({ ...timeline, asOf }) : null
  const lodgementReadiness = lodgement ? buildConveyancerSimultaneousLodgementReadiness({ ...lodgement, asOf }) : null
  const errors = [
    ...(!actionQueue.valid ? actionQueue.blockers : []),
    ...(professionalTimeline && !professionalTimeline.ok ? professionalTimeline.errors : []),
    ...(lodgementReadiness && !lodgementReadiness.ok ? lodgementReadiness.errors : []),
  ]
  return freeze({ version: CONVEYANCER_ORCHESTRATION_VERSION, ok: errors.length === 0, errors: [...new Set(errors)], actionQueue, professionalTimeline, lodgementReadiness, fingerprint: fnv({ actionQueue, professionalTimeline, lodgementReadiness }) })
}

export async function persistConveyancerOrchestrationResult(client, result = {}) {
  if (!result?.ok || !result.persistenceEnvelope) return freeze({ ok: result?.ok === true, skipped: true, reason: result?.code || 'no_persistence_envelope', data: null })
  if (!client?.rpc) throw new Error('A Supabase-compatible RPC client is required.')
  const response = await client.rpc('bridge_apply_conveyancer_orchestration_batch', { payload: result.persistenceEnvelope })
  if (response?.error) throw response.error
  return freeze({ ok: true, skipped: false, reason: response?.data?.duplicate ? 'idempotent_replay' : 'committed', data: response?.data || null })
}

export async function persistConveyancerOrchestrationControl(client, controlInput = {}) {
  if (!client?.rpc) throw new Error('A Supabase-compatible RPC client is required.')
  const control = buildConveyancerOrchestrationControl(controlInput)
  const response = await client.rpc('bridge_set_conveyancer_orchestration_control', { payload: control })
  if (response?.error) throw response.error
  return freeze({ ok: true, control, data: response?.data || null })
}

async function latestRow(client, table, filters = [], orderColumn = 'created_at') {
  let query = client.from(table).select('*')
  for (const [column, value] of filters) query = query.eq(column, value)
  const response = await query.order(orderColumn, { ascending: false }).limit(1)
  if (response?.error) throw response.error
  return Array.isArray(response?.data) ? response.data[0] || null : response?.data || null
}

export async function loadConveyancerOrchestrationContext(client, { organisationId = '', attorneyFirmId = '', transactionId = '' } = {}) {
  if (!client?.from) throw new Error('A Supabase-compatible query client is required.')
  const binding = { organisationId: text(organisationId), attorneyFirmId: text(attorneyFirmId), transactionId: text(transactionId) }
  if (!binding.organisationId || !binding.attorneyFirmId || !binding.transactionId) throw new Error('Organisation, firm and transaction ids are required.')
  const filters = [['organisation_id', binding.organisationId], ['attorney_firm_id', binding.attorneyFirmId]]
  const [controlRow, planRow, receiptResponse] = await Promise.all([
    latestRow(client, 'conveyancer_orchestration_controls', filters, 'revision'),
    latestRow(client, 'conveyancer_matter_plans', [...filters, ['transaction_id', binding.transactionId]], 'created_at'),
    client.from('conveyancer_orchestration_receipts').select('*').eq('organisation_id', binding.organisationId).eq('attorney_firm_id', binding.attorneyFirmId).eq('transaction_id', binding.transactionId).order('occurred_at', { ascending: false }).limit(20),
  ])
  if (receiptResponse?.error) throw receiptResponse.error
  const actionResponse = await client.from('conveyancer_action_events').select('*').eq('organisation_id', binding.organisationId).eq('attorney_firm_id', binding.attorneyFirmId).eq('transaction_id', binding.transactionId).order('occurred_at', { ascending: true })
  if (actionResponse?.error) throw actionResponse.error
  const control = controlRow ? buildConveyancerOrchestrationControl({
    organisationId: controlRow.organisation_id, attorneyFirmId: controlRow.attorney_firm_id,
    mode: controlRow.mode, allowedEventTypes: controlRow.allowed_event_types,
    pilotTransactionIds: controlRow.pilot_transaction_ids,
    killSwitchEnabled: controlRow.kill_switch_enabled, reason: controlRow.reason,
  }) : buildConveyancerOrchestrationControl({ ...binding, mode: 'disabled', killSwitchEnabled: true, reason: 'No P2 control exists.' })
  return freeze({
    control,
    state: {
      currentPlan: planRow?.payload || null,
      currentPlanDatabaseId: planRow?.id || null,
      planRecordId: planRow?.record_id || null,
      planRecordRevision: Number(planRow?.revision || 0),
      actionEvents: (actionResponse?.data || []).map((row) => row.payload || row),
      orchestrationReceipts: receiptResponse?.data || [],
    },
  })
}

export async function runConveyancerMatterEvent(client, { event = {}, actor = {}, context = null } = {}) {
  const normalized = normalizeEvent(event)
  const resolvedContext = context || await loadConveyancerOrchestrationContext(client, {
    organisationId: normalized.organisationId,
    attorneyFirmId: normalized.attorneyFirmId,
    transactionId: normalized.transactionId,
  })
  const result = orchestrateConveyancerMatterEvent({ event: normalized, actor, control: resolvedContext.control, state: resolvedContext.state })
  const persistence = await persistConveyancerOrchestrationResult(client, result)
  let notifications = freeze({ ok: true, skipped: true, reason: 'orchestration_not_committed' })
  if (result.ok && persistence.ok && !persistence.skipped && result.nextPlan) {
    const planWrite = (persistence.data?.commandResults || []).find((command) => command.kind === 'matter_plan_revision') || {}
    try {
      notifications = await runConveyancerNotificationCycle(client, {
        plan: result.nextPlan,
        planRecordId: planWrite.recordId || resolvedContext.state.planRecordId || '',
        planRevision: Number(planWrite.revision || resolvedContext.state.planRecordRevision || 0),
        organisationId: normalized.organisationId,
        attorneyFirmId: normalized.attorneyFirmId,
        transactionId: normalized.transactionId,
        actor,
        asOf: normalized.occurredAt,
      })
    } catch (error) {
      notifications = freeze({ ok: true, skipped: true, reason: 'notification_delivery_unavailable', error: text(error?.message) })
    }
  }
  return freeze({ ok: result.ok && persistence.ok, result, persistence, notifications })
}
