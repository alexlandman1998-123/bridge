import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES,
  ATTORNEY_INCOMING_WAITING_ON,
  buildAttorneyIncomingMatterContract,
} from '../src/core/transactions/attorneyIncomingMatterContract.js'
import { buildAttorneyHandoffRepairQueueCandidate } from '../src/core/transactions/attorneyHandoffRepairQueue.js'
import { buildKingstonsBuyerOtpReadiness } from '../src/core/transactions/kingstonsBuyerOtpReadiness.js'
import { buildTransferInstructionLifecycle } from '../src/services/transferInstructionLifecycleService.js'

const repoRoot = process.cwd()
const readinessSource = fs.readFileSync(path.join(repoRoot, 'src/core/transactions/kingstonsBuyerOtpReadiness.js'), 'utf8')
const contractSource = fs.readFileSync(path.join(repoRoot, 'src/core/transactions/attorneyIncomingMatterContract.js'), 'utf8')
const repairQueueSource = fs.readFileSync(path.join(repoRoot, 'src/core/transactions/attorneyHandoffRepairQueue.js'), 'utf8')
const lifecycleSource = fs.readFileSync(path.join(repoRoot, 'src/services/transferInstructionLifecycleService.js'), 'utf8')
const attorneyDetailSource = fs.readFileSync(path.join(repoRoot, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const incomingQueueSource = fs.readFileSync(path.join(repoRoot, 'src/services/attorneyIncomingMatterQueue.js'), 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

const manualSignedOtpDocument = {
  id: 'transaction-doc-signed-otp',
  document_type: 'signed_otp',
  name: 'Signed OTP - Kingston Buyer.pdf',
  storage_path: 'transactions/tx-kingstons/signed-otp.pdf',
  status: 'uploaded',
}

const readiness = buildKingstonsBuyerOtpReadiness({
  documents: [manualSignedOtpDocument],
})

assert.equal(readiness.gate.attorneyReadinessReady, true, 'Kingston manual OTP must expose an attorney readiness gate.')
assert.equal(readiness.gate.transactionReadinessReady, true, 'Kingston manual OTP must expose a transaction readiness gate.')

const transferAssignment = {
  assignment_type: 'transfer',
  attorney_role: 'transfer_attorney',
  assignment_status: 'active',
  status: 'active',
}

const genericContract = buildAttorneyIncomingMatterContract({
  assignment: transferAssignment,
  transaction: {
    id: 'tx-generic',
    onboarding_status: 'awaiting_signed_otp',
    onboarding_completed_at: '2026-08-01T08:00:00.000Z',
  },
  documents: [manualSignedOtpDocument],
})

assert.equal(genericContract.status, ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp)
assert.deepEqual(genericContract.waitingOn, [ATTORNEY_INCOMING_WAITING_ON.signedOtp])

const kingstonsContract = buildAttorneyIncomingMatterContract({
  assignment: transferAssignment,
  transaction: {
    id: 'tx-kingstons',
    onboarding_status: 'awaiting_signed_otp',
    onboarding_completed_at: '2026-08-01T08:00:00.000Z',
  },
  documents: [manualSignedOtpDocument],
  allowKingstonsManualSignedOtp: true,
  kingstonsBuyerOtpReadiness: readiness,
})

assert.equal(kingstonsContract.status, ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance)
assert.deepEqual(kingstonsContract.waitingOn, [ATTORNEY_INCOMING_WAITING_ON.attorneyAcceptance])

const handoffCandidate = buildAttorneyHandoffRepairQueueCandidate({
  transaction: {
    id: 'tx-kingstons',
    assigned_attorney_email: 'transfer@example.test',
    onboarding_status: 'awaiting_signed_otp',
  },
  documents: [manualSignedOtpDocument],
  allowKingstonsManualSignedOtp: true,
})

assert.equal(handoffCandidate.signedOtp, true)
assert.equal(handoffCandidate.status, 'covered')
assert.equal(handoffCandidate.reasons.some((item) => item.key === 'awaiting_signed_otp'), false)

const blockedLifecycle = buildTransferInstructionLifecycle({
  transaction: {
    id: 'tx-generic',
    onboarding_status: 'awaiting_signed_otp',
  },
  assignments: [{ assignment_type: 'transfer', instruction_status: 'ready_for_acceptance' }],
  documents: [manualSignedOtpDocument],
})

assert.equal(blockedLifecycle.signedOtp, false)
assert.equal(blockedLifecycle.issues.includes('instruction_activated_before_signed_otp'), true)

const kingstonsLifecycle = buildTransferInstructionLifecycle({
  transaction: {
    id: 'tx-kingstons',
    onboarding_status: 'awaiting_signed_otp',
  },
  assignments: [{ assignment_type: 'transfer', instruction_status: 'ready_for_acceptance' }],
  documents: [manualSignedOtpDocument],
  allowKingstonsManualSignedOtp: true,
  kingstonsBuyerOtpReadiness: readiness,
})

assert.equal(kingstonsLifecycle.signedOtp, true)
assert.equal(kingstonsLifecycle.signedOtpSource, 'kingstons_manual_upload')
assert.equal(kingstonsLifecycle.issues.includes('instruction_activated_before_signed_otp'), false)

assertIncludes(readinessSource, 'attorneyReadinessReady: gateStatus === \'pass\'', 'Readiness must expose attorney readiness.')
assertIncludes(readinessSource, 'transactionReadinessReady: gateStatus === \'pass\'', 'Readiness must expose transaction readiness.')
assertIncludes(contractSource, 'allowKingstonsManualSignedOtp !== true', 'Incoming attorney contract must keep Kingston manual OTP opt-in.')
assertIncludes(contractSource, 'readiness?.gate?.attorneyReadinessReady === true', 'Incoming attorney contract must use the Kingston attorney readiness gate.')
assertIncludes(repairQueueSource, 'hasKingstonsManualSignedOtpAttorneyEvidence(options)', 'Attorney handoff repair queue must accept the scoped Kingston OTP evidence.')
assertIncludes(lifecycleSource, "signedOtpSource: statusSignedOtp ? 'transaction_status' : kingstonsManualSignedOtp ? 'kingstons_manual_upload' : ''", 'Transfer lifecycle must expose the signed OTP source.')
assertIncludes(lifecycleSource, "fetchRows('documents'", 'Transfer lifecycle fetch helper must load transaction documents for Kingston OTP readiness.')
assertIncludes(lifecycleSource, 'allowKingstonsManualSignedOtp: sellerProcessProfileResolution.isKingstons', 'Transfer lifecycle fetch helper must scope manual OTP readiness to Kingstons.')
assertIncludes(incomingQueueSource, 'const DOCUMENT_COLUMNS = [', 'Incoming attorney queue must define transaction document inputs.')
assertIncludes(incomingQueueSource, 'documentsByTransactionId', 'Incoming attorney queue must group documents by transaction.')
assertIncludes(incomingQueueSource, 'allowKingstonsManualSignedOtp: sellerProcessProfileResolution.isKingstons', 'Incoming attorney queue must scope manual OTP readiness to Kingstons.')
assertIncludes(attorneyDetailSource, "['signed_otp', 'signed otp', 'signed sale agreement', 'signed offer to purchase']", 'Attorney transaction UI must recognise signed_otp transaction documents.')

console.log('Kingstons buyer OTP attorney / transaction readiness phase 6 guard passed.')
