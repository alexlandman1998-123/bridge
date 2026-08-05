import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_AGENT_REVIEW_UI_CONTRACT,
  buildOtpAgentReviewUiPhase31Audit,
} from '../src/core/documents/otpAgentReviewUiPhase31.js'
import {
  buildOtpAgentReviewRuntimeProofPhase32Audit,
} from '../src/core/documents/otpAgentReviewRuntimeProofPhase32.js'
import {
  buildOtpAgentReviewSigningAlignmentPhase33Audit,
} from '../src/core/documents/otpAgentReviewSigningEnvelopeAlignmentPhase33.js'
import { buildOtpSignatureInitialsManifest } from '../src/core/documents/otpSignatureInitials.js'
import {
  OTP_AGENT_REVIEW_DISPATCH_GUARD_CONTRACT,
  OTP_AGENT_REVIEW_DISPATCH_GUARD_PHASE34_VERSION,
  OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_STATUS,
  assertOtpAgentReviewDispatchGuard,
  buildOtpAgentReviewDispatchGuardDecision,
  buildOtpAgentReviewDispatchGuardForSigningSummary,
  buildOtpAgentReviewDispatchGuardPhase34Audit,
  buildOtpSigningSeedFromSigningSummary,
  formatOtpAgentReviewDispatchGuardPhase34Markdown,
} from '../src/core/documents/otpAgentReviewDispatchGuardPhase34.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const phase34Source = await readFile(new URL('../src/core/documents/otpAgentReviewDispatchGuardPhase34.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-agent-review-dispatch-guard-phase34'],
  'node scripts/otp-agent-review-dispatch-guard-phase34.test.mjs',
  'package.json should expose the OTP agent review dispatch guard Phase 34 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-agent-review-dispatch-guard-phase34'],
  'node scripts/report-otp-agent-review-dispatch-guard-phase34.mjs',
  'package.json should expose the OTP agent review dispatch guard Phase 34 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-agent-review-dispatch-guard-phase34'),
  'OTP vNext verification should include Phase 34 dispatch guard.',
)

assert.equal(OTP_AGENT_REVIEW_DISPATCH_GUARD_PHASE34_VERSION, 'otp_agent_review_dispatch_guard_phase34_v1')
assert.equal(OTP_AGENT_REVIEW_DISPATCH_GUARD_CONTRACT, 'otp-vnext-agent-review-dispatch-guard-phase34-v1')
assert.equal(OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_STATUS, 'OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_FOR_SIGNER_SESSION_EXTENSION')

function samplePayload(routeVariant = 'resale_existing_property') {
  const record = {
    version: 'otp_agent_review_ui_phase31_v1',
    contract: OTP_AGENT_REVIEW_UI_CONTRACT,
    phase30Contract: 'otp-vnext-agent-controlled-edits-phase30-v1',
    confirmed: true,
    confirmedAt: '2026-08-05T21:00:00.000Z',
    confirmedByRole: 'agent',
    routeVariant,
    blockerCodes: [],
    warningCodes: [],
    termsSnapshot: {
      buyer_full_name: 'Dispatch Buyer',
      seller_full_name: routeVariant === 'new_development' ? '' : 'Dispatch Seller',
      developer_name: routeVariant === 'new_development' ? 'Dispatch Developer' : '',
      property_address: '34 Guard Avenue',
      purchase_price: 2850000,
    },
    standardConditionSelections: [],
    customConditionRequests: [],
  }
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
    },
  }
}

function sampleSigningSummary(routeVariant = 'resale_existing_property', pageCount = 3) {
  const manifest = buildOtpSignatureInitialsManifest({ variant: routeVariant })
  return {
    signers: manifest.roles.map((role, index) => ({
      signer_role: role.role,
      signer_name: role.label,
      signer_email: `${role.role}@phase34.test`,
      signing_order: index + 1,
      status: 'ready_to_send',
    })),
    fields: manifest.roles.flatMap((role) => [
      { signer_role: role.role, field_type: 'signature', page_number: pageCount, required: true },
      { signer_role: role.role, field_type: 'date', page_number: pageCount, required: true },
      ...Array.from({ length: pageCount }, (_, index) => ({
        signer_role: role.role,
        field_type: 'initial',
        page_number: index + 1,
        required: true,
      })),
    ]),
  }
}

const seed = buildOtpSigningSeedFromSigningSummary(sampleSigningSummary('resale_existing_property', 3))
assert.equal(seed.pageCount, 3)
assert.deepEqual(seed.signers.map((signer) => signer.signerRole), ['purchaser_1', 'seller'])
assert.equal(seed.fields.length, 10)

const resaleGuard = buildOtpAgentReviewDispatchGuardForSigningSummary({
  packet: { id: 'packet-phase34-resale', packet_type: 'otp' },
  version: { id: 'version-phase34-resale' },
  generationPayload: samplePayload('resale_existing_property'),
  signingSummary: sampleSigningSummary('resale_existing_property', 3),
  targetSignerRole: 'seller',
  checkedAt: '2026-08-05T21:00:00.000Z',
})
assert.equal(resaleGuard.version, OTP_AGENT_REVIEW_DISPATCH_GUARD_PHASE34_VERSION)
assert.equal(resaleGuard.contract, OTP_AGENT_REVIEW_DISPATCH_GUARD_CONTRACT)
assert.equal(resaleGuard.status, OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_STATUS)
assert.equal(resaleGuard.canCreateSigningDispatch, true)
assert.equal(assertOtpAgentReviewDispatchGuard(resaleGuard), resaleGuard)

const developmentGuard = buildOtpAgentReviewDispatchGuardForSigningSummary({
  packet: { id: 'packet-phase34-development', packet_type: 'otp' },
  version: { id: 'version-phase34-development' },
  generationPayload: samplePayload('new_development'),
  signingSummary: sampleSigningSummary('new_development', 4),
  targetSignerRole: 'developer_authorised_signatory',
  checkedAt: '2026-08-05T21:00:00.000Z',
})
assert.equal(developmentGuard.canCreateSigningDispatch, true)
assert.ok(developmentGuard.allowedSignerRoles.includes('contractor_authorised_signatory'))

const missingTarget = buildOtpAgentReviewDispatchGuardDecision({
  alignment: {
    version: 'otp_agent_review_signing_alignment_phase33_v1',
    contract: 'otp-vnext-agent-review-signing-alignment-phase33-v1',
    canPrepareSigningEnvelope: true,
    blockerCodes: [],
    routeVariant: 'resale_existing_property',
    expectedSignerRoles: ['purchaser_1', 'seller'],
    signerRoles: ['purchaser_1', 'seller'],
  },
  targetSignerRole: '',
})
assert.equal(missingTarget.canCreateSigningDispatch, false)
assert.ok(missingTarget.blockerCodes.includes('missing_target_signer_role'))
assert.throws(
  () => assertOtpAgentReviewDispatchGuard(missingTarget),
  /OTP signing dispatch is blocked/,
)

const routeLeak = buildOtpAgentReviewDispatchGuardDecision({
  alignment: {
    version: 'otp_agent_review_signing_alignment_phase33_v1',
    contract: 'otp-vnext-agent-review-signing-alignment-phase33-v1',
    canPrepareSigningEnvelope: true,
    blockerCodes: [],
    routeVariant: 'resale_existing_property',
    expectedSignerRoles: ['purchaser_1', 'seller'],
    signerRoles: ['purchaser_1', 'seller'],
  },
  targetSignerRole: 'developer_authorised_signatory',
})
assert.equal(routeLeak.canCreateSigningDispatch, false)
assert.ok(routeLeak.blockerCodes.includes('target_signer_role_not_aligned:developer_authorised_signatory'))

const failedAlignment = buildOtpAgentReviewDispatchGuardDecision({
  alignment: {
    version: 'otp_agent_review_signing_alignment_phase33_v1',
    contract: 'otp-vnext-agent-review-signing-alignment-phase33-v1',
    canPrepareSigningEnvelope: false,
    blockerCodes: ['missing_initial_field:seller:page_2'],
    routeVariant: 'resale_existing_property',
    expectedSignerRoles: ['purchaser_1', 'seller'],
    signerRoles: ['purchaser_1', 'seller'],
  },
  targetSignerRole: 'seller',
})
assert.equal(failedAlignment.canCreateSigningDispatch, false)
assert.ok(failedAlignment.blockerCodes.includes('phase33_alignment_not_ready'))
assert.ok(failedAlignment.blockerCodes.includes('phase33_alignment_has_blockers'))

for (const token of [
  'buildOtpAgentReviewDispatchGuardForSigningSummary',
  'assertOtpAgentReviewDispatchGuard',
  'otp_agent_review_dispatch_guard_passed',
  'otpAgentReviewDispatchGuard',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should include ${token}`)
}
for (const token of [
  'OTP_SIGNING_DISPATCH_NOT_TARGETED',
  'targetSignerRole: signerRole',
  'OTP signing dispatches do not reference one immutable packet version',
]) {
  assert.ok(workspaceSource.includes(token), `workspace should include ${token}`)
}
for (const token of [
  'PHASE34_MISSING_ALIGNMENT_RECEIPT_BLOCKED',
  'PHASE34_SIGNER_SPECIFIC_TARGET_REQUIRED',
  'OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_FOR_SIGNER_SESSION_EXTENSION',
]) {
  assert.ok(phase34Source.includes(token), `phase34 source should include ${token}`)
}

const phase31Audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt: '2026-08-05T21:00:00.000Z',
  phase30Audit: {
    status: 'OTP_AGENT_CONTROLLED_EDITS_READY_FOR_UI_WIRING',
    sampleModels: {
      resaleReady: {
        canOpenAgentReviewModal: true,
        canGenerateOtp: true,
        routeVariant: 'resale_existing_property',
        routeLabel: 'Existing / resale property OTP',
        blockerCodes: [],
        warningCodes: [],
        editableSections: [{ key: 'buyer_cost_obligations' }],
        standardConditionControls: [{ key: 'bond_approval' }],
        approvalRows: [],
      },
    },
  },
  workspaceSource,
  packageJson,
})
const phase32Audit = buildOtpAgentReviewRuntimeProofPhase32Audit({
  checkedAt: '2026-08-05T21:00:00.000Z',
  phase31Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase33Audit = buildOtpAgentReviewSigningAlignmentPhase33Audit({
  checkedAt: '2026-08-05T21:00:00.000Z',
  phase31Audit,
  phase32Audit,
  packetServiceSource,
  packageJson,
})
const audit = buildOtpAgentReviewDispatchGuardPhase34Audit({
  checkedAt: '2026-08-05T21:00:00.000Z',
  phase33Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
assert.equal(audit.version, OTP_AGENT_REVIEW_DISPATCH_GUARD_PHASE34_VERSION)
assert.equal(audit.status, OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 35)
for (const check of [
  'PHASE34_PHASE33_ALIGNMENT_READY',
  'PHASE34_BOTH_ROUTES_CAN_DISPATCH_WHEN_ALIGNED',
  'PHASE34_MISSING_ALIGNMENT_RECEIPT_BLOCKED',
  'PHASE34_SIGNER_SPECIFIC_TARGET_REQUIRED',
  'PHASE34_ROUTE_ROLE_LEAK_TARGET_BLOCKED',
  'PHASE34_PACKET_SERVICE_DISPATCH_GUARD_WIRED',
  'PHASE34_WORKSPACE_SIGNER_SPECIFIC_DISPATCH_WIRED',
  'PHASE34_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpAgentReviewDispatchGuardPhase34Markdown(audit)
for (const token of [
  'OTP Generator Phase 34 Agent Review Dispatch Guard Runtime Alignment',
  'OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_FOR_SIGNER_SESSION_EXTENSION',
  'PHASE34_ROUTE_ROLE_LEAK_TARGET_BLOCKED',
  'Phase 35: OTP Agent Review Signer Session Runtime Alignment',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP agent review dispatch guard Phase 34 contract passed.')
