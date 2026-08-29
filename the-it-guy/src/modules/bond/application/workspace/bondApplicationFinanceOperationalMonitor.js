export const BOND_APPLICATION_FINANCE_MONITOR_VERSION = 'bond-application-finance-monitor-v1'

export const BOND_APPLICATION_FINANCE_MONITOR_THRESHOLDS = Object.freeze({
  fallbackRate: 0.05,
  refreshFailureRate: 0.1,
})

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export function buildBondApplicationFinanceOperationalStatus(snapshot = {}, options = {}) {
  const thresholds = {
    ...BOND_APPLICATION_FINANCE_MONITOR_THRESHOLDS,
    ...(options.thresholds || {}),
  }
  const rpcAvailable = options.rpcAvailable !== false
  const versionValid = snapshot.version === BOND_APPLICATION_FINANCE_MONITOR_VERSION
  const totalEvents = number(snapshot.totalEvents)
  const fallbackCount = number(snapshot.fallbackCount)
  const refreshFailureCount = number(snapshot.refreshFailureCount)
  const identityInvalidCount = number(snapshot.identityInvalidCount)
  const fallbackRate = totalEvents ? fallbackCount / totalEvents : 0
  const refreshFailureRate = totalEvents ? refreshFailureCount / totalEvents : 0
  const reasons = []

  let status = 'HEALTHY'
  if (!rpcAvailable || !versionValid || identityInvalidCount > 0) {
    status = 'BLOCKED'
    if (!rpcAvailable) reasons.push('The monitoring RPC is unavailable.')
    if (!versionValid) reasons.push('The monitoring contract version is missing or unexpected.')
    if (identityInvalidCount > 0) reasons.push(`${identityInvalidCount} canonical application identity failure${identityInvalidCount === 1 ? '' : 's'} detected.`)
  } else if (totalEvents === 0) {
    status = 'NO_TRAFFIC'
    reasons.push('No Finance workspace telemetry was recorded in this window.')
  } else if (fallbackRate >= thresholds.fallbackRate || refreshFailureRate >= thresholds.refreshFailureRate) {
    status = 'DEGRADED'
    if (fallbackRate >= thresholds.fallbackRate) reasons.push(`Compatibility fallback rate is ${(fallbackRate * 100).toFixed(1)}%.`)
    if (refreshFailureRate >= thresholds.refreshFailureRate) reasons.push(`Refresh failure rate is ${(refreshFailureRate * 100).toFixed(1)}%.`)
  }

  return Object.freeze({
    version: BOND_APPLICATION_FINANCE_MONITOR_VERSION,
    status,
    healthy: status === 'HEALTHY' || status === 'NO_TRAFFIC',
    rollbackRecommended: status === 'BLOCKED',
    reasons,
    metrics: Object.freeze({
      totalEvents,
      fallbackCount,
      refreshFailureCount,
      identityInvalidCount,
      fallbackRate,
      refreshFailureRate,
      lastEventAt: snapshot.lastEventAt || null,
      windowMinutes: number(snapshot.windowMinutes) || 60,
    }),
    thresholds: Object.freeze(thresholds),
  })
}
