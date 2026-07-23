import { buildSigningCompletion } from './signingCompletionContract.js'

export function getSigningCompletionAccess(value = {}) {
  const completion = buildSigningCompletion(value)
  const finalCopyReady = completion.finalArtifact.ready && Boolean(
    completion.finalArtifact.documentId ||
    (completion.finalArtifact.packetId && completion.finalArtifact.packetVersionId) ||
    completion.finalArtifact.url ||
    completion.finalArtifact.path,
  )
  const transactionReady = completion.transactionSaved && completion.access.transactionVisible
  const portalReady = completion.access.clientVisible && Boolean(completion.access.portalSurface)
  const canonicalReady = completion.access.canonicalSatisfied
  const settled = finalCopyReady && transactionReady && portalReady && canonicalReady

  return {
    completed: completion.status === 'completed',
    finalCopyReady,
    transactionReady,
    portalReady,
    canonicalReady,
    emailDelivered: completion.delivery.emailStatus === 'sent',
    settled,
    shouldPoll: completion.status === 'completed' && !settled,
  }
}
