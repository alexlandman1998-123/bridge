export const MVP_FINANCE_GATE_VERSION = 'arch9_mvp_finance_gate_v1'

const COMPLETE = new Set(['complete', 'completed', 'verified', 'approved', 'satisfied'])
const key = (value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
const CAPTURED_REQUIREMENT_STATUSES = new Set(['captured', 'assigned', 'complete', 'completed', 'verified', 'satisfied'])

function hasCapturedRequirement(participantRequirements = [], roleKey = '') {
  return (Array.isArray(participantRequirements) ? participantRequirements : []).some((requirement) => {
    if (key(requirement.roleKey || requirement.role_key) !== roleKey) return false
    return CAPTURED_REQUIREMENT_STATUSES.has(key(requirement.status)) ||
      Boolean(requirement.participantId || requirement.participant_id)
  })
}

function hasActiveRole(participants = [], roleKey = '', participantRequirements = []) {
  return hasCapturedRequirement(participantRequirements, roleKey) || participants.some((participant) => {
    if (['removed', 'inactive', 'declined', 'expired'].includes(key(participant.status || 'active'))) return false
    const metadata = participant.metadata || participant.metadata_json || {}
    return [participant.mvpLaunchRoleKey, participant.mvp_launch_role_key, metadata.mvpLaunchRoleKey, metadata.mvp_launch_role_key, participant.transactionRole, participant.transaction_role, participant.roleType, participant.role_type]
      .map(key).includes(roleKey)
  })
}

function documentComplete(requirements = [], documentKey = '') {
  const matches = requirements.filter((item) => key(item.documentKey || item.document_key || item.key) === documentKey)
  // Existing matters may predate the Phase 2C canonical checklist. Do not
  // invent a blocker for them; newly created matters always receive the row.
  return matches.length === 0 || matches.some((item) => {
    if (item.complete === false || item.uploadMissing === true || item.upload_missing === true) return false
    if (item.complete === true) return true
    return COMPLETE.has(key(item.status))
  })
}

export function evaluateMvpFinanceGate({ routingProfile = {}, participants = [], participantRequirements = [], documentRequirements = [] } = {}) {
  const financeType = key(routingProfile.financeType)
  const blockers = []
  if (['cash', 'hybrid'].includes(financeType) && !documentComplete(documentRequirements, 'proof_of_funds')) {
    blockers.push({ key: 'document:proof_of_funds', ownerRole: 'buyer', reason: 'Proof of funds must be verified before finance can complete.' })
  }
  if (['bond', 'hybrid'].includes(financeType)) {
    if (!hasActiveRole(participants, 'bond_originator', participantRequirements)) blockers.push({ key: 'participant:bond_originator', ownerRole: 'agent', reason: 'A bond originator must be assigned before finance can complete.' })
    if (!documentComplete(documentRequirements, 'bond_preapproval')) blockers.push({ key: 'document:bond_preapproval', ownerRole: 'bond_originator', reason: 'Bond pre-approval or application evidence must be verified before finance can complete.' })
  }
  return { version: MVP_FINANCE_GATE_VERSION, gateKey: 'finance_ready', satisfied: blockers.length === 0, blockers }
}
