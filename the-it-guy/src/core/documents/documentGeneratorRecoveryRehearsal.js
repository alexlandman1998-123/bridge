function text(value) { return typeof value === 'string' ? value.trim() : '' }
function count(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : -1 }

const solutions = {
  G4_G3_NOT_READY: 'Complete the G3 operational launch gate before certifying recovery.',
  G4_REHEARSAL_MISSING: 'Deploy the G4 migration and recovery endpoint, then rehearse this document type again.',
  G4_TARGET_INVALID: 'Use the current completed mandate or OTP version selected by the G1 controlled pair.',
  G4_FINAL_ARTIFACT_UNSAFE: 'Restore the single immutable final PDF evidence record and verify its path, hash and byte length.',
  G4_TRANSACTION_PUBLICATION_UNSAFE: 'Restore the one-to-one final transaction document publication using the same artifact hash.',
  G4_SURFACE_COMPLETION_UNSAFE: 'Restore the immutable completion receipt and transaction, client and canonical visibility.',
  G4_RECOVERY_BUSY: 'Allow the active delivery claim or completion retry to finish, or recover it after the ten-minute lease expires.',
  G4_RECIPIENT_PLAN_INVALID: 'Restore recipient evidence so recovery skips successful deliveries and claims only the simulated failed recipient.',
  G4_IDEMPOTENCY_UNPROVEN: 'Restore the stable provider idempotency key and immutable-artifact reuse contract.',
  G4_REHEARSAL_MUTATED_DATA: 'Disable the rehearsal immediately; G4 must not claim, send, publish or modify any record.',
}
const blocker = (code, packetType, detail) => ({ code, ...(packetType ? { packetType } : {}), ...(detail ? { detail } : {}), solution: solutions[code] })

export function assessDocumentGeneratorRecoveryRehearsal({ g3 = {}, rehearsals = [] } = {}) {
  const blockers = []
  if (g3.status !== 'READY_FOR_G4' || g3.ready !== true) blockers.push(blocker('G4_G3_NOT_READY'))
  const rows = Array.isArray(rehearsals) ? rehearsals : []
  for (const packetType of ['otp', 'mandate']) {
    const row = rows.find((item) => text(item?.evidence?.packetType).toLowerCase() === packetType)
    if (!row) { blockers.push(blocker('G4_REHEARSAL_MISSING', packetType)); continue }
    const evidence = row.evidence || {}
    const artifact = evidence.immutableArtifact || {}
    const publication = evidence.transactionPublication || {}
    const completion = evidence.surfaceCompletion || {}
    const actual = evidence.actualState || {}
    const simulation = evidence.simulatedRecipientFailure || {}
    if (row.success !== true || row.rehearsal !== true || evidence.contract !== 'g4-v1' || evidence.currentVersion !== true || evidence.packetStatus !== 'completed') blockers.push(blocker('G4_TARGET_INVALID', packetType))
    if (row.mutatedData !== false || evidence.mutatedData !== false || count(simulation.signedArtifactMutationCount) !== 0) blockers.push(blocker('G4_REHEARSAL_MUTATED_DATA', packetType))
    if (artifact.valid !== true || count(artifact.evidenceCount) !== 1 || !text(artifact.path) || !/^[0-9a-f]{64}$/i.test(text(artifact.sha256)) || count(artifact.byteLength) < 100) blockers.push(blocker('G4_FINAL_ARTIFACT_UNSAFE', packetType))
    if (publication.valid !== true || count(publication.count) !== 1 || !text(publication.transactionId) || !text(publication.documentId)) blockers.push(blocker('G4_TRANSACTION_PUBLICATION_UNSAFE', packetType))
    if (completion.valid !== true || count(completion.count) !== 1 || completion.transactionVisible !== true || completion.clientVisible !== true || completion.canonicalSatisfied !== true) blockers.push(blocker('G4_SURFACE_COMPLETION_UNSAFE', packetType))
    if (evidence.safeToExecute !== true || count(actual.activeDeliveryClaimCount) !== 0 || count(actual.activeCompletionRetryCount) !== 0) blockers.push(blocker('G4_RECOVERY_BUSY', packetType))
    const recipientCount = count(simulation.recipientCount)
    if (simulation.applied !== true || recipientCount < 1 || count(simulation.wouldClaimRecipientCount) !== 1 || count(simulation.wouldSkipDeliveredRecipientCount) !== recipientCount - 1) blockers.push(blocker('G4_RECIPIENT_PLAN_INVALID', packetType))
    if (simulation.wouldReuseArtifact !== true || simulation.wouldReusePublication !== true || simulation.wouldReuseCompletionReceipt !== true || simulation.providerIdempotencyKeyStable !== true) blockers.push(blocker('G4_IDEMPOTENCY_UNPROVEN', packetType))
  }
  const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.packetType || ''}`, item])).values()]
  return { ready: unique.length === 0, blockers: unique, rehearsalCount: rows.length }
}
