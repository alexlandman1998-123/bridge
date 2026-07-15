import { validateConveyancerCoordination } from '../../core/transactions/conveyancerCoordinationContract.js'
import { validateConveyancerThreeRoleDependencyModel } from '../../core/transactions/conveyancerThreeRoleDependencyModel.js'
import { validateConveyancerGuaranteeWorkspace } from './conveyancerGuaranteeWorkspace.js'
import {
  validateConveyancerLodgementReadinessAttestation,
  validateConveyancerSimultaneousLodgementReadiness,
} from './conveyancerSimultaneousLodgementReadiness.js'
import {
  validateConveyancerAttorneyReplacement,
  validateConveyancerCoordinationEscalation,
} from './conveyancerCoordinationEscalationReplacement.js'
import {
  evaluateConveyancerSharedTimelineViewer,
  validateConveyancerSharedProfessionalTimeline,
} from './conveyancerSharedProfessionalTimeline.js'

export const CONVEYANCER_COORDINATION_ASSURANCE_VERSION = 'conveyancer_coordination_assurance_v1'
export const CONVEYANCER_COORDINATION_ASSURANCE_DECISIONS = Object.freeze({ ready: 'ready', observe: 'observe', blocked: 'blocked' })
export const CONVEYANCER_COORDINATION_PILOT_DECISIONS = Object.freeze({ go: 'go', observe: 'observe', hold: 'hold' })

export const CONVEYANCER_COORDINATION_PILOT_THRESHOLDS = Object.freeze({
  minimumScenarioPassRate: 1,
  maximumContractFailures: 0,
  maximumBindingFailures: 0,
  maximumAuditGaps: 0,
  maximumAuthorityViolations: 0,
  maximumSideEffectAttempts: 0,
  observeOpenEscalationRate: 0.1,
  maximumOpenEscalationRate: 0.25,
})

function text(value = '') { return String(value ?? '').trim() }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, itemKey) => ({ ...result, [itemKey]: stable(value[itemKey]) }), {}); return value }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function finding(code, phase, category, severity = 'critical', evidenceId = null, details = []) { return { code, phase, category, severity, evidenceId, details: unique(Array.isArray(details) ? details.map(text) : [text(details)]) } }
function addValidation(findings, phase, evidenceId, validation) { if (!validation.valid) findings.push(finding(`${phase.toLowerCase()}_contract_invalid`, phase, 'contract', 'critical', evidenceId, validation.errors)) }

function currentRecords(dependencyModel, supplied, asOf, findings) {
  const rows = Array.isArray(supplied) ? supplied : []
  const ids = rows.map((item) => item.coordinationId)
  if (new Set(ids).size !== ids.length) findings.push(finding('e1_duplicate_coordination_record', 'E1', 'audit'))
  const nodeIds = new Set(dependencyModel.nodes.map((node) => node.coordination.coordinationId))
  if (rows.some((item) => !nodeIds.has(item.coordinationId))) findings.push(finding('e1_orphan_coordination_record', 'E1', 'binding'))
  const suppliedById = new Map(rows.map((item) => [item.coordinationId, item])); const current = []
  for (const node of dependencyModel.nodes) {
    const record = suppliedById.get(node.coordination.coordinationId) || node.coordination
    const validation = validateConveyancerCoordination(record, { actionKeys: Object.values(dependencyModel.actionKeyMap || {}) })
    addValidation(findings, 'E1', record.coordinationId, validation)
    if (record.definitionFingerprint !== node.coordination.definitionFingerprint) findings.push(finding('e1_definition_binding_invalid', 'E1', 'binding', 'critical', record.coordinationId))
    const timestamps = [record.createdAt, record.updatedAt, record.requestedAt, record.acknowledgement?.acknowledgedAt, record.submission?.submittedAt, record.decision?.decidedAt, record.blockage?.blockedAt, ...(record.evidence || []).map((item) => item.capturedAt)].filter(Boolean)
    if (timestamps.some((timestamp) => new Date(timestamp) > new Date(asOf))) findings.push(finding('e1_future_lifecycle_evidence', 'E1', 'audit', 'critical', record.coordinationId))
    current.push(validation.coordination)
  }
  return current
}

function timelineBinding(findings, timeline, records) {
  const recordById = new Map(records.map((item) => [item.coordinationId, item]))
  for (const item of timeline.items || []) {
    const record = recordById.get(item.coordinationId)
    if (!record || item.status !== record.status || item.definitionFingerprint !== record.definitionFingerprint) findings.push(finding('e3_current_record_binding_invalid', 'E3', 'binding', 'critical', item.coordinationId))
    const expectedEvidence = (record?.evidence || []).map((evidence) => ({ requirementKey: evidence.requirementKey, status: evidence.status, referenceId: evidence.referenceId }))
    if (JSON.stringify(item.evidence || []) !== JSON.stringify(expectedEvidence)) findings.push(finding('e3_evidence_projection_stale', 'E3', 'binding', 'critical', item.coordinationId))
  }
}

function guaranteeBinding(findings, workspace, records) {
  const recordById = new Map(records.map((item) => [item.coordinationId, item]))
  for (const item of workspace.coordination || []) {
    const record = recordById.get(item.coordinationId)
    if (!record || record.status !== item.status) findings.push(finding('e4_coordination_projection_stale', 'E4', 'binding', 'critical', item.coordinationId))
  }
}

function lodgementBinding(findings, readiness, records, workspace) {
  if (readiness.guaranteeWorkspaceId !== workspace.workspaceId || readiness.guaranteeWorkspaceFingerprint !== workspace.fingerprint) findings.push(finding('e5_guarantee_binding_invalid', 'E5', 'binding'))
  const recordById = new Map(records.map((item) => [item.coordinationId, item]))
  for (const lane of readiness.lanes || []) {
    if (!lane.coordinationId) continue
    const record = recordById.get(lane.coordinationId)
    if (!record || record.status !== lane.coordinationStatus) findings.push(finding('e5_coordination_projection_stale', 'E5', 'binding', 'critical', lane.coordinationId))
  }
}

function attestationBinding(findings, readiness, attestations) {
  const ids = attestations.map((item) => item.attestationId)
  if (new Set(ids).size !== ids.length) findings.push(finding('e5_duplicate_attestation', 'E5', 'audit'))
  for (const lane of readiness.lanes || []) {
    if (!lane.attestationId) continue
    const source = attestations.find((item) => item.attestationId === lane.attestationId)
    if (!source || source.fingerprint !== lane.attestationFingerprint || source.lane !== lane.lane || source.status !== lane.status || source.readinessReferenceId !== lane.readinessReferenceId) findings.push(finding('e5_attestation_binding_invalid', 'E5', 'binding', 'critical', lane.attestationId))
  }
  if (attestations.some((item) => !(readiness.lanes || []).some((lane) => lane.attestationId === item.attestationId))) findings.push(finding('e5_orphan_attestation', 'E5', 'binding'))
}

function escalationAudit(escalation) {
  const errors = []; const events = escalation.events || []; const commands = escalation.processedCommands || []
  if (events.length !== escalation.revision || commands.length !== escalation.revision) errors.push('escalation_revision_history_mismatch')
  if (new Set(events.map((item) => item.eventId)).size !== events.length) errors.push('duplicate_escalation_event')
  if (new Set(commands.map((item) => item.commandId)).size !== commands.length) errors.push('duplicate_escalation_command')
  if (events.some((item, index) => index > 0 && new Date(item.occurredAt) < new Date(events[index - 1].occurredAt))) errors.push('escalation_event_order_invalid')
  if (events[0]?.type !== 'raised' || events[0]?.level !== 1) errors.push('escalation_opening_event_invalid')
  if (events.at(-1)?.level !== escalation.level) errors.push('escalation_level_history_mismatch')
  if (escalation.status === 'resolved' && events.at(-1)?.type !== 'resolve') errors.push('escalation_resolution_event_missing')
  if (escalation.status === 'cancelled' && events.at(-1)?.type !== 'cancel') errors.push('escalation_cancellation_event_missing')
  return errors
}

function e6Bindings(findings, escalations, replacements, dependencyModel, records, guaranteeWorkspace, lodgementReadiness, asOf) {
  const escalationIds = new Set(); const replacementIds = new Set()
  for (const escalation of escalations) {
    const validation = validateConveyancerCoordinationEscalation(escalation, { dependencyModel }); addValidation(findings, 'E6', escalation.escalationId, validation)
    if (escalationIds.has(escalation.escalationId)) findings.push(finding('e6_duplicate_escalation', 'E6', 'audit', 'critical', escalation.escalationId)); escalationIds.add(escalation.escalationId)
    const auditErrors = escalationAudit(escalation); if (auditErrors.length) findings.push(finding('e6_escalation_audit_invalid', 'E6', 'audit', 'critical', escalation.escalationId, auditErrors))
    if (new Date(escalation.events?.at(-1)?.occurredAt || escalation.raisedAt) > new Date(asOf)) findings.push(finding('e6_future_escalation_event', 'E6', 'audit', 'critical', escalation.escalationId))
    if (escalation.target?.targetType === 'coordination') {
      const record = records.find((item) => item.coordinationId === escalation.target.targetId)
      if (!record || record.definitionFingerprint !== escalation.target.targetFingerprint) findings.push(finding('e6_coordination_escalation_binding_invalid', 'E6', 'binding', 'critical', escalation.escalationId))
    }
    if (!['resolved', 'cancelled'].includes(escalation.status) && escalation.target?.targetType === 'guarantee_issue' && escalation.target.targetFingerprint !== guaranteeWorkspace.fingerprint) findings.push(finding('e6_guarantee_escalation_stale', 'E6', 'binding', 'critical', escalation.escalationId))
    if (!['resolved', 'cancelled'].includes(escalation.status) && escalation.target?.targetType === 'lodgement_issue' && escalation.target.targetFingerprint !== lodgementReadiness.fingerprint) findings.push(finding('e6_lodgement_escalation_stale', 'E6', 'binding', 'critical', escalation.escalationId))
  }
  for (const replacement of replacements) {
    const validation = validateConveyancerAttorneyReplacement(replacement, { dependencyModel }); addValidation(findings, 'E6', replacement.replacementId, validation)
    if (replacementIds.has(replacement.replacementId)) findings.push(finding('e6_duplicate_replacement', 'E6', 'audit', 'critical', replacement.replacementId)); replacementIds.add(replacement.replacementId)
    if (new Date(replacement.appointment?.appointedAt || replacement.requestedAt) > new Date(asOf)) findings.push(finding('e6_future_replacement_event', 'E6', 'audit', 'critical', replacement.replacementId))
    if (replacement.escalationBinding) {
      const escalation = escalations.find((item) => item.escalationId === replacement.escalationBinding.escalationId)
      if (!escalation || escalation.fingerprint !== replacement.escalationBinding.escalationFingerprint) findings.push(finding('e6_replacement_escalation_binding_invalid', 'E6', 'binding', 'critical', replacement.replacementId))
    }
  }
}

function missingEscalationFindings(findings, timeline, guaranteeWorkspace, lodgementReadiness, escalations) {
  const activeTargets = new Set(escalations.filter((item) => !['resolved', 'cancelled'].includes(item.status)).map((item) => `${item.target.targetType}:${item.target.targetId}`))
  for (const item of timeline.items || []) if ((item.overdue || item.state === 'blocked') && !activeTargets.has(`coordination:${item.coordinationId}`)) findings.push(finding('e6_coordination_escalation_missing', 'E6', 'matter', 'warning', item.coordinationId))
  for (const item of guaranteeWorkspace.issues || []) if (item.severity === 'blocker' && !activeTargets.has(`guarantee_issue:${item.code}`)) findings.push(finding('e6_guarantee_escalation_missing', 'E6', 'matter', 'warning', item.code))
  for (const item of lodgementReadiness.issues || []) if (item.severity === 'blocker' && !activeTargets.has(`lodgement_issue:${item.code}`)) findings.push(finding('e6_lodgement_escalation_missing', 'E6', 'matter', 'warning', item.code))
}

export function assureConveyancerCoordinationEvidence({ dependencyModel = {}, coordinationRecords = [], timeline = {}, guaranteeWorkspace = {}, lodgementReadiness = {}, attestations = [], escalations = [], replacements = [], viewer = {}, asOf = '' } = {}) {
  const assuredAt = iso(asOf); const findings = []
  if (!assuredAt) findings.push(finding('e7_assurance_time_invalid', 'E7', 'contract'))
  const dependencyValidation = validateConveyancerThreeRoleDependencyModel(dependencyModel); addValidation(findings, 'E2', dependencyModel.modelId, dependencyValidation)
  const viewerAccess = dependencyValidation.valid ? evaluateConveyancerSharedTimelineViewer({ dependencyModel, viewer }) : { allowed: false, reason: 'dependency_model_invalid' }
  if (!viewerAccess.allowed) findings.push(finding('e7_viewer_access_invalid', 'E7', 'authority', 'critical', null, [viewerAccess.reason]))
  const records = dependencyValidation.valid && assuredAt ? currentRecords(dependencyModel, coordinationRecords, assuredAt, findings) : []
  const timelineValidation = validateConveyancerSharedProfessionalTimeline(timeline, { dependencyModel }); addValidation(findings, 'E3', timeline.timelineId, timelineValidation)
  const guaranteeValidation = validateConveyancerGuaranteeWorkspace(guaranteeWorkspace, { dependencyModel }); addValidation(findings, 'E4', guaranteeWorkspace.workspaceId, guaranteeValidation)
  const lodgementValidation = validateConveyancerSimultaneousLodgementReadiness(lodgementReadiness, { dependencyModel, guaranteeWorkspace }); addValidation(findings, 'E5', lodgementReadiness.readinessId, lodgementValidation)
  for (const attestation of Array.isArray(attestations) ? attestations : []) addValidation(findings, 'E5', attestation.attestationId, validateConveyancerLodgementReadinessAttestation(attestation, { dependencyModel }))
  if (dependencyValidation.valid && timelineValidation.valid) timelineBinding(findings, timelineValidation.timeline, records)
  if (dependencyValidation.valid && guaranteeValidation.valid) guaranteeBinding(findings, guaranteeValidation.workspace, records)
  if (dependencyValidation.valid && guaranteeValidation.valid && lodgementValidation.valid) lodgementBinding(findings, lodgementValidation.readiness, records, guaranteeValidation.workspace)
  if (lodgementValidation.valid) attestationBinding(findings, lodgementValidation.readiness, Array.isArray(attestations) ? attestations : [])
  if (assuredAt && timeline.asOf !== assuredAt) findings.push(finding('e3_projection_time_stale', 'E3', 'binding'))
  if (assuredAt && guaranteeWorkspace.asOf !== assuredAt) findings.push(finding('e4_projection_time_stale', 'E4', 'binding'))
  if (assuredAt && lodgementReadiness.asOf !== assuredAt) findings.push(finding('e5_projection_time_stale', 'E5', 'binding'))
  if (viewerAccess.allowed && (![timeline.viewer, guaranteeWorkspace.viewer, lodgementReadiness.viewer].every((item) => item?.userId === viewerAccess.viewer.userId && item?.lane === viewerAccess.viewer.lane && item?.firmId === viewerAccess.viewer.firmId))) findings.push(finding('e3_e5_viewer_binding_invalid', 'E7', 'authority'))
  if (dependencyValidation.valid && guaranteeValidation.valid && lodgementValidation.valid && assuredAt) e6Bindings(findings, Array.isArray(escalations) ? escalations : [], Array.isArray(replacements) ? replacements : [], dependencyModel, records, guaranteeValidation.workspace, lodgementValidation.readiness, assuredAt)
  if (timelineValidation.valid && guaranteeValidation.valid && lodgementValidation.valid) missingEscalationFindings(findings, timelineValidation.timeline, guaranteeValidation.workspace, lodgementValidation.readiness, Array.isArray(escalations) ? escalations : [])
  if (timelineValidation.valid && ['blocked', 'overdue'].includes(timeline.health)) findings.push(finding('e3_matter_coordination_at_risk', 'E3', 'matter', 'warning', timeline.timelineId, [timeline.health]))
  if (guaranteeValidation.valid && guaranteeWorkspace.applicable && !guaranteeWorkspace.ready) findings.push(finding('e4_guarantees_not_ready', 'E4', 'matter', 'warning', guaranteeWorkspace.workspaceId, [guaranteeWorkspace.health]))
  if (lodgementValidation.valid && !lodgementReadiness.jointReady) findings.push(finding('e5_joint_lodgement_not_ready', 'E5', 'matter', 'warning', lodgementReadiness.readinessId, [lodgementReadiness.health]))
  for (const escalation of Array.isArray(escalations) ? escalations : []) if (!['resolved', 'cancelled'].includes(escalation.status)) findings.push(finding('e6_escalation_open', 'E6', 'matter', 'warning', escalation.escalationId, [escalation.status]))
  for (const replacement of Array.isArray(replacements) ? replacements : []) findings.push(finding(replacement.status === 'appointment_confirmed' ? 'e6_dependency_regeneration_required' : 'e6_replacement_pending', 'E6', 'matter', 'warning', replacement.replacementId, [replacement.status]))
  const critical = findings.filter((item) => item.severity === 'critical').length; const warnings = findings.filter((item) => item.severity === 'warning').length
  const decision = critical ? 'blocked' : warnings ? 'observe' : 'ready'
  const report = {
    version: CONVEYANCER_COORDINATION_ASSURANCE_VERSION, decision, assuredAt,
    dependencyModelId: dependencyModel.modelId || null, dependencyModelFingerprint: dependencyModel.fingerprint || null,
    transactionId: dependencyModel.transactionId || null, organisationId: dependencyModel.organisationId || null, plan: dependencyModel.plan || null,
    viewer: viewerAccess.viewer || null,
    counts: { coordinationRecords: records.length, timelineItems: timeline.items?.length || 0, guaranteeRequirements: guaranteeWorkspace.requirements?.length || 0, guaranteeInstruments: guaranteeWorkspace.instruments?.length || 0, lodgementLanes: lodgementReadiness.lanes?.length || 0, attestations: attestations.length || 0, escalations: escalations.length || 0, replacements: replacements.length || 0, critical, warnings },
    findings,
    phaseStatus: { E1: records.length === dependencyModel.nodes?.length, E2: dependencyValidation.valid, E3: timelineValidation.valid, E4: guaranteeValidation.valid, E5: lodgementValidation.valid, E6: !findings.some((item) => item.phase === 'E6' && item.severity === 'critical') },
    controls: { readOnly: true, persistencePerformed: false, notificationsSent: false, workflowsMutated: false, appointmentChanged: false, invitationsSent: false, accessRevoked: false, deedsSubmissionPerformed: false },
    fingerprint: null,
  }
  report.fingerprint = fnv({ ...report, fingerprint: undefined })
  return deepFreeze(report)
}

function safeThresholds(input = {}) {
  const defaults = CONVEYANCER_COORDINATION_PILOT_THRESHOLDS
  return {
    minimumScenarioPassRate: Math.max(defaults.minimumScenarioPassRate, Math.min(1, number(input.minimumScenarioPassRate, defaults.minimumScenarioPassRate))),
    maximumContractFailures: Math.min(defaults.maximumContractFailures, Math.max(0, number(input.maximumContractFailures, defaults.maximumContractFailures))),
    maximumBindingFailures: Math.min(defaults.maximumBindingFailures, Math.max(0, number(input.maximumBindingFailures, defaults.maximumBindingFailures))),
    maximumAuditGaps: Math.min(defaults.maximumAuditGaps, Math.max(0, number(input.maximumAuditGaps, defaults.maximumAuditGaps))),
    maximumAuthorityViolations: Math.min(defaults.maximumAuthorityViolations, Math.max(0, number(input.maximumAuthorityViolations, defaults.maximumAuthorityViolations))),
    maximumSideEffectAttempts: Math.min(defaults.maximumSideEffectAttempts, Math.max(0, number(input.maximumSideEffectAttempts, defaults.maximumSideEffectAttempts))),
    observeOpenEscalationRate: Math.min(defaults.observeOpenEscalationRate, Math.max(0, number(input.observeOpenEscalationRate, defaults.observeOpenEscalationRate))),
    maximumOpenEscalationRate: Math.min(defaults.maximumOpenEscalationRate, Math.max(0, number(input.maximumOpenEscalationRate, defaults.maximumOpenEscalationRate))),
  }
}

export function evaluateConveyancerCoordinationPilot({ scenarios = [], operationalMetrics = {}, thresholds = {} } = {}) {
  const resolved = safeThresholds(thresholds); const rows = (Array.isArray(scenarios) ? scenarios : []).map((scenario, index) => ({ scenarioId: text(scenario.scenarioId) || `scenario_${index + 1}`, expectedDecision: text(scenario.expectedDecision) || 'ready', actualDecision: text(scenario.assurance?.decision), passed: text(scenario.assurance?.decision) === (text(scenario.expectedDecision) || 'ready') }))
  const scenarioPassRate = rows.length ? rows.filter((item) => item.passed).length / rows.length : 0
  const metrics = { contractFailures: Math.max(0, number(operationalMetrics.contractFailures)), bindingFailures: Math.max(0, number(operationalMetrics.bindingFailures)), auditGaps: Math.max(0, number(operationalMetrics.auditGaps)), authorityViolations: Math.max(0, number(operationalMetrics.authorityViolations)), sideEffectAttempts: Math.max(0, number(operationalMetrics.sideEffectAttempts)), openEscalationRate: Math.max(0, Math.min(1, number(operationalMetrics.openEscalationRate))) }
  const holds = []
  if (!rows.length) holds.push('pilot_scenarios_required')
  if (scenarioPassRate < resolved.minimumScenarioPassRate) holds.push('scenario_pass_rate_below_threshold')
  for (const metric of ['contractFailures', 'bindingFailures', 'auditGaps', 'authorityViolations', 'sideEffectAttempts']) if (metrics[metric] > resolved[`maximum${metric[0].toUpperCase()}${metric.slice(1)}`]) holds.push(`${metric.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_threshold_exceeded`)
  if (metrics.openEscalationRate > resolved.maximumOpenEscalationRate) holds.push('open_escalation_rate_threshold_exceeded')
  const decision = holds.length ? 'hold' : metrics.openEscalationRate > resolved.observeOpenEscalationRate ? 'observe' : 'go'
  return deepFreeze({ version: CONVEYANCER_COORDINATION_ASSURANCE_VERSION, decision, thresholds: resolved, scenarioPassRate, scenarios: rows, operationalMetrics: metrics, holds })
}

export function buildConveyancerCoordinationPilotManifest(input = {}) {
  const firmIds = unique((input.firmIds || []).map(text)).slice(0, 3); const lanes = unique((input.lanes || []).map(text)).filter((lane) => ['transfer', 'bond', 'cancellation'].includes(lane)); const maximumMatters = Math.max(1, Math.min(25, Math.floor(number(input.maximumMatters, 5))))
  const ownerKeys = ['assurance', 'legal', 'operations', 'support', 'rollback']; const owners = Object.fromEntries(ownerKeys.map((ownerKey) => [ownerKey, text(input.owners?.[ownerKey]) || null])); const errors = []
  if (!firmIds.length) errors.push('pilot_firm_required'); if (!lanes.length) errors.push('pilot_lane_required'); if (!iso(input.startsAt) || !iso(input.endsAt) || new Date(input.startsAt) >= new Date(input.endsAt)) errors.push('pilot_window_invalid'); if (Object.values(owners).some((owner) => !owner)) errors.push('pilot_owner_required')
  return deepFreeze({ version: CONVEYANCER_COORDINATION_ASSURANCE_VERSION, valid: !errors.length, errors, scope: { firmIds, lanes, maximumMatters, startsAt: iso(input.startsAt), endsAt: iso(input.endsAt) }, owners, controls: { humanApprovalRequired: true, databaseWritesEnabled: false, notificationsEnabled: false, appointmentActivationEnabled: false, invitationDeliveryEnabled: false, accessRevocationEnabled: false, deedsSubmissionEnabled: false, rollbackOwnerRequired: true } })
}

export function serializeConveyancerCoordinationAssuranceEvidence({ assurance = {}, pilot = null, manifest = null } = {}) {
  return JSON.stringify(stable({ version: CONVEYANCER_COORDINATION_ASSURANCE_VERSION, assurance: { decision: assurance.decision || null, assuredAt: assurance.assuredAt || null, dependencyModelId: assurance.dependencyModelId || null, counts: assurance.counts || {}, phaseStatus: assurance.phaseStatus || {}, findings: (assurance.findings || []).map(({ code, phase, category, severity, evidenceId, details }) => ({ code, phase, category, severity, evidenceId, details })), controls: assurance.controls || {}, fingerprint: assurance.fingerprint || null }, pilot: pilot ? { decision: pilot.decision, thresholds: pilot.thresholds, scenarioPassRate: pilot.scenarioPassRate, scenarios: pilot.scenarios, operationalMetrics: pilot.operationalMetrics, holds: pilot.holds } : null, manifest: manifest ? { valid: manifest.valid, errors: manifest.errors, scope: manifest.scope, owners: manifest.owners, controls: manifest.controls } : null }))
}
