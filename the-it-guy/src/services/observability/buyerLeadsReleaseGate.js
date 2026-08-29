export const BUYER_LEADS_RELEASE_GATE_CONTRACT = 'arch9-buyer-leads-release-gate-v1'

export const BUYER_LEADS_RELEASE_GATE_LIMITS = Object.freeze({
  workspaceReadyMs: 2500,
  supabaseRequestCount: 12,
  duplicateSupabaseRequestCount: 0,
  inactiveSpecialistRequestCount: 0,
  longTaskDurationMs: 200,
  routeChunkTransferBytes: 350_000,
})

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export function evaluateBuyerLeadsReleaseGate(sample = {}, limits = BUYER_LEADS_RELEASE_GATE_LIMITS) {
  const checks = [
    ['workspace_ready_ms', finiteNumber(sample.durationMs), limits.workspaceReadyMs],
    ['supabase_request_count', finiteNumber(sample.supabaseRequestCount), limits.supabaseRequestCount],
    ['duplicate_supabase_request_count', finiteNumber(sample.duplicateSupabaseRequestCount), limits.duplicateSupabaseRequestCount],
    ['inactive_specialist_request_count', finiteNumber(sample.inactiveSpecialistRequestCount), limits.inactiveSpecialistRequestCount],
    ['long_task_duration_ms', finiteNumber(sample.longTaskDurationMs), limits.longTaskDurationMs],
  ]

  if (sample.routeChunkTransferBytes != null) {
    checks.push([
      'route_chunk_transfer_bytes',
      finiteNumber(sample.routeChunkTransferBytes),
      limits.routeChunkTransferBytes,
    ])
  }

  const results = checks.map(([key, actual, budget]) => ({
    key,
    actual,
    budget,
    withinBudget: actual <= budget,
  }))
  const breaches = results.filter((check) => !check.withinBudget)

  return {
    contract: BUYER_LEADS_RELEASE_GATE_CONTRACT,
    status: breaches.length ? 'breached' : 'within_budget',
    withinBudget: breaches.length === 0,
    checks: results,
    breaches,
  }
}
