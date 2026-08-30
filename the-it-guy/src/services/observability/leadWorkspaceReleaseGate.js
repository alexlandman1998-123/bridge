export const LEAD_WORKSPACE_RELEASE_GATE_CONTRACT = 'arch9-lead-workspace-release-gate-v1'

export const LEAD_WORKSPACE_RELEASE_THRESHOLDS = Object.freeze({
  maxReadyMs: 30_000,
  maxVisualShellVariants: 1,
  maxTerminalEmptyStateViolations: 0,
  maxSellerMisclassificationViolations: 0,
  maxShellHeightDeltaPx: 24,
})

function number(value = 0) {
  const resolved = Number(value)
  return Number.isFinite(resolved) ? resolved : 0
}

function check(code, ok, actual, limit) {
  return { code, ok: Boolean(ok), actual, limit }
}

export function evaluateLeadWorkspaceReleaseGate({
  trace = null,
  observation = null,
  readyMs = 0,
  bundleReport = null,
  thresholds = LEAD_WORKSPACE_RELEASE_THRESHOLDS,
} = {}) {
  const stages = Array.isArray(trace?.stages) ? trace.stages.map((entry) => entry?.stage).filter(Boolean) : []
  const visualShellVariants = Array.isArray(observation?.visualShellVariants) ? observation.visualShellVariants.length : 0
  const terminalViolations = Array.isArray(observation?.terminalEmptyStateViolations) ? observation.terminalEmptyStateViolations.length : 0
  const sellerMisclassifications = Array.isArray(observation?.sellerMisclassificationViolations) ? observation.sellerMisclassificationViolations.length : 0
  const routes = Array.isArray(bundleReport?.routes) ? bundleReport.routes : []
  const bundleWithinBudget = routes.length === 0 || routes.every((route) => (
    number(route?.rawBytes) <= number(route?.rawBudgetBytes) &&
    number(route?.gzipBytes) <= number(route?.gzipBudgetBytes)
  ))

  const checks = [
    check('WORKSPACE_READY', trace?.outcome === 'ready' && stages.includes('workspace_ready'), trace?.outcome || '', 'ready'),
    check('CORE_LEAD_READY', stages.includes('core_lead_ready'), stages, 'core_lead_ready'),
    check('READY_TIME_BUDGET', number(readyMs) <= number(thresholds.maxReadyMs), number(readyMs), number(thresholds.maxReadyMs)),
    check('ONE_VISUAL_LOADING_SHELL', visualShellVariants <= number(thresholds.maxVisualShellVariants), visualShellVariants, number(thresholds.maxVisualShellVariants)),
    check('NO_TERMINAL_EMPTY_STATE_FLASH', terminalViolations <= number(thresholds.maxTerminalEmptyStateViolations), terminalViolations, number(thresholds.maxTerminalEmptyStateViolations)),
    check('NO_SELLER_AS_BUYER_FLASH', sellerMisclassifications <= number(thresholds.maxSellerMisclassificationViolations), sellerMisclassifications, number(thresholds.maxSellerMisclassificationViolations)),
    check('STABLE_LOADING_SHELL_HEIGHT', number(observation?.maxShellHeightDeltaPx) <= number(thresholds.maxShellHeightDeltaPx), number(observation?.maxShellHeightDeltaPx), number(thresholds.maxShellHeightDeltaPx)),
    check('ROUTE_BUNDLES_WITHIN_BUDGET', bundleWithinBudget, routes, 'within_budget'),
  ]

  return {
    contract: LEAD_WORKSPACE_RELEASE_GATE_CONTRACT,
    status: checks.every((entry) => entry.ok) ? 'passed' : 'failed',
    checks,
    failedChecks: checks.filter((entry) => !entry.ok).map((entry) => entry.code),
  }
}
