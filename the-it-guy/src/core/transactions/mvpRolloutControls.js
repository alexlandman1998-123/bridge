export const MVP_ROLLOUT_CONTROLS_VERSION = 'arch9_mvp_rollout_controls_v1'

export function evaluateMvpRolloutControls(metrics = {}, { batchLimit = 10, monthlyTarget = 100 } = {}) {
  const breaches = []
  if (Number(metrics.transactionCount || 0) > batchLimit) breaches.push('batch_limit_exceeded')
  if (Number(metrics.duplicateIdentities || 0) > 0) breaches.push('duplicate_identity_detected')
  if (Number(metrics.bootstrapFailures || 0) > 0) breaches.push('bootstrap_failure_detected')
  if (Number(metrics.transactionCount || 0) > monthlyTarget) breaches.push('monthly_target_exceeded')
  return { version: MVP_ROLLOUT_CONTROLS_VERSION, decision: breaches.length ? 'pause_rollout' : 'continue_rollout', limits: { batchLimit, monthlyTarget }, breaches }
}
