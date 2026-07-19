export const MVP_PARTICIPANT_ROSTER_VERSION = 'arch9_mvp_participant_roster_v1'

const INACTIVE_STATUSES = new Set(['removed', 'inactive', 'declined', 'expired'])

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function isActive(participant = {}) {
  return !INACTIVE_STATUSES.has(key(participant.status || 'active'))
}

function isPlaceholder(value) {
  return /\bpending\b/i.test(text(value))
}

function hasUsableIdentity(participant = {}) {
  return Boolean(
    text(participant.userId || participant.user_id) ||
    text(participant.email || participant.participantEmail || participant.participant_email) ||
    (text(participant.name || participant.participantName || participant.participant_name) &&
      !isPlaceholder(participant.name || participant.participantName || participant.participant_name)),
  )
}

function participantMatchesRequirement(participant = {}, requirement = {}) {
  const requirementRoleKey = key(requirement.roleKey || requirement.role_key)
  const requirementRoleType = key(requirement.roleType || requirement.role_type)
  const requirementLegalRole = key(requirement.legalRole || requirement.legal_role || 'none')
  const requirementTransactionRole = key(requirement.transactionRole || requirement.transaction_role)
  const participantRole = key(participant.mvpLaunchRoleKey || participant.mvp_launch_role_key)
  const participantRoleType = key(participant.roleType || participant.role_type)
  const participantLegalRole = key(participant.legalRole || participant.legal_role || 'none')
  const participantTransactionRole = key(participant.transactionRole || participant.transaction_role)

  if (participantRole && participantRole === requirementRoleKey) return true
  if (requirementTransactionRole && participantTransactionRole === requirementTransactionRole) {
    return !requirementRoleType || participantRoleType === requirementRoleType
  }
  return participantRoleType === requirementRoleType && participantLegalRole === requirementLegalRole
}

function normalizeRequirement(requirement = {}) {
  return {
    id: text(requirement.id),
    participantId: text(requirement.participantId || requirement.participant_id),
    roleKey: key(requirement.roleKey || requirement.role_key),
    roleType: key(requirement.roleType || requirement.role_type),
    legalRole: key(requirement.legalRole || requirement.legal_role || 'none'),
    transactionRole: key(requirement.transactionRole || requirement.transaction_role),
    requiredBy: key(requirement.requiredBy || requirement.required_by),
    requiredAtCreation: Boolean(requirement.requiredAtCreation ?? requirement.required_at_creation),
    status: key(requirement.status || 'pending_assignment'),
    label: text(requirement.label) || text(requirement.roleKey || requirement.role_key) || 'Transaction participant',
    reason: text(requirement.reason),
  }
}

function normalizeParticipant(participant = {}) {
  return {
    ...participant,
    id: text(participant.id),
    roleType: key(participant.roleType || participant.role_type),
    legalRole: key(participant.legalRole || participant.legal_role || 'none'),
    transactionRole: key(participant.transactionRole || participant.transaction_role),
    status: key(participant.status || 'active'),
    participantName: text(participant.participantName || participant.participant_name || participant.name),
    participantEmail: text(participant.participantEmail || participant.participant_email || participant.email).toLowerCase(),
    userId: text(participant.userId || participant.user_id),
  }
}

/**
 * Gives every module the same view of the required transaction roles. It does
 * not infer a role assignment from a placeholder row: a requirement is only
 * assignment-ready when it is linked to an active, identifiable participant.
 */
export function buildMvpParticipantRoster({ requirements = [], participants = [] } = {}) {
  const normalizedParticipants = (Array.isArray(participants) ? participants : []).map(normalizeParticipant)
  const byId = new Map(normalizedParticipants.filter((participant) => participant.id).map((participant) => [participant.id, participant]))
  const roles = (Array.isArray(requirements) ? requirements : [])
    .map(normalizeRequirement)
    .filter((requirement) => requirement.roleKey)
    .map((requirement) => {
      const linked = requirement.participantId ? byId.get(requirement.participantId) || null : null
      const participant = linked || normalizedParticipants.find((item) => participantMatchesRequirement(item, requirement)) || null
      const active = participant ? isActive(participant) : false
      const identifiable = participant ? hasUsableIdentity(participant) : false
      const assigned = active && identifiable
      return {
        ...requirement,
        participant,
        assigned,
        contactReady: assigned && Boolean(participant.userId || participant.participantEmail),
        state: assigned ? 'assigned' : participant ? 'needs_contact' : 'unassigned',
      }
    })

  const assigned = roles.filter((role) => role.assigned)
  const unassigned = roles.filter((role) => !role.assigned)
  const missingAtCreation = unassigned.filter((role) => role.requiredAtCreation)
  const pendingForNextGate = unassigned.filter((role) => !role.requiredAtCreation)

  return {
    version: MVP_PARTICIPANT_ROSTER_VERSION,
    roles,
    summary: {
      required: roles.length,
      assigned: assigned.length,
      unassigned: unassigned.length,
      contactReady: roles.filter((role) => role.contactReady).length,
      requiredAtCreation: roles.filter((role) => role.requiredAtCreation).length,
      missingAtCreation: missingAtCreation.length,
      pendingForNextGate: pendingForNextGate.length,
    },
    creationBlockers: missingAtCreation.map((role) => ({
      key: `participant:${role.roleKey}`,
      roleKey: role.roleKey,
      ownerRole: 'agent',
      reason: `${role.label} must be assigned before the transaction can be considered created.`,
    })),
    nextGateRequirements: pendingForNextGate.map((role) => ({
      key: `participant:${role.roleKey}`,
      roleKey: role.roleKey,
      requiredBy: role.requiredBy,
      ownerRole: 'agent',
      reason: role.reason || `${role.label} must be assigned before ${role.requiredBy || 'the next workflow gate'}.`,
    })),
  }
}
