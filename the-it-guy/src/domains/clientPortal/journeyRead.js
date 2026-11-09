// clientPortal owns these operations and their existing recovery behavior.
import { loadTransactionWorkflowRollup } from '../transactions/progressApi.js'

export async function fetchTokenScopedTransactionJourneySnapshot(client, transactionId) {
  if (!client || !transactionId) return null

  try {
    const { resolveTransactionRollup } = await loadTransactionWorkflowRollup()
    const rollup = await resolveTransactionRollup(transactionId, {
      client,
      actorRole: 'external_share',
      preferLegacy: true,
    })
    return rollup?.transactionJourneySnapshot || null
  } catch {
    return null
  }
}
