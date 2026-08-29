import { canonicalizeBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'
import {
  BOND_ORIGINATOR_FUNCTIONAL_CONTRACT_VERSION,
  buildBondOriginatorAcceptanceScenarioMatrix,
} from './bondOriginatorFunctionalContract.js'
import { BOND_APPLICATION_INTERPRETER_VERSION } from '../interpretation/bondApplicationInterpreter.js'
import { BOND_ORIGINATOR_REQUIREMENT_PROFILE_ENGINE_VERSION } from '../originatorRequirements/bondOriginatorRequirementProfiles.js'
import { BOND_APPLICATION_DOCUMENT_RECONCILIATION_VERSION } from '../documents/reconcileBondApplicationDocumentRequirements.js'
import { BOND_APPLICATION_PARTICIPANT_ENTITY_COMPLETENESS_VERSION } from '../participants/bondApplicationParticipantEntityCompleteness.js'
import { BOND_APPLICATION_ORIGINATOR_PACK_VERSION } from '../exports/bondApplicationOriginatorPack.js'
import { CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION } from '../../integrations/handoff/controlledBondOriginatorHandoff.js'
import { BOND_ORIGINATOR_MULTI_PROFILE_ACCEPTANCE_VERSION } from './bondOriginatorMultiProfileAcceptance.js'

export const BOND_ORIGINATOR_PRODUCTION_PROMOTION_VERSION = 'phase-7-v1'
export const BOND_ORIGINATOR_PROMOTION_MAX_EVIDENCE_AGE_HOURS = 24

function text(value) {
  return String(value || '').trim()
}

function hoursBetween(later, earlier) {
  const end = new Date(later).getTime()
  const start = new Date(earlier).getTime()
  if (!Number.isFinite(end) || !Number.isFinite(start)) return Number.POSITIVE_INFINITY
  return Math.max(0, (end - start) / 3_600_000)
}

function check(key, passed, message, evidence = {}) {
  return { key, passed: passed === true, status: passed === true ? 'pass' : 'fail', message, evidence }
}

function scenarioEvidence(results = []) {
  const expected = buildBondOriginatorAcceptanceScenarioMatrix()
  const byKey = new Map()
  const duplicates = new Set()
  ;(Array.isArray(results) ? results : []).forEach((result) => {
    if (byKey.has(result?.key)) duplicates.add(result.key)
    byKey.set(result?.key, result)
  })
  const missing = expected.filter((scenario) => !byKey.has(scenario.key)).map((scenario) => scenario.key)
  const failed = expected.filter((scenario) => byKey.has(scenario.key) && byKey.get(scenario.key)?.passed !== true).map((scenario) => scenario.key)
  const unknown = Array.from(byKey.keys()).filter((key) => !expected.some((scenario) => scenario.key === key))
  return { expectedCount: expected.length, receivedCount: byKey.size, missing, failed, unknown, duplicates: Array.from(duplicates) }
}

export function buildBondOriginatorProductionPromotionArtifact({
  generatedAt = new Date().toISOString(),
  environment = '',
  build = {},
  scenarioResults = [],
  interpretation = {},
  requirementProfile = {},
  documentReconciliation = {},
  participantEntityCompleteness = {},
  packManifest = {},
  handoffPackage = {},
  multiProfileAcceptance = {},
  evidence = {},
  operationalControls = {},
  mutatedProduction = false,
} = {}) {
  const scenarios = scenarioEvidence(scenarioResults)
  const evidenceAgeHours = hoursBetween(generatedAt, evidence.observedAt)
  const activeHandoffCount = Number(evidence.activeHandoffCount ?? 0)
  const checks = [
    check('target_environment_explicit', ['staging', 'production'].includes(text(environment).toLowerCase()), 'Name staging or production as the promotion target.', { environment }),
    check('build_identity_locked', Boolean(text(build.commitSha) && text(build.artifactId)), 'Bind the exact source commit and deploy artifact.', { commitSha: build.commitSha || null, artifactId: build.artifactId || null }),
    check('functional_contract_version', evidence.functionalContractVersion === BOND_ORIGINATOR_FUNCTIONAL_CONTRACT_VERSION, 'Use the locked Phase 0 functional contract.', { expected: BOND_ORIGINATOR_FUNCTIONAL_CONTRACT_VERSION, actual: evidence.functionalContractVersion || null }),
    check('acceptance_matrix_complete', scenarios.missing.length === 0 && scenarios.failed.length === 0 && scenarios.unknown.length === 0 && scenarios.duplicates.length === 0, 'All supported SA baseline scenarios must pass exactly once.', scenarios),
    check('canonical_interpretation_trusted', interpretation.version === BOND_APPLICATION_INTERPRETER_VERSION && interpretation.trusted === true && !(interpretation.blockingIssues || []).length, 'Canonical interpretation must be trusted and blocker-free.', { version: interpretation.version || null, blockingIssueCount: interpretation.blockingIssues?.length || 0 }),
    check('requirement_profile_trusted', requirementProfile.engineVersion === BOND_ORIGINATOR_REQUIREMENT_PROFILE_ENGINE_VERSION && requirementProfile.trusted === true && Boolean(text(requirementProfile.fingerprint)), 'The assigned originator requirement profile must be trusted and fingerprinted.', { engineVersion: requirementProfile.engineVersion || null, profileKey: requirementProfile.profile?.key || requirementProfile.identity?.key || null }),
    check('document_reconciliation_clean', documentReconciliation.reconciliationVersion === BOND_APPLICATION_DOCUMENT_RECONCILIATION_VERSION && !(documentReconciliation.diagnostics || []).some((item) => item.code === 'duplicate_active_requirement_identity'), 'Document reconciliation must have no duplicate active identities.', { version: documentReconciliation.reconciliationVersion || null, diagnosticCount: documentReconciliation.diagnostics?.length || 0 }),
    check('participant_entity_complete', participantEntityCompleteness.version === BOND_APPLICATION_PARTICIPANT_ENTITY_COMPLETENESS_VERSION && participantEntityCompleteness.complete === true && !(participantEntityCompleteness.blockingIssues || []).length, 'Participant and purchaser entity data must be complete.', { version: participantEntityCompleteness.version || null }),
    check('originator_pack_ready', packManifest.version === BOND_APPLICATION_ORIGINATOR_PACK_VERSION && packManifest.status === 'ready' && packManifest.ready === true && Boolean(text(packManifest.fingerprint)), 'The branded originator pack must be ready and fingerprinted.', { version: packManifest.version || null, status: packManifest.status || null }),
    check('controlled_handoff_bound', handoffPackage.controlledHandoff?.version === CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION && handoffPackage.controlledHandoff?.packFingerprint === packManifest.fingerprint && handoffPackage.controlledHandoff?.automaticBankSubmission === false && handoffPackage.controlledHandoff?.networkDeliveryPerformed === false, 'The controlled handoff must bind the pack and preserve the manual-delivery boundary.', { version: handoffPackage.controlledHandoff?.version || null, status: handoffPackage.status || null }),
    check('multi_profile_acceptance_certified', multiProfileAcceptance.version === BOND_ORIGINATOR_MULTI_PROFILE_ACCEPTANCE_VERSION && multiProfileAcceptance.certified === true && multiProfileAcceptance.status === 'acceptance_certified' && Number(multiProfileAcceptance.metrics?.scenarioCountPerProfile || 0) === 54, 'The Phase 8 multi-profile acceptance matrix must be certified.', { version: multiProfileAcceptance.version || null, status: multiProfileAcceptance.status || null, profileCount: multiProfileAcceptance.metrics?.profileCount || 0 }),
    check('single_active_handoff', activeHandoffCount <= 1, 'At most one active handoff package may exist for the application revision.', { activeHandoffCount }),
    check('evidence_fresh', evidenceAgeHours <= BOND_ORIGINATOR_PROMOTION_MAX_EVIDENCE_AGE_HOURS, 'Promotion evidence must be no older than 24 hours.', { observedAt: evidence.observedAt || null, evidenceAgeHours }),
    check('monitoring_ready', Boolean(text(operationalControls.monitoringOwner) && text(operationalControls.monitoringCadence)), 'Name the monitoring owner and cadence.', { monitoringOwner: operationalControls.monitoringOwner || null, monitoringCadence: operationalControls.monitoringCadence || null }),
    check('support_and_rollback_ready', Boolean(text(operationalControls.supportOwner) && text(operationalControls.rollbackOwner) && operationalControls.pausePathTested === true && operationalControls.rollbackRunbookAvailable === true), 'Name support and rollback owners and prove the pause/rollback path.', { supportOwner: operationalControls.supportOwner || null, rollbackOwner: operationalControls.rollbackOwner || null, pausePathTested: operationalControls.pausePathTested === true, rollbackRunbookAvailable: operationalControls.rollbackRunbookAvailable === true }),
    check('read_only_promotion_audit', mutatedProduction !== true, 'The promotion artifact must not mutate production.', { mutatedProduction: mutatedProduction === true }),
  ]
  const blockers = checks.filter((item) => !item.passed)
  const payload = {
    version: BOND_ORIGINATOR_PRODUCTION_PROMOTION_VERSION,
    generatedAt,
    environment: text(environment).toLowerCase(),
    build: { commitSha: text(build.commitSha) || null, artifactId: text(build.artifactId) || null },
    packFingerprint: packManifest.fingerprint || null,
    handoffIdempotencyKey: handoffPackage.idempotencyKey || null,
    checks,
  }
  return {
    ...payload,
    status: blockers.length ? 'promotion_blocked' : 'promotion_ready',
    ready: blockers.length === 0,
    blockers,
    metrics: { checkCount: checks.length, passedCount: checks.length - blockers.length, blockerCount: blockers.length, scenarioCount: scenarios.expectedCount },
    fingerprint: `${BOND_ORIGINATOR_PRODUCTION_PROMOTION_VERSION}:${canonicalizeBondApplicationSnapshot(payload)}`,
    nextAction: blockers.length ? 'Resolve every failed check and regenerate fresh evidence.' : 'Proceed with controlled promotion and keep the pause path available.',
  }
}
