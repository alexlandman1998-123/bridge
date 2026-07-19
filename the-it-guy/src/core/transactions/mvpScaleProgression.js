import { buildMvpPilotMetrics } from './mvpPilotMetrics.js'
import { evaluateMvpRolloutControls } from './mvpRolloutControls.js'

export const MVP_SCALE_PROGRESSION_VERSION = 'arch9_mvp_scale_progression_v1'
export const MVP_CAPACITY_LADDER = Object.freeze([10, 25, 50, 100])

export function evaluateMvpScaleProgression({ currentCapacity = 10, transactions = [], completedBatchAudits = 0 } = {}) {
  const capacity = Number(currentCapacity)
  const position = MVP_CAPACITY_LADDER.indexOf(capacity)
  const metrics = buildMvpPilotMetrics(transactions)
  const controls = evaluateMvpRolloutControls(metrics, { batchLimit: capacity, monthlyTarget: 100 })
  const blockers = [...metrics.blockers, ...controls.breaches]
  if (position === -1) blockers.push('invalid_capacity_level')
  if (Number(completedBatchAudits) < 1) blockers.push('completed_batch_audit_required')
  const nextCapacity = position >= 0 && position < MVP_CAPACITY_LADDER.length - 1 ? MVP_CAPACITY_LADDER[position + 1] : null
  return {
    version: MVP_SCALE_PROGRESSION_VERSION,
    decision: blockers.length ? 'pause_rollout' : nextCapacity ? 'advance_rollout' : 'maintain_mvp_capacity',
    currentCapacity: capacity,
    nextCapacity,
    metrics,
    controls,
    blockers: [...new Set(blockers)],
  }
}
