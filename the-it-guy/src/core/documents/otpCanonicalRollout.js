import { OTP_CANONICAL_RUNTIME_BINDING_VERSION, OTP_CANONICAL_TEMPLATE_ASSET_VERSION } from './otpCanonicalTemplatePreparation.js'
import { OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION } from './otpCanonicalTemplateContract.js'
import { resolveCanonicalOtpReferenceMatrixGovernance } from './otpCanonicalReferenceMatrixGovernance.js'
import { resolveCanonicalOtpTemplateState } from './otpCanonicalTemplateVersioning.js'

export const OTP_CANONICAL_ROLLOUT_VERSION = 'kingstons_2026_otp_rollout_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function versionMetadata(version = {}) {
  return asRecord(version.metadata_json || version.metadataJson)
}

function approvalForCandidate(approvals = [], candidateId = '') {
  return approvals.find((approval) => (
    normalizeText(approval.template_version_id || approval.templateVersionId) === candidateId &&
    approval.is_current !== false &&
    normalizeText(approval.decision).toLowerCase() === 'approved'
  )) || null
}

function check(key, label, passed, detail) {
  return { key, label, passed: Boolean(passed), detail }
}

export function buildCanonicalOtpActivationReadiness({ template = {}, versions = [], approvals = [] } = {}) {
  const state = resolveCanonicalOtpTemplateState({ template, versions })
  const matrix = resolveCanonicalOtpReferenceMatrixGovernance(template)
  const candidate = state.candidate
  const live = state.live
  const metadata = versionMetadata(candidate)
  const approval = approvalForCandidate(approvals, candidate?.id)
  const candidateStatus = normalizeText(candidate?.status).toLowerCase()
  const contractVersion = normalizeText(candidate?.canonical_contract_version || candidate?.canonicalContractVersion)
  const runtimeVersion = normalizeText(candidate?.canonical_runtime_binding_version || metadata.canonical_runtime_binding_version)
  const assetVersion = normalizeText(candidate?.canonical_template_asset_version || metadata.canonical_template_asset_version)
  const candidateFingerprint = normalizeText(candidate?.template_fingerprint || metadata.template_fingerprint) || matrix.currentTemplateFingerprint
  const approvalFingerprint = normalizeText(approval?.template_fingerprint || approval?.templateFingerprint)
  const storageReady = Boolean(normalizeText(candidate?.storage_bucket || candidate?.storageBucket) && normalizeText(candidate?.storage_path || candidate?.storagePath))

  const checks = [
    check('version_state', 'Live and candidate versions are separate', state.valid && Boolean(live && candidate), state.errors[0] || 'A published live version and a separate candidate are required.'),
    check('candidate_status', 'Candidate is approved', candidateStatus === 'approved', candidateStatus === 'approved' ? 'The candidate version is approved.' : 'The candidate must reach approved status before activation.'),
    check('canonical_contract', 'Canonical document contract matches', contractVersion === OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION, 'The candidate must use the supported canonical OTP contract.'),
    check('runtime_contract', 'Runtime binder matches', runtimeVersion === OTP_CANONICAL_RUNTIME_BINDING_VERSION, 'The candidate must use the supported runtime binder.'),
    check('asset_contract', 'Canonical DOCX asset matches', assetVersion === OTP_CANONICAL_TEMPLATE_ASSET_VERSION && storageReady, 'The prepared canonical DOCX and storage location are required.'),
    check('reference_certification', 'Reference transactions are certified', matrix.passed && matrix.matchesTemplate, matrix.blockingReasons.includes('matrix_result_stale') ? 'The Phase 5 result is stale.' : 'Run and save the passing Phase 5 reference matrix.'),
    check('attorney_approval', 'Attorney approval matches this candidate', Boolean(approval && approvalFingerprint && approvalFingerprint === candidateFingerprint && approval.decided_at), 'A current attorney approval bound to this exact fingerprint is required.'),
  ]
  const blockers = checks.filter((item) => !item.passed).map((item) => item.detail)
  return {
    schemaVersion: OTP_CANONICAL_ROLLOUT_VERSION,
    canActivate: checks.every((item) => item.passed),
    templateId: normalizeText(template.id) || null,
    liveVersionId: live?.id || null,
    candidateVersionId: candidate?.id || null,
    previousLiveVersionId: state.previousLive?.id || null,
    certificationKey: matrix.certificationKey,
    templateFingerprint: matrix.currentTemplateFingerprint,
    candidate,
    live,
    approval,
    matrix,
    checks,
    blockers,
  }
}

export function buildCanonicalOtpActivationRequest(readiness = {}) {
  if (!readiness.canActivate) {
    throw new Error(readiness.blockers?.[0] || 'The canonical OTP candidate is not ready for activation.')
  }
  return {
    templateId: readiness.templateId,
    candidateVersionId: readiness.candidateVersionId,
    certificationKey: readiness.certificationKey,
    templateFingerprint: readiness.templateFingerprint,
  }
}
