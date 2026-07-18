import test from 'node:test'
import assert from 'node:assert/strict'
import { assessControlledFinalSignedCompletion } from '../controlledFinalSignedCompletion.js'

const version = { id: 'version-1', transactionPdfPersisted: true, nativePdfVerified: true }
const layout = { id: 'layout-1', status: 'applied', placementVerified: true }
const dispatches = [{ layoutId: 'layout-1', status: 'delivered' }]
const signers = [{ id: 'signer-1', packetVersionId: 'version-1', status: 'signed' }]
const sessions = [{ signerId: 'signer-1', packetVersionId: 'version-1', status: 'completed' }]
const fields = [{ required: true, status: 'completed', fieldType: 'signature', signatureAssetPath: 'document-signatures/p/s/signature.png' }]
const artifact = { path: 'signed/final.pdf', sha256: 'a'.repeat(64), byteLength: 1024 }

test('accepts one completed controlled signing chain', () => {
  assert.equal(assessControlledFinalSignedCompletion({ version, layout, dispatches, signers, sessions, fields, artifact }).ready, true)
})

test('rejects a signer whose F1 session was not completed', () => {
  const result = assessControlledFinalSignedCompletion({ version, layout, dispatches, signers, sessions: [], fields, artifact })
  assert.ok(result.reasons.includes('F2_CONTROLLED_SESSION_INCOMPLETE'))
})

test('rejects a missing immutable final artifact hash', () => {
  const result = assessControlledFinalSignedCompletion({ version, layout, dispatches, signers, sessions, fields, artifact: { path: 'signed/final.pdf' } })
  assert.ok(result.reasons.includes('F2_FINAL_ARTIFACT_INVALID'))
})
