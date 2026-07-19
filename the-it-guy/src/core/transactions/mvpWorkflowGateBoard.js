import { evaluateMvpOnboardingGate } from './mvpOnboardingGate.js'
import { evaluateMvpOtpGate } from './mvpOtpGate.js'
import { evaluateMvpFinanceGate } from './mvpFinanceGate.js'
import { evaluateMvpTransferGate } from './mvpTransferGate.js'

export const MVP_WORKFLOW_GATE_BOARD_VERSION = 'arch9_mvp_workflow_gate_board_v1'

function key(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function uniqueBlockers(blockers = []) {
  return [...new Map((blockers || []).map((blocker) => [blocker.key || blocker.reason, blocker])).values()]
}

function withGateType(gateKey, blockers = []) {
  return blockers.map((blocker) => ({ ...blocker, gateKey, type: gateKey }))
}

function laneGateKey(lane = {}) {
  const laneKey = key(lane.laneKey || lane.lane_key || lane.laneType || lane.lane_type || lane.processType || lane.process_type)
  if (laneKey === 'main') return 'onboarding'
  if (laneKey === 'finance') return 'finance'
  if (laneKey === 'bond') return 'transfer'
  if (laneKey === 'transfer' || laneKey === 'attorney') return 'transfer'
  return null
}

/** Evaluates every MVP gate and applies those read-only decisions to each lane. */
export function buildMvpWorkflowGateBoard({ routingProfile = {}, participants = [], documentRequirements = [], workflowLanes = [] } = {}) {
  const onboarding = evaluateMvpOnboardingGate({ participants, documentRequirements })
  const otp = evaluateMvpOtpGate({ routingProfile, participants, documentRequirements })
  const finance = evaluateMvpFinanceGate({ routingProfile, participants, documentRequirements })
  const transfer = evaluateMvpTransferGate({ routingProfile, participants, documentRequirements })
  const gates = [
    { key: 'onboarding', label: 'Onboarding', blockers: withGateType('onboarding', onboarding.blockers) },
    { key: 'otp', label: 'OTP execution', blockers: withGateType('otp', otp.blockers) },
    { key: 'finance', label: 'Finance readiness', blockers: withGateType('finance', uniqueBlockers([...otp.blockers, ...finance.blockers])) },
    { key: 'transfer', label: 'Transfer readiness', blockers: withGateType('transfer', uniqueBlockers([...otp.blockers, ...finance.blockers, ...transfer.blockers])) },
  ].map((gate) => ({ ...gate, satisfied: gate.blockers.length === 0 }))
  const gatesByKey = new Map(gates.map((gate) => [gate.key, gate]))
  const lanes = (Array.isArray(workflowLanes) ? workflowLanes : []).map((lane) => {
    const gateKey = laneGateKey(lane)
    const gate = gateKey ? gatesByKey.get(gateKey) : null
    const explicitBlocked = key(lane.status) === 'blocked' || Boolean(lane.blockedReason || lane.blocked_reason)
    const gateBlocked = Boolean(gate && !gate.satisfied)
    return {
      ...lane,
      gateKey,
      gate,
      canProgress: !explicitBlocked && (!gate || gate.satisfied),
      blocked: explicitBlocked || gateBlocked,
      blockedReason: explicitBlocked
        ? String(lane.blockedReason || lane.blocked_reason || 'Workflow lane is blocked.')
        : gateBlocked
          ? gate.blockers[0]?.reason || `${gate.label} gate is not satisfied.`
          : null,
      blockers: uniqueBlockers([...(Array.isArray(lane.blockers) ? lane.blockers : []), ...(gate?.blockers || [])]),
    }
  })
  return { version: MVP_WORKFLOW_GATE_BOARD_VERSION, gates, lanes }
}
