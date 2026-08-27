export const AGENT_BUYER_SELLER_RELATIONSHIP_HEALTH_VERSION = 'arch9_agent_buyer_seller_relationship_health_v1'

const ROLE_META = Object.freeze({
  agent: { label: 'Agent' },
  buyer: { label: 'Buyer' },
  seller: { label: 'Seller' },
})

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function canonicalRole(value) {
  const normalized = key(value)
  if (!normalized) return ''
  if (normalized === 'agent' || normalized === 'estate_agent' || normalized.includes('property_agent')) return 'agent'
  if (normalized === 'buyer' || normalized === 'purchaser' || normalized.startsWith('buyer_') || normalized.startsWith('purchaser_')) return 'buyer'
  if (normalized === 'seller' || normalized === 'vendor' || normalized.startsWith('seller_') || normalized.startsWith('vendor_')) return 'seller'
  return normalized
}

function participantRoles(participant = {}) {
  return new Set([
    participant.roleType,
    participant.role_type,
    participant.transactionRole,
    participant.transaction_role,
  ].map(canonicalRole).filter(Boolean))
}

function isActiveParticipant(participant = {}) {
  return !new Set(['removed', 'inactive', 'declined', 'expired']).has(key(participant.status || 'active'))
}

function findLatestRoleOwnership(events = []) {
  const handoffEvent = list(events).find((event) => {
    const eventType = key(event.eventType || event.event_type)
    const eventData = event.eventData || event.event_data || {}
    return eventType === 'signed_otp_handoff_release_decision' && eventData.roleOwnership
  })
  const eventData = handoffEvent?.eventData || handoffEvent?.event_data || {}
  return eventData.roleOwnership || null
}

function relationshipState({ role, connected, ownsNextAction, nextAction, handoffRole = null } = {}) {
  if (!connected) {
    return {
      state: 'link_not_confirmed',
      stateLabel: 'Link needs confirmation',
      ownerRole: 'agent',
      waitingOnRole: role,
      nextAction: `Confirm that the ${ROLE_META[role].label.toLowerCase()} is linked to this transaction.`,
    }
  }
  if (ownsNextAction) {
    return {
      state: 'action_required',
      stateLabel: 'Action required',
      ownerRole: role,
      waitingOnRole: role,
      nextAction: text(nextAction?.label) || `Complete the next ${role} action.`,
    }
  }
  if (handoffRole && typeof handoffRole === 'object') {
    const handoffState = key(handoffRole.state)
    const stateLabel = handoffState === 'no_action_required'
      ? 'No action needed'
      : handoffState === 'action_required_if_requested'
        ? 'Action only if requested'
        : role === 'agent'
          ? 'Monitoring'
          : 'Waiting on the team'
    return {
      state: handoffState || (role === 'agent' ? 'monitoring' : 'waiting'),
      stateLabel,
      ownerRole: canonicalRole(handoffRole.ownerRole) || (role === 'agent' ? 'agent' : 'transaction_team'),
      waitingOnRole: canonicalRole(handoffRole.waitingOnRole) || 'transaction_team',
      nextAction: text(handoffRole.nextAction) || (role === 'agent' ? 'Monitor transaction progress.' : 'Track progress in the portal.'),
    }
  }
  return {
    state: role === 'agent' ? 'monitoring' : 'waiting',
    stateLabel: role === 'agent' ? 'Monitoring' : 'Waiting on the team',
    ownerRole: role === 'agent' ? 'agent' : 'transaction_team',
    waitingOnRole: 'transaction_team',
    nextAction: role === 'agent' ? 'Monitor the current transaction owner and resolve blockers.' : 'Track progress in the existing portal.',
  }
}

/**
 * Read-only operational projection for the three relationships around a sale.
 * It reuses canonical participants, transaction truth, and the signed-OTP
 * handoff event; it never creates tasks, portal links, or workflow state.
 */
export function buildAgentBuyerSellerRelationshipHealth({
  transactionId = null,
  truth = {},
  participants = [],
  events = [],
} = {}) {
  const activeParticipants = list(participants).filter(isActiveParticipant)
  const connectedRoles = new Set(activeParticipants.flatMap((participant) => [...participantRoles(participant)]))
  const nextAction = truth.nextAction || null
  const activeOwnerRole = canonicalRole(nextAction?.ownerRole)
  const handoffOwnership = findLatestRoleOwnership(events)
  const roles = Object.keys(ROLE_META).map((role) => {
    const connected = connectedRoles.has(role)
    return {
      role,
      label: ROLE_META[role].label,
      connected,
      connectionLabel: connected ? 'Connected' : 'Not confirmed',
      ...relationshipState({
        role,
        connected,
        ownsNextAction: activeOwnerRole === role,
        nextAction,
        handoffRole: handoffOwnership?.[role] || null,
      }),
    }
  })
  const unconfirmedRoles = roles.filter((role) => !role.connected)
  const actionRequiredRoles = roles.filter((role) => role.state === 'action_required')

  return {
    version: AGENT_BUYER_SELLER_RELATIONSHIP_HEALTH_VERSION,
    transactionId: transactionId || truth.transactionId || null,
    status: unconfirmedRoles.length ? 'attention' : 'clear',
    statusLabel: unconfirmedRoles.length ? 'Relationship check needed' : 'Relationships connected',
    activeOwnerRole: activeOwnerRole || null,
    nextActionLabel: text(nextAction?.label) || null,
    roles,
    summary: {
      connected: roles.length - unconfirmedRoles.length,
      total: roles.length,
      actionRequired: actionRequiredRoles.length,
      unconfirmed: unconfirmedRoles.length,
    },
    attention: unconfirmedRoles.map((role) => ({
      key: `relationship:${role.role}`,
      ownerRole: 'agent',
      reason: role.nextAction,
    })),
  }
}
