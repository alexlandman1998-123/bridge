import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_AGENT_REVIEW_UI_CONTRACT,
  buildOtpAgentReviewUiPhase31Audit,
} from '../src/core/documents/otpAgentReviewUiPhase31.js'
import {
  OTP_AGENT_REVIEW_RUNTIME_PROOF_CONTRACT,
  OTP_AGENT_REVIEW_RUNTIME_PROOF_PHASE32_VERSION,
  OTP_AGENT_REVIEW_RUNTIME_PROOF_READY_STATUS,
  buildOtpAgentReviewRuntimeGenerationProof,
  buildOtpAgentReviewRuntimeProofPhase32Audit,
  formatOtpAgentReviewRuntimeProofPhase32Markdown,
} from '../src/core/documents/otpAgentReviewRuntimeProofPhase32.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const phase32Source = await readFile(new URL('../src/core/documents/otpAgentReviewRuntimeProofPhase32.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-agent-review-runtime-proof-phase32'],
  'node scripts/otp-agent-review-runtime-proof-phase32.test.mjs',
  'package.json should expose the OTP agent review runtime proof Phase 32 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-agent-review-runtime-proof-phase32'],
  'node scripts/report-otp-agent-review-runtime-proof-phase32.mjs',
  'package.json should expose the OTP agent review runtime proof Phase 32 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-agent-review-runtime-proof-phase32'),
  'OTP vNext verification should include Phase 32 runtime proof.',
)

assert.equal(OTP_AGENT_REVIEW_RUNTIME_PROOF_PHASE32_VERSION, 'otp_agent_review_runtime_proof_phase32_v1')
assert.equal(OTP_AGENT_REVIEW_RUNTIME_PROOF_CONTRACT, 'otp-vnext-agent-review-runtime-proof-phase32-v1')
assert.equal(OTP_AGENT_REVIEW_RUNTIME_PROOF_READY_STATUS, 'OTP_AGENT_REVIEW_RUNTIME_PROOF_READY_FOR_SIGNING_QA_EXTENSION')

const confirmedRecord = {
  version: 'otp_agent_review_ui_phase31_v1',
  contract: OTP_AGENT_REVIEW_UI_CONTRACT,
  phase30Contract: 'otp-vnext-agent-controlled-edits-phase30-v1',
  confirmed: true,
  confirmedAt: '2026-08-05T19:00:00.000Z',
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
}

const proof = buildOtpAgentReviewRuntimeGenerationProof({
  generationPayload: {
    packetId: 'packet-runtime-proof',
    otpAgentReviewRecord: confirmedRecord,
    otpAgentReviewRuntimeProof: {
      required: true,
      present: true,
      confirmed: true,
      contract: confirmedRecord.contract,
      version: confirmedRecord.version,
      phase30Contract: confirmedRecord.phase30Contract,
      routeVariant: confirmedRecord.routeVariant,
      confirmedAt: confirmedRecord.confirmedAt,
      confirmedByRole: confirmedRecord.confirmedByRole,
      blockerCodes: [],
    },
  },
})
assert.equal(proof.version, OTP_AGENT_REVIEW_RUNTIME_PROOF_PHASE32_VERSION)
assert.equal(proof.contract, OTP_AGENT_REVIEW_RUNTIME_PROOF_CONTRACT)
assert.equal(proof.canTrustGeneratedOtp, true)
assert.equal(proof.reviewContract, OTP_AGENT_REVIEW_UI_CONTRACT)
assert.equal(proof.routeVariant, 'resale_existing_property')

const proofFromVersion = buildOtpAgentReviewRuntimeGenerationProof({
  version: {
    validation_summary_json: {
      generationPayload: {
        otpAgentReviewRecord: confirmedRecord,
        otpAgentReviewRuntimeProof: {
          required: true,
          present: true,
          confirmed: true,
          contract: confirmedRecord.contract,
          routeVariant: confirmedRecord.routeVariant,
          blockerCodes: [],
        },
      },
    },
  },
})
assert.equal(proofFromVersion.canTrustGeneratedOtp, true)

const missing = buildOtpAgentReviewRuntimeGenerationProof({
  generationPayload: { packetId: 'packet-missing-review' },
})
assert.equal(missing.canTrustGeneratedOtp, false)
assert.ok(missing.blockerCodes.includes('otp_agent_review_record_missing_from_generation_payload'))

const wrongContract = buildOtpAgentReviewRuntimeGenerationProof({
  generationPayload: {
    otpAgentReviewRecord: {
      ...confirmedRecord,
      contract: 'wrong-contract',
    },
    otpAgentReviewRuntimeProof: {
      required: true,
      present: true,
      confirmed: true,
      contract: 'wrong-contract',
      blockerCodes: [],
    },
  },
})
assert.equal(wrongContract.canTrustGeneratedOtp, false)
assert.ok(wrongContract.blockerCodes.includes('otp_agent_review_contract_mismatch'))

for (const token of [
  'resolveOtpAgentReviewRecordForGeneration',
  'buildOtpAgentReviewRuntimeProof',
  'otpAgentReviewRecord',
  'otpAgentReviewRuntimeProof',
  'generationPayload',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should include ${token}`)
}
for (const token of [
  'otpAgentReviewRecord: otpAgentReviewUiState?.reviewRecord',
  'requiresReviewBeforeGenerate',
]) {
  assert.ok(workspaceSource.includes(token), `workspace should include ${token}`)
}
for (const token of [
  'otp_agent_review_record_missing_from_generation_payload',
  'PHASE32_GENERATED_VERSION_PROOF_VALIDATES',
  'OTP_AGENT_REVIEW_RUNTIME_PROOF_READY_FOR_SIGNING_QA_EXTENSION',
]) {
  assert.ok(phase32Source.includes(token), `phase32 source should include ${token}`)
}

const phase31Audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt: '2026-08-05T19:00:00.000Z',
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
const audit = buildOtpAgentReviewRuntimeProofPhase32Audit({
  checkedAt: '2026-08-05T19:00:00.000Z',
  phase31Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
assert.equal(audit.version, OTP_AGENT_REVIEW_RUNTIME_PROOF_PHASE32_VERSION)
assert.equal(audit.status, OTP_AGENT_REVIEW_RUNTIME_PROOF_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 33)
for (const check of [
  'PHASE32_PHASE31_UI_READY',
  'PHASE32_PACKET_SERVICE_RUNTIME_PAYLOAD_WIRED',
  'PHASE32_WORKSPACE_REVIEW_RECORD_REACHES_GENERATION',
  'PHASE32_GENERATED_VERSION_PROOF_VALIDATES',
  'PHASE32_MISSING_REVIEW_RECORD_BLOCKS_PROOF',
  'PHASE32_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpAgentReviewRuntimeProofPhase32Markdown(audit)
for (const token of [
  'OTP Generator Phase 32 Agent Review Runtime Generation Proof',
  'OTP_AGENT_REVIEW_RUNTIME_PROOF_READY_FOR_SIGNING_QA_EXTENSION',
  'PHASE32_GENERATED_VERSION_PROOF_VALIDATES',
  'Phase 33: OTP Agent Review Signing Envelope Runtime Alignment',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP agent review runtime proof Phase 32 contract passed.')
