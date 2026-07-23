import { ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS } from './legal-document-rollout-phase1-policy.mjs'
import {
  sha256Digest,
  stableJson,
  stableValue,
} from './legal-document-rollout-phase1-artifacts.mjs'

export const ROLLOUT_PHASE4_CONTRACT = 'legal-document-production-pilot-v1'
export const ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT = 'legal-document-pilot-release-v1'
export const ROLLOUT_PHASE4_WATCHDOG_CONTRACT = 'phase5-f2-f3-f4-v2'
export const ROLLOUT_PHASE4_MAX_PARENT_AGE_MS = ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS
export const ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS = 30 * 60 * 1000

// This gate starts precisely one pilot organisation. It does not certify the
// customer lifecycle (that is Phase 5 observation) and it never expands the
// cohort, changes source/templates, or enables scale.
export const ROLLOUT_PHASE4_DOES_NOT_AUTHORIZE = Object.freeze([
  'cohort_expansion_or_scale',
  'template_source_migration_or_deployment_changes',
  'an_unbounded_customer_document_or_email_campaign',
  'post_activation_observation_or_scale_decision',
  'rollback_execution',
])

export const ROLLOUT_PHASE4_DOES_NOT_VERIFY = Object.freeze([
  'future_runtime_or_provider_drift',
  'a_completed_customer_mandate_or_otp_lifecycle',
  'phase5_observation_window_or_scale_slo',
  'unredacted_runtime_secrets_or_provider_logs',
])

const RECEIPT_KEYS = Object.freeze([
  'approval', 'cohort', 'contract', 'environment', 'evidence', 'execution', 'manifestDigest', 'phase', 'safety', 'source', 'status', 'version',
])
const ENVIRONMENT_KEYS = Object.freeze([
  'productionOrigin', 'productionProjectRef', 'productionUrl',
])
const SOURCE_KEYS = Object.freeze([
  'activationPlanDigest', 'commitSha', 'packageLockSha256', 'phase0ManifestDigest', 'phase1ReceiptManifestDigest', 'phase2ReceiptCommitSha', 'phase2ReceiptManifestDigest', 'phase3ReceiptCommitSha', 'phase3ReceiptManifestDigest', 'phase3DeploymentArtifactTreeSha256', 'phase3OverallEvidenceDigest',
])
const COHORT_KEYS = Object.freeze([
  'cohortDigest', 'maxOrganisations', 'organisationIds', 'requiredPacketTypes',
])
const SAFETY_KEYS = Object.freeze([
  'creationPaused', 'customerDeliveryPolicy', 'maxGenerationFailures24h', 'maxStaleSigningPackets', 'rollbackToDarkLaunchRequired', 'runtimeGuardContract', 'scaleEnabled',
])
const APPROVAL_KEYS = Object.freeze([
  'approvedAt', 'approvedBy', 'legalApprovalEvidenceDigest', 'releaseApprovalEvidenceDigest', 'reference',
])
const EVIDENCE_KEYS = Object.freeze([
  'activationRecordedAt', 'activationRecordedBy', 'changeReference', 'preparedAt', 'preparedBy', 'reviewedBy',
])
const EXECUTION_KEYS = Object.freeze([
  'activation', 'candidateReadiness', 'monitoring', 'overallEvidenceDigest', 'preActivation', 'rollbackReadiness',
])
const PRE_ACTIVATION_KEYS = Object.freeze([
  'checkedAt', 'checkedBy', 'evidenceDigest', 'organisationIdsSentinel', 'pilotEnabled', 'productionProjectRef', 'scaleEnabled', 'status',
])
const CANDIDATE_READINESS_KEYS = Object.freeze([
  'activeAgentCount', 'assessedAt', 'assessedBy', 'evidenceDigest', 'legalTemplateBindingDigest', 'organisationId', 'preferredAttorneyVerified', 'requiredPacketTypes', 'status', 'templateRouteSetDigest',
])
const ACTIVATION_KEYS = Object.freeze([
  'activatedAt', 'activatedBy', 'activationReference', 'activationPlanDigest', 'configurationEvidenceDigest', 'cohortDigest', 'evidenceDigest', 'organisationIds', 'pilotEnabled', 'productionProjectRef', 'routeCoverageEvidenceDigest', 'runtimeGuardContract', 'status', 'verificationEvidenceDigest',
])
const MONITORING_KEYS = Object.freeze([
  'blockerCount', 'checkedAt', 'checkedBy', 'cohortDigest', 'evidenceDigest', 'probeEvidenceDigest', 'schedulerEvidenceDigest', 'scopeMode', 'snapshotStatus', 'status', 'watchdogContract',
])
const ROLLBACK_KEYS = Object.freeze([
  'checkedAt', 'checkedBy', 'darkLaunchRestoreEvidenceDigest', 'dryRunEvidenceDigest', 'evidenceDigest', 'productionProjectRef', 'rollbackOwner', 'rollbackPlanEvidenceDigest', 'status',
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

function withinWindow(value, lowerBoundMs, upperBoundMs, windowMs = ROLLOUT_PHASE4_MAX_PARENT_AGE_MS) {
  const observed = timeMs(value)
  return Number.isFinite(observed) && Number.isFinite(lowerBoundMs) && Number.isFinite(upperBoundMs) &&
    observed >= lowerBoundMs && observed <= upperBoundMs && observed - lowerBoundMs <= windowMs
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
    preActivation: {
      status: 'not_run',
      productionProjectRef: null,
      pilotEnabled: false,
      organisationIdsSentinel: '__none__',
      scaleEnabled: false,
      evidenceDigest: null,
      checkedAt: null,
      checkedBy: null,
    },
    candidateReadiness: {
      status: 'not_run',
      organisationId: null,
      activeAgentCount: null,
      requiredPacketTypes: [],
      preferredAttorneyVerified: null,
      templateRouteSetDigest: null,
      legalTemplateBindingDigest: null,
      evidenceDigest: null,
      assessedAt: null,
      assessedBy: null,
    },
    activation: {
      status: 'not_run',
      productionProjectRef: null,
      organisationIds: [],
      cohortDigest: null,
      pilotEnabled: false,
      activationPlanDigest: null,
      runtimeGuardContract: null,
      activatedAt: null,
      activatedBy: null,
      activationReference: null,
      configurationEvidenceDigest: null,
      verificationEvidenceDigest: null,
      routeCoverageEvidenceDigest: null,
      evidenceDigest: null,
    },
    monitoring: {
      status: 'not_run',
      watchdogContract: null,
      scopeMode: null,
      cohortDigest: null,
      snapshotStatus: null,
      blockerCount: null,
      schedulerEvidenceDigest: null,
      probeEvidenceDigest: null,
      evidenceDigest: null,
      checkedAt: null,
      checkedBy: null,
    },
    rollbackReadiness: {
      status: 'not_run',
      productionProjectRef: null,
      rollbackOwner: null,
      rollbackPlanEvidenceDigest: null,
      darkLaunchRestoreEvidenceDigest: null,
      dryRunEvidenceDigest: null,
      evidenceDigest: null,
      checkedAt: null,
      checkedBy: null,
    },
    overallEvidenceDigest: null,
  }
}

function pendingEvidenceProjection(evidence) {
  return {
    preparedBy: evidence.preparedBy ?? null,
    preparedAt: evidence.preparedAt ?? null,
    changeReference: evidence.changeReference ?? null,
  }
}

// A plan digest is set before remote activation. It intentionally excludes
// execution evidence and the self-referential receipt digest, so it can be
// written to the remote runtime as the activated release binding.
export function rolloutPhase4ActivationPlanDigest(receipt) {
  const candidate = record(receipt)
  const source = { ...record(candidate.source) }
  delete source.activationPlanDigest
  return sha256Digest(stableJson({
    version: candidate.version,
    phase: candidate.phase,
    contract: candidate.contract,
    environment: candidate.environment,
    source,
    cohort: candidate.cohort,
    safety: candidate.safety,
    approval: candidate.approval,
    evidence: pendingEvidenceProjection(record(candidate.evidence)),
  }))
}

export function rolloutPhase4ManifestDigest(receipt) {
  const canonical = { ...record(receipt) }
  delete canonical.manifestDigest
  return sha256Digest(stableJson(canonical))
}

function validatePreActivation(item, candidate, preparedAtMs, activationAtMs, blockers) {
  if (!exactKeys(item, PRE_ACTIVATION_KEYS) || item.status !== 'attested' || item.productionProjectRef !== candidate.environment?.productionProjectRef ||
    item.pilotEnabled !== false || item.organisationIdsSentinel !== '__none__' || item.scaleEnabled !== false || !validDigest(item.evidenceDigest) || !text(item.checkedBy) ||
    !withinWindow(item.checkedAt, preparedAtMs, activationAtMs, ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS)) {
    add(blockers, 'P4_PRE_ACTIVATION_DARK_LAUNCH_INVALID', 'Pre-activation evidence must prove the exact production runtime was disabled with no allowlist or scale immediately before activation.')
  }
}

function validateCandidateReadiness(item, candidate, preparedAtMs, activationAtMs, blockers) {
  const ids = candidate.cohort?.organisationIds || []
  if (!exactKeys(item, CANDIDATE_READINESS_KEYS) || item.status !== 'attested' || item.organisationId !== ids[0] || !Number.isInteger(item.activeAgentCount) || item.activeAgentCount < 1 ||
    item.preferredAttorneyVerified !== true || !sameJson(item.requiredPacketTypes, ['mandate', 'otp']) || !validDigest(item.templateRouteSetDigest) || !validDigest(item.legalTemplateBindingDigest) ||
    !validDigest(item.evidenceDigest) || !text(item.assessedBy) || !withinWindow(item.assessedAt, preparedAtMs, activationAtMs, ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS)) {
    add(blockers, 'P4_CANDIDATE_READINESS_INVALID', 'The one pilot organisation must be actively staffed and have legally bound mandate/OTP routes plus a preferred attorney immediately before activation.')
  }
}

function validateActivation(item, candidate, preparedAtMs, recordedAtMs, blockers) {
  const ids = candidate.cohort?.organisationIds || []
  if (!exactKeys(item, ACTIVATION_KEYS) || item.status !== 'attested' || item.productionProjectRef !== candidate.environment?.productionProjectRef ||
    item.pilotEnabled !== true || !sameJson(item.organisationIds, ids) || item.cohortDigest !== candidate.cohort?.cohortDigest || item.activationPlanDigest !== candidate.source?.activationPlanDigest ||
    item.runtimeGuardContract !== ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT || !text(item.activatedBy) || !text(item.activationReference) ||
    ['configurationEvidenceDigest', 'verificationEvidenceDigest', 'routeCoverageEvidenceDigest', 'evidenceDigest'].some((field) => !validDigest(item[field])) ||
    !withinWindow(item.activatedAt, preparedAtMs, recordedAtMs, ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS)) {
    add(blockers, 'P4_RUNTIME_ACTIVATION_INVALID', 'Activation must bind one exact production organisation, the sealed plan digest, server runtime guard, accountable operator, and post-write verification.')
  }
}

function validateMonitoring(item, candidate, activationAtMs, recordedAtMs, blockers) {
  if (!exactKeys(item, MONITORING_KEYS) || item.status !== 'armed' || item.watchdogContract !== ROLLOUT_PHASE4_WATCHDOG_CONTRACT ||
    item.scopeMode !== 'configured_organisations' || item.cohortDigest !== candidate.cohort?.cohortDigest || !['healthy', 'warning_empty'].includes(item.snapshotStatus) ||
    item.blockerCount !== 0 || ['schedulerEvidenceDigest', 'probeEvidenceDigest', 'evidenceDigest'].some((field) => !validDigest(item[field])) ||
    !text(item.checkedBy) || !withinWindow(item.checkedAt, activationAtMs, recordedAtMs, ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS)) {
    add(blockers, 'P4_MONITORING_ARMING_INVALID', 'The scoped production watchdog must be armed with no blockers before the pilot can continue to observation.')
  }
}

function validateRollback(item, candidate, preparedAtMs, activationAtMs, blockers) {
  if (!exactKeys(item, ROLLBACK_KEYS) || item.status !== 'attested' || item.productionProjectRef !== candidate.environment?.productionProjectRef ||
    !text(item.rollbackOwner) || !text(item.checkedBy) || ['rollbackPlanEvidenceDigest', 'darkLaunchRestoreEvidenceDigest', 'dryRunEvidenceDigest', 'evidenceDigest'].some((field) => !validDigest(item[field])) ||
    !withinWindow(item.checkedAt, preparedAtMs, activationAtMs, ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS)) {
    add(blockers, 'P4_ROLLBACK_READINESS_INVALID', 'The exact production dark-launch restore path must be owned and dry-run before pilot activation.')
  }
}

function validateRecordedExecution(candidate, preparedAtMs, recordedAtMs, blockers) {
  const execution = record(candidate.execution)
  if (!exactKeys(execution, EXECUTION_KEYS) || !validDigest(execution.overallEvidenceDigest)) {
    add(blockers, 'P4_EXECUTION_SCHEMA_INVALID', 'Recorded pilot activation needs exact pre-state, cohort, activation, monitoring, rollback, and overall evidence.')
    return
  }
  const activationAtMs = timeMs(execution.activation?.activatedAt)
  if (!Number.isFinite(activationAtMs)) {
    add(blockers, 'P4_ACTIVATION_TIME_INVALID', 'A valid activation timestamp is required.')
    return
  }
  validatePreActivation(record(execution.preActivation), candidate, preparedAtMs, activationAtMs, blockers)
  validateCandidateReadiness(record(execution.candidateReadiness), candidate, preparedAtMs, activationAtMs, blockers)
  validateRollback(record(execution.rollbackReadiness), candidate, preparedAtMs, activationAtMs, blockers)
  validateActivation(record(execution.activation), candidate, preparedAtMs, recordedAtMs, blockers)
  validateMonitoring(record(execution.monitoring), candidate, activationAtMs, recordedAtMs, blockers)
}

function validateParentBindings(candidate, phase0, phase1, phase2, phase3, phase3History, blockers) {
  const source = record(candidate.source)
  const environment = record(candidate.environment)
  const history = record(phase3History)
  if (source.phase0ManifestDigest !== phase0.manifestDigest || source.phase1ReceiptManifestDigest !== phase1.manifestDigest || source.phase2ReceiptManifestDigest !== phase2.manifestDigest ||
    source.phase3ReceiptManifestDigest !== phase3.manifestDigest || source.commitSha !== phase1.source?.commitSha || source.packageLockSha256 !== phase1.source?.packageLockSha256 ||
    source.phase2ReceiptCommitSha !== phase3.source?.phase2ReceiptCommitSha || source.phase3ReceiptCommitSha !== history.receiptCommitSha ||
    source.phase3DeploymentArtifactTreeSha256 !== phase3.execution?.productionDeployment?.artifactTreeSha256 || source.phase3OverallEvidenceDigest !== phase3.execution?.overallEvidenceDigest ||
    phase2.source?.phase1ReceiptManifestDigest !== phase1.manifestDigest || phase2.source?.commitSha !== source.commitSha || phase2.source?.packageLockSha256 !== source.packageLockSha256 ||
    phase3.source?.phase2ReceiptManifestDigest !== phase2.manifestDigest || phase3.source?.phase2ReceiptCommitSha !== source.phase2ReceiptCommitSha || phase3.source?.commitSha !== source.commitSha) {
    add(blockers, 'P4_PARENT_OR_SOURCE_DRIFT', 'Pilot activation must bind the exact frozen source and complete Phase 0→3 receipt lineage.')
  }
  if (history.receiptStatus !== 'production_preflight_recorded' || history.receiptManifestDigest !== source.phase3ReceiptManifestDigest ||
    history.receiptCommitSha !== source.phase3ReceiptCommitSha || history.phase2ReceiptManifestDigest !== source.phase2ReceiptManifestDigest ||
    history.phase2ReceiptCommitSha !== source.phase2ReceiptCommitSha || history.sourceCommitSha !== source.commitSha) {
    add(blockers, 'P4_PHASE3_COMMITTED_HISTORY_INVALID', 'Phase 4 must bind the committed Phase 3 dark-launch receipt, never a mutable working-tree copy.')
  }
  if (environment.productionProjectRef !== phase0.productionProjectRef || environment.productionProjectRef !== phase1.environment?.productionProjectRef ||
    environment.productionProjectRef !== phase2.environment?.productionProjectRef || environment.productionProjectRef !== phase3.environment?.productionProjectRef ||
    environment.productionOrigin !== phase3.environment?.productionOrigin || environment.productionUrl !== phase3.environment?.productionUrl) {
    add(blockers, 'P4_PARENT_ENVIRONMENT_DRIFT', 'Pilot activation must use the exact production project, origin, and web origin accepted by the preflight.')
  }
}

/**
 * Validates a local immutable receipt around a separately authorised remote
 * activation. It neither calls a provider nor changes the pilot runtime.
 */
export function assessLegalDocumentRolloutPhase4({
  receipt,
  phase0Freeze,
  phase0Report,
  phase1Receipt,
  phase1Report,
  phase2Receipt,
  phase2Report,
  phase3Receipt,
  phase3Report,
  phase3History,
  now = Date.now(),
} = {}) {
  const nowMs = typeof now === 'number' ? now : timeMs(now)
  const candidate = record(receipt)
  const environment = record(candidate.environment)
  const source = record(candidate.source)
  const cohort = record(candidate.cohort)
  const safety = record(candidate.safety)
  const approval = record(candidate.approval)
  const evidence = record(candidate.evidence)
  const phase0 = record(phase0Freeze)
  const phase1 = record(phase1Receipt)
  const phase2 = record(phase2Receipt)
  const phase3 = record(phase3Receipt)
  const phase0Evidence = record(record(phase0Report).evidence)
  const blockers = []

  if (!exactKeys(candidate, RECEIPT_KEYS)) add(blockers, 'P4_RECEIPT_SCHEMA_INVALID', 'The Phase 4 receipt contains missing or unknown top-level fields.')
  if (candidate.version !== 1 || candidate.phase !== 'ROLL_OUT_4' || candidate.contract !== ROLLOUT_PHASE4_CONTRACT) {
    add(blockers, 'P4_RECEIPT_CONTRACT_INVALID', 'The receipt must use the current Phase 4 controlled-pilot contract.')
  }
  if (!['pending_activation', 'pilot_activation_recorded'].includes(candidate.status)) {
    add(blockers, 'P4_RECEIPT_STATUS_INVALID', 'The receipt status must be pending_activation or pilot_activation_recorded.')
  }
  if (!exactKeys(environment, ENVIRONMENT_KEYS) || !validProjectRef(environment.productionProjectRef) || environment.productionOrigin !== expectedOrigin(environment.productionProjectRef) || !validHttpsOrigin(environment.productionUrl)) {
    add(blockers, 'P4_ENVIRONMENT_BINDING_INVALID', 'The receipt must bind one exact production project, origin, and HTTPS web origin.')
  }
  if (!exactKeys(source, SOURCE_KEYS) || !validCommit(source.commitSha) || !validDigest(source.packageLockSha256) ||
    ['phase0ManifestDigest', 'phase1ReceiptManifestDigest', 'phase2ReceiptManifestDigest', 'phase3ReceiptManifestDigest', 'phase3DeploymentArtifactTreeSha256', 'phase3OverallEvidenceDigest', 'activationPlanDigest'].some((field) => !validDigest(source[field])) ||
    !validCommit(source.phase2ReceiptCommitSha) || !validCommit(source.phase3ReceiptCommitSha)) {
    add(blockers, 'P4_SOURCE_SCHEMA_INVALID', 'The receipt must bind the frozen source, committed Phase 2/3 lineage, preflight artifacts, and sealed activation plan digest.')
  }
  const ids = normalizedIds(cohort.organisationIds)
  if (!exactKeys(cohort, COHORT_KEYS) || !sameJson(cohort.organisationIds, ids) || ids.length !== 1 || !validUuid(ids[0]) || cohort.maxOrganisations !== 1 ||
    cohort.cohortDigest !== cohortDigest(ids) || !sameJson(cohort.requiredPacketTypes, ['mandate', 'otp'])) {
    add(blockers, 'P4_COHORT_SCOPE_INVALID', 'Phase 4 permits exactly one UUID organisation with the mandate and OTP routes only.')
  }
  if (!exactKeys(safety, SAFETY_KEYS) || safety.creationPaused !== true || safety.scaleEnabled !== false ||
    safety.maxGenerationFailures24h !== 0 || safety.maxStaleSigningPackets !== 0 || safety.rollbackToDarkLaunchRequired !== true ||
    safety.customerDeliveryPolicy !== 'activated_cohort_and_release_marker_only' || safety.runtimeGuardContract !== ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT) {
    add(blockers, 'P4_SAFETY_SCOPE_INVALID', 'Phase 4 must remain a one-org, zero-failure, no-scale pilot with a server-owned outbound release guard and dark-launch rollback.')
  }
  if (!exactKeys(approval, APPROVAL_KEYS) || !text(approval.approvedBy) || !text(approval.reference) || !validDigest(approval.legalApprovalEvidenceDigest) || !validDigest(approval.releaseApprovalEvidenceDigest) || !validIsoTime(approval.approvedAt, nowMs)) {
    add(blockers, 'P4_APPROVAL_INVALID', 'An accountable current legal and release approval is required for the exact pilot plan.')
  }
  if (!exactKeys(evidence, EVIDENCE_KEYS) || !text(evidence.preparedBy) || !text(evidence.changeReference) || !validIsoTime(evidence.preparedAt, nowMs)) {
    add(blockers, 'P4_PREPARATION_ACCOUNTABILITY_MISSING', 'preparedBy, preparedAt, and changeReference are required.')
  }
  const approvalAtMs = timeMs(approval.approvedAt)
  const preparedAtMs = timeMs(evidence.preparedAt)
  if (!Number.isFinite(approvalAtMs) || !Number.isFinite(preparedAtMs) || approvalAtMs > preparedAtMs) {
    add(blockers, 'P4_APPROVAL_ORDER_INVALID', 'Legal and release approval must precede or equal sealed plan preparation.')
  }
  if (source.activationPlanDigest !== rolloutPhase4ActivationPlanDigest(candidate)) {
    add(blockers, 'P4_ACTIVATION_PLAN_DIGEST_INVALID', 'The activation plan digest must bind the immutable off-tree plan context.')
  }

  validateParentBindings(candidate, phase0, phase1, phase2, phase3, phase3History, blockers)
  const p4Recorded = candidate.status === 'pilot_activation_recorded'
  if (!p4Recorded) {
    if (record(phase0Report).status !== 'FROZEN') add(blockers, 'P4_PHASE0_NOT_FROZEN', 'A current clean Phase 0 FROZEN report is required before activation planning.')
    if (record(phase1Report).status !== 'STAGING_EVIDENCE_RECORDED') add(blockers, 'P4_PHASE1_NOT_RECORDED', 'Phase 1 must have current staging evidence before activation planning.')
    if (record(phase2Report).status !== 'STAGING_ACCEPTANCE_RECORDED') add(blockers, 'P4_PHASE2_NOT_ACCEPTED', 'Phase 2 must have current full-lifecycle acceptance before activation planning.')
    if (record(phase3Report).status !== 'PRODUCTION_PREFLIGHT_RECORDED') add(blockers, 'P4_PHASE3_NOT_PREFLIGHTED', 'Phase 3 must have a current production dark-launch preflight before activation planning.')
  }
  if (phase1.status !== 'staging_evidence_recorded' || phase2.status !== 'acceptance_evidence_recorded' || phase3.status !== 'production_preflight_recorded') {
    add(blockers, 'P4_PARENT_RECEIPT_STATUS_INVALID', 'Phase 1, Phase 2, and Phase 3 parent receipts must be recorded.')
  }

  const phase3RecordedAtMs = timeMs(phase3.evidence?.preflightRecordedAt)
  if (!Number.isFinite(phase3RecordedAtMs) || !Number.isFinite(preparedAtMs) || preparedAtMs < phase3RecordedAtMs || preparedAtMs - phase3RecordedAtMs > ROLLOUT_PHASE4_MAX_PARENT_AGE_MS) {
    add(blockers, 'P4_PHASE3_EVIDENCE_STALE_OR_ORDER_INVALID', 'The activation plan must be prepared after, and within 24 hours of, the committed Phase 3 preflight.')
  }
  const phase1Count = phase0Evidence.phase1ReceiptChangeCount
  const phase2Count = phase0Evidence.phase2ReceiptChangeCount
  const phase3Count = phase0Evidence.phase3ReceiptChangeCount
  const phase4Count = phase0Evidence.phase4ReceiptChangeCount
  if (phase1Count !== 2 || phase2Count !== 1 || phase3Count !== 1 || !Number.isInteger(phase4Count) || phase4Count < 0 || phase4Count > 1 ||
    (candidate.status === 'pending_activation' && phase4Count !== 0) || (candidate.status === 'pilot_activation_recorded' && phase4Count !== 1)) {
    add(blockers, 'P4_RECEIPT_HISTORY_INVALID', 'Phase 4 is planned off-tree and recorded once only after the immutable Phase 0→3 receipt chain.')
  }

  if (candidate.status === 'pending_activation') {
    if (!Number.isFinite(nowMs) || !Number.isFinite(preparedAtMs) || nowMs < preparedAtMs - 5 * 60_000 || nowMs - preparedAtMs > ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS) {
      add(blockers, 'P4_SEALED_ACTIVATION_WINDOW_EXPIRED', 'A pending Phase 4 plan expires after 30 minutes; prepare a new plan before any runtime activation.')
    }
    if (!sameJson(candidate.execution, pendingExecutionShape()) || evidence.activationRecordedAt !== null || evidence.activationRecordedBy !== null || evidence.reviewedBy !== null) {
      add(blockers, 'P4_PENDING_STATE_INVALID', 'A pending activation receipt may not claim remote runtime, monitoring, or rollback evidence.')
    }
    add(blockers, 'P4_PILOT_ACTIVATION_PENDING', 'The separately authorised production activation and post-write observations have not been recorded.', true)
  } else {
    const recordedAtMs = timeMs(evidence.activationRecordedAt)
    if (!text(evidence.activationRecordedBy) || !text(evidence.reviewedBy) || !validIsoTime(evidence.activationRecordedAt, nowMs) || !Number.isFinite(recordedAtMs) || !Number.isFinite(preparedAtMs) || recordedAtMs < preparedAtMs) {
      add(blockers, 'P4_RECORDING_ACCOUNTABILITY_OR_TIME_INVALID', 'Recorded activation requires accountable review after the sealed plan was prepared.')
    }
    validateRecordedExecution(candidate, preparedAtMs, recordedAtMs, blockers)
  }
  if (!validDigest(candidate.manifestDigest) || candidate.manifestDigest !== rolloutPhase4ManifestDigest(candidate)) {
    add(blockers, 'P4_RECEIPT_DIGEST_INVALID', 'The receipt digest does not match its contents.')
  }

  const hardBlockers = blockers.filter((blocker) => !blocker.pending)
  const status = hardBlockers.length ? 'HOLD' : candidate.status === 'pilot_activation_recorded' ? 'PILOT_ACTIVATION_RECORDED' : 'PILOT_ACTIVATION_PLANNED'
  return {
    phase: 'ROLL_OUT_4',
    contract: ROLLOUT_PHASE4_CONTRACT,
    scope: 'local_receipt_validation',
    status,
    blockerCount: hardBlockers.length,
    pendingCount: blockers.length - hardBlockers.length,
    blockers,
    evidence: {
      sourceCommitSha: text(source.commitSha) || null,
      phase3ReceiptManifestDigest: text(source.phase3ReceiptManifestDigest) || null,
      phase3ReceiptCommitSha: text(source.phase3ReceiptCommitSha) || null,
      activationPlanDigest: text(source.activationPlanDigest) || null,
      productionProjectRef: text(environment.productionProjectRef) || null,
      cohortSize: ids.length,
      cohortDigest: text(cohort.cohortDigest) || null,
      receiptChangeCount: Number.isInteger(phase4Count) ? phase4Count : null,
    },
    doesNotVerify: [...ROLLOUT_PHASE4_DOES_NOT_VERIFY],
    doesNotAuthorize: [...ROLLOUT_PHASE4_DOES_NOT_AUTHORIZE],
    mutatedData: false,
  }
}

export function createPendingLegalDocumentRolloutPhase4Receipt({
  phase0Freeze,
  phase1Receipt,
  phase2Receipt,
  phase3Receipt,
  phase3History,
  organisationId,
  productionProjectRef,
  productionOrigin,
  productionUrl,
  preparedBy,
  changeReference,
  approvedBy,
  approvedAt,
  approvalReference,
  legalApprovalEvidenceDigest,
  releaseApprovalEvidenceDigest,
  preparedAt = new Date().toISOString(),
} = {}) {
  const phase0 = record(phase0Freeze)
  const phase1 = record(phase1Receipt)
  const phase2 = record(phase2Receipt)
  const phase3 = record(phase3Receipt)
  const history = record(phase3History)
  const ids = normalizedIds([organisationId])
  const receipt = {
    version: 1,
    phase: 'ROLL_OUT_4',
    contract: ROLLOUT_PHASE4_CONTRACT,
    status: 'pending_activation',
    environment: {
      productionProjectRef: productionProjectRef || null,
      productionOrigin: productionOrigin || null,
      productionUrl: productionUrl || null,
    },
    source: {
      phase0ManifestDigest: phase0.manifestDigest ?? null,
      phase1ReceiptManifestDigest: phase1.manifestDigest ?? null,
      phase2ReceiptManifestDigest: phase2.manifestDigest ?? null,
      phase2ReceiptCommitSha: phase3.source?.phase2ReceiptCommitSha ?? null,
      phase3ReceiptManifestDigest: phase3.manifestDigest ?? null,
      phase3ReceiptCommitSha: history.receiptCommitSha ?? null,
      commitSha: phase3.source?.commitSha ?? null,
      packageLockSha256: phase3.source?.packageLockSha256 ?? null,
      phase3DeploymentArtifactTreeSha256: phase3.execution?.productionDeployment?.artifactTreeSha256 ?? null,
      phase3OverallEvidenceDigest: phase3.execution?.overallEvidenceDigest ?? null,
      activationPlanDigest: null,
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
      maxGenerationFailures24h: 0,
      maxStaleSigningPackets: 0,
      rollbackToDarkLaunchRequired: true,
      customerDeliveryPolicy: 'activated_cohort_and_release_marker_only',
      runtimeGuardContract: ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT,
    },
    approval: {
      approvedBy: approvedBy || null,
      approvedAt: approvedAt || null,
      reference: approvalReference || null,
      legalApprovalEvidenceDigest: legalApprovalEvidenceDigest || null,
      releaseApprovalEvidenceDigest: releaseApprovalEvidenceDigest || null,
    },
    execution: pendingExecutionShape(),
    evidence: {
      preparedBy: preparedBy || null,
      preparedAt,
      activationRecordedBy: null,
      reviewedBy: null,
      activationRecordedAt: null,
      changeReference: changeReference || null,
    },
    manifestDigest: null,
  }
  receipt.source.activationPlanDigest = rolloutPhase4ActivationPlanDigest(receipt)
  receipt.manifestDigest = rolloutPhase4ManifestDigest(receipt)
  return stableValue(receipt)
}
