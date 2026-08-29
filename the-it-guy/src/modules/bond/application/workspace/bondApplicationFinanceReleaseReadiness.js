export const BOND_APPLICATION_FINANCE_RELEASE_VERSION = 'bond-application-finance-release-v1'

export const BOND_APPLICATION_FINANCE_RELEASE_CHECKS = Object.freeze([
  ['identity_contract', 'Canonical application identity'],
  ['workspace_contract', 'Application-scoped read model'],
  ['agent_safe_contract', 'Agent-safe data boundary'],
  ['journey_ui', 'Bond application journey'],
  ['where_we_are_ui', 'Where-we-are explanation'],
  ['refresh_resilience', 'Refresh and fallback resilience'],
  ['regression_suite', 'Phases 1–8 regression suite'],
  ['production_build', 'Production build'],
  ['remote_rpc', 'Secured RPC deployed'],
])

function check(key, label, passed, required, remediation) {
  return Object.freeze({
    key,
    label,
    required,
    status: passed ? 'pass' : required ? 'fail' : 'warn',
    passed: passed || !required,
    remediation: passed ? '' : remediation,
  })
}

export function buildBondApplicationFinanceReleaseReadiness(evidence = {}) {
  const remoteRequired = evidence.requireRemoteRpc === true
  const checks = BOND_APPLICATION_FINANCE_RELEASE_CHECKS.map(([key, label]) => {
    const required = key !== 'remote_rpc' || remoteRequired
    const remediation = key === 'remote_rpc'
      ? 'Deploy the Phase 1 identity and Phase 2 workspace migrations in order, then run an authenticated RPC smoke test.'
      : `Restore the ${label.toLowerCase()} evidence before release.`
    return check(key, label, evidence[key] === true, required, remediation)
  })
  const blockingChecks = checks.filter((item) => item.required && item.status === 'fail')
  const warningChecks = checks.filter((item) => item.status === 'warn')
  return Object.freeze({
    version: BOND_APPLICATION_FINANCE_RELEASE_VERSION,
    decision: blockingChecks.length ? 'BLOCKED' : 'GO',
    checks,
    blockingChecks,
    warningChecks,
    summary: blockingChecks.length
      ? `${blockingChecks.length} required release check${blockingChecks.length === 1 ? '' : 's'} blocked.`
      : warningChecks.length
        ? 'Local release checks pass; remote RPC deployment remains pending.'
        : 'All local and remote release checks pass.',
  })
}
