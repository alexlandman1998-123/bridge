import {
  OTP_AGENT_REVIEW_SIGNER_SESSION_READY_STATUS,
} from './otpAgentReviewSignerSessionPhase35.js'
import {
  OTP_AGENT_REVIEW_UI_CONTRACT,
} from './otpAgentReviewUiPhase31.js'

export const OTP_AGENT_REVIEW_COMPLETION_GUARD_PHASE36_VERSION = 'otp_agent_review_completion_guard_phase36_v1'
export const OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_STATUS = 'OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_FOR_FINAL_ARTIFACT_PROOF'
export const OTP_AGENT_REVIEW_COMPLETION_GUARD_CONTRACT = 'otp-vnext-agent-review-completion-guard-phase36-v1'

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

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function rowVersionId(row = {}) {
  return normalizeText(row.packetVersionId || row.packet_version_id)
}

function rowPacketId(row = {}) {
  return normalizeText(row.packetId || row.packet_id)
}

function rowRole(row = {}) {
  return normalizeKey(row.signerRole || row.signer_role || row.role)
}

function rowFieldType(row = {}) {
  return normalizeKey(row.fieldType || row.field_type || row.type)
}

function rowStatus(row = {}) {
  return normalizeKey(row.status)
}

function hasSignatureAsset(row = {}) {
  return Boolean(normalizeText(row.signatureAssetPath || row.signature_asset_path || row.assetPath || row.asset_path))
}

function resolveReviewProof(version = {}) {
  const placeholders = object(version.placeholders_resolved_json || version.placeholdersResolvedJson)
  const proof = object(placeholders.otpAgentReviewRuntimeProof || placeholders.otp_agent_review_runtime_proof)
  const record = object(placeholders.otpAgentReviewRecord || placeholders.otp_agent_review_record)
  return {
    present: proof.present === true || Boolean(record.confirmed),
    confirmed: proof.confirmed === true || record.confirmed === true,
    contract: normalizeText(proof.contract || record.contract),
    routeVariant: normalizeKey(proof.routeVariant || record.routeVariant || record.route_variant),
    reviewRecordFingerprint: normalizeText(proof.reviewRecordFingerprint || proof.review_record_fingerprint),
    termsFingerprint: normalizeText(proof.termsFingerprint || proof.terms_fingerprint),
  }
}

export function buildOtpAgentReviewCompletionGuardDecision({
  packet = {},
  version = {},
  signingSummary = {},
  checkedAt = new Date().toISOString(),
} = {}) {
  const packetId = normalizeText(packet.id || signingSummary.packetId || signingSummary.packet_id)
  const packetVersionId = normalizeText(version.id || signingSummary.packetVersionId || signingSummary.packet_version_id)
  const signers = list(signingSummary.signers)
  const fields = list(signingSummary.fields)
  const requiredFields = fields.filter((field) => field.required !== false)
  const incompleteSigners = signers.filter((signer) => rowStatus(signer) !== 'signed')
  const incompleteFields = requiredFields.filter((field) => rowStatus(field) !== 'completed')
  const missingAssets = requiredFields.filter((field) => {
    const type = rowFieldType(field)
    return ['signature', 'initial'].includes(type) && !hasSignatureAsset(field)
  })
  const signerVersionMismatches = signers.filter((signer) => rowVersionId(signer) && rowVersionId(signer) !== packetVersionId)
  const fieldVersionMismatches = fields.filter((field) => rowVersionId(field) && rowVersionId(field) !== packetVersionId)
  const signerPacketMismatches = signers.filter((signer) => rowPacketId(signer) && rowPacketId(signer) !== packetId)
  const fieldPacketMismatches = fields.filter((field) => rowPacketId(field) && rowPacketId(field) !== packetId)
  const reviewProof = resolveReviewProof(version)
  const requiredSignerRoles = unique(signers.map(rowRole))
  const completedSignerRoles = unique(signers.filter((signer) => rowStatus(signer) === 'signed').map(rowRole))

  const blockerCodes = [
    normalizeKey(packet.packet_type || packet.packetType) === 'otp' ? '' : 'packet_type_not_otp',
    packetId ? '' : 'missing_packet_id',
    packetVersionId ? '' : 'missing_packet_version_id',
    signers.length ? '' : 'missing_signers',
    requiredFields.length ? '' : 'missing_required_fields',
    ...incompleteSigners.map((signer) => `required_signer_incomplete:${rowRole(signer) || 'unknown'}`),
    ...incompleteFields.map((field) => `required_field_incomplete:${rowRole(field) || 'unknown'}:${rowFieldType(field) || 'unknown'}`),
    ...missingAssets.map((field) => `required_asset_missing:${rowRole(field) || 'unknown'}:${rowFieldType(field) || 'unknown'}`),
    ...signerVersionMismatches.map((signer) => `signer_version_mismatch:${rowRole(signer) || 'unknown'}`),
    ...fieldVersionMismatches.map((field) => `field_version_mismatch:${rowRole(field) || 'unknown'}:${rowFieldType(field) || 'unknown'}`),
    ...signerPacketMismatches.map((signer) => `signer_packet_mismatch:${rowRole(signer) || 'unknown'}`),
    ...fieldPacketMismatches.map((field) => `field_packet_mismatch:${rowRole(field) || 'unknown'}:${rowFieldType(field) || 'unknown'}`),
    reviewProof.present ? '' : 'missing_agent_review_runtime_proof',
    reviewProof.confirmed ? '' : 'agent_review_runtime_proof_not_confirmed',
    reviewProof.contract === OTP_AGENT_REVIEW_UI_CONTRACT ? '' : 'agent_review_contract_mismatch',
  ].filter(Boolean)
  const canFinalizeReviewedOtp = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_AGENT_REVIEW_COMPLETION_GUARD_PHASE36_VERSION,
    contract: OTP_AGENT_REVIEW_COMPLETION_GUARD_CONTRACT,
    checkedAt,
    status: canFinalizeReviewedOtp
      ? OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_STATUS
      : 'OTP_AGENT_REVIEW_COMPLETION_GUARD_BLOCKED',
    canFinalizeReviewedOtp,
    blockerCodes: Object.freeze(unique(blockerCodes)),
    packetId,
    packetVersionId,
    routeVariant: reviewProof.routeVariant,
    requiredSignerRoles: Object.freeze(requiredSignerRoles),
    completedSignerRoles: Object.freeze(completedSignerRoles),
    signerCount: signers.length,
    completedSignerCount: completedSignerRoles.length,
    requiredFieldCount: requiredFields.length,
    completedRequiredFieldCount: requiredFields.length - incompleteFields.length,
    missingAssetCount: missingAssets.length,
    signerVersionMismatchCount: signerVersionMismatches.length,
    fieldVersionMismatchCount: fieldVersionMismatches.length,
    reviewRecordFingerprint: reviewProof.reviewRecordFingerprint,
    termsFingerprint: reviewProof.termsFingerprint,
  })
}

export function assertOtpAgentReviewCompletionGuard(decision = {}) {
  if (decision?.canFinalizeReviewedOtp === true) return decision
  const error = new Error('OTP finalisation is blocked until every required signer and required field is complete on the exact reviewed/generated OTP version.')
  error.code = 'OTP_AGENT_REVIEW_COMPLETION_GUARD_BLOCKED'
  error.details = {
    blockerCodes: list(decision?.blockerCodes),
    packetId: normalizeText(decision?.packetId),
    packetVersionId: normalizeText(decision?.packetVersionId),
  }
  throw error
}

function sampleVersion(routeVariant = 'resale_existing_property') {
  return {
    id: `otp-phase36-${normalizeKey(routeVariant)}-version`,
    placeholders_resolved_json: {
      otpAgentReviewRecord: {
        confirmed: true,
        contract: OTP_AGENT_REVIEW_UI_CONTRACT,
        routeVariant,
      },
      otpAgentReviewRuntimeProof: {
        present: true,
        confirmed: true,
        contract: OTP_AGENT_REVIEW_UI_CONTRACT,
        routeVariant,
        reviewRecordFingerprint: `phase36-review-${normalizeKey(routeVariant)}`,
        termsFingerprint: `phase36-terms-${normalizeKey(routeVariant)}`,
      },
    },
  }
}

function sampleSummary({ packetId = 'otp-phase36-packet', versionId = 'otp-phase36-version', roles = ['purchaser_1', 'seller'], complete = true } = {}) {
  return {
    signers: roles.map((role, index) => ({
      packet_id: packetId,
      packet_version_id: versionId,
      signer_role: role,
      signing_order: index + 1,
      status: complete ? 'signed' : index === 0 ? 'signed' : 'sent',
    })),
    fields: roles.flatMap((role) => [
      {
        packet_id: packetId,
        packet_version_id: versionId,
        signer_role: role,
        field_type: 'signature',
        required: true,
        status: complete ? 'completed' : 'pending',
        signature_asset_path: complete ? `${role}/signature.png` : '',
      },
      {
        packet_id: packetId,
        packet_version_id: versionId,
        signer_role: role,
        field_type: 'date',
        required: true,
        status: complete ? 'completed' : 'pending',
      },
      {
        packet_id: packetId,
        packet_version_id: versionId,
        signer_role: role,
        field_type: 'initial',
        required: true,
        status: complete ? 'completed' : 'pending',
        signature_asset_path: complete ? `${role}/initial.png` : '',
      },
    ]),
  }
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpAgentReviewCompletionGuardPhase36Audit({
  checkedAt = new Date().toISOString(),
  phase35Audit = null,
  packetServiceSource = '',
  packageJson = {},
} = {}) {
  const checks = []
  const phase35Ready = !phase35Audit || phase35Audit.status === OTP_AGENT_REVIEW_SIGNER_SESSION_READY_STATUS
  const resaleVersion = sampleVersion('resale_existing_property')
  const developmentVersion = sampleVersion('new_development')
  const resaleComplete = buildOtpAgentReviewCompletionGuardDecision({
    packet: { id: 'otp-phase36-resale_existing_property-packet', packet_type: 'otp' },
    version: { ...resaleVersion, id: 'otp-phase36-resale_existing_property-version' },
    signingSummary: sampleSummary({
      packetId: 'otp-phase36-resale_existing_property-packet',
      versionId: 'otp-phase36-resale_existing_property-version',
      roles: ['purchaser_1', 'seller'],
      complete: true,
    }),
    checkedAt,
  })
  const developmentComplete = buildOtpAgentReviewCompletionGuardDecision({
    packet: { id: 'otp-phase36-new_development-packet', packet_type: 'otp' },
    version: { ...developmentVersion, id: 'otp-phase36-new_development-version' },
    signingSummary: sampleSummary({
      packetId: 'otp-phase36-new_development-packet',
      versionId: 'otp-phase36-new_development-version',
      roles: ['purchaser_1', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent'],
      complete: true,
    }),
    checkedAt,
  })
  const incompleteSigner = buildOtpAgentReviewCompletionGuardDecision({
    packet: { id: 'otp-phase36-incomplete-packet', packet_type: 'otp' },
    version: { ...resaleVersion, id: 'otp-phase36-incomplete-version' },
    signingSummary: sampleSummary({
      packetId: 'otp-phase36-incomplete-packet',
      versionId: 'otp-phase36-incomplete-version',
      roles: ['purchaser_1', 'seller'],
      complete: false,
    }),
    checkedAt,
  })
  const wrongVersion = buildOtpAgentReviewCompletionGuardDecision({
    packet: { id: 'otp-phase36-wrong-version-packet', packet_type: 'otp' },
    version: { ...resaleVersion, id: 'otp-phase36-correct-version' },
    signingSummary: sampleSummary({
      packetId: 'otp-phase36-wrong-version-packet',
      versionId: 'otp-phase36-other-version',
      roles: ['purchaser_1', 'seller'],
      complete: true,
    }),
    checkedAt,
  })
  const missingProof = buildOtpAgentReviewCompletionGuardDecision({
    packet: { id: 'otp-phase36-missing-proof-packet', packet_type: 'otp' },
    version: { id: 'otp-phase36-missing-proof-version', placeholders_resolved_json: {} },
    signingSummary: sampleSummary({
      packetId: 'otp-phase36-missing-proof-packet',
      versionId: 'otp-phase36-missing-proof-version',
      roles: ['purchaser_1', 'seller'],
      complete: true,
    }),
    checkedAt,
  })

  addCheck(checks, phase35Ready, 'PHASE36_PHASE35_SIGNER_SESSION_READY', 'Completion guard starts only after Phase 35 signer-session alignment is ready.')
  addCheck(
    checks,
    resaleComplete.canFinalizeReviewedOtp && developmentComplete.canFinalizeReviewedOtp,
    'PHASE36_BOTH_ROUTES_CAN_FINALIZE_WHEN_COMPLETE',
    'Resale and new-development OTPs can finalize only when every signer and required field is complete.',
  )
  addCheck(
    checks,
    incompleteSigner.canFinalizeReviewedOtp === false &&
      incompleteSigner.blockerCodes.some((code) => code.startsWith('required_signer_incomplete')) &&
      incompleteSigner.blockerCodes.some((code) => code.startsWith('required_field_incomplete')),
    'PHASE36_INCOMPLETE_SIGNERS_AND_FIELDS_BLOCKED',
    'Finalisation is blocked while any required signer or required field is incomplete.',
  )
  addCheck(
    checks,
    wrongVersion.canFinalizeReviewedOtp === false &&
      wrongVersion.blockerCodes.some((code) => code.includes('version_mismatch')),
    'PHASE36_WRONG_VERSION_BLOCKED',
    'Finalisation is blocked when signer or field evidence belongs to another packet version.',
  )
  addCheck(
    checks,
    missingProof.canFinalizeReviewedOtp === false &&
      missingProof.blockerCodes.includes('missing_agent_review_runtime_proof'),
    'PHASE36_MISSING_REVIEW_PROOF_BLOCKED',
    'Finalisation is blocked when the generated OTP version does not carry the agent-review runtime proof.',
  )
  addCheck(
    checks,
    packetServiceSource.includes('buildOtpAgentReviewCompletionGuardDecision') &&
      packetServiceSource.includes('assertOtpAgentReviewCompletionGuard') &&
      packetServiceSource.includes('otp_agent_review_completion_guard_passed') &&
      packetServiceSource.includes('SIGNERS_INCOMPLETE') &&
      packetServiceSource.includes('FIELDS_INCOMPLETE') &&
      packetServiceSource.includes('MISSING_SIGNATURE_ASSETS'),
    'PHASE36_PACKET_SERVICE_COMPLETION_GUARD_WIRED',
    'generateFinalSignedPacketDocument asserts the OTP completion guard before requesting the final signed document.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-agent-review-completion-guard-phase36'] === 'node scripts/otp-agent-review-completion-guard-phase36.test.mjs' &&
      packageJson.scripts?.['report:otp-agent-review-completion-guard-phase36'] === 'node scripts/report-otp-agent-review-completion-guard-phase36.mjs',
    'PHASE36_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 36 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_AGENT_REVIEW_COMPLETION_GUARD_PHASE36_VERSION,
    contract: OTP_AGENT_REVIEW_COMPLETION_GUARD_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_AGENT_REVIEW_COMPLETION_GUARD_REMEDIATION_REQUIRED' : OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    completionRows: Object.freeze([resaleComplete, developmentComplete, incompleteSigner, wrongVersion, missingProof]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      finalizedRouteCount: [resaleComplete, developmentComplete].filter((row) => row.canFinalizeReviewedOtp).length,
      blockedUnsafeCompletionCount: [incompleteSigner, wrongVersion, missingProof].filter((row) => !row.canFinalizeReviewedOtp).length,
      completedRequiredFieldCount: resaleComplete.completedRequiredFieldCount + developmentComplete.completedRequiredFieldCount,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 37,
      key: 'otp_final_signed_artifact_proof',
      label: 'Final Signed Artifact Proof',
    }),
  })
}

export function formatOtpAgentReviewCompletionGuardPhase36Markdown(report = buildOtpAgentReviewCompletionGuardPhase36Audit()) {
  return [
    '# OTP Generator Phase 36 Agent Review Completion Guard Runtime Alignment',
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
        ['Complete routes allowed', report.summary.finalizedRouteCount],
        ['Unsafe completions blocked', report.summary.blockedUnsafeCompletionCount],
        ['Completed required fields in allowed routes', report.summary.completedRequiredFieldCount],
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
    '## Completion Decisions',
    '',
    table(
      ['Route', 'Version', 'Signers', 'Fields', 'Assets Missing', 'Allowed', 'Blockers'],
      report.completionRows.map((row) => [
        row.routeVariant || 'unresolved',
        row.packetVersionId || 'none',
        `${row.completedSignerCount}/${row.signerCount}`,
        `${row.completedRequiredFieldCount}/${row.requiredFieldCount}`,
        row.missingAssetCount,
        row.canFinalizeReviewedOtp ? 'yes' : 'no',
        row.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 36 proves OTP finalisation is guarded by completed signers, completed required fields, required signature/initial assets, exact packet-version binding and the agent-review runtime proof. It does not create or inspect the final signed PDF artifact; that is Phase 37.',
    '',
  ].join('\n')
}
