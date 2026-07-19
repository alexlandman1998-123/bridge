export const MVP_PILOT_METRICS_VERSION = 'arch9_mvp_pilot_metrics_v1'

export function buildMvpPilotMetrics(transactions = []) {
  const rows = Array.isArray(transactions) ? transactions : []
  const ids = new Set()
  const idempotency = new Set()
  const scenarioMix = {}
  let bootstrapFailures = 0
  let duplicateIdentities = 0
  for (const row of rows) {
    const id = String(row.transactionId || row.id || '').trim()
    const key = String(row.idempotencyKey || row.creation_idempotency_key || '').trim()
    if (id && ids.has(id)) duplicateIdentities += 1
    if (key && idempotency.has(key)) duplicateIdentities += 1
    if (id) ids.add(id)
    if (key) idempotency.add(key)
    const scenario = String(row.scenario || row.financeType || 'unknown')
    scenarioMix[scenario] = (scenarioMix[scenario] || 0) + 1
    if (row.participantBootstrapComplete === false || row.documentBootstrapComplete === false || row.workflowBootstrapComplete === false) bootstrapFailures += 1
  }
  const blockers = []
  if (duplicateIdentities) blockers.push('duplicate_transaction_identity')
  if (bootstrapFailures) blockers.push('bootstrap_failure_detected')
  return { version: MVP_PILOT_METRICS_VERSION, transactionCount: rows.length, uniqueTransactionCount: ids.size, uniqueIdempotencyCount: idempotency.size, scenarioMix, bootstrapFailures, duplicateIdentities, decision: blockers.length ? 'pause_rollout' : 'continue_rollout', blockers }
}
