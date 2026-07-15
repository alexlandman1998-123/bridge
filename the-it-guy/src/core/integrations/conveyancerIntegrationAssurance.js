import {
  CONVEYANCER_INTEGRATION_CONNECTION_STATUSES,
  CONVEYANCER_INTEGRATION_ENVIRONMENTS,
  CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES as P,
  validateConveyancerIntegrationAdapterManifest,
  validateConveyancerIntegrationConnection,
} from './conveyancerIntegrationFramework.js'
import { CONVEYANCER_PRACTICE_MANAGEMENT_INTEGRATION_VERSION } from './conveyancerPracticeManagementIntegration.js'
import { CONVEYANCER_TRUST_ACCOUNTING_INTEGRATION_VERSION } from './conveyancerTrustAccountingIntegration.js'
import { CONVEYANCER_SARS_TRANSFER_DUTY_INTEGRATION_VERSION } from './conveyancerSarsTransferDutyIntegration.js'
import { CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION } from './conveyancerMunicipalLevyIntegration.js'
import { CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION } from './conveyancerBankGuaranteeIntegration.js'
import { CONVEYANCER_DEEDS_PROGRESSION_INTEGRATION_VERSION } from './conveyancerDeedsProgressionIntegration.js'
import { CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION } from './conveyancerIntegrationFramework.js'

export const CONVEYANCER_INTEGRATION_ASSURANCE_VERSION = 'conveyancer_integration_assurance_f8_v1'
export const CONVEYANCER_INTEGRATION_ASSURANCE_DECISIONS = Object.freeze({ ready: 'ready', observe: 'observe', blocked: 'blocked' })
export const CONVEYANCER_INTEGRATION_PILOT_DECISIONS = Object.freeze({ go: 'go', observe: 'observe', hold: 'hold' })

export const CONVEYANCER_INTEGRATION_PHASES = Object.freeze({ F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6', F7: 'F7' })
export const CONVEYANCER_INTEGRATION_PHASE_VERSIONS = Object.freeze({
  F1: CONVEYANCER_INTEGRATION_FRAMEWORK_VERSION,
  F2: CONVEYANCER_PRACTICE_MANAGEMENT_INTEGRATION_VERSION,
  F3: CONVEYANCER_TRUST_ACCOUNTING_INTEGRATION_VERSION,
  F4: CONVEYANCER_SARS_TRANSFER_DUTY_INTEGRATION_VERSION,
  F5: CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION,
  F6: CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION,
  F7: CONVEYANCER_DEEDS_PROGRESSION_INTEGRATION_VERSION,
})
export const CONVEYANCER_INTEGRATION_MINIMUM_SCENARIOS = Object.freeze({ F1: 12, F2: 12, F3: 13, F4: 17, F5: 16, F6: 16, F7: 13 })
export const CONVEYANCER_INTEGRATION_REQUIRED_PROBES = Object.freeze([
  'contractValidation', 'exactMatterBinding', 'exactFirmBinding', 'idempotency',
  'inboundSignatureAndReplay', 'referenceOnlyPayloads', 'sideEffectBoundary', 'tamperDetection',
])
export const CONVEYANCER_INTEGRATION_REQUIRED_PROVIDER_CATEGORIES = Object.freeze({
  F2: Object.freeze([P.practiceManagement]), F3: Object.freeze([P.trustAccounting]), F4: Object.freeze([P.taxAuthority]),
  F5: Object.freeze([P.municipalAuthority, P.communityScheme]), F6: Object.freeze([P.banking]), F7: Object.freeze([P.deeds]),
})
export const CONVEYANCER_INTEGRATION_PILOT_THRESHOLDS = Object.freeze({
  minimumScenarioPassRate: 1, maximumContractFailures: 0, maximumBindingFailures: 0,
  maximumSignatureFailures: 0, maximumReplayAttemptsAccepted: 0, maximumPrivacyIncidents: 0,
  maximumSideEffectAttempts: 0, maximumIdempotencyConflictsUnresolved: 0,
  observeReconciliationBacklogRate: 0.05, maximumReconciliationBacklogRate: 0.15,
})
export const CONVEYANCER_INTEGRATION_ASSURANCE_BOUNDARY = Object.freeze({
  readOnly: true, humanReleaseApprovalRequired: true, independentReviewRequired: true,
  credentialsRead: false, payloadsRead: false, externalCallsPerformed: false, externalWritesPerformed: false,
  databaseWritesPerformed: false, workflowMutated: false, evidenceApproved: false, registrationOutcomeMutated: false,
  moneyMoved: false, notificationsSent: false, deploymentPerformed: false, rollbackPerformed: false,
})

const PHASES = Object.values(CONVEYANCER_INTEGRATION_PHASES)
const text = (value = '') => String(value ?? '').trim()
const validDate = (value) => Boolean(value && Number.isFinite(new Date(value).getTime()))
const iso = (value) => validDate(value) ? new Date(value).toISOString() : value || null
const hashValid = (value) => /^(sha256:)?[a-f0-9]{64}$/i.test(text(value))
const commitValid = (value) => /^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(text(value))
const unique = (values = []) => [...new Set(values.filter(Boolean))]
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, key) => { result[key] = stable(value[key]); return result }, {}) }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function snapshot(value = {}) { const copy = stable(value); delete copy.fingerprint; return copy }
function finding(code, phase, category, severity, evidenceId = null, details = []) { return { code, phase, category, severity, evidenceId, details: unique(details) } }
function boundaryValid(value = {}) { return Object.entries(CONVEYANCER_INTEGRATION_ASSURANCE_BOUNDARY).every(([key, expected]) => value.controls?.[key] === expected) }
function actor(input = {}) { return { role: text(input.role).toLowerCase(), userId: text(input.userId || input.user_id) || null, organisationId: text(input.organisationId || input.organisation_id) || null } }

export function validateConveyancerIntegrationPhaseCheckpoint(input = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []
  if (value.version !== CONVEYANCER_INTEGRATION_ASSURANCE_VERSION || !value.checkpointId || !PHASES.includes(value.phase) || value.phaseVersion !== CONVEYANCER_INTEGRATION_PHASE_VERSIONS[value.phase]) errors.push('integration_checkpoint_identity_invalid')
  if (!value.releaseCandidateId || !value.buildId || !commitValid(value.sourceCommitHash) || !Object.values(CONVEYANCER_INTEGRATION_ENVIRONMENTS).includes(value.environment)) errors.push('integration_checkpoint_release_binding_invalid')
  if (!value.suiteId || !value.suiteVersion || !validDate(value.executedAt) || !validDate(value.reviewedAt) || new Date(value.reviewedAt) < new Date(value.executedAt)) errors.push('integration_checkpoint_provenance_invalid')
  if (!Number.isInteger(value.scenarioCount) || value.scenarioCount < CONVEYANCER_INTEGRATION_MINIMUM_SCENARIOS[value.phase] || value.passedCount !== value.scenarioCount || value.failedCount !== 0 || value.skippedCount !== 0) errors.push('integration_checkpoint_scenario_gate_failed')
  const probeKeys = Object.keys(value.probes || {}); if (CONVEYANCER_INTEGRATION_REQUIRED_PROBES.some((probe) => value.probes?.[probe] !== true) || probeKeys.some((probe) => !CONVEYANCER_INTEGRATION_REQUIRED_PROBES.includes(probe))) errors.push('integration_checkpoint_control_probe_failed')
  if (!value.evidenceReferenceId || !hashValid(value.evidenceHash) || (value.adapterFingerprints || []).some((fingerprint) => !/^fnv1a_[a-f0-9]{8}$/.test(fingerprint))) errors.push('integration_checkpoint_evidence_invalid')
  if (!value.executedBy?.userId || !['system', 'integration_engineer'].includes(value.executedBy?.role) || !value.reviewedBy?.userId || value.reviewedBy?.role !== 'firm_manager' || value.executedBy.userId === value.reviewedBy.userId || value.executedBy.organisationId !== value.reviewedBy.organisationId) errors.push('integration_checkpoint_independent_review_invalid')
  if ((value.exceptions || []).length) errors.push('integration_checkpoint_open_exception')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('integration_checkpoint_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('integration_checkpoint_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), checkpoint: value })
}

export function buildConveyancerIntegrationPhaseCheckpoint(input = {}) {
  const value = { version: CONVEYANCER_INTEGRATION_ASSURANCE_VERSION, checkpointId: text(input.checkpointId), phase: text(input.phase).toUpperCase(), phaseVersion: text(input.phaseVersion || CONVEYANCER_INTEGRATION_PHASE_VERSIONS[text(input.phase).toUpperCase()]), releaseCandidateId: text(input.releaseCandidateId), buildId: text(input.buildId), sourceCommitHash: text(input.sourceCommitHash).toLowerCase(), environment: text(input.environment).toLowerCase(), suiteId: text(input.suiteId), suiteVersion: text(input.suiteVersion), scenarioCount: Number(input.scenarioCount || 0), passedCount: Number(input.passedCount || 0), failedCount: Number(input.failedCount || 0), skippedCount: Number(input.skippedCount || 0), probes: Object.fromEntries(CONVEYANCER_INTEGRATION_REQUIRED_PROBES.map((probe) => [probe, input.probes?.[probe] === true])), adapterFingerprints: unique((input.adapterFingerprints || []).map(text)).sort(), evidenceReferenceId: text(input.evidenceReferenceId), evidenceHash: text(input.evidenceHash).toLowerCase(), exceptions: Array.isArray(input.exceptions) ? input.exceptions.map(text).filter(Boolean) : [], executedAt: iso(input.executedAt), executedBy: actor(input.executedBy), reviewedAt: iso(input.reviewedAt), reviewedBy: actor(input.reviewedBy), controls: CONVEYANCER_INTEGRATION_ASSURANCE_BOUNDARY, fingerprint: null }; value.fingerprint = fnv(snapshot(value)); const validation = validateConveyancerIntegrationPhaseCheckpoint(value); return deepFreeze({ ok: validation.valid, code: validation.valid ? 'integration_phase_checkpoint_certified' : 'integration_phase_checkpoint_invalid', errors: validation.errors, checkpoint: validation.checkpoint })
}

function inventoryFindings(manifests, connections) {
  const findings = []; const validManifests = new Map()
  manifests.forEach((manifest) => { const validation = validateConveyancerIntegrationAdapterManifest(manifest); if (!validation.valid) findings.push(finding('integration_adapter_invalid', 'F1', 'contract', 'critical', manifest.adapterId, validation.errors)); else validManifests.set(manifest.adapterId, manifest) })
  if (new Set(manifests.map((item) => `${item.adapterId}:${item.adapterVersion}`)).size !== manifests.length) findings.push(finding('integration_adapter_duplicate', 'F1', 'inventory', 'critical'))
  connections.forEach((connection) => { const manifest = validManifests.get(connection.adapterId); const validation = validateConveyancerIntegrationConnection(connection, { manifest: manifest || {} }); if (!manifest || !validation.valid) findings.push(finding('integration_connection_invalid', 'F1', 'contract', 'critical', connection.connectionId, validation.errors)); else if (connection.status !== CONVEYANCER_INTEGRATION_CONNECTION_STATUSES.active) findings.push(finding('integration_connection_not_active', 'F1', 'operations', 'warning', connection.connectionId, [connection.status])) })
  if (new Set(connections.map((item) => item.connectionId)).size !== connections.length) findings.push(finding('integration_connection_duplicate', 'F1', 'inventory', 'critical'))
  return { findings, validManifests }
}

export function assureConveyancerIntegrationRelease(input = {}) {
  const checkpoints = Array.isArray(input.checkpoints) ? input.checkpoints : []; const manifests = Array.isArray(input.manifests) ? input.manifests : []; const connections = Array.isArray(input.connections) ? input.connections : []; const findings = []
  const { findings: inventoryIssues, validManifests } = inventoryFindings(manifests, connections); findings.push(...inventoryIssues)
  PHASES.forEach((phase) => { const phaseItems = checkpoints.filter((item) => item.phase === phase); if (phaseItems.length !== 1) findings.push(finding(phaseItems.length ? 'integration_phase_checkpoint_duplicate' : 'integration_phase_checkpoint_missing', phase, 'coverage', 'critical')); phaseItems.forEach((item) => { const result = validateConveyancerIntegrationPhaseCheckpoint(item); if (!result.valid) findings.push(finding('integration_phase_checkpoint_invalid', phase, 'contract', 'critical', item.checkpointId, result.errors)) }) })
  const releaseBindings = unique(checkpoints.map((item) => `${item.releaseCandidateId}|${item.buildId}|${item.sourceCommitHash}|${item.environment}`)); if (releaseBindings.length !== 1) findings.push(finding('integration_release_binding_inconsistent', 'F8', 'binding', 'critical'))
  const organisationIds = unique(checkpoints.flatMap((item) => [item.executedBy?.organisationId, item.reviewedBy?.organisationId])); if (organisationIds.length !== 1) findings.push(finding('integration_assurance_organisation_inconsistent', 'F8', 'authority', 'critical'))
  Object.entries(CONVEYANCER_INTEGRATION_REQUIRED_PROVIDER_CATEGORIES).forEach(([phase, categories]) => { const categoryManifests = [...validManifests.values()].filter((manifest) => categories.includes(manifest.category)); if (!categoryManifests.length) findings.push(finding('integration_provider_category_missing', phase, 'inventory', 'critical', null, categories)); else { const fingerprints = new Set(categoryManifests.map((manifest) => manifest.fingerprint)); const checkpoint = checkpoints.find((item) => item.phase === phase); if (checkpoint && !checkpoint.adapterFingerprints?.some((fingerprint) => fingerprints.has(fingerprint))) findings.push(finding('integration_checkpoint_adapter_binding_invalid', phase, 'binding', 'critical', checkpoint.checkpointId)) } })
  const orphanConnections = connections.filter((connection) => !validManifests.has(connection.adapterId)); if (orphanConnections.length) findings.push(finding('integration_connection_orphaned', 'F1', 'inventory', 'critical', null, orphanConnections.map((item) => item.connectionId)))
  const critical = findings.filter((item) => item.severity === 'critical').length; const warnings = findings.filter((item) => item.severity === 'warning').length; const decision = critical ? 'blocked' : warnings ? 'observe' : 'ready'
  const value = { version: CONVEYANCER_INTEGRATION_ASSURANCE_VERSION, assuranceId: text(input.assuranceId), releaseCandidateId: checkpoints[0]?.releaseCandidateId || null, buildId: checkpoints[0]?.buildId || null, sourceCommitHash: checkpoints[0]?.sourceCommitHash || null, environment: checkpoints[0]?.environment || null, organisationId: organisationIds.length === 1 ? organisationIds[0] : null, assuredAt: iso(input.assuredAt), decision, phaseStatus: Object.fromEntries(PHASES.map((phase) => [phase, !findings.some((item) => item.phase === phase && item.severity === 'critical')])), counts: { checkpoints: checkpoints.length, manifests: manifests.length, connections: connections.length, activeConnections: connections.filter((item) => item.status === CONVEYANCER_INTEGRATION_CONNECTION_STATUSES.active).length, critical, warnings }, findings, checkpointFingerprints: checkpoints.map((item) => item.fingerprint), manifestFingerprints: manifests.map((item) => item.fingerprint), connectionFingerprints: connections.map((item) => item.fingerprint), controls: CONVEYANCER_INTEGRATION_ASSURANCE_BOUNDARY, fingerprint: null }
  if (!value.assuranceId || !validDate(value.assuredAt)) value.findings.push(finding('integration_assurance_identity_invalid', 'F8', 'contract', 'critical')); value.counts.critical = value.findings.filter((item) => item.severity === 'critical').length; value.decision = value.counts.critical ? 'blocked' : value.counts.warnings ? 'observe' : 'ready'; value.fingerprint = fnv(snapshot(value)); return deepFreeze(value)
}

function clampThresholds(input = {}) { const defaults = CONVEYANCER_INTEGRATION_PILOT_THRESHOLDS; return Object.fromEntries(Object.entries(defaults).map(([key, value]) => { const supplied = Number(input[key]); if (!Number.isFinite(supplied)) return [key, value]; if (key.startsWith('minimum')) return [key, Math.max(value, Math.min(1, supplied))]; return [key, Math.min(value, Math.max(0, supplied))] })) }
export function evaluateConveyancerIntegrationPilot({ scenarios = [], operationalMetrics = {}, thresholds = {} } = {}) {
  const resolved = clampThresholds(thresholds); const rows = (Array.isArray(scenarios) ? scenarios : []).map((scenario, index) => ({ scenarioId: text(scenario.scenarioId) || `scenario_${index + 1}`, expectedDecision: text(scenario.expectedDecision) || 'ready', actualDecision: text(scenario.assurance?.decision), passed: text(scenario.assurance?.decision) === (text(scenario.expectedDecision) || 'ready') })); const passRate = rows.length ? rows.filter((item) => item.passed).length / rows.length : 0
  const hardMetrics = ['contractFailures', 'bindingFailures', 'signatureFailures', 'replayAttemptsAccepted', 'privacyIncidents', 'sideEffectAttempts', 'idempotencyConflictsUnresolved']; const thresholdKey = (metric) => `maximum${metric[0].toUpperCase()}${metric.slice(1)}`; const holds = [...(!rows.length ? ['pilot_scenarios_required'] : []), ...(passRate < resolved.minimumScenarioPassRate ? ['scenario_pass_rate_below_minimum'] : []), ...hardMetrics.filter((metric) => Number(operationalMetrics[metric] || 0) > resolved[thresholdKey(metric)]).map((metric) => `${metric}_threshold_exceeded`), ...(Number(operationalMetrics.reconciliationBacklogRate || 0) > resolved.maximumReconciliationBacklogRate ? ['reconciliation_backlog_rate_exceeded'] : [])]
  const observe = !holds.length && Number(operationalMetrics.reconciliationBacklogRate || 0) > resolved.observeReconciliationBacklogRate; return deepFreeze({ version: CONVEYANCER_INTEGRATION_ASSURANCE_VERSION, decision: holds.length ? 'hold' : observe ? 'observe' : 'go', thresholds: resolved, scenarioPassRate: passRate, scenarios: rows, operationalMetrics: stable(operationalMetrics), holds })
}

export function buildConveyancerIntegrationPilotManifest(input = {}) {
  const firmIds = unique((input.firmIds || []).map(text)).slice(0, 3); const providerCategories = unique((input.providerCategories || []).map(text)); const maximumMatters = Math.min(25, Math.max(5, Number(input.maximumMatters || 5))); const owners = Object.fromEntries(['assurance', 'legal', 'operations', 'security', 'privacy', 'support', 'rollback'].map((key) => [key, text(input.owners?.[key]) || null])); const errors = []
  if (!firmIds.length) errors.push('pilot_firm_required'); if (!providerCategories.length) errors.push('pilot_provider_category_required'); if (!iso(input.startsAt) || !iso(input.endsAt) || new Date(input.startsAt) >= new Date(input.endsAt)) errors.push('pilot_window_invalid'); if (Object.values(owners).some((owner) => !owner)) errors.push('pilot_owner_required')
  return deepFreeze({ version: CONVEYANCER_INTEGRATION_ASSURANCE_VERSION, valid: errors.length === 0, errors, scope: { firmIds, providerCategories, maximumMatters, startsAt: iso(input.startsAt), endsAt: iso(input.endsAt) }, owners, controls: { humanApprovalRequired: true, productionCredentialsEnabled: false, automaticDeploymentEnabled: false, externalWritesEnabled: false, databaseWritesEnabled: false, notificationsEnabled: false, moneyMovementEnabled: false, registrationMutationEnabled: false, killSwitchRequired: true, rollbackOwnerRequired: true } })
}

export function serializeConveyancerIntegrationAssuranceEvidence({ assurance = {}, pilot = null, manifest = null } = {}) {
  return JSON.stringify(stable({ version: CONVEYANCER_INTEGRATION_ASSURANCE_VERSION, assurance: { assuranceId: assurance.assuranceId || null, releaseCandidateId: assurance.releaseCandidateId || null, buildId: assurance.buildId || null, sourceCommitHash: assurance.sourceCommitHash || null, environment: assurance.environment || null, decision: assurance.decision || null, assuredAt: assurance.assuredAt || null, phaseStatus: assurance.phaseStatus || {}, counts: assurance.counts || {}, findings: (assurance.findings || []).map(({ code, phase, category, severity, evidenceId, details }) => ({ code, phase, category, severity, evidenceId, details })), controls: assurance.controls || {}, fingerprint: assurance.fingerprint || null }, pilot: pilot ? { decision: pilot.decision, thresholds: pilot.thresholds, scenarioPassRate: pilot.scenarioPassRate, scenarios: pilot.scenarios, operationalMetrics: pilot.operationalMetrics, holds: pilot.holds } : null, manifest: manifest ? { valid: manifest.valid, errors: manifest.errors, scope: manifest.scope, owners: manifest.owners, controls: manifest.controls } : null }))
}
