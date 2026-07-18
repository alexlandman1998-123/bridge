import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentGeneratorRecoveryRehearsal } from '../documentGeneratorRecoveryRehearsal.js'

function rehearsal(packetType) {
  return { success: true, rehearsal: true, mutatedData: false, evidence: { contract: 'g4-v1', packetType, currentVersion: true, packetStatus: 'completed', mutatedData: false, safeToExecute: true, immutableArtifact: { valid: true, evidenceCount: 1, path: `final/${packetType}.pdf`, sha256: 'a'.repeat(64), byteLength: 500 }, transactionPublication: { valid: true, count: 1, transactionId: 'transaction', documentId: 'document' }, surfaceCompletion: { valid: true, count: 1, transactionVisible: true, clientVisible: true, canonicalSatisfied: true }, actualState: { activeDeliveryClaimCount: 0, activeCompletionRetryCount: 0 }, simulatedRecipientFailure: { applied: true, recipientCount: 2, wouldSkipDeliveredRecipientCount: 1, wouldClaimRecipientCount: 1, wouldReuseArtifact: true, wouldReusePublication: true, wouldReuseCompletionReceipt: true, providerIdempotencyKeyStable: true, signedArtifactMutationCount: 0 } } }
}
const ready = { g3: { status: 'READY_FOR_G4', ready: true }, rehearsals: [rehearsal('otp'), rehearsal('mandate')] }

test('certifies read-only OTP and mandate recovery rehearsals', () => assert.equal(assessDocumentGeneratorRecoveryRehearsal(ready).ready, true))
test('fails when the recovery plan could duplicate a recipient delivery', () => {
  const mandate = rehearsal('mandate'); mandate.evidence.simulatedRecipientFailure.wouldSkipDeliveredRecipientCount = 0
  assert.ok(assessDocumentGeneratorRecoveryRehearsal({ ...ready, rehearsals: [rehearsal('otp'), mandate] }).blockers.some((item) => item.code === 'G4_RECIPIENT_PLAN_INVALID'))
})
test('fails if rehearsal changes signed-document state', () => {
  const otp = rehearsal('otp'); otp.mutatedData = true
  const result = assessDocumentGeneratorRecoveryRehearsal({ ...ready, rehearsals: [otp, rehearsal('mandate')] })
  assert.ok(result.blockers.some((item) => item.code === 'G4_REHEARSAL_MUTATED_DATA' && item.solution))
})
