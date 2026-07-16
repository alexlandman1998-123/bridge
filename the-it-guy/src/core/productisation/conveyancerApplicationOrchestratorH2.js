import {
  CONVEYANCER_ORCHESTRATION_EVENT_TYPES,
  buildConveyancerOperationalProjections,
  loadConveyancerOrchestrationContext,
  runConveyancerMatterEvent,
} from './conveyancerOrchestration.js'
import { activateConveyancerMatterExceptions } from '../../services/attorneyWorkflow/conveyancerMatterExceptionActivation.js'
import { validateConveyancerCoordination } from '../transactions/conveyancerCoordinationContract.js'

export const CONVEYANCER_APPLICATION_H2_VERSION = 'conveyancer_application_orchestrator_h2_v1'

export const CONVEYANCER_APPLICATION_H2_EVENT_TYPES = Object.freeze({
  ...CONVEYANCER_ORCHESTRATION_EVENT_TYPES,
  exceptionObserved: 'matter_exception_observed',
  coordinationRecorded: 'matter_coordination_recorded',
  evidenceCaptured: 'matter_evidence_captured',
  financialSnapshotRecorded: 'matter_financial_snapshot_recorded',
  closeoutAssessed: 'matter_closeout_assessed',
})

export const CONVEYANCER_APPLICATION_H2_CONTROLS = Object.freeze({
  planAndActionBoundary: 'bridge_apply_conveyancer_orchestration_batch',
  runtimeRecordBoundary: 'bridge_apply_conveyancer_application_batch',
  documentAndSigningBoundary: 'P5_document_pipeline',
  queuesPersisted: false,
  timelinesPersisted: false,
  readinessPersisted: false,
  directTableWritesAllowed: false,
  externalProvidersRequired: false,
  manualEvidencePathRequired: true,
  providerEvidenceCreatesLegalTruth: false,
  humanReviewRequiredForExternalEvidence: true,
})

const P2_TYPES = new Set(Object.values(CONVEYANCER_ORCHESTRATION_EVENT_TYPES))
const H2_TYPES = new Set(Object.values(CONVEYANCER_APPLICATION_H2_EVENT_TYPES))
const H2_CONTROL_EVENT_FALLBACKS = Object.freeze({
  [CONVEYANCER_APPLICATION_H2_EVENT_TYPES.exceptionObserved]: CONVEYANCER_ORCHESTRATION_EVENT_TYPES.externalEvidenceReceived,
  [CONVEYANCER_APPLICATION_H2_EVENT_TYPES.coordinationRecorded]: CONVEYANCER_ORCHESTRATION_EVENT_TYPES.coordinationChanged,
  [CONVEYANCER_APPLICATION_H2_EVENT_TYPES.evidenceCaptured]: CONVEYANCER_ORCHESTRATION_EVENT_TYPES.externalEvidenceReceived,
  [CONVEYANCER_APPLICATION_H2_EVENT_TYPES.financialSnapshotRecorded]: CONVEYANCER_ORCHESTRATION_EVENT_TYPES.actionCommandRequested,
  [CONVEYANCER_APPLICATION_H2_EVENT_TYPES.closeoutAssessed]: CONVEYANCER_ORCHESTRATION_EVENT_TYPES.actionCommandRequested,
})
const HASH = /^(sha256:)?[a-f0-9]{64}$/i
const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
const clone = (value) => JSON.parse(JSON.stringify(value ?? null))
const freeze = (value) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, item) => { result[item] = stable(value[item]); return result }, {}) }
function fingerprint(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }

function normalizeEvent(input = {}) {
  return {
    eventId: text(input.eventId || input.event_id),
    type: key(input.type),
    organisationId: text(input.organisationId || input.organisation_id),
    attorneyFirmId: text(input.attorneyFirmId || input.attorney_firm_id),
    transactionId: text(input.transactionId || input.transaction_id),
    sourceReference: text(input.sourceReference || input.source_reference),
    occurredAt: iso(input.occurredAt || input.occurred_at),
    payload: input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? clone(input.payload) : {},
  }
}

function eventErrors(event, context) {
  const errors = []
  if (!event.eventId || !H2_TYPES.has(event.type) || !event.organisationId || !event.attorneyFirmId || !event.transactionId || !event.sourceReference || !event.occurredAt) errors.push('application_event_identity_invalid')
  const control = context?.control || {}
  if (control.organisationId !== event.organisationId || control.attorneyFirmId !== event.attorneyFirmId) errors.push('application_event_tenant_binding_invalid')
  if (control.killSwitchEnabled) errors.push('application_kill_switch_enabled')
  if (!['observe', 'pilot', 'live'].includes(control.mode)) errors.push('application_runtime_disabled')
  if (control.mode === 'pilot' && !control.pilotTransactionIds?.includes(event.transactionId)) errors.push('application_matter_outside_pilot')
  const controlEventType = H2_CONTROL_EVENT_FALLBACKS[event.type]
  if (control.allowedEventTypes?.length && !control.allowedEventTypes.includes(event.type) && !control.allowedEventTypes.includes(controlEventType)) errors.push('application_event_type_disabled')
  return errors
}

function commonCommand(event, payload, sourcePhase, contractVersion) {
  return {
    sourcePhase,
    contractVersion: text(contractVersion) || CONVEYANCER_APPLICATION_H2_VERSION,
    classification: 'privileged',
    retentionPolicy: 'legal_matter_record',
    legalHold: false,
    fingerprint: fingerprint(payload),
    payload,
    occurredAt: event.occurredAt,
  }
}

function exceptionStatus(status) {
  if (status === 'open') return 'open'
  if (['pending_review', 'investigating'].includes(status)) return 'under_review'
  if (['resolved', 'waived', 'cancelled'].includes(status)) return 'resolved'
  if (status === 'superseded') return 'superseded'
  return 'action_required'
}

function exceptionSeverity(severity) {
  const normalized = key(severity)
  if (['information', 'low', 'medium', 'high', 'critical'].includes(normalized)) return normalized
  if (normalized === 'info') return 'information'
  if (['urgent', 'blocking'].includes(normalized)) return 'high'
  return 'medium'
}

function coordinationStatus(status) {
  if (status === 'draft') return 'draft'
  if (['requested', 'acknowledged', 'in_progress', 'submitted'].includes(status)) return 'active'
  if (status === 'blocked') return 'action_required'
  if (status === 'accepted') return 'ready_for_lodgement'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'superseded') return 'superseded'
  return 'waiting_external'
}

function evidenceCommand(event, input = {}, overrides = {}) {
  const sourceSystem = key(input.sourceSystem || input.source_system) || 'manual'
  const contentHash = text(input.contentHash || input.content_hash)
  const errors = []
  if (!text(input.evidenceType || input.evidence_type) || !HASH.test(contentHash) || !iso(input.observedAt || input.observed_at || event.occurredAt)) errors.push('evidence_contract_invalid')
  if (!['manual', 'integration'].includes(sourceSystem)) errors.push('evidence_source_invalid')
  if (sourceSystem === 'integration' && (!text(input.providerEventReference) || input.signatureVerified !== true)) errors.push('provider_evidence_provenance_invalid')
  if (sourceSystem === 'manual' && !text(input.captureReference || event.sourceReference)) errors.push('manual_evidence_reference_required')
  if (errors.length) return { errors, command: null }
  const payload = { ...clone(input), sourceSystem, capturedVia: sourceSystem, legalTruth: false, humanReviewRequired: true }
  return {
    errors: [],
    command: {
      kind: 'evidence_revision',
      recordId: text(input.recordId) || null,
      revision: Math.max(1, Number(input.revision || 1)),
      evidenceType: text(input.evidenceType || input.evidence_type),
      evidenceStatus: overrides.status || (sourceSystem === 'integration' ? 'under_review' : key(input.evidenceStatus || input.evidence_status) || 'captured'),
      sourceSystem,
      objectBucket: text(input.objectBucket || input.object_bucket) || null,
      objectPath: text(input.objectPath || input.object_path) || null,
      contentHash,
      observedAt: iso(input.observedAt || input.observed_at || event.occurredAt),
      expiresAt: iso(input.expiresAt || input.expires_at),
      ...commonCommand(event, payload, overrides.sourcePhase || 'G3', text(input.contractVersion)),
    },
  }
}

export function orchestrateConveyancerApplicationEvent({ event: inputEvent = {}, context = {}, actor = {} } = {}) {
  const event = normalizeEvent(inputEvent)
  const errors = eventErrors(event, context)
  if (errors.length) return freeze({ ok: false, decision: 'blocked', errors, event, route: null, commands: [], persistenceEnvelope: null })
  if (P2_TYPES.has(event.type)) return freeze({ ok: true, decision: context.control.mode === 'observe' ? 'observed' : 'delegated', errors: [], event, route: 'p2', commands: [], persistenceEnvelope: null })
  if (!text(actor.userId || actor.user_id)) return freeze({ ok: false, decision: 'blocked', errors: ['application_actor_identity_invalid'], event, route: 'runtime', commands: [], persistenceEnvelope: null })

  let commands = []
  if (event.type === CONVEYANCER_APPLICATION_H2_EVENT_TYPES.exceptionObserved) {
    const activation = activateConveyancerMatterExceptions({
      plan: context.state?.currentPlan || {}, observations: event.payload.observations || [],
      existingExceptions: context.runtime?.exceptions || [], actor, escalationActor: event.payload.escalationActor, asOf: event.occurredAt,
    })
    if (!activation.valid) return freeze({ ok: false, decision: 'blocked', errors: activation.errors, event, route: 'runtime', commands: [], persistenceEnvelope: null })
    commands = activation.activatedExceptions.map((exception, index) => ({
      kind: 'exception_revision', recordId: null, revision: 1, exceptionCode: exception.code,
      exceptionStatus: exceptionStatus(exception.status), severity: exceptionSeverity(exception.severity),
      eventType: 'activated', eventReason: exception.stateReason || 'Exception activated from reviewed observation.',
      idempotencyKey: activation.events[index]?.eventId || `${event.eventId}:${exception.exceptionId}`,
      ...commonCommand(event, exception, 'B3', exception.contractVersion),
    }))
  } else if (event.type === CONVEYANCER_APPLICATION_H2_EVENT_TYPES.coordinationRecorded) {
    const validation = validateConveyancerCoordination(event.payload.coordination || {}, { actionKeys: (context.state?.currentPlan?.actions || []).map((item) => item.key) })
    if (!validation.valid) return freeze({ ok: false, decision: 'blocked', errors: validation.errors, event, route: 'runtime', commands: [], persistenceEnvelope: null })
    const record = validation.coordination
    commands = [{ kind: 'coordination_revision', recordId: text(event.payload.recordId) || null, revision: Math.max(1, Number(event.payload.revision || record.revision || 1)), coordinationStatus: coordinationStatus(record.status), transferFirmId: text(event.payload.transferFirmId) || null, bondFirmId: text(event.payload.bondFirmId) || null, cancellationFirmId: text(event.payload.cancellationFirmId) || null, ...commonCommand(event, record, 'E1', record.contractVersion) }]
  } else if (event.type === CONVEYANCER_APPLICATION_H2_EVENT_TYPES.evidenceCaptured) {
    const built = evidenceCommand(event, event.payload.evidence || {})
    if (built.errors.length) return freeze({ ok: false, decision: 'blocked', errors: built.errors, event, route: 'runtime', commands: [], persistenceEnvelope: null })
    commands = [built.command]
  } else if (event.type === CONVEYANCER_APPLICATION_H2_EVENT_TYPES.financialSnapshotRecorded) {
    const model = event.payload.financialModel || {}
    if (!text(model.contractVersion) || !text(model.fingerprint) || !['draft', 'under_review', 'approved', 'reconciliation_required', 'reconciled', 'finalised', 'superseded'].includes(key(model.status))) return freeze({ ok: false, decision: 'blocked', errors: ['financial_model_contract_invalid'], event, route: 'runtime', commands: [], persistenceEnvelope: null })
    commands = [{ kind: 'financial_model_revision', recordId: text(event.payload.recordId) || null, revision: Math.max(1, Number(event.payload.revision || 1)), modelStatus: key(model.status), currency: text(model.currency || 'ZAR').toUpperCase(), ...commonCommand(event, model, 'D5', model.contractVersion) }]
  } else if (event.type === CONVEYANCER_APPLICATION_H2_EVENT_TYPES.closeoutAssessed) {
    const assessment = event.payload.assessment || {}
    const built = evidenceCommand(event, { ...assessment, evidenceType: 'matter_closeout_assessment', evidenceStatus: 'under_review', sourceSystem: 'manual', captureReference: event.sourceReference }, { status: 'under_review', sourcePhase: 'G9' })
    if (built.errors.length) return freeze({ ok: false, decision: 'blocked', errors: built.errors, event, route: 'runtime', commands: [], persistenceEnvelope: null })
    commands = [built.command]
  }

  const envelope = {
    version: CONVEYANCER_APPLICATION_H2_VERSION,
    organisationId: event.organisationId, attorneyFirmId: event.attorneyFirmId, transactionId: event.transactionId,
    eventId: event.eventId, eventType: event.type, sourceReference: event.sourceReference, occurredAt: event.occurredAt,
    actorUserId: text(actor.userId || actor.user_id), inputFingerprint: fingerprint(event), commands,
  }
  envelope.outputFingerprint = fingerprint({ eventId: event.eventId, commands: commands.map((command) => command.fingerprint) })
  const observe = context.control.mode === 'observe'
  return freeze({ ok: true, decision: observe ? 'observed' : commands.length ? 'committed' : 'no_change', errors: [], event, route: 'runtime', commands: observe ? [] : commands, persistenceEnvelope: observe || !commands.length ? null : envelope })
}

export async function persistConveyancerApplicationResult(client, result = {}) {
  if (!result?.ok || !result.persistenceEnvelope) return freeze({ ok: result?.ok === true, skipped: true, reason: result?.decision || 'no_runtime_commands', data: null })
  if (!client?.rpc) throw new Error('A Supabase-compatible RPC client is required.')
  const response = await client.rpc('bridge_apply_conveyancer_application_batch', { payload: result.persistenceEnvelope })
  if (response?.error) throw response.error
  return freeze({ ok: true, skipped: false, reason: response?.data?.duplicate ? 'idempotent_replay' : 'committed', data: response?.data || null })
}

async function loadRuntimeTable(client, table, binding) {
  let query = client.from(table).select('*')
    .eq('organisation_id', binding.organisationId)
    .eq('attorney_firm_id', binding.attorneyFirmId)
    .eq('transaction_id', binding.transactionId)
    .order('created_at', { ascending: false })
  const response = await query
  if (response?.error) throw response.error
  return response?.data || []
}

export async function loadConveyancerApplicationRuntime(client, binding = {}) {
  if (!client?.from) throw new Error('A Supabase-compatible query client is required.')
  const normalized = {
    organisationId: text(binding.organisationId || binding.organisation_id),
    attorneyFirmId: text(binding.attorneyFirmId || binding.attorney_firm_id),
    transactionId: text(binding.transactionId || binding.transaction_id),
  }
  if (!normalized.organisationId || !normalized.attorneyFirmId || !normalized.transactionId) throw new Error('Application runtime tenant and matter binding is required.')
  const [exceptions, coordinations, evidence, financialModels] = await Promise.all([
    loadRuntimeTable(client, 'conveyancer_exceptions', normalized),
    loadRuntimeTable(client, 'conveyancer_coordinations', normalized),
    loadRuntimeTable(client, 'conveyancer_evidence', normalized),
    loadRuntimeTable(client, 'conveyancer_financial_models', normalized),
  ])
  return freeze({ exceptions, coordinations, evidence, financialModels })
}

export async function loadConveyancerApplicationContext(client, binding = {}, { includeRuntime = false } = {}) {
  const context = await loadConveyancerOrchestrationContext(client, binding)
  if (!includeRuntime) return context
  const runtime = await loadConveyancerApplicationRuntime(client, binding)
  return freeze({ ...context, runtime })
}

export async function runConveyancerApplicationEvent(client, { event = {}, actor = {}, context = null } = {}) {
  const normalized = normalizeEvent(event)
  const resolved = context || await loadConveyancerApplicationContext(
    client,
    { organisationId: normalized.organisationId, attorneyFirmId: normalized.attorneyFirmId, transactionId: normalized.transactionId },
    { includeRuntime: !P2_TYPES.has(normalized.type) },
  )
  const application = orchestrateConveyancerApplicationEvent({ event: normalized, context: resolved, actor })
  if (!application.ok) return freeze({ ok: false, application, persistence: { ok: false, skipped: true, reason: 'application_blocked' } })
  if (application.route === 'p2') {
    const delegated = await runConveyancerMatterEvent(client, { event: normalized, actor, context: resolved })
    return freeze({ ...delegated, application })
  }
  const persistence = await persistConveyancerApplicationResult(client, application)
  return freeze({ ok: application.ok && persistence.ok, application, persistence })
}

export function buildConveyancerApplicationProjection({ context = {}, actor = {}, asOf = '', timeline = null, lodgement = null } = {}) {
  const plan = context.state?.currentPlan || {}
  const projections = buildConveyancerOperationalProjections({ plan, actor, asOf, queue: { events: context.state?.events || {}, externalDependencies: context.state?.externalDependencies || {} }, timeline, lodgement })
  const runtime = context.runtime || {}
  return freeze({
    version: CONVEYANCER_APPLICATION_H2_VERSION,
    ok: projections.ok,
    projections,
    counts: {
      exceptions: (runtime.exceptions || []).length,
      coordinations: (runtime.coordinations || []).length,
      evidence: (runtime.evidence || []).length,
      financialModels: (runtime.financialModels || []).length,
    },
    persistedProjectionRecords: 0,
    externalProvidersRequired: false,
  })
}
