import { evaluateMvpOnboardingGate } from './mvpOnboardingGate.js'
import { resolveMvpLaunchRolePlan } from './mvpLaunchRoles.js'

export const MVP_OTP_GATE_VERSION = 'arch9_mvp_otp_gate_v1'

const key = (value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
const CAPTURED_REQUIREMENT_STATUSES = new Set(['captured', 'assigned', 'complete', 'completed', 'verified', 'satisfied'])

function participantKeys(participant = {}) {
  const metadata = participant.metadata || participant.metadata_json || {}
  const explicit = key(participant.mvpLaunchRoleKey || participant.mvp_launch_role_key || metadata.mvpLaunchRoleKey || metadata.mvp_launch_role_key)
  if (explicit) return [explicit]
  const transactionRole = key(participant.transactionRole || participant.transaction_role)
  if (transactionRole) return [transactionRole]
  const roleType = key(participant.roleType || participant.role_type)
  return roleType ? [roleType] : []
}

function capturedRequirementKeys(participantRequirements = []) {
  return (Array.isArray(participantRequirements) ? participantRequirements : [])
    .filter((requirement) => (
      CAPTURED_REQUIREMENT_STATUSES.has(key(requirement.status)) ||
      Boolean(requirement.participantId || requirement.participant_id)
    ))
    .map((requirement) => key(requirement.roleKey || requirement.role_key))
    .filter(Boolean)
}

export function evaluateMvpOtpGate({ routingProfile = {}, participants = [], participantRequirements = [], documentRequirements = [] } = {}) {
  const onboarding = evaluateMvpOnboardingGate({ participants, documentRequirements })
  const rolePlan = routingProfile.launchRolePlan || resolveMvpLaunchRolePlan(routingProfile)
  const active = new Set((participants || [])
    .filter((participant) => !['removed', 'inactive', 'declined', 'expired'].includes(key(participant.status || 'active')))
    .flatMap(participantKeys))
  for (const roleKey of capturedRequirementKeys(participantRequirements)) active.add(roleKey)
  const missing = rolePlan.requiredByOtp.filter((role) => !active.has(role.key))
  const blockers = [
    ...onboarding.blockers,
    ...missing.map((role) => ({ key: `participant:${role.key}`, ownerRole: 'agent', reason: `${role.label} must be captured before the OTP can be executed.` })),
  ]
  return { version: MVP_OTP_GATE_VERSION, gateKey: 'otp_ready_to_execute', satisfied: blockers.length === 0, blockers, missingRoles: missing }
}
