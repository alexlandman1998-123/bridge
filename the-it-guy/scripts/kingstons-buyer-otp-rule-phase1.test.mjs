import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  KINGSTONS_BUYER_OTP_READINESS_VERSION,
  KINGSTONS_BUYER_OTP_REQUIREMENT,
  buildKingstonsBuyerOtpReadiness,
  isKingstonsManualSignedOtpDocument,
} from '../src/core/transactions/kingstonsBuyerOtpReadiness.js'

const repoRoot = process.cwd()
const salesWorkflowSource = fs.readFileSync(path.join(repoRoot, 'src/core/transactions/salesWorkflow.js'), 'utf8')

const signedOtpUpload = {
  id: 'listing-doc-signed-otp',
  document_type: 'signed_otp',
  document_name: 'Signed OTP - Buyer.pdf',
  storage_path: 'private-listings/listing-1/documents/signed-otp.pdf',
  status: 'uploaded',
  source: 'agent_manual_upload',
  uploaded_at: '2026-08-07T10:00:00.000Z',
}

const ready = buildKingstonsBuyerOtpReadiness({
  documents: [signedOtpUpload],
})

assert.equal(ready.version, KINGSTONS_BUYER_OTP_READINESS_VERSION)
assert.equal(KINGSTONS_BUYER_OTP_REQUIREMENT.key, 'signed_otp')
assert.equal(ready.gate.status, 'pass')
assert.equal(ready.gate.offerConversionReady, true)
assert.equal(ready.gate.transactionHandoffReady, true)
assert.equal(ready.summary.ready, 1)
assert.equal(ready.rows[0].documentId, 'listing-doc-signed-otp')
assert.equal(isKingstonsManualSignedOtpDocument(signedOtpUpload), true)

const generatedOtp = {
  id: 'generated-otp-draft',
  document_type: 'otp_generated',
  document_name: 'Generated OTP draft.pdf',
  storage_path: 'document-packets/generated-otp.pdf',
  status: 'approved',
}

const generatedOnly = buildKingstonsBuyerOtpReadiness({
  documents: [generatedOtp],
})

assert.equal(isKingstonsManualSignedOtpDocument(generatedOtp), false)
assert.equal(generatedOnly.gate.status, 'blocked')
assert.equal(generatedOnly.gate.offerConversionReady, false)
assert.equal(generatedOnly.summary.missing, 1)
assert.equal(generatedOnly.blockers[0].reason, 'Signed OTP is missing from buyer offer documents.')

const checklistRowOnly = {
  id: 'requirement-row-only',
  document_type: 'signed_otp',
  document_name: 'Signed OTP',
  status: 'uploaded',
}
const checklistOnly = buildKingstonsBuyerOtpReadiness({
  documents: [checklistRowOnly],
})

assert.equal(isKingstonsManualSignedOtpDocument(checklistRowOnly), false)
assert.equal(checklistOnly.gate.status, 'blocked')
assert.equal(checklistOnly.summary.missing, 1)

const rejected = buildKingstonsBuyerOtpReadiness({
  documents: [{
    ...signedOtpUpload,
    id: 'listing-doc-rejected-otp',
    status: 'rejected',
  }],
})

assert.equal(rejected.gate.status, 'blocked')
assert.equal(rejected.summary.attention, 1)
assert.equal(rejected.rows[0].state, 'attention')

assert.match(
  salesWorkflowSource,
  /NON_CANONICAL_SIGNED_OTP_TYPES[\s\S]*manual_otp_evidence/,
  'The generic sales workflow must keep loose manual OTP evidence out of canonical signed OTP completion.',
)
assert.match(
  salesWorkflowSource,
  /normalizedType === OTP_DOCUMENT_TYPES\.signedFinal/,
  'The generic sales workflow must still require signed_final for ordinary signed OTP completion.',
)

console.log('Kingstons buyer OTP rule phase 1 guard passed.')
