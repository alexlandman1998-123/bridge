import {
  buildOtpAgentReviewRuntimeGenerationProof,
} from './otpAgentReviewRuntimeProofPhase32.js'
import {
  OTP_AGENT_REVIEW_UI_CONTRACT,
  OTP_AGENT_REVIEW_UI_READY_STATUS,
} from './otpAgentReviewUiPhase31.js'
import { buildOtpSignatureInitialsManifest } from './otpSignatureInitials.js'

export const OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION = 'otp_agent_review_signing_alignment_phase33_v1'
export const OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_STATUS = 'OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_FOR_DISPATCH_GUARD_EXTENSION'
export const OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_CONTRACT = 'otp-vnext-agent-review-signing-alignment-phase33-v1'

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

function signerRole(row = {}) {
  return normalizeKey(row.signerRole || row.signer_role || row.role)
}

function fieldType(row = {}) {
  return normalizeKey(row.fieldType || row.field_type)
}

function fieldPage(row = {}) {
  const page = Number(row.pageNumber ?? row.page_number)
  return Number.isFinite(page) ? Math.max(1, Math.round(page)) : 1
}

function signerRolesFromSeed(seed = {}) {
  return unique(list(seed.signers).map(signerRole))
}

function fieldsFromSeed(seed = {}) {
  return list(seed.fields)
    .map((field) => ({
      signerRole: signerRole(field),
      fieldType: fieldType(field),
      pageNumber: fieldPage(field),
      required: field.required !== false,
    }))
    .filter((field) => field.signerRole && field.fieldType)
}

function routeForbiddenRoles(routeVariant = '') {
  const route = normalizeKey(routeVariant)
  return route === 'new_development'
    ? ['seller']
    : ['developer_authorised_signatory', 'contractor_authorised_signatory', 'agent']
}

export function buildOtpAgentReviewSigningEnvelopeAlignment({
  packet = null,
  version = null,
  generationPayload = null,
  seed = {},
  pageCount = null,
} = {}) {
  const runtimeProof = buildOtpAgentReviewRuntimeGenerationProof({
    packet,
    version,
    generationPayload,
  })
  const routeVariant = runtimeProof.routeVariant || 'resale_existing_property'
  const manifest = buildOtpSignatureInitialsManifest({ variant: routeVariant })
  const expectedRoles = manifest.requiredSignerRoles
  const expectedRoleSet = new Set(expectedRoles)
  const forbiddenRoles = routeForbiddenRoles(routeVariant)
  const signerRoles = signerRolesFromSeed(seed)
  const fields = fieldsFromSeed(seed)
  const fieldRoles = unique(fields.map((field) => field.signerRole))
  const resolvedPageCount = Number(pageCount || seed.pageCount || Math.max(1, ...fields.map((field) => field.pageNumber), 1))
  const missingSignerRoles = expectedRoles.filter((role) => !signerRoles.includes(role))
  const forbiddenSignerRoles = signerRoles.filter((role) => forbiddenRoles.includes(role))
  const forbiddenFieldRoles = fieldRoles.filter((role) => forbiddenRoles.includes(role))
  const unexpectedSignerRoles = signerRoles.filter((role) => !expectedRoleSet.has(role))
  const unexpectedFieldRoles = fieldRoles.filter((role) => !expectedRoleSet.has(role))
  const missingSignatureRoles = expectedRoles.filter((role) => !fields.some((field) =>
    field.signerRole === role && field.fieldType === 'signature' && field.required,
  ))
  const missingDateRoles = expectedRoles.filter((role) => !fields.some((field) =>
    field.signerRole === role && field.fieldType === 'date' && field.required,
  ))
  const initialsGaps = []
  for (const role of expectedRoles) {
    for (let page = 1; page <= resolvedPageCount; page += 1) {
      const found = fields.some((field) =>
        field.signerRole === role &&
        field.fieldType === 'initial' &&
        field.pageNumber === page &&
        field.required,
      )
      if (!found) initialsGaps.push(`${role}:page_${page}`)
    }
  }
  const blockerCodes = [
    runtimeProof.canTrustGeneratedOtp ? '' : 'otp_agent_review_runtime_proof_untrusted',
    runtimeProof.reviewContract === OTP_AGENT_REVIEW_UI_CONTRACT ? '' : 'otp_agent_review_contract_mismatch',
    ...missingSignerRoles.map((role) => `missing_signer_role:${role}`),
    ...forbiddenSignerRoles.map((role) => `forbidden_signer_role:${role}`),
    ...forbiddenFieldRoles.map((role) => `forbidden_field_role:${role}`),
    ...unexpectedSignerRoles.map((role) => `unexpected_signer_role:${role}`),
    ...unexpectedFieldRoles.map((role) => `unexpected_field_role:${role}`),
    ...missingSignatureRoles.map((role) => `missing_signature_field:${role}`),
    ...missingDateRoles.map((role) => `missing_date_field:${role}`),
    ...initialsGaps.map((gap) => `missing_initial_field:${gap}`),
  ].filter(Boolean)

  return Object.freeze({
    version: OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION,
    contract: OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_CONTRACT,
    canPrepareSigningEnvelope: blockerCodes.length === 0,
    blockerCodes: Object.freeze(unique(blockerCodes)),
    routeVariant,
    routeLabel: manifest.variantLabel,
    reviewRecordFingerprint: runtimeProof.reviewRecordFingerprint,
    termsFingerprint: runtimeProof.termsFingerprint,
    expectedSignerRoles: Object.freeze(expectedRoles),
    signerRoles: Object.freeze(signerRoles),
    fieldRoles: Object.freeze(fieldRoles),
    fieldCount: fields.length,
    pageCount: resolvedPageCount,
    initialsPolicy: manifest.initialsRepeatPolicy,
    datePolicy: manifest.dateFieldPolicy,
    layoutContract: manifest.layoutContract,
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

function buildSampleSeed(routeVariant = 'resale_existing_property', pageCount = 3) {
  const manifest = buildOtpSignatureInitialsManifest({ variant: routeVariant })
  return {
    pageCount,
    signers: manifest.roles.map((role) => ({
      signerRole: role.role,
      signerName: role.label,
      signerEmail: `${role.role}@phase33.example.test`,
    })),
    fields: manifest.roles.flatMap((role) => [
      { signerRole: role.role, fieldType: 'signature', pageNumber: pageCount, required: true },
      { signerRole: role.role, fieldType: 'date', pageNumber: pageCount, required: true },
      ...Array.from({ length: pageCount }, (_, index) => ({
        signerRole: role.role,
        fieldType: 'initial',
        pageNumber: index + 1,
        required: true,
      })),
    ]),
  }
}

function buildSampleGenerationPayload(routeVariant = 'resale_existing_property', checkedAt = new Date().toISOString()) {
  const record = {
    version: 'otp_agent_review_ui_phase31_v1',
    contract: OTP_AGENT_REVIEW_UI_CONTRACT,
    phase30Contract: 'otp-vnext-agent-controlled-edits-phase30-v1',
    confirmed: true,
    confirmedAt: checkedAt,
    confirmedByRole: 'agent',
    routeVariant,
    blockerCodes: [],
    warningCodes: [],
    termsSnapshot: {
      buyer_full_name: 'Signing Buyer',
      seller_full_name: routeVariant === 'new_development' ? '' : 'Signing Seller',
      developer_name: routeVariant === 'new_development' ? 'Signing Developer' : '',
      property_address: '33 Proof Avenue',
      purchase_price: 2850000,
    },
    standardConditionSelections: [],
    customConditionRequests: [],
  }
  const runtimeProof = buildOtpAgentReviewRuntimeGenerationProof({
    generationPayload: {
      otpAgentReviewRecord: record,
      otpAgentReviewRuntimeProof: {
        required: true,
        present: true,
        confirmed: true,
        contract: record.contract,
        version: record.version,
        phase30Contract: record.phase30Contract,
        routeVariant,
        confirmedAt: record.confirmedAt,
        confirmedByRole: record.confirmedByRole,
        blockerCodes: [],
      },
    },
  })
  return {
    otpAgentReviewRecord: record,
    otpAgentReviewRuntimeProof: {
      required: true,
      present: true,
      confirmed: true,
      contract: record.contract,
      version: record.version,
      phase30Contract: record.phase30Contract,
      routeVariant,
      confirmedAt: record.confirmedAt,
      confirmedByRole: record.confirmedByRole,
      blockerCodes: [],
      reviewRecordFingerprint: runtimeProof.reviewRecordFingerprint,
      termsFingerprint: runtimeProof.termsFingerprint,
    },
  }
}

export function buildOtpAgentReviewSigningAlignmentPhase33Audit({
  checkedAt = new Date().toISOString(),
  phase31Audit = null,
  phase32Audit = null,
  packetServiceSource = '',
  packageJson = {},
} = {}) {
  const checks = []
  const phase31Ready = !phase31Audit || phase31Audit.status === OTP_AGENT_REVIEW_UI_READY_STATUS
  const phase32Ready = !phase32Audit || phase32Audit.status === 'OTP_AGENT_REVIEW_RUNTIME_PROOF_READY_FOR_SIGNING_QA_EXTENSION'
  const resaleAlignment = buildOtpAgentReviewSigningEnvelopeAlignment({
    generationPayload: buildSampleGenerationPayload('resale_existing_property', checkedAt),
    seed: buildSampleSeed('resale_existing_property', 3),
    pageCount: 3,
  })
  const developmentAlignment = buildOtpAgentReviewSigningEnvelopeAlignment({
    generationPayload: buildSampleGenerationPayload('new_development', checkedAt),
    seed: buildSampleSeed('new_development', 4),
    pageCount: 4,
  })
  const leakedAlignment = buildOtpAgentReviewSigningEnvelopeAlignment({
    generationPayload: buildSampleGenerationPayload('resale_existing_property', checkedAt),
    seed: {
      ...buildSampleSeed('resale_existing_property', 2),
      signers: [
        ...buildSampleSeed('resale_existing_property', 2).signers,
        { signerRole: 'developer_authorised_signatory' },
      ],
      fields: [
        ...buildSampleSeed('resale_existing_property', 2).fields,
        { signerRole: 'developer_authorised_signatory', fieldType: 'signature', pageNumber: 2, required: true },
      ],
    },
    pageCount: 2,
  })

  addCheck(checks, phase31Ready, 'PHASE33_PHASE31_UI_READY', 'Signing alignment starts after the agent review UI is ready.')
  addCheck(checks, phase32Ready, 'PHASE33_PHASE32_RUNTIME_PROOF_READY', 'Signing alignment starts after generated OTP runtime proof is ready.')
  addCheck(
    checks,
    resaleAlignment.canPrepareSigningEnvelope && developmentAlignment.canPrepareSigningEnvelope,
    'PHASE33_BOTH_ROUTES_ALIGN_TO_SIGNING_MANIFEST',
    'Resale and new-development signing seeds align with their route-specific OTP signer manifests.',
  )
  addCheck(
    checks,
    leakedAlignment.canPrepareSigningEnvelope === false &&
      leakedAlignment.blockerCodes.some((code) => code.includes('developer_authorised_signatory')),
    'PHASE33_ROUTE_ROLE_LEAK_BLOCKED',
    'A resale envelope carrying new-development signer roles is blocked by alignment proof.',
  )
  addCheck(
    checks,
    [resaleAlignment, developmentAlignment].every((alignment) =>
      alignment.blockerCodes.length === 0 &&
      alignment.initialsPolicy === 'every_page' &&
      alignment.datePolicy === 'per_signer_signature_date',
    ),
    'PHASE33_SIGNATURE_DATE_INITIALS_POLICIES_ALIGNED',
    'Each expected signer has signature, date and every-page initials evidence.',
  )
  addCheck(
    checks,
    packetServiceSource.includes('buildOtpAgentReviewSigningEnvelopeAlignment') &&
      packetServiceSource.includes('otpAgentReviewSigningAlignment') &&
      packetServiceSource.includes('signing_fields_prepared'),
    'PHASE33_PACKET_SERVICE_SIGNING_EVENT_WIRED',
    'prepareSigningFields emits the OTP agent-review signing alignment receipt with the signing-fields-prepared event.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-agent-review-signing-alignment-phase33'] === 'node scripts/otp-agent-review-signing-alignment-phase33.test.mjs' &&
      packageJson.scripts?.['report:otp-agent-review-signing-alignment-phase33'] === 'node scripts/report-otp-agent-review-signing-alignment-phase33.mjs',
    'PHASE33_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 33 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION,
    contract: OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_REMEDIATION_REQUIRED' : OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    summary: Object.freeze({
      blockerCount: blockers.length,
      provedRouteCount: [resaleAlignment, developmentAlignment].filter((alignment) => alignment.canPrepareSigningEnvelope).length,
      leakedRouteBlocked: leakedAlignment.canPrepareSigningEnvelope === false,
      signingFieldCount: resaleAlignment.fieldCount + developmentAlignment.fieldCount,
    }),
    alignments: Object.freeze([resaleAlignment, developmentAlignment]),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 34,
      key: 'otp_agent_review_dispatch_guard_runtime_alignment',
      label: 'OTP Agent Review Dispatch Guard Runtime Alignment',
    }),
  })
}

export function formatOtpAgentReviewSigningAlignmentPhase33Markdown(report = buildOtpAgentReviewSigningAlignmentPhase33Audit()) {
  return [
    '# OTP Generator Phase 33 Agent Review Signing Envelope Runtime Alignment',
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
        ['Proved routes', report.summary.provedRouteCount],
        ['Signing fields', report.summary.signingFieldCount],
        ['Route leak blocked', report.summary.leakedRouteBlocked ? 'yes' : 'no'],
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
    '## Route Alignment',
    '',
    table(
      ['Route', 'Expected Roles', 'Signer Roles', 'Fields', 'Pass'],
      report.alignments.map((alignment) => [
        alignment.routeLabel,
        alignment.expectedSignerRoles.join(', '),
        alignment.signerRoles.join(', '),
        alignment.fieldCount,
        alignment.canPrepareSigningEnvelope ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 33 proves signing envelope preparation aligns to the confirmed reviewed OTP route. It does not create signing links, dispatch envelopes, complete signer sessions, or mutate production templates.',
    '',
  ].join('\n')
}
