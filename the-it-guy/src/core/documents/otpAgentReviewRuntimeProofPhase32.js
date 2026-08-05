import {
  OTP_AGENT_REVIEW_UI_CONTRACT,
  OTP_AGENT_REVIEW_UI_READY_STATUS,
} from './otpAgentReviewUiPhase31.js'

export const OTP_AGENT_REVIEW_RUNTIME_PROOF_PHASE32_VERSION = 'otp_agent_review_runtime_proof_phase32_v1'
export const OTP_AGENT_REVIEW_RUNTIME_PROOF_READY_STATUS = 'OTP_AGENT_REVIEW_RUNTIME_PROOF_READY_FOR_SIGNING_QA_EXTENSION'
export const OTP_AGENT_REVIEW_RUNTIME_PROOF_CONTRACT = 'otp-vnext-agent-review-runtime-proof-phase32-v1'

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

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function hashString(value = '') {
  let hash = 2166136261
  const input = String(value || '')
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function fingerprint(value) {
  return hashString(stableSerialize(value))
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function readGenerationPayload({ packet = null, version = null, canonicalOtp = null, generationPayload = null } = {}) {
  if (generationPayload && typeof generationPayload === 'object') return generationPayload
  const validation = version?.validation_summary_json && typeof version.validation_summary_json === 'object'
    ? version.validation_summary_json
    : {}
  if (validation.generationPayload && typeof validation.generationPayload === 'object') return validation.generationPayload
  const source = packet?.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : {}
  if (source.generationPayload && typeof source.generationPayload === 'object') return source.generationPayload
  const canonicalVersion = canonicalOtp?.version && typeof canonicalOtp.version === 'object' ? canonicalOtp.version : {}
  const canonicalSummary = canonicalVersion.validation_summary_json && typeof canonicalVersion.validation_summary_json === 'object'
    ? canonicalVersion.validation_summary_json
    : {}
  return canonicalSummary.generationPayload && typeof canonicalSummary.generationPayload === 'object'
    ? canonicalSummary.generationPayload
    : {}
}

export function buildOtpAgentReviewRuntimeGenerationProof({
  packet = null,
  version = null,
  canonicalOtp = null,
  generationPayload = null,
} = {}) {
  const payload = readGenerationPayload({ packet, version, canonicalOtp, generationPayload })
  const record = payload.otpAgentReviewRecord && typeof payload.otpAgentReviewRecord === 'object'
    ? payload.otpAgentReviewRecord
    : null
  const runtimeProof = payload.otpAgentReviewRuntimeProof && typeof payload.otpAgentReviewRuntimeProof === 'object'
    ? payload.otpAgentReviewRuntimeProof
    : null
  const recordFingerprint = record ? fingerprint(record) : null
  const termsFingerprint = record?.termsSnapshot && typeof record.termsSnapshot === 'object'
    ? fingerprint(record.termsSnapshot)
    : null
  const blockerCodes = [
    record ? '' : 'otp_agent_review_record_missing_from_generation_payload',
    record?.confirmed === true ? '' : 'otp_agent_review_not_confirmed',
    normalizeText(record?.contract) === OTP_AGENT_REVIEW_UI_CONTRACT ? '' : 'otp_agent_review_contract_mismatch',
    list(record?.blockerCodes).length === 0 ? '' : 'otp_agent_review_record_has_blockers',
    runtimeProof ? '' : 'otp_agent_review_runtime_proof_missing',
    runtimeProof?.confirmed === true ? '' : 'otp_agent_review_runtime_proof_not_confirmed',
    runtimeProof?.reviewRecordFingerprint && runtimeProof.reviewRecordFingerprint !== recordFingerprint
      ? 'otp_agent_review_fingerprint_mismatch'
      : '',
    runtimeProof?.termsFingerprint && termsFingerprint && runtimeProof.termsFingerprint !== termsFingerprint
      ? 'otp_agent_review_terms_fingerprint_mismatch'
      : '',
  ].filter(Boolean)

  return Object.freeze({
    version: OTP_AGENT_REVIEW_RUNTIME_PROOF_PHASE32_VERSION,
    contract: OTP_AGENT_REVIEW_RUNTIME_PROOF_CONTRACT,
    canTrustGeneratedOtp: blockerCodes.length === 0,
    blockerCodes: Object.freeze(blockerCodes),
    routeVariant: normalizeKey(record?.routeVariant || runtimeProof?.routeVariant),
    reviewContract: normalizeText(record?.contract) || null,
    reviewConfirmedAt: normalizeText(record?.confirmedAt || runtimeProof?.confirmedAt) || null,
    reviewRecordFingerprint: recordFingerprint,
    termsFingerprint,
    runtimeProof: runtimeProof ? Object.freeze({ ...runtimeProof }) : null,
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpAgentReviewRuntimeProofPhase32Audit({
  checkedAt = new Date().toISOString(),
  phase31Audit = null,
  packetServiceSource = '',
  workspaceSource = '',
  packageJson = {},
} = {}) {
  const checks = []
  const phase31Ready = !phase31Audit || phase31Audit.status === OTP_AGENT_REVIEW_UI_READY_STATUS
  const sampleRecord = Object.freeze({
    version: 'otp_agent_review_ui_phase31_v1',
    contract: OTP_AGENT_REVIEW_UI_CONTRACT,
    phase30Contract: 'otp-vnext-agent-controlled-edits-phase30-v1',
    confirmed: true,
    confirmedAt: checkedAt,
    confirmedByRole: 'agent',
    routeVariant: 'resale_existing_property',
    blockerCodes: [],
    warningCodes: [],
    termsSnapshot: {
      buyer_full_name: 'Runtime Buyer',
      seller_full_name: 'Runtime Seller',
      property_address: '32 Proof Avenue',
      purchase_price: 2850000,
    },
    standardConditionSelections: [{ conditionType: 'bond_approval' }],
    customConditionRequests: [],
  })
  const sampleGenerationPayload = Object.freeze({
    packetId: 'packet-phase32',
    otpAgentReviewRecord: sampleRecord,
    otpAgentReviewRuntimeProof: {
      required: true,
      present: true,
      confirmed: true,
      contract: sampleRecord.contract,
      version: sampleRecord.version,
      phase30Contract: sampleRecord.phase30Contract,
      routeVariant: sampleRecord.routeVariant,
      confirmedAt: sampleRecord.confirmedAt,
      confirmedByRole: sampleRecord.confirmedByRole,
      blockerCodes: [],
      termsFingerprint: fingerprint(sampleRecord.termsSnapshot),
      reviewRecordFingerprint: fingerprint(sampleRecord),
    },
  })
  const generatedProof = buildOtpAgentReviewRuntimeGenerationProof({
    version: {
      validation_summary_json: {
        generationPayload: sampleGenerationPayload,
      },
    },
  })
  const missingProof = buildOtpAgentReviewRuntimeGenerationProof({
    generationPayload: {
      packetId: 'packet-missing-phase32',
    },
  })

  addCheck(
    checks,
    phase31Ready,
    'PHASE32_PHASE31_UI_READY',
    'Runtime proof starts only after the agent review UI gate is ready.',
  )
  addCheck(
    checks,
    packetServiceSource.includes('resolveOtpAgentReviewRecordForGeneration') &&
      packetServiceSource.includes('buildOtpAgentReviewRuntimeProof') &&
      packetServiceSource.includes('otpAgentReviewRecord') &&
      packetServiceSource.includes('otpAgentReviewRuntimeProof'),
    'PHASE32_PACKET_SERVICE_RUNTIME_PAYLOAD_WIRED',
    'Packet generation resolves the confirmed review record and writes a compact runtime proof into generationPayload.',
  )
  addCheck(
    checks,
    workspaceSource.includes('otpAgentReviewRecord: otpAgentReviewUiState?.reviewRecord') &&
      workspaceSource.includes('requiresReviewBeforeGenerate'),
    'PHASE32_WORKSPACE_REVIEW_RECORD_REACHES_GENERATION',
    'The workspace sends only a confirmed review record after the Phase 31 generation gate.',
  )
  addCheck(
    checks,
    generatedProof.canTrustGeneratedOtp === true &&
      generatedProof.reviewContract === OTP_AGENT_REVIEW_UI_CONTRACT &&
      generatedProof.routeVariant === 'resale_existing_property',
    'PHASE32_GENERATED_VERSION_PROOF_VALIDATES',
    'Generated version metadata can prove it was created from a confirmed OTP review record.',
  )
  addCheck(
    checks,
    missingProof.canTrustGeneratedOtp === false &&
      missingProof.blockerCodes.includes('otp_agent_review_record_missing_from_generation_payload'),
    'PHASE32_MISSING_REVIEW_RECORD_BLOCKS_PROOF',
    'Generated OTP evidence is not trusted when the review record is absent.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-agent-review-runtime-proof-phase32'] === 'node scripts/otp-agent-review-runtime-proof-phase32.test.mjs' &&
      packageJson.scripts?.['report:otp-agent-review-runtime-proof-phase32'] === 'node scripts/report-otp-agent-review-runtime-proof-phase32.mjs',
    'PHASE32_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 32 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_AGENT_REVIEW_RUNTIME_PROOF_PHASE32_VERSION,
    contract: OTP_AGENT_REVIEW_RUNTIME_PROOF_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_AGENT_REVIEW_RUNTIME_PROOF_REMEDIATION_REQUIRED' : OTP_AGENT_REVIEW_RUNTIME_PROOF_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    summary: Object.freeze({
      blockerCount: blockers.length,
      generatedProofTrusted: generatedProof.canTrustGeneratedOtp,
      missingProofTrusted: missingProof.canTrustGeneratedOtp,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 33,
      key: 'otp_agent_review_signing_envelope_runtime_alignment',
      label: 'OTP Agent Review Signing Envelope Runtime Alignment',
    }),
    evidence: Object.freeze({
      phase31Status: phase31Audit?.status || 'not_supplied',
      generatedProof,
      missingProof,
    }),
  })
}

export function formatOtpAgentReviewRuntimeProofPhase32Markdown(report = buildOtpAgentReviewRuntimeProofPhase32Audit()) {
  return [
    '# OTP Generator Phase 32 Agent Review Runtime Generation Proof',
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
        ['Generated proof trusted', report.summary.generatedProofTrusted ? 'yes' : 'no'],
        ['Missing proof trusted', report.summary.missingProofTrusted ? 'yes' : 'no'],
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
    '## Runtime Boundary',
    '',
    'Phase 32 proves the generated OTP runtime carries the confirmed agent review record and proof fingerprint. It does not dispatch signing, alter signer roles, or mutate production templates.',
    '',
  ].join('\n')
}
