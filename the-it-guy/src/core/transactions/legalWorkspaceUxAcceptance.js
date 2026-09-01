export const LEGAL_WORKSPACE_UX_ACCEPTANCE_CONTRACT = 'arch9-legal-workspace-ux-acceptance-v1'

export const LEGAL_WORKSPACE_UX_ACCEPTANCE_SCENARIOS = Object.freeze([
  { id: 'transfer_core', label: 'Transfer attorney completes the next legal action', lane: 'transfer', viewport: 'desktop' },
  { id: 'bond_registration_core', label: 'Bond attorney completes the next legal action', lane: 'bond', viewport: 'desktop' },
  { id: 'cancellation_core', label: 'Cancellation attorney completes the next legal action', lane: 'cancellation', viewport: 'desktop' },
  { id: 'blocked_waiting_follow_up', label: 'Blocked or waiting task records a reason and follow-up date', lane: 'all', viewport: 'desktop' },
  { id: 'buyer_visibility', label: 'A buyer-visible update appears in buyer transaction progress only', lane: 'transfer', viewport: 'desktop' },
  { id: 'seller_visibility', label: 'A seller-visible update appears in seller transaction progress only', lane: 'transfer', viewport: 'desktop' },
  { id: 'permission_denied', label: 'A missing permission fails safely and preserves the task context', lane: 'all', viewport: 'desktop' },
  { id: 'upload_failure_recovery', label: 'A failed upload can be retried without losing the current task', lane: 'all', viewport: 'desktop' },
  { id: 'responsive_desktop', label: 'Next action remains visible on a desktop viewport', lane: 'all', viewport: 'desktop' },
  { id: 'responsive_short_laptop', label: 'Next action remains visible on a short laptop viewport', lane: 'all', viewport: 'short_laptop' },
  { id: 'responsive_tablet', label: 'Task, requirements, and actions remain usable on tablet', lane: 'all', viewport: 'tablet' },
])

const METRIC_RULES = Object.freeze([
  { key: 'timeToNextActionMs', label: 'Time to identify next action is at most 10 seconds', test: (value) => Number.isFinite(value) && value <= 10_000 },
  { key: 'medianTaskClicks', label: 'Median task completion uses at most 3 action clicks', test: (value) => Number.isFinite(value) && value <= 3 },
  { key: 'completionErrorCount', label: 'No incorrect completions are observed', test: (value) => value === 0 },
  { key: 'abandonedTaskCount', label: 'No tested task is abandoned', test: (value) => value === 0 },
  { key: 'duplicateNavigationCount', label: 'No duplicate navigation is needed', test: (value) => value === 0 },
  { key: 'clientVisibilityErrorCount', label: 'No incorrect or missing client update is observed', test: (value) => value === 0 },
])

export function assessLegalWorkspaceUxAcceptance({ observations = [], metrics = {} } = {}) {
  const observationMap = new Map(observations.map((observation) => [observation.id, observation]))
  const scenarioResults = LEGAL_WORKSPACE_UX_ACCEPTANCE_SCENARIOS.map((scenario) => {
    const observation = observationMap.get(scenario.id)
    return { ...scenario, passed: observation?.passed === true, evidence: String(observation?.evidence || '').trim() }
  })
  const metricResults = METRIC_RULES.map((rule) => ({
    key: rule.key,
    label: rule.label,
    value: metrics[rule.key],
    passed: rule.test(metrics[rule.key]),
  }))
  const blockers = [
    ...scenarioResults.filter((result) => !result.passed).map((result) => ({ type: 'scenario', key: result.id, label: result.label })),
    ...metricResults.filter((result) => !result.passed).map((result) => ({ type: 'metric', key: result.key, label: result.label })),
  ]

  return {
    contract: LEGAL_WORKSPACE_UX_ACCEPTANCE_CONTRACT,
    ready: blockers.length === 0,
    status: blockers.length ? 'blocked' : 'ready',
    requiredScenarioCount: scenarioResults.length,
    passedScenarioCount: scenarioResults.filter((result) => result.passed).length,
    scenarioResults,
    metricResults,
    blockers,
  }
}
