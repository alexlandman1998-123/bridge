import {
  OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_CONTRACT,
  OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION,
  OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_STATUS,
  buildOtpAgentReviewSigningEnvelopeAlignment,
} from './otpAgentReviewSigningEnvelopeAlignmentPhase33.js'

export const OTP_AGENT_REVIEW_DISPATCH_GUARD_PHASE34_VERSION = 'otp_agent_review_dispatch_guard_phase34_v1'
export const OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_STATUS = 'OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_FOR_SIGNER_SESSION_EXTENSION'
export const OTP_AGENT_REVIEW_DISPATCH_GUARD_CONTRACT = 'otp-vnext-agent-review-dispatch-guard-phase34-v1'

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

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function rowRole(row = {}) {
  return normalizeKey(row.signerRole || row.signer_role || row.role)
}

function rowFieldType(row = {}) {
  return normalizeKey(row.fieldType || row.field_type)
}

function rowPageNumber(row = {}) {
  const page = Number(row.pageNumber ?? row.page_number)
  return Number.isFinite(page) ? Math.max(1, Math.round(page)) : 1
}

function rowRequired(row = {}) {
  return row.required !== false
}

export function buildOtpSigningSeedFromSigningSummary(summary = {}) {
  const fields = list(summary.fields).map((field) => ({
    signerRole: rowRole(field),
    signerName: normalizeText(field.signerName || field.signer_name),
    signerEmail: normalizeText(field.signerEmail || field.signer_email),
    fieldType: rowFieldType(field),
    pageNumber: rowPageNumber(field),
    required: rowRequired(field),
  })).filter((field) => field.signerRole && field.fieldType)
  const signers = list(summary.signers).map((signer) => ({
    signerRole: rowRole(signer),
    signerName: normalizeText(signer.signerName || signer.signer_name),
    signerEmail: normalizeText(signer.signerEmail || signer.signer_email),
    signingOrder: Number(signer.signingOrder || signer.signing_order || 0),
    status: normalizeText(signer.status),
  })).filter((signer) => signer.signerRole)
  const pageCount = Math.max(1, ...fields.map((field) => field.pageNumber))
  return Object.freeze({
    pageCount,
    signers: Object.freeze(signers),
    fields: Object.freeze(fields),
    layoutSource: normalizeText(summary.layoutSource || summary.layout_source || 'saved_signing_summary'),
  })
}

export function buildOtpAgentReviewDispatchGuardDecision({
  alignment = null,
  targetSignerRole = '',
  dispatchMode = 'signer_specific_runtime_dispatch',
  regenerate = false,
  packetId = '',
  packetVersionId = '',
  checkedAt = new Date().toISOString(),
} = {}) {
  const normalizedTargetSignerRole = normalizeKey(targetSignerRole)
  const expectedRoles = list(alignment?.expectedSignerRoles).map(normalizeKey)
  const signerRoles = list(alignment?.signerRoles).map(normalizeKey)
  const allowedRoles = unique(expectedRoles.length ? expectedRoles : signerRoles)
  const blockerCodes = [
    alignment ? '' : 'missing_phase33_alignment_receipt',
    alignment?.contract === OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_CONTRACT ? '' : 'phase33_alignment_contract_mismatch',
    alignment?.version === OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION ? '' : 'phase33_alignment_version_mismatch',
    alignment?.canPrepareSigningEnvelope === true ? '' : 'phase33_alignment_not_ready',
    list(alignment?.blockerCodes).length === 0 ? '' : 'phase33_alignment_has_blockers',
    normalizedTargetSignerRole ? '' : 'missing_target_signer_role',
    normalizedTargetSignerRole && allowedRoles.includes(normalizedTargetSignerRole)
      ? ''
      : normalizedTargetSignerRole
        ? `target_signer_role_not_aligned:${normalizedTargetSignerRole}`
        : '',
    normalizedTargetSignerRole && signerRoles.length && !signerRoles.includes(normalizedTargetSignerRole)
      ? `target_signer_role_missing_from_signers:${normalizedTargetSignerRole}`
      : '',
  ].filter(Boolean)
  const canCreateSigningDispatch = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_AGENT_REVIEW_DISPATCH_GUARD_PHASE34_VERSION,
    contract: OTP_AGENT_REVIEW_DISPATCH_GUARD_CONTRACT,
    checkedAt,
    status: canCreateSigningDispatch
      ? OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_STATUS
      : 'OTP_AGENT_REVIEW_DISPATCH_GUARD_BLOCKED',
    canCreateSigningDispatch,
    blockerCodes: Object.freeze(unique(blockerCodes)),
    dispatchMode,
    regenerate: regenerate === true,
    targetSignerRole: normalizedTargetSignerRole,
    allowedSignerRoles: Object.freeze(allowedRoles),
    routeVariant: normalizeKey(alignment?.routeVariant),
    routeLabel: normalizeText(alignment?.routeLabel),
    packetId: normalizeText(packetId),
    packetVersionId: normalizeText(packetVersionId),
    signingAlignmentContract: normalizeText(alignment?.contract),
    signingAlignmentVersion: normalizeText(alignment?.version),
    signingAlignmentReadyStatus: OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_STATUS,
    reviewRecordFingerprint: normalizeText(alignment?.reviewRecordFingerprint),
    termsFingerprint: normalizeText(alignment?.termsFingerprint),
    receiptFingerprint: `phase34:${normalizeKey(alignment?.routeVariant)}:${normalizedTargetSignerRole}:${normalizeText(alignment?.reviewRecordFingerprint)}:${normalizeText(alignment?.termsFingerprint)}`,
  })
}

export function assertOtpAgentReviewDispatchGuard(decision = {}) {
  if (decision?.canCreateSigningDispatch === true) return decision
  const error = new Error('OTP signing dispatch is blocked until the Phase 33 agent-review signing alignment receipt is valid for this signer.')
  error.code = 'OTP_AGENT_REVIEW_DISPATCH_GUARD_BLOCKED'
  error.details = {
    blockerCodes: list(decision?.blockerCodes),
    targetSignerRole: normalizeText(decision?.targetSignerRole),
    routeVariant: normalizeText(decision?.routeVariant),
  }
  throw error
}

export function buildOtpAgentReviewDispatchGuardForSigningSummary({
  packet = null,
  version = null,
  generationPayload = null,
  signingSummary = {},
  targetSignerRole = '',
  regenerate = false,
  checkedAt = new Date().toISOString(),
} = {}) {
  const seed = buildOtpSigningSeedFromSigningSummary(signingSummary)
  const alignment = buildOtpAgentReviewSigningEnvelopeAlignment({
    packet,
    version,
    generationPayload,
    seed,
    pageCount: seed.pageCount,
  })
  return buildOtpAgentReviewDispatchGuardDecision({
    alignment,
    targetSignerRole,
    regenerate,
    packetId: packet?.id,
    packetVersionId: version?.id,
    checkedAt,
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

function buildSampleAlignment(routeVariant = 'resale_existing_property', checkedAt = new Date().toISOString()) {
  const signerRoles = routeVariant === 'new_development'
    ? ['purchaser_1', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent']
    : ['purchaser_1', 'seller']
  return Object.freeze({
    version: OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION,
    contract: OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_CONTRACT,
    canPrepareSigningEnvelope: true,
    blockerCodes: Object.freeze([]),
    routeVariant,
    routeLabel: routeVariant === 'new_development' ? 'New development OTP' : 'Existing / resale property OTP',
    expectedSignerRoles: Object.freeze(signerRoles),
    signerRoles: Object.freeze(signerRoles),
    reviewRecordFingerprint: `phase33-review-${normalizeKey(routeVariant)}-${checkedAt}`,
    termsFingerprint: `phase33-terms-${normalizeKey(routeVariant)}-${checkedAt}`,
  })
}

export function buildOtpAgentReviewDispatchGuardPhase34Audit({
  checkedAt = new Date().toISOString(),
  phase33Audit = null,
  packetServiceSource = '',
  workspaceSource = '',
  packageJson = {},
} = {}) {
  const checks = []
  const phase33Ready = !phase33Audit || phase33Audit.status === OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_STATUS
  const resaleGuard = buildOtpAgentReviewDispatchGuardDecision({
    alignment: buildSampleAlignment('resale_existing_property', checkedAt),
    targetSignerRole: 'seller',
    packetId: 'otp-phase34-resale-packet',
    packetVersionId: 'otp-phase34-resale-version',
    checkedAt,
  })
  const developmentGuard = buildOtpAgentReviewDispatchGuardDecision({
    alignment: buildSampleAlignment('new_development', checkedAt),
    targetSignerRole: 'developer_authorised_signatory',
    packetId: 'otp-phase34-development-packet',
    packetVersionId: 'otp-phase34-development-version',
    checkedAt,
  })
  const missingReceiptGuard = buildOtpAgentReviewDispatchGuardDecision({
    alignment: null,
    targetSignerRole: 'seller',
    checkedAt,
  })
  const missingTargetGuard = buildOtpAgentReviewDispatchGuardDecision({
    alignment: buildSampleAlignment('resale_existing_property', checkedAt),
    targetSignerRole: '',
    checkedAt,
  })
  const leakedTargetGuard = buildOtpAgentReviewDispatchGuardDecision({
    alignment: buildSampleAlignment('resale_existing_property', checkedAt),
    targetSignerRole: 'developer_authorised_signatory',
    checkedAt,
  })

  addCheck(checks, phase33Ready, 'PHASE34_PHASE33_ALIGNMENT_READY', 'Dispatch guard starts only after Phase 33 signing-envelope alignment is ready.')
  addCheck(
    checks,
    resaleGuard.canCreateSigningDispatch && developmentGuard.canCreateSigningDispatch,
    'PHASE34_BOTH_ROUTES_CAN_DISPATCH_WHEN_ALIGNED',
    'Resale and new-development OTP routes can prepare signer-specific dispatch only with a valid Phase 33 receipt.',
  )
  addCheck(
    checks,
    missingReceiptGuard.canCreateSigningDispatch === false &&
      missingReceiptGuard.blockerCodes.includes('missing_phase33_alignment_receipt'),
    'PHASE34_MISSING_ALIGNMENT_RECEIPT_BLOCKED',
    'OTP dispatch is blocked when the Phase 33 alignment receipt is missing.',
  )
  addCheck(
    checks,
    missingTargetGuard.canCreateSigningDispatch === false &&
      missingTargetGuard.blockerCodes.includes('missing_target_signer_role'),
    'PHASE34_SIGNER_SPECIFIC_TARGET_REQUIRED',
    'OTP dispatch requires a signer-specific target role before any signing link is created.',
  )
  addCheck(
    checks,
    leakedTargetGuard.canCreateSigningDispatch === false &&
      leakedTargetGuard.blockerCodes.includes('target_signer_role_not_aligned:developer_authorised_signatory'),
    'PHASE34_ROUTE_ROLE_LEAK_TARGET_BLOCKED',
    'A resale dispatch cannot target a new-development signer role.',
  )
  addCheck(
    checks,
    packetServiceSource.includes('buildOtpAgentReviewDispatchGuardForSigningSummary') &&
      packetServiceSource.includes('assertOtpAgentReviewDispatchGuard') &&
      packetServiceSource.includes('otp_agent_review_dispatch_guard_passed') &&
      packetServiceSource.includes('otpAgentReviewDispatchGuard'),
    'PHASE34_PACKET_SERVICE_DISPATCH_GUARD_WIRED',
    'generateSigningLinks builds and asserts the OTP dispatch guard before creating signer links.',
  )
  addCheck(
    checks,
    workspaceSource.includes('OTP signing dispatches do not reference one immutable packet version') &&
      workspaceSource.includes('OTP_SIGNING_DISPATCH_NOT_TARGETED') &&
      workspaceSource.includes('targetSignerRole: signerRole'),
    'PHASE34_WORKSPACE_SIGNER_SPECIFIC_DISPATCH_WIRED',
    'The agent workspace already stages OTP dispatch per signer before sending email.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-agent-review-dispatch-guard-phase34'] === 'node scripts/otp-agent-review-dispatch-guard-phase34.test.mjs' &&
      packageJson.scripts?.['report:otp-agent-review-dispatch-guard-phase34'] === 'node scripts/report-otp-agent-review-dispatch-guard-phase34.mjs',
    'PHASE34_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 34 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_AGENT_REVIEW_DISPATCH_GUARD_PHASE34_VERSION,
    contract: OTP_AGENT_REVIEW_DISPATCH_GUARD_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_AGENT_REVIEW_DISPATCH_GUARD_REMEDIATION_REQUIRED' : OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    guardRows: Object.freeze([resaleGuard, developmentGuard, missingReceiptGuard, missingTargetGuard, leakedTargetGuard]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      allowedRouteCount: [resaleGuard, developmentGuard].filter((guard) => guard.canCreateSigningDispatch).length,
      blockedUnsafeDispatchCount: [missingReceiptGuard, missingTargetGuard, leakedTargetGuard].filter((guard) => !guard.canCreateSigningDispatch).length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 35,
      key: 'otp_agent_review_signer_session_runtime_alignment',
      label: 'OTP Agent Review Signer Session Runtime Alignment',
    }),
  })
}

export function formatOtpAgentReviewDispatchGuardPhase34Markdown(report = buildOtpAgentReviewDispatchGuardPhase34Audit()) {
  return [
    '# OTP Generator Phase 34 Agent Review Dispatch Guard Runtime Alignment',
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
        ['Aligned routes allowed', report.summary.allowedRouteCount],
        ['Unsafe dispatch attempts blocked', report.summary.blockedUnsafeDispatchCount],
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
    '## Guard Decisions',
    '',
    table(
      ['Route', 'Target Role', 'Allowed', 'Blockers'],
      report.guardRows.map((guard) => [
        guard.routeLabel || guard.routeVariant || 'unresolved',
        guard.targetSignerRole || 'none',
        guard.canCreateSigningDispatch ? 'yes' : 'no',
        guard.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 34 blocks OTP signing-link creation unless the Phase 33 agent-review signing alignment receipt is valid for the route and target signer. It does not email signers, complete signer sessions, create final signed artifacts, or mutate production templates.',
    '',
  ].join('\n')
}
