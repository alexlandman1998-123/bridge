import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildOtpAgentControlledEditModel,
  buildOtpAgentControlledEditsPhase30Audit,
} from '../src/core/documents/otpAgentControlledEditsPhase30.js'
import {
  OTP_AGENT_REVIEW_UI_CONTRACT,
  OTP_AGENT_REVIEW_UI_PHASE31_VERSION,
  OTP_AGENT_REVIEW_UI_READY_STATUS,
  buildOtpAgentReviewRecord,
  buildOtpAgentReviewUiPhase31Audit,
  buildOtpAgentReviewUiState,
  formatOtpAgentReviewUiPhase31Markdown,
} from '../src/core/documents/otpAgentReviewUiPhase31.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const phase31Source = await readFile(new URL('../src/core/documents/otpAgentReviewUiPhase31.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-agent-review-ui-phase31'],
  'node scripts/otp-agent-review-ui-phase31.test.mjs',
  'package.json should expose the OTP agent review UI Phase 31 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-agent-review-ui-phase31'],
  'node scripts/report-otp-agent-review-ui-phase31.mjs',
  'package.json should expose the OTP agent review UI Phase 31 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-agent-review-ui-phase31'),
  'OTP vNext verification should include Phase 31 agent review UI wiring.',
)

assert.equal(OTP_AGENT_REVIEW_UI_PHASE31_VERSION, 'otp_agent_review_ui_phase31_v1')
assert.equal(OTP_AGENT_REVIEW_UI_CONTRACT, 'otp-vnext-agent-review-ui-phase31-v1')
assert.equal(OTP_AGENT_REVIEW_UI_READY_STATUS, 'OTP_AGENT_REVIEW_UI_READY_FOR_RUNTIME_PROOF')

const model = buildOtpAgentControlledEditModel({
  transactionId: 'tx-phase31-resale',
  routeVariant: 'resale_existing_property',
  editRequests: [
    { fieldKey: 'buyer_full_name', nextValue: 'Resale Buyer' },
    { fieldKey: 'seller_full_name', nextValue: 'Resale Seller' },
    { fieldKey: 'property_address', nextValue: '27 Proof Avenue' },
    { fieldKey: 'purchase_price', nextValue: 2850000 },
  ],
})

const unconfirmed = buildOtpAgentReviewUiState({
  model,
  sourceContext: {},
  lifecycleState: 'draft',
  canGeneratePermission: true,
  hasGeneratedPacketVersion: false,
})
assert.equal(unconfirmed.canOpenReview, true)
assert.equal(unconfirmed.requiresReviewBeforeGenerate, true)
assert.equal(unconfirmed.canGenerate, false)
assert.ok(unconfirmed.blockerCodes.includes('agent_review_required_before_generation'))

const record = buildOtpAgentReviewRecord({
  model,
  termsSnapshot: {
    buyer_full_name: 'Resale Buyer',
    seller_full_name: 'Resale Seller',
    property_address: '27 Proof Avenue',
    purchase_price: 2850000,
  },
  actorRole: 'agent',
  confirmedAt: '2026-08-05T18:00:00.000Z',
})
assert.equal(record.contract, OTP_AGENT_REVIEW_UI_CONTRACT)
assert.equal(record.confirmed, true)
assert.equal(record.controlPolicy.rawLegalTemplateEditingAllowed, false)
assert.equal(record.controlPolicy.generatesFromReviewedTransactionTerms, true)

const confirmed = buildOtpAgentReviewUiState({
  model,
  sourceContext: { otpAgentReviewRecord: record },
  lifecycleState: 'draft',
  canGeneratePermission: true,
  hasGeneratedPacketVersion: false,
})
assert.equal(confirmed.reviewConfirmed, true)
assert.equal(confirmed.requiresReviewBeforeGenerate, false)
assert.equal(confirmed.canGenerate, true)

const locked = buildOtpAgentReviewUiState({
  model,
  sourceContext: { otpAgentReviewRecord: record },
  lifecycleState: 'sent',
  canGeneratePermission: true,
  hasGeneratedPacketVersion: false,
})
assert.equal(locked.generationLocked, true)
assert.equal(locked.canGenerate, false)
assert.ok(locked.blockerCodes.includes('document_lifecycle_locked'))

for (const token of [
  'OtpAgentReviewPanel',
  'handleConfirmOtpAgentReview',
  'requiresReviewBeforeGenerate',
  'setOtpAgentReviewOpen(true)',
  'otpAgentReviewRecord: otpAgentReviewUiState?.reviewRecord',
  'buildOtpAgentControlledEditModel',
  'buildOtpAgentReviewUiState',
]) {
  assert.ok(workspaceSource.includes(token), `workspace should include ${token}`)
}

for (const token of [
  'rawLegalTemplateEditingAllowed: false',
  'customSuspensiveConditionsRequireApproval: true',
  'agent_review_required_before_generation',
  'PHASE31_GENERATE_GATED_BY_REVIEW',
]) {
  assert.ok(phase31Source.includes(token), `phase31 source should include ${token}`)
}

const readyPhase30 = buildOtpAgentControlledEditsPhase30Audit({
  checkedAt: '2026-08-05T18:00:00.000Z',
  phase29Audit: {
    version: 'otp_final_production_readiness_gate_phase29_v1',
    status: 'OTP_FINAL_PRODUCTION_READINESS_GATE_READY_FOR_SEPARATE_AUTHORISED_APPLY_DECISION',
    mutatedData: false,
    summary: { blockerCount: 0 },
    blockers: [],
  },
})
const audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt: '2026-08-05T18:00:00.000Z',
  phase30Audit: readyPhase30,
  workspaceSource,
  packageJson,
})
assert.equal(audit.version, OTP_AGENT_REVIEW_UI_PHASE31_VERSION)
assert.equal(audit.status, OTP_AGENT_REVIEW_UI_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 32)
for (const check of [
  'PHASE31_PHASE30_CONTROLS_READY',
  'PHASE31_GENERATE_GATED_BY_REVIEW',
  'PHASE31_CONFIRMED_REVIEW_CAN_GENERATE',
  'PHASE31_WORKSPACE_PANEL_WIRED',
  'PHASE31_GENERATION_PAYLOAD_WIRED',
  'PHASE31_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpAgentReviewUiPhase31Markdown(audit)
for (const token of [
  'OTP Generator Phase 31 Agent OTP Review UI Wiring',
  'OTP_AGENT_REVIEW_UI_READY_FOR_RUNTIME_PROOF',
  'PHASE31_GENERATE_GATED_BY_REVIEW',
  'Phase 32: OTP Agent Review Runtime Generation Proof',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP agent review UI Phase 31 contract passed.')
