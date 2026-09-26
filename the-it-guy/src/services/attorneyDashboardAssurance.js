const ATTENTION_KEYS = ['signatures', 'guarantees', 'clearance', 'clientDocuments', 'invoices', 'stalled']
const HEALTH_KEYS = ['onTrack', 'attention', 'critical']

function countMismatch(metric, count, ids) {
  if (!Array.isArray(ids) || !Number.isFinite(Number(count)) || Number(count) !== new Set(ids).size) return metric
  return null
}

/** Metadata-only reconciliation; matter IDs and client details never enter telemetry. */
export function auditAttorneyDashboardMetricSnapshots({ attention, revenue, healthPerformance } = {}) {
  const issues = []
  if (attention?.sourceStatus === 'available') {
    for (const key of ATTENTION_KEYS) {
      if (countMismatch(`attention.${key}`, attention[key]?.count, attention[key]?.matterIds)) issues.push(`attention.${key}`)
    }
  }
  if (revenue?.sourceStatus === 'available') {
    if (countMismatch('revenue.pricedMatters', revenue.revenuePipeline?.pricedMatterCount, revenue.revenuePipeline?.matterIds)) {
      issues.push('revenue.pricedMatters')
    }
  }
  if (healthPerformance?.sourceStatus === 'available') {
    const health = healthPerformance.matterHealth || {}
    for (const key of HEALTH_KEYS) {
      if (countMismatch(`health.${key}`, health[key]?.count, health[key]?.matterIds)) issues.push(`health.${key}`)
    }
    if (HEALTH_KEYS.reduce((sum, key) => sum + Number(health[key]?.count || 0), 0) !== Number(health.total)) {
      issues.push('health.total')
    }
    const performance = healthPerformance.conveyancingPerformance || {}
    const forecast = performance.registrationForecast || {}
    for (const key of ['thisWeek', 'nextWeek', 'thisMonth']) {
      if (countMismatch(`forecast.${key}`, forecast[key], forecast[`${key}MatterIds`])) issues.push(`forecast.${key}`)
    }
    for (const row of performance.matterDistribution || []) {
      if (countMismatch(`distribution.${row.label}`, row.count, row.matterIds)) issues.push(`distribution.${row.label}`)
    }
  }
  return issues
}
