import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_AGENT_REVIEW_UI_CONTRACT,
  buildOtpAgentReviewUiPhase31Audit,
} from '../src/core/documents/otpAgentReviewUiPhase31.js'
import {
  buildOtpAgentReviewRuntimeProofPhase32Audit,
} from '../src/core/documents/otpAgentReviewRuntimeProofPhase32.js'
import { buildOtpSignatureInitialsManifest } from '../src/core/documents/otpSignatureInitials.js'
import {
  OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_CONTRACT,
  OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION,
  OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_STATUS,
  buildOtpAgentReviewSigningAlignmentPhase33Audit,
  buildOtpAgentReviewSigningEnvelopeAlignment,
  formatOtpAgentReviewSigningAlignmentPhase33Markdown,
} from '../src/core/documents/otpAgentReviewSigningEnvelopeAlignmentPhase33.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const phase33Source = await readFile(new URL('../src/core/documents/otpAgentReviewSigningEnvelopeAlignmentPhase33.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-agent-review-signing-alignment-phase33'],
  'node scripts/otp-agent-review-signing-alignment-phase33.test.mjs',
  'package.json should expose the OTP agent review signing alignment Phase 33 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-agent-review-signing-alignment-phase33'],
  'node scripts/report-otp-agent-review-signing-alignment-phase33.mjs',
  'package.json should expose the OTP agent review signing alignment Phase 33 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-agent-review-signing-alignment-phase33'),
  'OTP vNext verification should include Phase 33 signing alignment.',
)

assert.equal(OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION, 'otp_agent_review_signing_alignment_phase33_v1')
assert.equal(OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_CONTRACT, 'otp-vnext-agent-review-signing-alignment-phase33-v1')
assert.equal(OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_STATUS, 'OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_FOR_DISPATCH_GUARD_EXTENSION')

function samplePayload(routeVariant = 'resale_existing_property') {
  const record = {
    version: 'otp_agent_review_ui_phase31_v1',
    contract: OTP_AGENT_REVIEW_UI_CONTRACT,
    phase30Contract: 'otp-vnext-agent-controlled-edits-phase30-v1',
    confirmed: true,
    confirmedAt: '2026-08-05T20:00:00.000Z',
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

function sampleSeed(routeVariant = 'resale_existing_property', pageCount = 3) {
  const manifest = buildOtpSignatureInitialsManifest({ variant: routeVariant })
  return {
    pageCount,
    signers: manifest.roles.map((role) => ({
      signerRole: role.role,
      signerName: role.label,
      signerEmail: `${role.role}@phase33.test`,
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

const resale = buildOtpAgentReviewSigningEnvelopeAlignment({
  generationPayload: samplePayload('resale_existing_property'),
  seed: sampleSeed('resale_existing_property', 3),
  pageCount: 3,
})
assert.equal(resale.version, OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION)
assert.equal(resale.contract, OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_CONTRACT)
assert.equal(resale.canPrepareSigningEnvelope, true)
assert.deepEqual(resale.expectedSignerRoles, ['purchaser_1', 'seller'])
assert.equal(resale.initialsPolicy, 'every_page')
assert.equal(resale.datePolicy, 'per_signer_signature_date')

const development = buildOtpAgentReviewSigningEnvelopeAlignment({
  generationPayload: samplePayload('new_development'),
  seed: sampleSeed('new_development', 4),
  pageCount: 4,
})
assert.equal(development.canPrepareSigningEnvelope, true)
assert.deepEqual(development.expectedSignerRoles, [
  'purchaser_1',
  'developer_authorised_signatory',
  'contractor_authorised_signatory',
  'agent',
])

const leaked = buildOtpAgentReviewSigningEnvelopeAlignment({
  generationPayload: samplePayload('resale_existing_property'),
  seed: {
    ...sampleSeed('resale_existing_property', 2),
    signers: [...sampleSeed('resale_existing_property', 2).signers, { signerRole: 'developer_authorised_signatory' }],
    fields: [
      ...sampleSeed('resale_existing_property', 2).fields,
      { signerRole: 'developer_authorised_signatory', fieldType: 'signature', pageNumber: 2, required: true },
    ],
  },
  pageCount: 2,
})
assert.equal(leaked.canPrepareSigningEnvelope, false)
assert.ok(leaked.blockerCodes.includes('forbidden_signer_role:developer_authorised_signatory'))
assert.ok(leaked.blockerCodes.includes('forbidden_field_role:developer_authorised_signatory'))

const missingInitial = buildOtpAgentReviewSigningEnvelopeAlignment({
  generationPayload: samplePayload('resale_existing_property'),
  seed: {
    ...sampleSeed('resale_existing_property', 2),
    fields: sampleSeed('resale_existing_property', 2).fields.filter((field) => !(field.signerRole === 'seller' && field.fieldType === 'initial' && field.pageNumber === 2)),
  },
  pageCount: 2,
})
assert.equal(missingInitial.canPrepareSigningEnvelope, false)
assert.ok(missingInitial.blockerCodes.includes('missing_initial_field:seller:page_2'))

for (const token of [
  'buildOtpAgentReviewSigningEnvelopeAlignment',
  'otpAgentReviewSigningAlignment',
  'signing_fields_prepared',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should include ${token}`)
}
for (const token of [
  'PHASE33_ROUTE_ROLE_LEAK_BLOCKED',
  'PHASE33_SIGNATURE_DATE_INITIALS_POLICIES_ALIGNED',
  'OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_FOR_DISPATCH_GUARD_EXTENSION',
]) {
  assert.ok(phase33Source.includes(token), `phase33 source should include ${token}`)
}

const phase31Audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt: '2026-08-05T20:00:00.000Z',
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
  checkedAt: '2026-08-05T20:00:00.000Z',
  phase31Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const audit = buildOtpAgentReviewSigningAlignmentPhase33Audit({
  checkedAt: '2026-08-05T20:00:00.000Z',
  phase31Audit,
  phase32Audit,
  packetServiceSource,
  packageJson,
})
assert.equal(audit.version, OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION)
assert.equal(audit.status, OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 34)
for (const check of [
  'PHASE33_PHASE31_UI_READY',
  'PHASE33_PHASE32_RUNTIME_PROOF_READY',
  'PHASE33_BOTH_ROUTES_ALIGN_TO_SIGNING_MANIFEST',
  'PHASE33_ROUTE_ROLE_LEAK_BLOCKED',
  'PHASE33_SIGNATURE_DATE_INITIALS_POLICIES_ALIGNED',
  'PHASE33_PACKET_SERVICE_SIGNING_EVENT_WIRED',
  'PHASE33_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpAgentReviewSigningAlignmentPhase33Markdown(audit)
for (const token of [
  'OTP Generator Phase 33 Agent Review Signing Envelope Runtime Alignment',
  'OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_FOR_DISPATCH_GUARD_EXTENSION',
  'PHASE33_ROUTE_ROLE_LEAK_BLOCKED',
  'Phase 34: OTP Agent Review Dispatch Guard Runtime Alignment',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP agent review signing alignment Phase 33 contract passed.')
