export const BOND_APPLICATION_FINANCE_STABILIZATION_VERSION = 'bond-application-finance-stabilization-v1'

export const BOND_APPLICATION_FINANCE_STABILIZATION_CRITERIA = Object.freeze({
  minEvents: 100,
  minActiveDays: 3,
  minPopulatedWorkspaceEvents: 1,
  maxFallbackRate: 0.01,
  maxRefreshFailureRate: 0.02,
})

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function check(key, label, passed, actual, expected) {
  return Object.freeze({ key, label, passed, actual, expected })
}

export function buildBondApplicationFinanceStabilizationDecision(snapshot = {}, options = {}) {
  const criteria = {
    ...BOND_APPLICATION_FINANCE_STABILIZATION_CRITERIA,
    ...(options.criteria || {}),
  }
  const rpcAvailable = options.rpcAvailable !== false
  const contractValid = snapshot.version === BOND_APPLICATION_FINANCE_STABILIZATION_VERSION
  const totalEvents = number(snapshot.totalEvents)
  const activeDays = number(snapshot.activeDays)
  const populatedWorkspaceEventCount = number(snapshot.populatedWorkspaceEventCount)
  const fallbackCount = number(snapshot.fallbackCount)
  const refreshFailureCount = number(snapshot.refreshFailureCount)
  const identityInvalidCount = number(snapshot.identityInvalidCount)
  const fallbackRate = totalEvents ? fallbackCount / totalEvents : 0
  const refreshFailureRate = totalEvents ? refreshFailureCount / totalEvents : 0
  const checks = [
    check('rpc_available', 'Certification RPC available', rpcAvailable, rpcAvailable, true),
    check('contract_valid', 'Certification contract valid', contractValid, snapshot.version || null, BOND_APPLICATION_FINANCE_STABILIZATION_VERSION),
    check('event_volume', 'Minimum event volume', totalEvents >= criteria.minEvents, totalEvents, criteria.minEvents),
    check('active_days', 'Minimum active days', activeDays >= criteria.minActiveDays, activeDays, criteria.minActiveDays),
    check('populated_workspace', 'Populated application observed', populatedWorkspaceEventCount >= criteria.minPopulatedWorkspaceEvents, populatedWorkspaceEventCount, criteria.minPopulatedWorkspaceEvents),
    check('identity_integrity', 'No canonical identity failures', identityInvalidCount === 0, identityInvalidCount, 0),
    check('fallback_rate', 'Compatibility fallback rate', fallbackRate <= criteria.maxFallbackRate, fallbackRate, criteria.maxFallbackRate),
    check('refresh_failure_rate', 'Refresh failure rate', refreshFailureRate <= criteria.maxRefreshFailureRate, refreshFailureRate, criteria.maxRefreshFailureRate),
  ]
  const failedChecks = checks.filter((item) => !item.passed)
  const decision = identityInvalidCount > 0
    ? 'ROLLBACK'
    : failedChecks.length
      ? 'HOLD'
      : 'SIGN_OFF'

  return Object.freeze({
    version: BOND_APPLICATION_FINANCE_STABILIZATION_VERSION,
    decision,
    fallbackRetirementApproved: decision === 'SIGN_OFF',
    checks,
    failedChecks,
    criteria: Object.freeze(criteria),
    metrics: Object.freeze({
      totalEvents,
      activeDays,
      populatedWorkspaceEventCount,
      fallbackCount,
      refreshFailureCount,
      identityInvalidCount,
      fallbackRate,
      refreshFailureRate,
      firstEventAt: snapshot.firstEventAt || null,
      lastEventAt: snapshot.lastEventAt || null,
      windowMinutes: number(snapshot.windowMinutes) || 10080,
    }),
    summary: decision === 'SIGN_OFF'
      ? 'Stabilisation evidence passes; compatibility fallback retirement may be planned.'
      : decision === 'ROLLBACK'
        ? 'Canonical identity failures detected; preserve compatibility mode and execute rollback review.'
        : `${failedChecks.length} stabilisation criterion${failedChecks.length === 1 ? '' : 'a'} still require evidence; keep compatibility mode enabled.`,
  })
}
