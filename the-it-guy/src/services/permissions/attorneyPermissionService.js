import {
  ATTORNEY_TRANSACTION_ROLES,
  ATTORNEY_VISIBILITY_SCOPES,
  normalizeAttorneyTransactionRole,
  normalizeAttorneyVisibility,
} from '../../constants/attorneyPermissions'
import {
  getAttorneyProfessionalProfilePermissions,
  isAttorneyProfessionalManagementRole,
} from '../../constants/attorneyRoleCatalog.js'
import {
  canAccessAttorneyMatter,
  canAssignAttorneyToLane,
  getAttorneyLaneAccessContext,
  getCurrentUserAttorneyMembership,
  getUserAttorneyRolesForTransaction,
} from '../../lib/attorneyPermissions'
import {
  getAuthenticatedUser,
  isMissingColumnError,
  isMissingTableError,
  normalizeText,
  requireClient,
} from '../attorneyFirmServiceShared'

const PROFESSIONAL_APP_ROLES = new Set(['agent', 'developer', 'bond_originator'])

function normalizeAppRole(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'conveyancer') return 'attorney'
  return normalized
}

function roleToParticipantTypes(role) {
  const normalized = normalizeAppRole(role)
  if (normalized === 'developer') return ['developer']
  if (normalized === 'agent') return ['agent']
  if (normalized === 'bond_originator') return ['bond_originator']
  if (normalized === 'attorney') return ['attorney']
  return []
}

function assignmentAllows(assignment = null, snakeCaseKey, camelCaseKey) {
  if (!assignment) return false
  return assignment[snakeCaseKey] !== false && assignment[camelCaseKey] !== false
}

function roleCanEditLane(permissions = {}, attorneyRole = 'transfer_attorney') {
  const normalizedRole = normalizeAttorneyTransactionRole(attorneyRole)
  if (normalizedRole === 'bond_attorney') return Boolean(permissions.can_edit_bond_workflow)
  return Boolean(permissions.can_edit_transfer_workflow)
}

export function resolveAttorneyActionPermissions({
  appRole = '',
  membership = null,
  attorneyRole = 'transfer_attorney',
  attorneyAccess = null,
  canViewAsAttorney = false,
} = {}) {
  const isAttorneyAppUser = normalizeAppRole(appRole) === 'attorney'
  const hasActiveMembership = Boolean(membership?.isActive && membership?.professionalRole)
  const permissions = hasActiveMembership
    ? getAttorneyProfessionalProfilePermissions(membership)
    : getAttorneyProfessionalProfilePermissions({})
  const assignment = attorneyAccess?.assignment || null
  const isAssignedParticipant = Boolean(attorneyAccess?.isAssignedParticipant)
  const managementOverrideEnabled = Boolean(
    attorneyAccess?.isManagementUser &&
      attorneyAccess?.managementOverrideEnabled &&
      attorneyAccess?.canViewMatter,
  )
  const hasLaneAuthority = Boolean(isAssignedParticipant || managementOverrideEnabled)
  const actionBase = Boolean(isAttorneyAppUser && hasActiveMembership && canViewAsAttorney && hasLaneAuthority)
  const documentsAllowed = assignmentAllows(assignment, 'can_manage_documents', 'canManageDocuments')
  const signingAllowed = assignmentAllows(assignment, 'can_manage_signing', 'canManageSigning')
  const laneUpdateAllowed = assignmentAllows(assignment, 'can_update_workflow_lane', 'canUpdateWorkflowLane')
  const internalNotesAllowed = assignmentAllows(assignment, 'can_add_internal_notes', 'canAddInternalNotes')
  const sharedUpdatesAllowed = assignmentAllows(assignment, 'can_add_shared_updates', 'canAddSharedUpdates')
  const canAddSharedUpdate = Boolean(actionBase && sharedUpdatesAllowed && permissions.can_comment_shared)

  return {
    permissions,
    hasActiveMembership,
    isAssignedParticipant,
    managementOverrideEnabled,
    hasLaneAuthority,
    canUpdateLane: Boolean(
      actionBase &&
        laneUpdateAllowed &&
        (roleCanEditLane(permissions, attorneyRole) || managementOverrideEnabled),
    ),
    canRequestDocuments: Boolean(actionBase && documentsAllowed && permissions.can_request_documents),
    canUploadDocuments: Boolean(actionBase && documentsAllowed && permissions.can_upload_documents),
    canReviewDocuments: Boolean(actionBase && documentsAllowed && permissions.can_review_documents),
    canManageSigning: Boolean(actionBase && signingAllowed && permissions.can_manage_signing_appointments),
    canAddInternalNote: Boolean(actionBase && internalNotesAllowed && permissions.can_comment_internal),
    canAddSharedUpdate,
    canPublishClientVisibleUpdate: Boolean(
      canAddSharedUpdate && permissions.can_publish_client_visible_updates,
    ),
    canViewInternalNotes: Boolean(
      isAttorneyAppUser &&
        hasActiveMembership &&
        canViewAsAttorney &&
        permissions.can_view_internal_comments,
    ),
  }
}

async function getProfileForUser(client, userId) {
  const resolvedUserId = normalizeText(userId)
  if (!resolvedUserId) return null

  let query = await client
    .from('profiles')
    .select('id, email, role, primary_attorney_firm_id')
    .eq('id', resolvedUserId)
    .maybeSingle()

  if (query.error && isMissingColumnError(query.error, 'primary_attorney_firm_id')) {
    query = await client
      .from('profiles')
      .select('id, email, role')
      .eq('id', resolvedUserId)
      .maybeSingle()
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'profiles')) return null
    throw query.error
  }

  return query.data || null
}

async function userIsTransactionParticipant(client, { userId, email = '', transactionId, appRole = '' } = {}) {
  const resolvedTransactionId = normalizeText(transactionId)
  const resolvedUserId = normalizeText(userId)
  const normalizedEmail = normalizeText(email).toLowerCase()
  if (!resolvedTransactionId) return false

  const allowedParticipantTypes = roleToParticipantTypes(appRole)
  const matchesAllowedType = (row = {}) => {
    const roleType = String(row.role_type || row.role || '').trim().toLowerCase()
    return !allowedParticipantTypes.length || allowedParticipantTypes.includes(roleType)
  }
  const isActiveRow = (row = {}) => {
    const status = String(row.status || 'active').trim().toLowerCase()
    return status !== 'removed' && status !== 'revoked' && status !== 'inactive' && !row.removed_at
  }

  if (resolvedUserId) {
    let query = await client
      .from('transaction_participants')
      .select('transaction_id, role_type, status, removed_at')
      .eq('transaction_id', resolvedTransactionId)
      .eq('user_id', resolvedUserId)

    if (query.error && (isMissingColumnError(query.error, 'status') || isMissingColumnError(query.error, 'removed_at'))) {
      query = await client
        .from('transaction_participants')
        .select('transaction_id, role_type')
        .eq('transaction_id', resolvedTransactionId)
        .eq('user_id', resolvedUserId)
    }

    if (query.error && !isMissingTableError(query.error, 'transaction_participants') && !isMissingColumnError(query.error, 'user_id')) {
      throw query.error
    }

    if ((query.data || []).some((row) => isActiveRow(row) && matchesAllowedType(row))) {
      return true
    }
  }

  if (normalizedEmail) {
    let query = await client
      .from('transaction_participants')
      .select('transaction_id, role_type, status, removed_at')
      .eq('transaction_id', resolvedTransactionId)
      .eq('participant_email', normalizedEmail)

    if (query.error && (isMissingColumnError(query.error, 'status') || isMissingColumnError(query.error, 'removed_at'))) {
      query = await client
        .from('transaction_participants')
        .select('transaction_id, role_type')
        .eq('transaction_id', resolvedTransactionId)
        .eq('participant_email', normalizedEmail)
    }

    if (query.error && !isMissingTableError(query.error, 'transaction_participants')) {
      throw query.error
    }

    if ((query.data || []).some((row) => isActiveRow(row) && matchesAllowedType(row))) {
      return true
    }
  }

  return false
}

async function userHasLegacyProfessionalAssignment(client, { email = '', transactionId, appRole = '' } = {}) {
  const normalizedEmail = normalizeText(email).toLowerCase()
  const normalizedRole = normalizeAppRole(appRole)
  const resolvedTransactionId = normalizeText(transactionId)
  if (!normalizedEmail || !resolvedTransactionId) return false

  const legacyColumnByRole = {
    agent: 'assigned_agent_email',
    attorney: 'assigned_attorney_email',
    bond_originator: 'assigned_bond_originator_email',
  }
  const column = legacyColumnByRole[normalizedRole]
  if (!column) return false

  const query = await client
    .from('transactions')
    .select(`id, ${column}`)
    .eq('id', resolvedTransactionId)
    .eq(column, normalizedEmail)
    .maybeSingle()

  if (query.error) {
    if (isMissingTableError(query.error, 'transactions') || isMissingColumnError(query.error, column)) return false
    throw query.error
  }

  return Boolean(query.data?.id)
}

async function resolveActorContext({ userId = null } = {}) {
  const client = requireClient()
  const authUser = userId ? { id: userId } : await getAuthenticatedUser(client)
  const profile = await getProfileForUser(client, authUser.id)
  return {
    client,
    userId: authUser.id,
    email: normalizeText(profile?.email || authUser?.email).toLowerCase(),
    appRole: normalizeAppRole(profile?.role),
    primaryAttorneyFirmId: profile?.primary_attorney_firm_id || null,
    profile,
  }
}

async function resolveAttorneyMembershipForTransaction(client, userId, transactionId, attorneyRole = 'transfer_attorney') {
  const accessContext = await getAttorneyLaneAccessContext({
    userId,
    transactionId,
    attorneyRole,
  })
  if (accessContext?.firmId) {
    const membership = await getCurrentUserAttorneyMembership(accessContext.firmId, userId).catch(() => null)
    if (membership?.isActive) return membership
  }
  return null
}

export async function getAttorneyLegalPermissionContext({ userId = null, transactionId, attorneyRole = 'transfer_attorney' } = {}) {
  const actor = await resolveActorContext({ userId })
  const role = normalizeAttorneyTransactionRole(attorneyRole)
  const isAttorneyAppUser = actor.appRole === 'attorney'
  const isProfessionalAppUser = PROFESSIONAL_APP_ROLES.has(actor.appRole)

  const attorneyAccess = isAttorneyAppUser
    ? await getAttorneyLaneAccessContext({ userId: actor.userId, transactionId, attorneyRole: role }).catch(() => null)
    : null
  const membership = isAttorneyAppUser
    ? await resolveAttorneyMembershipForTransaction(actor.client, actor.userId, transactionId, role).catch(() => null)
    : null
  const membershipRole = String(membership?.professionalRole || attorneyAccess?.firmRole || '').trim().toLowerCase()
  const isFirmManagement = isAttorneyProfessionalManagementRole(membership || { professionalRole: membershipRole })
  const assignedRoles = isAttorneyAppUser ? await getUserAttorneyRolesForTransaction(actor.userId, transactionId).catch(() => []) : []
  const hasProfessionalParticipantAccess = isProfessionalAppUser
    ? await userIsTransactionParticipant(actor.client, {
        userId: actor.userId,
        email: actor.email,
        transactionId,
        appRole: actor.appRole,
      }).catch(() => false)
    : false
  const hasLegacyProfessionalAccess = isProfessionalAppUser
    ? await userHasLegacyProfessionalAssignment(actor.client, {
        email: actor.email,
        transactionId,
        appRole: actor.appRole,
      }).catch(() => false)
    : false

  const canViewAsAttorney = Boolean(
    membership?.isActive &&
      (attorneyAccess?.canViewMatter ||
        (isAttorneyAppUser && await canAccessAttorneyMatter(transactionId, null, actor.userId).catch(() => false))),
  )
  const canViewAsProfessional = Boolean(hasProfessionalParticipantAccess || hasLegacyProfessionalAccess)
  const canViewLegalWorkspace = Boolean(canViewAsAttorney || canViewAsProfessional)
  const canAssignLane = Boolean(isAttorneyAppUser && attorneyAccess?.canAssignLane)
  const actionPermissions = resolveAttorneyActionPermissions({
    appRole: actor.appRole,
    membership,
    attorneyRole: role,
    attorneyAccess,
    canViewAsAttorney,
  })

  return {
    userId: actor.userId,
    appRole: actor.appRole,
    attorneyRole: role,
    firmId: attorneyAccess?.firmId || membership?.firmId || null,
    firmRole: membershipRole || null,
    assignedAttorneyRoles: assignedRoles.map((item) => normalizeAttorneyTransactionRole(item)),
    isAttorneyAppUser,
    isProfessionalAppUser,
    isFirmManagement,
    isAssignedAttorney: Boolean(attorneyAccess?.isAssignedAttorney),
    isAssignedParticipant: Boolean(attorneyAccess?.isAssignedParticipant),
    managementOverrideEnabled: Boolean(attorneyAccess?.managementOverrideEnabled),
    canViewLegalWorkspace,
    canViewLane: canViewLegalWorkspace,
    canUpdateLane: actionPermissions.canUpdateLane,
    canRequestDocuments: actionPermissions.canRequestDocuments,
    canUploadDocuments: actionPermissions.canUploadDocuments,
    canReviewDocuments: actionPermissions.canReviewDocuments,
    canManageSigning: actionPermissions.canManageSigning,
    canAddInternalNote: actionPermissions.canAddInternalNote,
    canAddSharedUpdate: actionPermissions.canAddSharedUpdate,
    canPublishClientVisibleUpdate: actionPermissions.canPublishClientVisibleUpdate,
    canAssignAttorney: canAssignLane,
    canReassignAttorney: canAssignLane,
    canViewInternalNotes: actionPermissions.canViewInternalNotes,
    canViewProfessionalUpdates: canViewLegalWorkspace,
    viewReason: canViewAsAttorney ? attorneyAccess?.reason || 'attorney_access' : canViewAsProfessional ? 'professional_participant' : 'no_access',
  }
}

export async function canViewTransactionLegalWorkspace(userId, transactionId) {
  const context = await getAttorneyLegalPermissionContext({ userId, transactionId })
  return Boolean(context.canViewLegalWorkspace)
}

export async function canViewAttorneyLane(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLegalPermissionContext({ userId, transactionId, attorneyRole })
  return Boolean(context.canViewLane)
}

export async function canUpdateAttorneyLanePermission(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLegalPermissionContext({ userId, transactionId, attorneyRole })
  return Boolean(context.canUpdateLane)
}

export async function canRequestAttorneyDocuments(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLegalPermissionContext({ userId, transactionId, attorneyRole })
  return Boolean(context.canRequestDocuments)
}

export async function canUploadAttorneyDocuments(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLegalPermissionContext({ userId, transactionId, attorneyRole })
  return Boolean(context.canUploadDocuments)
}

export async function canReviewAttorneyDocuments(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLegalPermissionContext({ userId, transactionId, attorneyRole })
  return Boolean(context.canReviewDocuments)
}

export async function canManageAttorneySigning(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLegalPermissionContext({ userId, transactionId, attorneyRole })
  return Boolean(context.canManageSigning)
}

export async function canAddAttorneyInternalNote(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLegalPermissionContext({ userId, transactionId, attorneyRole })
  return Boolean(context.canAddInternalNote)
}

export async function canAddAttorneySharedUpdate(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLegalPermissionContext({ userId, transactionId, attorneyRole })
  return Boolean(context.canAddSharedUpdate)
}

export async function canPublishClientVisibleLegalUpdate(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLegalPermissionContext({ userId, transactionId, attorneyRole })
  return Boolean(context.canPublishClientVisibleUpdate)
}

export async function canAssignAttorneyToTransaction(userId, transactionId, attorneyRole) {
  return canAssignAttorneyToLane(userId, transactionId, attorneyRole)
}

export async function canReassignAttorney(userId, transactionId, attorneyRole) {
  return canAssignAttorneyToLane(userId, transactionId, attorneyRole)
}

export async function canViewFirmAttorneyMatters(userId, attorneyFirmId) {
  const membership = await getCurrentUserAttorneyMembership(attorneyFirmId, userId)
  return Boolean(membership?.isActive && isAttorneyProfessionalManagementRole(membership))
}

export function canSeeAttorneyUpdateVisibility(context = {}, visibility = ATTORNEY_VISIBILITY_SCOPES.internal) {
  const normalized = normalizeAttorneyVisibility(visibility)
  if (normalized === ATTORNEY_VISIBILITY_SCOPES.clientVisible) return true
  if (normalized === ATTORNEY_VISIBILITY_SCOPES.professionalShared) {
    return Boolean(context.canViewProfessionalUpdates || context.canViewInternalNotes)
  }
  return Boolean(context.canViewInternalNotes)
}

export function assertCanPublishVisibility(context = {}, visibility = ATTORNEY_VISIBILITY_SCOPES.internal) {
  const normalized = normalizeAttorneyVisibility(visibility)
  if (normalized === ATTORNEY_VISIBILITY_SCOPES.clientVisible && !context.canPublishClientVisibleUpdate) {
    throw new Error('Client-visible updates require permission.')
  }
  if (normalized === ATTORNEY_VISIBILITY_SCOPES.professionalShared && !context.canAddSharedUpdate) {
    throw new Error('You do not have permission to post shared updates.')
  }
  if (normalized === ATTORNEY_VISIBILITY_SCOPES.internal && !context.canAddInternalNote) {
    throw new Error('You do not have permission to post internal attorney notes.')
  }
}

export { ATTORNEY_VISIBILITY_SCOPES, ATTORNEY_TRANSACTION_ROLES }
