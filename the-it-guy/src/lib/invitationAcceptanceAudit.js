import {
  INVITATION_ACCEPTANCE_KINDS,
  assertInviteAcceptanceComplete,
  evaluateInviteAcceptanceContract,
  normalizeInvitationAcceptanceKind,
  normalizeTransactionPartnerAcceptanceRole,
} from './invitationAcceptanceContract.js'

export const INVITE_ACCEPTANCE_AUDIT_VERSION = 'invite_acceptance_audit_v1'

export const INVITE_ACCEPTANCE_AUDIT_CATEGORIES = Object.freeze({
  complete: 'complete',
  pendingInviteNoSignup: 'pending_invite_no_signup',
  signedUpButNoPartnerConnection: 'signed_up_but_no_partner_connection',
  acceptedInviteButMissingOrganisationPartners: 'accepted_invite_but_missing_organisation_partners',
  transactionAccessExistsButNoPartnerConnection: 'transaction_access_exists_but_no_partner_connection',
  expiredOrRevoked: 'expired_or_revoked',
  wrongEmailOrWrongWorkspace: 'wrong_email_or_wrong_workspace',
  readyToAccept: 'ready_to_accept',
  manualReviewRequired: 'manual_review_required',
})

export const INVITE_ACCEPTANCE_AUDIT_ACTIONS = Object.freeze({
  noAction: 'no_action',
  waitOrResendExistingLink: 'wait_or_resend_existing_link',
  repairPartnerConnection: 'repair_missing_partner_connection',
  repairTransactionAccess: 'repair_transaction_access',
  resumeAcceptance: 'resume_acceptance',
  reinvite: 'reinvite_required',
  manualReview: 'manual_review_required',
})

const CATEGORY_DEFAULT_ACTIONS = Object.freeze({
  [INVITE_ACCEPTANCE_AUDIT_CATEGORIES.complete]: INVITE_ACCEPTANCE_AUDIT_ACTIONS.noAction,
  [INVITE_ACCEPTANCE_AUDIT_CATEGORIES.pendingInviteNoSignup]: INVITE_ACCEPTANCE_AUDIT_ACTIONS.waitOrResendExistingLink,
  [INVITE_ACCEPTANCE_AUDIT_CATEGORIES.signedUpButNoPartnerConnection]: INVITE_ACCEPTANCE_AUDIT_ACTIONS.repairPartnerConnection,
  [INVITE_ACCEPTANCE_AUDIT_CATEGORIES.acceptedInviteButMissingOrganisationPartners]: INVITE_ACCEPTANCE_AUDIT_ACTIONS.repairPartnerConnection,
  [INVITE_ACCEPTANCE_AUDIT_CATEGORIES.transactionAccessExistsButNoPartnerConnection]: INVITE_ACCEPTANCE_AUDIT_ACTIONS.repairPartnerConnection,
  [INVITE_ACCEPTANCE_AUDIT_CATEGORIES.expiredOrRevoked]: INVITE_ACCEPTANCE_AUDIT_ACTIONS.reinvite,
  [INVITE_ACCEPTANCE_AUDIT_CATEGORIES.wrongEmailOrWrongWorkspace]: INVITE_ACCEPTANCE_AUDIT_ACTIONS.manualReview,
  [INVITE_ACCEPTANCE_AUDIT_CATEGORIES.readyToAccept]: INVITE_ACCEPTANCE_AUDIT_ACTIONS.resumeAcceptance,
  [INVITE_ACCEPTANCE_AUDIT_CATEGORIES.manualReviewRequired]: INVITE_ACCEPTANCE_AUDIT_ACTIONS.manualReview,
})

const TERMINAL_REINVITE_STATUSES = new Set(['expired', 'revoked', 'declined', 'cancelled', 'canceled'])
const ACTIVE_MEMBERSHIP_STATUSES = new Set(['active', 'accepted', 'joined'])
const INACTIVE_MEMBERSHIP_STATUSES = new Set(['removed', 'deactivated', 'declined', 'suspended'])
const ACTIVE_RELATIONSHIP_STATUSES = new Set(['accepted', 'approved', 'connected', 'active', 'preferred'])
const INACTIVE_RELATIONSHIP_STATUSES = new Set(['removed', 'declined', 'cancelled', 'canceled', 'expired', 'blocked'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function getPayloadRows(payload = {}, ...keys) {
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key]
  }
  return []
}

function appendMapSet(map, key, value) {
  const safeKey = normalizeText(key)
  const safeValue = normalizeText(value)
  if (!safeKey || !safeValue) return
  if (!map.has(safeKey)) map.set(safeKey, new Set())
  map.get(safeKey).add(safeValue)
}

function appendMapArray(map, key, value) {
  const safeKey = normalizeText(key)
  if (!safeKey) return
  if (!map.has(safeKey)) map.set(safeKey, [])
  map.get(safeKey).push(value)
}

function pairKey(left = '', right = '') {
  const ids = [normalizeText(left), normalizeText(right)].filter(Boolean).sort()
  return ids.length === 2 ? `${ids[0]}::${ids[1]}` : ''
}

function scopedPairKey(left = '', right = '', scopeType = '', scopeId = '') {
  const pair = pairKey(left, right)
  if (!pair) return ''
  return `${pair}::${normalizeKey(scopeType) || 'organisation'}::${normalizeText(scopeId)}`
}

function normalizeStatus(...values) {
  return normalizeKey(firstText(...values))
}

function isDateInPast(value, now = new Date()) {
  const text = normalizeText(value)
  if (!text) return false
  const time = new Date(text).getTime()
  return Number.isFinite(time) && time <= now.getTime()
}

function isAcceptedStatus(status = '', row = {}) {
  const normalized = normalizeStatus(status)
  return normalized === 'accepted' || Boolean(row.accepted_at || row.acceptedAt || row.responded_at || row.respondedAt)
}

function isTerminalReinvite(row = {}, now = new Date()) {
  const status = normalizeStatus(row.status || row.storedStatus)
  return TERMINAL_REINVITE_STATUSES.has(status) || (status === 'pending' && isDateInPast(row.expires_at || row.expiresAt, now))
}

function isActiveMembership(row = {}) {
  const status = normalizeStatus(row.membership_status || row.membershipStatus || row.status)
  if (INACTIVE_MEMBERSHIP_STATUSES.has(status)) return false
  if (!status) return true
  return ACTIVE_MEMBERSHIP_STATUSES.has(status)
}

function isActiveRelationship(row = {}) {
  const status = normalizeStatus(row.status || row.relationship_status || row.relationshipStatus)
  if (INACTIVE_RELATIONSHIP_STATUSES.has(status)) return false
  if (ACTIVE_RELATIONSHIP_STATUSES.has(status)) return true
  return Boolean(row.accepted_at || row.acceptedAt)
}

function getUserId(row = {}) {
  return firstText(row.id, row.user_id, row.userId, row.profile_id, row.profileId)
}

function getUserEmail(row = {}) {
  return normalizeEmail(
    firstText(
      row.email,
      row.user_email,
      row.userEmail,
      row.invited_email,
      row.invitedEmail,
      row.recipient_email,
      row.recipientEmail,
      row.profile?.email,
      row.user?.email,
    ),
  )
}

function getMembershipOrganisationId(row = {}) {
  return firstText(row.organisation_id, row.organization_id, row.workspace_id, row.organisationId, row.organizationId, row.workspaceId)
}

function getInvitationEmail(row = {}) {
  return normalizeEmail(firstText(row.invited_email, row.invitedEmail, row.recipient_email, row.recipientEmail, row.email))
}

function getInvitationAcceptedUserId(row = {}) {
  return firstText(
    row.accepted_user_id,
    row.acceptedUserId,
    row.responded_by_user_id,
    row.respondedByUserId,
    row.user_id,
    row.userId,
  )
}

function getPartnerInviteSenderOrganisationId(row = {}) {
  return firstText(row.sender_organisation_id, row.senderOrganisationId, row.from_organisation_id, row.fromOrganisationId, row.organisation_id)
}

function getPartnerInviteRecipientOrganisationId(row = {}) {
  return firstText(row.recipient_organisation_id, row.recipientOrganisationId, row.to_organisation_id, row.toOrganisationId)
}

function getTransactionOwnerOrganisationId(transaction = {}, row = {}) {
  return firstText(
    transaction.organisation_id,
    transaction.organization_id,
    transaction.workspace_id,
    transaction.organisationId,
    transaction.organizationId,
    transaction.workspaceId,
    row.sender_organisation_id,
    row.senderOrganisationId,
  )
}

function getTransactionPartnerOrganisationId(row = {}) {
  return firstText(
    row.partner_organisation_id,
    row.partnerOrganisationId,
    row.organisation_id,
    row.organization_id,
    row.workspace_id,
    row.organisationId,
    row.organizationId,
    row.workspaceId,
  )
}

function hasAccessForInvitation(indexes, row = {}, acceptedUserId = '') {
  const invitationId = normalizeText(row.id)
  const transactionId = normalizeText(row.transaction_id || row.transactionId)
  const roleType = normalizeTransactionPartnerAcceptanceRole(row.role_type || row.roleType)
  const userId = normalizeText(acceptedUserId)

  if (invitationId && indexes.transactionAccessByInvitationId.has(invitationId)) return true
  if (transactionId && userId && indexes.transactionAccessByTransactionUserRole.has(`${transactionId}::${userId}::${roleType}`)) return true
  if (transactionId && userId && indexes.transactionAccessByTransactionUserRole.has(`${transactionId}::${userId}::other`)) return true
  return false
}

function hasParticipantForInvitation(indexes, row = {}, acceptedUserId = '', email = '') {
  const invitationId = normalizeText(row.id)
  const transactionId = normalizeText(row.transaction_id || row.transactionId)
  const userId = normalizeText(acceptedUserId)
  const invitedEmail = normalizeEmail(email)

  if (invitationId && indexes.transactionParticipantsByInvitationId.has(invitationId)) return true
  if (transactionId && userId && indexes.transactionParticipantsByTransactionUser.has(`${transactionId}::${userId}`)) return true
  if (transactionId && invitedEmail && indexes.transactionParticipantsByTransactionEmail.has(`${transactionId}::${invitedEmail}`)) return true
  return false
}

function hasRolePlayerForInvitation(indexes, row = {}, email = '', organisationId = '') {
  const invitationId = normalizeText(row.id)
  const transactionId = normalizeText(row.transaction_id || row.transactionId)
  const invitedEmail = normalizeEmail(email)
  const partnerOrganisationId = normalizeText(organisationId)

  if (invitationId && indexes.transactionRolePlayersByInvitationId.has(invitationId)) return true
  if (transactionId && invitedEmail && indexes.transactionRolePlayersByTransactionEmail.has(`${transactionId}::${invitedEmail}`)) return true
  if (transactionId && partnerOrganisationId && indexes.transactionRolePlayersByTransactionOrg.has(`${transactionId}::${partnerOrganisationId}`)) return true
  return false
}

function relationshipExists(indexes, leftOrgId = '', rightOrgId = '', scopeType = '', scopeId = '') {
  const left = normalizeText(leftOrgId)
  const right = normalizeText(rightOrgId)
  if (!left || !right || left === right) return false
  const scoped = scopedPairKey(left, right, scopeType, scopeId)
  return indexes.activeRelationshipPairs.has(pairKey(left, right)) || (scoped && indexes.activeRelationshipScopedPairs.has(scoped))
}

function getResolvedUser(indexes, { userId = '', email = '' } = {}) {
  const safeUserId = normalizeText(userId)
  const safeEmail = normalizeEmail(email)
  if (safeUserId && indexes.usersById.has(safeUserId)) return indexes.usersById.get(safeUserId)
  if (safeEmail && indexes.usersByEmail.has(safeEmail)) return indexes.usersByEmail.get(safeEmail)[0] || null
  return null
}

function getUserExists(indexes, { userId = '', email = '' } = {}) {
  return Boolean(getResolvedUser(indexes, { userId, email }) || normalizeText(userId))
}

function getMembershipOrgIds(indexes, { userId = '', email = '' } = {}) {
  const orgIds = new Set()
  const safeUserId = normalizeText(userId)
  const safeEmail = normalizeEmail(email)
  for (const value of indexes.membershipOrgIdsByUserId.get(safeUserId) || []) orgIds.add(value)
  for (const value of indexes.membershipOrgIdsByEmail.get(safeEmail) || []) orgIds.add(value)
  return orgIds
}

function resolveAcceptingOrganisationId(indexes, explicitOrgId = '', { userId = '', email = '' } = {}, reasonCodes = []) {
  const safeExplicit = normalizeText(explicitOrgId)
  if (safeExplicit) return safeExplicit
  const memberships = [...getMembershipOrgIds(indexes, { userId, email })]
  if (memberships.length === 1) return memberships[0]
  if (memberships.length > 1) reasonCodes.push('ambiguous_accepting_organisation')
  return ''
}

function hasActiveMembershipInOrganisation(indexes, organisationId = '', { userId = '', email = '' } = {}) {
  const safeOrgId = normalizeText(organisationId)
  if (!safeOrgId) return false
  const memberships = getMembershipOrgIds(indexes, { userId, email })
  return memberships.has(safeOrgId)
}

function hasWorkspaceMismatch(indexes, organisationId = '', { userId = '', email = '' } = {}) {
  const safeOrgId = normalizeText(organisationId)
  if (!safeOrgId) return false
  const memberships = getMembershipOrgIds(indexes, { userId, email })
  return memberships.size > 0 && !memberships.has(safeOrgId)
}

function createIndexes(payload = {}) {
  const usersById = new Map()
  const usersByEmail = new Map()
  const membershipOrgIdsByUserId = new Map()
  const membershipOrgIdsByEmail = new Map()
  const transactionsById = new Map()
  const activeRelationshipPairs = new Set()
  const activeRelationshipScopedPairs = new Set()
  const transactionAccessByInvitationId = new Set()
  const transactionAccessByTransactionUserRole = new Set()
  const transactionParticipantsByInvitationId = new Set()
  const transactionParticipantsByTransactionUser = new Set()
  const transactionParticipantsByTransactionEmail = new Set()
  const transactionRolePlayersByInvitationId = new Set()
  const transactionRolePlayersByTransactionEmail = new Set()
  const transactionRolePlayersByTransactionOrg = new Set()

  for (const user of [
    ...getPayloadRows(payload, 'authUsers', 'auth_users', 'users'),
    ...getPayloadRows(payload, 'profiles'),
  ]) {
    const id = getUserId(user)
    const email = getUserEmail(user)
    if (!id && !email) continue
    const normalizedUser = { ...user, id: id || user.id, email: email || user.email }
    if (id && !usersById.has(id)) usersById.set(id, normalizedUser)
    if (email) appendMapArray(usersByEmail, email, normalizedUser)
  }

  for (const membership of getPayloadRows(payload, 'organisationUsers', 'organisation_users', 'memberships')) {
    if (!isActiveMembership(membership)) continue
    const organisationId = getMembershipOrganisationId(membership)
    const userId = firstText(membership.user_id, membership.userId)
    const user = getResolvedUser({ usersById, usersByEmail }, { userId })
    const email = getUserEmail(membership) || user?.email || ''
    appendMapSet(membershipOrgIdsByUserId, userId, organisationId)
    appendMapSet(membershipOrgIdsByEmail, email, organisationId)
  }

  for (const transaction of getPayloadRows(payload, 'transactions')) {
    const id = normalizeText(transaction.id || transaction.transaction_id || transaction.transactionId)
    if (id) transactionsById.set(id, transaction)
  }

  for (const relationship of getPayloadRows(payload, 'organisationPartners', 'organisation_partners', 'partnerRelationships')) {
    if (!isActiveRelationship(relationship)) continue
    const left = firstText(relationship.organisation_id, relationship.organization_id, relationship.organisationId, relationship.organizationId)
    const right = firstText(relationship.partner_organisation_id, relationship.partnerOrganizationId, relationship.partnerOrganisationId)
    const pair = pairKey(left, right)
    if (pair) activeRelationshipPairs.add(pair)
    const scoped = scopedPairKey(left, right, relationship.scope_type || relationship.scopeType, relationship.scope_id || relationship.scopeId)
    if (scoped) activeRelationshipScopedPairs.add(scoped)
  }

  for (const access of getPayloadRows(payload, 'transactionUserAccess', 'transaction_user_access')) {
    const invitationId = firstText(access.created_by_invitation_id, access.createdByInvitationId, access.transaction_partner_invitation_id)
    if (invitationId) transactionAccessByInvitationId.add(invitationId)
    const transactionId = firstText(access.transaction_id, access.transactionId)
    const userId = firstText(access.user_id, access.userId)
    const roleType = normalizeTransactionPartnerAcceptanceRole(access.access_role || access.accessRole || access.role_type || access.roleType)
    if (transactionId && userId) transactionAccessByTransactionUserRole.add(`${transactionId}::${userId}::${roleType}`)
  }

  for (const participant of getPayloadRows(payload, 'transactionParticipants', 'transaction_participants')) {
    const invitationId = firstText(participant.transaction_partner_invitation_id, participant.transactionPartnerInvitationId)
    if (invitationId) transactionParticipantsByInvitationId.add(invitationId)
    const transactionId = firstText(participant.transaction_id, participant.transactionId)
    const userId = firstText(participant.user_id, participant.userId)
    const email = getUserEmail(participant) || normalizeEmail(participant.participant_email || participant.participantEmail)
    if (transactionId && userId) transactionParticipantsByTransactionUser.add(`${transactionId}::${userId}`)
    if (transactionId && email) transactionParticipantsByTransactionEmail.add(`${transactionId}::${email}`)
  }

  for (const rolePlayer of getPayloadRows(payload, 'transactionRolePlayers', 'transaction_role_players')) {
    const invitationId = firstText(rolePlayer.transaction_partner_invitation_id, rolePlayer.transactionPartnerInvitationId)
    if (invitationId) transactionRolePlayersByInvitationId.add(invitationId)
    const transactionId = firstText(rolePlayer.transaction_id, rolePlayer.transactionId)
    const email = normalizeEmail(rolePlayer.email_address || rolePlayer.emailAddress || rolePlayer.email)
    const partnerOrganisationId = firstText(rolePlayer.partner_organisation_id, rolePlayer.partnerOrganisationId, rolePlayer.organisation_id, rolePlayer.organisationId)
    if (transactionId && email) transactionRolePlayersByTransactionEmail.add(`${transactionId}::${email}`)
    if (transactionId && partnerOrganisationId) transactionRolePlayersByTransactionOrg.add(`${transactionId}::${partnerOrganisationId}`)
  }

  return {
    usersById,
    usersByEmail,
    membershipOrgIdsByUserId,
    membershipOrgIdsByEmail,
    transactionsById,
    activeRelationshipPairs,
    activeRelationshipScopedPairs,
    transactionAccessByInvitationId,
    transactionAccessByTransactionUserRole,
    transactionParticipantsByInvitationId,
    transactionParticipantsByTransactionUser,
    transactionParticipantsByTransactionEmail,
    transactionRolePlayersByInvitationId,
    transactionRolePlayersByTransactionEmail,
    transactionRolePlayersByTransactionOrg,
  }
}

function classifyFromFacts(facts = {}) {
  if (facts.terminalReinvite) return INVITE_ACCEPTANCE_AUDIT_CATEGORIES.expiredOrRevoked
  if (facts.emailMismatch || facts.workspaceMismatch || facts.selfRelationship || facts.ambiguousWorkspace) {
    return INVITE_ACCEPTANCE_AUDIT_CATEGORIES.wrongEmailOrWrongWorkspace
  }
  if (facts.kind === INVITATION_ACCEPTANCE_KINDS.transactionPartner && facts.transactionAccessExists && !facts.relationshipExists) {
    return INVITE_ACCEPTANCE_AUDIT_CATEGORIES.transactionAccessExistsButNoPartnerConnection
  }
  if (facts.accepted && !facts.relationshipExists) {
    return INVITE_ACCEPTANCE_AUDIT_CATEGORIES.acceptedInviteButMissingOrganisationPartners
  }
  if (!facts.userExists) return INVITE_ACCEPTANCE_AUDIT_CATEGORIES.pendingInviteNoSignup
  if (!facts.relationshipExists) return INVITE_ACCEPTANCE_AUDIT_CATEGORIES.signedUpButNoPartnerConnection
  if (facts.contractComplete) return INVITE_ACCEPTANCE_AUDIT_CATEGORIES.complete
  if (facts.userExists && facts.acceptingOrganisationId && facts.relationshipExists) {
    if (facts.kind === INVITATION_ACCEPTANCE_KINDS.transactionPartner && !facts.transactionAccessExists) {
      return INVITE_ACCEPTANCE_AUDIT_CATEGORIES.readyToAccept
    }
    if (!facts.accepted) return INVITE_ACCEPTANCE_AUDIT_CATEGORIES.readyToAccept
  }
  return INVITE_ACCEPTANCE_AUDIT_CATEGORIES.manualReviewRequired
}

function buildAuditItem({ source, row, facts, reasonCodes, contract }) {
  const category = classifyFromFacts(facts)
  const action = CATEGORY_DEFAULT_ACTIONS[category] || INVITE_ACCEPTANCE_AUDIT_ACTIONS.manualReview
  return {
    id: normalizeText(row.id),
    source,
    category,
    action,
    repairable: [
      INVITE_ACCEPTANCE_AUDIT_CATEGORIES.signedUpButNoPartnerConnection,
      INVITE_ACCEPTANCE_AUDIT_CATEGORIES.acceptedInviteButMissingOrganisationPartners,
      INVITE_ACCEPTANCE_AUDIT_CATEGORIES.transactionAccessExistsButNoPartnerConnection,
      INVITE_ACCEPTANCE_AUDIT_CATEGORIES.readyToAccept,
    ].includes(category),
    reinviteRequired: [
      INVITE_ACCEPTANCE_AUDIT_CATEGORIES.expiredOrRevoked,
      INVITE_ACCEPTANCE_AUDIT_CATEGORIES.wrongEmailOrWrongWorkspace,
    ].includes(category),
    status: facts.status,
    email: facts.email,
    senderOrganisationId: facts.senderOrganisationId || null,
    acceptingOrganisationId: facts.acceptingOrganisationId || null,
    transactionId: facts.transactionId || null,
    roleType: facts.roleType || null,
    acceptedUserId: facts.acceptedUserId || null,
    reasonCodes,
    contract: {
      kind: contract.kind,
      complete: contract.complete,
      missingOutcomes: contract.missingOutcomes,
      nextAction: contract.nextAction,
    },
  }
}

export function classifyPartnerInvitation(row = {}, indexes = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now())
  const reasonCodes = []
  const email = getInvitationEmail(row)
  const acceptedUserId = getInvitationAcceptedUserId(row)
  const resolvedUser = getResolvedUser(indexes, { userId: acceptedUserId, email })
  const acceptedUserEmail = normalizeEmail(resolvedUser?.email)
  const emailMismatch = Boolean(email && acceptedUserEmail && email !== acceptedUserEmail)
  if (emailMismatch) reasonCodes.push('accepted_user_email_mismatch')

  const senderOrganisationId = getPartnerInviteSenderOrganisationId(row)
  const explicitRecipientOrgId = getPartnerInviteRecipientOrganisationId(row)
  const acceptingOrganisationId = resolveAcceptingOrganisationId(indexes, explicitRecipientOrgId, { userId: acceptedUserId, email }, reasonCodes)
  const ambiguousWorkspace = reasonCodes.includes('ambiguous_accepting_organisation')
  const workspaceMismatch = hasWorkspaceMismatch(indexes, acceptingOrganisationId, { userId: acceptedUserId, email })
  if (workspaceMismatch) reasonCodes.push('accepting_workspace_membership_missing')

  const selfRelationship = Boolean(senderOrganisationId && acceptingOrganisationId && senderOrganisationId === acceptingOrganisationId)
  if (selfRelationship) reasonCodes.push('self_relationship')

  const relationship = relationshipExists(indexes, senderOrganisationId, acceptingOrganisationId, row.scope_type || row.scopeType, row.scope_id || row.scopeId)
  const terminalReinvite = isTerminalReinvite(row, now)
  if (terminalReinvite) reasonCodes.push('expired_or_revoked')

  const accepted = isAcceptedStatus(row.status, row)
  const userExists = getUserExists(indexes, { userId: acceptedUserId, email })
  const membership = hasActiveMembershipInOrganisation(indexes, acceptingOrganisationId, { userId: acceptedUserId, email })
  if (userExists && !membership && acceptingOrganisationId && !workspaceMismatch) reasonCodes.push('accepting_membership_not_confirmed')
  if (accepted && !relationship) reasonCodes.push('accepted_without_partner_relationship')
  if (userExists && !relationship && !accepted) reasonCodes.push('signed_up_without_partner_relationship')

  const contract = evaluateInviteAcceptanceContract({
    kind: INVITATION_ACCEPTANCE_KINDS.organisationPartner,
    userExists,
    emailMatchesInvite: Boolean(email) && !emailMismatch,
    workspaceResolved: Boolean(acceptingOrganisationId),
    activeWorkspaceMembership: membership,
    hasPartnerConnection: relationship,
    accepted,
  })

  const facts = {
    kind: INVITATION_ACCEPTANCE_KINDS.organisationPartner,
    status: normalizeStatus(row.status) || 'pending',
    email,
    acceptedUserId,
    senderOrganisationId,
    acceptingOrganisationId,
    userExists,
    accepted,
    relationshipExists: relationship,
    terminalReinvite,
    emailMismatch,
    workspaceMismatch,
    ambiguousWorkspace,
    selfRelationship,
    contractComplete: contract.complete,
  }

  return buildAuditItem({ source: INVITATION_ACCEPTANCE_KINDS.organisationPartner, row, facts, reasonCodes, contract })
}

export function classifyTransactionPartnerInvitation(row = {}, indexes = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now())
  const reasonCodes = []
  const email = getInvitationEmail(row)
  const acceptedUserId = getInvitationAcceptedUserId(row)
  const resolvedUser = getResolvedUser(indexes, { userId: acceptedUserId, email })
  const acceptedUserEmail = normalizeEmail(resolvedUser?.email)
  const emailMismatch = Boolean(email && acceptedUserEmail && email !== acceptedUserEmail)
  if (emailMismatch) reasonCodes.push('accepted_user_email_mismatch')

  const transactionId = firstText(row.transaction_id, row.transactionId)
  const transaction = indexes.transactionsById.get(transactionId) || {}
  const senderOrganisationId = getTransactionOwnerOrganisationId(transaction, row)
  if (!senderOrganisationId) reasonCodes.push('transaction_owner_organisation_missing')

  const explicitPartnerOrgId = getTransactionPartnerOrganisationId(row)
  const acceptingOrganisationId = resolveAcceptingOrganisationId(indexes, explicitPartnerOrgId, { userId: acceptedUserId, email }, reasonCodes)
  const ambiguousWorkspace = reasonCodes.includes('ambiguous_accepting_organisation')
  const workspaceMismatch = hasWorkspaceMismatch(indexes, acceptingOrganisationId, { userId: acceptedUserId, email })
  if (workspaceMismatch) reasonCodes.push('accepting_workspace_membership_missing')

  const selfRelationship = Boolean(senderOrganisationId && acceptingOrganisationId && senderOrganisationId === acceptingOrganisationId)
  if (selfRelationship) reasonCodes.push('self_relationship')

  const relationship = relationshipExists(indexes, senderOrganisationId, acceptingOrganisationId)
  const terminalReinvite = isTerminalReinvite(row, now)
  if (terminalReinvite) reasonCodes.push('expired_or_revoked')

  const roleType = normalizeTransactionPartnerAcceptanceRole(row.role_type || row.roleType)
  const accepted = isAcceptedStatus(row.status, row)
  const userExists = getUserExists(indexes, { userId: acceptedUserId, email })
  const membership = hasActiveMembershipInOrganisation(indexes, acceptingOrganisationId, { userId: acceptedUserId, email })
  const transactionResolved = Boolean(transactionId && transaction)
  const transactionAccess = hasAccessForInvitation(indexes, row, acceptedUserId)
  const transactionParticipant = hasParticipantForInvitation(indexes, row, acceptedUserId, email)
  const transactionRolePlayer = hasRolePlayerForInvitation(indexes, row, email, acceptingOrganisationId)

  if (userExists && !membership && acceptingOrganisationId && !workspaceMismatch) reasonCodes.push('accepting_membership_not_confirmed')
  if (transactionAccess && !relationship) reasonCodes.push('transaction_access_without_partner_relationship')
  if (accepted && !relationship) reasonCodes.push('accepted_without_partner_relationship')
  if (accepted && !transactionAccess) reasonCodes.push('accepted_without_transaction_access')
  if (accepted && !transactionParticipant) reasonCodes.push('accepted_without_transaction_participant')
  if (accepted && !transactionRolePlayer) reasonCodes.push('accepted_without_transaction_role_player')

  const contract = evaluateInviteAcceptanceContract({
    kind: INVITATION_ACCEPTANCE_KINDS.transactionPartner,
    userExists,
    emailMatchesInvite: Boolean(email) && !emailMismatch,
    workspaceResolved: Boolean(acceptingOrganisationId),
    activeWorkspaceMembership: membership,
    hasPartnerConnection: relationship,
    accepted,
    hasTransaction: transactionResolved,
    hasTransactionUserAccess: transactionAccess,
    hasTransactionParticipant: transactionParticipant,
    hasTransactionRolePlayer: transactionRolePlayer,
  })

  let contractComplete = false
  try {
    contractComplete = assertInviteAcceptanceComplete({
      kind: normalizeInvitationAcceptanceKind(INVITATION_ACCEPTANCE_KINDS.transactionPartner),
      userExists,
      emailMatchesInvite: Boolean(email) && !emailMismatch,
      workspaceResolved: Boolean(acceptingOrganisationId),
      activeWorkspaceMembership: membership,
      hasPartnerConnection: relationship,
      accepted,
      hasTransaction: transactionResolved,
      hasTransactionUserAccess: transactionAccess,
      hasTransactionParticipant: transactionParticipant,
      hasTransactionRolePlayer: transactionRolePlayer,
    }).complete
  } catch {
    contractComplete = false
  }

  const facts = {
    kind: INVITATION_ACCEPTANCE_KINDS.transactionPartner,
    status: normalizeStatus(row.status) || 'pending',
    email,
    acceptedUserId,
    senderOrganisationId,
    acceptingOrganisationId,
    transactionId,
    roleType,
    userExists,
    accepted,
    relationshipExists: relationship,
    terminalReinvite,
    emailMismatch,
    workspaceMismatch,
    ambiguousWorkspace,
    selfRelationship,
    transactionAccessExists: transactionAccess,
    contractComplete,
  }

  return buildAuditItem({ source: INVITATION_ACCEPTANCE_KINDS.transactionPartner, row, facts, reasonCodes, contract })
}

function createSummary(items = []) {
  const categories = Object.values(INVITE_ACCEPTANCE_AUDIT_CATEGORIES)
  const byCategory = Object.fromEntries(categories.map((category) => [category, 0]))
  const samples = Object.fromEntries(categories.map((category) => [category, []]))
  let repairable = 0
  let reinviteRequired = 0

  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1
    if (item.repairable) repairable += 1
    if (item.reinviteRequired) reinviteRequired += 1
    if (samples[item.category] && samples[item.category].length < 10) {
      samples[item.category].push({
        id: item.id,
        source: item.source,
        email: item.email,
        transactionId: item.transactionId,
        action: item.action,
        reasonCodes: item.reasonCodes,
      })
    }
  }

  return {
    total: items.length,
    byCategory,
    repairable,
    reinviteRequired,
    complete: byCategory[INVITE_ACCEPTANCE_AUDIT_CATEGORIES.complete] || 0,
    manualReviewRequired:
      (byCategory[INVITE_ACCEPTANCE_AUDIT_CATEGORIES.manualReviewRequired] || 0) +
      (byCategory[INVITE_ACCEPTANCE_AUDIT_CATEGORIES.wrongEmailOrWrongWorkspace] || 0),
    samples,
  }
}

export function buildInviteAcceptanceAudit(payload = {}, options = {}) {
  const indexes = createIndexes(payload)
  const partnerInvitations = getPayloadRows(payload, 'partnerInvitations', 'partner_invitations')
  const transactionPartnerInvitations = getPayloadRows(
    payload,
    'transactionPartnerInvitations',
    'transaction_partner_invitations',
  )

  const partnerItems = partnerInvitations.map((row) => classifyPartnerInvitation(row, indexes, options))
  const transactionItems = transactionPartnerInvitations.map((row) => classifyTransactionPartnerInvitation(row, indexes, options))
  const items = [...partnerItems, ...transactionItems]

  return {
    version: INVITE_ACCEPTANCE_AUDIT_VERSION,
    generatedAt: new Date().toISOString(),
    source: normalizeText(options.source || payload.source) || 'input',
    summary: createSummary(items),
    categoryActions: CATEGORY_DEFAULT_ACTIONS,
    items,
  }
}
