import { CONVEYANCER_PRACTICE_OPERATIONS_VERSION } from './conveyancerPracticeOperationsContract.js'
import { CONVEYANCER_INFORMATION_GOVERNANCE_VERSION } from './conveyancerInformationGovernance.js'
import { CONVEYANCER_MANUAL_EVIDENCE_VERSION } from './conveyancerManualEvidenceRegister.js'
import { CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION } from './conveyancerClientRiskCompliance.js'
import { CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION } from './conveyancerTrustMoneyControls.js'
import { CONVEYANCER_MATTER_CORRESPONDENCE_VERSION } from './conveyancerMatterCorrespondenceRegister.js'
import { CONVEYANCER_FIRM_OPERATIONS_VERSION, FIRM_CONFIGURATION_STATUSES, FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY } from './conveyancerFirmOperationsConfiguration.js'

export const CONVEYANCER_PRACTICE_ASSURANCE_VERSION = 'conveyancer_practice_assurance_g8_v1'
export const CONVEYANCER_PRACTICE_ASSURANCE_DECISIONS = Object.freeze({ ready: 'ready', observe: 'observe', blocked: 'blocked' })
export const CONVEYANCER_PRACTICE_PILOT_DECISIONS = Object.freeze({ go: 'go', observe: 'observe', hold: 'hold' })
export const CONVEYANCER_PRACTICE_PHASES = Object.freeze({ G1: 'G1', G2: 'G2', G3: 'G3', G4: 'G4', G5: 'G5', G6: 'G6', G7: 'G7' })
export const CONVEYANCER_PRACTICE_PHASE_VERSIONS = Object.freeze({ G1: CONVEYANCER_PRACTICE_OPERATIONS_VERSION, G2: CONVEYANCER_INFORMATION_GOVERNANCE_VERSION, G3: CONVEYANCER_MANUAL_EVIDENCE_VERSION, G4: CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION, G5: CONVEYANCER_TRUST_MONEY_CONTROLS_VERSION, G6: CONVEYANCER_MATTER_CORRESPONDENCE_VERSION, G7: CONVEYANCER_FIRM_OPERATIONS_VERSION })
export const CONVEYANCER_PRACTICE_MINIMUM_SCENARIOS = Object.freeze({ G1: 9, G2: 9, G3: 12, G4: 13, G5: 14, G6: 14, G7: 16 })
export const CONVEYANCER_PRACTICE_REQUIRED_PROBES = Object.freeze(['contractValidation', 'tenantAndMatterBinding', 'authoritySeparation', 'humanApproval', 'accessIsolation', 'manualIntegrationEquivalence', 'referenceOnlyEvidence', 'tamperDetection', 'sideEffectBoundary'])
export const CONVEYANCER_PRACTICE_MANUAL_READINESS_CONTROLS = Object.freeze(['manualEvidenceCapture', 'manualCorrespondenceFiling', 'manualComplianceReview', 'manualTrustReconciliation', 'manualMatterSupervision'])
export const CONVEYANCER_PRACTICE_PILOT_THRESHOLDS = Object.freeze({ minimumScenarioPassRate: 1, maximumContractFailures: 0, maximumBindingFailures: 0, maximumAuthorityViolations: 0, maximumAccessIncidents: 0, maximumHumanApprovalBypasses: 0, maximumTrustControlBreaches: 0, maximumPrivacyIncidents: 0, maximumSideEffectAttempts: 0, maximumSilentConfigurationRewrites: 0, observeManualBacklogRate: 0.05, maximumManualBacklogRate: 0.15 })
export const CONVEYANCER_PRACTICE_ASSURANCE_BOUNDARY = Object.freeze({ readOnly: true, independentReviewRequired: true, externalProvidersRequired: false, credentialsRead: false, payloadsRead: false, databaseWritesPerformed: false, workflowMutated: false, evidenceApproved: false, complianceDecisionMade: false, trustPaymentExecuted: false, correspondenceSent: false, configurationAdopted: false, matterRewritten: false, notificationSent: false, deploymentPerformed: false })

const PHASES = Object.values(CONVEYANCER_PRACTICE_PHASES)
const ENVIRONMENTS = new Set(['test', 'staging', 'production_candidate'])
const text = (value = '') => String(value ?? '').trim()
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
const hashValid = (value) => /^(sha256:)?[a-f0-9]{64}$/i.test(text(value))
const commitValid = (value) => /^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(text(value))
const fingerprintValid = (value) => /^fnv1a_[a-f0-9]{8}$/i.test(text(value))
const unique = (values = []) => [...new Set(values.filter(Boolean))]
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, name) => { result[name] = stable(value[name]); return result }, {}) }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function withoutFingerprint(value = {}) { const copy = JSON.parse(JSON.stringify(value)); delete copy.fingerprint; return copy }
function actor(value = {}) { return { userId: text(value.userId), role: text(value.role).toLowerCase(), organisationId: text(value.organisationId), attorneyFirmId: text(value.attorneyFirmId) } }
function finding(code, phase, category, severity = 'critical', evidenceId = null, details = []) { return { code, phase, category, severity, evidenceId, details: unique(details.map(text)) } }
function boundaryValid(value = {}) { return Object.entries(CONVEYANCER_PRACTICE_ASSURANCE_BOUNDARY).every(([name, expected]) => value.controls?.[name] === expected) }

export function validateConveyancerPracticePhaseCheckpoint(input = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []
  if (value.version !== CONVEYANCER_PRACTICE_ASSURANCE_VERSION || !value.checkpointId || !PHASES.includes(value.phase) || value.phaseVersion !== CONVEYANCER_PRACTICE_PHASE_VERSIONS[value.phase]) errors.push('practice_checkpoint_identity_invalid')
  if (!value.releaseCandidateId || !value.buildId || !commitValid(value.sourceCommitHash) || !ENVIRONMENTS.has(value.environment) || !value.organisationId || !value.attorneyFirmId) errors.push('practice_checkpoint_release_binding_invalid')
  if (!value.suiteId || !value.suiteVersion || !iso(value.executedAt) || !iso(value.reviewedAt) || new Date(value.reviewedAt) < new Date(value.executedAt)) errors.push('practice_checkpoint_provenance_invalid')
  if (!Number.isInteger(value.scenarioCount) || value.scenarioCount < CONVEYANCER_PRACTICE_MINIMUM_SCENARIOS[value.phase] || value.passedCount !== value.scenarioCount || value.failedCount !== 0 || value.skippedCount !== 0) errors.push('practice_checkpoint_scenario_gate_failed')
  if (CONVEYANCER_PRACTICE_REQUIRED_PROBES.some((probe) => value.probes?.[probe] !== true) || Object.keys(value.probes || {}).some((probe) => !CONVEYANCER_PRACTICE_REQUIRED_PROBES.includes(probe))) errors.push('practice_checkpoint_control_probe_failed')
  if (!value.evidenceReference || !hashValid(value.evidenceHash) || !(value.artifactFingerprints || []).length || value.artifactFingerprints.some((item) => !fingerprintValid(item))) errors.push('practice_checkpoint_evidence_invalid')
  if (!['system', 'quality_engineer'].includes(value.executedBy?.role) || !value.executedBy?.userId || value.reviewedBy?.role !== 'firm_manager' || !value.reviewedBy?.userId || value.executedBy.userId === value.reviewedBy.userId || value.executedBy.organisationId !== value.reviewedBy.organisationId || value.executedBy.attorneyFirmId !== value.reviewedBy.attorneyFirmId || value.organisationId !== value.reviewedBy.organisationId || value.attorneyFirmId !== value.reviewedBy.attorneyFirmId) errors.push('practice_checkpoint_independent_review_invalid')
  if ((value.exceptions || []).length) errors.push('practice_checkpoint_open_exception')
  if (!boundaryValid(value)) errors.push('practice_checkpoint_side_effect_boundary_violated')
  if (value.fingerprint !== fnv(withoutFingerprint(value))) errors.push('practice_checkpoint_fingerprint_invalid')
  return freeze({ valid: errors.length === 0, errors: unique(errors), checkpoint: value })
}

export function buildConveyancerPracticePhaseCheckpoint(input = {}) {
  const phase = text(input.phase).toUpperCase()
  const value = { version: CONVEYANCER_PRACTICE_ASSURANCE_VERSION, checkpointId: text(input.checkpointId), phase, phaseVersion: text(input.phaseVersion || CONVEYANCER_PRACTICE_PHASE_VERSIONS[phase]), releaseCandidateId: text(input.releaseCandidateId), buildId: text(input.buildId), sourceCommitHash: text(input.sourceCommitHash).toLowerCase(), environment: text(input.environment).toLowerCase(), organisationId: text(input.organisationId), attorneyFirmId: text(input.attorneyFirmId), suiteId: text(input.suiteId), suiteVersion: text(input.suiteVersion), scenarioCount: Number(input.scenarioCount || 0), passedCount: Number(input.passedCount || 0), failedCount: Number(input.failedCount || 0), skippedCount: Number(input.skippedCount || 0), probes: Object.fromEntries(CONVEYANCER_PRACTICE_REQUIRED_PROBES.map((probe) => [probe, input.probes?.[probe] === true])), artifactFingerprints: unique((input.artifactFingerprints || []).map(text)).sort(), evidenceReference: text(input.evidenceReference), evidenceHash: text(input.evidenceHash).toLowerCase(), exceptions: (input.exceptions || []).map(text).filter(Boolean), executedAt: iso(input.executedAt), executedBy: actor(input.executedBy), reviewedAt: iso(input.reviewedAt), reviewedBy: actor(input.reviewedBy), controls: CONVEYANCER_PRACTICE_ASSURANCE_BOUNDARY, fingerprint: null }
  value.fingerprint = fnv(withoutFingerprint(value)); const validation = validateConveyancerPracticePhaseCheckpoint(value)
  return freeze({ ok: validation.valid, code: validation.valid ? 'practice_phase_checkpoint_certified' : 'practice_phase_checkpoint_invalid', errors: validation.errors, checkpoint: validation.checkpoint })
}

function validateConfiguration(configuration = {}, organisationId = '', attorneyFirmId = '') {
  const errors = []
  if (configuration.version !== CONVEYANCER_FIRM_OPERATIONS_VERSION || configuration.status !== FIRM_CONFIGURATION_STATUSES.published || configuration.organisationId !== organisationId || configuration.attorneyFirmId !== attorneyFirmId || !fingerprintValid(configuration.fingerprint)) errors.push('practice_published_configuration_invalid')
  if (configuration.fingerprint !== fnv(withoutFingerprint(configuration))) errors.push('practice_configuration_fingerprint_invalid')
  if (!Object.entries(FIRM_OPERATIONS_SIDE_EFFECT_BOUNDARY).every(([name, expected]) => configuration.controls?.[name] === expected)) errors.push('practice_configuration_boundary_invalid')
  return errors
}

export function assureConveyancerPracticeRelease(input = {}) {
  const checkpoints = Array.isArray(input.checkpoints) ? input.checkpoints : []; const findings = []
  for (const phase of PHASES) { const rows = checkpoints.filter((item) => item.phase === phase); if (rows.length !== 1) findings.push(finding(rows.length ? 'practice_phase_checkpoint_duplicate' : 'practice_phase_checkpoint_missing', phase, 'coverage')); for (const row of rows) { const validation = validateConveyancerPracticePhaseCheckpoint(row); if (!validation.valid) findings.push(finding('practice_phase_checkpoint_invalid', phase, 'contract', 'critical', row.checkpointId, validation.errors)) } }
  const releaseBindings = unique(checkpoints.map((item) => `${item.releaseCandidateId}|${item.buildId}|${item.sourceCommitHash}|${item.environment}`)); if (releaseBindings.length !== 1) findings.push(finding('practice_release_binding_inconsistent', 'G8', 'binding'))
  const tenantBindings = unique(checkpoints.map((item) => `${item.organisationId}|${item.attorneyFirmId}`)); if (tenantBindings.length !== 1) findings.push(finding('practice_tenant_binding_inconsistent', 'G8', 'binding'))
  const [organisationId, attorneyFirmId] = (tenantBindings[0] || '|').split('|')
  for (const error of validateConfiguration(input.configuration, organisationId, attorneyFirmId)) findings.push(finding(error, 'G7', 'configuration', 'critical', input.configuration?.configurationId))
  const g7Checkpoint = checkpoints.find((item) => item.phase === 'G7'); if (g7Checkpoint && !g7Checkpoint.artifactFingerprints?.includes(input.configuration?.fingerprint)) findings.push(finding('practice_g7_checkpoint_configuration_binding_invalid', 'G7', 'binding', 'critical', g7Checkpoint.checkpointId))
  const manualReadiness = Object.fromEntries(CONVEYANCER_PRACTICE_MANUAL_READINESS_CONTROLS.map((control) => [control, input.manualReadiness?.[control] === true]))
  for (const [control, passed] of Object.entries(manualReadiness)) if (!passed) findings.push(finding(`practice_${control.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_not_ready`, 'G8', 'manual_fallback'))
  const critical = findings.filter((item) => item.severity === 'critical').length; const warnings = findings.filter((item) => item.severity === 'warning').length
  const report = { version: CONVEYANCER_PRACTICE_ASSURANCE_VERSION, assuranceId: text(input.assuranceId), releaseCandidateId: checkpoints[0]?.releaseCandidateId || null, buildId: checkpoints[0]?.buildId || null, sourceCommitHash: checkpoints[0]?.sourceCommitHash || null, environment: checkpoints[0]?.environment || null, organisationId: organisationId || null, attorneyFirmId: attorneyFirmId || null, configurationId: input.configuration?.configurationId || null, configurationRevision: input.configuration?.revision || null, configurationFingerprint: input.configuration?.fingerprint || null, assuredAt: iso(input.assuredAt), decision: critical ? 'blocked' : warnings ? 'observe' : 'ready', phaseStatus: Object.fromEntries(PHASES.map((phase) => [phase, !findings.some((item) => item.phase === phase && item.severity === 'critical')])), manualReadiness, providerDependency: { externalProvidersRequired: false, manualOperationRequired: true, integrationsAreAccelerators: true }, counts: { checkpoints: checkpoints.length, critical, warnings }, findings, checkpointFingerprints: checkpoints.map((item) => item.fingerprint), controls: CONVEYANCER_PRACTICE_ASSURANCE_BOUNDARY, fingerprint: null }
  if (!report.assuranceId || !report.assuredAt) report.findings.push(finding('practice_assurance_identity_invalid', 'G8', 'contract'))
  report.counts.critical = report.findings.filter((item) => item.severity === 'critical').length; report.counts.warnings = report.findings.filter((item) => item.severity === 'warning').length; report.decision = report.counts.critical ? 'blocked' : report.counts.warnings ? 'observe' : 'ready'; report.fingerprint = fnv(withoutFingerprint(report))
  return freeze(report)
}

function safeThresholds(input = {}) { return Object.fromEntries(Object.entries(CONVEYANCER_PRACTICE_PILOT_THRESHOLDS).map(([name, value]) => { const supplied = Number(input[name]); if (!Number.isFinite(supplied)) return [name, value]; if (name.startsWith('minimum')) return [name, Math.max(value, Math.min(1, supplied))]; return [name, Math.min(value, Math.max(0, supplied))] })) }

export function evaluateConveyancerPracticePilot({ scenarios = [], operationalMetrics = {}, thresholds = {} } = {}) {
  const resolved = safeThresholds(thresholds); const rows = (Array.isArray(scenarios) ? scenarios : []).map((scenario, index) => ({ scenarioId: text(scenario.scenarioId) || `scenario_${index + 1}`, expectedDecision: text(scenario.expectedDecision) || 'ready', actualDecision: text(scenario.assurance?.decision), passed: text(scenario.assurance?.decision) === (text(scenario.expectedDecision) || 'ready') })); const passRate = rows.length ? rows.filter((row) => row.passed).length / rows.length : 0
  const hard = ['contractFailures', 'bindingFailures', 'authorityViolations', 'accessIncidents', 'humanApprovalBypasses', 'trustControlBreaches', 'privacyIncidents', 'sideEffectAttempts', 'silentConfigurationRewrites']; const thresholdKey = (metric) => `maximum${metric[0].toUpperCase()}${metric.slice(1)}`; const metrics = Object.fromEntries([...hard, 'manualBacklogRate'].map((name) => [name, Math.max(0, Number(operationalMetrics[name] || 0))])); const holds = []
  if (!rows.length) holds.push('pilot_scenarios_required'); if (passRate < resolved.minimumScenarioPassRate) holds.push('scenario_pass_rate_below_minimum'); for (const metric of hard) if (metrics[metric] > resolved[thresholdKey(metric)]) holds.push(`${metric.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_threshold_exceeded`); if (metrics.manualBacklogRate > resolved.maximumManualBacklogRate) holds.push('manual_backlog_rate_threshold_exceeded')
  return freeze({ version: CONVEYANCER_PRACTICE_ASSURANCE_VERSION, decision: holds.length ? 'hold' : metrics.manualBacklogRate > resolved.observeManualBacklogRate ? 'observe' : 'go', thresholds: resolved, scenarioPassRate: passRate, scenarios: rows, operationalMetrics: metrics, holds })
}

export function buildConveyancerPracticePilotManifest(input = {}) {
  const firmIds = unique((input.firmIds || []).map(text)).slice(0, 3); const lanes = unique((input.lanes || []).map((item) => text(item).toLowerCase())).filter((lane) => ['transfer', 'bond', 'cancellation'].includes(lane)); const maximumMatters = Math.max(1, Math.min(25, Math.floor(Number(input.maximumMatters || 5)))); const owners = Object.fromEntries(['assurance', 'legal', 'operations', 'compliance', 'trust', 'privacy', 'support', 'rollback'].map((name) => [name, text(input.owners?.[name]) || null])); const errors = []
  if (!firmIds.length) errors.push('pilot_firm_required'); if (!lanes.length) errors.push('pilot_lane_required'); if (!iso(input.startsAt) || !iso(input.endsAt) || new Date(input.startsAt) >= new Date(input.endsAt)) errors.push('pilot_window_invalid'); if (Object.values(owners).some((owner) => !owner)) errors.push('pilot_owner_required')
  return freeze({ version: CONVEYANCER_PRACTICE_ASSURANCE_VERSION, valid: errors.length === 0, errors, scope: { firmIds, lanes, maximumMatters, startsAt: iso(input.startsAt), endsAt: iso(input.endsAt) }, owners, controls: { humanReleaseApprovalRequired: true, manualFallbackRequired: true, externalProvidersRequired: false, productionCredentialsEnabled: false, databaseWritesEnabled: false, notificationsEnabled: false, trustPaymentExecutionEnabled: false, correspondenceDispatchEnabled: false, configurationAutoAdoptionEnabled: false, deploymentEnabled: false, killSwitchRequired: true, rollbackOwnerRequired: true } })
}

export function serializeConveyancerPracticeAssuranceEvidence({ assurance = {}, pilot = null, manifest = null } = {}) {
  return JSON.stringify(stable({ version: CONVEYANCER_PRACTICE_ASSURANCE_VERSION, assurance: { assuranceId: assurance.assuranceId || null, releaseCandidateId: assurance.releaseCandidateId || null, buildId: assurance.buildId || null, sourceCommitHash: assurance.sourceCommitHash || null, environment: assurance.environment || null, organisationId: assurance.organisationId || null, attorneyFirmId: assurance.attorneyFirmId || null, configurationId: assurance.configurationId || null, configurationRevision: assurance.configurationRevision || null, configurationFingerprint: assurance.configurationFingerprint || null, assuredAt: assurance.assuredAt || null, decision: assurance.decision || null, phaseStatus: assurance.phaseStatus || {}, manualReadiness: assurance.manualReadiness || {}, providerDependency: assurance.providerDependency || {}, counts: assurance.counts || {}, findings: (assurance.findings || []).map(({ code, phase, category, severity, evidenceId, details }) => ({ code, phase, category, severity, evidenceId, details })), controls: assurance.controls || {}, fingerprint: assurance.fingerprint || null }, pilot: pilot ? { decision: pilot.decision, thresholds: pilot.thresholds, scenarioPassRate: pilot.scenarioPassRate, scenarios: pilot.scenarios, operationalMetrics: pilot.operationalMetrics, holds: pilot.holds } : null, manifest: manifest ? { valid: manifest.valid, errors: manifest.errors, scope: manifest.scope, owners: manifest.owners, controls: manifest.controls } : null }))
}
