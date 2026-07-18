function text(value) { return typeof value === 'string' ? value.trim() : '' }
function count(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }

const definitions = [
  ['A', 'G1_EDITABLE_DRAFT_MISSING', 'Restore or create the editable transaction draft before generating another version.', (e) => e.editableDraft?.present === true],
  ['C', 'G1_RENDER_FREEZE_INVALID', 'Freeze the saved editable revision again and verify the exact render input.', (e) => e.renderFreeze?.verified === true && text(e.renderFreeze?.freezeId) && text(e.renderFreeze?.fingerprint)],
  ['D', 'G1_CERTIFIED_PDF_INVALID', 'Regenerate the native PDF and persist its verified bucket, path and hash into the transaction.', (e) => e.certifiedPdf?.nativeVerified === true && e.certifiedPdf?.transactionPersisted === true && text(e.certifiedPdf?.path) && text(e.certifiedPdf?.sha256)],
  ['E1-E3', 'G1_APPLIED_LAYOUT_INVALID', 'Verify the visual placements and apply them to real signer identities on this version.', (e) => text(e.layout?.status) === 'applied' && e.layout?.placementVerified === true && count(e.layout?.fieldCount) > 0],
  ['E4', 'G1_DISPATCH_NOT_DELIVERED', 'Retry the signing dispatch and obtain confirmed delivery evidence.', (e) => e.dispatch?.delivered === true],
  ['F1-F2', 'G1_SIGNING_INCOMPLETE', 'Complete every required field and controlled signer session before finalisation.', (e) => count(e.signing?.signerCount) > 0 && count(e.signing?.signedCount) === count(e.signing?.signerCount) && count(e.signing?.completedSessionCount) === count(e.signing?.signerCount) && count(e.signing?.requiredFieldCount) > 0 && count(e.signing?.completedRequiredFieldCount) === count(e.signing?.requiredFieldCount)],
  ['F2', 'G1_FINAL_ARTIFACT_INVALID', 'Retry finalisation from the saved signatures until the immutable PDF evidence exists.', (e) => text(e.finalArtifact?.path) && /^[0-9a-f]{64}$/i.test(text(e.finalArtifact?.sha256)) && count(e.finalArtifact?.byteLength) >= 100],
  ['F3', 'G1_TRANSACTION_PUBLICATION_MISSING', 'Publish the exact final PDF into the originating transaction.', (e) => text(e.transactionPublication?.id) && text(e.transactionPublication?.transactionId) && text(e.transactionPublication?.documentId) && text(e.transactionPublication?.sha256) === text(e.finalArtifact?.sha256)],
  ['F4', 'G1_SURFACE_COMPLETION_MISSING', 'Synchronize the transaction, portal and canonical signed-document requirement.', (e) => text(e.surfaceCompletion?.id) && e.surfaceCompletion?.transactionVisible === true && e.surfaceCompletion?.clientVisible === true && e.surfaceCompletion?.canonicalSatisfied === true],
  ['F5', 'G1_RECIPIENT_DELIVERY_INCOMPLETE', 'Use Retry completion; the immutable signed PDF will be reused for outstanding recipients.', (e) => count(e.delivery?.recipientCount) > 0 && count(e.delivery?.deliveredRecipientCount) === count(e.delivery?.recipientCount)],
]

export function assessDocumentGeneratorLaunchChain(evidence = {}) {
  const blockers = []
  if (text(evidence.contract) !== 'g1-v1') blockers.push({ phase: 'G1', code: 'G1_CONTRACT_INVALID', solution: 'Deploy the G1 evidence function and reload the packet.' })
  if (!['otp', 'mandate'].includes(text(evidence.packetType).toLowerCase())) blockers.push({ phase: 'G1', code: 'G1_PACKET_TYPE_INVALID', solution: 'Run launch assurance against a mandate or OTP packet.' })
  if (evidence.currentVersion !== true) blockers.push({ phase: 'A', code: 'G1_CURRENT_VERSION_MISMATCH', solution: 'Open and complete the current packet version instead of an older version.' })
  for (const [phase, code, solution, check] of definitions) if (!check(evidence)) blockers.push({ phase, code, solution })
  return { ready: blockers.length === 0, blockers, firstBlocker: blockers[0] || null, completedStageCount: definitions.length - blockers.filter((item) => item.phase !== 'G1' && item.code !== 'G1_CURRENT_VERSION_MISMATCH').length, totalStageCount: definitions.length }
}
