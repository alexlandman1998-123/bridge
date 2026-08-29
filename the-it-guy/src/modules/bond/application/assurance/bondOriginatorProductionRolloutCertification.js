import { canonicalizeBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'
import { BOND_ORIGINATOR_LIVE_FLOW_CERTIFICATION_VERSION } from './bondOriginatorLiveFlowCertification.js'

export const BOND_ORIGINATOR_PRODUCTION_ROLLOUT_VERSION = 'phase-10-v1'
export const BOND_ORIGINATOR_PRODUCTION_ROLLOUT_MINIMUM_WINDOW_MINUTES = 60

export const BOND_ORIGINATOR_PRODUCTION_HEALTH_THRESHOLDS = Object.freeze({
  openFailureRate: 0.01,
  saveFailureRate: 0.01,
  resumeFailureRate: 0.01,
  apiErrorRate: 0.005,
  packGenerationFailureRate: 0.01,
  handoffPreparationFailureRate: 0.01,
  duplicateActiveRequirementCount: 0,
  uploadedDocumentLossCount: 0,
  criticalIncidentCount: 0,
})

function text(value) {
  return String(value || '').trim()
}

function number(value) {
  if (value === null || value === undefined || value === '') return Number.POSITIVE_INFINITY
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

function minutesBetween(later, earlier) {
  const end = Date.parse(later)
  const start = Date.parse(earlier)
  if (!Number.isFinite(end) || !Number.isFinite(start)) return 0
  return Math.max(0, (end - start) / 60_000)
}

function check(key, passed, message, evidence = {}) {
  return { key, passed: passed === true, status: passed === true ? 'pass' : 'fail', message, evidence }
}

export function buildBondOriginatorProductionRolloutTemplate({ artifactId = '', generatedAt = new Date().toISOString() } = {}) {
  return {
    generatedAt,
    phase9Certification: {},
    deployment: { environment: 'production', artifactId, commitSha: '', deploymentId: '', promotedAt: '' },
    rollout: { mode: 'canary', featureFlag: '', cohort: '', percentage: 0, automaticExpansionEnabled: false, pauseAvailable: false },
    observation: { startedAt: '', endedAt: '', observedApplicationCount: 0, syntheticJourneyPassed: false, telemetryContractVersion: '', evidenceRefs: [] },
    health: Object.fromEntries(Object.keys(BOND_ORIGINATOR_PRODUCTION_HEALTH_THRESHOLDS).map((key) => [key, null])),
    controls: { monitoringOwner: '', supportOwner: '', rollbackOwner: '', rollbackRunbookAvailable: false, rollbackTestedAt: '', alertingEnabled: false },
    incidents: [],
    containsPersonalInformation: false,
    auditMutatedProduction: false,
  }
}

export function buildBondOriginatorProductionRolloutCertification(input = {}) {
  const generatedAt = input.generatedAt || new Date().toISOString()
  const phase9 = input.phase9Certification || {}
  const deployment = input.deployment || {}
  const rollout = input.rollout || {}
  const observation = input.observation || {}
  const controls = input.controls || {}
  const health = input.health || {}
  const observationMinutes = minutesBetween(observation.endedAt, observation.startedAt)
  const healthResults = Object.entries(BOND_ORIGINATOR_PRODUCTION_HEALTH_THRESHOLDS).map(([key, threshold]) => ({
    key,
    actual: number(health[key]),
    threshold,
    passed: number(health[key]) <= threshold,
  }))
  const incidentList = Array.isArray(input.incidents) ? input.incidents : []
  const unresolvedIncidents = incidentList.filter((incident) => incident?.resolved !== true)
  const checks = [
    check('phase9_certification_bound', phase9.version === BOND_ORIGINATOR_LIVE_FLOW_CERTIFICATION_VERSION && phase9.ready === true && phase9.status === 'live_certification_ready' && Boolean(text(phase9.fingerprint)), 'Bind a ready, fingerprinted Phase 9 live-flow certification.', { version: phase9.version || null, status: phase9.status || null }),
    check('certified_artifact_promoted', text(deployment.environment).toLowerCase() === 'production' && Boolean(text(deployment.artifactId) && text(deployment.commitSha) && text(deployment.deploymentId) && text(deployment.promotedAt)) && deployment.artifactId === phase9.build?.artifactId && deployment.commitSha === phase9.build?.commitSha, 'Production must run the exact artifact and commit certified by Phase 9.', deployment),
    check('controlled_canary_enabled', rollout.mode === 'canary' && Boolean(text(rollout.featureFlag) && text(rollout.cohort)) && number(rollout.percentage) > 0 && number(rollout.percentage) <= 100 && rollout.pauseAvailable === true, 'Use a named, pausable canary cohort with an explicit rollout percentage.', rollout),
    check('automatic_expansion_disabled', rollout.automaticExpansionEnabled !== true, 'Do not expand production rollout automatically from this evidence artifact.', { automaticExpansionEnabled: rollout.automaticExpansionEnabled === true }),
    check('observation_window_complete', observationMinutes >= BOND_ORIGINATOR_PRODUCTION_ROLLOUT_MINIMUM_WINDOW_MINUTES && Date.parse(observation.startedAt) >= Date.parse(deployment.promotedAt) && Date.parse(observation.endedAt) <= Date.parse(generatedAt), 'Observe production for at least 60 minutes after promotion.', { startedAt: observation.startedAt || null, endedAt: observation.endedAt || null, observationMinutes }),
    check('production_traffic_observed', number(observation.observedApplicationCount) >= 1 && observation.syntheticJourneyPassed === true && Boolean(text(observation.telemetryContractVersion)) && (observation.evidenceRefs || []).length > 0, 'Require production traffic, a passing synthetic journey, telemetry identity and evidence references.', observation),
    check('health_thresholds_passed', healthResults.every((result) => result.passed), 'All workflow, document-integrity and incident metrics must remain within their fail-closed thresholds.', { results: healthResults }),
    check('no_unresolved_incidents', unresolvedIncidents.length === 0, 'Resolve or explicitly stop rollout for every recorded incident.', { incidentCount: incidentList.length, unresolvedIncidentIds: unresolvedIncidents.map((incident) => incident.id || 'unknown') }),
    check('monitoring_support_rollback_ready', Boolean(text(controls.monitoringOwner) && text(controls.supportOwner) && text(controls.rollbackOwner)) && controls.rollbackRunbookAvailable === true && Boolean(text(controls.rollbackTestedAt)) && controls.alertingEnabled === true, 'Name monitoring, support and rollback owners; enable alerts and prove the rollback path.', controls),
    check('privacy_safe_evidence', input.containsPersonalInformation !== true, 'The rollout artifact must contain aggregate metrics and opaque references, never personal information.', { containsPersonalInformation: input.containsPersonalInformation === true }),
    check('read_only_certification', input.auditMutatedProduction !== true, 'Generating certification must not itself change production state.', { auditMutatedProduction: input.auditMutatedProduction === true }),
  ]
  const blockers = checks.filter((item) => !item.passed)
  const payload = {
    version: BOND_ORIGINATOR_PRODUCTION_ROLLOUT_VERSION,
    generatedAt,
    phase9Fingerprint: phase9.fingerprint || null,
    deployment: {
      environment: text(deployment.environment).toLowerCase(),
      artifactId: text(deployment.artifactId) || null,
      commitSha: text(deployment.commitSha) || null,
      deploymentId: text(deployment.deploymentId) || null,
    },
    rollout: { mode: rollout.mode || null, featureFlag: text(rollout.featureFlag) || null, cohort: text(rollout.cohort) || null, percentage: number(rollout.percentage) },
    observation: { startedAt: observation.startedAt || null, endedAt: observation.endedAt || null, observedApplicationCount: Number(observation.observedApplicationCount || 0) },
    healthResults,
    checks,
  }
  return {
    ...payload,
    status: blockers.length ? 'rollout_blocked' : 'rollout_observed_healthy',
    readyForExpansion: blockers.length === 0,
    blockers,
    metrics: { checkCount: checks.length, passedCount: checks.length - blockers.length, blockerCount: blockers.length, observationMinutes },
    fingerprint: `${BOND_ORIGINATOR_PRODUCTION_ROLLOUT_VERSION}:${canonicalizeBondApplicationSnapshot(payload)}`,
    nextAction: blockers.length ? 'Pause expansion, resolve the blockers and restart the observation window.' : 'Approve the next rollout cohort manually and repeat Phase 10 before further expansion.',
  }
}
