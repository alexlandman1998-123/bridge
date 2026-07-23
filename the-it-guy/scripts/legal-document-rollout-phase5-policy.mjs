import {
  ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT,
  ROLLOUT_PHASE4_WATCHDOG_CONTRACT,
  rolloutPhase4ManifestDigest,
} from './legal-document-rollout-phase4-policy.mjs'
import {
  sha256Digest,
  stableJson,
  stableValue,
} from './legal-document-rollout-phase1-artifacts.mjs'

export const ROLLOUT_PHASE5_CONTRACT = 'legal-document-production-pilot-observation-v1'
export const ROLLOUT_PHASE5_LIFECYCLE_TRACE_CONTRACT = 'legal-document-pilot-lifecycle-trace-v1'
export const ROLLOUT_PHASE5_RUNTIME_GUARD_CONTRACT = ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT
export const ROLLOUT_PHASE5_WATCHDOG_CONTRACT = ROLLOUT_PHASE4_WATCHDOG_CONTRACT
export const ROLLOUT_PHASE5_MIN_OBSERVATION_HOURS = 144
export const ROLLOUT_PHASE5_MIN_OBSERVATION_MS = ROLLOUT_PHASE5_MIN_OBSERVATION_HOURS * 60 * 60 * 1000
export const ROLLOUT_PHASE5_MIN_HEALTHY_SCOPED_SNAPSHOTS = 7
export const ROLLOUT_PHASE5_MAX_SNAPSHOT_GAP_MINUTES = 90

// Phase 5 accepts evidence from an already activated, one-organisation pilot.
// It records no provider action and never converts observation into expansion
// authority. A later, separately approved release must decide whether any
// scale action is justified.
export const ROLLOUT_PHASE5_DOES_NOT_AUTHORIZE = Object.freeze([
  'cohort_expansion_or_scale',
  'a_second_organisation',
  'template_source_migration_or_deployment_changes',
  'an_unbounded_customer_document_or_email_campaign',
  'production_activation_or_runtime_secret_change',
  'rollback_execution',
])

export const ROLLOUT_PHASE5_DOES_NOT_VERIFY = Object.freeze([
  'future_runtime_or_provider_drift',
  'future_customer_lifecycles_after_the_observation_window',
  'unredacted_runtime_secrets_or_provider_logs',
  'a_future_scale_or_cohort_change',
])

const RECEIPT_KEYS = Object.freeze([
  'cohort', 'contract', 'environment', 'evidence', 'execution', 'manifestDigest', 'observation', 'phase', 'safety', 'source', 'status', 'version',
])
const ENVIRONMENT_KEYS = Object.freeze([
  'productionOrigin', 'productionProjectRef', 'productionUrl',
])
const SOURCE_KEYS = Object.freeze([
  'activationPlanDigest', 'commitSha', 'observationPlanDigest', 'packageLockSha256', 'phase0ManifestDigest', 'phase1ReceiptManifestDigest', 'phase2ReceiptCommitSha', 'phase2ReceiptManifestDigest', 'phase3ReceiptCommitSha', 'phase3ReceiptManifestDigest', 'phase4ReceiptCommitSha', 'phase4ReceiptManifestDigest',
])
const COHORT_KEYS = Object.freeze([
  'cohortDigest', 'maxOrganisations', 'organisationIds', 'requiredPacketTypes',
])
const SAFETY_KEYS = Object.freeze([
  'creationPaused', 'customerDeliveryPolicy', 'noScaleAuthorization', 'rollbackToDarkLaunchRequired', 'runtimeGuardContract', 'scaleEnabled', 'watchdogContract',
])
const OBSERVATION_KEYS = Object.freeze([
  'maximumBlockers', 'maximumCriticalSnapshots', 'maximumSnapshotGapMinutes', 'maximumWarningSnapshots', 'minimumHealthyScopedSnapshots', 'minimumObservationHours',
])
const EVIDENCE_KEYS = Object.freeze([
  'changeReference', 'observationRecordedAt', 'observationRecordedBy', 'preparedAt', 'preparedBy', 'reviewedBy',
])
const EXECUTION_KEYS = Object.freeze([
  'evidencePacketDigest', 'lifecycleProofs', 'monitoring', 'overallEvidenceDigest', 'reconciliation', 'rollbackReadiness',
])
const MONITORING_KEYS = Object.freeze([
  'activationPlanDigest', 'blockerCount', 'cohortDigest', 'criticalScopedSnapshotCount', 'evidenceDigest', 'healthyScopedSnapshotCount', 'maximumObservedGapMinutes', 'observationEndedAt', 'observationStartedAt', 'organisationIds', 'reviewedAt', 'reviewedBy', 'runtimeGuardContract', 'scopeMode', 'snapshotEvidenceDigest', 'status', 'warningScopedSnapshotCount', 'watchdogContract',
])
const RECONCILIATION_KEYS = Object.freeze([
  'activationPlanDigest', 'blockerCount', 'cohortDigest', 'evidenceDigest', 'f2Failures', 'f3Failures', 'f4Failures', 'finalResolverAccessFailures', 'missingFinalArtifacts', 'organisationIds', 'packetTypes', 'reviewedAt', 'reviewedBy', 'staleSigningPackets', 'status', 'unresolvedGenerationFailures',
])
const ROLLBACK_KEYS = Object.freeze([
  'activationPlanDigest', 'checkedAt', 'checkedBy', 'creationPaused', 'darkLaunchRestoreEvidenceDigest', 'evidenceDigest', 'organisationIds', 'pilotEnabled', 'rollbackPlanEvidenceDigest', 'scaleEnabled', 'status',
])
const LIFECYCLE_PROOF_KEYS = Object.freeze([
  'activationPlanDigest', 'cohortDigest', 'completedAt', 'evidenceDigest', 'f2FinalArtifact', 'f3DeliveryAndTransaction', 'f4SurfaceCompletion', 'finalResolverAccess', 'generation', 'lifecycleTraceContract', 'organisationId', 'packetReferenceDigest', 'packetType', 'signing',
])
const LIFECYCLE_STAGE_KEYS = Object.freeze([
  'evidenceDigest', 'observedAt', 'releaseMarkerBound', 'status',
])

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right)
}

function exactKeys(value, fields) {
  return sameJson(Object.keys(record(value)).sort(), [...fields].sort())
}

function validDigest(value) {
  return /^sha256:[0-9a-f]{64}$/.test(text(value))
}

function validCommit(value) {
  return /^[0-9a-f]{40}$/i.test(text(value))
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
}

function validProjectRef(value) {
  return /^[a-z0-9]{8,64}$/.test(text(value))
}

function timeMs(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : NaN
}

function validIsoTime(value, nowMs) {
  const observed = timeMs(value)
  return Number.isFinite(observed) && observed <= nowMs + 5 * 60_000
}

function validHttpsOrigin(value) {
  const candidate = text(value)
  try {
    const parsed = new URL(candidate)
    return candidate === parsed.origin && parsed.protocol === 'https:' && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

function expectedOrigin(projectRef) {
  return `https://${text(projectRef)}.supabase.co`
}

function normalizedIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))].sort()
}

function cohortDigest(ids) {
  return sha256Digest(normalizedIds(ids).join(','))
}

function add(blockers, code, detail, pending = false) {
  blockers.push(pending ? { code, detail, pending: true } : { code, detail })
}

function pendingExecutionShape() {
  return {
    lifecycleProofs: [],
    monitoring: {
      status: 'not_run',
      watchdogContract: null,
      runtimeGuardContract: null,
      scopeMode: null,
      organisationIds: [],
      cohortDigest: null,
      activationPlanDigest: null,
      observationStartedAt: null,
      observationEndedAt: null,
      healthyScopedSnapshotCount: null,
      warningScopedSnapshotCount: null,
      criticalScopedSnapshotCount: null,
      blockerCount: null,
      maximumObservedGapMinutes: null,
      snapshotEvidenceDigest: null,
      evidenceDigest: null,
      reviewedAt: null,
      reviewedBy: null,
    },
    reconciliation: {
      status: 'not_run',
      organisationIds: [],
      cohortDigest: null,
      activationPlanDigest: null,
      packetTypes: [],
      unresolvedGenerationFailures: null,
      staleSigningPackets: null,
      missingFinalArtifacts: null,
      f2Failures: null,
      f3Failures: null,
      f4Failures: null,
      finalResolverAccessFailures: null,
      blockerCount: null,
      evidenceDigest: null,
      reviewedAt: null,
      reviewedBy: null,
    },
    rollbackReadiness: {
      status: 'not_run',
      organisationIds: [],
      activationPlanDigest: null,
      pilotEnabled: null,
      creationPaused: null,
      scaleEnabled: null,
      rollbackPlanEvidenceDigest: null,
      darkLaunchRestoreEvidenceDigest: null,
      evidenceDigest: null,
      checkedAt: null,
      checkedBy: null,
    },
    overallEvidenceDigest: null,
    evidencePacketDigest: null,
  }
}

function pendingEvidenceProjection(evidence) {
  return {
    preparedBy: evidence.preparedBy ?? null,
    preparedAt: evidence.preparedAt ?? null,
    changeReference: evidence.changeReference ?? null,
  }
}

function lifecycleStageProjection(stage) {
  const candidate = record(stage)
  return {
    status: candidate.status ?? null,
    releaseMarkerBound: candidate.releaseMarkerBound ?? null,
    evidenceDigest: candidate.evidenceDigest ?? null,
    observedAt: candidate.observedAt ?? null,
  }
}

function lifecycleProofProjection(proof) {
  const candidate = record(proof)
  return {
    packetType: candidate.packetType ?? null,
    organisationId: candidate.organisationId ?? null,
    packetReferenceDigest: candidate.packetReferenceDigest ?? null,
    cohortDigest: candidate.cohortDigest ?? null,
    activationPlanDigest: candidate.activationPlanDigest ?? null,
    lifecycleTraceContract: candidate.lifecycleTraceContract ?? null,
    generation: lifecycleStageProjection(candidate.generation),
    signing: lifecycleStageProjection(candidate.signing),
    f2FinalArtifact: lifecycleStageProjection(candidate.f2FinalArtifact),
    f3DeliveryAndTransaction: lifecycleStageProjection(candidate.f3DeliveryAndTransaction),
    f4SurfaceCompletion: lifecycleStageProjection(candidate.f4SurfaceCompletion),
    finalResolverAccess: lifecycleStageProjection(candidate.finalResolverAccess),
    completedAt: candidate.completedAt ?? null,
    evidenceDigest: candidate.evidenceDigest ?? null,
  }
}

// The observation plan is sealed before any lifecycle evidence is accepted.
// It deliberately excludes execution evidence and receipt self-digest.
export function rolloutPhase5ObservationPlanDigest(receipt) {
  const candidate = record(receipt)
  const source = { ...record(candidate.source) }
  delete source.observationPlanDigest
  return sha256Digest(stableJson({
    version: candidate.version,
    phase: candidate.phase,
    contract: candidate.contract,
    environment: candidate.environment,
    source,
    cohort: candidate.cohort,
    safety: candidate.safety,
    observation: candidate.observation,
    evidence: pendingEvidenceProjection(record(candidate.evidence)),
  }))
}

// This is an evidence-packet digest, not a claim about raw provider logs. It
// binds the redacted proof projections plus the accountable finalization data.
export function rolloutPhase5EvidencePacketDigest({
  lifecycleProofs,
  monitoring,
  reconciliation,
  rollbackReadiness,
  overallEvidenceDigest,
  observationRecordedAt,
  observationRecordedBy,
  reviewedBy,
} = {}) {
  return sha256Digest(stableJson({
    lifecycleProofs: Array.isArray(lifecycleProofs) ? lifecycleProofs.map(lifecycleProofProjection) : [],
    monitoring: record(monitoring),
    reconciliation: record(reconciliation),
    rollbackReadiness: record(rollbackReadiness),
    overallEvidenceDigest: overallEvidenceDigest ?? null,
    observationRecordedAt: observationRecordedAt ?? null,
    observationRecordedBy: observationRecordedBy ?? null,
    reviewedBy: reviewedBy ?? null,
  }))
}

export function rolloutPhase5ManifestDigest(receipt) {
  const canonical = { ...record(receipt) }
  delete canonical.manifestDigest
  return sha256Digest(stableJson(canonical))
}

function validLifecycleStage(item, startMs, endMs) {
  const stage = record(item)
  const observedAt = timeMs(stage.observedAt)
  return exactKeys(stage, LIFECYCLE_STAGE_KEYS) && stage.status === 'attested' && stage.releaseMarkerBound === true &&
    validDigest(stage.evidenceDigest) && Number.isFinite(observedAt) && observedAt >= startMs && observedAt <= endMs
}

function validateLifecycleProofs(items, candidate, startMs, endMs, blockers) {
  const proofs = Array.isArray(items) ? items : []
  const ids = candidate.cohort?.organisationIds || []
  if (proofs.length !== 2 || !sameJson(proofs.map((proof) => proof?.packetType), ['mandate', 'otp'])) {
    add(blockers, 'P5_LIFECYCLE_PACKET_TYPE_COVERAGE_INVALID', 'Phase 5 requires exactly one release-bound full lifecycle proof for mandate and one for OTP, in that order.')
    return
  }
  const references = new Set()
  for (const proof of proofs) {
    const stages = ['generation', 'signing', 'f2FinalArtifact', 'f3DeliveryAndTransaction', 'f4SurfaceCompletion', 'finalResolverAccess']
    const stageTimes = stages.map((field) => timeMs(proof?.[field]?.observedAt))
    const completedAt = timeMs(proof?.completedAt)
    const reference = text(proof?.packetReferenceDigest)
    const exact = exactKeys(proof, LIFECYCLE_PROOF_KEYS)
    const binding = proof?.organisationId === ids[0] && proof?.cohortDigest === candidate.cohort?.cohortDigest &&
      proof?.activationPlanDigest === candidate.source?.activationPlanDigest && proof?.lifecycleTraceContract === ROLLOUT_PHASE5_LIFECYCLE_TRACE_CONTRACT &&
      validDigest(reference) && !references.has(reference) && validDigest(proof?.evidenceDigest)
    const stagesValid = stages.every((field) => validLifecycleStage(proof?.[field], startMs, endMs))
    const ordered = stageTimes.every(Number.isFinite) && stageTimes.every((value, index) => index === 0 || value >= stageTimes[index - 1]) &&
      Number.isFinite(completedAt) && completedAt >= stageTimes[stageTimes.length - 1] && completedAt <= endMs
    if (!exact || !binding || !stagesValid || !ordered) {
      add(blockers, 'P5_LIFECYCLE_PROOF_INVALID', `The ${text(proof?.packetType) || 'unknown'} lifecycle proof must bind generation, signing, F2, F3, F4, and final-resolver access to the one activated release marker.`)
    }
    references.add(reference)
  }
}

function validateMonitoring(item, candidate, phase4, recordedAtMs, blockers) {
  const monitoring = record(item)
  const ids = candidate.cohort?.organisationIds || []
  const startMs = timeMs(monitoring.observationStartedAt)
  const endMs = timeMs(monitoring.observationEndedAt)
  const activationMs = timeMs(phase4.execution?.activation?.activatedAt)
  const reviewedMs = timeMs(monitoring.reviewedAt)
  const observation = record(candidate.observation)
  const correctWindow = Number.isFinite(startMs) && Number.isFinite(endMs) && Number.isFinite(activationMs) && startMs === activationMs &&
    endMs >= startMs + ROLLOUT_PHASE5_MIN_OBSERVATION_MS && endMs <= recordedAtMs
  const counts = Number.isInteger(monitoring.healthyScopedSnapshotCount) && monitoring.healthyScopedSnapshotCount >= ROLLOUT_PHASE5_MIN_HEALTHY_SCOPED_SNAPSHOTS &&
    monitoring.warningScopedSnapshotCount === 0 && monitoring.criticalScopedSnapshotCount === 0 && monitoring.blockerCount === 0 &&
    Number.isInteger(monitoring.maximumObservedGapMinutes) && monitoring.maximumObservedGapMinutes >= 0 && monitoring.maximumObservedGapMinutes <= ROLLOUT_PHASE5_MAX_SNAPSHOT_GAP_MINUTES
  const binding = monitoring.watchdogContract === ROLLOUT_PHASE5_WATCHDOG_CONTRACT && monitoring.runtimeGuardContract === ROLLOUT_PHASE5_RUNTIME_GUARD_CONTRACT &&
    monitoring.scopeMode === 'configured_organisations' && sameJson(monitoring.organisationIds, ids) && monitoring.cohortDigest === candidate.cohort?.cohortDigest &&
    monitoring.activationPlanDigest === candidate.source?.activationPlanDigest
  const accountability = validDigest(monitoring.snapshotEvidenceDigest) && validDigest(monitoring.evidenceDigest) && text(monitoring.reviewedBy) &&
    Number.isFinite(reviewedMs) && Number.isFinite(endMs) && reviewedMs >= endMs && reviewedMs <= recordedAtMs
  if (!exactKeys(monitoring, MONITORING_KEYS) || monitoring.status !== 'attested' || !correctWindow || !counts || !binding || !accountability ||
    observation.minimumObservationHours !== ROLLOUT_PHASE5_MIN_OBSERVATION_HOURS || observation.minimumHealthyScopedSnapshots !== ROLLOUT_PHASE5_MIN_HEALTHY_SCOPED_SNAPSHOTS) {
    add(blockers, 'P5_SCOPED_WATCHDOG_OBSERVATION_INVALID', 'The exact Phase 4 cohort and activation plan need 144 continuous hours, at least seven healthy scoped watchdog snapshots, no warnings/criticals/blockers, and no cadence gap over 90 minutes.')
  }
  return { startMs, endMs }
}

function validateReconciliation(item, candidate, startMs, endMs, recordedAtMs, blockers) {
  const reconciliation = record(item)
  const ids = candidate.cohort?.organisationIds || []
  const reviewedMs = timeMs(reconciliation.reviewedAt)
  const zeroes = ['unresolvedGenerationFailures', 'staleSigningPackets', 'missingFinalArtifacts', 'f2Failures', 'f3Failures', 'f4Failures', 'finalResolverAccessFailures', 'blockerCount']
  if (!exactKeys(reconciliation, RECONCILIATION_KEYS) || reconciliation.status !== 'attested' || !sameJson(reconciliation.organisationIds, ids) ||
    reconciliation.cohortDigest !== candidate.cohort?.cohortDigest || reconciliation.activationPlanDigest !== candidate.source?.activationPlanDigest ||
    !sameJson(reconciliation.packetTypes, ['mandate', 'otp']) || zeroes.some((field) => reconciliation[field] !== 0) || !validDigest(reconciliation.evidenceDigest) || !text(reconciliation.reviewedBy) ||
    !Number.isFinite(reviewedMs) || reviewedMs < endMs || reviewedMs > recordedAtMs || startMs > endMs) {
    add(blockers, 'P5_RECONCILIATION_INVALID', 'The read-only reconciliation must bind the one release marker and show zero generation, signing, F2/F3/F4, resolver-access, and other blockers for mandate and OTP.')
  }
}

function validateRollbackReadiness(item, candidate, endMs, recordedAtMs, blockers) {
  const rollback = record(item)
  const ids = candidate.cohort?.organisationIds || []
  const checkedMs = timeMs(rollback.checkedAt)
  if (!exactKeys(rollback, ROLLBACK_KEYS) || rollback.status !== 'attested' || !sameJson(rollback.organisationIds, ids) ||
    rollback.activationPlanDigest !== candidate.source?.activationPlanDigest || rollback.pilotEnabled !== true || rollback.creationPaused !== true || rollback.scaleEnabled !== false ||
    !validDigest(rollback.rollbackPlanEvidenceDigest) || !validDigest(rollback.darkLaunchRestoreEvidenceDigest) || !validDigest(rollback.evidenceDigest) || !text(rollback.checkedBy) ||
    !Number.isFinite(checkedMs) || checkedMs < endMs || checkedMs > recordedAtMs) {
    add(blockers, 'P5_NO_SCALE_ROLLBACK_READINESS_INVALID', 'The active one-org pilot must remain creation-paused and no-scale with an attested dark-launch restore path; Phase 5 cannot authorize expansion.')
  }
}

function validateRecordedExecution(candidate, phase4, recordedAtMs, blockers) {
  const execution = record(candidate.execution)
  if (!exactKeys(execution, EXECUTION_KEYS) || !validDigest(execution.overallEvidenceDigest) || !validDigest(execution.evidencePacketDigest)) {
    add(blockers, 'P5_EXECUTION_SCHEMA_INVALID', 'Recorded observation needs lifecycle, scoped monitoring, reconciliation, no-scale rollback readiness, and both evidence digests.')
    return
  }
  const evidenceDigest = rolloutPhase5EvidencePacketDigest({
    lifecycleProofs: execution.lifecycleProofs,
    monitoring: execution.monitoring,
    reconciliation: execution.reconciliation,
    rollbackReadiness: execution.rollbackReadiness,
    overallEvidenceDigest: execution.overallEvidenceDigest,
    observationRecordedAt: candidate.evidence?.observationRecordedAt,
    observationRecordedBy: candidate.evidence?.observationRecordedBy,
    reviewedBy: candidate.evidence?.reviewedBy,
  })
  if (execution.evidencePacketDigest !== evidenceDigest) {
    add(blockers, 'P5_EVIDENCE_PACKET_DIGEST_INVALID', 'The redacted Phase 5 evidence self-digest does not match its lifecycle, monitoring, reconciliation, and accountable-recording content.')
  }
  const { startMs, endMs } = validateMonitoring(execution.monitoring, candidate, phase4, recordedAtMs, blockers)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return
  validateLifecycleProofs(execution.lifecycleProofs, candidate, startMs, endMs, blockers)
  validateReconciliation(execution.reconciliation, candidate, startMs, endMs, recordedAtMs, blockers)
  validateRollbackReadiness(execution.rollbackReadiness, candidate, endMs, recordedAtMs, blockers)
}

function validateParentBindings(candidate, phase0, phase1, phase2, phase3, phase4, phase4History, blockers) {
  const source = record(candidate.source)
  const environment = record(candidate.environment)
  const history = record(phase4History)
  const p4Source = record(phase4.source)
  const p4Cohort = record(phase4.cohort)
  const p4Activation = record(record(phase4.execution).activation)
  const p4Monitoring = record(record(phase4.execution).monitoring)
  const expectedIds = normalizedIds(p4Cohort.organisationIds)
  if (source.phase0ManifestDigest !== phase0.manifestDigest || source.phase1ReceiptManifestDigest !== phase1.manifestDigest ||
    source.phase2ReceiptManifestDigest !== phase2.manifestDigest || source.phase3ReceiptManifestDigest !== phase3.manifestDigest ||
    source.phase4ReceiptManifestDigest !== phase4.manifestDigest || source.commitSha !== p4Source.commitSha || source.packageLockSha256 !== p4Source.packageLockSha256 ||
    source.phase2ReceiptCommitSha !== p4Source.phase2ReceiptCommitSha || source.phase3ReceiptCommitSha !== p4Source.phase3ReceiptCommitSha ||
    source.phase4ReceiptCommitSha !== history.receiptCommitSha || source.activationPlanDigest !== p4Source.activationPlanDigest ||
    phase2.source?.phase1ReceiptManifestDigest !== phase1.manifestDigest || phase2.source?.commitSha !== source.commitSha ||
    phase2.source?.packageLockSha256 !== source.packageLockSha256 || phase3.source?.phase2ReceiptManifestDigest !== phase2.manifestDigest ||
    phase3.source?.phase2ReceiptCommitSha !== source.phase2ReceiptCommitSha || phase3.source?.commitSha !== source.commitSha) {
    add(blockers, 'P5_PARENT_OR_SOURCE_DRIFT', 'Phase 5 must bind the exact frozen Phase 0→4 source and receipt lineage, including the sealed Phase 4 activation marker.')
  }
  if (phase4.status !== 'pilot_activation_recorded' || phase4.manifestDigest !== rolloutPhase4ManifestDigest(phase4) ||
    history.receiptStatus !== 'pilot_activation_recorded' || history.receiptManifestDigest !== source.phase4ReceiptManifestDigest ||
    history.receiptCommitSha !== source.phase4ReceiptCommitSha || history.phase3ReceiptManifestDigest !== source.phase3ReceiptManifestDigest ||
    history.phase3ReceiptCommitSha !== source.phase3ReceiptCommitSha || history.sourceCommitSha !== source.commitSha ||
    history.activationPlanDigest !== source.activationPlanDigest || history.cohortDigest !== candidate.cohort?.cohortDigest ||
    !sameJson(history.organisationIds, candidate.cohort?.organisationIds) || history.runtimeGuardContract !== ROLLOUT_PHASE5_RUNTIME_GUARD_CONTRACT ||
    history.watchdogContract !== ROLLOUT_PHASE5_WATCHDOG_CONTRACT || p4Activation.activationPlanDigest !== source.activationPlanDigest ||
    p4Activation.runtimeGuardContract !== ROLLOUT_PHASE5_RUNTIME_GUARD_CONTRACT || p4Cohort.cohortDigest !== candidate.cohort?.cohortDigest ||
    !sameJson(expectedIds, candidate.cohort?.organisationIds) || p4Monitoring.watchdogContract !== ROLLOUT_PHASE5_WATCHDOG_CONTRACT) {
    add(blockers, 'P5_PHASE4_COMMITTED_HISTORY_INVALID', 'Phase 5 must bind the immutable committed Phase 4 receipt, one exact organisation/cohort, activation plan, runtime guard, and watchdog contract.')
  }
  if (environment.productionProjectRef !== phase0.productionProjectRef || environment.productionProjectRef !== phase1.environment?.productionProjectRef ||
    environment.productionProjectRef !== phase2.environment?.productionProjectRef || environment.productionProjectRef !== phase3.environment?.productionProjectRef ||
    environment.productionProjectRef !== phase4.environment?.productionProjectRef || environment.productionOrigin !== phase4.environment?.productionOrigin ||
    environment.productionUrl !== phase4.environment?.productionUrl) {
    add(blockers, 'P5_PARENT_ENVIRONMENT_DRIFT', 'Observation must use exactly the same production project, Supabase origin, and web origin as the committed Phase 4 pilot.')
  }
}

/**
 * Validates Phase 5 as a local immutable receipt. It neither calls Supabase
 * nor activates, changes, sends, downloads, or creates any customer data.
 */
export function assessLegalDocumentRolloutPhase5({
  receipt,
  phase0Freeze,
  phase0Report,
  phase1Receipt,
  phase1Report,
  phase2Receipt,
  phase2Report,
  phase3Receipt,
  phase3Report,
  phase4Receipt,
  phase4Report,
  phase4History,
  now = Date.now(),
} = {}) {
  const nowMs = typeof now === 'number' ? now : timeMs(now)
  const candidate = record(receipt)
  const environment = record(candidate.environment)
  const source = record(candidate.source)
  const cohort = record(candidate.cohort)
  const safety = record(candidate.safety)
  const observation = record(candidate.observation)
  const evidence = record(candidate.evidence)
  const phase0 = record(phase0Freeze)
  const phase1 = record(phase1Receipt)
  const phase2 = record(phase2Receipt)
  const phase3 = record(phase3Receipt)
  const phase4 = record(phase4Receipt)
  const phase0Evidence = record(record(phase0Report).evidence)
  const blockers = []

  if (!exactKeys(candidate, RECEIPT_KEYS)) add(blockers, 'P5_RECEIPT_SCHEMA_INVALID', 'The Phase 5 receipt contains missing or unknown top-level fields.')
  if (candidate.version !== 1 || candidate.phase !== 'ROLL_OUT_5' || candidate.contract !== ROLLOUT_PHASE5_CONTRACT) {
    add(blockers, 'P5_RECEIPT_CONTRACT_INVALID', 'The receipt must use the current Phase 5 pilot-observation contract.')
  }
  if (!['pending_observation', 'pilot_observation_recorded'].includes(candidate.status)) {
    add(blockers, 'P5_RECEIPT_STATUS_INVALID', 'The receipt status must be pending_observation or pilot_observation_recorded.')
  }
  if (!exactKeys(environment, ENVIRONMENT_KEYS) || !validProjectRef(environment.productionProjectRef) || environment.productionOrigin !== expectedOrigin(environment.productionProjectRef) || !validHttpsOrigin(environment.productionUrl)) {
    add(blockers, 'P5_ENVIRONMENT_BINDING_INVALID', 'The receipt must bind one exact production project, origin, and HTTPS web origin.')
  }
  if (!exactKeys(source, SOURCE_KEYS) || !validCommit(source.commitSha) || !validCommit(source.phase2ReceiptCommitSha) || !validCommit(source.phase3ReceiptCommitSha) || !validCommit(source.phase4ReceiptCommitSha) ||
    ['packageLockSha256', 'phase0ManifestDigest', 'phase1ReceiptManifestDigest', 'phase2ReceiptManifestDigest', 'phase3ReceiptManifestDigest', 'phase4ReceiptManifestDigest', 'activationPlanDigest', 'observationPlanDigest'].some((field) => !validDigest(source[field]))) {
    add(blockers, 'P5_SOURCE_SCHEMA_INVALID', 'The receipt must bind frozen source, committed Phase 2→4 lineage, sealed activation marker, and observation plan digest.')
  }
  const ids = normalizedIds(cohort.organisationIds)
  if (!exactKeys(cohort, COHORT_KEYS) || !sameJson(cohort.organisationIds, ids) || ids.length !== 1 || !validUuid(ids[0]) || cohort.maxOrganisations !== 1 ||
    cohort.cohortDigest !== cohortDigest(ids) || !sameJson(cohort.requiredPacketTypes, ['mandate', 'otp'])) {
    add(blockers, 'P5_COHORT_SCOPE_INVALID', 'Phase 5 permits exactly the one committed UUID organisation and mandate/OTP packet types only.')
  }
  if (!exactKeys(safety, SAFETY_KEYS) || safety.creationPaused !== true || safety.scaleEnabled !== false || safety.noScaleAuthorization !== true ||
    safety.rollbackToDarkLaunchRequired !== true || safety.customerDeliveryPolicy !== 'activated_cohort_and_release_marker_only' ||
    safety.runtimeGuardContract !== ROLLOUT_PHASE5_RUNTIME_GUARD_CONTRACT || safety.watchdogContract !== ROLLOUT_PHASE5_WATCHDOG_CONTRACT) {
    add(blockers, 'P5_SAFETY_SCOPE_INVALID', 'Phase 5 must remain a read-only, one-org, creation-paused, no-scale observation under the exact runtime guard and watchdog contracts.')
  }
  if (!exactKeys(observation, OBSERVATION_KEYS) || observation.minimumObservationHours !== ROLLOUT_PHASE5_MIN_OBSERVATION_HOURS ||
    observation.minimumHealthyScopedSnapshots !== ROLLOUT_PHASE5_MIN_HEALTHY_SCOPED_SNAPSHOTS || observation.maximumWarningSnapshots !== 0 ||
    observation.maximumCriticalSnapshots !== 0 || observation.maximumBlockers !== 0 || observation.maximumSnapshotGapMinutes !== ROLLOUT_PHASE5_MAX_SNAPSHOT_GAP_MINUTES) {
    add(blockers, 'P5_OBSERVATION_POLICY_INVALID', 'Phase 5 must require 144 hours, seven healthy scoped snapshots, zero warnings/criticals/blockers, and a 90-minute maximum watchdog gap.')
  }
  if (!exactKeys(evidence, EVIDENCE_KEYS) || !text(evidence.preparedBy) || !text(evidence.changeReference) || !validIsoTime(evidence.preparedAt, nowMs)) {
    add(blockers, 'P5_PREPARATION_ACCOUNTABILITY_MISSING', 'preparedBy, preparedAt, and changeReference are required.')
  }
  if (source.observationPlanDigest !== rolloutPhase5ObservationPlanDigest(candidate)) {
    add(blockers, 'P5_OBSERVATION_PLAN_DIGEST_INVALID', 'The observation plan digest must bind the immutable off-tree plan context.')
  }

  validateParentBindings(candidate, phase0, phase1, phase2, phase3, phase4, phase4History, blockers)
  const p5Recorded = candidate.status === 'pilot_observation_recorded'
  if (!p5Recorded) {
    if (record(phase0Report).status !== 'FROZEN') add(blockers, 'P5_PHASE0_NOT_FROZEN', 'A current clean Phase 0 FROZEN report is required before observation planning.')
    if (record(phase1Report).status !== 'STAGING_EVIDENCE_RECORDED') add(blockers, 'P5_PHASE1_NOT_RECORDED', 'Phase 1 must have current staging evidence before observation planning.')
    if (record(phase2Report).status !== 'STAGING_ACCEPTANCE_RECORDED') add(blockers, 'P5_PHASE2_NOT_ACCEPTED', 'Phase 2 must have current full-lifecycle acceptance before observation planning.')
    if (record(phase3Report).status !== 'PRODUCTION_PREFLIGHT_RECORDED') add(blockers, 'P5_PHASE3_NOT_PREFLIGHTED', 'Phase 3 must have a current production dark-launch preflight before observation planning.')
    if (record(phase4Report).status !== 'PILOT_ACTIVATION_RECORDED') add(blockers, 'P5_PHASE4_NOT_ACTIVATED', 'Phase 4 must have a recorded, committed one-organisation activation before Phase 5 observation.')
  }
  if (phase1.status !== 'staging_evidence_recorded' || phase2.status !== 'acceptance_evidence_recorded' || phase3.status !== 'production_preflight_recorded' || phase4.status !== 'pilot_activation_recorded') {
    add(blockers, 'P5_PARENT_RECEIPT_STATUS_INVALID', 'Phase 1 through Phase 4 parent receipts must be recorded.')
  }
  const phase1Count = phase0Evidence.phase1ReceiptChangeCount
  const phase2Count = phase0Evidence.phase2ReceiptChangeCount
  const phase3Count = phase0Evidence.phase3ReceiptChangeCount
  const phase4Count = phase0Evidence.phase4ReceiptChangeCount
  const phase5Count = phase0Evidence.phase5ReceiptChangeCount
  if (phase1Count !== 2 || phase2Count !== 1 || phase3Count !== 1 || phase4Count !== 1 || !Number.isInteger(phase5Count) || phase5Count < 0 || phase5Count > 1 ||
    (candidate.status === 'pending_observation' && phase5Count !== 0) || (candidate.status === 'pilot_observation_recorded' && phase5Count !== 1)) {
    add(blockers, 'P5_RECEIPT_HISTORY_INVALID', 'Phase 5 is planned off-tree and recorded once only after the immutable Phase 0→4 receipt chain.')
  }

  if (candidate.status === 'pending_observation') {
    if (!sameJson(candidate.execution, pendingExecutionShape()) || evidence.observationRecordedAt !== null || evidence.observationRecordedBy !== null || evidence.reviewedBy !== null) {
      add(blockers, 'P5_PENDING_STATE_INVALID', 'A pending observation receipt may not claim production lifecycle, monitoring, or reconciliation evidence.')
    }
    add(blockers, 'P5_PILOT_OBSERVATION_PENDING', 'The six-day read-only pilot observation and final acceptance evidence have not been recorded.', true)
  } else {
    const recordedAtMs = timeMs(evidence.observationRecordedAt)
    const preparedAtMs = timeMs(evidence.preparedAt)
    if (!text(evidence.observationRecordedBy) || !text(evidence.reviewedBy) || !validIsoTime(evidence.observationRecordedAt, nowMs) ||
      !Number.isFinite(recordedAtMs) || !Number.isFinite(preparedAtMs) || recordedAtMs < preparedAtMs) {
      add(blockers, 'P5_RECORDING_ACCOUNTABILITY_OR_TIME_INVALID', 'Recorded observation requires accountable review after the sealed plan was prepared.')
    } else {
      validateRecordedExecution(candidate, phase4, recordedAtMs, blockers)
    }
  }
  if (!validDigest(candidate.manifestDigest) || candidate.manifestDigest !== rolloutPhase5ManifestDigest(candidate)) {
    add(blockers, 'P5_RECEIPT_DIGEST_INVALID', 'The receipt digest does not match its contents.')
  }

  const hardBlockers = blockers.filter((blocker) => !blocker.pending)
  const status = hardBlockers.length ? 'HOLD' : candidate.status === 'pilot_observation_recorded' ? 'PILOT_OBSERVATION_RECORDED' : 'PILOT_OBSERVATION_PLANNED'
  return {
    phase: 'ROLL_OUT_5',
    contract: ROLLOUT_PHASE5_CONTRACT,
    scope: 'local_receipt_validation',
    status,
    blockerCount: hardBlockers.length,
    pendingCount: blockers.length - hardBlockers.length,
    blockers,
    evidence: {
      sourceCommitSha: text(source.commitSha) || null,
      phase4ReceiptManifestDigest: text(source.phase4ReceiptManifestDigest) || null,
      phase4ReceiptCommitSha: text(source.phase4ReceiptCommitSha) || null,
      activationPlanDigest: text(source.activationPlanDigest) || null,
      observationPlanDigest: text(source.observationPlanDigest) || null,
      productionProjectRef: text(environment.productionProjectRef) || null,
      cohortSize: ids.length,
      cohortDigest: text(cohort.cohortDigest) || null,
      receiptChangeCount: Number.isInteger(phase5Count) ? phase5Count : null,
    },
    doesNotVerify: [...ROLLOUT_PHASE5_DOES_NOT_VERIFY],
    doesNotAuthorize: [...ROLLOUT_PHASE5_DOES_NOT_AUTHORIZE],
    mutatedData: false,
  }
}

export function createPendingLegalDocumentRolloutPhase5Receipt({
  phase0Freeze,
  phase1Receipt,
  phase2Receipt,
  phase3Receipt,
  phase4Receipt,
  phase4History,
  preparedBy,
  changeReference,
  preparedAt = new Date().toISOString(),
} = {}) {
  const phase0 = record(phase0Freeze)
  const phase1 = record(phase1Receipt)
  const phase2 = record(phase2Receipt)
  const phase3 = record(phase3Receipt)
  const phase4 = record(phase4Receipt)
  const history = record(phase4History)
  const ids = normalizedIds(phase4.cohort?.organisationIds)
  const receipt = {
    version: 1,
    phase: 'ROLL_OUT_5',
    contract: ROLLOUT_PHASE5_CONTRACT,
    status: 'pending_observation',
    environment: {
      productionProjectRef: phase4.environment?.productionProjectRef ?? null,
      productionOrigin: phase4.environment?.productionOrigin ?? null,
      productionUrl: phase4.environment?.productionUrl ?? null,
    },
    source: {
      phase0ManifestDigest: phase0.manifestDigest ?? null,
      phase1ReceiptManifestDigest: phase1.manifestDigest ?? null,
      phase2ReceiptManifestDigest: phase2.manifestDigest ?? null,
      phase2ReceiptCommitSha: phase3.source?.phase2ReceiptCommitSha ?? null,
      phase3ReceiptManifestDigest: phase3.manifestDigest ?? null,
      phase3ReceiptCommitSha: phase4.source?.phase3ReceiptCommitSha ?? null,
      phase4ReceiptManifestDigest: phase4.manifestDigest ?? null,
      phase4ReceiptCommitSha: history.receiptCommitSha ?? null,
      commitSha: phase4.source?.commitSha ?? null,
      packageLockSha256: phase4.source?.packageLockSha256 ?? null,
      activationPlanDigest: phase4.source?.activationPlanDigest ?? null,
      observationPlanDigest: null,
    },
    cohort: {
      organisationIds: ids,
      cohortDigest: cohortDigest(ids),
      maxOrganisations: 1,
      requiredPacketTypes: ['mandate', 'otp'],
    },
    safety: {
      creationPaused: true,
      scaleEnabled: false,
      noScaleAuthorization: true,
      rollbackToDarkLaunchRequired: true,
      customerDeliveryPolicy: 'activated_cohort_and_release_marker_only',
      runtimeGuardContract: ROLLOUT_PHASE5_RUNTIME_GUARD_CONTRACT,
      watchdogContract: ROLLOUT_PHASE5_WATCHDOG_CONTRACT,
    },
    observation: {
      minimumObservationHours: ROLLOUT_PHASE5_MIN_OBSERVATION_HOURS,
      minimumHealthyScopedSnapshots: ROLLOUT_PHASE5_MIN_HEALTHY_SCOPED_SNAPSHOTS,
      maximumWarningSnapshots: 0,
      maximumCriticalSnapshots: 0,
      maximumBlockers: 0,
      maximumSnapshotGapMinutes: ROLLOUT_PHASE5_MAX_SNAPSHOT_GAP_MINUTES,
    },
    execution: pendingExecutionShape(),
    evidence: {
      preparedBy: preparedBy || null,
      preparedAt,
      observationRecordedBy: null,
      reviewedBy: null,
      observationRecordedAt: null,
      changeReference: changeReference || null,
    },
    manifestDigest: null,
  }
  receipt.source.observationPlanDigest = rolloutPhase5ObservationPlanDigest(receipt)
  receipt.manifestDigest = rolloutPhase5ManifestDigest(receipt)
  return stableValue(receipt)
}
