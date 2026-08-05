import {
  OTP_AGENT_REVIEW_COMPLETION_GUARD_CONTRACT,
  OTP_AGENT_REVIEW_COMPLETION_GUARD_PHASE36_VERSION,
  OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_STATUS,
} from './otpAgentReviewCompletionGuardPhase36.js'

export const OTP_FINAL_SIGNED_ARTIFACT_PROOF_PHASE37_VERSION = 'otp_final_signed_artifact_proof_phase37_v1'
export const OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_STATUS = 'OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_FOR_END_TO_END_STAGING_WALKTHROUGH'
export const OTP_FINAL_SIGNED_ARTIFACT_PROOF_CONTRACT = 'otp-vnext-final-signed-artifact-proof-phase37-v1'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function firstText(source = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(source[key])
    if (value) return value
  }
  return ''
}

function artifactPacketId(artifact = {}) {
  return firstText(artifact, ['packetId', 'packet_id', 'documentPacketId', 'document_packet_id'])
}

function artifactVersionId(artifact = {}) {
  return firstText(artifact, [
    'packetVersionId',
    'packet_version_id',
    'sourcePacketVersionId',
    'source_packet_version_id',
    'documentPacketVersionId',
    'document_packet_version_id',
    'versionId',
    'version_id',
  ])
}

function artifactDocumentId(artifact = {}) {
  return firstText(artifact, ['documentId', 'document_id', 'finalArtifactDocumentId', 'final_artifact_document_id'])
}

function artifactPath(artifact = {}) {
  return firstText(artifact, [
    'path',
    'storagePath',
    'storage_path',
    'filePath',
    'file_path',
    'objectPath',
    'object_path',
    'finalSignedFilePath',
    'final_signed_file_path',
  ])
}

function artifactBucket(artifact = {}) {
  return firstText(artifact, [
    'bucket',
    'storageBucket',
    'storage_bucket',
    'outputBucket',
    'output_bucket',
    'finalSignedBucket',
    'final_signed_bucket',
  ])
}

function artifactSha256(artifact = {}) {
  return firstText(artifact, ['sha256', 'finalArtifactSha256', 'final_artifact_sha256'])
}

function artifactByteLength(artifact = {}) {
  return numberValue(firstText(artifact, ['byteLength', 'byte_length', 'sizeBytes', 'size_bytes', 'size']))
}

function artifactMediaType(artifact = {}) {
  return firstText(artifact, ['mediaType', 'media_type', 'contentType', 'content_type', 'sourceFormat'])
}

function artifactRouteVariant(artifact = {}) {
  return normalizeKey(firstText(artifact, ['routeVariant', 'route_variant', 'otpRouteVariant', 'otp_route_variant']))
}

function artifactFingerprint(artifact = {}, keys = []) {
  const direct = firstText(artifact, keys)
  if (direct) return direct
  const metadata = object(artifact.metadata || artifact.meta || artifact.finalArtifactMetadata || artifact.final_artifact_metadata)
  return firstText(metadata, keys)
}

function pathLooksUnsafe(path = '') {
  const normalized = normalizeText(path)
  if (!normalized) return false
  return (
    /^https?:\/\//i.test(normalized) ||
    /^file:\/\//i.test(normalized) ||
    normalized.startsWith('/tmp/') ||
    normalized.startsWith('/var/tmp/') ||
    normalized.includes('..')
  )
}

function bucketLooksUnsafe(bucket = '') {
  const normalized = normalizeText(bucket)
  if (!normalized) return false
  return /^https?:\/\//i.test(normalized) || normalized.startsWith('/') || normalized.includes('..')
}

function mediaLooksPdf({ mediaType = '', path = '' } = {}) {
  const media = normalizeText(mediaType).toLowerCase()
  const storagePath = normalizeText(path).toLowerCase()
  return media.includes('pdf') || storagePath.endsWith('.pdf')
}

function resolveStorageMode({ documentId = '', bucket = '', path = '' } = {}) {
  if (documentId) return 'canonical_document_record'
  if (bucket && path) return 'durable_storage_object'
  return 'unresolved'
}

export function buildOtpFinalSignedArtifactProof({
  completionGuard = {},
  packet = {},
  version = {},
  finalArtifact = {},
  checkedAt = new Date().toISOString(),
} = {}) {
  const artifact = object(finalArtifact)
  const packetId = normalizeText(completionGuard.packetId || packet.id || artifactPacketId(artifact))
  const packetVersionId = normalizeText(completionGuard.packetVersionId || version.id || artifactVersionId(artifact))
  const finalPacketId = artifactPacketId(artifact)
  const finalVersionId = artifactVersionId(artifact)
  const documentId = artifactDocumentId(artifact)
  const bucket = artifactBucket(artifact)
  const path = artifactPath(artifact)
  const sha256 = artifactSha256(artifact)
  const byteLength = artifactByteLength(artifact)
  const mediaType = artifactMediaType(artifact)
  const storageMode = resolveStorageMode({ documentId, bucket, path })
  const routeVariant = normalizeKey(completionGuard.routeVariant || artifactRouteVariant(artifact))
  const artifactRoute = artifactRouteVariant(artifact)
  const reviewRecordFingerprint = normalizeText(completionGuard.reviewRecordFingerprint)
  const artifactReviewRecordFingerprint = artifactFingerprint(artifact, [
    'reviewRecordFingerprint',
    'review_record_fingerprint',
    'agentReviewFingerprint',
    'agent_review_fingerprint',
  ])
  const termsFingerprint = normalizeText(completionGuard.termsFingerprint)
  const artifactTermsFingerprint = artifactFingerprint(artifact, [
    'termsFingerprint',
    'terms_fingerprint',
    'legalTermsFingerprint',
    'legal_terms_fingerprint',
  ])
  const routeLegalFingerprint = normalizeText(completionGuard.routeLegalFingerprint || completionGuard.legalWordingFingerprint)
  const artifactRouteLegalFingerprint = artifactFingerprint(artifact, [
    'routeLegalFingerprint',
    'route_legal_fingerprint',
    'legalWordingFingerprint',
    'legal_wording_fingerprint',
  ])

  const blockerCodes = [
    completionGuard.version === OTP_AGENT_REVIEW_COMPLETION_GUARD_PHASE36_VERSION ? '' : 'completion_guard_phase_mismatch',
    completionGuard.contract === OTP_AGENT_REVIEW_COMPLETION_GUARD_CONTRACT ? '' : 'completion_guard_contract_mismatch',
    completionGuard.status === OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_STATUS ? '' : 'completion_guard_not_ready',
    completionGuard.canFinalizeReviewedOtp === true ? '' : 'completion_guard_not_finalizable',
    packetId ? '' : 'missing_packet_id',
    packetVersionId ? '' : 'missing_packet_version_id',
    documentId || path ? '' : 'missing_final_artifact_identity',
    artifact.ready === false ? 'final_artifact_not_ready' : '',
    finalPacketId && packetId && finalPacketId !== packetId ? 'final_artifact_packet_mismatch' : '',
    finalVersionId && packetVersionId && finalVersionId !== packetVersionId ? 'final_artifact_version_mismatch' : '',
    finalVersionId ? '' : 'missing_final_artifact_version_binding',
    /^[a-f0-9]{64}$/i.test(sha256) ? '' : 'missing_final_artifact_sha256',
    byteLength > 100 ? '' : 'missing_final_artifact_byte_length',
    mediaLooksPdf({ mediaType, path }) ? '' : 'final_artifact_not_pdf',
    pathLooksUnsafe(path) ? 'unsafe_final_artifact_path' : '',
    bucketLooksUnsafe(bucket) ? 'unsafe_final_artifact_bucket' : '',
    storageMode === 'unresolved' ? 'unsafe_final_artifact_storage_unresolved' : '',
    artifactRoute && routeVariant && artifactRoute !== routeVariant ? 'route_variant_mismatch' : '',
    artifactReviewRecordFingerprint && reviewRecordFingerprint && artifactReviewRecordFingerprint !== reviewRecordFingerprint
      ? 'review_record_fingerprint_mismatch'
      : '',
    artifactTermsFingerprint && termsFingerprint && artifactTermsFingerprint !== termsFingerprint
      ? 'terms_fingerprint_mismatch'
      : '',
    artifactRouteLegalFingerprint && routeLegalFingerprint && artifactRouteLegalFingerprint !== routeLegalFingerprint
      ? 'route_legal_fingerprint_mismatch'
      : '',
  ].filter(Boolean)

  const canRecordFinalSignedArtifact = blockerCodes.length === 0
  const hasExplicitRouteLegalFingerprint =
    Boolean(artifactRoute || artifactReviewRecordFingerprint || artifactTermsFingerprint || artifactRouteLegalFingerprint)

  return Object.freeze({
    version: OTP_FINAL_SIGNED_ARTIFACT_PROOF_PHASE37_VERSION,
    contract: OTP_FINAL_SIGNED_ARTIFACT_PROOF_CONTRACT,
    checkedAt,
    status: canRecordFinalSignedArtifact
      ? OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_STATUS
      : 'OTP_FINAL_SIGNED_ARTIFACT_PROOF_BLOCKED',
    canRecordFinalSignedArtifact,
    blockerCodes: Object.freeze(unique(blockerCodes)),
    packetId,
    packetVersionId,
    finalArtifactPacketId: finalPacketId,
    finalArtifactVersionId: finalVersionId,
    finalArtifactDocumentId: documentId,
    finalArtifactBucket: bucket,
    finalArtifactPath: path,
    finalArtifactSha256: sha256,
    finalArtifactByteLength: byteLength,
    finalArtifactMediaType: mediaType,
    storageMode,
    routeVariant,
    reviewRecordFingerprint,
    termsFingerprint,
    routeLegalFingerprint,
    routeLegalPreservationMode: hasExplicitRouteLegalFingerprint
      ? 'explicit_final_artifact_fingerprints'
      : 'exact_completed_version_binding',
  })
}

export function assertOtpFinalSignedArtifactProof(proof = {}) {
  if (proof?.canRecordFinalSignedArtifact === true) return proof
  const error = new Error('OTP final signed artifact proof is blocked until the generated PDF is bound to the exact completed OTP version and durable artifact identity.')
  error.code = 'OTP_FINAL_SIGNED_ARTIFACT_PROOF_BLOCKED'
  error.details = {
    blockerCodes: list(proof?.blockerCodes),
    packetId: normalizeText(proof?.packetId),
    packetVersionId: normalizeText(proof?.packetVersionId),
    finalArtifactDocumentId: normalizeText(proof?.finalArtifactDocumentId),
  }
  throw error
}

function sampleCompletionGuard(routeVariant = 'resale_existing_property') {
  return {
    version: OTP_AGENT_REVIEW_COMPLETION_GUARD_PHASE36_VERSION,
    contract: OTP_AGENT_REVIEW_COMPLETION_GUARD_CONTRACT,
    status: OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_STATUS,
    canFinalizeReviewedOtp: true,
    packetId: `otp-phase37-${normalizeKey(routeVariant)}-packet`,
    packetVersionId: `otp-phase37-${normalizeKey(routeVariant)}-version`,
    routeVariant,
    reviewRecordFingerprint: `phase37-review-${normalizeKey(routeVariant)}`,
    termsFingerprint: `phase37-terms-${normalizeKey(routeVariant)}`,
    routeLegalFingerprint: `phase37-legal-${normalizeKey(routeVariant)}`,
  }
}

function sampleArtifact(guard = sampleCompletionGuard(), overrides = {}) {
  return {
    ready: true,
    documentId: `doc-${guard.packetVersionId}`,
    packetId: guard.packetId,
    packetVersionId: guard.packetVersionId,
    bucket: 'legal-final-artifacts',
    path: `final-signed/${guard.packetId}/${guard.packetVersionId}.pdf`,
    sha256: 'a'.repeat(64),
    byteLength: 420000,
    mediaType: 'application/pdf',
    routeVariant: guard.routeVariant,
    reviewRecordFingerprint: guard.reviewRecordFingerprint,
    termsFingerprint: guard.termsFingerprint,
    routeLegalFingerprint: guard.routeLegalFingerprint,
    ...overrides,
  }
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpFinalSignedArtifactProofPhase37Audit({
  checkedAt = new Date().toISOString(),
  phase36Audit = null,
  packetServiceSource = '',
  packageJson = {},
} = {}) {
  const checks = []
  const phase36Ready = !phase36Audit || phase36Audit.status === OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_STATUS
  const resaleGuard = sampleCompletionGuard('resale_existing_property')
  const developmentGuard = sampleCompletionGuard('new_development')
  const resaleProof = buildOtpFinalSignedArtifactProof({
    completionGuard: resaleGuard,
    finalArtifact: sampleArtifact(resaleGuard),
    checkedAt,
  })
  const developmentProof = buildOtpFinalSignedArtifactProof({
    completionGuard: developmentGuard,
    finalArtifact: sampleArtifact(developmentGuard),
    checkedAt,
  })
  const wrongVersionProof = buildOtpFinalSignedArtifactProof({
    completionGuard: resaleGuard,
    finalArtifact: sampleArtifact(resaleGuard, { packetVersionId: 'wrong-version' }),
    checkedAt,
  })
  const unsafeStorageProof = buildOtpFinalSignedArtifactProof({
    completionGuard: resaleGuard,
    finalArtifact: sampleArtifact(resaleGuard, {
      documentId: '',
      bucket: 'https://example.invalid/bucket',
      path: '/tmp/final.pdf',
    }),
    checkedAt,
  })
  const routeMismatchProof = buildOtpFinalSignedArtifactProof({
    completionGuard: resaleGuard,
    finalArtifact: sampleArtifact(resaleGuard, { routeVariant: 'new_development' }),
    checkedAt,
  })
  const missingChecksumProof = buildOtpFinalSignedArtifactProof({
    completionGuard: resaleGuard,
    finalArtifact: sampleArtifact(resaleGuard, { sha256: '', byteLength: 0 }),
    checkedAt,
  })

  addCheck(checks, phase36Ready, 'PHASE37_PHASE36_COMPLETION_GUARD_READY', 'Final artifact proof starts only after Phase 36 completion guard is ready.')
  addCheck(
    checks,
    resaleProof.canRecordFinalSignedArtifact && developmentProof.canRecordFinalSignedArtifact,
    'PHASE37_BOTH_ROUTES_ARTIFACTS_PROVED',
    'Resale and new-development OTPs can record final signed PDF artifacts after completion.',
  )
  addCheck(
    checks,
    resaleProof.finalArtifactVersionId === resaleProof.packetVersionId &&
      developmentProof.finalArtifactVersionId === developmentProof.packetVersionId,
    'PHASE37_EXACT_COMPLETED_VERSION_BOUND',
    'The final artifact identity is bound to the exact reviewed/generated/completed packet version.',
  )
  addCheck(
    checks,
    resaleProof.routeLegalPreservationMode === 'explicit_final_artifact_fingerprints' &&
      developmentProof.routeLegalPreservationMode === 'explicit_final_artifact_fingerprints',
    'PHASE37_ROUTE_LEGAL_FINGERPRINTS_PRESERVED',
    'Route, review-record and legal-terms fingerprints are preserved on the final artifact proof.',
  )
  addCheck(
    checks,
    [resaleProof, developmentProof].every((proof) =>
      proof.finalArtifactDocumentId &&
      proof.finalArtifactSha256 &&
      proof.finalArtifactByteLength > 100 &&
      proof.finalArtifactMediaType === 'application/pdf' &&
      proof.storageMode === 'canonical_document_record',
    ),
    'PHASE37_SAFE_FINAL_ARTIFACT_STORAGE',
    'The final signed artifact has canonical document identity, PDF metadata, checksum and size evidence.',
  )
  addCheck(
    checks,
    wrongVersionProof.canRecordFinalSignedArtifact === false &&
      wrongVersionProof.blockerCodes.includes('final_artifact_version_mismatch'),
    'PHASE37_WRONG_VERSION_ARTIFACT_BLOCKED',
    'A final artifact from another packet version is blocked.',
  )
  addCheck(
    checks,
    routeMismatchProof.canRecordFinalSignedArtifact === false &&
      routeMismatchProof.blockerCodes.includes('route_variant_mismatch'),
    'PHASE37_ROUTE_FINGERPRINT_MISMATCH_BLOCKED',
    'A final artifact carrying a conflicting route fingerprint is blocked.',
  )
  addCheck(
    checks,
    unsafeStorageProof.canRecordFinalSignedArtifact === false &&
      unsafeStorageProof.blockerCodes.some((code) => code.startsWith('unsafe_final_artifact')),
    'PHASE37_UNSAFE_STORAGE_BLOCKED',
    'Temporary paths, public URLs and unresolved storage identities are blocked.',
  )
  addCheck(
    checks,
    missingChecksumProof.canRecordFinalSignedArtifact === false &&
      missingChecksumProof.blockerCodes.includes('missing_final_artifact_sha256') &&
      missingChecksumProof.blockerCodes.includes('missing_final_artifact_byte_length'),
    'PHASE37_MISSING_ARTIFACT_EVIDENCE_BLOCKED',
    'A final artifact without checksum and byte-length evidence is blocked.',
  )
  addCheck(
    checks,
    packetServiceSource.includes('buildOtpFinalSignedArtifactProof') &&
      packetServiceSource.includes('assertOtpFinalSignedArtifactProof') &&
      packetServiceSource.includes('otp_final_signed_artifact_proof_recorded') &&
      packetServiceSource.includes('otpFinalSignedArtifactProof'),
    'PHASE37_PACKET_SERVICE_FINAL_ARTIFACT_PROOF_WIRED',
    'generateFinalSignedPacketDocument records the Phase 37 final signed artifact proof after generation.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-final-signed-artifact-proof-phase37'] === 'node scripts/otp-final-signed-artifact-proof-phase37.test.mjs' &&
      packageJson.scripts?.['report:otp-final-signed-artifact-proof-phase37'] === 'node scripts/report-otp-final-signed-artifact-proof-phase37.mjs',
    'PHASE37_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 37 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_FINAL_SIGNED_ARTIFACT_PROOF_PHASE37_VERSION,
    contract: OTP_FINAL_SIGNED_ARTIFACT_PROOF_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_FINAL_SIGNED_ARTIFACT_PROOF_REMEDIATION_REQUIRED' : OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    proofRows: Object.freeze([resaleProof, developmentProof, wrongVersionProof, routeMismatchProof, unsafeStorageProof, missingChecksumProof]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      approvedArtifactCount: [resaleProof, developmentProof].filter((row) => row.canRecordFinalSignedArtifact).length,
      blockedUnsafeArtifactCount: [wrongVersionProof, routeMismatchProof, unsafeStorageProof, missingChecksumProof]
        .filter((row) => !row.canRecordFinalSignedArtifact).length,
      checksumProofCount: [resaleProof, developmentProof].filter((row) => row.finalArtifactSha256).length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 38,
      key: 'otp_end_to_end_staging_walkthrough',
      label: 'End-to-End Staging Walkthrough',
    }),
  })
}

export function formatOtpFinalSignedArtifactProofPhase37Markdown(report = buildOtpFinalSignedArtifactProofPhase37Audit()) {
  return [
    '# OTP Generator Phase 37 Final Signed Artifact Proof',
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
        ['Approved final artifacts', report.summary.approvedArtifactCount],
        ['Unsafe artifacts blocked', report.summary.blockedUnsafeArtifactCount],
        ['Checksum proofs', report.summary.checksumProofCount],
        ['Blockers', report.summary.blockerCount],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
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
    '## Artifact Proofs',
    '',
    table(
      ['Route', 'Version', 'Document', 'Storage', 'PDF', 'Allowed', 'Blockers'],
      report.proofRows.map((row) => [
        row.routeVariant || 'unresolved',
        row.finalArtifactVersionId || 'none',
        row.finalArtifactDocumentId || 'none',
        row.storageMode,
        `${row.finalArtifactMediaType || 'unknown'} / ${row.finalArtifactByteLength || 0} bytes`,
        row.canRecordFinalSignedArtifact ? 'yes' : 'no',
        row.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 37 proves the final signed OTP PDF artifact is created from the exact completed packet version, preserves route/legal proof fingerprints where supplied, carries checksum and size evidence, and resolves to durable artifact storage. It does not send live signing links or mutate production route defaults.',
    '',
  ].join('\n')
}
