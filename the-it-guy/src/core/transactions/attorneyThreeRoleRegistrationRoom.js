import { ATTORNEY_WORKFLOW_STAGE_DEFINITIONS, normalizeAttorneyStageKey } from '../../constants/attorneyWorkflowStages.js'
import { buildTransferAttorneyCockpit } from './attorneyTransferWorldClassCockpit.js'
import { buildBondAttorneyCockpit } from './attorneyBondWorldClassCockpit.js'
import { buildCancellationAttorneyCockpit } from './attorneyCancellationWorldClassCockpit.js'

export const ATTORNEY_THREE_ROLE_PHASE6_VERSION = 'attorney_three_role_registration_room_phase6_v1'

const ROLE_CONFIG = Object.freeze([
  Object.freeze({ roleKey: 'transfer', workflowKey: 'transfer', label: 'Transfer Attorney', builder: buildTransferAttorneyCockpit }),
  Object.freeze({ roleKey: 'bond', workflowKey: 'bond_registration', label: 'Bond Attorney', builder: buildBondAttorneyCockpit }),
  Object.freeze({ roleKey: 'cancellation', workflowKey: 'bond_cancellation', label: 'Cancellation Attorney', builder: buildCancellationAttorneyCockpit }),
])

const GATE_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'instruction', label: 'Appointments & instructions', thresholds: { transfer: 'instruction_received', bond: 'bond_instruction_received', cancellation: 'cancellation_instruction_received' } }),
  Object.freeze({ key: 'execution', label: 'Data, documents & signatures', readiness: true }),
  Object.freeze({ key: 'guarantees', label: 'Guarantees aligned', thresholds: { transfer: 'transfer_guarantees_accepted', bond: 'guarantee_wording_accepted', cancellation: 'cancellation_guarantees_accepted' } }),
  Object.freeze({ key: 'lodgement', label: 'Joint lodgement ready', thresholds: { transfer: 'lodgement_ready', bond: 'bond_lodgement_ready', cancellation: 'cancellation_lodgement_ready' } }),
  Object.freeze({ key: 'registration', label: 'Linked registration complete', thresholds: { transfer: 'registered', bond: 'bond_registered', cancellation: 'cancellation_registered' } }),
])

function laneStageIndex(roleKey, stageKey) {
  const stages = ATTORNEY_WORKFLOW_STAGE_DEFINITIONS[roleKey] || []
  const normalized = normalizeAttorneyStageKey(stageKey, roleKey)
  return stages.findIndex((stage) => stage.key === normalized)
}

function roleMeetsThreshold(role, stageKey) {
  if (!stageKey) return true
  if (['complete', 'completed'].includes(String(role.cockpit.status || '').toLowerCase())) return true
  const currentIndex = laneStageIndex(role.roleKey, role.cockpit.currentStage)
  const thresholdIndex = laneStageIndex(role.roleKey, stageKey)
  return currentIndex >= thresholdIndex && thresholdIndex >= 0
}

function roleExecutionReady(role) {
  const metrics = role.cockpit.metrics || {}
  return metrics.missingData === 0 && metrics.missingDocuments === 0 && metrics.openSignatures === 0
}

function buildGate(definition, roles, previousComplete) {
  const roleStates = roles.map((role) => {
    const complete = definition.readiness
      ? roleExecutionReady(role)
      : roleMeetsThreshold(role, definition.thresholds?.[role.roleKey])
    return Object.freeze({ roleKey: role.roleKey, label: role.label, complete })
  })
  const complete = roleStates.every((role) => role.complete)
  const blocked = roles.some((role) => role.cockpit.metrics?.blockedDependencies > 0 || role.cockpit.status === 'blocked')
  const status = complete ? 'completed' : blocked && previousComplete ? 'blocked' : previousComplete ? 'active' : 'pending'
  return Object.freeze({ key: definition.key, label: definition.label, status, complete, roleStates: Object.freeze(roleStates) })
}

function buildRole(config, workflow) {
  const cockpit = config.builder(workflow)
  return Object.freeze({
    roleKey: config.roleKey,
    label: config.label,
    workflowKey: config.workflowKey,
    progressPercent: cockpit.progressPercent,
    status: cockpit.status,
    canAct: cockpit.canAct,
    primaryAction: cockpit.primaryAction,
    blockerCount: cockpit.blockers.length,
    openDependencyCount: cockpit.metrics.openDependencies,
    cockpit,
    workflow,
  })
}

export function buildAttorneyThreeRoleRegistrationRoom(workflows = []) {
  const requiredWorkflows = (Array.isArray(workflows) ? workflows : []).filter((workflow) => workflow?.required !== false)
  const roles = ROLE_CONFIG.flatMap((config) => {
    const workflow = requiredWorkflows.find((item) => item.key === config.workflowKey)
    return workflow ? [buildRole(config, workflow)] : []
  })
  let previousComplete = true
  const gates = GATE_DEFINITIONS.map((definition) => {
    const gate = buildGate(definition, roles, previousComplete)
    previousComplete = previousComplete && gate.complete
    return gate
  })
  const incompleteRoles = roles.filter((role) => role.progressPercent < 100 || role.status !== 'completed')
  const criticalPath = [...incompleteRoles].sort((left, right) => {
    if (left.blockerCount !== right.blockerCount) return right.blockerCount - left.blockerCount
    return left.progressPercent - right.progressPercent
  })[0] || roles[0] || null
  const totalBlockers = roles.reduce((sum, role) => sum + role.blockerCount, 0)
  const totalOpenDependencies = roles.reduce((sum, role) => sum + role.openDependencyCount, 0)
  const lodgementGate = gates.find((gate) => gate.key === 'lodgement')
  const registrationGate = gates.find((gate) => gate.key === 'registration')

  return Object.freeze({
    version: ATTORNEY_THREE_ROLE_PHASE6_VERSION,
    title: 'Three-Attorney Registration Room',
    requiredRoleCount: roles.length,
    roles: Object.freeze(roles),
    gates: Object.freeze(gates),
    criticalPath,
    totalBlockers,
    totalOpenDependencies,
    jointLodgementReady: roles.length > 0 && lodgementGate?.complete === true,
    linkedRegistrationComplete: roles.length > 0 && registrationGate?.complete === true,
    aligned: roles.length > 0 && totalBlockers === 0 && totalOpenDependencies === 0,
    crossLaneWriteAllowed: false,
  })
}
