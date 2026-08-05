import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  OTP_STAGING_SMOKE_PDF_PROOF_CONTRACT,
  OTP_STAGING_SMOKE_PDF_PROOF_PHASE13_VERSION,
  OTP_STAGING_SMOKE_PDF_PROOF_READY_STATUS,
  OTP_STAGING_SMOKE_PDF_READY_EVIDENCE,
} from './otpStagingSmokePdfProofPhase13.js'
import {
  OTP_SIGNING_ENVELOPE_QA_CONTRACT,
  OTP_SIGNING_ENVELOPE_QA_PHASE14_VERSION,
  OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE,
  OTP_SIGNING_ENVELOPE_QA_READY_STATUS,
} from './otpSigningEnvelopeQaPhase14.js'
import {
  OTP_SIGNING_DISPATCH_DRY_RUN_CONTRACT,
  OTP_SIGNING_DISPATCH_DRY_RUN_PHASE15_VERSION,
  OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE,
  OTP_SIGNING_DISPATCH_DRY_RUN_READY_STATUS,
} from './otpSigningDispatchDryRunPhase15.js'
import {
  OTP_SIGNER_SESSION_QA_CONTRACT,
  OTP_SIGNER_SESSION_QA_PHASE16_VERSION,
  OTP_SIGNER_SESSION_QA_READY_EVIDENCE,
  OTP_SIGNER_SESSION_QA_READY_STATUS,
} from './otpSignerSessionQaPhase16.js'
import {
  OTP_FINAL_COMPLETION_DRY_RUN_CONTRACT,
  OTP_FINAL_COMPLETION_DRY_RUN_PHASE17_VERSION,
  OTP_FINAL_COMPLETION_DRY_RUN_READY_EVIDENCE,
  OTP_FINAL_COMPLETION_DRY_RUN_READY_STATUS,
  buildOtpFinalCompletionDryRunPhase17Audit,
} from './otpFinalCompletionDryRunPhase17.js'

export const OTP_RELEASE_CANDIDATE_LOCK_PHASE18_VERSION = 'otp_release_candidate_lock_phase18_v1'
export const OTP_RELEASE_CANDIDATE_LOCK_READY_STATUS = 'OTP_RELEASE_CANDIDATE_LOCK_READY_FOR_PRODUCTION_PROMOTION_PREFLIGHT'
export const OTP_RELEASE_CANDIDATE_LOCK_CONTRACT = 'otp-vnext-release-candidate-lock-phase18-v1'

const REQUIRED_STOP_CONDITIONS = Object.freeze([
  'route_output_drift_detected',
  'qa_evidence_drift_detected',
  'release_candidate_fingerprint_mismatch',
  'production_promotion_requested_without_lock',
  'route_lock_leak_detected',
  'approval_reference_missing',
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
}

function list(value = []) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function routeLabel(routeKey = '') {
  return OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey)?.label || routeKey
}

function evidenceByRoute(evidence = []) {
  return new Map((Array.isArray(evidence) ? evidence : []).map((row) => [normalizeKey(row.routeKey), row]))
}

function stableFingerprint(value, prefix = 'otp-rc') {
  const canonical = JSON.stringify(canonicalLegalDocumentReleaseValue(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${prefix}:${hash.toString(16).padStart(8, '0')}:${canonical.length}`
}

function qaEvidenceChain() {
  return Object.freeze([
    Object.freeze({
      phase: 'phase13_staging_smoke_pdf_proof',
      version: OTP_STAGING_SMOKE_PDF_PROOF_PHASE13_VERSION,
      contract: OTP_STAGING_SMOKE_PDF_PROOF_CONTRACT,
      status: OTP_STAGING_SMOKE_PDF_PROOF_READY_STATUS,
    }),
    Object.freeze({
      phase: 'phase14_signing_envelope_qa',
      version: OTP_SIGNING_ENVELOPE_QA_PHASE14_VERSION,
      contract: OTP_SIGNING_ENVELOPE_QA_CONTRACT,
      status: OTP_SIGNING_ENVELOPE_QA_READY_STATUS,
    }),
    Object.freeze({
      phase: 'phase15_signing_dispatch_dry_run',
      version: OTP_SIGNING_DISPATCH_DRY_RUN_PHASE15_VERSION,
      contract: OTP_SIGNING_DISPATCH_DRY_RUN_CONTRACT,
      status: OTP_SIGNING_DISPATCH_DRY_RUN_READY_STATUS,
    }),
    Object.freeze({
      phase: 'phase16_signer_session_qa',
      version: OTP_SIGNER_SESSION_QA_PHASE16_VERSION,
      contract: OTP_SIGNER_SESSION_QA_CONTRACT,
      status: OTP_SIGNER_SESSION_QA_READY_STATUS,
    }),
    Object.freeze({
      phase: 'phase17_final_completion_dry_run',
      version: OTP_FINAL_COMPLETION_DRY_RUN_PHASE17_VERSION,
      contract: OTP_FINAL_COMPLETION_DRY_RUN_CONTRACT,
      status: OTP_FINAL_COMPLETION_DRY_RUN_READY_STATUS,
    }),
  ])
}

function routeLockPayload(route = {}) {
  return canonicalLegalDocumentReleaseValue({
    routeKey: route.routeKey,
    packetId: route.packetId,
    versionId: route.versionId,
    templateKey: route.templateKey,
    renderedSha256: route.renderedSha256,
    renderedByteLength: route.renderedByteLength,
    pageCount: route.pageCount,
    envelopeId: route.envelopeId,
    signerRoles: route.signerRoles,
    signerCount: route.signerCount,
    requiredFieldCount: route.requiredFieldCount,
    finalSimulationId: route.finalSimulationId,
    qaEvidenceFingerprint: route.qaEvidenceFingerprint,
  })
}

function releaseCandidatePayload(lock = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: OTP_RELEASE_CANDIDATE_LOCK_CONTRACT,
    lockId: lock.lockId,
    environment: lock.environment,
    projectRef: lock.projectRef,
    approvalReference: lock.approvalReference,
    routeFingerprints: (lock.routes || []).map((route) => ({
      routeKey: route.routeKey,
      routeFingerprint: route.routeFingerprint,
      qaEvidenceFingerprint: route.qaEvidenceFingerprint,
    })),
    stopConditions: lock.stopConditions,
  })
}

function buildCurrentRouteSnapshot(variant, finalCompletionRow = {}) {
  const routeKey = variant.key
  const pdf = evidenceByRoute(OTP_STAGING_SMOKE_PDF_READY_EVIDENCE).get(routeKey) || {}
  const envelope = evidenceByRoute(OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE).get(routeKey) || {}
  const dispatch = evidenceByRoute(OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE).get(routeKey) || {}
  const session = evidenceByRoute(OTP_SIGNER_SESSION_QA_READY_EVIDENCE).get(routeKey) || {}
  const completion = evidenceByRoute(OTP_FINAL_COMPLETION_DRY_RUN_READY_EVIDENCE).get(routeKey) || {}
  const signerRoles = unique((Array.isArray(envelope.signers) ? envelope.signers : []).map((signer) => normalizeKey(signer.signerRole)))
  const qaEvidence = qaEvidenceChain()
  const snapshot = {
    routeKey,
    routeLabel: variant.label,
    environment: normalizeText(pdf.environment),
    projectRef: normalizeText(pdf.projectRef),
    canaryOrganisationId: normalizeText(pdf.canaryOrganisationId),
    packetId: normalizeText(pdf.packetId),
    versionId: normalizeText(pdf.versionId),
    templateKey: normalizeText(pdf.templateKey),
    renderedFilePath: normalizeText(pdf.renderedFilePath),
    renderedSha256: normalizeText(pdf.renderedSha256),
    renderedByteLength: Number(pdf.renderedByteLength || 0),
    pageCount: Number(pdf.pageCount || 0),
    envelopeId: normalizeText(envelope.envelopeId),
    dispatchPacketId: normalizeText(dispatch.packetId),
    sessionPacketId: normalizeText(session.packetId),
    finalSimulationId: normalizeText(completion.finalSimulationId || finalCompletionRow.finalSimulationId),
    signerRoles,
    signerCount: signerRoles.length,
    requiredFieldCount: Number(finalCompletionRow.requiredFieldCount || 0),
    completedRequiredFieldCount: Number(finalCompletionRow.completedRequiredFieldCount || 0),
    finalArtifactMutationSuppressed: finalCompletionRow.finalArtifactMutationSuppressed === true,
    providerCallbackSuppressed: finalCompletionRow.providerCallbackSuppressed === true,
    qaEvidence,
    qaEvidenceFingerprint: stableFingerprint(qaEvidence, `otp-rc-qa-${routeKey}`),
  }
  return {
    ...snapshot,
    routeFingerprint: stableFingerprint(routeLockPayload(snapshot), `otp-rc-route-${routeKey}`),
  }
}

function buildReleaseCandidateLockFromRoutes(routes = []) {
  const lock = {
    lockId: 'otp-vnext-release-candidate-lock-2026-08-05',
    lockedAt: '2026-08-05T10:30:00.000Z',
    lockedByRole: 'system_qa_release_guard',
    approvalReference: 'otp-vnext-phase18-release-candidate-lock',
    environment: 'staging',
    projectRef: 'staging-project-ref',
    promotionTarget: 'production_promotion_preflight',
    routeOutputsFrozen: true,
    qaEvidenceFrozen: true,
    productionPromotionBlockedUntilLock: true,
    mutationAllowed: false,
    routes: routes.map((route) => Object.freeze({
      routeKey: route.routeKey,
      routeLabel: route.routeLabel,
      packetId: route.packetId,
      versionId: route.versionId,
      templateKey: route.templateKey,
      renderedFilePath: route.renderedFilePath,
      renderedSha256: route.renderedSha256,
      renderedByteLength: route.renderedByteLength,
      pageCount: route.pageCount,
      envelopeId: route.envelopeId,
      finalSimulationId: route.finalSimulationId,
      signerRoles: Object.freeze(route.signerRoles),
      signerCount: route.signerCount,
      requiredFieldCount: route.requiredFieldCount,
      completedRequiredFieldCount: route.completedRequiredFieldCount,
      qaEvidence: Object.freeze(route.qaEvidence),
      qaEvidenceFingerprint: route.qaEvidenceFingerprint,
      routeFingerprint: route.routeFingerprint,
    })),
    stopConditions: REQUIRED_STOP_CONDITIONS,
  }
  return Object.freeze({
    ...lock,
    releaseCandidateFingerprint: stableFingerprint(releaseCandidatePayload(lock), 'otp-rc-lock'),
  })
}

const READY_FINAL_COMPLETION_AUDIT = buildOtpFinalCompletionDryRunPhase17Audit({
  checkedAt: '2026-08-05T10:30:00.000Z',
})

export const OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE = buildReleaseCandidateLockFromRoutes(
  OTP_DOCUMENT_VARIANTS.map((variant) =>
    buildCurrentRouteSnapshot(
      variant,
      READY_FINAL_COMPLETION_AUDIT.routeRows.find((row) => row.routeKey === variant.key) || {},
    ),
  ),
)

function buildRouteLockRow(variant, lockedRoute = {}, currentRoute = {}) {
  const lockedRoles = list(lockedRoute.signerRoles).map(normalizeKey)
  const currentRoles = list(currentRoute.signerRoles).map(normalizeKey)
  const forbiddenRoles = variant.key === 'new_development'
    ? ['seller']
    : ['developer_authorised_signatory', 'contractor_authorised_signatory', 'agent']
  const routeOutputDrift = []
  for (const key of ['packetId', 'versionId', 'templateKey', 'renderedSha256', 'renderedByteLength', 'pageCount', 'envelopeId', 'finalSimulationId', 'signerCount', 'requiredFieldCount', 'completedRequiredFieldCount']) {
    if (normalizeText(lockedRoute[key]) !== normalizeText(currentRoute[key])) routeOutputDrift.push(key)
  }
  const roleDrift = lockedRoles.join(',') !== currentRoles.join(',')
  if (roleDrift) routeOutputDrift.push('signerRoles')
  const expectedRouteFingerprint = stableFingerprint(routeLockPayload(currentRoute), `otp-rc-route-${variant.key}`)
  const expectedQaFingerprint = stableFingerprint(currentRoute.qaEvidence || [], `otp-rc-qa-${variant.key}`)
  const qaEvidenceDrift = normalizeText(lockedRoute.qaEvidenceFingerprint) !== expectedQaFingerprint ||
    JSON.stringify(canonicalLegalDocumentReleaseValue(lockedRoute.qaEvidence || [])) !== JSON.stringify(canonicalLegalDocumentReleaseValue(currentRoute.qaEvidence || []))
  const routeFingerprintMatches = normalizeText(lockedRoute.routeFingerprint) === expectedRouteFingerprint
  const routeSeparated = normalizeKey(lockedRoute.routeKey) === variant.key &&
    lockedRoles.every((role) => currentRoles.includes(role)) &&
    lockedRoles.every((role) => !forbiddenRoles.includes(role))
  const pass = normalizeKey(lockedRoute.routeKey) === variant.key &&
    routeOutputDrift.length === 0 &&
    routeFingerprintMatches &&
    !qaEvidenceDrift &&
    normalizeText(lockedRoute.qaEvidenceFingerprint) === expectedQaFingerprint &&
    routeSeparated &&
    currentRoute.finalArtifactMutationSuppressed === true &&
    currentRoute.providerCallbackSuppressed === true

  return {
    routeKey: variant.key,
    routeLabel: variant.label,
    packetId: normalizeText(lockedRoute.packetId),
    versionId: normalizeText(lockedRoute.versionId),
    templateKey: normalizeText(lockedRoute.templateKey),
    renderedSha256: normalizeText(lockedRoute.renderedSha256),
    envelopeId: normalizeText(lockedRoute.envelopeId),
    signerRoles: lockedRoles,
    signerCount: Number(lockedRoute.signerCount || 0),
    requiredFieldCount: Number(lockedRoute.requiredFieldCount || 0),
    completedRequiredFieldCount: Number(lockedRoute.completedRequiredFieldCount || 0),
    routeOutputDrift,
    qaEvidenceDrift,
    routeFingerprintMatches,
    expectedRouteFingerprint,
    lockedRouteFingerprint: normalizeText(lockedRoute.routeFingerprint),
    expectedQaEvidenceFingerprint: expectedQaFingerprint,
    lockedQaEvidenceFingerprint: normalizeText(lockedRoute.qaEvidenceFingerprint),
    routeSeparated,
    pass,
  }
}

function addCheck(checks, pass, code, detail, category = 'phase18_release_candidate_lock') {
  checks.push({ code, pass: Boolean(pass), detail, category })
}

function addIssue(issues, issue = {}) {
  issues.push({
    severity: issue.severity || 'blocking',
    code: normalizeText(issue.code),
    category: normalizeText(issue.category),
    routeKey: normalizeText(issue.routeKey),
    message: normalizeText(issue.message),
    remediation: normalizeText(issue.remediation),
  })
}

export function buildOtpReleaseCandidateLockPhase18Audit({
  releaseCandidateLock = OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE,
  finalCompletionDryRun = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const finalCompletionAudit = finalCompletionDryRun || buildOtpFinalCompletionDryRunPhase17Audit({ checkedAt })
  const lockedRouteMap = evidenceByRoute(releaseCandidateLock?.routes || [])
  const currentRouteMap = evidenceByRoute(OTP_DOCUMENT_VARIANTS.map((variant) =>
    buildCurrentRouteSnapshot(
      variant,
      finalCompletionAudit.routeRows?.find((row) => row.routeKey === variant.key) || {},
    ),
  ))
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) =>
    buildRouteLockRow(
      variant,
      lockedRouteMap.get(variant.key) || {},
      currentRouteMap.get(variant.key) || {},
    ),
  )
  const expectedReleaseCandidateFingerprint = stableFingerprint(releaseCandidatePayload(releaseCandidateLock || {}), 'otp-rc-lock')
  const lockPresent = normalizeText(releaseCandidateLock?.lockId) &&
    normalizeText(releaseCandidateLock?.approvalReference) &&
    normalizeText(releaseCandidateLock?.lockedByRole) &&
    normalizeKey(releaseCandidateLock?.environment) === 'staging'
  const mutationBlocked = releaseCandidateLock?.routeOutputsFrozen === true &&
    releaseCandidateLock?.qaEvidenceFrozen === true &&
    releaseCandidateLock?.productionPromotionBlockedUntilLock === true &&
    releaseCandidateLock?.mutationAllowed === false
  const missingStopConditions = REQUIRED_STOP_CONDITIONS.filter((condition) => !list(releaseCandidateLock?.stopConditions).map(normalizeKey).includes(condition))
  const checks = []
  const blockers = []
  const warnings = []

  addCheck(checks, finalCompletionAudit.status === OTP_FINAL_COMPLETION_DRY_RUN_READY_STATUS, 'PHASE18_FINAL_COMPLETION_DRY_RUN_READY', 'Phase 17 final completion dry-run is ready before release-candidate lock.')
  addCheck(checks, lockPresent, 'PHASE18_RELEASE_LOCK_PRESENT', 'Release-candidate lock has a lock id, accountable role, staging environment and approval reference.')
  addCheck(checks, routeRows.length === 2 && routeRows.every((row) => row.pass), 'PHASE18_BOTH_ROUTE_OUTPUTS_FROZEN', 'Approved resale and new-development generated outputs are frozen.')
  addCheck(checks, routeRows.every((row) => row.routeOutputDrift.length === 0 && row.routeFingerprintMatches), 'PHASE18_ROUTE_OUTPUT_FINGERPRINTS_MATCH', 'Current route outputs still match their release-candidate fingerprints.')
  addCheck(checks, routeRows.every((row) => !row.qaEvidenceDrift), 'PHASE18_QA_EVIDENCE_CHAIN_FROZEN', 'QA evidence from generated PDF proof through final completion dry-run is frozen.')
  addCheck(checks, normalizeText(releaseCandidateLock?.releaseCandidateFingerprint) === expectedReleaseCandidateFingerprint, 'PHASE18_RELEASE_CANDIDATE_FINGERPRINT_MATCHES', 'The overall release-candidate fingerprint matches the locked route and QA evidence payload.')
  addCheck(checks, mutationBlocked, 'PHASE18_PRODUCTION_PROMOTION_MUTATION_BLOCKED', 'Production promotion remains blocked until this exact lock is used by the next preflight.')
  addCheck(checks, routeRows.every((row) => row.routeSeparated), 'PHASE18_RESALE_AND_NEW_DEVELOPMENT_LOCKED_SEPARATELY', 'Resale and new-development release-candidate route locks remain separate.')
  addCheck(checks, Boolean(normalizeText(releaseCandidateLock?.approvalReference)), 'PHASE18_APPROVAL_REFERENCE_BOUND', 'Release-candidate lock carries an approval/change reference.')
  addCheck(checks, missingStopConditions.length === 0, 'PHASE18_DRIFT_STOP_CONDITIONS_BOUND', 'Stop conditions cover output drift, QA drift, fingerprint mismatch, promotion bypass, route leakage and missing approval reference.')

  for (const row of routeRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'PHASE18_ROUTE_RELEASE_CANDIDATE_LOCK_DRIFT',
      category: 'release_candidate_lock',
      routeKey: row.routeKey,
      message: `${routeLabel(row.routeKey)} release-candidate lock no longer matches current approved evidence.`,
      remediation: 'Restore the locked route output and QA evidence, or restart the QA chain and issue a new release-candidate lock.',
    })
  }
  for (const check of checks.filter((row) => !row.pass && row.code !== 'PHASE18_BOTH_ROUTE_OUTPUTS_FROZEN')) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Repair release-candidate lock evidence before production promotion preflight.',
    })
  }

  return {
    version: OTP_RELEASE_CANDIDATE_LOCK_PHASE18_VERSION,
    contract: OTP_RELEASE_CANDIDATE_LOCK_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_RELEASE_CANDIDATE_LOCK_REMEDIATION_REQUIRED' : OTP_RELEASE_CANDIDATE_LOCK_READY_STATUS,
    canProceedToProductionPromotionPreflight: blockers.length === 0,
    finalCompletionDryRun: {
      version: finalCompletionAudit.version,
      status: finalCompletionAudit.status,
      canProceedToReleaseCandidateLock: finalCompletionAudit.canProceedToReleaseCandidateLock === true,
      blockerCount: finalCompletionAudit.summary?.blockerCount || 0,
    },
    lock: {
      lockId: normalizeText(releaseCandidateLock?.lockId),
      lockedAt: normalizeText(releaseCandidateLock?.lockedAt),
      lockedByRole: normalizeText(releaseCandidateLock?.lockedByRole),
      approvalReference: normalizeText(releaseCandidateLock?.approvalReference),
      environment: normalizeText(releaseCandidateLock?.environment),
      projectRef: normalizeText(releaseCandidateLock?.projectRef),
      promotionTarget: normalizeText(releaseCandidateLock?.promotionTarget),
      releaseCandidateFingerprint: normalizeText(releaseCandidateLock?.releaseCandidateFingerprint),
      expectedReleaseCandidateFingerprint,
    },
    summary: {
      routeCount: routeRows.length,
      frozenRouteCount: routeRows.filter((row) => row.pass).length,
      routeOutputDriftCount: routeRows.reduce((sum, row) => sum + row.routeOutputDrift.length, 0),
      qaEvidenceDriftCount: routeRows.filter((row) => row.qaEvidenceDrift).length,
      routeFingerprintMismatchCount: routeRows.filter((row) => !row.routeFingerprintMatches).length,
      routeLeakCount: routeRows.filter((row) => !row.routeSeparated).length,
      mutationBlocked: mutationBlocked === true,
      missingStopConditionCount: missingStopConditions.length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    routeRows,
    checks,
    blockers,
    warnings,
  }
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

export function formatOtpReleaseCandidateLockPhase18Markdown(report = buildOtpReleaseCandidateLockPhase18Audit()) {
  return [
    '# OTP Template vNext Phase 18 Release Candidate Lock',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Contract: ${report.contract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Routes', report.summary.routeCount],
        ['Frozen routes', report.summary.frozenRouteCount],
        ['Route output drift', report.summary.routeOutputDriftCount],
        ['QA evidence drift', report.summary.qaEvidenceDriftCount],
        ['Route fingerprint mismatches', report.summary.routeFingerprintMismatchCount],
        ['Route leaks', report.summary.routeLeakCount],
        ['Mutation blocked', report.summary.mutationBlocked ? 'yes' : 'no'],
        ['Missing stop conditions', report.summary.missingStopConditionCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to production promotion preflight', report.canProceedToProductionPromotionPreflight ? 'yes' : 'no'],
      ],
    ),
    '',
    '## Release Lock',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Lock id', report.lock.lockId],
        ['Locked at', report.lock.lockedAt],
        ['Locked by role', report.lock.lockedByRole],
        ['Approval reference', report.lock.approvalReference],
        ['Environment', report.lock.environment],
        ['Project ref', report.lock.projectRef],
        ['Promotion target', report.lock.promotionTarget],
        ['Fingerprint', report.lock.releaseCandidateFingerprint],
      ],
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Route Locks',
    '',
    table(
      ['Route', 'Packet', 'Version', 'Template', 'PDF SHA', 'Envelope', 'Roles', 'Route Fingerprint', 'QA Fingerprint', 'Pass'],
      report.routeRows.map((row) => [
        row.routeLabel,
        row.packetId,
        row.versionId,
        row.templateKey,
        row.renderedSha256,
        row.envelopeId,
        row.signerRoles.join(', '),
        row.lockedRouteFingerprint,
        row.lockedQaEvidenceFingerprint,
        row.pass ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 18 freezes the approved staging route outputs and QA evidence chain only. It does not promote to production, mutate live templates, dispatch signers, create final signed artifacts, or replace the production promotion preflight.',
    '',
  ].join('\n')
}
